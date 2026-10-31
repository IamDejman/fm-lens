use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use fmlibre_core::{
    ArraySource, Change, ClubDetails, ClubFilter, ClubIndex, Entity, EntityArrays, Field, FmDate, GAME_EXE,
    GAME_PLUGIN, GameInfo, Listed, PlayerDetails, PlayerFilter, PlayerIndex, PlayerOrder, SearchIndex, Session,
    StaffDetails, StaffFilter, StaffIndex, Target, find_game, sort_players,
};
use fmlibre_mem::{Process, find_processes, is_current_process_elevated, list_modules};
use serde::{Deserialize, Serialize};
use tauri::State;

const NOT_CONNECTED: &str = "Not connected to the game";

/// The connected game, the people read from it and the changes written this session.
struct Connection {
    session: Session,
    players: PlayerIndex,
    staff: StaffIndex,
    clubs: ClubIndex,
    log: Vec<LoggedChange>,
}

impl Connection {
    fn load(session: Session, log: Vec<LoggedChange>) -> Result<Self, String> {
        let players = PlayerIndex::new(session.players().map_err(text)?);
        let staff = StaffIndex::new(session.staff().map_err(text)?);
        let clubs = ClubIndex::new(session.clubs().map_err(text)?);
        Ok(Self { session, players, staff, clubs, log })
    }

    /// Where the player or member of staff with `uid` lives in the game, and their name.
    fn target(&self, entity: Entity, uid: u32) -> Result<(Target, String), String> {
        match entity {
            Entity::Player => self.players.get(uid).map(|p| (p.target(), p.name.clone())),
            Entity::Staff => self.staff.get(uid).map(|s| (s.target(), s.name.clone())),
        }
        .ok_or_else(|| format!("No {entity} with id {uid}"))
    }

    /// Keeps the list rows in step with `value`, just written to the field `change` names.
    fn note_change(&mut self, change: &Change, value: i64) {
        match change.entity {
            Entity::Player => self.players.update(change.uid, |p| p.note_change(&change.field, value)),
            Entity::Staff => self.staff.update(change.uid, |s| s.note_change(&change.field, value)),
        };
    }
}

/// A change written to the game this session.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoggedChange {
    id: usize,
    /// When it was written, in milliseconds since 1970.
    at: u64,
    /// The person's name when it was written.
    name: String,
    #[serde(flatten)]
    change: Change,
    /// When it was undone, if it was.
    undone_at: Option<u64>,
}

/// One value to write, as stored.
#[derive(Deserialize)]
struct FieldEdit {
    field: String,
    value: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FailedEdit {
    field: String,
    value: i64,
    error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplyReport {
    applied: Vec<LoggedChange>,
    failed: Vec<FailedEdit>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |since| since.as_millis() as u64)
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
    /// Whether Windows let the app open the game for writing, which editing needs.
    editable: bool,
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

/// Searches `index`, keeps the hits `keep` accepts and returns at most `limit` of them.
fn page<T: Listed + Clone>(
    index: &SearchIndex<T>,
    query: &str,
    limit: usize,
    keep: impl Fn(&T) -> bool,
    sort: impl FnOnce(&mut Vec<&T>),
) -> Page<T> {
    let mut hits = index.search(query);
    hits.retain(|item| keep(item));
    sort(&mut hits);
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

/// Attaches to the running game, locates its data and reads every player, member of
/// staff and club. Only reads memory; the game is opened for writing too when Windows
/// allows it, so that edits can be applied later.
#[tauri::command]
async fn connect(state: State<'_, AppState>) -> Result<ConnectionInfo, String> {
    let started = Instant::now();
    let connection = tauri::async_runtime::spawn_blocking(|| -> Result<Connection, String> {
        let pid = find_game(None).map_err(text)?;
        let process = Process::open_read_write(pid).or_else(|_| Process::open_read(pid)).map_err(text)?;
        Connection::load(Session::connect(process, ArraySource::ProfileFirst).map_err(text)?, Vec::new())
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
        editable: connection.session.process.can_write(),
    };
    *state.0.lock().map_err(text)? = Some(connection);
    Ok(info)
}

/// Reads everything again, e.g. after the game has moved on. Drops the connection when that fails.
#[tauri::command]
async fn reload(state: State<'_, AppState>) -> Result<ReloadInfo, String> {
    let connection = state.0.lock().map_err(text)?.take().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let connection = tauri::async_runtime::spawn_blocking(move || Connection::load(connection.session, connection.log))
        .await
        .map_err(text)??;
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
    filter: Option<PlayerFilter>,
    order: Option<PlayerOrder>,
) -> Result<Page<fmlibre_core::PlayerSummary>, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let filter = filter.unwrap_or_default();
    Ok(page(
        &connection.players,
        &query,
        limit,
        |p| filter.matches(p),
        |hits| {
            if let Some(order) = order {
                sort_players(hits, order);
            }
        },
    ))
}

/// Staff matching `query`, the human manager first, then by current ability; at most `limit` rows.
#[tauri::command]
fn search_staff(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    filter: Option<StaffFilter>,
) -> Result<Page<fmlibre_core::StaffSummary>, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let filter = filter.unwrap_or_default();
    Ok(page(&connection.staff, &query, limit, |s| filter.matches(s), |_| {}))
}

/// Clubs matching `query`, highest reputation first; at most `limit` rows.
#[tauri::command]
fn search_clubs(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    filter: Option<ClubFilter>,
) -> Result<Page<fmlibre_core::ClubSummary>, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let filter = filter.unwrap_or_default();
    Ok(page(&connection.clubs, &query, limit, |c| filter.matches(c), |_| {}))
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

/// The fields of players or of staff that the editor can change.
#[tauri::command]
fn edit_fields(state: State<'_, AppState>, entity: Entity) -> Result<Vec<Field>, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    Ok(connection.session.fields(entity))
}

/// The value of every editable field of one player or member of staff, as stored, read now.
#[tauri::command]
fn read_values(state: State<'_, AppState>, entity: Entity, uid: u32) -> Result<BTreeMap<String, i64>, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let (target, _) = connection.target(entity, uid)?;
    let fields = connection.session.fields(entity);
    let values = connection.session.read_fields(&target, &fields).map_err(text)?;
    Ok(fields.into_iter().map(|field| field.key).zip(values).collect())
}

/// Writes `edits` (values as stored) to one player or member of staff. Each edit is
/// checked and written on its own: the ones that fail change nothing and are reported.
#[tauri::command]
fn apply_edits(
    state: State<'_, AppState>,
    entity: Entity,
    uid: u32,
    edits: Vec<FieldEdit>,
) -> Result<ApplyReport, String> {
    let mut guard = state.0.lock().map_err(text)?;
    let connection = guard.as_mut().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let (target, name) = connection.target(entity, uid)?;
    let mut report = ApplyReport { applied: Vec::new(), failed: Vec::new() };
    for edit in edits {
        let written = connection
            .session
            .field(entity, &edit.field)
            .and_then(|field| connection.session.write_field(&target, &field, edit.value));
        match written {
            // Already the value asked for: nothing was written.
            Ok(change) if change.old == change.new => {}
            Ok(change) => {
                connection.note_change(&change, change.new);
                let logged = LoggedChange {
                    id: connection.log.len() + 1,
                    at: now_ms(),
                    name: name.clone(),
                    change,
                    undone_at: None,
                };
                connection.log.push(logged.clone());
                report.applied.push(logged);
            }
            Err(err) => report.failed.push(FailedEdit { field: edit.field, value: edit.value, error: err.to_string() }),
        }
    }
    Ok(report)
}

/// Every change written this session, newest first.
#[tauri::command]
fn change_log(state: State<'_, AppState>) -> Result<Vec<LoggedChange>, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    Ok(connection.log.iter().rev().cloned().collect())
}

/// Writes back the old value of the logged change `id`, provided the game still holds the
/// value that change wrote.
#[tauri::command]
fn undo_change(state: State<'_, AppState>, id: usize) -> Result<LoggedChange, String> {
    let mut guard = state.0.lock().map_err(text)?;
    let connection = guard.as_mut().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let entry =
        connection.log.iter().find(|logged| logged.id == id).cloned().ok_or_else(|| format!("No change {id}"))?;
    if entry.undone_at.is_some() {
        return Err("This change has already been undone.".to_owned());
    }
    let (target, _) = connection.target(entry.change.entity, entry.change.uid)?;
    connection.session.revert(&target, &entry.change).map_err(text)?;
    connection.note_change(&entry.change, entry.change.old);
    let logged = connection.log.iter_mut().find(|logged| logged.id == id).expect("found above");
    logged.undone_at = Some(now_ms());
    Ok(logged.clone())
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
            club_details,
            edit_fields,
            read_values,
            apply_edits,
            change_log,
            undo_change
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
