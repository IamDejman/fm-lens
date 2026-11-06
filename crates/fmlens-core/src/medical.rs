//! A player's current injuries and bans, and healing and lifting them.
//!
//! A player who was ever injured points at an injury record whose first field is the list
//! `(begin, end, capacity)` of his current injuries (see [`InjuryLayout`]). When he gets over
//! them the game empties that list and keeps the record: on the test save 5,354 players had an
//! empty list and 2,563 one injury. Healing does what the game does, and empties the list; the
//! injuries themselves are left where they are, unlisted, and come back with an undo.
//!
//! An injury's length can be changed: how many days from when it began he is out at the most, which the game reads
//! again each day. One injury can also be taken out of the list, the others staying.
//!
//! The same record lists his other absences: his bans, and others such as a call-up (see
//! [`BanLayout`]). A ban the game is done with leaves that list. Lifting his bans takes them out
//! of it the same way, and keeps the other absences.

use fmlens_mem::is_user_pointer;
use serde::Serialize;

use crate::date::FmDate;
use crate::players::PlayerSummary;
use crate::profile::{BanLayout, InjuryLayout};
use crate::relations::removal;
use crate::session::Session;
use crate::text::read_fm_string;
use crate::transfer::{MoveError, Patch, Patches};

/// The longest list of current injuries, or of absences, the editor reads.
const MOST_INJURIES: u64 = 16;

/// The longest an injury can be made to last, in days from when it began: two years.
const MOST_INJURY_DAYS: u16 = 730;

/// What marks an entry of the list of absences as a ban.
const BAN: u16 = 0xFFFF;

/// One current injury, as the profile shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Injury {
    /// The game's name for it, in the game's language, e.g. "omurgada zedelenme".
    pub name: Option<String>,
    pub started: Option<FmDate>,
    /// When he is expected back, at the soonest and at the latest.
    pub back_soonest: Option<FmDate>,
    pub back_latest: Option<FmDate>,
    /// How many days from when it began he is out at the most.
    pub days: u16,
}

/// A change to one of a player's injuries worked out: its new length, or its leaving the list.
#[derive(Debug, Clone)]
pub struct InjuryPlan {
    pub player: u32,
    pub before: Injury,
    /// The injury as the change leaves it; `None` when it leaves the list.
    pub after: Option<Injury>,
    patches: Vec<Patch>,
}

/// A change to one of a player's injuries that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct InjurySet {
    pub player: u32,
    pub before: Injury,
    pub after: Option<Injury>,
    patches: Vec<Patch>,
}

/// Healing worked out: the writes that empty the player's list of current injuries.
#[derive(Debug, Clone)]
pub struct HealPlan {
    pub player: u32,
    /// How many injuries he gets over.
    pub injuries: usize,
    patches: Vec<Patch>,
}

/// Healing that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct Healed {
    pub player: u32,
    pub injuries: usize,
    patches: Vec<Patch>,
}

/// One current ban, as the profile shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ban {
    pub started: Option<FmDate>,
    /// How many matches he still has to miss.
    pub matches: u8,
}

/// Lifting worked out: the writes that take the player's bans out of his list of absences.
#[derive(Debug, Clone)]
pub struct LiftPlan {
    pub player: u32,
    /// How many bans are lifted.
    pub bans: usize,
    patches: Vec<Patch>,
}

/// Lifting that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct Lifted {
    pub player: u32,
    pub bans: usize,
    patches: Vec<Patch>,
}

/// A list of a player's injury record: where its header is, and its records.
struct InjuryList {
    header: u64,
    begin: u64,
    end: u64,
    records: Vec<u64>,
}

impl Session {
    /// The current injuries of `player`, read now.
    pub fn injuries(&self, player: &PlayerSummary) -> Result<Vec<Injury>, MoveError> {
        let Some(list) = self.injury_list(player)? else {
            return Ok(Vec::new());
        };
        list.records.iter().map(|&record| self.read_injury(record, &self.layout.injury)).collect()
    }

    /// How many current injuries `player` has; none when his list does not check out.
    pub(crate) fn injury_count(&self, player: &PlayerSummary) -> usize {
        self.injury_list(player).ok().flatten().map_or(0, |list| list.records.len())
    }

    /// Works out healing every current injury of `player`. Nothing is written.
    pub fn plan_heal(&self, player: &PlayerSummary) -> Result<HealPlan, MoveError> {
        let list = self.injury_list(player)?.filter(|list| !list.records.is_empty()).ok_or(MoveError::NotInjured)?;
        let mut patches = Patches::default();
        // The list ends where it begins; the injuries it held stay in its block, unlisted.
        patches.push(list.header + 8, list.end.to_le_bytes(), list.begin.to_le_bytes());
        Ok(HealPlan { player: player.uid, injuries: list.records.len(), patches: patches.0 })
    }

    /// Writes planned healing, each write only over what the plan found.
    pub fn apply_heal(&self, plan: &HealPlan) -> Result<Healed, MoveError> {
        self.apply_patches(&plan.patches)?;
        Ok(Healed { player: plan.player, injuries: plan.injuries, patches: plan.patches.clone() })
    }

    /// Lists the injuries again, provided the list is still as the healing left it.
    pub fn undo_heal(&self, done: &Healed) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// Works out making the injury at `index` in the list of `player` last `days` days from when it began, at the most.
    /// The soonest he is back comes forward with it where it would be later. Nothing is written.
    pub fn plan_injury_length(&self, player: &PlayerSummary, index: usize, days: u16) -> Result<InjuryPlan, MoveError> {
        let (record, before) = self.injury_at(player, index)?;
        if !(1..=MOST_INJURY_DAYS).contains(&days) {
            let max = i64::from(MOST_INJURY_DAYS);
            return Err(MoveError::OutOfRange { field: "days", value: days.into(), min: 1, max });
        }
        let i = &self.layout.injury;
        let bytes = self.process.read_bytes(record + i.shortest, 2)?;
        let shortest = u16::from_le_bytes([bytes[0], bytes[1]]);
        let mut patches = Patches::default();
        patches.push(record + i.longest, before.days.to_le_bytes(), days.to_le_bytes());
        patches.push(record + i.shortest, shortest.to_le_bytes(), shortest.min(days).to_le_bytes());
        if patches.0.is_empty() {
            return Err(MoveError::SameRelation);
        }
        let after = |days: u16| before.started.map(|date| date.plus_days(i64::from(days)));
        let changed = Injury { back_soonest: after(shortest.min(days)), back_latest: after(days), days, ..before.clone() };
        Ok(InjuryPlan { player: player.uid, before, after: Some(changed), patches: patches.0 })
    }

    /// Works out taking the injury at `index` out of the list of `player`, as healing does with all of them: the ones
    /// after it move up one. Nothing is written.
    pub fn plan_injury_removal(&self, player: &PlayerSummary, index: usize) -> Result<InjuryPlan, MoveError> {
        let list = self.injury_list(player)?.filter(|list| !list.records.is_empty()).ok_or(MoveError::NotInjured)?;
        let (_, before) = self.injury_at(player, index)?;
        let entries: Vec<Vec<u8>> = list.records.iter().map(|record| record.to_le_bytes().to_vec()).collect();
        let patches = removal(list.header, list.begin, &entries, index);
        Ok(InjuryPlan { player: player.uid, before, after: None, patches })
    }

    /// Writes a planned change to an injury, each write over the bytes it expects, after checking them all.
    pub fn apply_injury(&self, plan: &InjuryPlan) -> Result<InjurySet, MoveError> {
        self.apply_patches(&plan.patches)?;
        let InjuryPlan { player, ref before, ref after, ref patches } = *plan;
        Ok(InjurySet { player, before: before.clone(), after: after.clone(), patches: patches.clone() })
    }

    /// Puts the injury back as it was, provided the game still holds what the change wrote.
    pub fn undo_injury(&self, done: &InjurySet) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// The injury at `index` in the list of `player`: where it is, and what it is.
    fn injury_at(&self, player: &PlayerSummary, index: usize) -> Result<(u64, Injury), MoveError> {
        let list = self.injury_list(player)?.filter(|list| !list.records.is_empty()).ok_or(MoveError::NotInjured)?;
        let record = *list.records.get(index).ok_or(MoveError::NotInList { index })?;
        Ok((record, self.read_injury(record, &self.layout.injury)?))
    }

    /// The current bans of `player`, read now.
    pub fn bans(&self, player: &PlayerSummary) -> Result<Vec<Ban>, MoveError> {
        let Some(list) = self.absence_list(player)? else {
            return Ok(Vec::new());
        };
        list.records.iter().filter_map(|&entry| self.read_ban(entry, &self.layout.ban).transpose()).collect()
    }

    /// How many current bans `player` has; none when his list does not check out.
    pub(crate) fn ban_count(&self, player: &PlayerSummary) -> usize {
        self.bans(player).map_or(0, |bans| bans.len())
    }

    /// Works out lifting every current ban of `player`. Nothing is written.
    pub fn plan_lift_bans(&self, player: &PlayerSummary) -> Result<LiftPlan, MoveError> {
        let list = self.absence_list(player)?.ok_or(MoveError::NotBanned)?;
        let mut kept = Vec::new();
        for &entry in &list.records {
            if self.read_ban(entry, &self.layout.ban)?.is_none() {
                kept.push(entry);
            }
        }
        let bans = list.records.len() - kept.len();
        if bans == 0 {
            return Err(MoveError::NotBanned);
        }
        let bytes = |entries: &[u64]| entries.iter().flat_map(|entry| entry.to_le_bytes()).collect::<Vec<u8>>();
        let mut patches = Patches::default();
        // The absences he keeps move to the front, and the list ends after them; the bans stay in its block, unlisted.
        patches.push(list.begin, bytes(&list.records[..kept.len()]), bytes(&kept));
        let end = list.begin + 8 * kept.len() as u64;
        patches.push(list.header + 8, list.end.to_le_bytes(), end.to_le_bytes());
        Ok(LiftPlan { player: player.uid, bans, patches: patches.0 })
    }

    /// Writes planned lifting, each write only over what the plan found.
    pub fn apply_lift_bans(&self, plan: &LiftPlan) -> Result<Lifted, MoveError> {
        self.apply_patches(&plan.patches)?;
        Ok(Lifted { player: plan.player, bans: plan.bans, patches: plan.patches.clone() })
    }

    /// Lists the bans again, provided the list is still as the lifting left it.
    pub fn undo_lift_bans(&self, done: &Lifted) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// The list of current injuries of `player`, or `None` for a player never injured.
    fn injury_list(&self, player: &PlayerSummary) -> Result<Option<InjuryList>, MoveError> {
        let Some(record) = self.injury_record(player)? else {
            return Ok(None);
        };
        self.record_list(record).map(Some)
    }

    /// The list of absences of `player`, or `None` for a player who has no injury record.
    fn absence_list(&self, player: &PlayerSummary) -> Result<Option<InjuryList>, MoveError> {
        let Some(record) = self.injury_record(player)? else {
            return Ok(None);
        };
        self.record_list(record + self.layout.ban.list).map(Some)
    }

    /// The injury record of `player`, or `None` for a player who has none.
    fn injury_record(&self, player: &PlayerSummary) -> Result<Option<u64>, MoveError> {
        let p = &self.layout.player;
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        let record = self.process.read_u64(player.address + p.injuries)?;
        Ok(is_user_pointer(record).then_some(record))
    }

    /// The list whose header is at `header` in an injury record.
    fn record_list(&self, header: u64) -> Result<InjuryList, MoveError> {
        let begin = self.process.read_u64(header)?;
        let end = self.process.read_u64(header + 8)?;
        if begin == end {
            return Ok(InjuryList { header, begin, end, records: Vec::new() });
        }
        if !is_user_pointer(begin) || end < begin || !(end - begin).is_multiple_of(8) || end - begin > 8 * MOST_INJURIES
        {
            return Err(MoveError::NotListed);
        }
        let bytes = self.process.read_bytes(begin, (end - begin) as usize)?;
        let records: Vec<u64> = bytes.as_chunks::<8>().0.iter().map(|word| u64::from_le_bytes(*word)).collect();
        if !records.iter().all(|&record| is_user_pointer(record)) {
            return Err(MoveError::NotListed);
        }
        Ok(InjuryList { header, begin, end, records })
    }

    /// The ban `entry` of a list of absences is, or `None` for another absence.
    fn read_ban(&self, entry: u64, b: &BanLayout) -> Result<Option<Ban>, MoveError> {
        let bytes = self.process.read_bytes(entry, b.end() as usize)?;
        let u16_at = |offset: u64| u16::from_le_bytes([bytes[offset as usize], bytes[offset as usize + 1]]);
        if u16_at(b.marker) != BAN {
            return Ok(None);
        }
        let started = FmDate::from_raw(u16_at(b.started), u16_at(b.started + 2));
        Ok(Some(Ban { started, matches: bytes[b.matches as usize] }))
    }

    fn read_injury(&self, record: u64, i: &InjuryLayout) -> Result<Injury, MoveError> {
        let bytes = self.process.read_bytes(record, i.end() as usize)?;
        let u16_at = |offset: u64| u16::from_le_bytes([bytes[offset as usize], bytes[offset as usize + 1]]);
        let kind = u64::from_le_bytes(bytes[i.kind as usize..i.kind as usize + 8].try_into().expect("8 bytes"));
        let name = is_user_pointer(kind)
            .then(|| self.process.read_u64(kind + i.kind_name).ok())
            .flatten()
            .and_then(|text| read_fm_string(&self.process, text));
        let started = FmDate::from_raw(u16_at(i.started), u16_at(i.started + 2));
        let after = |days: u16| started.map(|date| date.plus_days(i64::from(days)));
        let days = u16_at(i.longest);
        Ok(Injury { name, started, back_soonest: after(u16_at(i.shortest)), back_latest: after(days), days })
    }
}
