//! Work permits: the game keeps one record per player and nation that needs one (`TRANSFER_MANAGER`'s list), each
//! saying whether a permit was granted and when. Only read here: granting or taking one away is left to the game,
//! which keeps a second list of the granted ones in step.

use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::date::FmDate;
use crate::players::{PlayerSummary, nation_name, nation_uid};
use crate::session::Session;

/// The most records the list is read with; the save measured had 1,045.
const MOST_RECORDS: u64 = 100_000;

/// A player's work permit for one nation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkPermit {
    /// The nation the permit is for (England, for a player at an English club).
    pub nation: Option<String>,
    pub nation_uid: Option<u32>,
    pub granted: bool,
    /// When it was granted; none while it is not.
    pub granted_on: Option<FmDate>,
}

impl Session {
    /// The pointers to the work permit records, sorted by the id of the person they are for; none where the layout
    /// places no permits or the manager is not where it says. Only reads memory.
    fn permit_records(&self) -> Option<Vec<u64>> {
        let w = self.layout.work_permit.as_ref()?;
        let slot = self.profile.as_ref()?.transfer_manager?;
        let manager = self.process.read_u64(self.plugin.base + slot).ok().filter(|&m| is_user_pointer(m))?;
        if crate::rtti::class_of(&self.process, &self.plugin, manager).as_deref() != Some(w.class.as_str()) {
            return None;
        }
        let begin = self.process.read_u64(manager + w.records).ok()?;
        let end = self.process.read_u64(manager + w.records + 8).ok()?;
        let count = end.checked_sub(begin).filter(|len| len % 8 == 0)? / 8;
        if count == 0 {
            return Some(Vec::new());
        }
        if !is_user_pointer(begin) || count > MOST_RECORDS {
            return None;
        }
        let bytes = self.process.read_bytes(begin, (count * 8) as usize).ok()?;
        Some(bytes.as_chunks::<8>().0.iter().map(|word| u64::from_le_bytes(*word)).collect())
    }

    /// The work permits of `player`: one for each nation the game keeps a record of him for. Only reads memory.
    pub fn work_permits(&self, player: &PlayerSummary) -> Vec<WorkPermit> {
        let Some(w) = self.layout.work_permit.as_ref() else {
            return Vec::new();
        };
        let p = &self.layout.player;
        let Ok(id) = self.process.read_u32(player.address + p.at(w.person, player.shift)) else {
            return Vec::new();
        };
        let records = self.permit_records().unwrap_or_default();
        let person_of = |record: u64| self.process.read_u32(record + w.record_person).ok();
        // The list is sorted by person id: find the first of his, then read on while they are his.
        let first = records.partition_point(|&record| person_of(record).is_some_and(|other| other < id));
        records[first..]
            .iter()
            .take_while(|&&record| person_of(record) == Some(id))
            .filter_map(|&record| {
                let bytes = self.process.read_bytes(record, w.record_size as usize).ok()?;
                let nation = u64::from_le_bytes(bytes[..8].try_into().expect("8 bytes"));
                let nation = is_user_pointer(nation).then_some(nation);
                let u16_at = |at: u64| u16::from_le_bytes([bytes[at as usize], bytes[at as usize + 1]]);
                let granted = bytes[w.record_flags as usize] & 1 == 1;
                Some(WorkPermit {
                    nation: nation.and_then(|n| nation_name(&self.process, &self.layout, n)),
                    nation_uid: nation.and_then(|n| nation_uid(&self.process, &self.layout, n)),
                    granted,
                    granted_on: granted
                        .then(|| FmDate::from_raw(u16_at(w.record_granted_on), u16_at(w.record_granted_on + 2)))
                        .flatten(),
                })
            })
            .collect()
    }
}
