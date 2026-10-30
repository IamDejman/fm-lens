use std::fmt;

use fmlibre_mem::{Module, PeImage, Process, find_processes, list_modules};

use crate::calibrate::{EntityArrays, calibrate};
use crate::date::FmDate;
use crate::details::{PlayerDetails, read_player_details};
use crate::game::{GAME_EXE, GAME_PLUGIN, GameInfo};
use crate::players::{PlayerSummary, read_players};
use crate::profile::{BuildProfile, Layout, PluginFingerprint, layout_for, profile_for};

#[derive(Debug)]
pub enum SessionError {
    NotRunning,
    NoSuchProcess(u32),
    SeveralRunning(Vec<u32>),
    Memory(fmlibre_mem::Error),
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

impl From<fmlibre_mem::Error> for SessionError {
    fn from(err: fmlibre_mem::Error) -> Self {
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
}

impl Session {
    /// Identifies the build behind `process` and locates its entity arrays. Only reads memory.
    pub fn connect(process: Process, source: ArraySource) -> Result<Self, SessionError> {
        let game = GameInfo::inspect(&process)?;
        let plugin = list_modules(process.pid())?
            .into_iter()
            .find(|m| m.name.eq_ignore_ascii_case(GAME_PLUGIN))
            .ok_or(SessionError::PluginNotLoaded)?;
        let fingerprint = PluginFingerprint::of(&PeImage::read(&process, plugin.base)?);
        let profile = profile_for(fingerprint);
        let edition = profile.as_ref().map(|p| p.edition).or(game.edition);
        let layout = edition.and_then(layout_for).ok_or(SessionError::UnsupportedEdition(edition))?;
        let hint = profile.as_ref().filter(|_| source == ArraySource::ProfileFirst).map(|p| &p.arrays);
        let arrays = calibrate(&process, &plugin, &layout, hint);
        if arrays.players.is_none() {
            return Err(SessionError::PlayersNotFound);
        }
        Ok(Self { process, game, plugin, fingerprint, profile, layout, arrays })
    }

    /// The current in-game date, when it can be read and looks like a real date.
    pub fn game_date(&self) -> Option<FmDate> {
        let players = self.arrays.players.as_ref()?;
        let raw = self.process.read_u32(self.plugin.base + players.pair_rva + self.layout.cluster.current_date).ok()?;
        FmDate::from_raw(raw as u16, (raw >> 16) as u16).filter(|date| (2000..=2200).contains(&date.year))
    }

    /// Reads every player, with ages on the current in-game date. Only reads memory.
    pub fn players(&self) -> Result<Vec<PlayerSummary>, SessionError> {
        let array = self.arrays.players.as_ref().ok_or(SessionError::PlayersNotFound)?;
        Ok(read_players(&self.process, &self.plugin, array, &self.layout, self.game_date())?)
    }

    /// Reads the full profile of `player`; `None` when its object has changed since the
    /// players were read. Only reads memory.
    pub fn player_details(&self, player: &PlayerSummary) -> Result<Option<PlayerDetails>, SessionError> {
        Ok(read_player_details(&self.process, &self.layout, player)?)
    }
}
