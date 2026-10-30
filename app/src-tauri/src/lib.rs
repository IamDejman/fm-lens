use std::sync::Mutex;
use std::time::Instant;

use fmlibre_core::{
    ArraySource, EntityArrays, GAME_EXE, GAME_PLUGIN, GameInfo, PlayerIndex, PlayerSummary, Session, find_game,
};
use fmlibre_mem::{Process, find_processes, is_current_process_elevated, list_modules};
use serde::Serialize;
use tauri::State;

const NOT_CONNECTED: &str = "Not connected to the game";

/// The connected game and the players read from it.
struct Connection {
    session: Session,
    players: PlayerIndex,
}

#[derive(Default)]
struct AppState(Mutex<Option<Connection>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Detection {
    elevated: bool,
    games: Vec<DetectedGame>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedGame {
    pid: u32,
    info: Option<GameInfo>,
    plugin_loaded: bool,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionInfo {
    game: GameInfo,
    profile: Option<String>,
    arrays: EntityArrays,
    players: usize,
    load_ms: u128,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerPage {
    total: usize,
    rows: Vec<PlayerSummary>,
}

fn text(err: impl std::fmt::Display) -> String {
    err.to_string()
}

/// Lists running Football Manager processes and whether they can be opened for reading.
#[tauri::command]
async fn detect_game() -> Result<Detection, String> {
    let running = find_processes(GAME_EXE).map_err(text)?;
    let games = running.into_iter().map(|entry| inspect(entry.pid)).collect();
    Ok(Detection { elevated: is_current_process_elevated(), games })
}

fn inspect(pid: u32) -> DetectedGame {
    let result = Process::open_read(pid).and_then(|process| {
        let info = GameInfo::inspect(&process)?;
        let plugin_loaded = list_modules(pid)?.iter().any(|m| m.name.eq_ignore_ascii_case(GAME_PLUGIN));
        Ok((info, plugin_loaded))
    });
    match result {
        Ok((info, plugin_loaded)) => DetectedGame { pid, info: Some(info), plugin_loaded, error: None },
        Err(err) => DetectedGame { pid, info: None, plugin_loaded: false, error: Some(err.to_string()) },
    }
}

/// Attaches to the running game, locates its data and reads every player. Only reads memory.
#[tauri::command]
async fn connect(state: State<'_, AppState>) -> Result<ConnectionInfo, String> {
    let started = Instant::now();
    let connection = tauri::async_runtime::spawn_blocking(|| -> Result<Connection, String> {
        let process = Process::open_read(find_game(None).map_err(text)?).map_err(text)?;
        let session = Session::connect(process, ArraySource::ProfileFirst).map_err(text)?;
        let players = PlayerIndex::new(session.players().map_err(text)?);
        Ok(Connection { session, players })
    })
    .await
    .map_err(text)??;

    let info = ConnectionInfo {
        game: connection.session.game.clone(),
        profile: connection.session.profile.as_ref().map(|p| p.name.clone()),
        arrays: connection.session.arrays.clone(),
        players: connection.players.len(),
        load_ms: started.elapsed().as_millis(),
    };
    *state.0.lock().map_err(text)? = Some(connection);
    Ok(info)
}

/// Reads every player again, e.g. after the game has moved on. Drops the connection when that fails.
#[tauri::command]
async fn reload_players(state: State<'_, AppState>) -> Result<usize, String> {
    let mut connection = state.0.lock().map_err(text)?.take().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let connection = tauri::async_runtime::spawn_blocking(move || -> Result<Connection, String> {
        connection.players = PlayerIndex::new(connection.session.players().map_err(text)?);
        Ok(connection)
    })
    .await
    .map_err(text)??;
    let count = connection.players.len();
    *state.0.lock().map_err(text)? = Some(connection);
    Ok(count)
}

/// Players matching `query`, highest current ability first; at most `limit` rows.
#[tauri::command]
fn search_players(state: State<'_, AppState>, query: String, limit: usize) -> Result<PlayerPage, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let hits = connection.players.search(&query);
    Ok(PlayerPage { total: hits.len(), rows: hits.into_iter().take(limit).cloned().collect() })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![detect_game, connect, reload_players, search_players])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
