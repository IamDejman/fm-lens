//! Moving a player to another club.
//!
//! Each team keeps a list of player pointers: the players under contract with it (those
//! out on loan too) and the players on loan to it. A player points at the team he plays
//! for, and his contract at the team that employs him. A move points both at the new
//! club's senior team, adds the player to that team's list and takes him out of his old
//! club's lists.
//!
//! The editor allocates nothing in the game, so the senior team's list must have room in
//! the block it already has: below its capacity, or up to the end of the allocator's block
//! (see [`HeapLayout`]). Only players with simple ties move: under contract with the club
//! they play for (no loans), not player-coaches, and not at a club a human manager runs,
//! whose tactics, training and the like point at its players too.
//!
//! Every write is a [`Patch`] holding the bytes it expects and the bytes it leaves, so a
//! move only lands on the memory it was planned from, and is only undone while the game
//! still holds what it wrote.

use std::fmt;

use fmlibre_mem::{Process, is_user_pointer};
use serde::Deserialize;

use crate::clubs::ClubSummary;
use crate::date::FmDate;
use crate::edit::{Entity, Kind};
use crate::players::PlayerSummary;
use crate::profile::HeapLayout;
use crate::session::Session;

/// The job code of a player's contract.
const PLAYER_JOB: u8 = 1;

/// The squad number of a player without one.
const NO_SQUAD_NUMBER: u8 = 255;

/// The listing bits of a contract: on the transfer list and on the loan list.
const LISTED: u8 = 0b11;

/// The longest list the editor reads; no squad comes near it.
const LONGEST_LIST: u64 = 2_000;

/// Bytes the editor writes at one address, with the bytes it expects to find there.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Patch {
    address: u64,
    before: Vec<u8>,
    after: Vec<u8>,
}

/// The contract a move gives the player, as stored: a wage in pounds per week and an end
/// date as a number like 20290630. What is left out stays as the contract has it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveTerms {
    pub wage: Option<i64>,
    pub expires: Option<i64>,
}

/// A move worked out from the game as it is now, ready to be written.
#[derive(Debug, Clone)]
pub struct MovePlan {
    pub player: u32,
    pub from_club: u32,
    pub to_club: u32,
    /// The writes, in the order they are made.
    patches: Vec<Patch>,
}

impl MovePlan {
    /// How many writes the move takes.
    pub fn writes(&self) -> usize {
        self.patches.len()
    }
}

/// A move that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct ClubMove {
    pub player: u32,
    pub from_club: u32,
    pub to_club: u32,
    patches: Vec<Patch>,
}

#[derive(Debug)]
pub enum MoveError {
    /// The player's object no longer carries his UID: the game has moved on.
    Moved {
        uid: u32,
    },
    /// The club no longer carries its UID, or has no senior team that points back at it.
    NotAClub {
        uid: u32,
    },
    /// The player has no club.
    FreeAgent,
    /// The player is at that club already.
    SameClub,
    /// The player is on loan, to his club or from it.
    OnLoan,
    /// A player-coach, who works as staff too.
    PlayerCoach,
    /// The contract does not point back at the player, is not a player's, or names two teams.
    UnusualContract,
    /// The player is at a club a human manager runs.
    HumanClub,
    /// One club is a men's club and the other a women's club.
    MenAndWomen,
    /// The player is not in his team's list once, or is in the new team's list already.
    NotListed,
    /// The new club's senior team has no room in its list for one more player.
    NoRoom {
        players: u64,
    },
    /// A contract term the editor does not write, such as an end date that has passed.
    OutOfRange {
        field: &'static str,
        value: i64,
        min: i64,
        max: i64,
    },
    /// Memory at `address` is not what the move expects there: the game has changed it.
    Changed {
        address: u64,
    },
    /// The bytes read back after writing are not the ones written.
    NotApplied {
        address: u64,
    },
    Memory(fmlibre_mem::Error),
}

impl fmt::Display for MoveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MoveError::Moved { uid } => {
                write!(f, "the player with UID {uid} has moved in the game's memory; reload and try again")
            }
            MoveError::NotAClub { uid } => write!(f, "the club with UID {uid} has no senior team to join"),
            MoveError::FreeAgent => f.write_str("the player has no club; free agents cannot be moved yet"),
            MoveError::SameClub => f.write_str("the player is at this club already"),
            MoveError::OnLoan => f.write_str("the player is on loan; players on loan cannot be moved yet"),
            MoveError::PlayerCoach => f.write_str("player-coaches cannot be moved: they work as staff too"),
            MoveError::UnusualContract => f.write_str("the player's contract is not a plain player's contract"),
            MoveError::HumanClub => f.write_str(
                "the player is at a club a human manager runs; its tactics and training point at him too, \
                 so he leaves it in the game itself",
            ),
            MoveError::MenAndWomen => f.write_str("one club is a men's club and the other a women's club"),
            MoveError::NotListed => f.write_str("the squad lists do not hold the player where they should"),
            MoveError::NoRoom { players } => write!(
                f,
                "the club's squad list has no room for another player ({players} now), and the editor cannot \
                 make it bigger"
            ),
            MoveError::OutOfRange { field, value, min, max } => {
                write!(f, "{value} is not a valid {field}; it takes {min} to {max}")
            }
            MoveError::Changed { address } => {
                write!(f, "the game has changed the memory at {address:#x} since; reload and try again")
            }
            MoveError::NotApplied { address } => write!(f, "wrote to {address:#x} but read back something else"),
            MoveError::Memory(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for MoveError {}

impl From<fmlibre_mem::Error> for MoveError {
    fn from(err: fmlibre_mem::Error) -> Self {
        MoveError::Memory(err)
    }
}

/// A list of pointers the game keeps as `(begin, end, capacity)` at `header`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PointerList {
    header: u64,
    begin: u64,
    end: u64,
    capacity: u64,
}

impl PointerList {
    /// The list whose header is at `header`, or `None` when the header does not hold one.
    fn read(process: &Process, header: u64) -> Result<Option<Self>, MoveError> {
        let bytes = process.read_bytes(header, 24)?;
        let word = |i: usize| u64::from_le_bytes(bytes[i * 8..i * 8 + 8].try_into().expect("8 bytes"));
        let (begin, end, capacity) = (word(0), word(1), word(2));
        let sane = is_user_pointer(begin)
            && begin <= end
            && end <= capacity
            && (end - begin).is_multiple_of(8)
            && (capacity - begin).is_multiple_of(8)
            && capacity - begin <= 8 * LONGEST_LIST;
        Ok(sane.then_some(Self { header, begin, end, capacity }))
    }

    fn len(&self) -> u64 {
        (self.end - self.begin) / 8
    }

    fn elements(&self, process: &Process) -> Result<Vec<u64>, MoveError> {
        let bytes = process.read_bytes(self.begin, (self.end - self.begin) as usize)?;
        Ok(bytes.as_chunks::<8>().0.iter().map(|word| u64::from_le_bytes(*word)).collect())
    }

    /// How many pointers its block holds: the capacity, or the whole block of the
    /// allocator when its size is known and nothing has been written past the capacity.
    fn room(&self, process: &Process, heap: &HeapLayout) -> Result<u64, MoveError> {
        let capacity = (self.capacity - self.begin) / 8;
        let Some(block) = heap.block_size(self.capacity - self.begin) else {
            return Ok(capacity);
        };
        let spare = process.read_bytes(self.capacity, (self.begin + block - self.capacity) as usize)?;
        Ok(if spare.iter().all(|&b| b == 0) { block / 8 } else { capacity })
    }
}

/// Collects the patches of a move, leaving out the ones that would change nothing.
#[derive(Default)]
struct Patches(Vec<Patch>);

impl Patches {
    fn push(&mut self, address: u64, before: impl Into<Vec<u8>>, after: impl Into<Vec<u8>>) {
        let (before, after) = (before.into(), after.into());
        if before != after {
            self.0.push(Patch { address, before, after });
        }
    }
}

impl Session {
    /// Works out moving `player` to the senior team of `club` from the game as it is now,
    /// under the contract `terms`. `human_clubs` are the UIDs of the clubs human managers
    /// run. Nothing is written.
    pub fn plan_club_move(
        &self,
        player: &PlayerSummary,
        club: &ClubSummary,
        terms: MoveTerms,
        human_clubs: &[u32],
    ) -> Result<MovePlan, MoveError> {
        let (process, layout) = (&self.process, &self.layout);
        let (p, c) = (&layout.player, &layout.contract);
        let today = self.game_date();
        self.check_terms(terms, today)?;
        let object = player.address;
        if process.read_u32(object + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        if player.shift != 0 {
            return Err(MoveError::PlayerCoach);
        }
        let team = process.read_u64(object + p.team)?;
        let contract = process.read_u64(object + p.at(p.contract, player.shift))?;
        if !is_user_pointer(team) || !is_user_pointer(contract) {
            return Err(MoveError::FreeAgent);
        }

        // The contract must be this player's, a player's, with one team to its name.
        let record = process.read_bytes(contract, c.end() as usize)?;
        let word =
            |offset: u64| u64::from_le_bytes(record[offset as usize..offset as usize + 8].try_into().expect("8 bytes"));
        let byte = |offset: u64| record[offset as usize];
        let employer = word(c.team);
        if word(c.owner) != object + p.person_block
            || byte(c.job) != PLAYER_JOB
            || word(c.senior_team) != employer
            || !is_user_pointer(employer)
        {
            return Err(MoveError::UnusualContract);
        }
        // He may play for another team of the club that employs him (a youth team), not another club's.
        let old_club = process.read_u64(team + layout.team.club)?;
        if !is_user_pointer(old_club) || process.read_u64(employer + layout.team.club)? != old_club {
            return Err(MoveError::OnLoan);
        }
        let from_club = process.read_u32(old_club + layout.club.uid)?;
        if human_clubs.contains(&from_club) {
            return Err(MoveError::HumanClub);
        }

        // The new club, and its senior team, which must point back at it.
        if process.read_u32(club.address + layout.club.uid)? != club.uid {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        if club.address == old_club {
            return Err(MoveError::SameClub);
        }
        let women = |address: u64| process.read_bytes(address + layout.club.women, 1).map(|b| b[0]);
        if women(old_club)? != women(club.address)? {
            return Err(MoveError::MenAndWomen);
        }
        let senior = match PointerList::read(process, club.address + layout.club.teams)? {
            Some(teams) if teams.len() > 0 => process.read_u64(teams.begin)?,
            _ => 0,
        };
        if !is_user_pointer(senior) || process.read_u64(senior + layout.team.club)? != club.address {
            return Err(MoveError::NotAClub { uid: club.uid });
        }

        // He must be in the list of the team he plays for, once. Every list of his club that holds him loses him:
        // his employer's often does too, and a youngster may be listed with more than one youth side.
        let mut old_teams = match PointerList::read(process, old_club + layout.club.teams)? {
            Some(teams) => teams.elements(process)?,
            None => Vec::new(),
        };
        old_teams.sort_unstable();
        old_teams.dedup();
        if !old_teams.contains(&team) || !old_teams.contains(&employer) {
            return Err(MoveError::NotListed);
        }
        let mut leaving = Vec::new();
        for &from in &old_teams {
            // A team without a list holds nobody.
            let Some(list) = PointerList::read(process, from + layout.team.players)? else {
                continue;
            };
            let elements = list.elements(process)?;
            let found: Vec<usize> = (0..elements.len()).filter(|&j| elements[j] == object).collect();
            match found[..] {
                [] => {}
                [index] => leaving.push((from, list, index, elements)),
                _ => return Err(MoveError::NotListed),
            }
        }
        if !leaving.iter().any(|&(from, ..)| from == team) {
            return Err(MoveError::NotListed);
        }
        // A team without a list has no block to add to.
        let joining =
            PointerList::read(process, senior + layout.team.players)?.ok_or(MoveError::NoRoom { players: 0 })?;
        if joining.elements(process)?.contains(&object) {
            return Err(MoveError::NotListed);
        }
        if joining.len() + 1 > joining.room(process, &layout.heap)? {
            return Err(MoveError::NoRoom { players: joining.len() });
        }

        let mut patches = Patches::default();
        // The player goes into the new list's first free slot, then the list takes it in.
        let slot = process.read_bytes(joining.end, 8)?;
        patches.push(joining.end, slot, object.to_le_bytes());
        let end = joining.end + 8;
        let header = [joining.end.to_le_bytes(), joining.capacity.to_le_bytes()].concat();
        patches.push(joining.header + 8, header, [end.to_le_bytes(), joining.capacity.max(end).to_le_bytes()].concat());

        // A contract with the new senior team from today, on the terms given, with no squad number, and off
        // the transfer and loan lists.
        for offset in [c.team, c.senior_team] {
            patches.push(contract + offset, employer.to_le_bytes(), senior.to_le_bytes());
        }
        let date_at = |offset: u64| &record[offset as usize..offset as usize + 4];
        if let Some(today) = today {
            for offset in [c.signed, c.joined] {
                // A date the game has not set stays unset.
                if Kind::Date.decode(date_at(offset)) != 0 {
                    patches.push(
                        contract + offset,
                        date_at(offset),
                        Kind::Date.encode(today.to_number(), date_at(offset)),
                    );
                }
            }
        }
        if let Some(wage) = terms.wage {
            let old = &record[c.wage as usize..c.wage as usize + 4];
            patches.push(contract + c.wage, old, Kind::I32.encode(wage, old));
        }
        if let Some(expires) = terms.expires {
            patches.push(contract + c.expires, date_at(c.expires), Kind::Date.encode(expires, date_at(c.expires)));
        }
        patches.push(contract + c.squad_number, [byte(c.squad_number)], [NO_SQUAD_NUMBER]);
        patches.push(contract + c.listing, [byte(c.listing)], [byte(c.listing) & !LISTED]);
        patches.push(object + p.team, team.to_le_bytes(), senior.to_le_bytes());

        // Out of the old lists: the players after him move up one, the list ends one earlier, and the
        // slot it gave up is cleared. On the way the list repeats its last player for a moment; it
        // never holds an empty slot.
        for (_, list, index, elements) in leaving {
            let last = elements.len() - 1;
            let bytes = |range: &[u64]| range.iter().flat_map(|e| e.to_le_bytes()).collect::<Vec<u8>>();
            patches.push(list.begin + index as u64 * 8, bytes(&elements[index..last]), bytes(&elements[index + 1..]));
            patches.push(list.header + 8, list.end.to_le_bytes(), (list.end - 8).to_le_bytes());
            patches.push(list.begin + last as u64 * 8, elements[last].to_le_bytes(), 0u64.to_le_bytes());
        }

        Ok(MovePlan { player: player.uid, from_club, to_club: club.uid, patches: patches.0 })
    }

    /// Writes a planned move. Every write lands only on the bytes the plan found, and is
    /// read back; when one fails, the ones before it are put back.
    pub fn apply_club_move(&self, plan: &MovePlan) -> Result<ClubMove, MoveError> {
        for patch in &plan.patches {
            self.expect(patch.address, &patch.before)?;
        }
        for (i, patch) in plan.patches.iter().enumerate() {
            if let Err(err) = self.write_patch(patch.address, &patch.before, &patch.after) {
                for done in plan.patches[..i].iter().rev() {
                    let _ = self.write_patch(done.address, &done.after, &done.before);
                }
                return Err(err);
            }
        }
        let MovePlan { player, from_club, to_club, ref patches } = *plan;
        Ok(ClubMove { player, from_club, to_club, patches: patches.clone() })
    }

    /// Moves the player back as he was, provided memory still holds everything the move
    /// wrote. When a write fails, the ones already undone are written again.
    pub fn undo_club_move(&self, done: &ClubMove) -> Result<(), MoveError> {
        for patch in &done.patches {
            self.expect(patch.address, &patch.after)?;
        }
        for (i, patch) in done.patches.iter().enumerate().rev() {
            if let Err(err) = self.write_patch(patch.address, &patch.after, &patch.before) {
                for redo in &done.patches[i + 1..] {
                    let _ = self.write_patch(redo.address, &redo.before, &redo.after);
                }
                return Err(err);
            }
        }
        Ok(())
    }

    /// Checks contract terms against the ranges the editor writes for those fields; an
    /// end date must also come after `today`.
    fn check_terms(&self, terms: MoveTerms, today: Option<FmDate>) -> Result<(), MoveError> {
        let check = |key: &'static str, value: Option<i64>, after: i64| -> Result<(), MoveError> {
            let Some(value) = value else {
                return Ok(());
            };
            let field = self.field(Entity::Player, key).map_err(|_| MoveError::UnusualContract)?;
            let min = field.min.max(after + 1);
            let date = field.kind != Kind::Date || FmDate::from_number(value).is_some();
            if !(min..=field.max).contains(&value) || !date {
                return Err(MoveError::OutOfRange { field: key, value, min, max: field.max });
            }
            Ok(())
        };
        check("contract.wage", terms.wage, i64::MIN)?;
        check("contract.expires", terms.expires, today.map_or(i64::MIN, FmDate::to_number))
    }

    /// Writes `bytes` over `expected`, and reads them back; on a mismatch `expected` goes back.
    fn write_patch(&self, address: u64, expected: &[u8], bytes: &[u8]) -> Result<(), MoveError> {
        self.expect(address, expected)?;
        self.process.write_bytes(address, bytes)?;
        if self.process.read_bytes(address, bytes.len())? != bytes {
            let _ = self.process.write_bytes(address, expected);
            return Err(MoveError::NotApplied { address });
        }
        Ok(())
    }

    fn expect(&self, address: u64, bytes: &[u8]) -> Result<(), MoveError> {
        if self.process.read_bytes(address, bytes.len())? != bytes {
            return Err(MoveError::Changed { address });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patches_that_change_nothing_are_left_out() {
        let mut patches = Patches::default();
        patches.push(0x10, [1u8], [1u8]);
        patches.push(0x20, [1u8], [2u8]);
        assert_eq!(patches.0, [Patch { address: 0x20, before: vec![1], after: vec![2] }]);
    }
}
