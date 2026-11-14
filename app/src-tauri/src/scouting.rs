//! The scouting commands: a player's scouting report, the lists of top players, and the record of how players developed
//! in each of the user's careers, kept in the app's data folder.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use fmlens_core::history::{CareerHistory, Point, Seen, VERSION, fnv1a};
use fmlens_core::{Entity, ScoutReport, TopKind, TopPlaces, TopScope, scores, scout_report, top_places, top_players};
use serde::Serialize;
use tauri::State;

use crate::{AppState, Connection, Failure, Page, PlayerRow, not_connected, not_found};

/// The folder in the app's data folder that keeps a file per career.
pub(crate) const HISTORY_FOLDER: &str = "history";

/// The record of how players developed in each career (see `fmlens_core::history`), by career key (see
/// `career_key`): read from its folder in the background when the app starts, and kept up to date as careers are
/// connected.
pub(crate) struct Histories {
    folder: Option<PathBuf>,
    careers: Arc<Mutex<Option<HashMap<String, CareerHistory>>>>,
}

/// How a player developed in one of the user's other careers.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OtherCareer {
    manager: String,
    club: Option<String>,
    points: Vec<Point>,
}

/// What tells careers apart: the save, as the change log knows it, and the human manager's name.
fn career_key(connection: &Connection) -> Option<String> {
    let save = connection.save.as_ref()?;
    let career = connection.career.as_ref()?;
    Some(format!("{save}:{}", career.manager))
}

/// The file a career's record is kept in.
fn file_of(folder: &Path, key: &str) -> PathBuf {
    folder.join(format!("{:08x}.json", fnv1a(key)))
}

/// A career's record from `path`; none when it cannot be read or is of another version.
fn read_history(path: &Path) -> Option<CareerHistory> {
    let text = std::fs::read(path).ok()?;
    serde_json::from_slice::<CareerHistory>(&text).ok().filter(|history| history.version == VERSION)
}

/// The career key a record was kept under: kept in the record so the folder can be read back by key.
#[derive(Serialize, serde::Deserialize)]
struct Keyed {
    key: String,
    #[serde(flatten)]
    history: CareerHistory,
}

impl Histories {
    pub(crate) fn new(folder: Option<PathBuf>) -> Self {
        let histories = Self { folder, careers: Arc::new(Mutex::new(None)) };
        histories.read_in_background();
        histories
    }

    /// Reads every career's record. A record already in memory (one written since the app started) is kept.
    fn read_in_background(&self) {
        let (folder, careers) = (self.folder.clone(), self.careers.clone());
        std::thread::spawn(move || {
            let Ok(mut slot) = careers.lock() else {
                return;
            };
            let map = slot.get_or_insert_with(HashMap::new);
            let entries = folder.as_deref().and_then(|folder| std::fs::read_dir(folder).ok());
            for entry in entries.into_iter().flatten().flatten() {
                let path = entry.path();
                if path.extension().is_none_or(|ext| ext != "json") {
                    continue;
                }
                let keyed = std::fs::read(&path).ok().and_then(|text| serde_json::from_slice::<Keyed>(&text).ok());
                if let Some(Keyed { key, history }) = keyed.filter(|keyed| keyed.history.version == VERSION) {
                    map.entry(key).or_insert(history);
                }
            }
        });
    }

    /// Records the players of `connection` as they are on its game date (at most once a month of game time) and, when
    /// that changed the record, writes the career's file in the background. Without a save, a career or a date there is
    /// nothing to record.
    pub(crate) fn record(&self, connection: &Connection) {
        let (Some(key), Some(career), Some(date)) =
            (career_key(connection), connection.career.as_ref(), connection.session.game_date())
        else {
            return;
        };
        let players: Vec<Seen> = connection
            .players
            .iter()
            .filter_map(|p| {
                let age = u8::try_from(p.age?).ok()?;
                let ability = u8::try_from(p.current_ability).ok()?;
                Some(Seen(p.uid, p.identity(), age, ability, p.potential_ability))
            })
            .collect();
        let (manager, club) = (career.manager.clone(), career.club.clone());
        let (folder, careers) = (self.folder.clone(), self.careers.clone());
        std::thread::spawn(move || {
            let Ok(mut slot) = careers.lock() else {
                return;
            };
            let map = slot.get_or_insert_with(HashMap::new);
            let history = map.entry(key.clone()).or_insert_with(|| {
                folder
                    .as_deref()
                    .and_then(|folder| read_history(&file_of(folder, &key)))
                    .unwrap_or_else(|| CareerHistory::new(manager.clone(), club.clone()))
            });
            // The club the user manages now names the career.
            history.club = club;
            if !history.record([date.year, u16::from(date.month), u16::from(date.day)], players) {
                return;
            }
            let Some(folder) = folder else {
                return;
            };
            let keyed = Keyed { key: key.clone(), history: history.clone() };
            drop(slot);
            if let Err(err) = write_atomically(&file_of(&folder, &key), &keyed) {
                eprintln!("FM Lens could not keep the record of this career: {err}");
            }
        });
    }

    /// How the player with `uid` and `identity` developed in each career but the one with key `current`; none while
    /// the records are still being read.
    fn others(&self, current: Option<&str>, uid: u32, identity: u32) -> Option<Vec<OtherCareer>> {
        let slot = self.careers.try_lock().ok()?;
        let map = slot.as_ref()?;
        let mut careers: Vec<OtherCareer> = map
            .iter()
            .filter(|(key, _)| Some(key.as_str()) != current)
            .filter_map(|(_, history)| {
                let points = history.find(uid, identity);
                (!points.is_empty()).then(|| OtherCareer {
                    manager: history.manager.clone(),
                    club: history.club.clone(),
                    points,
                })
            })
            .collect();
        careers.sort_by(|a, b| (&a.manager, &a.club).cmp(&(&b.manager, &b.club)));
        Some(careers)
    }
}

/// Writes `value` as JSON to `path` through a file beside it, so that a crash never leaves half a file.
fn write_atomically(path: &Path, value: &impl Serialize) -> std::io::Result<()> {
    if let Some(folder) = path.parent() {
        std::fs::create_dir_all(folder)?;
    }
    let partial = path.with_extension("json.partial");
    std::fs::write(&partial, serde_json::to_vec(value)?)?;
    std::fs::rename(&partial, path)
}

/// A player's scouting report, and how he developed in the user's other careers.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlayerScout {
    #[serde(flatten)]
    report: ScoutReport,
    /// None while the records are still being read.
    careers: Option<Vec<OtherCareer>>,
}

/// The scouting report of the player with `uid`. Only reads the lists.
#[tauri::command]
pub(crate) fn player_scout(
    state: State<'_, AppState>,
    histories: State<'_, Histories>,
    uid: u32,
) -> Result<PlayerScout, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let player = connection.players.get(uid).ok_or_else(|| not_found(Entity::Player, uid))?;
    let (report, identity, key) = (scout_report(player), player.identity(), career_key(connection));
    drop(guard);
    Ok(PlayerScout { report, careers: histories.others(key.as_deref(), uid, identity) })
}

/// The top players of `scope` by `kind`, ranked, and of them those matching `query`; at most `limit` rows from
/// `offset`. Only reads the lists.
#[tauri::command]
pub(crate) fn top_players_list(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
    offset: Option<usize>,
    kind: Option<TopKind>,
    scope: Option<TopScope>,
) -> Result<Page<PlayerRow>, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    let ranked = top_players(connection.players.iter(), kind.unwrap_or_default(), &scope.unwrap_or_default());
    let found: Option<HashSet<u32>> =
        (!query.trim().is_empty()).then(|| connection.players.search(&query).iter().map(|p| p.uid).collect());
    let hits: Vec<(usize, &fmlens_core::PlayerSummary)> = ranked
        .into_iter()
        .enumerate()
        .filter(|(_, p)| found.as_ref().is_none_or(|found| found.contains(&p.uid)))
        .collect();
    Ok(Page {
        total: hits.len(),
        rows: hits
            .into_iter()
            .skip(offset.unwrap_or(0))
            .take(limit.min(200))
            .map(|(at, p)| PlayerRow {
                player: p.clone(),
                attribute_values: BTreeMap::new(),
                scores: scores(p, &[], None, u32::try_from(at + 1).ok()),
            })
            .collect(),
    })
}

/// The continents and countries the connected game's players play in. Only reads the lists.
#[tauri::command]
pub(crate) fn top_places_list(state: State<'_, AppState>) -> Result<TopPlaces, Failure> {
    let guard = state.0.lock()?;
    let connection = guard.as_ref().ok_or_else(not_connected)?;
    Ok(top_places(connection.players.iter()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_career_s_file_round_trips_with_its_key() {
        let folder = std::env::temp_dir().join(format!("fmlens-history-{}", std::process::id()));
        let mut history = CareerHistory::new("Ada".to_owned(), Some("Northbridge".to_owned()));
        history.record([2027, 8, 1], vec![Seen(7, 1, 18, 100, 160)]);
        let path = file_of(&folder, "Steam:42:Ada");
        write_atomically(&path, &Keyed { key: "Steam:42:Ada".to_owned(), history: history.clone() }).expect("write");
        assert_eq!(read_history(&path), Some(history.clone()));
        let keyed: Keyed = serde_json::from_slice(&std::fs::read(&path).expect("read")).expect("json");
        assert_eq!(keyed.key, "Steam:42:Ada");
        assert!(!path.with_extension("json.partial").exists());
        std::fs::remove_dir_all(&folder).expect("clean up");

        let histories = Histories { folder: None, careers: Arc::new(Mutex::new(Some(HashMap::new()))) };
        histories.careers.lock().expect("lock").as_mut().expect("read").insert("a".to_owned(), history);
        assert_eq!(histories.others(Some("b"), 7, 1).expect("ready").len(), 1);
        assert!(histories.others(Some("a"), 7, 1).expect("ready").is_empty(), "the career connected now");
        assert!(histories.others(None, 7, 2).expect("ready").is_empty(), "someone else");
    }
}
