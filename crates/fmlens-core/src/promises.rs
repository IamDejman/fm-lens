//! The promises made to a player, and closing one.
//!
//! The game keeps a promise as a record (`INTERACTION_PROMISE`, see [`PromiseLayout`]) that the game's promise manager,
//! the person it was made to, the person who made it and its subject all list. A player's own list hangs off his person
//! block, and holds the promises he made as well as those made to him; the editor shows those made to him that FM's
//! Promises page lists. The window names each by FM's number for it, as FM's own screens word it.
//!
//! Closing a promise does what the game does when one ends without being held against the player: it marks the record
//! closed, with the status FM gives such an ending, and ends it today. The record stays in every list, so the game
//! drops it 31 days later as it does every closed promise; until then an undo opens it again.

use fmlens_mem::is_user_pointer;
use serde::{Deserialize, Serialize};

use crate::date::FmDate;
use crate::players::PlayerSummary;
use crate::profile::PromiseLayout;
use crate::session::Session;
use crate::transfer::{MoveError, Patch, Patches};

/// The longest list of promises the editor reads.
const MOST_PROMISES: u64 = 64;

/// The status FM gives a promise that ended without being held against the player.
const ENDED: u8 = 1;

/// One promise made to a player, as the profile shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Promise {
    /// FM's number for the promise, e.g. 208 for playing him in his preferred position and role.
    pub id: u16,
    /// FM's status code: 0 while open.
    pub status: u8,
    /// Whether it has ended, kept or not.
    pub closed: bool,
    pub made: Option<FmDate>,
    /// When it is due while open; once closed, when it ended.
    pub due: Option<FmDate>,
}

/// Closing a promise worked out: the writes that close it.
#[derive(Debug, Clone)]
pub struct PromisePlan {
    pub player: u32,
    pub promise: Promise,
    patches: Vec<Patch>,
}

/// A promise closed: what undoing it takes.
#[derive(Debug, Clone)]
pub struct PromiseClosed {
    pub player: u32,
    pub promise: Promise,
    patches: Vec<Patch>,
}

impl Session {
    /// The promises made to `player`, in the game's order; none where the layout does not place them. Only reads memory.
    pub fn promises(&self, player: &PlayerSummary) -> Result<Vec<Promise>, MoveError> {
        let Some(l) = self.layout.promise.as_ref() else {
            return Ok(Vec::new());
        };
        self.promise_records(player, l)?.into_iter().map(|record| self.read_promise(record, l)).collect()
    }

    /// Works out closing the open promise at `index` in the promises of `player`, provided it is still `shown`, the one
    /// the editor showed there. Nothing is written.
    pub fn plan_close_promise(
        &self,
        player: &PlayerSummary,
        index: usize,
        shown: &Promise,
    ) -> Result<PromisePlan, MoveError> {
        let l = self.layout.promise.as_ref().ok_or(MoveError::NotInList { index })?;
        let record = *self.promise_records(player, l)?.get(index).ok_or(MoveError::NotInList { index })?;
        let promise = self.read_promise(record, l)?;
        if promise != *shown {
            return Err(MoveError::Changed { address: record });
        }
        if promise.closed {
            return Err(MoveError::NotInList { index });
        }
        let today = self.game_date().ok_or(MoveError::Changed { address: record + l.due })?;
        let bytes = self.process.read_bytes(record, l.end() as usize)?;
        let mut patches = Patches::default();
        let closed = bytes[l.closed as usize];
        patches.push(record + l.closed, [closed], [closed | 1]);
        patches.push(record + l.status, [bytes[l.status as usize]], [ENDED]);
        let due = &bytes[l.due as usize..l.due as usize + 4];
        let mut ended = today.day_of_year().to_le_bytes().to_vec();
        ended.extend(today.year.to_le_bytes());
        patches.push(record + l.due, due.to_vec(), ended);
        Ok(PromisePlan { player: player.uid, promise, patches: patches.0 })
    }

    /// Writes a planned closing, each write only over what the plan found.
    pub fn apply_close_promise(&self, plan: &PromisePlan) -> Result<PromiseClosed, MoveError> {
        self.apply_patches(&plan.patches)?;
        Ok(PromiseClosed { player: plan.player, promise: plan.promise.clone(), patches: plan.patches.clone() })
    }

    /// Opens the promise again, provided it is still as the closing left it.
    pub fn undo_close_promise(&self, done: &PromiseClosed) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// The records of the promises made to `player` that FM's Promises page lists: those in his list that point back at
    /// him and have a category. The others in his list are promises he made, or ones FM does not show.
    fn promise_records(&self, player: &PlayerSummary, l: &PromiseLayout) -> Result<Vec<u64>, MoveError> {
        let p = &self.layout.player;
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        let person = player.address + p.at(p.person_block, player.shift);
        let list = self.process.read_u64(person + l.list)?;
        if list == 0 {
            return Ok(Vec::new());
        }
        if !is_user_pointer(list) {
            return Err(MoveError::NotListed);
        }
        let header = self.process.read_bytes(list, 16)?;
        let begin = u64::from_le_bytes(header[0..8].try_into().expect("8 bytes"));
        let end = u64::from_le_bytes(header[8..16].try_into().expect("8 bytes"));
        if begin == end {
            return Ok(Vec::new());
        }
        if !is_user_pointer(begin) || end < begin || !(end - begin).is_multiple_of(8) || end - begin > 8 * MOST_PROMISES
        {
            return Err(MoveError::NotListed);
        }
        let bytes = self.process.read_bytes(begin, (end - begin) as usize)?;
        // The game points a promise at the person it was made to by his object, his person block or his identity.
        let him = [player.address, person, player.address + p.at(p.identity(), player.shift)];
        let mut records = Vec::new();
        for word in bytes.as_chunks::<8>().0 {
            let record = u64::from_le_bytes(*word);
            if !is_user_pointer(record) {
                return Err(MoveError::NotListed);
            }
            let fields = self.process.read_bytes(record, l.end() as usize)?;
            let at = l.person as usize;
            let person = u64::from_le_bytes(fields[at..at + 8].try_into().expect("8 bytes"));
            if him.contains(&person) && fields[l.category as usize] != 0 {
                records.push(record);
            }
        }
        Ok(records)
    }

    fn read_promise(&self, record: u64, l: &PromiseLayout) -> Result<Promise, MoveError> {
        let bytes = self.process.read_bytes(record, l.end() as usize)?;
        let u16_at = |offset: u64| u16::from_le_bytes([bytes[offset as usize], bytes[offset as usize + 1]]);
        let date = |offset: u64| FmDate::from_raw(u16_at(offset), u16_at(offset + 2));
        Ok(Promise {
            id: u16_at(l.id),
            status: bytes[l.status as usize],
            closed: bytes[l.closed as usize] & 1 == 1,
            made: date(l.made),
            due: date(l.due),
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::profile::Layout;

    const WINDOWS: &str = include_str!("../../../profiles/fm27/layout.toml");
    const MACOS: &str = include_str!("../../../profiles/fm27/layout-macos.toml");

    /// A promise record is 0x60 bytes and laid out the same on both systems; only where his list hangs in the
    /// person block differs (0x320 in a player on the Mac, 0x360 on Windows).
    #[test]
    fn both_layouts_place_promises_inside_the_record() {
        for (text, list_in_player) in [(MACOS, 0x320), (WINDOWS, 0x360)] {
            let layout: Layout = toml::from_str(text).expect("FM27 layout");
            let l = layout.promise.as_ref().expect("promise layout");
            assert!(l.end() <= 0x60);
            assert_eq!((l.person, l.due, l.closed, l.category, l.status), (0x20, 0x3C, 0x53, 0x55, 0x56));
            assert_eq!(layout.player.person_block + l.list, list_in_player);
        }
    }
}
