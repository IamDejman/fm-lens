use std::sync::Mutex;
use std::time::Instant;

use fmlibre_core::{
    ArraySource, ClubDetails, ClubIndex, EntityArrays, FmDate, GAME_EXE, GAME_PLUGIN, GameInfo, Listed, PlayerDetails,
    PlayerIndex, SearchIndex, Session, StaffDetails, StaffIndex, find_game,
};
use fmlibre_mem::{Process, find_processes, is_current_process_elevated, list_modules};
use serde::Serialize;
use tauri::State;

const NOT_CONNECTED: &str = "Not connected to the game";

/// The connected game and the people read from it.
struct Connection {
    session: Session,
    players: PlayerIndex,
    staff: StaffIndex,
    clubs: ClubIndex,
}

impl Connection {
    fn load(session: Session) -> Result<Self, String> {
        let players = PlayerIndex::new(session.players().map_err(text)?);
        let staff = StaffIndex::new(session.staff().map_err(text)?);
        let clubs = ClubIndex::new(session.clubs().map_err(text)?);
        Ok(Self { session, players, staff, clubs })
    }
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
    staff: usize,
    clubs: usize,
    game_date: Option<FmDate>,
    load_ms: u128,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReloadInfo {
    players: usize,
    staff: usize,
    clubs: usize,
    game_date: Option<FmDate>,
}

/// One page of search results.
#[derive(Serialize)]
struct Page<T> {
    total: usize,
    rows: Vec<T>,
}

fn page<T: Listed + Clone>(index: &SearchIndex<T>, query: &str, limit: usize) -> Page<T> {
    let hits = index.search(query);
    Page { total: hits.len(), rows: hits.into_iter().take(limit).cloned().collect() }
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

/// Attaches to the running game, locates its data and reads every player and member of
/// staff. Only reads memory.
#[tauri::command]
async fn connect(state: State<'_, AppState>) -> Result<ConnectionInfo, String> {
    let started = Instant::now();
    let connection = tauri::async_runtime::spawn_blocking(|| -> Result<Connection, String> {
        let process = Process::open_read(find_game(None).map_err(text)?).map_err(text)?;
        Connection::load(Session::connect(process, ArraySource::ProfileFirst).map_err(text)?)
    })
    .await
    .map_err(text)??;

    let info = ConnectionInfo {
        game: connection.session.game.clone(),
        profile: connection.session.profile.as_ref().map(|p| p.name.clone()),
        arrays: connection.session.arrays.clone(),
        players: connection.players.len(),
        staff: connection.staff.len(),
        clubs: connection.clubs.len(),
        game_date: connection.session.game_date(),
        load_ms: started.elapsed().as_millis(),
    };
    *state.0.lock().map_err(text)? = Some(connection);
    Ok(info)
}

/// Reads everything again, e.g. after the game has moved on. Drops the connection when that fails.
#[tauri::command]
async fn reload(state: State<'_, AppState>) -> Result<ReloadInfo, String> {
    let connection = state.0.lock().map_err(text)?.take().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let connection =
        tauri::async_runtime::spawn_blocking(move || Connection::load(connection.session)).await.map_err(text)??;
    let info = ReloadInfo {
        players: connection.players.len(),
        staff: connection.staff.len(),
        clubs: connection.clubs.len(),
        game_date: connection.session.game_date(),
    };
    *state.0.lock().map_err(text)? = Some(connection);
    Ok(info)
}

/// Players matching `query`, highest current ability first; at most `limit` rows.
#[tauri::command]
fn search_players(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
) -> Result<Page<fmlibre_core::PlayerSummary>, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    Ok(page(&connection.players, &query, limit))
}

/// Staff matching `query`, the human manager first, then by current ability; at most `limit` rows.
#[tauri::command]
fn search_staff(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
) -> Result<Page<fmlibre_core::StaffSummary>, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    Ok(page(&connection.staff, &query, limit))
}

/// Clubs matching `query`, highest reputation first; at most `limit` rows.
#[tauri::command]
fn search_clubs(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
) -> Result<Page<fmlibre_core::ClubSummary>, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    Ok(page(&connection.clubs, &query, limit))
}

/// The full profile of the club with `uid`. Only reads memory.
#[tauri::command]
fn club_details(state: State<'_, AppState>, uid: u32) -> Result<ClubDetails, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let club = connection.clubs.get(uid).ok_or_else(|| format!("No club with UID {uid}"))?;
    connection
        .session
        .club_details(club)
        .map_err(text)?
        .ok_or_else(|| "This club's data has changed in the game; reload and try again.".to_owned())
}

/// The full profile of the player with `uid`. Only reads memory.
#[tauri::command]
fn player_details(state: State<'_, AppState>, uid: u32) -> Result<PlayerDetails, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let player = connection.players.get(uid).ok_or_else(|| format!("No player with UID {uid}"))?;
    connection
        .session
        .player_details(player)
        .map_err(text)?
        .ok_or_else(|| "This player's data has changed in the game; reload and try again.".to_owned())
}

/// The full profile of the member of staff with `uid`. Only reads memory.
#[tauri::command]
fn staff_details(state: State<'_, AppState>, uid: u32) -> Result<StaffDetails, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let member = connection.staff.get(uid).ok_or_else(|| format!("No member of staff with id {uid}"))?;
    connection
        .session
        .staff_details(member)
        .map_err(text)?
        .ok_or_else(|| "This person's data has changed in the game; reload and try again.".to_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            detect_game,
            connect,
            reload,
            search_players,
            search_staff,
            search_clubs,
            player_details,
            staff_details,
            club_details
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
