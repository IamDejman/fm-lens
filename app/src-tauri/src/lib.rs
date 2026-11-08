mod bridge;

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use fmlens_core::{
    AddedInjury, AgreedSigning, ArraySource, AwardFilter, AwardSummary, CaptainRole, CaptainSet, Change, Clause,
    ClauseSet, ClubDetails, ClubFilter, ClubIndex, ClubMove, Coded, Cohered, CompetitionFilter, CompetitionRule,
    CompetitionSummary, EditError, EndedLoan, Entity, EntityArrays, ExportFormat, ExportHeader, FeePlan, Field, FmDate,
    FutureTransfer, GAME_EXE, GAME_PLUGIN, GameActions, GameInfo, GameRelease, GraphicsCounts, GraphicsIndex,
    HOMEGROWN_RULES, Healed, Health, Injury, InjuryKind, InjurySet, Kind, Language, LanguageSet, Lifted, Listed, Loan,
    MANAGER_JOB, MoveError, MovePlan, MoveTerms, MovedManager, Nation, NationDetails, NationFilter, NationSummary,
    OfficialFilter, OfficialSummary, Operation, Paid, PermitChange, PersonRef, Picture, Planned, PlayerDetails,
    PlayerFilter, PlayerIndex, PlayerOrder, PlayerSummary, PlayerTemplate, Preference, PreferenceKind, PreferenceSet,
    PreferenceTarget, Promise, PromiseClosed, RelationSet, RetirementSet, STAFF_JOBS, SearchIndex, Session,
    SessionError, SignedPlayer, Skipped, StadiumFilter, StadiumSummary, StaffChange, StaffDetails, StaffFilter,
    StaffIndex, StaffPlan, StartedLoan, Target, TemplateGroup, Tie, TieTarget, TransferPlan, TransferredPlayer,
    find_game, nation_summaries, nations, read_stadiums, sort_players,
};
use fmlens_mem::{Process, find_processes, is_current_process_elevated, list_modules};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

/// The environment variable that names the graphics folder to read packs from, instead of
/// `Documents\Sports Interactive\Football Manager 27\graphics` on Windows and
/// `~/Library/Application Support/Sports Interactive/Football Manager 27/graphics` on macOS.
const GRAPHICS_FOLDER: &str = "FMLENS_GRAPHICS";

/// The environment variable that names the folder the app keeps its own files in, instead of its data folder
/// (`%APPDATA%\local.fm.lens` on Windows): for now, what was frozen in each save.
const DATA_FOLDER: &str = "FMLENS_DATA";

/// The identifier of a debug build, so that it keeps its files apart from the installed app's (see `context`).
const DEBUG_IDENTIFIER: &str = "local.fm.lens.dev";

/// The file in that folder that remembers what was frozen in each save (see `Remembered`).
const FROZEN_FILE: &str = "frozen.json";

/// The environment variable that names the folder exports are written to, instead of `FM Lens\Exports` in the
/// documents folder.
const EXPORTS_FOLDER: &str = "FMLENS_EXPORTS";

/// The connected game, the people read from it and the changes written this session.
struct Connection {
    session: Session,
    players: PlayerIndex,
    staff: StaffIndex,
    clubs: ClubIndex,
    /// The clubs human managers run: their players are not moved to other clubs.
    human_clubs: Vec<u32>,
    log: Vec<LoggedChange>,
    pending_refresh: Vec<(Entity, u32)>,
    pending_contract_refresh: bool,
    /// The mass edit last previewed, until it is applied or replaced.
    mass: Option<PendingMass>,
    /// The next id for a mass-edit preview or batch.
    next_id: u32,
    frozen: Frozen,
    /// Which save the game has loaded (see `save_of`); none when the lists name no human manager.
    save: Option<String>,
    /// Who the user is in that save, to show which career is connected; none when no career is loaded.
    career: Option<Career>,
    /// Senior stadiums, read once from the clubs already loaded. Cleared when the connection is loaded again.
    stadiums: Option<SearchIndex<StadiumSummary>>,
    /// Match officials, read once. Cleared when the connection is loaded again.
    officials: Option<SearchIndex<OfficialSummary>>,
    /// Competitions and awards, read once. Cleared when the connection is loaded again.
    competitions: Option<SearchIndex<CompetitionSummary>>,
    awards: Option<SearchIndex<AwardSummary>>,
}

/// How often the balances of frozen clubs and the attributes of frozen players are looked at.
const FREEZE_EVERY: Duration = Duration::from_secs(2);

/// How long the hold of frozen values waits after failing to read the game again before it tries once more.
const READ_AGAIN_RETRY: Duration = Duration::from_secs(30);

/// The event that tells the window the game was read again without it (see `read_again_for_freezes`), with what a
/// Reload returns.
const READ_AGAIN_EVENT: &str = "game-read-again";

/// The attributes of a player that are at their best at 1, not at 20.
const LOWER_IS_BETTER: [&str; 2] = ["attribute.injury_proneness", "attribute.dirtiness"];

/// What the app keeps from getting worse while it is connected (see `Connection::hold_frozen`).
#[derive(Default)]
struct Frozen {
    /// The clubs whose money is frozen, with the least their balance may be: what it was when it was frozen, or more
    /// once the club earned more.
    money: BTreeMap<u32, i64>,
    /// The players whose attributes are frozen, with the worst each attribute may be, as stored: what it was when it
    /// was frozen, or better once he improved. Worse is lower, or higher where lower is better.
    attributes: BTreeMap<u32, BTreeMap<String, i64>>,
    /// The members of staff whose attributes are frozen, held the same way on the staff's own attribute scales.
    staff_attributes: BTreeMap<u32, BTreeMap<String, i64>>,
    /// The holds the editor's checks refused, as logged: each is logged once.
    refused: BTreeSet<String>,
}

impl Frozen {
    fn is_empty(&self) -> bool {
        self.money.is_empty() && self.attributes.is_empty() && self.staff_attributes.is_empty()
    }

    /// What a connection just made holds of `old`, the one before it: in the same game all of it, at what it was held
    /// at (a balance the club earned since, an attribute that improved), not at what the game holds now; in another
    /// game none of it, and the file freezes that save's afresh.
    fn carry_over(old: &mut Frozen, same_game: bool) -> Option<Frozen> {
        same_game.then(|| std::mem::take(old))
    }

    /// A value the editor just wrote to a frozen field becomes what it is held at, so it is not taken back as if the
    /// game had changed it.
    fn note(&mut self, change: &Change, value: i64) {
        let held = match change.entity {
            Entity::Club if change.field == "finance.balance" => self.money.get_mut(&change.uid),
            Entity::Player => self.attributes.get_mut(&change.uid).and_then(|held| held.get_mut(&change.field)),
            Entity::Staff => self.staff_attributes.get_mut(&change.uid).and_then(|held| held.get_mut(&change.field)),
            _ => None,
        };
        if let Some(held) = held {
            *held = value;
        }
    }
}

/// What was frozen in each save, kept in a file so that it is frozen again when the app connects to that save another
/// time: after the app, the game or the computer was restarted.
#[derive(Default, Serialize, Deserialize)]
struct Remembered {
    /// By save (see `save_of`).
    saves: BTreeMap<String, RememberedSave>,
}

#[derive(Default, Serialize, Deserialize)]
struct RememberedSave {
    /// The players whose attributes are frozen.
    players: BTreeSet<u32>,
    /// The clubs whose money is frozen.
    clubs: BTreeSet<u32>,
    /// The members of staff whose attributes are frozen. Files from before staff freezes were remembered have none.
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    staff: BTreeSet<u32>,
}

impl RememberedSave {
    fn is_empty(&self) -> bool {
        self.players.is_empty() && self.clubs.is_empty() && self.staff.is_empty()
    }
}

impl Remembered {
    /// What the file at `path` holds: nothing when there is none, or it cannot be read.
    fn read(path: &Path) -> Self {
        std::fs::read(path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
    }

    /// Writes it whole to `path`, through a file beside it, so that a write cut short never leaves half a file.
    fn write(&self, path: &Path) -> std::io::Result<()> {
        if let Some(folder) = path.parent() {
            std::fs::create_dir_all(folder)?;
        }
        let part = path.with_extension("json.part");
        std::fs::write(&part, serde_json::to_vec_pretty(self)?)?;
        std::fs::rename(&part, path)
    }
}

/// Where the app remembers what was frozen in each save; none when it has no data folder.
struct FrozenFile(Option<PathBuf>);

/// The folder exports are written to; none when there is no documents folder.
struct ExportsFolder(Option<PathBuf>);

/// What an export wrote, and where.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportReport {
    /// The file, and its name and folder apart.
    path: PathBuf,
    file: String,
    folder: PathBuf,
    players: usize,
    /// Players whose objects changed while they were read: left out.
    skipped: usize,
}

/// What connecting froze again of what was frozen in the save before (see `Connection::restore_frozen`).
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Refrozen {
    /// The players whose attributes are frozen again, by name.
    players: Vec<String>,
    /// The clubs whose money is frozen again, by name.
    clubs: Vec<String>,
    /// The members of staff whose attributes are frozen again, by name.
    staff: Vec<String>,
    /// How many are left for later, still remembered: the editor has no profile for this version of the game, or a
    /// check did not pass.
    waiting: usize,
}

impl Refrozen {
    fn is_empty(&self) -> bool {
        self.players.is_empty() && self.clubs.is_empty() && self.staff.is_empty() && self.waiting == 0
    }
}

/// What tells one save from another: the storefront, and the managers that human players control in it, whom each
/// new save makes afresh. None when the lists name no human manager.
fn save_of(session: &Session, humans: &[u32]) -> Option<String> {
    if humans.is_empty() {
        return None;
    }
    let managers: Vec<String> = humans.iter().map(u32::to_string).collect();
    Some(format!("{:?}:{}", session.game.storefront, managers.join("+")))
}

/// A mass edit that was worked out and shown, waiting to be applied as it was shown.
struct PendingMass {
    id: u32,
    entity: Entity,
    planned: Vec<Planned>,
}

impl Connection {
    /// Reads every list, with an empty change log (see `carry_log`); a mass edit previewed before is dropped, since its
    /// people may have moved. Nothing is frozen yet.
    fn load(session: Session) -> Result<Self, Failure> {
        // The game may have loaded a save or moved on since the checks last ran; the date the lists' ages are worked
        // out from is one of them.
        session.recheck();
        let players = PlayerIndex::new(session.players()?);
        let staff = session.staff()?;
        let human_clubs = staff.iter().filter(|member| member.is_human).filter_map(|member| member.club_uid).collect();
        let mut humans: Vec<u32> = staff.iter().filter(|member| member.is_human).map(|member| member.uid).collect();
        humans.sort_unstable();
        let save = save_of(&session, &humans);
        let career =
            staff.iter().filter(|member| member.is_human).min_by_key(|member| member.uid).map(|member| Career {
                uid: member.uid,
                manager: member.name.clone(),
                club: member.club.clone(),
                club_uid: member.club_uid,
            });
        let staff = StaffIndex::new(staff);
        let clubs = ClubIndex::new(session.clubs()?);
        let frozen = Frozen::default();
        Ok(Self {
            session,
            players,
            staff,
            clubs,
            human_clubs,
            log: Vec::new(),
            pending_refresh: Vec::new(),
            pending_contract_refresh: false,
            mass: None,
            next_id: 1,
            frozen,
            save,
            career,
            stadiums: None,
            officials: None,
            competitions: None,
            awards: None,
        })
    }

    /// Whether this connection, just made, reads the game `before` read, moved on: the same process and save, and the
    /// players still in it the objects they were.
    fn same_game_as(&self, before: &Connection) -> bool {
        self.session.process.pid() == before.session.process.pid()
            && self.save == before.save
            && same_objects(
                before
                    .players
                    .iter()
                    .map(|player| (player.target(), self.players.get(player.uid).map(PlayerSummary::target))),
            )
    }

    /// Takes over the change log of the connection before this one, just made. In the same game its changes can still
    /// be undone; from another (FM closed, or a save loaded since) they stay listed, but the objects they were written
    /// to are gone, so they are no longer undone.
    fn carry_log(&mut self, mut log: Vec<LoggedChange>, same_game: bool) {
        if !same_game {
            for logged in &mut log {
                logged.earlier_game = true;
                logged.undo = None;
            }
        }
        self.next_id = log.iter().filter_map(|logged| logged.batch).max().unwrap_or(0) + 1;
        self.log = log;
    }

    /// Takes over what is frozen from `old`, the connection read before this one, just made, and says whether it read
    /// the same game: there what was frozen stays frozen, at what it was held at. After another save was loaded, what
    /// was frozen in that one before is frozen again instead.
    fn take_frozen(&mut self, old: &mut Connection, path: Option<&Path>) -> (Option<Refrozen>, bool) {
        let same_game = self.same_game_as(old);
        if let Some(frozen) = Frozen::carry_over(&mut old.frozen, same_game) {
            self.frozen = frozen;
            return (None, true);
        }
        let refrozen = self.restore_frozen(path);
        ((!refrozen.is_empty()).then_some(refrozen), false)
    }

    /// Freezes again what was frozen in this save before, as the file at `path` remembers it: the attributes of its
    /// players and the money of its clubs, each held from what it is now. Only on a build the editor has a profile
    /// for and only where its checks let it write: on any other, after an update of the game say, nothing is frozen,
    /// and the file keeps them for later. What is no longer in the lists (a player who retired) is forgotten.
    fn restore_frozen(&mut self, path: Option<&Path>) -> Refrozen {
        let mut refrozen = Refrozen::default();
        let (Some(path), Some(save)) = (path, self.save.clone()) else {
            return refrozen;
        };
        let mut remembered = Remembered::read(path);
        let Some(entry) = remembered.saves.get_mut(&save) else {
            return refrozen;
        };
        let count = entry.players.len() + entry.clubs.len() + entry.staff.len();
        entry.players.retain(|&uid| self.players.get(uid).is_some());
        entry.clubs.retain(|&uid| self.clubs.get(uid).is_some());
        entry.staff.retain(|&uid| self.staff.get(uid).is_some());
        let (players, clubs, staff) = (entry.players.clone(), entry.clubs.clone(), entry.staff.clone());
        if players.len() + clubs.len() + staff.len() < count {
            remembered.saves.retain(|_, save| !save.is_empty());
            let _ = remembered.write(path);
        }
        let safe = self.session.known_build() && self.session.process.can_write();
        for uid in players {
            match safe.then(|| self.freeze_player(uid)) {
                Some(Ok(())) => refrozen.players.push(self.player_name(uid)),
                _ => refrozen.waiting += 1,
            }
        }
        for uid in clubs {
            match safe.then(|| self.freeze_club(uid)) {
                Some(Ok(())) => refrozen.clubs.push(self.club_name(uid)),
                _ => refrozen.waiting += 1,
            }
        }
        for uid in staff {
            match safe.then(|| self.freeze_staff(uid)) {
                Some(Ok(())) => refrozen.staff.push(self.staff_name(uid)),
                _ => refrozen.waiting += 1,
            }
        }
        refrozen
    }

    /// Changes, with `change`, what the file at `path` remembers as frozen in this save. Without a file or a known
    /// save nothing is remembered, and a file that cannot be written only means that this is not.
    fn remember(&self, path: Option<&Path>, change: impl FnOnce(&mut RememberedSave)) {
        let (Some(path), Some(save)) = (path, &self.save) else {
            return;
        };
        let mut remembered = Remembered::read(path);
        change(remembered.saves.entry(save.clone()).or_default());
        remembered.saves.retain(|_, save| !save.is_empty());
        let _ = remembered.write(path);
    }

    /// Freezes the attributes of the player `uid` at what they are now (see `hold_attributes`). Refused while the
    /// attributes may not be written.
    fn freeze_player(&mut self, uid: u32) -> Result<(), Failure> {
        let target = self.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?.target();
        let fields = self.attribute_fields();
        // They share one check: what holds for the first holds for all.
        if let Some(field) = fields.first()
            && let Some(lock) = self.session.field_lock(field)
        {
            return Err(EditError::Locked { field: field.key.clone(), lock }.into());
        }
        let values = self.session.read_fields(&target, &fields)?;
        let held = fields.into_iter().zip(values).filter_map(|(field, value)| Some((field.key, value?))).collect();
        self.frozen.attributes.insert(uid, held);
        Ok(())
    }

    /// Freezes the money of the club `uid` at its balance now (see `hold_money`). Refused while the balance may not be
    /// written.
    fn freeze_club(&mut self, uid: u32) -> Result<(), Failure> {
        let target = self.clubs.get(uid).ok_or_else(|| not_found(Entity::Club, uid))?.target();
        let field = self.session.field(Entity::Club, "finance.balance")?;
        if let Some(lock) = self.session.field_lock(&field) {
            return Err(EditError::Locked { field: field.key.clone(), lock }.into());
        }
        let balance = self.session.read_field(&target, &field)?;
        self.frozen.money.insert(uid, balance);
        Ok(())
    }

    /// Freezes the attributes of the member of staff `uid` at what they are now (see `hold_staff_attributes`).
    /// Refused while they may not be written, or one of them holds what the editor would not write.
    fn freeze_staff(&mut self, uid: u32) -> Result<(), Failure> {
        if !self.session.process.can_write() {
            return Err(Failure::new("memory.readOnly", "This connection cannot write to the game."));
        }
        let target = self.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?.target();
        let fields = self.staff_attribute_fields();
        for field in &fields {
            if let Some(lock) = self.session.field_lock(field) {
                return Err(EditError::Locked { field: field.key.clone(), lock }.into());
            }
        }
        let values = self.session.read_fields(&target, &fields)?;
        let mut held = BTreeMap::new();
        for (field, value) in fields.into_iter().zip(values) {
            let value = value.filter(|value| field.takes(*value)).ok_or_else(|| {
                Failure::new("freeze.invalid", format!("Cannot freeze {}: its current value is invalid.", field.key))
            })?;
            held.insert(field.key, value);
        }
        self.frozen.staff_attributes.insert(uid, held);
        Ok(())
    }

    fn staff_name(&self, uid: u32) -> String {
        self.staff.get(uid).map_or_else(|| uid.to_string(), |member| member.name.clone())
    }

    /// Whether FM has moved its lists since this connection read them (it does at times as the game goes on, and on
    /// loading a save): the editor then writes nothing until the game is read again.
    fn stale(&self) -> bool {
        self.session.known_build() && self.session.process.can_write() && !self.session.current_career()
    }

    /// What the window learns of a connection just read again; `refrozen` as `read_again` gave it.
    fn reload_info(&self, refrozen: Option<Refrozen>) -> ReloadInfo {
        ReloadInfo {
            editable: self.session.process.can_write() && self.session.writes_allowed(),
            writable: self.session.process.can_write(),
            known_build: self.session.known_build(),
            players: self.players.len(),
            staff: self.staff.len(),
            clubs: self.clubs.len(),
            game_date: self.session.game_date(),
            health: Health::clone(&self.session.health()),
            career: self.career.clone(),
            refrozen,
        }
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
            editable: self.session.process.can_write() && self.session.writes_allowed(),
            writable: self.session.process.can_write(),
            known_build: self.session.known_build(),
            health: Health::clone(&self.session.health()),
            career: self.career.clone(),
            game_actions: self.session.game_actions(),
            refrozen: None,
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
            // A nation or an official is edited one at a time.
            Entity::Nation | Entity::Official => Vec::new(),
        }
    }

    /// Logs a change just written; `batch` groups the changes of one mass edit.
    fn log_change(&mut self, change: Change, name: String, batch: Option<u32>) -> LoggedChange {
        self.pending_contract_refresh |= change.field.starts_with("contract.");
        self.note_change(&change, change.new);
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name,
            change,
            undone_at: None,
            earlier_game: false,
            batch,
            moved: None,
            captaincy: None,
            tie: None,
            clause: None,
            undo: None,
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
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
            earlier_game: false,
            batch: None,
            moved: None,
            captaincy: Some(captaincy),
            tie: None,
            clause: None,
            undo: Some(Undo::Captain(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
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
            earlier_game: false,
            batch,
            moved: None,
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Heal(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a change the game made itself to the player `uid`, as one of his `field` from `old` to `new`.
    fn log_game_change(&mut self, uid: u32, field: &str, old: i64, new: i64, undo: Undo) -> LoggedChange {
        let change = Change { entity: Entity::Player, uid, field: field.to_owned(), old, new };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(uid),
            change,
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: None,
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(undo),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a loan the game started, as a change of the player's `loan` from his club's UID to the borrower's, with
    /// the clubs' names.
    fn log_loan(&mut self, started: StartedLoan) -> LoggedChange {
        let (from, to) = (i64::from(started.from_club), i64::from(started.to_club));
        // His row names the club he plays for, the one he is loaned to.
        let club = self.club_name(started.to_club);
        self.players.update(started.player, |player| {
            player.club = Some(club);
            player.club_uid = Some(started.to_club);
        });
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(started.player),
            change: Change {
                entity: Entity::Player,
                uid: started.player,
                field: "loan".to_owned(),
                old: from,
                new: to,
            },
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: Some(MovedClubs {
                from: Some(self.club_name(started.from_club)),
                to: Some(self.club_name(started.to_club)),
                with: None,
                fee: None,
                joins: None,
            }),
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Loan(started)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a loan the game ended, as a change of the player's `loan` from the borrower's UID to his own club's, with
    /// the clubs' names.
    fn log_loan_end(&mut self, ended: EndedLoan) -> LoggedChange {
        let club = self.club_name(ended.to_club);
        self.players.update(ended.player, |player| {
            player.club = Some(club);
            player.club_uid = Some(ended.to_club);
        });
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(ended.player),
            change: Change {
                entity: Entity::Player,
                uid: ended.player,
                field: "loan".to_owned(),
                old: i64::from(ended.from_club),
                new: i64::from(ended.to_club),
            },
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: Some(MovedClubs {
                from: Some(self.club_name(ended.from_club)),
                to: Some(self.club_name(ended.to_club)),
                with: None,
                fee: None,
                joins: None,
            }),
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::LoanEnded(ended)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a free agent's signing, as a change of his `club` from none; undone by releasing him again.
    fn log_signing(&mut self, signed: SignedPlayer) -> LoggedChange {
        let to = self.club_name(signed.club);
        self.players.update(signed.player, |player| {
            player.club = Some(to.clone());
            player.club_uid = Some(signed.club);
            player.contract_expires = signed.expires;
        });
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(signed.player),
            change: Change {
                entity: Entity::Player,
                uid: signed.player,
                field: "club".to_owned(),
                old: 0,
                new: i64::from(signed.club),
            },
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: Some(MovedClubs { from: None, to: Some(to), with: None, fee: None, joins: None }),
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Signed(signed)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a transfer the game made, as a change of the player's `club` from one club UID to the other. Nothing undoes
    /// it.
    fn log_transfer(&mut self, moved: TransferredPlayer) -> LoggedChange {
        let (from, to) = (self.club_name(moved.from_club), self.club_name(moved.to_club));
        self.players.update(moved.player, |player| {
            player.club = Some(to.clone());
            player.club_uid = Some(moved.to_club);
            player.contract_expires = moved.expires;
        });
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(moved.player),
            change: Change {
                entity: Entity::Player,
                uid: moved.player,
                field: "club".to_owned(),
                old: i64::from(moved.from_club),
                new: i64::from(moved.to_club),
            },
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: Some(MovedClubs {
                from: Some(from),
                to: Some(to),
                with: None,
                fee: Some(moved.fee).filter(|&fee| fee > 0),
                joins: None,
            }),
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Permanent),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a transfer agreed for a later day the game cancelled, as a change of the player's `future_transfer` from
    /// the club he was to join (its UID; 0 when the game names none) to none, with that club and the day. Nothing
    /// undoes it.
    fn log_cancelled_transfer(&mut self, player: u32, cancelled: FutureTransfer) -> LoggedChange {
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(player),
            change: Change {
                entity: Entity::Player,
                uid: player,
                field: "future_transfer".to_owned(),
                old: cancelled.club_uid.map_or(0, i64::from),
                new: 0,
            },
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: Some(MovedClubs {
                from: None,
                to: cancelled.club,
                with: None,
                fee: None,
                joins: cancelled.joins.map(FmDate::to_number),
            }),
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Permanent),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a free agent's signing the game agreed for a later day, as a change of his `club` from none with the day
    /// he joins; undone by cancelling it. He stays a free agent until then, so his list row does not change.
    fn log_signing_later(&mut self, agreed: AgreedSigning) -> LoggedChange {
        let to = self.club_name(agreed.club);
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(agreed.player),
            change: Change {
                entity: Entity::Player,
                uid: agreed.player,
                field: "club".to_owned(),
                old: 0,
                new: i64::from(agreed.club),
            },
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: Some(MovedClubs {
                from: None,
                to: Some(to),
                with: None,
                fee: None,
                joins: Some(agreed.joins.to_number()),
            }),
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::SignedLater(agreed)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a promise just closed, as a change of the player's `promise` from FM's number for it to none.
    fn log_promise(&mut self, done: PromiseClosed) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "promise".to_owned(),
            old: i64::from(done.promise.id),
            new: 0,
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(done.player),
            change,
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: None,
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Promise(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs lifting just written, as a change of the player's `bans` from how many he had to none.
    fn log_lift(&mut self, done: Lifted, batch: Option<u32>) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "bans".to_owned(),
            old: done.bans as i64,
            new: 0,
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(done.player),
            change,
            undone_at: None,
            earlier_game: false,
            batch,
            moved: None,
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Lift(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Names the people and clubs of `preferences` the game's records leave unnamed, from the lists read at connect.
    fn name_preferences(&self, preferences: &mut [Preference]) {
        for preference in preferences.iter_mut().filter(|preference| preference.name.is_none()) {
            let uid = preference.target_uid;
            preference.name = match preference.kind {
                PreferenceKind::FavouredPerson | PreferenceKind::DislikedPerson => self
                    .players
                    .get(uid)
                    .map(|player| player.name.clone())
                    .or_else(|| self.staff.get(uid).map(|member| member.name.clone())),
                PreferenceKind::FavouredClub | PreferenceKind::DislikedClub => {
                    self.clubs.get(uid).map(|club| club.name.clone())
                }
            };
        }
    }

    /// Logs a change to a person's preferences just written, as a change of his field `preference.favouredClub`,
    /// `preference.dislikedClub`, `preference.favouredPerson` or `preference.dislikedPerson` from one strength to the
    /// other (0 for one taken out), with the person or club and its strength before and after.
    fn log_preference(&mut self, done: PreferenceSet) -> LoggedChange {
        let field = match done.before.kind {
            PreferenceKind::FavouredClub => "preference.favouredClub",
            PreferenceKind::DislikedClub => "preference.dislikedClub",
            PreferenceKind::FavouredPerson => "preference.favouredPerson",
            PreferenceKind::DislikedPerson => "preference.dislikedPerson",
        };
        // The person's or club's name, before and after: the game's records name only clubs.
        let mut named: Vec<Preference> = std::iter::once(done.before.clone()).chain(done.after.clone()).collect();
        self.name_preferences(&mut named);
        let end = |preference: Option<&Preference>| {
            preference.map(|preference| TieEnd {
                name: preference.name.clone().unwrap_or_else(|| preference.target_uid.to_string()),
                rule: None,
                value: Some(i64::from(preference.strength)),
            })
        };
        let change = Change {
            entity: done.entity,
            uid: done.person,
            field: field.to_owned(),
            old: i64::from(done.before.strength),
            new: done.after.as_ref().map_or(0, |after| i64::from(after.strength)),
        };
        let name = match done.entity {
            Entity::Staff => self.staff.get(done.person).map_or_else(|| done.person.to_string(), |m| m.name.clone()),
            _ => self.player_name(done.person),
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name,
            change,
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: None,
            captaincy: None,
            tie: Some(TieChange { from: end(named.first()), to: end(named.get(1)) }),
            clause: None,
            undo: Some(Undo::Preference(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a change to a person's languages just written, as a change of his field `language` from one level to the
    /// other (0 for one taken out), with the language and its level before and after.
    fn log_language(&mut self, done: LanguageSet) -> LoggedChange {
        let end = |language: Option<&Language>| {
            language.map(|language| TieEnd {
                name: language.name.clone().unwrap_or_else(|| "-".to_owned()),
                rule: None,
                value: Some(i64::from(language.level)),
            })
        };
        let change = Change {
            entity: done.entity,
            uid: done.person,
            field: "language".to_owned(),
            old: i64::from(done.before.level),
            new: done.after.as_ref().map_or(0, |after| i64::from(after.level)),
        };
        let name = match done.entity {
            Entity::Staff => self.staff.get(done.person).map_or_else(|| done.person.to_string(), |m| m.name.clone()),
            _ => self.player_name(done.person),
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name,
            change,
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: None,
            captaincy: None,
            tie: Some(TieChange { from: end(Some(&done.before)), to: end(done.after.as_ref()) }),
            clause: None,
            undo: Some(Undo::Language(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a change to one of a player's injuries just written, as a change of his field `injury` from the days it
    /// lasted at the most to the days it lasts now (0 for one taken out), with the injury's name.
    fn log_injury(&mut self, done: InjurySet) -> LoggedChange {
        let end = |injury: Option<&Injury>| {
            injury.map(|injury| TieEnd {
                name: injury.name.clone().unwrap_or_else(|| "-".to_owned()),
                rule: None,
                value: Some(i64::from(injury.days)),
            })
        };
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "injury".to_owned(),
            old: i64::from(done.before.days),
            new: done.after.as_ref().map_or(0, |after| i64::from(after.days)),
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(done.player),
            change,
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: None,
            captaincy: None,
            tie: Some(TieChange { from: end(Some(&done.before)), to: end(done.after.as_ref()) }),
            clause: None,
            undo: Some(Undo::Injury(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs raising a player's familiarity with his club just written, as a change of his `cohesion` from what it was
    /// to the most.
    fn log_cohesion(&mut self, done: Cohered, batch: Option<u32>) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "cohesion".to_owned(),
            old: i64::from(done.before),
            new: i64::from(fmlens_core::MOST_FAMILIARITY),
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(done.player),
            change,
            undone_at: None,
            earlier_game: false,
            batch,
            moved: None,
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Cohesion(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a player the game made fully familiar with his team's tactic, as a change of his `tactics` from how
    /// familiar he was with the parts it changed to how familiar he is now, as percentages.
    fn log_tactics(&mut self, done: fmlens_core::RaisedTactics, batch: Option<u32>) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "tactics".to_owned(),
            old: i64::from(done.before),
            new: i64::from(done.after),
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(done.player),
            change,
            undone_at: None,
            earlier_game: false,
            batch,
            moved: None,
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Tactics(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs keeping a player from retiring just written, as a change of his `retirement` from the date he was to retire
    /// on (0 when the game had planned none) to 0.
    fn log_retirement(&mut self, done: RetirementSet) -> LoggedChange {
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "retirement".to_owned(),
            old: done.date.map_or(0, FmDate::to_number),
            new: 0,
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(done.player),
            change,
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: None,
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Retirement(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a change to a player's ties just written, as a change of his field `tie.nationality`,
    /// `tie.trainedInNation` or `tie.trainedAtClub` from one nation's or club's UID to the other's (0 for none).
    fn log_tie(&mut self, done: RelationSet) -> LoggedChange {
        let tie = done.before.as_ref().or(done.after.as_ref()).map_or(Tie::Nationality, |relation| relation.tie);
        let field = match tie {
            Tie::Nationality => "tie.nationality",
            Tie::TrainedInNation => "tie.trainedInNation",
            Tie::TrainedAtClub => "tie.trainedAtClub",
        };
        let end = |relation: &Option<fmlens_core::Relation>| {
            relation.as_ref().map(|relation| TieEnd {
                name: relation.name.clone().unwrap_or_else(|| relation.target_uid.to_string()),
                rule: relation.rule,
                value: None,
            })
        };
        let uid = |relation: &Option<fmlens_core::Relation>| relation.as_ref().map_or(0, |r| i64::from(r.target_uid));
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: field.to_owned(),
            old: uid(&done.before),
            new: uid(&done.after),
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(done.player),
            change,
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: None,
            captaincy: None,
            tie: Some(TieChange { from: end(&done.before), to: end(&done.after) }),
            clause: None,
            undo: Some(Undo::Tie(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a change to a player's contract clauses just written, as a change of his field `clause` from one amount to
    /// the other (0 for none, or for a clause added or taken out), with the clause before and after.
    fn log_clause(&mut self, done: ClauseSet) -> LoggedChange {
        let amount = |clause: &Option<Clause>| clause.as_ref().and_then(|c| c.amount).map_or(0, i64::from);
        let change = Change {
            entity: Entity::Player,
            uid: done.player,
            field: "clause".to_owned(),
            old: amount(&done.before),
            new: amount(&done.after),
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(done.player),
            change,
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: None,
            captaincy: None,
            tie: None,
            clause: Some(ClauseChange { from: done.before.clone(), to: done.after.clone() }),
            undo: Some(Undo::Clause(done)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// The nation with the UID `uid`, among the nations of the people in the lists.
    fn nation(&self, uid: u32) -> Result<Nation, Failure> {
        self.nations()
            .into_iter()
            .find(|nation| nation.uid == Some(uid))
            .ok_or_else(|| Failure::new("app.notFound", format!("No nation with UID {uid}")).with("uid", uid))
    }

    /// Works out moving the member of staff `uid` to the club `club`.
    fn plan_staff_move(&self, uid: u32, club: u32) -> Result<StaffPlan, Failure> {
        let member = self.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?;
        let to = self.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
        Ok(self.session.plan_staff_move(member, to)?)
    }

    /// Works out giving the member of staff `uid` the job `job` at his club.
    fn plan_staff_job(&self, uid: u32, job: u8) -> Result<StaffPlan, Failure> {
        let member = self.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?;
        Ok(self.session.plan_staff_job(member, job)?)
    }

    /// Logs a member of staff's move, as a change of his `club`, or his new job, as a change of `contract.job`, and
    /// brings his list row up to date.
    fn log_staff(&mut self, done: StaffChange) -> LoggedChange {
        let row = self.staff.get(done.member);
        let (club, club_uid, job) = row.map_or((None, None, None), |s| (s.club.clone(), s.club_uid, s.job));
        let name = row.map_or_else(String::new, |s| s.name.clone());
        let moved = done.from_club != done.to_club;
        let (from, to) = (self.club_name(done.from_club), self.club_name(done.to_club));
        self.staff.update(done.member, |member| {
            if moved {
                member.club = Some(to.clone());
                member.club_uid = Some(done.to_club);
            }
            member.job = Some(done.job.1);
        });
        let (field, old, new) = if moved {
            ("club", i64::from(done.from_club), i64::from(done.to_club))
        } else {
            ("contract.job", i64::from(done.job.0), i64::from(done.job.1))
        };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name,
            change: Change { entity: Entity::Staff, uid: done.member, field: field.to_owned(), old, new },
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: moved.then_some(MovedClubs { from: Some(from), to: Some(to), with: None, fee: None, joins: None }),
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Staff(LoggedStaff { done, club, club_uid, job })),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Works out what the fee `fee` of moving the player from the club `from` to the club `to` does to their money:
    /// none for no fee.
    fn plan_fee(&self, from: u32, to: u32, fee: Option<i64>) -> Result<Option<FeePlan>, Failure> {
        let Some(fee) = fee.filter(|&fee| fee > 0) else {
            return Ok(None);
        };
        let buyer = self.clubs.get(to).ok_or_else(|| not_found(Entity::Club, to))?;
        let seller = self.clubs.get(from).ok_or_else(|| not_found(Entity::Club, from))?;
        Ok(Some(self.session.plan_fee(buyer, seller, fee)?))
    }

    /// Works out moving the player `uid` to the club `club` on the contract `terms`: a transfer the game makes itself,
    /// with its history and fee, where it can; else written by FM Lens.
    fn plan_move(&self, uid: u32, club: u32, terms: MoveTerms) -> Result<MoveRoute, Failure> {
        let player = self.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
        let to = self.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
        if self.session.game_actions().transfer {
            return Ok(MoveRoute::Game(self.session.plan_transfer(player, to, terms)?));
        }
        Ok(MoveRoute::Write(self.session.plan_club_move(player, to, terms, &self.human_clubs)?))
    }

    /// Works out releasing the player `uid` from his club. Where the game releases players itself, it does so at your
    /// club too, as its editor does; FM Lens writes no release there.
    fn plan_release(&self, uid: u32) -> Result<MovePlan, Failure> {
        let player = self.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
        let human_clubs: &[u32] = if self.session.game_actions().release { &[] } else { &self.human_clubs };
        Ok(self.session.plan_release(player, human_clubs)?)
    }

    /// Works out the players `uid` and `other` swapping clubs: two transfers the game makes itself, without a fee,
    /// where it can; else written by FM Lens.
    fn plan_swap(&self, uid: u32, other: u32) -> Result<SwapRoute, Failure> {
        let player = self.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
        let partner = self.players.get(other).ok_or_else(|| not_found(Entity::Player, other))?;
        if !self.session.game_actions().transfer {
            return Ok(SwapRoute::Write(self.session.plan_club_swap(player, partner, &self.human_clubs)?));
        }
        let club_of = |player: &PlayerSummary| -> Result<&fmlens_core::ClubSummary, Failure> {
            let uid = player.club_uid.ok_or(MoveError::FreeAgent)?;
            self.clubs.get(uid).ok_or_else(|| not_found(Entity::Club, uid))
        };
        let first = self.session.plan_transfer(player, club_of(partner)?, MoveTerms::default())?;
        let second = self.session.plan_transfer(partner, club_of(player)?, MoveTerms::default())?;
        let leg = |plan: &TransferPlan| (plan.player, plan.from_club, plan.to_club);
        if let Some(uid) = stale_swap_row(leg(&first), leg(&second)) {
            return Err(MoveError::Moved { uid }.into());
        }
        Ok(SwapRoute::Game(first, second))
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

    /// Logs the human manager's move, as a change of his `club` that nothing undoes, and brings his list row and that of
    /// the manager the game dismissed (`displaced`) up to date.
    fn log_manager_move(&mut self, moved: MovedManager, displaced: Option<u32>) -> LoggedChange {
        let name = self.staff.get(moved.member).map_or_else(String::new, |s| s.name.clone());
        let from = moved.from_club.map(|uid| self.club_name(uid));
        let to = self.club_name(moved.to_club);
        self.staff.update(moved.member, |member| {
            member.club = Some(to.clone());
            member.club_uid = Some(moved.to_club);
            member.job = Some(MANAGER_JOB);
        });
        // His club is the one a human manages now, and the career's.
        self.human_clubs.retain(|&uid| Some(uid) != moved.from_club);
        self.human_clubs.push(moved.to_club);
        if let Some(career) = self.career.as_mut().filter(|career| career.uid == moved.member) {
            career.club = Some(to.clone());
        }
        if let Some(uid) = displaced {
            self.staff.update(uid, |member| {
                member.club = None;
                member.club_uid = None;
                member.job = None;
            });
        }
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name,
            change: Change {
                entity: Entity::Staff,
                uid: moved.member,
                field: "club".to_owned(),
                old: moved.from_club.map_or(0, i64::from),
                new: i64::from(moved.to_club),
            },
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: Some(MovedClubs { from, to: Some(to), with: None, fee: None, joins: None }),
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Permanent),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    fn club_name(&self, uid: u32) -> String {
        self.clubs.get(uid).map_or_else(|| uid.to_string(), |club| club.name.clone())
    }

    /// Logs a move just written, as a change of the player's `club` from one club UID to the
    /// other; a swap is one change too, which names the player who went the other way.
    fn log_move(&mut self, done: ClubMove, terms: MoveTerms, paid: Vec<Paid>, fee: Option<i64>) -> LoggedChange {
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
        let before = LoggedMove { done: done.clone(), rows, paid };
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
            earlier_game: false,
            batch: None,
            moved: Some(MovedClubs { from: Some(from), to: Some(to), with, fee, joins: None }),
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(Undo::Move(before)),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.log.push(logged.clone());
        logged
    }

    /// Logs a release just written, as a change of the player's `club` from his club's UID
    /// to 0, and brings his list row up to date: no club and no contract. It is undone like a
    /// move.
    fn log_release(&mut self, done: ClubMove) -> LoggedChange {
        let rows = vec![self.row_before(done.player)];
        let (player, from_club) = (done.player, done.from_club);
        self.log_left_club(player, from_club, Undo::Move(LoggedMove { done, rows, paid: Vec::new() }))
    }

    /// Logs a release the game made, as one FM Lens writes is logged. Nothing undoes it.
    fn log_game_release(&mut self, released: GameRelease) -> LoggedChange {
        self.log_left_club(released.player, released.from_club, Undo::Permanent)
    }

    /// Logs the player `player` leaving the club `from_club` as a free agent, as a change of his `club` from its UID
    /// to 0, undone by `undo`, and brings his list row up to date: no club and no contract.
    fn log_left_club(&mut self, player: u32, from_club: u32, undo: Undo) -> LoggedChange {
        self.players.update(player, |player| {
            player.club = None;
            player.club_uid = None;
            player.contract_expires = None;
        });
        let change =
            Change { entity: Entity::Player, uid: player, field: "club".to_owned(), old: i64::from(from_club), new: 0 };
        let logged = LoggedChange {
            id: self.log.len() + 1,
            at: now_ms(),
            name: self.player_name(player),
            change,
            undone_at: None,
            earlier_game: false,
            batch: None,
            moved: Some(MovedClubs {
                from: Some(self.club_name(from_club)),
                to: None,
                with: None,
                fee: None,
                joins: None,
            }),
            captaincy: None,
            tie: None,
            clause: None,
            undo: Some(undo),
        };
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
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
        if entry.earlier_game {
            return Err(Failure::new(
                "app.earlierGame",
                "This change was made before FM was closed or loaded a save, so it can no longer be undone.",
            ));
        }
        match entry.undo {
            Some(Undo::Permanent) => {
                return Err(Failure::new("app.permanent", "This change cannot be undone."));
            }
            Some(Undo::Move(moved)) => {
                // The fee goes back first, by what it changed; if the player cannot go back, it is paid again.
                self.session.refund_fee(&moved.paid)?;
                if let Err(err) = self.session.undo_club_move(&moved.done) {
                    let _ = self.session.repay_fee(&moved.paid);
                    return Err(err.into());
                }
                for row in moved.rows {
                    self.players.update(row.uid, |player| {
                        player.club = row.club;
                        player.club_uid = row.club_uid;
                        player.contract_expires = row.contract_expires;
                    });
                }
            }
            Some(Undo::Heal(healed)) => self.session.undo_heal(&healed)?,
            Some(Undo::Injury(injury)) => self.session.undo_injury(&injury)?,
            Some(Undo::Lift(lifted)) => self.session.undo_lift_bans(&lifted)?,
            Some(Undo::Promise(closed)) => self.session.undo_close_promise(&closed)?,
            Some(Undo::Cohesion(cohered)) => self.session.undo_cohesion(&cohered)?,
            Some(Undo::Tactics(raised)) => self.session.undo_tactics(&raised)?,
            Some(Undo::Retirement(retirement)) => self.session.undo_retirement(&retirement)?,
            Some(Undo::Tie(tie)) => self.session.undo_relation(&tie)?,
            Some(Undo::Preference(preference)) => self.session.undo_preference(&preference)?,
            Some(Undo::Language(language)) => self.session.undo_language(&language)?,
            Some(Undo::Clause(clause)) => self.session.undo_clause(&clause)?,
            Some(Undo::Staff(logged)) => {
                self.session.undo_staff_change(&logged.done)?;
                self.staff.update(logged.done.member, |member| {
                    member.club = logged.club;
                    member.club_uid = logged.club_uid;
                    member.job = logged.job;
                });
            }
            Some(Undo::Captain(captaincy)) => self.session.undo_captain(&captaincy)?,
            Some(Undo::Injured(added)) => {
                self.session.apply_heal(&added.undo)?;
            }
            Some(Undo::Permit(change)) => {
                let player = self.players.get(change.player).ok_or_else(|| not_found(Entity::Player, change.player))?;
                self.session.undo_work_permit(player, &change)?;
            }
            Some(Undo::Loan(started)) => {
                let player =
                    self.players.get(started.player).ok_or_else(|| not_found(Entity::Player, started.player))?;
                // Where the game ends loans at once, he goes back now; elsewhere the loan ends on the game's next day.
                if self.session.game_actions().end_loan {
                    self.session.end_loan(player, &self.human_clubs)?;
                    let club = self.club_name(started.from_club);
                    self.players.update(started.player, |player| {
                        player.club = Some(club);
                        player.club_uid = Some(started.from_club);
                    });
                } else {
                    self.session.end_loan_today(player)?;
                }
            }
            Some(Undo::LoanEnded(ended)) => {
                let player = self.players.get(ended.player).ok_or_else(|| not_found(Entity::Player, ended.player))?;
                let club = self.clubs.get(ended.from_club).ok_or_else(|| not_found(Entity::Club, ended.from_club))?;
                let wage = self.session.field(Entity::Player, "loan.wage")?;
                let listed = match ended.loan_listed {
                    Some(was) => Some((self.session.field(Entity::Player, "contract.loan_listed")?, was)),
                    None => None,
                };
                let target = player.target();
                self.session.restart_loan(player, club, &ended)?;
                // The game's loan has the borrower pay nothing, and its end may have put him on his club's loan
                // list: both go back as they were.
                if ended.wage != 0 {
                    let change = self.session.write_field(&target, &wage, i64::from(ended.wage))?;
                    self.pending_contract_refresh |= change.field.starts_with("contract.");
                    self.note_change(&change, change.new);
                }
                if let Some((field, was)) = listed {
                    let change = self.session.write_field(&target, &field, i64::from(was))?;
                    self.pending_contract_refresh |= change.field.starts_with("contract.");
                    self.note_change(&change, change.new);
                }
                let name = self.club_name(ended.from_club);
                self.players.update(ended.player, |player| {
                    player.club = Some(name);
                    player.club_uid = Some(ended.from_club);
                });
            }
            Some(Undo::SignedLater(agreed)) => {
                let player = self.players.get(agreed.player).ok_or_else(|| not_found(Entity::Player, agreed.player))?;
                self.session.cancel_signing(player, agreed.offer)?;
            }
            Some(Undo::Signed(signed)) => {
                let plan = self.plan_release(signed.player)?;
                self.session.apply_club_move(&plan)?;
                self.players.update(signed.player, |player| {
                    player.club = None;
                    player.club_uid = None;
                    player.contract_expires = None;
                });
            }
            None => {
                let (target, _) = self.target(entry.change.entity, entry.change.uid)?;
                self.session.revert(&target, &entry.change)?;
                self.note_change(&entry.change, entry.change.old);
            }
        }
        let logged = self.log.iter_mut().find(|logged| logged.id == id).expect("found above");
        self.pending_refresh.push((logged.change.entity, logged.change.uid));
        self.pending_contract_refresh |= logged.change.field.starts_with("contract.");
        logged.undone_at = Some(now_ms());
        Ok(logged.clone())
    }

    /// Where the player, member of staff, club, nation or official with `uid` lives in the game, and its name. A
    /// nation is found by its own UID, and only where no other nation has it.
    fn target(&self, entity: Entity, uid: u32) -> Result<(Target, String), Failure> {
        match entity {
            Entity::Player => self.players.get(uid).map(|p| (p.target(), p.name.clone())),
            Entity::Staff => self.staff.get(uid).map(|s| (s.target(), s.name.clone())),
            Entity::Club => self.clubs.get(uid).map(|c| (c.target(), c.name.clone())),
            Entity::Nation => {
                let mut found = self.known_nations().into_iter().filter(|nation| nation.uid == Some(uid));
                match (found.next(), found.next()) {
                    (Some(nation), None) => nation.target().map(|target| (target, nation.name)),
                    _ => None,
                }
            }
            Entity::Official => match self.officials.as_ref() {
                Some(index) => index.get(uid).map(|o| (o.target(), o.name.clone())),
                // Not listed yet on this connection: read them.
                None => {
                    let officials = self.session.officials().unwrap_or_default();
                    officials.into_iter().find(|o| o.uid == uid).map(|o| (o.target(), o.name))
                }
            },
        }
        .ok_or_else(|| not_found(entity, uid))
    }

    /// Keeps the balance of every frozen club and the attributes of every frozen player from getting worse: what the
    /// game took is put back, and what it gave raises what they are held at. These writes are not logged; unfreezing
    /// ends them.
    fn hold_frozen(&mut self) {
        self.hold_money();
        self.hold_attributes();
        self.hold_staff_attributes();
    }

    fn hold_money(&mut self) {
        let Ok(field) = self.session.field(Entity::Club, "finance.balance") else {
            return;
        };
        for (&uid, floor) in self.frozen.money.iter_mut() {
            let Some(target) = self.clubs.get(uid).map(|club| club.target()) else {
                continue;
            };
            match self.session.read_field(&target, &field) {
                Ok(now) if now < *floor => {
                    // Only while the game still holds what was read: a day it is working out is left to it.
                    let held = self.session.write_field_if(&target, &field, now, *floor);
                    log_refused(&mut self.frozen.refused, &target, held.err());
                }
                Ok(now) => *floor = now,
                Err(err) => log_refused(&mut self.frozen.refused, &target, Some(err)),
            }
        }
    }

    fn hold_attributes(&mut self) {
        if self.frozen.attributes.is_empty() {
            return;
        }
        let fields = self.attribute_fields();
        for (&uid, held) in self.frozen.attributes.iter_mut() {
            let Some(target) = self.players.get(uid).map(|player| player.target()) else {
                continue;
            };
            let values = match self.session.read_fields(&target, &fields) {
                Ok(values) => values,
                Err(err) => {
                    log_refused(&mut self.frozen.refused, &target, Some(err));
                    continue;
                }
            };
            for (field, now) in fields.iter().zip(values) {
                let (Some(now), Some(limit)) = (now, held.get_mut(&field.key)) else {
                    continue;
                };
                let worse = if LOWER_IS_BETTER.contains(&field.key.as_str()) { now > *limit } else { now < *limit };
                if worse {
                    // Only while the game still holds what was read: a day it is working out is left to it.
                    let written = self.session.write_field_if(&target, field, now, *limit);
                    log_refused(&mut self.frozen.refused, &target, written.err());
                } else {
                    *limit = now;
                }
            }
        }
    }

    /// The attributes of players the editor can change.
    fn attribute_fields(&self) -> Vec<Field> {
        let fields = self.session.fields(Entity::Player).into_iter();
        fields.filter(|field| field.key.starts_with("attribute.")).collect()
    }

    /// The attributes of staff the editor can change.
    fn staff_attribute_fields(&self) -> Vec<Field> {
        let fields = self.session.fields(Entity::Staff).into_iter();
        fields.filter(|field| field.key.starts_with("attribute.")).collect()
    }

    fn hold_staff_attributes(&mut self) {
        if self.frozen.staff_attributes.is_empty() {
            return;
        }
        let fields = self.staff_attribute_fields();
        for (&uid, held) in self.frozen.staff_attributes.iter_mut() {
            let Some(target) = self.staff.get(uid).map(|staff| staff.target()) else {
                continue;
            };
            let values = match self.session.read_fields(&target, &fields) {
                Ok(values) => values,
                Err(err) => {
                    log_refused(&mut self.frozen.refused, &target, Some(err));
                    continue;
                }
            };
            for (field, now) in fields.iter().zip(values) {
                let (Some(now), Some(limit)) = (now, held.get_mut(&field.key)) else {
                    continue;
                };
                if now < *limit {
                    let written = self.session.write_field_if(&target, field, now, *limit);
                    log_refused(&mut self.frozen.refused, &target, written.err());
                } else {
                    *limit = now;
                }
            }
        }
    }

    /// Every attribute of a player at its best: 20, or 1 where lower is better.
    /// Every attribute at `level` (1 to 20); where lower is better (injury proneness, dirtiness) at the same quality the
    /// other way round, 21 - `level`. At 20 this is every attribute at its best.
    fn attributes_at(&self, level: i64) -> Vec<(Field, Operation)> {
        self.attribute_fields()
            .into_iter()
            .map(|field| {
                let shown = if LOWER_IS_BETTER.contains(&field.key.as_str()) { 21 - level } else { level };
                let value = field.scale.stored(shown);
                (field, Operation::Set { value })
            })
            .collect()
    }

    /// Senior stadiums of the loaded clubs, read once. Empty when this build has no stadium layout.
    fn stadium_index(&mut self) -> &SearchIndex<StadiumSummary> {
        if self.stadiums.is_none() {
            let rows = read_stadiums(&self.session.process, &self.session.layout, self.clubs.iter());
            self.stadiums = Some(SearchIndex::new(rows));
        }
        self.stadiums.as_ref().expect("stadium index just stored")
    }

    /// The match officials, read once. Empty when this build's profile does not place them.
    fn official_index(&mut self) -> Result<&SearchIndex<OfficialSummary>, Failure> {
        if self.officials.is_none() {
            self.officials = Some(SearchIndex::new(self.session.officials()?));
        }
        Ok(self.officials.as_ref().expect("official index just stored"))
    }

    /// The competitions, read once. Empty when this build's profile does not place them.
    fn competition_index(&mut self) -> Result<&SearchIndex<CompetitionSummary>, Failure> {
        if self.competitions.is_none() {
            self.competitions = Some(SearchIndex::new(self.session.competitions()?));
        }
        Ok(self.competitions.as_ref().expect("competition index just stored"))
    }

    /// The awards, read once. Empty when this build's profile does not place them.
    fn award_index(&mut self) -> Result<&SearchIndex<AwardSummary>, Failure> {
        if self.awards.is_none() {
            self.awards = Some(SearchIndex::new(self.session.awards()?));
        }
        Ok(self.awards.as_ref().expect("award index just stored"))
    }

    /// The nations of the players and staff in the lists.
    fn nations(&self) -> Vec<Nation> {
        nations(self.people_nations())
    }

    /// The (nation address, name, UID) of each player and member of staff in the lists.
    fn people_nations(&self) -> impl Iterator<Item = (u64, Option<&str>, Option<u32>)> {
        let players = self.players.iter().map(|p| (p.nation_address, p.nation.as_deref(), p.nation_uid));
        let staff = self.staff.iter().map(|s| (s.nation_address, s.nation.as_deref(), s.nation_uid));
        players.chain(staff)
    }

    /// The nations list: those of the people in the lists and those of the competitions, which reach the nations no
    /// one in the save is from. Just the people's where the competitions cannot be read.
    fn listed_nations(&mut self) -> Vec<Nation> {
        // Read once; a nation's own fields are found among these too (see `target`).
        let _ = self.competition_index();
        self.known_nations()
    }

    /// The nations of the people in the lists, and of the competitions once they are read.
    fn known_nations(&self) -> Vec<Nation> {
        let competitions = self
            .competitions
            .iter()
            .flat_map(|index| index.iter())
            .map(|c| (c.nation_address, c.nation.as_deref(), c.nation_uid));
        nations(self.people_nations().chain(competitions))
    }

    /// Keeps the list rows in step with `value`, just written to the field `change` names.
    fn note_change(&mut self, change: &Change, value: i64) {
        self.frozen.note(change, value);
        // A new nation: its name and flag, as the rows of its other people have them.
        let nation = (change.field == "nation")
            .then(|| self.nations().into_iter().find(|n| n.address == value as u64))
            .flatten();
        // The rows keep attributes as FM shows them (1–20), for the lists' filters.
        let value = if change.field.starts_with("attribute.") {
            self.session.field(change.entity, &change.field).map_or(value, |field| field.scale.shown(value))
        } else {
            value
        };
        let today = self.session.game_date();
        match change.entity {
            Entity::Player => self.players.update(change.uid, |p| {
                p.note_change(&change.field, value);
                if change.field == "date_of_birth" {
                    p.note_birth(today);
                }
                if let Some(nation) = nation {
                    (p.nation, p.nation_uid) = (Some(nation.name), nation.uid);
                }
            }),
            Entity::Staff => self.staff.update(change.uid, |s| {
                s.note_change(&change.field, value);
                if let Some(nation) = nation {
                    (s.nation, s.nation_uid) = (Some(nation.name), nation.uid);
                }
            }),
            Entity::Club => self.clubs.update(change.uid, |c| c.note_change(&change.field, value)),
            // The nations list shows only names, which no edit changes.
            Entity::Nation => false,
            Entity::Official => self
                .officials
                .as_mut()
                .is_some_and(|index| index.update(change.uid, |o| o.note_change(&change.field, value, today))),
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
    /// Written to a game FM has since closed or loaded a save into: still listed, but no longer undone.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    earlier_game: bool,
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
    /// For a change to a player's ties: the nations or clubs, and their homegrown rules.
    #[serde(skip_serializing_if = "Option::is_none")]
    tie: Option<TieChange>,
    /// For a change to a player's contract clauses: the clause before and after.
    #[serde(skip_serializing_if = "Option::is_none")]
    clause: Option<ClauseChange>,
    /// For a move, healing, lifting bans, a captaincy, a tie or a clause: what undoing it takes. Other changes write
    /// back `old`. The app is told only of a change nothing undoes, as `permanent: true`.
    #[serde(rename = "permanent", serialize_with = "serialize_permanent", skip_serializing_if = "is_undoable")]
    undo: Option<Undo>,
}

/// Whether undoing a change can be tried: all but a [`Undo::Permanent`] one.
fn is_undoable(undo: &Option<Undo>) -> bool {
    !matches!(undo, Some(Undo::Permanent))
}

/// A [`Undo::Permanent`] change's `undo`, as the app is told of it.
fn serialize_permanent<S: serde::Serializer>(_: &Option<Undo>, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_bool(true)
}

/// What undoing a change takes when writing back its old value is not enough.
#[derive(Clone)]
enum Undo {
    Move(LoggedMove),
    Heal(Healed),
    /// One injury made longer or shorter, or taken out of the list.
    Injury(InjurySet),
    Lift(Lifted),
    Promise(PromiseClosed),
    Cohesion(Cohered),
    Retirement(RetirementSet),
    Tie(RelationSet),
    Preference(PreferenceSet),
    Language(LanguageSet),
    Clause(ClauseSet),
    Captain(CaptainSet),
    Staff(LoggedStaff),
    /// An injury the game gave: undone by healing it.
    Injured(AddedInjury),
    /// A work permit the game gave or took away: undone by having it take the permit away or give it back.
    Permit(PermitChange),
    /// A loan the game started: undone by having the game end it, or where it cannot, end today, which the game does
    /// on its next day.
    Loan(StartedLoan),
    /// A loan the game ended: undone by having it start the loan again, until the same day.
    LoanEnded(EndedLoan),
    /// A free agent the game signed: undone by releasing him again.
    Signed(SignedPlayer),
    /// A free agent the game agreed to sign on a later day: undone by having it cancel the signing.
    SignedLater(AgreedSigning),
    /// A player the game made fully familiar with his team's tactic: undone by putting his familiarity back.
    Tactics(fmlens_core::RaisedTactics),
    /// A change nothing undoes: a transfer the game made, or one agreed for a later day the game cancelled, which only
    /// the clubs' own negotiation agrees again.
    Permanent,
}

/// A member of staff's move or new job as the log keeps it: the writes to undo, and what his list row said before.
#[derive(Clone)]
struct LoggedStaff {
    done: StaffChange,
    club: Option<String>,
    club_uid: Option<u32>,
    job: Option<u8>,
}

/// A tie before and after a change: none before for one added, none after for one taken out.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TieChange {
    from: Option<TieEnd>,
    to: Option<TieEnd>,
}

/// The nation or club of a tie, and its homegrown rule for a training; the person or club of a preference, and its
/// strength; or a language, and its level.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TieEnd {
    name: String,
    rule: Option<u8>,
    /// A preference's strength, or a language's level.
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<i64>,
}

/// A contract clause before and after a change: none before for one added, none after for one taken out.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClauseChange {
    from: Option<Clause>,
    to: Option<Clause>,
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
    jadedness: i16,
    morale: u8,
    injuries: usize,
    bans: usize,
    unhappy: bool,
}

/// What a team-wide action does to every player of the team.
#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
enum TeamAction {
    /// Heals every current injury.
    Heal,
    /// Lifts every current ban.
    LiftBans,
    /// Morale to the top.
    MaxMorale,
    /// Every reason to be unhappy gone, as the profile's Remove all does for one player.
    RemoveUnhappiness,
    /// Energy and match sharpness to 100%.
    Refresh,
    /// Every attribute to its best: 20, or 1 where lower is better.
    MaxAttributes,
    /// Every player fully familiar with the club, as the game's Max cohesion does; experimental. Only players the game
    /// has given a familiarity with the club already are raised.
    MaxCohesion,
    /// Every player fully familiar with the team's tactic, as the game's own editor does it.
    MaxTactics,
}

#[derive(Clone, Serialize)]
struct MovedClubs {
    /// None for a free agent's signing, before which he had no club.
    #[serde(skip_serializing_if = "Option::is_none")]
    from: Option<String>,
    /// None for a release, after which he has no club.
    #[serde(skip_serializing_if = "Option::is_none")]
    to: Option<String>,
    /// In a swap, the player who went the other way.
    #[serde(skip_serializing_if = "Option::is_none")]
    with: Option<String>,
    /// The fee the buying club paid the selling one, in pounds, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    fee: Option<i64>,
    /// For a signing the game agreed for a later day, that day, as a number like 20270701.
    #[serde(skip_serializing_if = "Option::is_none")]
    joins: Option<i64>,
}

/// A move as the log keeps it: the writes to undo, and what the list rows of the players it
/// moved said before.
#[derive(Clone)]
struct LoggedMove {
    done: ClubMove,
    rows: Vec<RowBefore>,
    /// What the fee changed, if one was paid.
    paid: Vec<Paid>,
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
    /// None for the human manager without a job.
    from: Option<ClubName>,
    to: ClubName,
    /// What the fee does to the two clubs' money, when one is to be paid.
    #[serde(skip_serializing_if = "Option::is_none")]
    fee: Option<FeePlan>,
    /// For the human manager's move, the name of the club's manager, whom the game dismisses.
    #[serde(skip_serializing_if = "Option::is_none")]
    displaced: Option<String>,
    /// The game makes the move itself, and nothing undoes it.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    permanent: bool,
}

/// How a move to another club is made: written by FM Lens, or made by the game itself.
enum MoveRoute {
    Write(MovePlan),
    Game(TransferPlan),
}

/// Of the two transfers of a swap, each `(player, club he leaves, club he joins)`, the player whose list row named a club
/// the game no longer has him at: each joins the club the other's row names, which must be the one the other leaves.
fn stale_swap_row(first: (u32, u32, u32), second: (u32, u32, u32)) -> Option<u32> {
    if first.2 != second.1 {
        Some(second.0)
    } else if second.2 != first.1 {
        Some(first.0)
    } else {
        None
    }
}

/// How two players swap clubs: written by FM Lens, or as two transfers the game makes itself, the first player's
/// first.
enum SwapRoute {
    Write(MovePlan),
    Game(TransferPlan, TransferPlan),
}

impl MoveRoute {
    /// The UIDs of the club the player leaves and the club he joins.
    fn clubs(&self) -> (u32, u32) {
        match self {
            MoveRoute::Write(plan) => (plan.from_club, plan.to_club),
            MoveRoute::Game(plan) => (plan.from_club, plan.to_club),
        }
    }
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
    expected: i64,
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

/// The connected game, and the change log of the one before it while no game is connected (FM was closed or
/// restarted): the next connection lists those changes.
#[derive(Default)]
struct AppState(Mutex<Option<Connection>>, Mutex<Vec<LoggedChange>>);

/// Logs, once each, the holds of frozen values the editor refused, and why. A conflict is not one: the game was
/// working out a day, and the next look puts the value back.
fn log_refused(logged: &mut BTreeSet<String>, target: &Target, err: Option<EditError>) {
    let Some(err) = err.filter(|err| !matches!(err, EditError::Conflict { .. })) else {
        return;
    };
    let line = format!("FM Lens could not hold the {} with id {}: {err}", target.entity, target.uid);
    if logged.insert(line.clone()) {
        eprintln!("{line}");
    }
}

/// Whether a game read again holds the same objects: `players` gives each player read before, at the address he had
/// then and the one he has now if he is still there. Loading a save makes every object afresh; playing on adds some
/// players, removes others and gives a few of those still there a new place (one who becomes a player-coach, say), so
/// nearly all of them must be where they were, and some must be there.
fn same_objects(players: impl IntoIterator<Item = (Target, Option<Target>)>) -> bool {
    let (mut kept, mut moved) = (0_usize, 0_usize);
    for (then, now) in players {
        match now {
            Some(now) if now == then => kept += 1,
            Some(_) => moved += 1,
            None => {}
        }
    }
    // Fewer than one in ten moved.
    kept > 0 && moved * 10 < kept + moved
}

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

/// Whether this copy of the app can update itself from FM Lens's own releases (the updater's endpoint in
/// tauri.conf.json): download a new version, check its signature and put it in place. The macOS app run from its
/// bundle, unless macOS runs it from a read-only copy, as it does an app opened where it was downloaded (App
/// Translocation), and the Windows app its installer put in place, which leaves its uninstaller beside it. A
/// development build, and a bare FM Lens.exe, open the website's download page instead.
#[tauri::command]
fn can_self_update() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    if cfg!(debug_assertions) {
        false
    } else if cfg!(target_os = "macos") {
        app_bundle(&exe).is_some_and(|bundle| !bundle.to_string_lossy().contains("/AppTranslocation/"))
    } else {
        cfg!(windows) && exe.with_file_name("uninstall.exe").is_file()
    }
}

/// Whether this is a debug build. The colophon tags it DEBUG, so that it is never taken for a release: it cannot update
/// itself (see `can_self_update`).
#[tauri::command]
fn debug_build() -> bool {
    cfg!(debug_assertions)
}

/// The system the app runs on, for a problem report (see report.ts): "macOS 27.2, Apple Silicon" or "Windows 11 Pro
/// 24H2 (26100), x64". When the system's version cannot be read, its name and the processor's.
#[tauri::command]
fn system_version() -> String {
    let processor = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "Apple Silicon",
        ("macos", "x86_64") => "Intel",
        (_, "x86_64") => "x64",
        (_, "aarch64") => "Arm64",
        (_, other) => other,
    };
    #[cfg(windows)]
    let system = windows_version();
    #[cfg(not(windows))]
    let system = macos_version().map(|version| format!("macOS {version}"));
    match system {
        Some(system) => format!("{system}, {processor}"),
        None => format!("{}, {processor}", std::env::consts::OS),
    }
}

/// Windows's edition, release and build, "Windows 11 Pro 24H2 (26100)", from the registry.
#[cfg(windows)]
fn windows_version() -> Option<String> {
    let name = windows_version_text("ProductName")?;
    let build = windows_version_text("CurrentBuildNumber")?;
    // Windows 11 still names itself Windows 10 there; its builds start at 22000.
    let name = match name.strip_prefix("Windows 10") {
        Some(edition) if build.parse::<u32>().is_ok_and(|number| number >= 22000) => format!("Windows 11{edition}"),
        _ => name,
    };
    Some(match windows_version_text("DisplayVersion") {
        Some(release) => format!("{name} {release} ({build})"),
        None => format!("{name} ({build})"),
    })
}

/// The text `value` of `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion`; none when it is missing,
/// empty or longer than 255 characters.
#[cfg(windows)]
fn windows_version_text(value: &str) -> Option<String> {
    use windows_sys::Win32::System::Registry::{HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RegGetValueW};

    let wide = |text: &str| text.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let key = wide(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
    let value = wide(value);
    let mut text = [0u16; 256];
    let mut bytes = std::mem::size_of_val(&text) as u32;
    // SAFETY: both names end in a nul, and `bytes` is the size of `text`, which RegGetValueW writes no further than.
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            key.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            text.as_mut_ptr().cast(),
            &mut bytes,
        )
    };
    if status != 0 {
        return None;
    }
    let length = (bytes as usize / 2).min(text.len());
    let text = String::from_utf16_lossy(&text[..length]);
    let text = text.trim_end_matches('\0').trim();
    (!text.is_empty()).then(|| text.to_owned())
}

/// macOS's version, "27.2", from the file macOS keeps it in.
#[cfg(not(windows))]
fn macos_version() -> Option<String> {
    let plist = std::fs::read_to_string("/System/Library/CoreServices/SystemVersion.plist").ok()?;
    let (_, after) = plist.split_once("<key>ProductVersion</key>")?;
    let (_, value) = after.split_once("<string>")?;
    let (version, _) = value.split_once("</string>")?;
    Some(version.trim().to_owned())
}

/// The macOS app bundle the executable `exe` is in (`FM Lens.app/Contents/MacOS/FM Lens`); none for a
/// development build, which runs from the target folder.
fn app_bundle(exe: &Path) -> Option<&Path> {
    let macos = exe.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    let inside = macos.file_name()? == "MacOS" && contents.file_name()? == "Contents" && bundle.extension()? == "app";
    inside.then_some(bundle)
}

/// Starts the app again: on macOS, once an update has put the new version in place of this one, so that it runs. On
/// Windows the update's installer starts the new version itself (see app/src/update.ts).
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
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
    /// macOS: whether the game loads the bridge, without which the app cannot reach it.
    bridge: Option<bridge::BridgeInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectedGame {
    pid: u32,
    info: Option<GameInfo>,
    plugin_loaded: bool,
    error: Option<Failure>,
}

/// Who the user manages in the loaded career: what FM names a save after by default.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Career {
    uid: u32,
    manager: String,
    club: Option<String>,
    club_uid: Option<u32>,
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
    /// Whether this is a writable, fingerprinted connection to the current career.
    editable: bool,
    /// Whether the system let the app open the game for writing.
    writable: bool,
    /// Whether the editor has a profile for this build of the game: one it was checked with.
    known_build: bool,
    /// What the checks the editor makes before it writes found on this game.
    health: Health,
    /// The human manager and club of the loaded career.
    career: Option<Career>,
    /// The edits the game can make itself on this build, through the bridge.
    game_actions: GameActions,
    /// Only from `connect`: what it froze again of what was frozen in this save before, when there was any.
    #[serde(skip_serializing_if = "Option::is_none")]
    refrozen: Option<Refrozen>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReloadInfo {
    editable: bool,
    writable: bool,
    known_build: bool,
    players: usize,
    staff: usize,
    clubs: usize,
    game_date: Option<FmDate>,
    /// The checks, run again with the game as it is now.
    health: Health,
    /// The human manager and club of the career loaded now.
    career: Option<Career>,
    /// Only when the game has loaded another save since: what was frozen in that one before and is frozen again,
    /// when there was any. What was frozen in the save before is not held in this one.
    #[serde(skip_serializing_if = "Option::is_none")]
    refrozen: Option<Refrozen>,
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
    offset: usize,
    keep: impl Fn(&T) -> bool,
    sort: impl FnOnce(&mut Vec<&T>),
) -> Page<T> {
    let mut hits = index.search(query);
    hits.retain(|item| keep(item));
    sort(&mut hits);
    Page { total: hits.len(), rows: hits.into_iter().skip(offset).take(limit.min(200)).cloned().collect() }
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

coded_failures!(EditError, MoveError, SessionError, fmlens_mem::Error);

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

/// The game is running but no career is loaded in it (FM's main menu, say): nothing to read or edit yet.
fn no_career() -> Failure {
    Failure::new("session.noCareer", "No career is loaded in FM27. Load a save, then connect.")
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
async fn detect_game(app: tauri::AppHandle) -> Result<Detection, Failure> {
    let running = find_processes(GAME_EXE)?;
    let games = running.into_iter().map(|entry| inspect(entry.pid)).collect();
    Ok(Detection { elevated: is_current_process_elevated(), games, bridge: bridge::status(&app) })
}

fn inspect(pid: u32) -> DetectedGame {
    let result = Process::open_read(pid).and_then(|process| {
        let info = GameInfo::inspect(&process)?;
        let plugin_loaded = list_modules(&process)?.iter().any(|m| m.name.eq_ignore_ascii_case(GAME_PLUGIN));
        Ok((info, plugin_loaded))
    });
    match result {
        Ok((info, plugin_loaded)) => DetectedGame { pid, info: Some(info), plugin_loaded, error: None },
        Err(err) => DetectedGame { pid, info: None, plugin_loaded: false, error: Some(err.into()) },
    }
}

/// Inspect with read access first. Unknown builds and read-only binaries remain usable
/// for scouting; only a fingerprinted build can acquire a writable handle.
fn connect_session(pid: u32) -> Result<Session, Failure> {
    let mut session = Session::connect(Process::open_read(pid)?, ArraySource::ProfileFirst)?;
    if session.known_build()
        && let Ok(process) = Process::open_read_write(pid)
    {
        session.process = process;
    }
    Ok(session)
}

/// Reads every player, member of staff and club, with editing only on a known build.
#[tauri::command]
async fn connect(state: State<'_, AppState>, file: State<'_, FrozenFile>) -> Result<ConnectionInfo, Failure> {
    let started = Instant::now();
    let path = file.0.clone();
    let (mut connection, refrozen) = tauri::async_runtime::spawn_blocking(move || -> Result<_, Failure> {
        let pid = find_game(None)?;
        let mut connection = Connection::load(connect_session(pid)?)?;
        // Without a human manager the lists are not a career the user can recognise or should edit.
        if connection.career.is_none() {
            return Err(no_career());
        }
        let refrozen = connection.restore_frozen(path.as_deref());
        Ok((connection, refrozen))
    })
    .await??;

    // The changes of the connection before: undone still in the same game, only listed from another.
    let mut guard = state.0.lock()?;
    let (log, same_game) = match guard.take() {
        Some(before) => {
            let same_game = connection.same_game_as(&before);
            (before.log, same_game)
        }
        None => (std::mem::take(&mut *state.1.lock()?), false),
    };
    connection.carry_log(log, same_game);
    let mut info = connection.info(started.elapsed().as_millis());
    info.refrozen = (!refrozen.is_empty()).then_some(refrozen);
    *guard = Some(connection);
    Ok(info)
}

/// The connection made before, if the app is still attached, without reading the game
/// again: lets the window pick it up after a reload (e.g. to change the language) with
/// the lists and the change log as they were. Once the game it was made to has quit (e.g.
/// FM was restarted), drops it and says so; the next connection lists its changes.
#[tauri::command]
fn current_connection(state: State<'_, AppState>) -> Result<Option<ConnectionInfo>, Failure> {
    let mut guard = state.0.lock()?;
    if let Some(connection) = guard.as_ref()
        && let Err(quit @ SessionError::NoSuchProcess(_)) = find_game(Some(connection.session.process.pid()))
    {
        if let Some(gone) = guard.take() {
            *state.1.lock()? = gone.log;
        }
        return Err(quit.into());
    }
    Ok(guard.as_ref().map(|connection| connection.info(0)))
}

/// Kept for older clients; never allows an unknown fingerprint to bypass the guard.
#[tauri::command]
fn allow_editing(state: State<'_, AppState>) -> Result<ConnectionInfo, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if !connection.session.process.can_write() {
        return Err(Failure::new("memory.readOnly", "This build cannot write to the game."));
    }
    if !connection.session.known_build() {
        return Err(Failure::new("memory.unknownBuild", "This game build has not been validated for editing."));
    }
    Ok(connection.info(0))
}

/// Reads again the game of the process `pid`, as connecting does.
fn load_again(pid: u32) -> Result<Connection, Failure> {
    // A game that has quit says so plainly, rather than as whatever opening its process gives.
    let pid = find_game(Some(pid))?;
    // Loading a different career replaces the arrays and cached class identities.
    let connection = Connection::load(connect_session(pid)?)?;
    if connection.career.is_none() {
        return Err(no_career());
    }
    Ok(connection)
}

/// Reads the game again once FM has moved its lists, which stops every write, so that what is frozen stays held: as
/// Reload does, without waiting for the window, which is told as it is of a Reload. Left alone when the connection
/// was read again or let go meanwhile.
fn read_again_for_freezes(app: &tauri::AppHandle, pid: u32) -> Result<(), Failure> {
    let path = app.state::<FrozenFile>().0.clone();
    let mut connection = load_again(pid)?;
    let state = app.state::<AppState>();
    let mut guard = state.0.lock()?;
    let Some(old) = guard.as_mut().filter(|old| old.session.process.pid() == pid && old.stale()) else {
        return Ok(());
    };
    let (refrozen, same_game) = connection.take_frozen(old, path.as_deref());
    connection.carry_log(std::mem::take(&mut old.log), same_game);
    eprintln!("FM Lens read the game again after FM moved its lists (same game: {same_game}).");
    connection.hold_frozen();
    let info = connection.reload_info(refrozen);
    *guard = Some(connection);
    drop(guard);
    if let Err(err) = app.emit(READ_AGAIN_EVENT, info) {
        eprintln!("FM Lens could not tell the window the game was read again: {err}");
    }
    Ok(())
}

/// Reads everything again, e.g. after the game has moved on. Drops the connection when that fails. What is frozen
/// stays frozen, unless the game has loaded another save: then what was frozen in that one before is frozen instead.
#[tauri::command]
async fn reload(state: State<'_, AppState>, file: State<'_, FrozenFile>) -> Result<ReloadInfo, Failure> {
    let mut old = state.0.lock()?.take().ok_or_else(not_connected)?;
    // Kept apart while the game is read, so that a reload that fails loses no change.
    let log = std::mem::take(&mut old.log);
    let path = file.0.clone();
    let loaded = tauri::async_runtime::spawn_blocking(move || -> Result<_, Failure> {
        let mut connection = load_again(old.session.process.pid())?;
        let (refrozen, same_game) = connection.take_frozen(&mut old, path.as_deref());
        Ok((connection, refrozen, same_game))
    })
    .await
    .map_err(Failure::from)
    .and_then(|loaded| loaded);
    let (mut connection, refrozen, same_game) = match loaded {
        Ok(loaded) => loaded,
        Err(err) => {
            // The connection is dropped; the next one lists its changes.
            *state.1.lock()? = log;
            return Err(err);
        }
    };
    // Old addresses must never be used to undo changes in another game: there they are only listed.
    connection.carry_log(log, same_game);
    let info = connection.reload_info(refrozen);
    *state.0.lock()? = Some(connection);
    Ok(info)
}

/// Players matching `query`, highest current ability first; at most `limit` rows.
#[tauri::command]
fn search_players(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    offset: Option<usize>,
    filter: Option<PlayerFilter>,
    order: Option<PlayerOrder>,
) -> Result<Page<fmlens_core::PlayerSummary>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    Ok(page(
        &connection.players,
        &query,
        limit,
        offset.unwrap_or(0),
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
    offset: Option<usize>,
    filter: Option<StaffFilter>,
) -> Result<Page<fmlens_core::StaffSummary>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    Ok(page(&connection.staff, &query, limit, offset.unwrap_or(0), |s| filter.matches(s), |_| {}))
}

/// Clubs matching `query`, highest reputation first; at most `limit` rows.
#[tauri::command]
fn search_clubs(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    offset: Option<usize>,
    filter: Option<ClubFilter>,
) -> Result<Page<fmlens_core::ClubSummary>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    Ok(page(&connection.clubs, &query, limit, offset.unwrap_or(0), |c| filter.matches(c), |_| {}))
}

/// Writes the players `query` and `filter` select, in `order`, to a new file in the exports folder as `format`: what
/// their profiles hold, with the in-game date in the file and in its name ("players-2027-01-02.csv"; a second export
/// that day "players-2027-01-02-2.csv"). Only reads memory.
#[tauri::command]
async fn export_players(
    app: tauri::AppHandle,
    query: String,
    filter: Option<PlayerFilter>,
    order: Option<PlayerOrder>,
    format: ExportFormat,
) -> Result<ExportReport, Failure> {
    tauri::async_runtime::spawn_blocking(move || -> Result<ExportReport, Failure> {
        let folder = app.state::<ExportsFolder>().0.clone();
        let folder = folder.ok_or_else(|| Failure::new("export.noFolder", "There is no folder to export to."))?;
        // macOS may ask the user before an app first writes to the Documents folder (see Info.plist), and Windows
        // Security's Controlled folder access may block it: a no is said as such, with where to change it.
        let failed = |err: std::io::Error| {
            let refused = match err.kind() {
                std::io::ErrorKind::PermissionDenied if cfg!(target_os = "macos") => Some("export.notAllowed"),
                std::io::ErrorKind::PermissionDenied if cfg!(windows) => Some("export.blocked"),
                _ => None,
            };
            match refused {
                Some(code) => Failure::new(code, format!("FM Lens may not write to {}: {err}", folder.display()))
                    .with("folder", folder.display()),
                None => Failure::new("export.failed", err.to_string()).with("reason", err),
            }
        };
        let state = app.state::<AppState>();
        let guard = state.0.lock()?;
        let connection = guard.as_ref().ok_or_else(not_connected)?;
        let filter = filter.unwrap_or_default();
        let mut hits = connection.players.search(&query);
        hits.retain(|player| filter.matches(player));
        if let Some(order) = order {
            sort_players(&mut hits, order);
        }
        let header = ExportHeader {
            writer: format!("FM Lens {}", app.package_info().version),
            game: connection.session.game.name(),
            game_date: connection.session.game_date(),
        };
        std::fs::create_dir_all(&folder).map_err(failed)?;
        let (path, file) = new_export_file(&folder, header.game_date, format.extension()).map_err(failed)?;
        let mut out = std::io::BufWriter::new(file);
        let exported = connection.session.export_players(&hits, format, &header, &mut out).map_err(failed)?;
        std::io::Write::flush(&mut out).map_err(failed)?;
        let file = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
        Ok(ExportReport { path, file, folder, players: exported.players, skipped: exported.skipped })
    })
    .await?
}

/// A new file for an export in `folder`, named after the in-game date: the first of "players-2027-01-02.json",
/// "players-2027-01-02-2.json", ... that is not there yet.
fn new_export_file(folder: &Path, date: Option<FmDate>, extension: &str) -> std::io::Result<(PathBuf, std::fs::File)> {
    let stem = date.map_or_else(
        || "players".to_owned(),
        |date| format!("players-{:04}-{:02}-{:02}", date.year, date.month, date.day),
    );
    for n in 1.. {
        let name = if n == 1 { format!("{stem}.{extension}") } else { format!("{stem}-{n}.{extension}") };
        let path = folder.join(name);
        match std::fs::File::create_new(&path) {
            Ok(file) => return Ok((path, file)),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists && n < 1000 => continue,
            Err(err) => return Err(err),
        }
    }
    unreachable!("the loop returns")
}

/// `path`, when it is a file an export wrote: the only files the app opens or shows.
fn exported_file(folder: &ExportsFolder, path: &Path) -> Result<PathBuf, Failure> {
    let inside = folder.0.as_deref().is_some_and(|folder| path.parent() == Some(folder));
    if inside && path.is_file() {
        Ok(path.to_owned())
    } else {
        Err(Failure::new("export.notExported", "That is not a file FM Lens exported."))
    }
}

/// Opens the file `path`, which an export wrote, in the app the system opens such files with (a spreadsheet, say).
#[tauri::command]
fn open_export(folder: State<'_, ExportsFolder>, path: PathBuf) -> Result<(), Failure> {
    let path = exported_file(&folder, &path)?;
    tauri_plugin_opener::open_path(path, None::<&str>)
        .map_err(|err| Failure::new("export.openFailed", err.to_string()).with("reason", err))
}

/// Shows the file `path`, which an export wrote, in its folder: in Explorer, or in Finder on macOS.
#[tauri::command]
fn show_export(folder: State<'_, ExportsFolder>, path: PathBuf) -> Result<(), Failure> {
    let path = exported_file(&folder, &path)?;
    tauri_plugin_opener::reveal_item_in_dir(path)
        .map_err(|err| Failure::new("export.openFailed", err.to_string()).with("reason", err))
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
    let mut details = connection.session.player_details(player)?.ok_or_else(data_changed)?;
    // The game keeps a club's name with the club; a person's comes from the lists.
    connection.name_preferences(&mut details.preferences);
    Ok(details)
}

/// The full profile of the member of staff with `uid`. Only reads memory.
#[tauri::command]
fn staff_details(state: State<'_, AppState>, uid: u32) -> Result<StaffDetails, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let member = connection.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?;
    let mut details = connection.session.staff_details(member)?.ok_or_else(data_changed)?;
    connection.name_preferences(&mut details.preferences);
    Ok(details)
}

/// Senior stadiums matching `query` (stadium or club name), highest capacity first; at most `limit` rows.
#[tauri::command]
fn search_stadiums(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    offset: Option<usize>,
    filter: Option<StadiumFilter>,
) -> Result<Page<StadiumSummary>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    let index = connection.stadium_index();
    Ok(page(index, &query, limit, offset.unwrap_or(0), |stadium| filter.matches(stadium), |_| {}))
}

/// Match officials matching `query` by name or UID, best current ability first; at most `limit` rows. Only reads
/// memory.
#[tauri::command]
fn search_officials(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    offset: Option<usize>,
    filter: Option<OfficialFilter>,
) -> Result<Page<OfficialSummary>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    let index = connection.official_index()?;
    Ok(page(index, &query, limit, offset.unwrap_or(0), |official| filter.matches(official), |_| {}))
}

/// Competitions matching `query` by name or UID, highest reputation first; at most `limit` rows. Only reads memory.
#[tauri::command]
fn search_competitions(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    offset: Option<usize>,
    filter: Option<CompetitionFilter>,
) -> Result<Page<CompetitionSummary>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    let index = connection.competition_index()?;
    Ok(page(index, &query, limit, offset.unwrap_or(0), |competition| filter.matches(competition), |_| {}))
}

/// The rules of the competition with the UID `uid` that FM keeps as plain numbers and yes-or-no values; `None` where
/// this build's layout does not place them. Only reads memory.
#[tauri::command]
fn competition_rules(state: State<'_, AppState>, uid: u32) -> Result<Option<Vec<CompetitionRule>>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let rules = |connection: &mut Connection| {
        let competition =
            connection.competition_index()?.get(uid).cloned().ok_or_else(|| {
                Failure::new("app.notFound", format!("No competition with UID {uid}")).with("uid", uid)
            })?;
        Ok::<_, Failure>(connection.session.competition_rules(&competition))
    };
    match rules(connection)? {
        // FM moved its competitions since the list was read: read it again, once.
        Err(MoveError::Changed { .. }) => {
            connection.competitions = None;
            Ok(rules(connection)??)
        }
        read => Ok(read?),
    }
}

/// Awards matching `query` by name, competition or UID, most prestigious first; at most `limit` rows. Only reads
/// memory.
#[tauri::command]
fn search_awards(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    offset: Option<usize>,
    filter: Option<AwardFilter>,
) -> Result<Page<AwardSummary>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    let index = connection.award_index()?;
    Ok(page(index, &query, limit, offset.unwrap_or(0), |award| filter.matches(award), |_| {}))
}

/// The nations of the list (see `Connection::listed_nations`) matching `query` by name; at most `limit` rows.
#[tauri::command]
fn search_nations(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    offset: Option<usize>,
    filter: Option<NationFilter>,
) -> Result<Page<NationSummary>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let filter = filter.unwrap_or_default();
    let nations = connection.listed_nations();
    let mut rows = nation_summaries(nations.clone());
    for (row, nation) in rows.iter_mut().zip(&nations) {
        row.continent = connection.session.nation_continent(nation.address);
    }
    Ok(page(&SearchIndex::new(rows), &query, limit, offset.unwrap_or(0), |nation| filter.matches(nation), |_| {}))
}

/// Whether this build's layout places nations' details (see `nation_details`): without them the nations list opens no
/// profile, as it would only repeat the row.
#[tauri::command]
fn nations_detailed(state: State<'_, AppState>) -> Result<bool, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(connection.session.places_nation_details())
}

/// The profile of the nation in the nations list with the row id `uid`; `None` where this build's layout does not place
/// nations' details. Only reads memory.
#[tauri::command]
fn nation_details(state: State<'_, AppState>, uid: u32) -> Result<Option<NationDetails>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let nations = connection.listed_nations();
    // The list's row ids stand in for the nations whose own UID is missing or shared, so match by row.
    let rows = nation_summaries(nations.clone());
    let nation = rows
        .iter()
        .zip(&nations)
        .find_map(|(row, nation)| (row.uid == uid).then_some(nation))
        .ok_or_else(|| Failure::new("app.notFound", format!("No nation with UID {uid}")).with("uid", uid))?;
    Ok(connection.session.nation_details(nation, &connection.players, &connection.staff)?)
}

/// The nations of the players and staff in the lists, by name: what a nation field can be set to.
#[tauri::command]
fn list_nations(state: State<'_, AppState>) -> Result<Vec<Nation>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(connection.nations())
}

/// Freezes the money of the club `club`, or unfreezes it: while the app is connected, a frozen club's balance does not
/// go down. Refused while the balance may not be written. The app remembers it for this save, and freezes it again
/// when it connects to the save another time. Returns the clubs frozen now.
#[tauri::command]
fn freeze_money(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    club: u32,
    frozen: bool,
) -> Result<Vec<u32>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if frozen {
        connection.freeze_club(club)?;
    } else {
        connection.frozen.money.remove(&club);
    }
    connection.remember(file.0.as_deref(), |save| {
        if frozen {
            save.clubs.insert(club);
        } else {
            save.clubs.remove(&club);
        }
    });
    Ok(connection.frozen.money.keys().copied().collect())
}

/// The clubs whose money is frozen.
#[tauri::command]
fn frozen_clubs(state: State<'_, AppState>) -> Result<Vec<u32>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().map(|connection| connection.frozen.money.keys().copied().collect()).unwrap_or_default())
}

/// Freezes the attributes of the player `uid`, or unfreezes them: while the app is connected, a frozen player's
/// attributes do not get worse. Refused while the attributes may not be written. The app remembers it for this save,
/// and freezes them again when it connects to the save another time. Returns the players frozen now.
#[tauri::command]
fn freeze_attributes(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    uid: u32,
    frozen: bool,
) -> Result<Vec<u32>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if frozen {
        connection.freeze_player(uid)?;
    } else {
        connection.frozen.attributes.remove(&uid);
    }
    connection.remember(file.0.as_deref(), |save| {
        if frozen {
            save.players.insert(uid);
        } else {
            save.players.remove(&uid);
        }
    });
    Ok(connection.frozen.attributes.keys().copied().collect())
}

/// The players whose attributes are frozen.
#[tauri::command]
fn frozen_players(state: State<'_, AppState>) -> Result<Vec<u32>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().map(|connection| connection.frozen.attributes.keys().copied().collect()).unwrap_or_default())
}

/// Freezes the attributes of the member of staff `uid`, or unfreezes them, as `freeze_attributes` does for a player.
/// The app remembers it for this save. Returns the staff frozen now.
#[tauri::command]
fn freeze_staff_attributes(
    state: State<'_, AppState>,
    file: State<'_, FrozenFile>,
    uid: u32,
    frozen: bool,
) -> Result<Vec<u32>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if frozen {
        connection.freeze_staff(uid)?;
    } else {
        connection.frozen.staff_attributes.remove(&uid);
    }
    connection.remember(file.0.as_deref(), |save| {
        if frozen {
            save.staff.insert(uid);
        } else {
            save.staff.remove(&uid);
        }
    });
    Ok(connection.frozen.staff_attributes.keys().copied().collect())
}

#[tauri::command]
fn frozen_staff(state: State<'_, AppState>) -> Result<Vec<u32>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard
        .as_ref()
        .map(|connection| connection.frozen.staff_attributes.keys().copied().collect())
        .unwrap_or_default())
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
/// full finances), dates the game has not set and fields whose check did not pass are
/// left out.
#[tauri::command]
fn read_values(state: State<'_, AppState>, entity: Entity, uid: u32) -> Result<BTreeMap<String, i64>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let (target, _) = connection.target(entity, uid)?;
    let fields: Vec<Field> = connection
        .session
        .fields(entity)
        .into_iter()
        .filter(|field| connection.session.field_lock(field).is_none())
        .collect();
    let values = connection.session.read_fields(&target, &fields)?;
    Ok(fields
        .into_iter()
        .zip(values)
        .filter_map(|(field, value)| {
            // A value the editor cannot name is left read-only.
            let value = value.filter(|&value| field.is_plausible(value) && field.replaceable(value))?;
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
            .and_then(|field| connection.session.write_field_if(&target, &field, edit.expected, edit.value));
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

/// Flush successful Apply/Undo notifications once per entity and refresh active views, separately from the data write.
/// A failed refresh must never turn a successful mutation into an invitation to apply it again.
#[tauri::command]
fn refresh_game_ui(state: State<'_, AppState>) -> Result<(), Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let pending = std::mem::take(&mut connection.pending_refresh);
    let contract = std::mem::take(&mut connection.pending_contract_refresh);
    let mut refresh_views = !pending.is_empty() || contract;
    let mut seen = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut note = |error: Failure| {
        // Unsupported optional refresh functions are skipped in core. A transport/protocol
        // failure is still an error; stop this flush instead of repeating it for every entity.
        let refused = error.code == "memory.bridge";
        if !errors.contains(&error.message) {
            errors.push(error.message);
        }
        refused
    };
    for (entity, uid) in pending {
        if seen.contains(&(entity, uid)) {
            continue;
        }
        seen.push((entity, uid));
        let result = connection
            .target(entity, uid)
            .and_then(|(target, _)| connection.session.refresh_entity(&target).map(|_| ()).map_err(Failure::from));
        if let Err(error) = result
            && note(error)
        {
            refresh_views = false;
            break;
        }
    }
    if refresh_views && let Err(error) = connection.session.refresh_views() {
        note(Failure::from(error));
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(Failure::new(
            "app.refreshFailed",
            format!("Changes applied, but FM's screen could not refresh: {}", errors.join("; ")),
        ))
    }
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
fn plan_club_move(
    state: State<'_, AppState>,
    uid: u32,
    club: u32,
    terms: MoveTerms,
    fee: Option<i64>,
) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let route = connection.plan_move(uid, club, terms)?;
    let (from, to) = route.clubs();
    let fee = connection.plan_fee(from, to, fee)?;
    let name = |uid: u32| ClubName { uid, name: connection.club_name(uid) };
    Ok(MovePreview {
        from: Some(name(from)),
        to: name(to),
        fee,
        displaced: None,
        permanent: matches!(route, MoveRoute::Game(_)),
    })
}

/// Moves the player `uid` to the senior team of the club `club` on the contract `terms`, the club paying his old
/// one `fee` pounds if given, worked out again from the game as it is now, and logs the move. Where it can, the game
/// makes the transfer itself, with its history and fee, which nothing undoes. Else FM Lens writes it, and when the fee
/// cannot be paid, the player is moved back.
#[tauri::command]
fn move_player(
    state: State<'_, AppState>,
    uid: u32,
    club: u32,
    terms: MoveTerms,
    fee: Option<i64>,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let plan = match connection.plan_move(uid, club, terms)? {
        MoveRoute::Write(plan) => plan,
        MoveRoute::Game(plan) => return transfer_player(connection, &plan, terms, fee),
    };
    let fee_plan = connection.plan_fee(plan.from_club, plan.to_club, fee)?;
    let club = |uid: u32| connection.clubs.get(uid).cloned().ok_or_else(|| not_found(Entity::Club, uid));
    let (buyer, seller) = (club(plan.to_club)?, club(plan.from_club)?);
    let done = connection.session.apply_club_move(&plan)?;
    let paid = match fee_plan {
        Some(fee_plan) => match connection.session.pay_fee(&fee_plan, &buyer, &seller) {
            Ok(paid) => paid,
            Err(err) => {
                let _ = connection.session.undo_club_move(&done);
                return Err(err.into());
            }
        },
        None => Vec::new(),
    };
    Ok(connection.log_move(done, terms, paid, fee_plan.map(|plan| plan.fee)))
}

/// Has the game transfer the player of `plan` for `fee` pounds, or none, and logs it. The game gives him a contract of
/// its own, so his wage and contract end are then written back over it, or those of `terms` where given, as when
/// FM Lens moves a player.
fn transfer_player(
    connection: &mut Connection,
    plan: &TransferPlan,
    terms: MoveTerms,
    fee: Option<i64>,
) -> Result<LoggedChange, Failure> {
    let player = connection.players.get(plan.player).ok_or_else(|| not_found(Entity::Player, plan.player))?;
    let to = connection.clubs.get(plan.to_club).ok_or_else(|| not_found(Entity::Club, plan.to_club))?;
    let target = player.target();
    let session = &connection.session;
    let kept = |key: &str, given: Option<i64>| -> Result<Option<i64>, Failure> {
        match given {
            Some(value) => Ok(Some(value)),
            None => Ok(Some(session.read_field(&target, &session.field(Entity::Player, key)?)?)),
        }
    };
    let terms =
        MoveTerms { wage: kept("contract.wage", terms.wage)?, expires: kept("contract.expires", terms.expires)? };
    let moved = connection.session.transfer_player(player, to, terms, fee.unwrap_or(0))?;
    let logged = connection.log_transfer(moved);
    write_terms(connection, &target, terms)?;
    Ok(logged)
}

/// Writes the wage and contract end of `terms`, where given, over those of the contract the game just made for the
/// player `target`, and notes each change. The move is logged already, so a term that does not land leaves him on the
/// game's.
fn write_terms(connection: &mut Connection, target: &Target, terms: MoveTerms) -> Result<(), Failure> {
    for (key, value) in [("contract.wage", terms.wage), ("contract.expires", terms.expires)] {
        if let Some(value) = value {
            let field = connection.session.field(Entity::Player, key)?;
            let change = connection.session.write_field(target, &field, value)?;
            connection.note_change(&change, change.new);
        }
    }
    Ok(())
}

/// From `plan_release`: the club the player leaves, and whether the game releases him itself, which nothing undoes.
#[derive(Serialize)]
struct ReleasePreview {
    #[serde(flatten)]
    from: ClubName,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    permanent: bool,
}

/// Checks that the player `uid` can be released from his club, and names it; the error says why he cannot. Nothing is
/// written.
#[tauri::command]
fn plan_release(state: State<'_, AppState>, uid: u32) -> Result<ReleasePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let plan = connection.plan_release(uid)?;
    Ok(ReleasePreview {
        from: ClubName { uid: plan.from_club, name: connection.club_name(plan.from_club) },
        permanent: connection.session.game_actions().release,
    })
}

/// Releases the player `uid` from his club, worked out again from the game as it is now, and logs it: he becomes a
/// free agent. Where it can, the game releases him itself, as its editor does, which nothing undoes.
#[tauri::command]
fn release_player(state: State<'_, AppState>, uid: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    if connection.session.game_actions().release {
        let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
        let released = connection.session.release_through_game(player, &[])?;
        if released.club_after.is_some() {
            return Err(MoveError::CallDeclined.into());
        }
        return Ok(connection.log_game_release(released));
    }
    let plan = connection.plan_release(uid)?;
    let done = connection.session.apply_club_move(&plan)?;
    Ok(connection.log_release(done))
}

/// Checks that the member of staff `uid` can move to the club `club`, and names the clubs; the error says why he
/// cannot. Nothing is written.
#[tauri::command]
fn plan_staff_move(state: State<'_, AppState>, uid: u32, club: u32) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let plan = connection.plan_staff_move(uid, club)?;
    let name = |uid: u32| ClubName { uid, name: connection.club_name(uid) };
    Ok(MovePreview {
        from: Some(name(plan.from_club)),
        to: name(plan.to_club),
        fee: None,
        displaced: None,
        permanent: false,
    })
}

/// Moves the member of staff `uid` to the club `club`, in the departments he works in, worked out again from the game
/// as it is now, and logs the move.
#[tauri::command]
fn move_staff(state: State<'_, AppState>, uid: u32, club: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let plan = connection.plan_staff_move(uid, club)?;
    let done = connection.session.apply_staff_plan(&plan)?;
    Ok(connection.log_staff(done))
}

/// The human manager and club of the career connected now, as edited since it was read: the human manager may have
/// changed clubs. Only reads FM Lens' own state.
#[tauri::command]
fn career(state: State<'_, AppState>) -> Result<Option<Career>, Failure> {
    let guard = state.0.lock()?;
    Ok(guard.as_ref().and_then(|connection| connection.career.clone()))
}

/// Checks that the human manager `uid` can be made the manager of the club `club`, and names the clubs and the manager
/// the game dismisses; the error says why he cannot. Nothing is written.
#[tauri::command]
fn plan_manager_move(state: State<'_, AppState>, uid: u32, club: u32) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let member = connection.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?;
    let to = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    let plan = connection.session.plan_manager_move(member, to, &connection.staff)?;
    let name = |uid: u32| ClubName { uid, name: connection.club_name(uid) };
    Ok(MovePreview {
        from: plan.from_club.map(name),
        to: name(plan.to_club),
        fee: None,
        displaced: plan.displaced.and_then(|uid| connection.staff.get(uid)).map(|found| found.name.clone()),
        permanent: true,
    })
}

/// Has the game make the human manager `uid` the manager of the club `club`, as its own editor does: it ends the job
/// he has and dismisses the club's manager. Logged as a change of his `club`, which nothing undoes.
#[tauri::command]
fn move_manager(state: State<'_, AppState>, uid: u32, club: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let member = connection.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?;
    let to = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    let displaced = connection.session.plan_manager_move(member, to, &connection.staff)?.displaced;
    let moved = connection.session.move_manager(member, to)?;
    Ok(connection.log_manager_move(moved, displaced))
}

/// Gives the member of staff `uid` the job `job` (a contract code) at his club, and logs it.
#[tauri::command]
fn change_staff_job(state: State<'_, AppState>, uid: u32, job: u8) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let plan = connection.plan_staff_job(uid, job)?;
    let done = connection.session.apply_staff_plan(&plan)?;
    Ok(connection.log_staff(done))
}

/// The jobs `change_staff_job` gives, by contract code.
#[tauri::command]
fn staff_jobs() -> Vec<u8> {
    STAFF_JOBS.iter().map(|&(code, _)| code).collect()
}

/// Checks that the players `uid` and `other` can swap clubs, and names the clubs (`from` is
/// the club of `uid`); the error says why they cannot. Nothing is written.
#[tauri::command]
fn plan_club_swap(state: State<'_, AppState>, uid: u32, other: u32) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let (from, to, permanent) = match connection.plan_swap(uid, other)? {
        SwapRoute::Write(plan) => (plan.from_club, plan.to_club, false),
        SwapRoute::Game(first, _) => (first.from_club, first.to_club, true),
    };
    let name = |uid: u32| ClubName { uid, name: connection.club_name(uid) };
    Ok(MovePreview { from: Some(name(from)), to: name(to), fee: None, displaced: None, permanent })
}

/// Swaps the clubs of the players `uid` and `other`, worked out again from the game as it is
/// now; each keeps his contract's terms. Written by FM Lens, it is logged as one change of `uid`'s club. Made by the
/// game, it is two transfers, each logged as his own change, which nothing undoes: when the second fails, the first
/// stands.
#[tauri::command]
fn swap_players(state: State<'_, AppState>, uid: u32, other: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    match connection.plan_swap(uid, other)? {
        SwapRoute::Write(plan) => {
            let done = connection.session.apply_club_move(&plan)?;
            Ok(connection.log_move(done, MoveTerms::default(), Vec::new(), None))
        }
        SwapRoute::Game(first, second) => {
            transfer_player(connection, &first, MoveTerms::default(), None)?;
            transfer_player(connection, &second, MoveTerms::default(), None)
        }
    }
}

/// Closes the open promise at `index` in the promises of the player `uid`, as FM ends one that is not held against
/// him, and logs it as one change of his `promise`. FM drops it 31 days later; until then Undo opens it again.
#[tauri::command]
fn close_promise(
    state: State<'_, AppState>,
    uid: u32,
    index: usize,
    promise: Promise,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_close_promise(player, index, &promise)?;
    let done = connection.session.apply_close_promise(&plan)?;
    Ok(connection.log_promise(done))
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

/// The kinds of injury the game knows, in its order, for adding one. Only reads memory.
#[tauri::command]
fn injury_kinds(state: State<'_, AppState>) -> Result<Vec<InjuryKind>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(connection.session.injury_kinds()?)
}

/// Has the game give the player `uid` an injury of the kind with UID `kind`, as its training injuries do; the game
/// picks how long it lasts. Logged as a change of his `injuries` from none to one, and undone by healing it.
#[tauri::command]
fn add_injury(state: State<'_, AppState>, uid: u32, kind: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let added = connection.session.add_injury(player, kind)?;
    Ok(connection.log_game_change(uid, "injuries", 0, 1, Undo::Injured(added)))
}

/// Has the game give the player `uid` a work permit for his club's country, or take his away. Logged as a change of
/// his `work_permit`: 0 for none, 1 for a work permit, or for an ESC slot the day it began as a number like 20270203.
/// Undone by the opposite call.
#[tauri::command]
fn set_work_permit(state: State<'_, AppState>, uid: u32, granted: bool) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let change = connection.session.set_work_permit(player, granted)?;
    let old = change.esc_since().map_or(i64::from(change.was_granted), FmDate::to_number);
    let new = i64::from(change.granted);
    Ok(connection.log_game_change(uid, "work_permit", old, new, Undo::Permit(change)))
}

/// Has the game loan the player `uid` to the senior team of the club `club` from today until `ends` (a number like
/// 20270630). Logged as a change of his `loan` from his club to that one, and undone by ending the loan.
#[tauri::command]
fn start_loan(state: State<'_, AppState>, uid: u32, club: u32, ends: i64) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let to = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    let ends = FmDate::from_number(ends).ok_or(MoveError::OutOfRange {
        field: "loan.ends",
        value: ends,
        min: 20000101,
        max: 21001231,
    })?;
    let started = connection.session.start_loan(player, to, ends)?;
    Ok(connection.log_loan(started))
}

/// The clubs the loan of the player `uid` would end between: the one he is loaned to, then his own. Only reads.
#[tauri::command]
fn plan_end_loan(state: State<'_, AppState>, uid: u32) -> Result<MovePreview, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let (from, to) = connection.session.plan_end_loan(player)?;
    Ok(MovePreview {
        from: Some(ClubName { uid: from, name: connection.club_name(from) }),
        to: ClubName { uid: to, name: connection.club_name(to) },
        fee: None,
        displaced: None,
        permanent: false,
    })
}

/// Has the game end the loan of the player `uid` today: he goes back to his own club. Logged as a change of his `loan`
/// from the borrower to his club, and undone by starting the loan again until the same day.
#[tauri::command]
fn end_loan(state: State<'_, AppState>, uid: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let ended = connection.session.end_loan(player, &connection.human_clubs)?;
    Ok(connection.log_loan_end(ended))
}

/// Has the game agree to sign the free agent `uid` for the senior team of the club `club` on `joins` (a number like
/// 20270701), a day after today: he joins then, on its own terms. Logged as a change of his `club` from none, and
/// undone by cancelling it.
#[tauri::command]
fn sign_free_agent_later(state: State<'_, AppState>, uid: u32, club: u32, joins: i64) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let to = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    let day = FmDate::from_number(joins).ok_or(MoveError::OutOfRange {
        field: "transfer.joins",
        value: joins,
        min: 20000101,
        max: 21001231,
    })?;
    let agreed = connection.session.sign_free_agent_later(player, to, day)?;
    Ok(connection.log_signing_later(agreed))
}

/// The transfers the game agreed for the player `uid` on a later day, as cancelling them finds them; the error says why
/// they cannot be cancelled. Nothing is written.
#[tauri::command]
fn plan_cancel_future_transfers(state: State<'_, AppState>, uid: u32) -> Result<Vec<FutureTransfer>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    Ok(connection.session.plan_cancel_future_transfers(player)?)
}

/// Has the game cancel every transfer it agreed for the player `uid` on a later day, as its own editor does. Each is
/// logged as a change of his `future_transfer` to none, which nothing undoes.
#[tauri::command]
fn cancel_future_transfers(state: State<'_, AppState>, uid: u32) -> Result<Vec<LoggedChange>, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let cancelled = connection.session.cancel_future_transfers(player)?;
    Ok(cancelled.into_iter().map(|transfer| connection.log_cancelled_transfer(uid, transfer)).collect())
}

/// Has the game sign the free agent `uid` for the senior team of the club `club`, on its own terms; `terms` then replace
/// its wage and contract end where given. Logged as a change of his `club` from none, and undone by releasing him again.
#[tauri::command]
fn sign_free_agent(state: State<'_, AppState>, uid: u32, club: u32, terms: MoveTerms) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let to = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?;
    let target = player.target();
    let signed = connection.session.sign_free_agent(player, to, terms)?;
    let logged = connection.log_signing(signed);
    write_terms(connection, &target, terms)?;
    Ok(logged)
}

/// Lifts every current ban of the player `uid`, as the game does once he has served them, and
/// logs it as one change of his `bans` to none.
#[tauri::command]
fn lift_bans(state: State<'_, AppState>, uid: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_lift_bans(player)?;
    let done = connection.session.apply_lift_bans(&plan)?;
    Ok(connection.log_lift(done, None))
}

/// Keeps the player `uid` from retiring: the retirement the game has planned for him is taken out of its plans, and he
/// gets the trait "Will play football as long as possible" in place of "Will retire at top". Logged as one change of
/// his `retirement` to none, and undone as one.
#[tauri::command]
fn keep_playing(state: State<'_, AppState>, uid: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_keep_playing(player)?;
    let done = connection.session.apply_retirement(&plan)?;
    Ok(connection.log_retirement(done))
}

/// Points the tie `index` of the player `uid` at the nation `nation` or the club `club` (by UID), and gives a
/// training the homegrown rule `rule`; what is left out stays. Logged and undone like any change.
#[tauri::command]
fn change_tie(
    state: State<'_, AppState>,
    uid: u32,
    index: usize,
    nation: Option<u32>,
    club: Option<u32>,
    rule: Option<u8>,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let nation = nation.map(|nation| connection.nation(nation)).transpose()?;
    let club = club.map(|club| connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))).transpose()?;
    let target = nation.as_ref().map(TieTarget::Nation).or(club.map(TieTarget::Club));
    let plan = connection.session.plan_relation_change(player, index, target, rule)?;
    let done = connection.session.apply_relation(&plan)?;
    Ok(connection.log_tie(done))
}

/// Takes the tie `index` of the player `uid` out of his list. Logged and undone like any change.
#[tauri::command]
fn remove_tie(state: State<'_, AppState>, uid: u32, index: usize) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_relation_removal(player, index)?;
    let done = connection.session.apply_relation(&plan)?;
    Ok(connection.log_tie(done))
}

/// Gives the player `uid` a tie of `tie` to the nation or club with the UID `target`, under the homegrown rule
/// `rule` for a training, where his list has room. Logged and undone like any change.
#[tauri::command]
fn add_tie(
    state: State<'_, AppState>,
    uid: u32,
    tie: Tie,
    target: u32,
    rule: Option<u8>,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let nation;
    let target = if tie == Tie::TrainedAtClub {
        TieTarget::Club(connection.clubs.get(target).ok_or_else(|| not_found(Entity::Club, target))?)
    } else {
        nation = connection.nation(target)?;
        TieTarget::Nation(&nation)
    };
    let plan = connection.session.plan_relation_add(player, tie, target, rule)?;
    let done = connection.session.apply_relation(&plan)?;
    Ok(connection.log_tie(done))
}

/// The player `uid`, or the member of staff `uid` for `staff`, as the owner of preferences.
fn person_ref(connection: &Connection, uid: u32, staff: bool) -> Result<PersonRef<'_>, Failure> {
    Ok(if staff {
        PersonRef::Staff(connection.staff.get(uid).ok_or_else(|| not_found(Entity::Staff, uid))?)
    } else {
        PersonRef::Player(connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?)
    })
}

/// Gives the preference `index` of the player `uid`, or of the member of staff `uid` for `staff`, the strength
/// `strength`, 1 to 100. Logged and undone like any change.
#[tauri::command]
fn change_preference(
    state: State<'_, AppState>,
    uid: u32,
    staff: bool,
    index: usize,
    strength: i8,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let owner = person_ref(connection, uid, staff)?;
    let plan = connection.session.plan_preference_strength(owner, index, strength)?;
    let done = connection.session.apply_preference(&plan)?;
    Ok(connection.log_preference(done))
}

/// What a like or dislike is pointed at: a club, a player or a member of staff.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum PreferenceTargetKind {
    Club,
    Player,
    Staff,
}

/// Points the preference `index` of the player `uid`, or of the member of staff `uid` for `staff`, at the club,
/// player or member of staff `target_uid`, keeping its strength. Logged and undone like any change.
#[tauri::command]
fn point_preference(
    state: State<'_, AppState>,
    uid: u32,
    staff: bool,
    index: usize,
    target_kind: PreferenceTargetKind,
    target_uid: u32,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let owner = person_ref(connection, uid, staff)?;
    let target = match target_kind {
        PreferenceTargetKind::Club => {
            PreferenceTarget::Club(connection.clubs.get(target_uid).ok_or_else(|| not_found(Entity::Club, target_uid))?)
        }
        PreferenceTargetKind::Player => PreferenceTarget::Person(person_ref(connection, target_uid, false)?),
        PreferenceTargetKind::Staff => PreferenceTarget::Person(person_ref(connection, target_uid, true)?),
    };
    let plan = connection.session.plan_preference_target(owner, index, target)?;
    let done = connection.session.apply_preference(&plan)?;
    Ok(connection.log_preference(done))
}

/// Takes the preference `index` out of the list of the player `uid`, or of the member of staff `uid` for `staff`.
/// Logged and undone like any change.
#[tauri::command]
fn remove_preference(state: State<'_, AppState>, uid: u32, staff: bool, index: usize) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let owner = person_ref(connection, uid, staff)?;
    let plan = connection.session.plan_preference_removal(owner, index)?;
    let done = connection.session.apply_preference(&plan)?;
    Ok(connection.log_preference(done))
}

/// Gives the language `index` of the player `uid`, or of the member of staff `uid` for `staff`, the level `level`, 1
/// to 10. Logged and undone like any change.
#[tauri::command]
fn change_language(
    state: State<'_, AppState>,
    uid: u32,
    staff: bool,
    index: usize,
    level: u8,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let person = person_ref(connection, uid, staff)?;
    let plan = connection.session.plan_language_level(person, index, level)?;
    let done = connection.session.apply_language(&plan)?;
    Ok(connection.log_language(done))
}

/// Takes the language `index` out of the list of the player `uid`, or of the member of staff `uid` for `staff`. Logged
/// and undone like any change.
#[tauri::command]
fn remove_language(state: State<'_, AppState>, uid: u32, staff: bool, index: usize) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let person = person_ref(connection, uid, staff)?;
    let plan = connection.session.plan_language_removal(person, index)?;
    let done = connection.session.apply_language(&plan)?;
    Ok(connection.log_language(done))
}

/// Makes the injury `index` of the player `uid` last `days` days from when it began, at the most. Logged and undone like
/// any change.
#[tauri::command]
fn change_injury(state: State<'_, AppState>, uid: u32, index: usize, days: u16) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_injury_length(player, index, days)?;
    let done = connection.session.apply_injury(&plan)?;
    Ok(connection.log_injury(done))
}

/// Takes the injury `index` out of the list of the player `uid`; his others stay. Logged and undone like any change.
#[tauri::command]
fn remove_injury(state: State<'_, AppState>, uid: u32, index: usize) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_injury_removal(player, index)?;
    let done = connection.session.apply_injury(&plan)?;
    Ok(connection.log_injury(done))
}

/// Gives the clause `index` of the contract of the player `uid` the amount `amount` and the condition `condition`;
/// what is left out stays, and only what the clause has can be changed. Logged and undone like any change.
#[tauri::command]
fn change_clause(
    state: State<'_, AppState>,
    uid: u32,
    index: usize,
    amount: Option<u32>,
    condition: Option<u16>,
) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_clause_change(player, index, amount, condition)?;
    let done = connection.session.apply_clause(&plan)?;
    Ok(connection.log_clause(done))
}

/// Takes the clause `index` out of the contract of the player `uid`. Logged and undone like any change.
#[tauri::command]
fn remove_clause(state: State<'_, AppState>, uid: u32, index: usize) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_clause_removal(player, index)?;
    let done = connection.session.apply_clause(&plan)?;
    Ok(connection.log_clause(done))
}

/// Gives the contract of the player `uid`, which has none, a release clause of `amount` pounds, where its list has
/// room. Logged and undone like any change.
#[tauri::command]
fn add_release_clause(state: State<'_, AppState>, uid: u32, amount: u32) -> Result<LoggedChange, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let plan = connection.session.plan_release_clause(player, amount)?;
    let done = connection.session.apply_clause(&plan)?;
    Ok(connection.log_clause(done))
}

/// The homegrown rules `change_tie` and `add_tie` write, by the game's code.
#[tauri::command]
fn homegrown_rules() -> Vec<u8> {
    HOMEGROWN_RULES.to_vec()
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
                        jadedness: member.jadedness,
                        morale: member.morale,
                        injuries: member.injuries,
                        bans: member.bans,
                        unhappy: member.unhappy,
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
    let summary = connection.clubs.get(club).ok_or_else(|| not_found(Entity::Club, club))?.clone();
    let members = connection
        .session
        .club_teams(&summary, &connection.players)?
        .into_iter()
        .find(|found| found.index == team)
        .ok_or(MoveError::NoTeam { index: team })?
        .players;
    // Healing and lifting bans change the players' records: refused once, not once for every player.
    if matches!(action, TeamAction::Heal | TeamAction::LiftBans)
        && let Some(lock) = connection.session.structure_lock()
    {
        return Err(MoveError::Locked(lock).into());
    }
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
        TeamAction::LiftBans => {
            let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
            for member in members.iter().filter(|member| member.bans > 0) {
                let Some(player) = connection.players.get(member.uid) else {
                    continue;
                };
                let name = player.name.clone();
                let lifted = connection
                    .session
                    .plan_lift_bans(player)
                    .and_then(|plan| connection.session.apply_lift_bans(&plan));
                match lifted {
                    Ok(done) => {
                        connection.log_lift(done, Some(batch));
                        report.applied += 1;
                    }
                    Err(err) => report.failed.push(MassFailure {
                        uid: member.uid,
                        name,
                        field: "bans".to_owned(),
                        error: err.into(),
                    }),
                }
            }
            return Ok(report);
        }
        TeamAction::MaxCohesion => {
            let mut report = MassReport { batch, applied: 0, failed: Vec::new() };
            for member in &members {
                let Some(player) = connection.players.get(member.uid) else {
                    continue;
                };
                let name = player.name.clone();
                let raised = connection
                    .session
                    .plan_cohesion(player, &summary)
                    .and_then(|plan| plan.map(|plan| connection.session.apply_cohesion(&plan)).transpose());
                match raised {
                    Ok(Some(done)) => {
                        connection.log_cohesion(done, Some(batch));
                        report.applied += 1;
                    }
                    Ok(None) => {}
                    Err(err) => report.failed.push(MassFailure {
                        uid: member.uid,
                        name,
                        field: "cohesion".to_owned(),
                        error: err.into(),
                    }),
                }
            }
            return Ok(report);
        }
        TeamAction::MaxTactics => {
            let raised = connection.session.maximise_tactics(&summary, team, &connection.players)?;
            let applied = raised.len();
            for done in raised {
                connection.log_tactics(done, Some(batch));
            }
            return Ok(MassReport { batch, applied, failed: Vec::new() });
        }
        TeamAction::MaxMorale => &[("morale", 20)],
        // A player with no reason to be unhappy has no list: he is skipped.
        TeamAction::RemoveUnhappiness => &[("contract.unhappiness", 0)],
        // Rested as the game rests a player: full energy and sharpness, and jadedness at its least.
        TeamAction::Refresh => &[("condition", 10_000), ("match_sharpness", 10_000), ("jadedness", -500)],
        TeamAction::MaxAttributes => &[],
    };
    let targets: Vec<(Target, String)> = members
        .iter()
        .filter_map(|member| connection.players.get(member.uid))
        .map(|player| (player.target(), player.name.clone()))
        .collect();
    let operations = if action == TeamAction::MaxAttributes {
        connection.attributes_at(20)
    } else {
        values
            .iter()
            .map(|&(key, value)| Ok((connection.session.field(Entity::Player, key)?, Operation::Set { value })))
            .collect::<Result<Vec<_>, EditError>>()?
    };
    let plan = connection.session.plan_mass_edit(&targets, &operations)?;
    Ok(connection.write_planned(Entity::Player, plan.planned, batch))
}

/// Sets every attribute of the player `uid` to `level` (1 to 20), and injury proneness and dirtiness, where lower is
/// better, to 21 - `level`: at 20, what Max attributes does for a team. The changes are logged as one batch, which
/// `undo_batch` undoes.
#[tauri::command]
fn set_attributes(state: State<'_, AppState>, uid: u32, level: i64) -> Result<MassReport, Failure> {
    if !(1..=20).contains(&level) {
        return Err(Failure::new("attributes.level", "Choose a value from 1 to 20."));
    }
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let targets = [(player.target(), player.name.clone())];
    let plan = connection.session.plan_mass_edit(&targets, &connection.attributes_at(level))?;
    let batch = connection.fresh_id();
    let mut report = connection.write_planned(Entity::Player, plan.planned, batch);
    // An attribute that could not be read is said, not passed over: it is one player, not a team.
    report.failed.extend(plan.skipped.into_iter().map(|skipped| MassFailure {
        uid: skipped.uid,
        name: skipped.name,
        field: skipped.field,
        error: Failure { code: skipped.code, params: skipped.params, message: skipped.reason },
    }));
    Ok(report)
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

#[tauri::command]
fn capture_player_template(
    state: State<'_, AppState>,
    uid: u32,
    name: String,
    groups: Vec<TemplateGroup>,
) -> Result<PlayerTemplate, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let target = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?.target();
    connection
        .session
        .capture_player_template(&target, name, &groups)
        .map_err(|err| Failure::new("template.invalid", err.to_string()))
}

#[tauri::command]
fn validate_player_template(state: State<'_, AppState>, template: PlayerTemplate) -> Result<usize, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    template
        .operations(&connection.session.fields(Entity::Player))
        .map(|operations| operations.len())
        .map_err(|err| Failure::new("template.invalid", err.to_string()))
}

/// Resolve a portable template against this build and stable player identities, then
/// use the same conditional writes and undo history as an ordinary bulk edit.
#[tauri::command]
fn plan_player_template(
    state: State<'_, AppState>,
    template: PlayerTemplate,
    query: String,
    filters: Filters,
    selected: Option<Vec<u32>>,
) -> Result<MassPreview, Failure> {
    let mut guard = state.0.lock()?;
    let connection = guard.as_mut().ok_or_else(not_connected)?;
    // An invalid request must not leave an older template preview applyable.
    connection.mass = None;
    let fields = connection.session.fields(Entity::Player);
    let operations = template.operations(&fields).map_err(|err| Failure::new("template.invalid", err.to_string()))?;
    let mut targets = connection.select(Entity::Player, &query, filters);
    if let Some(selected) = selected {
        let selected: BTreeSet<u32> = selected.into_iter().collect();
        targets.retain(|(target, _)| selected.contains(&target.uid));
        if targets.len() != selected.len() {
            return Err(Failure::new(
                "template.selectionChanged",
                "Some selected players no longer match. Refresh your selection.",
            ));
        }
    }
    if targets.is_empty() || targets.len() > MASS_LIMIT {
        return Err(Failure::new(
            "template.targetCount",
            format!("Select 1–{MASS_LIMIT} players; {} match.", targets.len()),
        ));
    }
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
    connection.mass = Some(PendingMass { id, entity: Entity::Player, planned: plan.planned });
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
        .filter(|logged| logged.batch == Some(batch) && logged.undone_at.is_none() && !logged.earlier_game)
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

/// Shows the main window in front of every other, restored if it was minimized.
#[cfg(not(debug_assertions))]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// The app's config. A debug build takes its own identifier, and with it its own data folder: what it freezes is
/// never put back by the installed app, nor the other way round.
fn context() -> tauri::Context {
    let mut context = tauri::generate_context!();
    if cfg!(debug_assertions) {
        context.config_mut().identifier = DEBUG_IDENTIFIER.into();
    }
    context
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // One FM Lens at a time, as two would edit the same career: opening another copy, from anywhere, brings this one's
    // window to the front instead. A development build may still run beside it.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| show_main_window(app)));
    builder
        // Opens the page of a new release in the browser (see app/src/update.ts).
        .plugin(tauri_plugin_opener::init())
        // Installs a newer FM Lens when the window opens (see app/src/update.ts).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .manage(Graphics::default())
        .setup(|app| {
            // Reading the packs' config files takes a moment: do it beside the window. FM keeps its user data
            // in the documents folder on Windows and in Application Support on macOS, or somewhere else, which
            // GRAPHICS_FOLDER can name.
            #[cfg(target_os = "macos")]
            let user_data = app.path().data_dir();
            #[cfg(not(target_os = "macos"))]
            let user_data = app.path().document_dir();
            let root = match std::env::var_os(GRAPHICS_FOLDER) {
                Some(folder) => Some(PathBuf::from(folder)),
                None => user_data.ok().map(|folder| GraphicsIndex::default_root(&folder, 27)),
            };
            let data = std::env::var_os(DATA_FOLDER).map(PathBuf::from).or_else(|| app.path().app_data_dir().ok());
            app.manage(FrozenFile(data.map(|folder| folder.join(FROZEN_FILE))));
            let exports = std::env::var_os(EXPORTS_FOLDER)
                .map(PathBuf::from)
                .or_else(|| app.path().document_dir().ok().map(|folder| folder.join("FM Lens").join("Exports")));
            app.manage(ExportsFolder(exports));
            // Stage the bundled helper for FM's next normal launch. A running game keeps
            // serving through its existing helper; compatibility is discovered on connection.
            bridge::refresh(app.handle());
            // Frozen money and attributes: every little while, what the game took from them is put back. Once FM has
            // moved its lists, which stops every write, the game is read again first.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut next_read = Instant::now();
                loop {
                    std::thread::sleep(FREEZE_EVERY);
                    let state = handle.state::<AppState>();
                    let stale = match state.0.lock().as_deref_mut() {
                        Ok(Some(connection)) if !connection.frozen.is_empty() => {
                            if connection.stale() {
                                Some(connection.session.process.pid())
                            } else {
                                connection.hold_frozen();
                                None
                            }
                        }
                        _ => None,
                    };
                    if let Some(pid) = stale
                        && Instant::now() >= next_read
                        && let Err(err) = read_again_for_freezes(&handle, pid)
                    {
                        eprintln!("FM Lens could not read the game again to hold what is frozen: {}", err.message);
                        next_read = Instant::now() + READ_AGAIN_RETRY;
                    }
                }
            });
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
            career,
            allow_editing,
            reload,
            search_players,
            search_staff,
            search_clubs,
            search_nations,
            search_stadiums,
            search_officials,
            search_competitions,
            competition_rules,
            search_awards,
            export_players,
            open_export,
            show_export,
            player_details,
            staff_details,
            club_details,
            nation_details,
            nations_detailed,
            list_nations,
            freeze_money,
            frozen_clubs,
            freeze_attributes,
            frozen_players,
            freeze_staff_attributes,
            frozen_staff,
            edit_fields,
            read_values,
            apply_edits,
            change_log,
            refresh_game_ui,
            undo_change,
            plan_mass_edit,
            capture_player_template,
            validate_player_template,
            plan_player_template,
            apply_mass_edit,
            undo_batch,
            plan_club_move,
            move_player,
            plan_release,
            release_player,
            plan_club_swap,
            swap_players,
            plan_staff_move,
            move_staff,
            plan_manager_move,
            move_manager,
            change_staff_job,
            staff_jobs,
            heal_player,
            lift_bans,
            close_promise,
            injury_kinds,
            add_injury,
            set_work_permit,
            start_loan,
            plan_end_loan,
            end_loan,
            sign_free_agent,
            sign_free_agent_later,
            plan_cancel_future_transfers,
            cancel_future_transfers,
            keep_playing,
            change_tie,
            remove_tie,
            add_tie,
            change_preference,
            point_preference,
            remove_preference,
            change_language,
            remove_language,
            change_injury,
            remove_injury,
            change_clause,
            remove_clause,
            add_release_clause,
            homegrown_rules,
            club_squads,
            set_captain,
            team_action,
            set_attributes,
            graphics_info,
            can_self_update,
            debug_build,
            restart_app,
            system_version,
            bridge::bridge_status,
            bridge::set_up_bridge,
            bridge::remove_bridge
        ])
        .run(context())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_debug_build_keeps_its_own_identifier() {
        assert_eq!(context().config().identifier, DEBUG_IDENTIFIER);
    }

    fn at(uid: u32, address: u64) -> Target {
        Target { entity: Entity::Player, uid, address, shift: 0 }
    }

    #[test]
    fn a_game_that_played_on_holds_the_same_objects() {
        // One player removed since, the others where they were: the game moved on.
        assert!(same_objects([(at(1, 0x1000), Some(at(1, 0x1000))), (at(2, 0x2000), None)]));
        // A save loaded since made him afresh.
        assert!(!same_objects([(at(1, 0x1000), Some(at(1, 0x1000))), (at(2, 0x2000), Some(at(2, 0x9000)))]));
        // Nobody is left to tell.
        assert!(!same_objects([(at(1, 0x1000), None)]));
        assert!(!same_objects([]));
    }

    #[test]
    fn a_game_that_played_on_may_give_a_few_players_a_new_place() {
        // One of fifty became a player-coach, which gives him a new block: still the same game.
        let kept = (1..50).map(|uid| (at(uid, u64::from(uid) << 12), Some(at(uid, u64::from(uid) << 12))));
        let coach = Target { shift: 0xf8, ..at(50, 50 << 12) };
        assert!(same_objects(kept.clone().chain([(at(50, 50 << 12), Some(coach))])));
        // Every one of them somewhere else: a save was loaded.
        let afresh = (1..50).map(|uid| (at(uid, u64::from(uid) << 12), Some(at(uid, u64::from(uid) << 20))));
        assert!(!same_objects(afresh));
        // One in ten moved is too many to be only the game playing on.
        let tenth = (1..10).map(|uid| (at(uid, u64::from(uid)), Some(at(uid, u64::from(uid)))));
        assert!(!same_objects(tenth.chain([(at(10, 10), Some(at(10, 0x9000)))])));
    }

    #[test]
    fn reading_the_same_game_again_keeps_the_floors() {
        let held = || {
            let mut frozen = Frozen::default();
            // Frozen at -£5,446,930, then the club earned more: that is the floor now.
            frozen.money.insert(617, -5_051_283);
            frozen.attributes.insert(7, BTreeMap::from([("attributes.free_kicks".to_owned(), 13)]));
            frozen.staff_attributes.insert(9, BTreeMap::from([("attributes.coaching".to_owned(), 15)]));
            frozen.refused.insert("club 617".to_owned());
            frozen
        };
        let mut old = held();
        let carried = Frozen::carry_over(&mut old, true).expect("the same game keeps what is frozen");
        assert_eq!(carried.money, held().money);
        assert_eq!(carried.attributes, held().attributes);
        assert_eq!(carried.staff_attributes, held().staff_attributes);
        assert_eq!(carried.refused, held().refused, "a refusal already logged is not logged again");
        assert!(old.is_empty());
        // Another save: nothing carries over, and the file freezes that save's afresh.
        assert!(Frozen::carry_over(&mut held(), false).is_none());
    }

    #[test]
    fn staff_freezes_are_remembered_and_older_files_still_read() {
        // A file from before staff freezes were remembered.
        let older: Remembered = serde_json::from_str(r#"{"saves":{"Steam:7":{"players":[1],"clubs":[2]}}}"#).unwrap();
        let save = &older.saves["Steam:7"];
        assert!(save.staff.is_empty() && !save.is_empty());
        // A save with only a member of staff frozen is kept, and written with him.
        let mut remembered = Remembered::default();
        remembered.saves.entry("Steam:7".to_owned()).or_default().staff.insert(3);
        remembered.saves.retain(|_, save| !save.is_empty());
        let json = serde_json::to_string(&remembered).unwrap();
        let read: Remembered = serde_json::from_str(&json).unwrap();
        assert_eq!(read.saves["Steam:7"].staff, BTreeSet::from([3]));
    }

    #[test]
    fn a_swap_sends_each_player_to_the_club_the_other_leaves() {
        // Player 1 leaves club 10 for 20, player 2 leaves 20 for 10.
        assert_eq!(stale_swap_row((1, 10, 20), (2, 20, 10)), None);
        // Player 2's row named club 20, but the game has him at 30.
        assert_eq!(stale_swap_row((1, 10, 20), (2, 30, 10)), Some(2));
        // Player 1's row named club 10, but the game has him at 40.
        assert_eq!(stale_swap_row((1, 40, 20), (2, 20, 10)), Some(1));
    }

    #[test]
    fn a_release_preview_names_the_club_and_says_when_nothing_undoes_it() {
        let preview = |permanent| ReleasePreview { from: ClubName { uid: 7, name: "Fulham".to_owned() }, permanent };
        let json = |permanent| serde_json::to_value(preview(permanent)).expect("a preview serializes");
        assert_eq!(json(true), serde_json::json!({ "uid": 7, "name": "Fulham", "permanent": true }));
        assert_eq!(json(false), serde_json::json!({ "uid": 7, "name": "Fulham" }));
    }
}

#[cfg(test)]
mod paging_tests {
    use super::*;
    #[derive(Clone)]
    struct Item(u32);
    impl Listed for Item {
        fn uid(&self) -> u32 {
            self.0
        }
        fn names(&self) -> String {
            "same".into()
        }
        fn display_name(&self) -> &str {
            "same"
        }
        fn rank(&self) -> i32 {
            1
        }
    }
    #[test]
    fn pages_cover_tied_results_without_duplicates_and_keep_total() {
        let index = SearchIndex::new((1..=451).rev().map(Item).collect());
        let mut ids = Vec::new();
        for offset in [0, 200, 400] {
            let result = page(&index, "", 200, offset, |_| true, |_| {});
            assert_eq!(result.total, 451);
            assert!(result.rows.len() <= 200);
            ids.extend(result.rows.iter().map(Listed::uid));
        }
        assert_eq!(ids, (1..=451).collect::<Vec<_>>());
        assert!(page(&index, "", 200, usize::MAX, |_| true, |_| {}).rows.is_empty());
        let filtered = page(&index, "", 200, 200, |i| i.0 % 2 == 0, |hits| hits.reverse());
        assert_eq!(filtered.total, 225);
        assert_eq!(filtered.rows.first().unwrap().0, 50);
        assert_eq!(filtered.rows.last().unwrap().0, 2);
        assert_eq!(page(&index, "", usize::MAX, 0, |_| true, |_| {}).rows.len(), 200);
    }
}
