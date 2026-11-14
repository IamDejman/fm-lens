use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex, OnceLock, PoisonError};

use fmlens_mem::{Module, Process, find_processes, list_modules};

use crate::calibrate::{EntityArrays, calibrate};
use crate::clubs::{ClubDetails, ClubSummary, full_finance_class, read_club_details, read_clubs, stadium_class};
use crate::coded::Coded;
use crate::date::FmDate;
use crate::details::{PlayerDetails, read_player_details};
use crate::edit::{Entity, Field};
use crate::game::{GAME_EXE, GAME_PLUGIN, GameInfo};
use crate::health::{Check, Health, Lock, STRUCTURE};
use crate::players::{Division, PlayerSummary, read_players};
use crate::profile::{BuildProfile, Layout, PluginFingerprint, layout_for, profile_for};
use crate::staff::{StaffDetails, StaffSummary, read_staff, read_staff_details};

#[derive(Debug)]
pub enum SessionError {
    NotRunning,
    NoSuchProcess(u32),
    SeveralRunning(Vec<u32>),
    Memory(fmlens_mem::Error),
    PluginNotLoaded,
    UnsupportedEdition(Option<u32>),
    PlayersNotFound,
}

impl fmt::Display for SessionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SessionError::NotRunning => {
                write!(f, "{GAME_EXE} is not running. Start Football Manager 27, load a save and try again.")
            }
            SessionError::NoSuchProcess(pid) => write!(f, "no {GAME_EXE} with pid {pid}"),
            SessionError::SeveralRunning(pids) => {
                let pids: Vec<String> = pids.iter().map(u32::to_string).collect();
                write!(f, "{} copies of {GAME_EXE} are running (pids {}); choose one", pids.len(), pids.join(", "))
            }
            SessionError::Memory(err) => write!(f, "{err}"),
            SessionError::PluginNotLoaded => {
                write!(f, "{GAME_PLUGIN} is not loaded yet; wait for the main menu and try again")
            }
            SessionError::UnsupportedEdition(Some(edition)) => write!(f, "FM{edition} is not supported yet"),
            SessionError::UnsupportedEdition(None) => write!(f, "could not tell which Football Manager this is"),
            SessionError::PlayersNotFound => {
                write!(f, "could not find the player list; load a save (not just the main menu) and try again")
            }
        }
    }
}

impl std::error::Error for SessionError {}

impl Coded for SessionError {
    fn code(&self) -> &'static str {
        match self {
            SessionError::NotRunning => "session.notRunning",
            SessionError::NoSuchProcess(_) => "session.noSuchProcess",
            SessionError::SeveralRunning(_) => "session.severalRunning",
            SessionError::Memory(err) => err.code(),
            SessionError::PluginNotLoaded => "session.pluginNotLoaded",
            SessionError::UnsupportedEdition(Some(_)) => "session.unsupportedEdition",
            SessionError::UnsupportedEdition(None) => "session.unknownEdition",
            SessionError::PlayersNotFound => "session.playersNotFound",
        }
    }

    fn params(&self) -> Vec<(&'static str, String)> {
        match self {
            SessionError::NoSuchProcess(pid) => vec![("pid", pid.to_string()), ("exe", GAME_EXE.to_owned())],
            SessionError::SeveralRunning(pids) => {
                let pids: Vec<String> = pids.iter().map(u32::to_string).collect();
                vec![("count", pids.len().to_string()), ("pids", pids.join(", ")), ("exe", GAME_EXE.to_owned())]
            }
            SessionError::Memory(err) => err.params(),
            SessionError::UnsupportedEdition(Some(edition)) => vec![("edition", edition.to_string())],
            _ => Vec::new(),
        }
    }
}

impl From<fmlens_mem::Error> for SessionError {
    fn from(err: fmlens_mem::Error) -> Self {
        SessionError::Memory(err)
    }
}

/// Picks the game process: the one with `pid`, or the only `fm.exe` running.
pub fn find_game(pid: Option<u32>) -> Result<u32, SessionError> {
    let running: Vec<u32> = find_processes(GAME_EXE)?.into_iter().map(|p| p.pid).collect();
    match (pid, running.as_slice()) {
        (Some(pid), _) if running.contains(&pid) => Ok(pid),
        (Some(pid), _) => Err(SessionError::NoSuchProcess(pid)),
        (None, []) => Err(SessionError::NotRunning),
        (None, [only]) => Ok(*only),
        (None, _) => Err(SessionError::SeveralRunning(running)),
    }
}

/// How [`Session::connect`] locates the entity arrays.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArraySource {
    /// Use the build profile's RVAs when they check out, scan otherwise.
    ProfileFirst,
    /// Always scan, as for a build without a profile.
    ScanOnly,
}

/// A game process with its data located and ready to read.
pub struct Session {
    pub process: Process,
    pub game: GameInfo,
    pub plugin: Module,
    pub fingerprint: PluginFingerprint,
    /// The built-in profile of this build, when there is one.
    pub profile: Option<BuildProfile>,
    pub layout: Layout,
    pub arrays: EntityArrays,
    /// Array storage when this session was attached. A career reload invalidates
    /// cached targets, undo records and freezes even when it reuses the same UIDs.
    array_storage: [Option<u64>; 3],
    /// The class of the full club finance record, found the first time it is needed.
    finance_class: OnceLock<Option<u64>>,
    pub(crate) refresh_support: crate::refresh::OptionalRefresh,
    /// The class of stadiums, found the first time it is needed.
    stadium_class: OnceLock<Option<u64>>,
    /// The vtable of the retirement manager, once its class name has been checked.
    pub(crate) retirement_class: OnceLock<u64>,
    /// What the checks found: worked out the first time it is needed, and again by [`Session::recheck`].
    health: Mutex<Option<Arc<Health>>>,
}

impl Session {
    /// Identifies the build behind `process` and locates its entity arrays. Only reads memory.
    pub fn connect(process: Process, source: ArraySource) -> Result<Self, SessionError> {
        let game = GameInfo::inspect(&process)?;
        let plugin = list_modules(&process)?
            .into_iter()
            .find(|m| m.name.eq_ignore_ascii_case(GAME_PLUGIN))
            .ok_or(SessionError::PluginNotLoaded)?;
        let fingerprint = PluginFingerprint::read(&process, &plugin)?;
        let profile = profile_for(fingerprint);
        let edition = profile.as_ref().map(|p| p.edition).or(game.edition);
        let layout = edition.and_then(layout_for).ok_or(SessionError::UnsupportedEdition(edition))?;
        let hint = profile.as_ref().filter(|_| source == ArraySource::ProfileFirst).map(|p| &p.arrays);
        let arrays = calibrate(&process, &plugin, &layout, hint);
        if arrays.players.is_none() {
            return Err(SessionError::PlayersNotFound);
        }
        let array_storage = [&arrays.players, &arrays.staff, &arrays.clubs]
            .map(|array| array.as_ref().and_then(|array| array.locate(&process, &plugin).ok()).map(|(begin, _)| begin));
        Ok(Self {
            process,
            game,
            plugin,
            fingerprint,
            profile,
            layout,
            arrays,
            array_storage,
            finance_class: OnceLock::new(),
            refresh_support: crate::refresh::OptionalRefresh::default(),
            stadium_class: OnceLock::new(),
            retirement_class: OnceLock::new(),
            health: Mutex::new(None),
        })
    }

    /// Whether the editor has a profile for this build of the game: one it has been checked with.
    pub fn known_build(&self) -> bool {
        self.profile.is_some()
    }

    /// Only fingerprinted builds may be edited. Layout health alone cannot validate a new build.
    pub fn writes_allowed(&self) -> bool {
        self.known_build() && self.current_career()
    }

    /// Fails closed if FM has replaced its entity storage or can no longer be read.
    pub fn current_career(&self) -> bool {
        let current = [&self.arrays.players, &self.arrays.staff, &self.arrays.clubs].map(|array| {
            array.as_ref().and_then(|array| array.locate(&self.process, &self.plugin).ok()).map(|(begin, _)| begin)
        });
        current == self.array_storage
    }

    /// What the checks found on this game, worked out the first time it is asked for.
    pub fn health(&self) -> Arc<Health> {
        let mut health = self.health.lock().unwrap_or_else(PoisonError::into_inner);
        health.get_or_insert_with(|| Arc::new(crate::health::check(self, self.read_game_date()))).clone()
    }

    /// Runs the checks again, e.g. once the game has moved on or a save has been loaded meanwhile.
    pub fn recheck(&self) -> Arc<Health> {
        let fresh = Arc::new(crate::health::check(self, self.read_game_date()));
        *self.health.lock().unwrap_or_else(PoisonError::into_inner) = Some(fresh.clone());
        fresh
    }

    /// Why nothing may be written now: an unknown build or another career loaded since
    /// the session attached, whose objects old addresses no longer belong to.
    pub(crate) fn session_lock(&self) -> Option<Lock> {
        if !self.known_build() {
            return Some(Lock::UnknownBuild);
        }
        (!self.current_career()).then_some(Lock::CareerChanged)
    }

    /// Why `field` may not be written now, if it may not: an unknown build not allowed, or its check failed.
    pub fn field_lock(&self, field: &Field) -> Option<Lock> {
        if let Some(lock) = self.session_lock() {
            return Some(lock);
        }
        let check = Check::of_field(field);
        (!self.health().passed(check)).then_some(Lock::Failed(check))
    }

    /// Why a change to the game's lists and records (a move, a heal, a captaincy, ...) may not be written now, if it
    /// may not.
    pub fn structure_lock(&self) -> Option<Lock> {
        if let Some(lock) = self.session_lock() {
            return Some(lock);
        }
        let health = self.health();
        STRUCTURE.into_iter().find(|&check| !health.passed(check)).map(Lock::Failed)
    }

    /// The class (vtable) of stadiums, the only objects a stadium field is written to; `None` when it cannot be told.
    pub fn stadium_class(&self) -> Option<u64> {
        *self.stadium_class.get_or_init(|| {
            let array = self.arrays.clubs.as_ref()?;
            stadium_class(&self.process, &self.plugin, array, &self.layout)
        })
    }

    /// The class (vtable) of the full club finance record, the only one the budgets can be
    /// written to; `None` when it cannot be told apart.
    pub fn finance_class(&self) -> Option<u64> {
        *self.finance_class.get_or_init(|| {
            let array = self.arrays.clubs.as_ref()?;
            full_finance_class(&self.process, &self.plugin, array, &self.layout)
        })
    }

    /// The current in-game date, when it can be read and fits the contracts the game has signed (see
    /// [`Check::GameDate`]); `None` rather than a date read from the wrong place.
    pub fn game_date(&self) -> Option<FmDate> {
        let date = self.read_game_date()?;
        self.health().passed(Check::GameDate).then_some(date)
    }

    /// The in-game date where the build places it, when it looks like a real date.
    pub(crate) fn read_game_date(&self) -> Option<FmDate> {
        let raw = self.raw_game_date()?;
        FmDate::from_raw(raw as u16, (raw >> 16) as u16).filter(|date| (2000..=2200).contains(&date.year))
    }

    /// The in-game date as the game holds it: the day of the year under flags that change through the day, then the
    /// year. The game stamps its own records with this.
    pub(crate) fn raw_game_date(&self) -> Option<u32> {
        let rva = match self.profile.as_ref().and_then(|profile| profile.current_date) {
            Some(rva) => rva,
            None => self.arrays.players.as_ref()?.pair_rva + self.layout.cluster.current_date,
        };
        self.process.read_u32(self.plugin.base + rva).ok()
    }

    /// Reads every player, with ages on the current in-game date. Only reads memory.
    pub fn players(&self) -> Result<Vec<PlayerSummary>, SessionError> {
        let array = self.arrays.players.as_ref().ok_or(SessionError::PlayersNotFound)?;
        // A division is only ever one of the game's competitions, so a team pointing anywhere else has none.
        let divisions: HashMap<u64, Division> = match self.layout.team.division {
            Some(_) => self
                .competitions()
                .unwrap_or_default()
                .into_iter()
                .map(|c| (c.address, Division { uid: c.uid, name: c.name, reputation: c.reputation }))
                .collect(),
            None => HashMap::new(),
        };
        Ok(read_players(&self.process, &self.plugin, array, &self.layout, self.game_date(), &divisions)?)
    }

    /// Reads every club. Only reads memory.
    pub fn clubs(&self) -> Result<Vec<ClubSummary>, SessionError> {
        let Some(array) = self.arrays.clubs.as_ref() else {
            return Ok(Vec::new());
        };
        Ok(read_clubs(&self.process, &self.plugin, array, &self.layout)?)
    }

    /// Reads the full profile of `club`; `None` when its object has changed. Only reads memory.
    pub fn club_details(&self, club: &ClubSummary) -> Result<Option<ClubDetails>, SessionError> {
        let Some(mut details) = read_club_details(&self.process, &self.layout, club)? else {
            return Ok(None);
        };
        details.rivals = self.club_rivals(club).unwrap_or_default();
        details.links = self.club_links(club).unwrap_or_default();
        Ok(Some(details))
    }

    /// Reads every member of staff, with ages on the current in-game date. Only reads memory.
    pub fn staff(&self) -> Result<Vec<StaffSummary>, SessionError> {
        let Some(array) = self.arrays.staff.as_ref() else {
            return Ok(Vec::new());
        };
        Ok(read_staff(&self.process, &self.plugin, array, &self.layout, self.game_date())?)
    }

    /// Reads the full profile of `member`; `None` when its object has changed. Only reads memory.
    pub fn staff_details(&self, member: &StaffSummary) -> Result<Option<StaffDetails>, SessionError> {
        let Some(mut details) = read_staff_details(&self.process, &self.layout, member)? else {
            return Ok(None);
        };
        details.languages = self.staff_languages(member).unwrap_or_default();
        details.preferences = self.staff_preferences(member).unwrap_or_default();
        // Through the editor's own guarded read: a manager whose flags cannot be located stays unknown.
        if member.is_human
            && let Ok(unsackable) = self.field(Entity::Staff, "manager.unsackable")
            && let Ok(registration) = self.field(Entity::Staff, "manager.registration_anytime")
            && let Ok(values) = self.read_fields(&member.target(), &[unsackable, registration])
        {
            let flag = |i: usize| values.get(i).copied().flatten().map(|value| value != 0);
            details.unsackable = flag(0);
            details.registration_anytime = flag(1);
        }
        Ok(Some(details))
    }

    /// Reads the full profile of `player`; `None` when its object has changed since the
    /// players were read. Only reads memory.
    pub fn player_details(&self, player: &PlayerSummary) -> Result<Option<PlayerDetails>, SessionError> {
        let Some(mut details) = read_player_details(&self.process, &self.layout, player)? else {
            return Ok(None);
        };
        // A list the editor does not make sense of leaves the profile without injuries.
        details.injuries = self.injuries(player).unwrap_or_default();
        details.bans = self.bans(player).unwrap_or_default();
        details.promises = self.layout.promise.is_some().then(|| self.promises(player).unwrap_or_default());
        details.ties = self.relations(player).unwrap_or_default();
        details.tie_room = self.relation_room(player).unwrap_or(0);
        details.preferences = self.preferences(player).unwrap_or_default();
        details.languages = self.player_languages(player).unwrap_or_default();
        details.clause_room = self.clause_room(player).unwrap_or(0);
        details.loan = self.loan(player);
        details.work_permits = self.work_permits(player);
        details.future_transfers = self.future_transfers(player).unwrap_or_default();
        if let Ok(date) = self.planned_retirement(player) {
            (details.retirement_known, details.retires) = (true, date);
        }
        Ok(Some(details))
    }
}
