//! A player's familiarity with his club, which the game's team cohesion is made of, and raising it to the most.
//!
//! The record a player's `relations` pointer leads to has a second list (see [`CohesionLayout`]): one small entry for
//! each club and nation he knows, with how familiar he is with it, 0 to 100. The game's own Max cohesion sets the entry
//! for the team's club to 100, or adds one. The editor does the first only: it allocates nothing, so a player the game
//! has not given an entry for his club yet is left as he is.
//!
//! The game may move a player's list, and reuse its old block, at any time. So neither raising nor undoing writes to
//! an address found earlier on its own say-so: each finds the entry again, from the player and the club, in the career
//! the session attached to, and writes only over the one byte it expects there.
//!
//! [`CohesionLayout`]: crate::profile::CohesionLayout

use fmlibre_mem::is_user_pointer;

use crate::clubs::ClubSummary;
use crate::players::PlayerSummary;
use crate::profile::CohesionLayout;
use crate::session::Session;
use crate::transfer::MoveError;

/// The most familiar a player can be with a club.
pub const MOST_FAMILIARITY: u8 = 100;

/// The longest list the editor reads; players know a handful of clubs and nations.
const MOST_ENTRIES: u64 = 256;

/// What marks an entry as a club's.
const CLUB: u8 = 1;

/// Raising a player's familiarity with his club, worked out: whose, with which club, and what it was.
#[derive(Debug, Clone)]
pub struct CohesionPlan {
    pub player: u32,
    /// How familiar he was with the club, 0 to 100.
    pub before: u8,
    target: Familiarity,
}

/// Raising that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct Cohered {
    pub player: u32,
    pub before: u8,
    target: Familiarity,
}

/// Whose familiarity with which club, to find the entry again before each write, and where its value was when the plan
/// was made.
#[derive(Debug, Clone)]
struct Familiarity {
    player: PlayerSummary,
    club: ClubSummary,
    address: u64,
}

impl Session {
    /// How familiar `player` is with `club`, 0 to 100, or `None` when he has no entry for it (or this build's layout
    /// does not place the list).
    pub fn club_familiarity(&self, player: &PlayerSummary, club: &ClubSummary) -> Result<Option<u8>, MoveError> {
        Ok(self.familiarity_entry(player, club)?.map(|(_, value)| value))
    }

    /// Works out raising the familiarity of `player` with `club` to the most, or `None` when it is there already.
    /// Nothing is written.
    pub fn plan_cohesion(&self, player: &PlayerSummary, club: &ClubSummary) -> Result<Option<CohesionPlan>, MoveError> {
        let (address, before) = self.familiarity_entry(player, club)?.ok_or(MoveError::NoFamiliarity)?;
        if before >= MOST_FAMILIARITY {
            return Ok(None);
        }
        let target = Familiarity { player: player.clone(), club: club.clone(), address };
        Ok(Some(CohesionPlan { player: player.uid, before, target }))
    }

    /// Writes planned raising, provided the entry is still where the plan found it and holds what it found. It changes
    /// a value in place, not the game's lists, so like a field edit it is not held back by
    /// [`Session::structure_lock`]; it is by a build or career the editor cannot vouch for.
    pub fn apply_cohesion(&self, plan: &CohesionPlan) -> Result<Cohered, MoveError> {
        if let Some(lock) = self.session_lock() {
            return Err(MoveError::Locked(lock));
        }
        let target = &plan.target;
        let now = self.familiarity_entry(&target.player, &target.club)?;
        let address = raise_at(now, target.address, plan.before)?;
        self.write_patch(address, &[plan.before], &[MOST_FAMILIARITY])?;
        Ok(Cohered { player: plan.player, before: plan.before, target: target.clone() })
    }

    /// Puts the familiarity back, provided the player's entry for the club, found again, still holds what the raising
    /// wrote. Refused in another career, where the player and club may be other objects.
    pub fn undo_cohesion(&self, done: &Cohered) -> Result<(), MoveError> {
        if let Some(lock) = self.session_lock() {
            return Err(MoveError::Locked(lock));
        }
        let target = &done.target;
        let now = self.familiarity_entry(&target.player, &target.club)?;
        let address = undo_at(now, target.address)?;
        self.write_patch(address, &[MOST_FAMILIARITY], &[done.before])
    }

    fn cohesion_layout(&self) -> Result<&CohesionLayout, MoveError> {
        self.layout.cohesion.as_ref().ok_or(MoveError::NoFamiliarity)
    }

    /// Where the familiarity of `player` with `club` is, and what it is: from the club entry the game's action would
    /// change (its flag clear) naming the club's internal id. Read now, after checking both are still who they were.
    fn familiarity_entry(&self, player: &PlayerSummary, club: &ClubSummary) -> Result<Option<(u64, u8)>, MoveError> {
        let (p, c) = (&self.layout.player, self.cohesion_layout()?);
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        if self.process.read_u32(club.address + self.layout.club.uid)? != club.uid {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        let club_id = self.process.read_u32(club.address + c.club_id)?;
        let record = self.process.read_u64(player.address + p.at(p.relations, player.shift))?;
        if !is_user_pointer(record) {
            return Ok(None);
        }
        let words = self.process.read_bytes(record + c.list, 24)?;
        let word = |i: usize| u64::from_le_bytes(words[i * 8..i * 8 + 8].try_into().expect("8 bytes"));
        let (begin, end, capacity) = (word(0), word(1), word(2));
        if begin == end {
            return Ok(None);
        }
        let sane = is_user_pointer(begin)
            && begin < end
            && end <= capacity
            && (end - begin).is_multiple_of(c.size)
            && end - begin <= c.size * MOST_ENTRIES;
        if !sane {
            return Err(MoveError::NotListed);
        }
        let bytes = self.process.read_bytes(begin, (end - begin) as usize)?;
        club_entry(&bytes, begin, c, club_id)
    }
}

/// Out of a player's list of entries, `bytes` read from `begin`: where the familiarity of the club entry the game's
/// action would change (its flag clear) naming `club_id` is, and what it is. `None` when there is none.
fn club_entry(bytes: &[u8], begin: u64, c: &CohesionLayout, club_id: u32) -> Result<Option<(u64, u8)>, MoveError> {
    let id = |entry: &[u8]| u32::from_le_bytes(entry[c.id as usize..c.id as usize + 4].try_into().expect("4 bytes"));
    let found = bytes
        .chunks_exact(c.size as usize)
        .enumerate()
        .find(|(_, entry)| entry[c.kind as usize] == CLUB && entry[c.flag as usize] == 0 && id(entry) == club_id);
    let Some((index, entry)) = found else {
        return Ok(None);
    };
    let value = entry[c.value as usize];
    if value > MOST_FAMILIARITY {
        return Err(MoveError::NotListed);
    }
    Ok(Some((begin + index as u64 * c.size + c.value, value)))
}

/// Where to raise, given the entry found now: only where the plan found it, still at what the plan found.
fn raise_at(now: Option<(u64, u8)>, planned: u64, before: u8) -> Result<u64, MoveError> {
    match now {
        Some((address, value)) if address == planned && value == before => Ok(address),
        Some(_) => Err(MoveError::Changed { address: planned }),
        None => Err(MoveError::NoFamiliarity),
    }
}

/// Where to put the familiarity back, given the entry found now: wherever the list keeps it now (the game may have
/// moved it), provided it still holds what the raising wrote.
fn undo_at(now: Option<(u64, u8)>, written: u64) -> Result<u64, MoveError> {
    match now {
        Some((address, MOST_FAMILIARITY)) => Ok(address),
        Some((address, _)) => Err(MoveError::Changed { address }),
        None => Err(MoveError::Changed { address: written }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// As the FM27 macOS layout places the list's entries.
    const LAYOUT: CohesionLayout =
        CohesionLayout { list: 0x18, id: 0x00, kind: 0x04, value: 0x05, flag: 0x06, size: 0x08, club_id: 0x08 };

    const BEGIN: u64 = 0x7000_0000;

    fn entry(id: u32, kind: u8, value: u8, flag: u8) -> [u8; 8] {
        let mut bytes = [0u8; 8];
        bytes[0..4].copy_from_slice(&id.to_le_bytes());
        (bytes[4], bytes[5], bytes[6]) = (kind, value, flag);
        bytes
    }

    fn list(entries: &[[u8; 8]]) -> Vec<u8> {
        entries.concat()
    }

    #[test]
    fn finds_the_clubs_own_entry_only() {
        // A nation with the club's id, the club's entry the game's action leaves alone, then the one it changes.
        let bytes =
            list(&[entry(331, 2, 90, 0), entry(331, CLUB, 80, 1), entry(12, CLUB, 70, 0), entry(331, CLUB, 46, 0)]);
        assert_eq!(club_entry(&bytes, BEGIN, &LAYOUT, 331).unwrap(), Some((BEGIN + 3 * 8 + 5, 46)));
        assert_eq!(club_entry(&bytes, BEGIN, &LAYOUT, 999).unwrap(), None);
    }

    #[test]
    fn refuses_a_familiarity_out_of_range() {
        let bytes = list(&[entry(331, CLUB, 101, 0)]);
        assert!(matches!(club_entry(&bytes, BEGIN, &LAYOUT, 331), Err(MoveError::NotListed)));
    }

    #[test]
    fn raises_only_where_and_what_the_plan_found() {
        let planned = BEGIN + 5;
        assert_eq!(raise_at(Some((planned, 46)), planned, 46).unwrap(), planned);
        // The list moved since the plan, or the game changed the value: nothing is written.
        assert!(matches!(raise_at(Some((BEGIN + 0x100 + 5, 46)), planned, 46), Err(MoveError::Changed { .. })));
        assert!(matches!(raise_at(Some((planned, 47)), planned, 46), Err(MoveError::Changed { .. })));
        assert!(matches!(raise_at(None, planned, 46), Err(MoveError::NoFamiliarity)));
    }

    #[test]
    fn undoes_where_the_entry_is_now_and_only_over_what_was_written() {
        let written = BEGIN + 5;
        assert_eq!(undo_at(Some((written, MOST_FAMILIARITY)), written).unwrap(), written);
        // The game moved the list: the entry, found again from the player and the club, is put back where it is now.
        let moved = BEGIN + 0x100 + 5;
        assert_eq!(undo_at(Some((moved, MOST_FAMILIARITY)), written).unwrap(), moved);
        // The game changed the value, or the entry is gone: the old address is never written to.
        assert!(matches!(undo_at(Some((written, 99)), written), Err(MoveError::Changed { .. })));
        assert!(matches!(undo_at(None, written), Err(MoveError::Changed { .. })));
    }
}
