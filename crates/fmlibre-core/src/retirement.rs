//! The retirements the game has planned, and keeping a player from retiring.
//!
//! The game decides ahead of time who retires and when, and keeps those plans in its retirement manager, one object
//! a static next to the entity arrays points at (see [`RetirementLayout`]). The manager lists them twice: as pointers
//! to the 24-byte entries, and as an index of the same entries sorted by person id. An entry names the person by the
//! id the game gives him (player `player_person`), not by a pointer, and holds the date he retires.
//!
//! Keeping a player from retiring takes his entry out of both lists, the way the game drops one, and gives him the
//! trait "Will play football as long as possible" in place of "Will retire at top". The entry itself stays where it
//! is, unlisted, and comes back with an undo.
//!
//! [`RetirementLayout`]: crate::profile::RetirementLayout

use fmlibre_mem::{Module, Process, is_user_pointer};
use serde::Serialize;

use crate::date::FmDate;
use crate::players::PlayerSummary;
use crate::session::Session;
use crate::transfer::{MoveError, Patch, Patches, PointerList, removal_patches};

/// The name the compiler keeps for the class of the retirement manager.
const MANAGER_CLASS: &str = ".?AVRETIREMENT_MANAGER@@";

/// The traits (bits of player `traits`) "Will retire at top" and "Will play football as long as possible".
const RETIRE_AT_TOP: u32 = 48;
const PLAY_ON: u32 = 49;

/// Bytes per entry of the index by person id: the `u32` id, 4 spare bytes and the pointer to the entry.
const INDEX_ENTRY: usize = 16;

/// One retirement the game has planned.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedRetirement {
    /// The id the game gives the person who retires (player `player_person`).
    pub person: u32,
    pub date: Option<FmDate>,
    /// Where the entry is.
    #[serde(skip)]
    pub address: u64,
}

/// Keeping a player from retiring, worked out from the game as it is now and ready to be written.
#[derive(Debug, Clone)]
pub struct RetirementPlan {
    pub player: u32,
    /// The date he was to retire on; none when the game had not planned it yet.
    pub date: Option<FmDate>,
    patches: Vec<Patch>,
}

/// Keeping a player from retiring that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct RetirementSet {
    pub player: u32,
    pub date: Option<FmDate>,
    patches: Vec<Patch>,
}

/// The manager's two lists, as read.
struct Planned {
    /// The list of pointers; `None` when it is empty and has no block.
    list: Option<PointerList>,
    entries: Vec<u64>,
    /// The index by person id: where its header is, where it begins and ends, and its entries.
    index_header: u64,
    index_begin: u64,
    index_end: u64,
    index: Vec<[u8; INDEX_ENTRY]>,
}

impl Planned {
    /// Where the person `person` is in the index, and his entry's pointer.
    fn find(&self, person: u32) -> Option<(usize, u64)> {
        self.index.iter().enumerate().find_map(|(at, entry)| {
            let id = u32::from_le_bytes(entry[..4].try_into().expect("4 bytes"));
            (id == person).then(|| (at, u64::from_le_bytes(entry[8..].try_into().expect("8 bytes"))))
        })
    }
}

impl Session {
    /// Every retirement the game has planned, in the order it lists them; `None` when the editor cannot find them in
    /// this build.
    pub fn planned_retirements(&self) -> Result<Option<Vec<PlannedRetirement>>, MoveError> {
        let Some(planned) = self.planned()? else {
            return Ok(None);
        };
        planned.entries.iter().map(|&entry| self.read_retirement(entry)).collect::<Result<_, _>>().map(Some)
    }

    /// The date the game plans `player` to retire on: `Ok(None)` when it has planned none, and `Err` when the editor
    /// cannot tell (see [`Session::planned_retirements`]).
    pub fn planned_retirement(&self, player: &PlayerSummary) -> Result<Option<FmDate>, MoveError> {
        let planned = self.planned()?.ok_or(MoveError::NoRetirements)?;
        let person = self.person_id(player)?;
        match planned.find(person) {
            Some((_, entry)) => Ok(self.read_retirement(entry)?.date),
            None => Ok(None),
        }
    }

    /// Works out keeping `player` from retiring: his planned retirement taken out of the manager's lists, and the
    /// trait "Will play football as long as possible" in place of "Will retire at top". Nothing is written.
    pub fn plan_keep_playing(&self, player: &PlayerSummary) -> Result<RetirementPlan, MoveError> {
        let planned = self.planned()?.ok_or(MoveError::NoRetirements)?;
        let person = self.person_id(player)?;
        let mut patches = Patches::default();
        let mut date = None;
        if let Some((at, entry)) = planned.find(person) {
            let list = planned.list.as_ref().ok_or(MoveError::NoRetirements)?;
            let index = planned.entries.iter().position(|&listed| listed == entry).ok_or(MoveError::NoRetirements)?;
            date = self.read_retirement(entry)?.date;
            // The index first, as the game finds a person's entry by it; each list repeats its last entry for a
            // moment, then ends one earlier and clears the slot it gave up.
            let last = planned.index.len() - 1;
            let size = INDEX_ENTRY as u64;
            patches.push(
                planned.index_begin + at as u64 * size,
                planned.index[at..last].concat(),
                planned.index[at + 1..].concat(),
            );
            let end = planned.index_end;
            patches.push(planned.index_header + 8, end.to_le_bytes(), (end - size).to_le_bytes());
            patches.push(planned.index_begin + last as u64 * size, planned.index[last], [0; INDEX_ENTRY]);
            removal_patches(list, index, &planned.entries, &mut patches);
        }
        // The two traits share the mask's seventh byte.
        let p = &self.layout.player;
        let byte = player.address + p.at(p.traits, player.shift) + u64::from(RETIRE_AT_TOP / 8);
        let old = self.process.read_bytes(byte, 1)?[0];
        let new = (old & !(1 << (RETIRE_AT_TOP % 8))) | (1 << (PLAY_ON % 8));
        patches.push(byte, [old], [new]);
        if patches.0.is_empty() {
            return Err(MoveError::NotRetiring);
        }
        Ok(RetirementPlan { player: player.uid, date, patches: patches.0 })
    }

    /// Writes planned changes to a player's retirement, each write over the bytes it expects, after checking them
    /// all.
    pub fn apply_retirement(&self, plan: &RetirementPlan) -> Result<RetirementSet, MoveError> {
        self.apply_patches(&plan.patches)?;
        Ok(RetirementSet { player: plan.player, date: plan.date, patches: plan.patches.clone() })
    }

    /// Puts his planned retirement and traits back as they were, provided the game still holds what the change wrote.
    pub fn undo_retirement(&self, done: &RetirementSet) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// The retirement manager, found from its static and checked by its class; `None` when this build's layout does
    /// not place it or it does not check out.
    fn retirement_manager(&self) -> Option<u64> {
        let r = self.layout.retirement.as_ref()?;
        let rva = self.arrays.players.as_ref()?.pair_rva.checked_add_signed(r.manager)?;
        let manager = self.process.read_u64(self.plugin.base + rva).ok().filter(|&at| is_user_pointer(at))?;
        let vtable = self.process.read_u64(manager).ok()?;
        if self.retirement_class.get() != Some(&vtable) {
            if class_name(&self.process, &self.plugin, vtable)? != MANAGER_CLASS {
                return None;
            }
            let _ = self.retirement_class.set(vtable);
        }
        Some(manager)
    }

    /// The manager's lists, checked: as many entries in the index as in the list. `None` when the manager cannot be
    /// found.
    fn planned(&self) -> Result<Option<Planned>, MoveError> {
        let Some(manager) = self.retirement_manager() else {
            return Ok(None);
        };
        let r = self.layout.retirement.as_ref().expect("the manager was found");
        let header = |at: u64| -> Result<[u64; 3], MoveError> {
            let words = self.process.read_bytes(at, 24)?;
            Ok([0, 1, 2].map(|i| u64::from_le_bytes(words[i * 8..i * 8 + 8].try_into().expect("8 bytes"))))
        };
        // A list the game has not needed yet has no block.
        let list = match header(manager + r.planned)? {
            [0, 0, 0] => None,
            _ => Some(PointerList::read(&self.process, manager + r.planned)?.ok_or(MoveError::NoRetirements)?),
        };
        let entries = list.as_ref().map(|list| list.elements(&self.process)).transpose()?.unwrap_or_default();
        let index_header = manager + r.by_person;
        let [begin, end, capacity] = header(index_header)?;
        let size = INDEX_ENTRY as u64;
        let sane = (is_user_pointer(begin) || begin == 0)
            && begin <= end
            && end <= capacity
            && (end - begin).is_multiple_of(size)
            && (end - begin) / size == entries.len() as u64
            && entries.iter().all(|&entry| is_user_pointer(entry));
        if !sane {
            return Err(MoveError::NoRetirements);
        }
        let bytes = if end > begin { self.process.read_bytes(begin, (end - begin) as usize)? } else { Vec::new() };
        let index = bytes.as_chunks::<INDEX_ENTRY>().0.to_vec();
        Ok(Some(Planned { list, entries, index_header, index_begin: begin, index_end: end, index }))
    }

    /// The entry at `entry`.
    fn read_retirement(&self, entry: u64) -> Result<PlannedRetirement, MoveError> {
        let r = self.layout.retirement.as_ref().ok_or(MoveError::NoRetirements)?;
        let person = self.process.read_u32(entry + r.person)?;
        let raw = self.process.read_u32(entry + r.date)?;
        Ok(PlannedRetirement { person, date: FmDate::from_raw(raw as u16, (raw >> 16) as u16), address: entry })
    }

    /// The id the game gives `player`, once his object is checked to still be his.
    fn person_id(&self, player: &PlayerSummary) -> Result<u32, MoveError> {
        let (p, r) = (&self.layout.player, self.layout.retirement.as_ref().ok_or(MoveError::NoRetirements)?);
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        Ok(self.process.read_u32(player.address + p.at(r.player_person, player.shift))?)
    }
}

/// The name the compiler keeps for the class whose vtable is at `vtable`, e.g. `.?AVRETIREMENT_MANAGER@@`, when it is
/// one of the plugin's. As MSVC lays them out on x64, a vtable is preceded by a pointer to its complete object
/// locator: signature 1, the type descriptor's RVA at +12 and the locator's own at +20; the descriptor holds the name
/// after a vtable pointer and a spare word.
fn class_name(process: &Process, plugin: &Module, vtable: u64) -> Option<String> {
    let inside = |at: u64| (plugin.base..plugin.end()).contains(&at);
    if !inside(vtable) {
        return None;
    }
    let locator = process.read_u64(vtable - 8).ok().filter(|&at| inside(at))?;
    let bytes = process.read_bytes(locator, 24).ok()?;
    let word = |at: usize| u32::from_le_bytes(bytes[at..at + 4].try_into().expect("4 bytes"));
    if word(0) != 1 || u64::from(word(20)) != locator - plugin.base {
        return None;
    }
    let name = process.read_bytes(plugin.base + u64::from(word(12)) + 0x10, 128).ok()?;
    let end = name.iter().position(|&b| b == 0)?;
    String::from_utf8(name[..end].to_vec()).ok()
}
