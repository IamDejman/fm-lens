//! A player's familiarity with his club, which the game's team cohesion is made of, and raising it to the most.
//!
//! The record a player's `relations` pointer leads to has a second list (see [`CohesionLayout`]): one small entry for
//! each club and nation he knows, with how familiar he is with it, 0 to 100. The game's own Max cohesion sets the entry
//! for the team's club to 100, or adds one. The editor does the first only: it allocates nothing, so a player the game
//! has not given an entry for his club yet is left as he is.
//!
//! [`CohesionLayout`]: crate::profile::CohesionLayout

use fmlibre_mem::is_user_pointer;

use crate::clubs::ClubSummary;
use crate::players::PlayerSummary;
use crate::profile::CohesionLayout;
use crate::session::Session;
use crate::transfer::{MoveError, Patch, Patches};

/// The most familiar a player can be with a club.
pub const MOST_FAMILIARITY: u8 = 100;

/// The longest list the editor reads; players know a handful of clubs and nations.
const MOST_ENTRIES: u64 = 256;

/// What marks an entry as a club's.
const CLUB: u8 = 1;

/// Raising a player's familiarity with his club, worked out: the write, and what it was.
#[derive(Debug, Clone)]
pub struct CohesionPlan {
    pub player: u32,
    /// How familiar he was with the club, 0 to 100.
    pub before: u8,
    patches: Vec<Patch>,
}

/// Raising that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct Cohered {
    pub player: u32,
    pub before: u8,
    patches: Vec<Patch>,
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
        let c = self.cohesion_layout()?;
        let (entry, before) = self.familiarity_entry(player, club)?.ok_or(MoveError::NoFamiliarity)?;
        if before >= MOST_FAMILIARITY {
            return Ok(None);
        }
        let mut patches = Patches::default();
        patches.push(entry + c.value, [before], [MOST_FAMILIARITY]);
        Ok(Some(CohesionPlan { player: player.uid, before, patches: patches.0 }))
    }

    /// Writes planned raising, only over what the plan found. It changes a value in place, not the game's lists, so
    /// like a field edit it is not held back by [`Session::structure_lock`].
    pub fn apply_cohesion(&self, plan: &CohesionPlan) -> Result<Cohered, MoveError> {
        self.write_patches(&plan.patches)?;
        Ok(Cohered { player: plan.player, before: plan.before, patches: plan.patches.clone() })
    }

    /// Puts the familiarity back, provided it is still what the raising wrote.
    pub fn undo_cohesion(&self, done: &Cohered) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    fn cohesion_layout(&self) -> Result<&CohesionLayout, MoveError> {
        self.layout.cohesion.as_ref().ok_or(MoveError::NoFamiliarity)
    }

    /// The address of the entry of `player` for `club`, and its familiarity: a club entry the game's action would
    /// change (its flag clear) naming the club's internal id.
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
        let u32_at = |entry: &[u8], offset: u64| {
            u32::from_le_bytes(entry[offset as usize..offset as usize + 4].try_into().expect("4 bytes"))
        };
        let found = bytes.chunks(c.size as usize).enumerate().find(|(_, entry)| {
            entry[c.kind as usize] == CLUB && entry[c.flag as usize] == 0 && u32_at(entry, c.id) == club_id
        });
        let Some((index, entry)) = found else {
            return Ok(None);
        };
        let value = entry[c.value as usize];
        if value > MOST_FAMILIARITY {
            return Err(MoveError::NotListed);
        }
        Ok(Some((begin + index as u64 * c.size, value)))
    }
}
