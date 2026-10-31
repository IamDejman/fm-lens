use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use fmlibre_core::{
    ArraySource, CaptainRole, CaptainSet, Change, ClubDetails, ClubFilter, ClubIndex, ClubMove, Coded, EditError,
    Entity, EntityArrays, Field, FmDate, GAME_EXE, GAME_PLUGIN, GameInfo, GraphicsCounts, GraphicsIndex, Healed, Kind,
    Listed, Loan, MoveError, MovePlan, MoveTerms, Operation, Picture, Planned, PlayerDetails, PlayerFilter,
    PlayerIndex, PlayerOrder, PlayerSummary, SearchIndex, Session, SessionError, Skipped, StaffDetails, StaffFilter,
    StaffIndex, Target, find_game, sort_players,
};
use fmlibre_mem::{Process, find_processes, is_current_process_elevated, list_modules};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

/// The environment variable that names the graphics folder to read packs from, instead of
/// `Documents\Sports Interactive\Football Manager 27\graphics`.
const GRAPHICS_FOLDER: &str = "FMLIBRE_GRAPHICS";

/// The connected game, the people read from it and the changes written this session.
struct Connection {
    session: Session,
    players: PlayerIndex,
    staff: StaffIndex,
    clubs: ClubIndex,
    /// The clubs human managers run: their players are not moved to other clubs.
    human_clubs: Vec<u32>,
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
    fn load(session: Session, log: Vec<LoggedChange>) -> Result<Self, Failure> {
        let players = PlayerIndex::new(session.players()?);
        let staff = session.staff()?;
        let human_clubs = staff.iter().filter(|member| member.is_human).filter_map(|member| member.club_uid).collect();
        let staff = StaffIndex::new(staff);
        let clubs = ClubIndex::new(session.clubs()?);
        let next_id = log.iter().filter_map(|logged| logged.batch).max().unwrap_or(0) + 1;
        Ok(Self { session, players, staff, clubs, human_clubs, log, mass: None, next_id })
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
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name,
            change,
            undone_at: None,
            batch,
            moved: None,
            captaincy: None,
            undo: None,
        };
        self.log.push(logged.clone());
        logged
    }

    /// Writes changes a mass edit worked out, each only while the game still holds the value it
    /// was planned from, and logs them as the batch `batch`.
    fn write_planned(&mut self, entity: Entity, planned: Vec<Planned>, batch: u32) -> MassReport {
        let fields: BTreeMap<String, Field> =
            self.session.fields(entity).into_iter().map(|field| (field.key.clone(), field)).collect();
        let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
        for planned in planned {
            let field = &fields[&planned.field];
            match self.session.write_field_if(&planned.target, field, planned.old, planned.new) {
                Ok(change) => {
                    self.log_change(change, planned.name, Some(batch));
                    report.applied += 1;
                }
                Err(err) => report.failed.push(MassFailure {
                    uid: planned.uid,
                    name: planned.name,
                    field: planned.field,
                    error: err.into(),
                }),
            }
        }
        report
    }

    /// Logs a captaincy just written, as a change of the club's `captain` or `vice_captain`
    /// from one player's UID to the other's (0 for nobody).
    fn log_captain(&mut self, done: CaptainSet) -> LoggedChange {
        let field = match done.role {
            CaptainRole::Captain => "captain",
            CaptainRole::ViceCaptain => "vice_captain",
        };
        let change = Change {
            entity: Entity::Club,
            uid: done.club,
            field: field.to_owned(),
            old: i64::from(done.old.unwrap_or(0)),
            new: i64::from(done.new),
        };
        let captaincy = Captaincy {
            team: done.team,
            kind: done.kind,
            age_limit: done.age_limit,
            from: done.old.map(|uid| self.player_name(uid)),
            to: self.player_name(done.new),
            swapped: done.swapped,
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.club_name(done.club),
            change,
            undone_at: None,
            batch: None,
            moved: None,
            captaincy: Some(captaincy),
            undo: Some(Undo::Captain(done)),
        };
        self.log.push(logged.clone());
        logged
    }

    /// Logs healing just written, as a change of the player's `injuries` from how many he had to none.
    fn log_heal(&mut self, done: Healed, batch: Option<u32>) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "injuries".to_owned(),
            old: done.injuries as i64,
            new: 0,
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(done.player),
            change,
            undone_at: None,
            batch,
            moved: None,
            captaincy: None,
            undo: Some(Undo::Heal(done)),
        };
        self.log.push(logged.clone());
        logged
    }

    /// Works out moving the player `uid` to the club `club` on the contract `terms`.
    fn plan_move(&self, uid: u32, club: u32, terms: MoveTerms) -> Result<MovePlan, Failure> {
        let player = self.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
        let to = self.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
        Ok(self.session.plan_club_move(player, to, terms, &self.human_clubs)?)
    }

    /// Works out the players `uid` and `other` swapping clubs.
    fn plan_swap(&self, uid: u32, other: u32) -> Result<MovePlan, Failure> {
        let player = self.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
        let partner = self.players.get(other).ok_or_else(|| not_found(Entity::Player, other))?;
        Ok(self.session.plan_club_swap(player, partner, &self.human_clubs)?)
    }

    /// What the list row of the player `uid` says about his club and contract end now.
    fn row_before(&self, uid: u32) -> RowBefore {
        let row = self.players.get(uid);
        RowBefore {
            uid,
            club: row.and_then(|player| player.club.clone()),
            club_uid: row.and_then(|player| player.club_uid),
            contract_expires: row.and_then(|player| player.contract_expires),
        }
    }

    fn player_name(&self, uid: u32) -> String {
        self.players.get(uid).map_or_else(|| uid.to_string(), |player| player.name.clone())
    }

    /// `failure` with the name of the player it names by UID, for the window to say who.
    fn with_names(&self, failure: Failure) -> Failure {
        let holder = failure.params.get("uid").and_then(|uid| uid.parse().ok());
        match holder.and_then(|uid| self.players.get(uid)) {
            Some(player) if failure.code == "edit.taken" => {
                let name = player.name.clone();
                failure.with("name", name)
            }
            _ => failure,
        }
    }

    fn club_name(&self, uid: u32) -> String {
        self.clubs.get(uid).map_or_else(|| uid.to_string(), |club| club.name.clone())
    }

    /// Logs a move just written, as a change of the player's `club` from one club UID to the
    /// other; a swap is one change too, which names the player who went the other way.
    fn log_move(&mut self, done: ClubMove, terms: MoveTerms) -> LoggedChange {
        let (from, to) = (self.club_name(done.from_club), self.club_name(done.to_club));
        let name = self.player_name(done.player);
        let mut rows = vec![self.row_before(done.player)];
        self.players.update(done.player, |player| {
            player.club = Some(to.clone());
            player.club_uid = Some(done.to_club);
            if let Some(expires) = terms.expires {
                player.contract_expires = FmDate::from_number(expires);
            }
        });
        let with = done.other.map(|other| {
            rows.push(self.row_before(other));
            self.players.update(other, |player| {
                player.club = Some(from.clone());
                player.club_uid = Some(done.from_club);
            });
            self.player_name(other)
        });
        let before = LoggedMove { done: done.clone(), rows };
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "club".to_owned(),
            old: i64::from(done.from_club),
            new: i64::from(done.to_club),
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name,
            change,
            undone_at: None,
            batch: None,
            moved: Some(MovedClubs { from, to, with }),
            captaincy: None,
            undo: Some(Undo::Move(before)),
        };
        self.log.push(logged.clone());
        logged
    }

    /// Writes back the old value of the logged change `id`, if the game still holds the new
    /// one; a move or healing goes back if the game still holds everything it wrote.
    fn undo(&mut self, id: usize) -> Result<LoggedChange, Failure> {
        let entry = self
            .log
            .iter()
            .find(|logged| logged.id == id)
            .cloned()
            .ok_or_else(|| Failure::new("app.noChange", format!("No change {id}")).with("id", id))?;
        if entry.undone_at.is_some() {
            return Err(Failure::new("app.alreadyUndone", "This change has already been undone."));
        }
        match entry.undo {
            Some(Undo::Move(moved)) => {
                self.session.undo_club_move(&moved.done)?;
                for row in moved.rows {
                    self.players.update(row.uid, |player| {
                        player.club = row.club;
                        player.club_uid = row.club_uid;
                        player.contract_expires = row.contract_expires;
                    });
                }
            }
            Some(Undo::Heal(healed)) => self.session.undo_heal(&healed)?,
            Some(Undo::Captain(captaincy)) => self.session.undo_captain(&captaincy)?,
            None => {
                let (target, _) = self.target(entry.change.entity, entry.change.uid)?;
                self.session.revert(&target, &entry.change)?;
                self.note_change(&entry.change, entry.change.old);
            }
        }
        let logged = self.log.iter_mut().find(|logged| logged.id == id).expect("found above");
        logged.undone_at = Some(now_ms());
        Ok(logged.clone())
    }

    /// Where the player, member of staff or club with `uid` lives in the game, and its name.
    fn target(&self, entity: Entity, uid: u32) -> Result<(Target, String), Failure> {
        match entity {
            Entity::Player => self.players.get(uid).map(|p| (p.target(), p.name.clone())),
            Entity::Staff => self.staff.get(uid).map(|s| (s.target(), s.name.clone())),
            Entity::Club => self.clubs.get(uid).map(|c| (c.target(), c.name.clone())),
        }
        .ok_or_else(|| not_found(entity, uid))
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
    /// For a move to another club, logged as a change of the field `club` from one club UID
    /// to the other: the clubs' names.
    #[serde(skip_serializing_if = "Option::is_none")]
    moved: Option<MovedClubs>,
    /// For a captaincy, logged as a change of the club's `captain` or `vice_captain` from one
    /// player's UID to the other's: the team and the players' names.
    #[serde(skip_serializing_if = "Option::is_none")]
    captaincy: Option<Captaincy>,
    /// For a move, healing or a captaincy: what undoing it takes. Other changes write back `old`.
    #[serde(skip)]
    undo: Option<Undo>,
}

/// What undoing a change takes when writing back its old value is not enough.
#[derive(Clone)]
enum Undo {
    Move(LoggedMove),
    Heal(Healed),
    Captain(CaptainSet),
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Captaincy {
    /// Where the team is in its club's list of teams; 0 is the senior team.
    team: usize,
    /// The team's kind and age limit, to name it by (see `TeamView`).
    kind: u8,
    age_limit: Option<u8>,
    /// Who held the role, and who took it.
    from: Option<String>,
    to: String,
    /// Whether the player who took the role held the other one, which `from` now holds.
    swapped: bool,
}

/// One of a club's teams as its squad screen shows it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TeamView {
    index: usize,
    /// The game's code for the kind of team: 0 for the first team.
    kind: u8,
    age_limit: Option<u8>,
    captain: Option<u32>,
    vice_captain: Option<u32>,
    players: Vec<SquadRow>,
}

/// A player of a team: his list row and the live values the squad screen shows.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SquadRow {
    #[serde(flatten)]
    player: PlayerSummary,
    plays_here: bool,
    loan: Option<Loan>,
    condition: u16,
    match_sharpness: u16,
    morale: u8,
    injuries: usize,
}

/// What a team-wide action does to every player of the team.
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum TeamAction {
    /// Heals every current injury.
    Heal,
    /// Morale to the top.
    Inspire,
    /// Energy and match sharpness to 100%.
    Refresh,
}

#[derive(Clone, Serialize)]
struct MovedClubs {
    from: String,
    to: String,
    /// In a swap, the player who went the other way.
    #[serde(skip_serializing_if = "Option::is_none")]
    with: Option<String>,
}

/// A move as the log keeps it: the writes to undo, and what the list rows of the players it
/// moved said before.
#[derive(Clone)]
struct LoggedMove {
    done: ClubMove,
    rows: Vec<RowBefore>,
}

/// What a player's list row said about his club and contract end.
#[derive(Clone)]
struct RowBefore {
    uid: u32,
    club: Option<String>,
    club_uid: Option<u32>,
    contract_expires: Option<FmDate>,
}

/// The clubs a move is between.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MovePreview {
    from: ClubName,
    to: ClubName,
}

#[derive(Serialize)]
struct ClubName {
    uid: u32,
    name: String,
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
    error: Failure,
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
    error: Failure,
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
    error: Failure,
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

/// The pictures of the user's graphics packs, once the packs have been read.
#[derive(Default)]
struct Graphics(Arc<Mutex<Option<Arc<GraphicsIndex>>>>);

impl Graphics {
    fn index(&self) -> Option<Arc<GraphicsIndex>> {
        self.0.lock().ok()?.clone()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GraphicsInfo {
    /// Where the packs are looked for.
    root: Option<String>,
    /// False while the packs are still being read.
    ready: bool,
    counts: GraphicsCounts,
}

/// Where the graphics packs are and how many pictures they hold.
#[tauri::command]
fn graphics_info(graphics: State<'_, Graphics>) -> GraphicsInfo {
    match graphics.index() {
        Some(index) => GraphicsInfo {
            root: Some(index.root().display().to_string()).filter(|root| !root.is_empty()),
            ready: true,
            counts: index.counts(),
        },
        None => GraphicsInfo { root: None, ready: false, counts: GraphicsCounts::default() },
    }
}

/// Serves `fmgfx` requests such as `/club/728`, `/face/7458500` or `/flag/765` from the
/// graphics packs; anything unknown or missing is a 404.
fn picture_response(graphics: &Graphics, path: &str) -> tauri::http::Response<Vec<u8>> {
    // The window's own origin differs from fmgfx's, so let it read the answers, not only show them.
    let not_found = || {
        tauri::http::Response::builder()
            .status(404)
            .header("Access-Control-Allow-Origin", "*")
            .body(Vec::new())
            .expect("a plain response")
    };
    let mut parts = path.trim_matches('/').split('/');
    let picture = match parts.next() {
        Some("club") => Picture::ClubLogo,
        Some("face") => Picture::Face,
        Some("flag") => Picture::Flag,
        Some("competition") => Picture::CompetitionLogo,
        _ => return not_found(),
    };
    let Some(id) = parts.next().and_then(|id| id.parse().ok()) else {
        return not_found();
    };
    let Some(index) = graphics.index() else {
        return not_found();
    };
    let Some(file) = index.file(picture, id) else {
        return not_found();
    };
    let Ok(bytes) = std::fs::read(file) else {
        return not_found();
    };
    let png = file.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("png"));
    tauri::http::Response::builder()
        .header("Content-Type", if png { "image/png" } else { "image/jpeg" })
        .header("Cache-Control", "max-age=3600")
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .expect("a picture response")
}

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
    error: Option<Failure>,
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

/// What a command reports when it fails: a code the window says in its own language, the
/// values the message names, and the message in English for a code the window does not know.
#[derive(Debug, Clone, Serialize)]
struct Failure {
    code: &'static str,
    params: BTreeMap<&'static str, String>,
    message: String,
}

impl Failure {
    /// A failure of the app's own, rather than of the game or of an edit.
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, params: BTreeMap::new(), message: message.into() }
    }

    fn with(mut self, name: &'static str, value: impl ToString) -> Self {
        self.params.insert(name, value.to_string());
        self
    }

    fn coded(err: &impl Coded) -> Self {
        Self { code: err.code(), params: err.params().into_iter().collect(), message: err.to_string() }
    }
}

macro_rules! coded_failures {
    ($($error:ty),*) => {$(
        impl From<$error> for Failure {
            fn from(err: $error) -> Self {
                Failure::coded(&err)
            }
        }
    )*};
}

coded_failures!(EditError, MoveError, SessionError, fmlibre_mem::Error);

impl<T> From<std::sync::PoisonError<T>> for Failure {
    fn from(err: std::sync::PoisonError<T>) -> Self {
        Failure::new("app.internal", err.to_string())
    }
}

impl From<tauri::Error> for Failure {
    fn from(err: tauri::Error) -> Self {
        Failure::new("app.internal", err.to_string())
    }
}

fn not_connected() -> Failure {
    Failure::new("app.notConnected", "Not connected to the game")
}

/// No player, member of staff or club with `uid` in the lists read from the game.
fn not_found(entity: Entity, uid: u32) -> Failure {
    Failure::new("app.notFound", format!("No {entity} with id {uid}")).with("entity", entity).with("uid", uid)
}

/// A profile could not be read whole, as the game changed it meanwhile.
fn data_changed() -> Failure {
    Failure::new("app.dataChanged", "This data has changed in the game; reload and try again.")
}

/// Lists running Football Manager processes and whether they can be opened for reading.
#[tauri::command]
async fn detect_game() -> Result<Detection, Failure> {
    let running = find_processes(GAME_EXE)?;
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
        Err(err) => DetectedGame { pid, info: None, plugin_loaded: false, error: Some(err.into()) },
    }
}

/// Attaches to the running game, locates its data and reads every player, member of
/// staff and club. Only reads memory; the game is opened for writing too when Windows
/// allows it, so that edits can be applied later.
#[tauri::command]
async fn connect(state: State<'_, AppState>) -> Result<ConnectionInfo, Failure> {
    let started = Instant::now();
    let connection = tauri::async_runtime::spawn_blocking(|| -> Result<Connection, Failure> {
        let pid = find_game(None)?;
        let process = Process::open_read_write(pid).or_else(|_| Process::open_read(pid))?;
        Connection::load(Session::connect(process, ArraySource::ProfileFirst)?, Vec::new())
    })
    .await??;

    let info = connection.info(started.elapsed().as_millis());
    *state.0.lock()? = Some(connection);
    Ok(info)
}

/// The connection made before, if the app is still attached, without reading the game
/// again: lets the window pick it up after a reload (e.g. to change the language) with
/// the lists and the change log as they were.
#[tauri::command]
fn current_connection(state: State<'_, AppState>) -> Result<Option<ConnectionInfo>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().map(|connection| connection.info(0)))
}

/// Reads everything again, e.g. after the game has moved on. Drops the connection when that fails.
#[tauri::command]
async fn reload(state: State<'_, AppState>) -> Result<ReloadInfo, Failure> {
    let connection = state.0.lock()?.take().ok_or_else(not_connected)?;
    let connection =
        tauri::async_runtime::spawn_blocking(move || Connection::load(connection.session, connection.log)).await??;
    let info = ReloadInfo {
        players: connection.players.len(),
        staff: connection.staff.len(),
        clubs: connection.clubs.len(),
        game_date: connection.session.game_date(),
    };
    *state.0.lock()? = Some(connection);
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
) -> Result<Page<fmlibre_core::PlayerSummary>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
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
) -> Result<Page<fmlibre_core::StaffSummary>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
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
) -> Result<Page<fmlibre_core::ClubSummary>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    Ok(page(&connection.clubs, &query, limit, |c| filter.matches(c), |_| {}))
}

/// The full profile of the club with `uid`. Only reads memory.
#[tauri::command]
fn club_details(state: State<'_, AppState>, uid: u32) -> Result<ClubDetails, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let club = connection.clubs.get(uid).ok_or_else(|| not_found(Entity::Club, uid))?;
    connection.session.club_details(club)?.ok_or_else(data_changed)
}

/// The full profile of the player with `uid`. Only reads memory.
#[tauri::command]
fn player_details(state: State<'_, AppState>, uid: u32) -> Result<PlayerDetails, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    connection.session.player_details(player)?.ok_or_else(data_changed)
}

/// The full profile of the member of staff with `uid`. Only reads memory.
#[tauri::command]
fn staff_details(state: State<'_, AppState>, uid: u32) -> Result<StaffDetails, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let member = connection.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?;
    connection.session.staff_details(member)?.ok_or_else(data_changed)
}

/// The fields of players or of staff that the editor can change.
#[tauri::command]
fn edit_fields(state: State<'_, AppState>, entity: Entity) -> Result<Vec<Field>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(connection.session.fields(entity))
}

/// The value of every field of one player, member of staff or club that can be edited
/// now, as stored, read now. Fields without their record (no contract, a club without
/// full finances) and dates the game has not set are left out.
#[tauri::command]
fn read_values(state: State<'_, AppState>, entity: Entity, uid: u32) -> Result<BTreeMap<String, i64>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let (target, _) = connection.target(entity, uid)?;
    let fields = connection.session.fields(entity);
    let values = connection.session.read_fields(&target, &fields)?;
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
) -> Result<ApplyReport, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
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
            Err(err) => {
                let error = connection.with_names(err.into());
                report.failed.push(FailedEdit { field: edit.field, value: edit.value, error });
            }
        }
    }
    Ok(report)
}

/// Every change written this session, newest first.
#[tauri::command]
fn change_log(state: State<'_, AppState>) -> Result<Vec<LoggedChange>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(connection.log.iter().rev().cloned().collect())
}

/// Writes back the old value of the logged change `id`, provided the game still holds the
/// value that change wrote.
#[tauri::command]
fn undo_change(state: State<'_, AppState>, id: usize) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    connection.undo(id)
}

/// Checks that the player `uid` can move to the club `club` on the contract `terms`, and
/// names the clubs; the error says why he cannot. Nothing is written.
#[tauri::command]
fn plan_club_move(state: State<'_, AppState>, uid: u32, club: u32, terms: MoveTerms) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let plan = connection.plan_move(uid, club, terms)?;
    let name = |uid: u32| ClubName { uid, name: connection.club_name(uid) };
    Ok(MovePreview { from: name(plan.from_club), to: name(plan.to_club) })
}

/// Moves the player `uid` to the senior team of the club `club` on the contract `terms`,
/// worked out again from the game as it is now, and logs the move.
#[tauri::command]
fn move_player(state: State<'_, AppState>, uid: u32, club: u32, terms: MoveTerms) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let plan = connection.plan_move(uid, club, terms)?;
    let done = connection.session.apply_club_move(&plan)?;
    Ok(connection.log_move(done, terms))
}

/// Checks that the players `uid` and `other` can swap clubs, and names the clubs (`from` is
/// the club of `uid`); the error says why they cannot. Nothing is written.
#[tauri::command]
fn plan_club_swap(state: State<'_, AppState>, uid: u32, other: u32) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let plan = connection.plan_swap(uid, other)?;
    let name = |uid: u32| ClubName { uid, name: connection.club_name(uid) };
    Ok(MovePreview { from: name(plan.from_club), to: name(plan.to_club) })
}

/// Swaps the clubs of the players `uid` and `other`, worked out again from the game as it is
/// now; each keeps his contract's terms. Logged as one change of `uid`'s club.
#[tauri::command]
fn swap_players(state: State<'_, AppState>, uid: u32, other: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let plan = connection.plan_swap(uid, other)?;
    let done = connection.session.apply_club_move(&plan)?;
    Ok(connection.log_move(done, MoveTerms::default()))
}

/// Heals every current injury of the player `uid`, as the game does when he gets over them,
/// and logs it as one change of his `injuries` to none.
#[tauri::command]
fn heal_player(state: State<'_, AppState>, uid: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_heal(player)?;
    let done = connection.session.apply_heal(&plan)?;
    Ok(connection.log_heal(done, None))
}

/// The teams of the club `uid`, the senior team first, with their players: each one's list
/// row and the live values a squad screen shows, read now.
#[tauri::command]
fn club_squads(state: State<'_, AppState>, uid: u32) -> Result<Vec<TeamView>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let club = connection.clubs.get(uid).ok_or_else(|| not_found(Entity::Club, uid))?;
    let teams = connection.session.club_teams(club, &connection.players)?;
    Ok(teams
        .into_iter()
        .map(|team| TeamView {
            index: team.index,
            kind: team.kind,
            age_limit: team.age_limit,
            captain: team.captain,
            vice_captain: team.vice_captain,
            players: team
                .players
                .into_iter()
                .filter_map(|member| {
                    let player = connection.players.get(member.uid)?.clone();
                    Some(SquadRow {
                        player,
                        plays_here: member.plays_here,
                        loan: member.loan,
                        condition: member.condition,
                        match_sharpness: member.match_sharpness,
                        morale: member.morale,
                        injuries: member.injuries,
                    })
                })
                .collect(),
        })
        .collect())
}

/// Makes the player `uid` the captain or vice-captain of the team `team` of the club `club`;
/// he must play for that team. When he held the other role, the two captains swap.
#[tauri::command]
fn set_captain(
    state: State<'_, AppState>,
    club: u32,
    team: usize,
    role: CaptainRole,
    uid: u32,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let summary = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_captain(summary, team, role, player, &connection.players)?;
    if plan.writes() == 0 {
        return Err(Failure::new("captain.unchanged", "The player holds that role already."));
    }
    let done = connection.session.apply_captain(&plan)?;
    Ok(connection.log_captain(done))
}

/// Does `action` to every player of the team `team` of the club `club`, read now: those out
/// on loan too. The changes are logged as one batch, which `undo_batch` undoes.
#[tauri::command]
fn team_action(state: State<'_, AppState>, club: u32, team: usize, action: TeamAction) -> Result<MassReport, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let summary = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    let members = connection
        .session
        .club_teams(summary, &connection.players)?
        .into_iter()
        .find(|found| found.index == team)
        .ok_or(MoveError::NoTeam { index: team })?
        .players;
    let batch = connection.fresh_id();
    let values: &[(&str, i64)] = match action {
        TeamAction::Heal => {
            let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
            for member in members.iter().filter(|member| member.injuries > 0) {
                let Some(player) = connection.players.get(member.uid) else {
                    continue;
                };
                let name = player.name.clone();
                let healed = connection.session.plan_heal(player).and_then(|plan| connection.session.apply_heal(&plan));
                match healed {
                    Ok(done) => {
                        connection.log_heal(done, Some(batch));
                        report.applied += 1;
                    }
                    Err(err) => report.failed.push(MassFailure {
                        uid: member.uid,
                        name,
                        field: "injuries".to_owned(),
                        error: err.into(),
                    }),
                }
            }
            return Ok(report);
        }
        TeamAction::Inspire => &[("morale", 20)],
        TeamAction::Refresh => &[("condition", 10_000), ("match_sharpness", 10_000)],
    };
    let targets: Vec<(Target, String)> = members
        .iter()
        .filter_map(|member| connection.players.get(member.uid))
        .map(|player| (player.target(), player.name.clone()))
        .collect();
    let operations = values
        .iter()
        .map(|&(key, value)| Ok((connection.session.field(Entity::Player, key)?, Operation::Set { value })))
        .collect::<Result<Vec<_>, EditError>>()?;
    let plan = connection.session.plan_mass_edit(&targets, &operations)?;
    Ok(connection.write_planned(Entity::Player, plan.planned, batch))
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
) -> Result<MassPreview, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if operations.is_empty() {
        return Err(Failure::new("mass.noOperations", "Choose at least one field to change."));
    }
    let targets = connection.select(entity, &query, filters);
    if targets.len() > MASS_LIMIT {
        let message = format!(
            "{} match. Narrow the search or the filters to {MASS_LIMIT} or fewer for a mass edit.",
            targets.len()
        );
        return Err(Failure::new("mass.tooMany", message).with("count", targets.len()).with("limit", MASS_LIMIT));
    }
    let operations = operations
        .into_iter()
        .map(|op| Ok((connection.session.field(entity, &op.field)?, op.operation)))
        .collect::<Result<Vec<_>, EditError>>()?;
    let plan = connection.session.plan_mass_edit(&targets, &operations)?;
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
fn apply_mass_edit(state: State<'_, AppState>, id: u32) -> Result<MassReport, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let pending = match connection.mass.take() {
        Some(pending) if pending.id == id => pending,
        other => {
            connection.mass = other;
            return Err(Failure::new("mass.outOfDate", "This preview is out of date. Preview the mass edit again."));
        }
    };
    let batch = connection.fresh_id();
    Ok(connection.write_planned(pending.entity, pending.planned, batch))
}

/// Undoes every change of the mass edit `batch` that is not undone yet, newest first.
/// Changes the game has changed since are left as they are and reported.
#[tauri::command]
fn undo_batch(state: State<'_, AppState>, batch: u32) -> Result<BatchUndo, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
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
        .manage(Graphics::default())
        .setup(|app| {
            // Reading the packs' config files takes a moment: do it beside the window. FM can keep its user
            // data somewhere else than the documents folder, so GRAPHICS_FOLDER can name the graphics folder.
            let root = match std::env::var_os(GRAPHICS_FOLDER) {
                Some(folder) => Some(PathBuf::from(folder)),
                None => app.path().document_dir().ok().map(|documents| GraphicsIndex::default_root(&documents, 27)),
            };
            let graphics = app.state::<Graphics>().0.clone();
            std::thread::spawn(move || {
                let index = root.map_or_else(GraphicsIndex::default, |root| GraphicsIndex::scan(&root));
                if let Ok(mut slot) = graphics.lock() {
                    *slot = Some(Arc::new(index));
                }
            });
            Ok(())
        })
        .register_uri_scheme_protocol("fmgfx", |ctx, request| {
            let graphics = ctx.app_handle().state::<Graphics>();
            picture_response(&graphics, request.uri().path())
        })
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
            undo_batch,
            plan_club_move,
            move_player,
            plan_club_swap,
            swap_players,
            heal_player,
            club_squads,
            set_captain,
            team_action,
            graphics_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
