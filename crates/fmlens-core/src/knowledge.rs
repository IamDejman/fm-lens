//! What a member of staff knows of each nation, 0 to 100: the knowledge his scouting draws on.
//!
//! The game keeps it as a list of pointers to entries (see [`KnowledgeLayout`]), one for each nation he knows
//! anything of; a nation without an entry he knows nothing of. The editor reads the nation and the level, and writes
//! nothing: how the game raises and lowers a level is not traced.
//!
//! [`KnowledgeLayout`]: crate::profile::KnowledgeLayout

use fmlens_mem::is_user_pointer;
use serde::Serialize;

use crate::players::{nation_name, nation_uid};
use crate::session::Session;
use crate::staff::StaffSummary;
use crate::transfer::MoveError;

/// The most nations the editor reads for one member of staff: more than the game has.
const MOST_NATIONS: u64 = 400;

/// The most a member of staff knows of a nation.
pub const MOST_KNOWLEDGE: u8 = 100;

/// What a member of staff knows of one nation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NationKnowledge {
    pub nation: Option<String>,
    pub nation_uid: u32,
    /// 0 to [`MOST_KNOWLEDGE`].
    pub level: u8,
}

impl Session {
    /// What `member` knows of nations, the best known first. Empty for one who knows of none, for one whose object is
    /// laid out as a player's (his list is not placed), and where the layout does not place the list. Only reads
    /// memory.
    pub fn nation_knowledge(&self, member: &StaffSummary) -> Result<Vec<NationKnowledge>, MoveError> {
        let Some(k) = self.layout.knowledge.as_ref() else {
            return Ok(Vec::new());
        };
        if member.shift != 0 {
            return Ok(Vec::new());
        }
        let st = &self.layout.staff;
        if self.process.read_u32(member.address + st.uid)? != member.uid {
            return Err(MoveError::Moved { uid: member.uid });
        }
        let header = self.process.read_u64(member.address + k.list)?;
        if !is_user_pointer(header) {
            return Ok(Vec::new());
        }
        let entries = self.pointer_list(header, MOST_NATIONS).ok_or(MoveError::NotListed)?;
        let mut known: Vec<NationKnowledge> = entries
            .into_iter()
            .filter_map(|entry| {
                let bytes = is_user_pointer(entry).then(|| self.process.read_bytes(entry, k.size as usize).ok())??;
                let container = u64::from_le_bytes(bytes[k.nation as usize..k.nation as usize + 8].try_into().ok()?);
                let nation = is_user_pointer(container).then(|| self.nation_of_container(container))??;
                let level = bytes[k.level as usize];
                let nation_uid = nation_uid(&self.process, &self.layout, nation)?;
                (level <= MOST_KNOWLEDGE).then(|| NationKnowledge {
                    nation: nation_name(&self.process, &self.layout, nation),
                    nation_uid,
                    level,
                })
            })
            .collect();
        // The game keeps them by the nation's id and lists the best known first, the rest as they are kept.
        known.sort_by_key(|known| std::cmp::Reverse(known.level));
        Ok(known)
    }
}
