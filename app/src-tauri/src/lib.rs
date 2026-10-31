use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use fmlibre_core::{
    ArraySource, Change, ClubDetails, ClubFilter, ClubIndex, Entity, EntityArrays, Field, FmDate, GAME_EXE,
    GAME_PLUGIN, GameInfo, Kind, Listed, Operation, Planned, PlayerDetails, PlayerFilter, PlayerIndex, PlayerOrder,
    SearchIndex, Session, Skipped, StaffDetails, StaffFilter, StaffIndex, Target, find_game, sort_players,
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
    /// The mass edit last previewed, until it is applied or replaced.
    mass: Option<PendingMass>,
    /// The next id for a mass-edit preview or batch.
    next_id: u32,
}

/// A mass edit that was worked out and shown, waiting to be applied as it was shown.
struct PendingMass {
    id: u32,
    entity: Entity,
    planned: Vec<Planned>,
}

impl Connection {
    /// Reads every list. A reload keeps the change log; a mass edit previewed before is dropped,
    /// since its people may have moved.
    fn load(session: Session, log: Vec<LoggedChange>) -> Result<Self, String> {
        let players = PlayerIndex::new(session.players().map_err(text)?);
        let staff = StaffIndex::new(session.staff().map_err(text)?);
        let clubs = ClubIndex::new(session.clubs().map_err(text)?);
        let next_id = log.iter().filter_map(|logged| logged.batch).max().unwrap_or(0) + 1;
        Ok(Self { session, players, staff, clubs, log, mass: None, next_id })
    }

    /// What the window shows about the connection; `load_ms` is how long reading took.
    fn info(&self, load_ms: u128) -> ConnectionInfo {
        ConnectionInfo {
            game: self.session.game.clone(),
            profile: self.session.profile.as_ref().map(|p| p.name.clone()),
            arrays: self.session.arrays.clone(),
            players: self.players.len(),
            staff: self.staff.len(),
            clubs: self.clubs.len(),
            game_date: self.session.game_date(),
            load_ms,
            editable: self.session.process.can_write(),
        }
    }

    fn fresh_id(&mut self) -> u32 {
        self.next_id += 1;
        self.next_id - 1
    }

    /// The players, staff or clubs a search and its filter select, as edit targets with names.
    fn select(&self, entity: Entity, query: &str, filters: Filters) -> Vec<(Target, String)> {
        match entity {
            Entity::Player => {
                let filter = filters.player_filter.unwrap_or_default();
                let hits = self.players.search(query).into_iter().filter(|p| filter.matches(p));
                hits.map(|p| (p.target(), p.name.clone())).collect()
            }
            Entity::Staff => {
                let filter = filters.staff_filter.unwrap_or_default();
                let hits = self.staff.search(query).into_iter().filter(|s| filter.matches(s));
                hits.map(|s| (s.target(), s.name.clone())).collect()
            }
            Entity::Club => {
                let filter = filters.club_filter.unwrap_or_default();
                let hits = self.clubs.search(query).into_iter().filter(|c| filter.matches(c));
                hits.map(|c| (c.target(), c.name.clone())).collect()
            }
        }
    }

    /// Logs a change just written; `batch` groups the changes of one mass edit.
    fn log_change(&mut self, change: Change, name: String, batch: Option<u32>) -> LoggedChange {
        self.note_change(&change, change.new);
        let logged = LoggedChange { id: self.log.len() + 1, at: now_ms(), name, change, undone_at: None, batch };
        self.log.push(logged.clone());
        logged
    }

    /// Writes back the old value of the logged change `id`, if the game still holds the new one.
    fn undo(&mut self, id: usize) -> Result<LoggedChange, String> {
        let entry = self.log.iter().find(|logged| logged.id == id).cloned().ok_or_else(|| format!("No change {id}"))?;
        if entry.undone_at.is_some() {
            return Err("This change has already been undone.".to_owned());
        }
        let (target, _) = self.target(entry.change.entity, entry.change.uid)?;
        self.session.revert(&target, &entry.change).map_err(text)?;
        self.note_change(&entry.change, entry.change.old);
        let logged = self.log.iter_mut().find(|logged| logged.id == id).expect("found above");
        logged.undone_at = Some(now_ms());
        Ok(logged.clone())
    }

    /// Where the player, member of staff or club with `uid` lives in the game, and its name.
    fn target(&self, entity: Entity, uid: u32) -> Result<(Target, String), String> {
        match entity {
            Entity::Player => self.players.get(uid).map(|p| (p.target(), p.name.clone())),
            Entity::Staff => self.staff.get(uid).map(|s| (s.target(), s.name.clone())),
            Entity::Club => self.clubs.get(uid).map(|c| (c.target(), c.name.clone())),
        }
        .ok_or_else(|| format!("No {entity} with id {uid}"))
    }

    /// Keeps the list rows in step with `value`, just written to the field `change` names.
    fn note_change(&mut self, change: &Change, value: i64) {
        match change.entity {
            Entity::Player => self.players.update(change.uid, |p| p.note_change(&change.field, value)),
            Entity::Staff => self.staff.update(change.uid, |s| s.note_change(&change.field, value)),
            Entity::Club => self.clubs.update(change.uid, |c| c.note_change(&change.field, value)),
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
    /// The mass edit it was part of, if any.
    batch: Option<u32>,
}

/// The filter of the list a mass edit applies to; only the one for its entity is used.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Filters {
    player_filter: Option<PlayerFilter>,
    staff_filter: Option<StaffFilter>,
    club_filter: Option<ClubFilter>,
}

/// One field of a mass edit and what to do with it.
#[derive(Deserialize)]
struct MassOperation {
    field: String,
    operation: Operation,
}

/// Most players, staff or clubs one mass edit may change.
const MASS_LIMIT: usize = 10_000;

/// Most changes and skipped fields a preview lists; the counts cover all of them.
const PREVIEW_ROWS: usize = 500;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MassPreview {
    /// What `apply_mass_edit` takes to write exactly these changes.
    id: u32,
    /// How many players, staff or clubs the search and filters selected.
    targets: usize,
    /// How many of them already have the values the edit would give them.
    unchanged: usize,
    /// How many values would change, in all.
    changes: usize,
    /// The first changes.
    rows: Vec<Planned>,
    /// How many values are left alone, and the first of them with the reason.
    skipped_count: usize,
    skipped: Vec<Skipped>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MassReport {
    /// Groups the changes in the log; `undo_batch` undoes them together.
    batch: u32,
    applied: usize,
    failed: Vec<MassFailure>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MassFailure {
    uid: u32,
    name: String,
    field: String,
    error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchUndo {
    undone: usize,
    /// Changes the game has changed since, which were left as they are.
    failed: Vec<BatchUndoFailure>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchUndoFailure {
    id: usize,
    error: String,
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

    let info = connection.info(started.elapsed().as_millis());
    *state.0.lock().map_err(text)? = Some(connection);
    Ok(info)
}

/// The connection made before, if the app is still attached, without reading the game
/// again: lets the window pick it up after a reload (e.g. to change the language) with
/// the lists and the change log as they were.
#[tauri::command]
fn current_connection(state: State<'_, AppState>) -> Result<Option<ConnectionInfo>, String> {
    let guard = state.0.lock().map_err(text)?;
    Ok(guard.as_ref().map(|connection| connection.info(0)))
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

/// The value of every field of one player, member of staff or club that can be edited
/// now, as stored, read now. Fields without their record (no contract, a club without
/// full finances) and dates the game has not set are left out.
#[tauri::command]
fn read_values(state: State<'_, AppState>, entity: Entity, uid: u32) -> Result<BTreeMap<String, i64>, String> {
    let guard = state.0.lock().map_err(text)?;
    let connection = guard.as_ref().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let (target, _) = connection.target(entity, uid)?;
    let fields = connection.session.fields(entity);
    let values = connection.session.read_fields(&target, &fields).map_err(text)?;
    Ok(fields
        .into_iter()
        .zip(values)
        .filter_map(|(field, value)| {
            let value = value.filter(|&value| field.is_plausible(value))?;
            (field.kind != Kind::Date || value != 0).then_some((field.key, value))
        })
        .collect())
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
            Ok(change) => report.applied.push(connection.log_change(change, name.clone(), None)),
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
    connection.undo(id)
}

/// Works out a mass edit: `operations` applied to every player, member of staff or club
/// that `query` and the entity's filter select, from the values the game holds now.
/// Nothing is written; the plan waits for `apply_mass_edit` with the preview's id.
#[tauri::command]
fn plan_mass_edit(
    state: State<'_, AppState>,
    entity: Entity,
    query: String,
    filters: Filters,
    operations: Vec<MassOperation>,
) -> Result<MassPreview, String> {
    let mut guard = state.0.lock().map_err(text)?;
    let connection = guard.as_mut().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    if operations.is_empty() {
        return Err("Choose at least one field to change.".to_owned());
    }
    let targets = connection.select(entity, &query, filters);
    if targets.len() > MASS_LIMIT {
        return Err(format!(
            "{} match. Narrow the search or the filters to {MASS_LIMIT} or fewer for a mass edit.",
            targets.len()
        ));
    }
    let operations = operations
        .into_iter()
        .map(|op| Ok((connection.session.field(entity, &op.field)?, op.operation)))
        .collect::<Result<Vec<_>, fmlibre_core::EditError>>()
        .map_err(text)?;
    let plan = connection.session.plan_mass_edit(&targets, &operations).map_err(text)?;
    let id = connection.fresh_id();
    let preview = MassPreview {
        id,
        targets: targets.len(),
        unchanged: plan.unchanged,
        changes: plan.planned.len(),
        rows: plan.planned.iter().take(PREVIEW_ROWS).cloned().collect(),
        skipped_count: plan.skipped.len(),
        skipped: plan.skipped.into_iter().take(PREVIEW_ROWS).collect(),
    };
    connection.mass = Some(PendingMass { id, entity, planned: plan.planned });
    Ok(preview)
}

/// Writes the mass edit previewed as `id`, exactly as it was shown: each change only while
/// the game still holds the value it was planned from. The changes are logged as one batch.
#[tauri::command]
fn apply_mass_edit(state: State<'_, AppState>, id: u32) -> Result<MassReport, String> {
    let mut guard = state.0.lock().map_err(text)?;
    let connection = guard.as_mut().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let pending = match connection.mass.take() {
        Some(pending) if pending.id == id => pending,
        other => {
            connection.mass = other;
            return Err("This preview is out of date. Preview the mass edit again.".to_owned());
        }
    };
    let fields: BTreeMap<String, Field> =
        connection.session.fields(pending.entity).into_iter().map(|field| (field.key.clone(), field)).collect();
    let batch = connection.fresh_id();
    let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
    for planned in pending.planned {
        let field = &fields[&planned.field];
        match connection.session.write_field_if(&planned.target, field, planned.old, planned.new) {
            Ok(change) => {
                connection.log_change(change, planned.name, Some(batch));
                report.applied += 1;
            }
            Err(err) => report.failed.push(MassFailure {
                uid: planned.uid,
                name: planned.name,
                field: planned.field,
                error: err.to_string(),
            }),
        }
    }
    Ok(report)
}

/// Undoes every change of the mass edit `batch` that is not undone yet, newest first.
/// Changes the game has changed since are left as they are and reported.
#[tauri::command]
fn undo_batch(state: State<'_, AppState>, batch: u32) -> Result<BatchUndo, String> {
    let mut guard = state.0.lock().map_err(text)?;
    let connection = guard.as_mut().ok_or_else(|| NOT_CONNECTED.to_owned())?;
    let ids: Vec<usize> = connection
        .log
        .iter()
        .rev()
        .filter(|logged| logged.batch == Some(batch) && logged.undone_at.is_none())
        .map(|logged| logged.id)
        .collect();
    let mut report = BatchUndo { undone: 0, failed: Vec::new() };
    for id in ids {
        match connection.undo(id) {
            Ok(_) => report.undone += 1,
            Err(error) => report.failed.push(BatchUndoFailure { id, error }),
        }
    }
    Ok(report)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            detect_game,
            connect,
            current_connection,
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
            undo_change,
            plan_mass_edit,
            apply_mass_edit,
            undo_batch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
