//! A team's familiarity with its tactic, raised to the most for every player as the game's own editor does it.
//!
//! The game's in-game editor has an action for this (`TEAM_MAXIMISE_TACTICAL_UNDERSTANDING_ACTION`): for each player of
//! the team it raises every familiarity the team's tactic asks for to the most, adding the entries he lacks. FM Lens
//! has the game run that action through the bridge, with the arguments its editor gives it, and reads every player's
//! familiarity record (see [`TacticsLayout`]) before and after.
//!
//! The game only changes an entry in place or adds one at the end of a list, moving the list when it is full; it never
//! removes one. So what a list held before is still at its start afterwards, wherever the list is now: undoing writes
//! the old entries back there and shortens the list to its old length, provided the record still holds what the action
//! left.
//!
//! [`TacticsLayout`]: crate::profile::TacticsLayout

use fmlibre_mem::call::{Arg, Program, Step};
use fmlibre_mem::is_user_pointer;

use crate::clubs::ClubSummary;
use crate::players::{PlayerIndex, PlayerSummary};
use crate::profile::{EditorRvas, TacticsLayout};
use crate::session::Session;
use crate::transfer::{MoveError, Patches};

/// The most familiar a player can be with a part of a tactic, as the game keeps it.
const MOST: u32 = 10_000;

/// The size of an entry in a record's lists, and in its store.
const LIST_ENTRY: u64 = 4;
const STORE_ENTRY: u64 = 16;

/// The most entries the editor reads from one list; the game keeps a handful.
const MOST_ENTRIES: u64 = 64;

/// The key under which the game's editor actions find the entity they act on ('dref'), and the type of a team in a
/// packed reference (the top byte; the low 23 bits are its id).
const REFERENCE_KEY: u64 = 0x6472_6566;
const TEAM_REFERENCE: u32 = 0x18 << 24;
const MOST_TEAM_ID: u32 = (1 << 23) - 1;

/// Where the action's arguments sit in the call's scratch memory: the inner map and the outer one (three qwords each),
/// the team's reference as an integer Value and the struct Value made from the inner map (two qwords each).
const INNER_MAP: usize = 0;
const OUTER_MAP: usize = 0x20;
const REFERENCE_VALUE: usize = 0x40;
const STRUCT_VALUE: usize = 0x60;

/// A player whose familiarity with the team's tactic the game raised.
#[derive(Debug, Clone)]
pub struct RaisedTactics {
    pub player: u32,
    /// How familiar he was with the parts of the tactic the action changed, and is now, as percentages: the average
    /// of those values (0 for an entry the game added).
    pub before: u8,
    pub after: u8,
    target: PlayerSummary,
    record: u64,
    old: Record,
    new: Record,
}

/// A team's familiarity with its tactic as read: its id in the game's teams table (`None` when the table does not list
/// it there), whether the game's editor actions run, and each player's familiarity.
#[derive(Debug, Clone)]
pub struct TeamTactics {
    pub id: Option<u32>,
    pub editor_on: bool,
    pub players: Vec<PlayerTactics>,
}

/// A player's familiarity with his team's tactic: each value, 0 to 10000, list by list, the store last; `None` for a
/// player without a record.
#[derive(Debug, Clone)]
pub struct PlayerTactics {
    pub uid: u32,
    pub lists: Option<Vec<Vec<u32>>>,
}

/// A familiarity record as read: each list, then the store, then the dirty byte.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Record {
    lists: Vec<List>,
    dirty: u8,
}

/// A list of entries of `entry` bytes, at `at` in the record: its (begin, end, capacity) and its entries.
#[derive(Debug, Clone, PartialEq, Eq)]
struct List {
    at: u64,
    entry: u64,
    begin: u64,
    end: u64,
    capacity: u64,
    bytes: Vec<u8>,
}

impl List {
    /// The familiarity each entry holds.
    fn values(&self, value_at: u64) -> Vec<u32> {
        self.bytes
            .chunks_exact(self.entry as usize)
            .map(|entry| {
                let at = value_at as usize;
                let value = u32::from(u16::from_le_bytes([entry[at], entry[at + 1]]));
                if self.entry == LIST_ENTRY { value & 0x3FFF } else { value }
            })
            .collect()
    }
}

impl Session {
    /// Has the game make every player of the team at `team` in the list of `club`'s teams fully familiar with its
    /// tactic, as its own editor does. Gives back the players whose familiarity it raised, with what undoing takes;
    /// players fully familiar already are left out.
    pub fn maximise_tactics(
        &self,
        club: &ClubSummary,
        team: usize,
        players: &PlayerIndex,
    ) -> Result<Vec<RaisedTactics>, MoveError> {
        let (layout, editor) = self.tactics_layout()?;
        let function = self.game_function(|calls| calls.maximise_tactics)?;
        let struct_value = self.game_function(|calls| calls.struct_value)?;
        let map_new = self.game_function(|calls| calls.map_new)?;
        let map_insert = self.game_function(|calls| calls.map_insert)?;
        let map_drop = self.game_function(|calls| calls.map_drop)?;
        if self.process.read_bytes(self.plugin.base + editor.enabled, 1)?[0] != 1 {
            return Err(MoveError::CallUnavailable);
        }
        let object = self.team_object(club, team)?;
        let id = self.team_id(object, layout, editor)?.ok_or(MoveError::NoTeam { index: team })?;
        let types = self.process.read_u64(self.plugin.base + editor.value_types)?;
        if !is_user_pointer(types) {
            return Err(MoveError::CallUnavailable);
        }

        // Every player of the team with a record, as the action finds them, and his record before.
        let members = self.club_team(club, team, object, players)?.players;
        let mut before = Vec::new();
        for member in members {
            let Some(player) = players.get(member.uid) else {
                continue;
            };
            let record = self.tactics_record(player, layout)?;
            if is_user_pointer(record) {
                before.push((player.clone(), record, self.read_record(record, layout)?));
            }
        }

        // The arguments as the game's editor builds them: the team's reference as an integer Value in a map, that map
        // made a struct Value, and that in the action's map. Each step moves what it is given, so dropping both maps
        // at the end frees everything, whatever the action does.
        let mut program = Program::new();
        program.write_u64(REFERENCE_VALUE, types + editor.integer_type);
        program.write_u64(REFERENCE_VALUE + 8, u64::from(TEAM_REFERENCE | id));
        program.push(Step::new(map_new, &[Arg::scratch(INNER_MAP)]));
        program.push(Step::new(
            map_insert,
            &[Arg::scratch(INNER_MAP), Arg::value(REFERENCE_KEY), Arg::scratch(REFERENCE_VALUE)],
        ));
        program.push(Step::new(struct_value, &[Arg::scratch(STRUCT_VALUE), Arg::scratch(INNER_MAP)]));
        program.push(Step::new(map_new, &[Arg::scratch(OUTER_MAP)]));
        program.push(Step::new(
            map_insert,
            &[Arg::scratch(OUTER_MAP), Arg::value(REFERENCE_KEY), Arg::scratch(STRUCT_VALUE)],
        ));
        program.push(Step::new(function, &[Arg::scratch(OUTER_MAP)]));
        program.push(Step::new(map_drop, &[Arg::scratch(OUTER_MAP)]).cleanup());
        program.push(Step::new(map_drop, &[Arg::scratch(INNER_MAP)]).cleanup());
        self.call_game(&program)?;

        // The game has made its change: a player whose record cannot be read back now is left out, not the rest.
        let mut raised = Vec::new();
        for (player, record, old) in before {
            if self.tactics_record(&player, layout).ok() != Some(record) {
                continue;
            }
            let Ok(new) = self.read_record(record, layout) else {
                continue;
            };
            if let Some((before, after)) = raised_values(&old, &new, layout) {
                raised.push(RaisedTactics { player: player.uid, before, after, target: player, record, old, new });
            }
        }
        Ok(raised)
    }

    /// Puts a player's familiarity with the tactic back as it was, provided his record holds what the action left:
    /// each list's old entries at its start, its old length, and the dirty byte. It changes the lengths of the game's
    /// lists, so like any such change it waits for [`Session::structure_lock`].
    pub fn undo_tactics(&self, done: &RaisedTactics) -> Result<(), MoveError> {
        if let Some(lock) = self.structure_lock() {
            return Err(MoveError::Locked(lock));
        }
        let (layout, _) = self.tactics_layout()?;
        if self.tactics_record(&done.target, layout)? != done.record
            || self.read_record(done.record, layout)? != done.new
        {
            return Err(MoveError::TacticsChanged);
        }
        // Each list's old entries first, then its old length, so the game never reads a length past what is written.
        let mut patches = Patches::default();
        for (old, new) in done.old.lists.iter().zip(&done.new.lists) {
            patches.push(new.begin, &new.bytes[..old.bytes.len()], old.bytes.as_slice());
            let end = new.begin + (old.end - old.begin);
            patches.push(done.record + old.at + 8, new.end.to_le_bytes(), end.to_le_bytes());
        }
        patches.push(done.record + layout.dirty, [done.new.dirty], [done.old.dirty]);
        self.write_patches(&patches.0)
    }

    /// How familiar each player of the team at `team` in the list of `club`'s teams is with its tactic. Only reads.
    pub fn team_tactics(
        &self,
        club: &ClubSummary,
        team: usize,
        players: &PlayerIndex,
    ) -> Result<TeamTactics, MoveError> {
        let (layout, editor) = self.tactics_layout()?;
        let object = self.team_object(club, team)?;
        let id = self.team_id(object, layout, editor)?;
        let editor_on = self.process.read_bytes(self.plugin.base + editor.enabled, 1)?[0] == 1;
        let mut read = Vec::new();
        for member in self.club_team(club, team, object, players)?.players {
            let Some(player) = players.get(member.uid) else {
                continue;
            };
            let record = self.tactics_record(player, layout)?;
            let lists = if is_user_pointer(record) {
                let record = self.read_record(record, layout)?;
                let value_at = |list: &List| if list.entry == LIST_ENTRY { 0 } else { layout.store_value };
                Some(record.lists.iter().map(|list| list.values(value_at(list))).collect())
            } else {
                None
            };
            read.push(PlayerTactics { uid: player.uid, lists });
        }
        Ok(TeamTactics { id, editor_on, players: read })
    }

    fn tactics_layout(&self) -> Result<(&TacticsLayout, &EditorRvas), MoveError> {
        let layout = self.layout.tactics.as_ref().ok_or(MoveError::CallUnavailable)?;
        let editor = self.profile.as_ref().and_then(|p| p.editor.as_ref()).ok_or(MoveError::CallUnavailable)?;
        Ok((layout, editor))
    }

    /// The id of the team `object` in the game's teams table, checked against the table. `None` when the table does
    /// not have it there.
    fn team_id(&self, object: u64, layout: &TacticsLayout, editor: &EditorRvas) -> Result<Option<u32>, MoveError> {
        let id = self.process.read_u32(object + layout.team_id)?;
        let table = self.process.read_u64(self.plugin.base + editor.teams)?;
        if id > MOST_TEAM_ID || !is_user_pointer(table) {
            return Ok(None);
        }
        let list = self.process.read_u64(table + layout.teams)?;
        if !is_user_pointer(list) {
            return Ok(None);
        }
        let (begin, end) = (self.process.read_u64(list)?, self.process.read_u64(list + 8)?);
        let slot = begin + u64::from(id) * 8;
        let listed = is_user_pointer(begin) && slot < end && self.process.read_u64(slot)? == object;
        Ok(listed.then_some(id))
    }

    /// Where `player`'s familiarity record is, after checking he is still who he was.
    fn tactics_record(&self, player: &PlayerSummary, layout: &TacticsLayout) -> Result<u64, MoveError> {
        let p = &self.layout.player;
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        Ok(self.process.read_u64(player.address + p.at(layout.record, player.shift))?)
    }

    /// The lists, the store and the dirty byte of the record at `record`, each list checked to be one.
    fn read_record(&self, record: u64, layout: &TacticsLayout) -> Result<Record, MoveError> {
        let places = layout.lists.iter().map(|&at| (at, LIST_ENTRY)).chain([(layout.store, STORE_ENTRY)]);
        let mut lists = Vec::new();
        for (at, entry) in places {
            let words = self.process.read_bytes(record + at, 24)?;
            let word = |i: usize| u64::from_le_bytes(words[i * 8..i * 8 + 8].try_into().expect("8 bytes"));
            let (begin, end, capacity) = (word(0), word(1), word(2));
            let empty = begin == 0 && end == 0 && capacity == 0;
            let sane = empty
                || (is_user_pointer(begin)
                    && begin <= end
                    && end <= capacity
                    && (end - begin).is_multiple_of(entry)
                    && end - begin <= entry * MOST_ENTRIES);
            if !sane {
                return Err(MoveError::NotListed);
            }
            let bytes =
                if begin == end { Vec::new() } else { self.process.read_bytes(begin, (end - begin) as usize)? };
            lists.push(List { at, entry, begin, end, capacity, bytes });
        }
        let dirty = self.process.read_bytes(record + layout.dirty, 1)?[0];
        Ok(Record { lists, dirty })
    }
}

/// What the action did to a record, as percentages: the average familiarity of the entries it changed or added, before
/// (0 for an added one) and after. `None` when it changed none, or changed the record in a way the game's own doesn't
/// (an entry gone), which undoing could not put back.
fn raised_values(old: &Record, new: &Record, layout: &TacticsLayout) -> Option<(u8, u8)> {
    let (mut before, mut after, mut count) = (0u64, 0u64, 0u64);
    for (old, new) in old.lists.iter().zip(&new.lists) {
        let value_at = if old.entry == LIST_ENTRY { 0 } else { layout.store_value };
        if new.bytes.len() < old.bytes.len() {
            return None;
        }
        let (was, now) = (old.values(value_at), new.values(value_at));
        for (i, &value) in now.iter().enumerate() {
            let previous = was.get(i).copied();
            if previous != Some(value) {
                before += u64::from(previous.unwrap_or(0));
                after += u64::from(value);
                count += 1;
            }
        }
    }
    let percent = |total: u64| (total * 100 / (count * u64::from(MOST))).min(100) as u8;
    (count > 0).then(|| (percent(before), percent(after)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const LAYOUT: TacticsLayout = TacticsLayout {
        record: 0xF8,
        lists: Vec::new(),
        store: 0xC0,
        store_value: 0x0E,
        dirty: 0xDC,
        team_id: 0x08,
        teams: 0x88,
    };

    fn list(entries: &[u32]) -> List {
        let bytes: Vec<u8> = entries.iter().flat_map(|&value| (value | 3 << 14).to_le_bytes()).collect();
        List { at: 0, entry: LIST_ENTRY, begin: 0x1000, end: 0x1000 + bytes.len() as u64, capacity: 0x1100, bytes }
    }

    fn record(entries: &[u32], dirty: u8) -> Record {
        Record { lists: vec![list(entries)], dirty }
    }

    #[test]
    fn averages_the_changed_and_added_entries() {
        let raised = raised_values(&record(&[4_000, 10_000], 0), &record(&[10_000, 10_000, 10_000], 1), &LAYOUT);
        assert_eq!(raised, Some((20, 100)));
    }

    #[test]
    fn leaves_out_a_player_fully_familiar_already() {
        assert_eq!(raised_values(&record(&[10_000], 0), &record(&[10_000], 1), &LAYOUT), None);
    }

    #[test]
    fn refuses_a_list_that_got_shorter() {
        assert_eq!(raised_values(&record(&[4_000, 5_000], 0), &record(&[10_000], 1), &LAYOUT), None);
    }

    #[test]
    fn reads_the_store_value() {
        let mut entry = [0u8; 16];
        entry[0x0E..0x10].copy_from_slice(&7_500u16.to_le_bytes());
        let store = List { at: 0xC0, entry: STORE_ENTRY, begin: 1, end: 17, capacity: 17, bytes: entry.to_vec() };
        assert_eq!(store.values(0x0E), vec![7_500]);
    }
}
