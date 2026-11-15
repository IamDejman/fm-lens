//! A player's career plans: the clubs, nations, competitions and continents the game has him aim for.
//!
//! The game keeps them as a list of pointers to 16-byte plans (see [`CareerPlanLayout`]), which its career plan rules
//! (one each for a club, a competition, a nation and a continent) walk for the player. The editor reads what each
//! plan points at and names it. The other bytes of a plan are not made sense of yet, so nothing is written.
//!
//! [`CareerPlanLayout`]: crate::profile::CareerPlanLayout

use fmlens_mem::is_user_pointer;
use serde::Serialize;

use crate::players::{PlayerSummary, nation_name, nation_uid};
use crate::profile::CareerPlanLayout;
use crate::session::Session;
use crate::text::read_fm_string;
use crate::transfer::MoveError;

/// The most plans the editor reads for a player; the longest list seen held four.
const MOST_PLANS: u64 = 64;

/// What a career plan aims for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PlanTarget {
    Club,
    Continent,
    Nation,
    Competition,
}

impl PlanTarget {
    /// The target the game's code `code` stands for.
    fn from_code(code: u8) -> Option<Self> {
        match code {
            3 => Some(Self::Club),
            5 => Some(Self::Continent),
            9 => Some(Self::Nation),
            25 => Some(Self::Competition),
            _ => None,
        }
    }
}

/// One career plan of a player.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CareerPlan {
    pub target: PlanTarget,
    /// The target's name; none for one the editor cannot name.
    pub name: Option<String>,
    /// The UID of a club, nation or competition.
    pub uid: Option<u32>,
}

impl Session {
    /// The pointers of the `(begin, end)` list at `header`, or `None` for one that does not check out or holds more
    /// than `most`.
    pub(crate) fn pointer_list(&self, header: u64, most: u64) -> Option<Vec<u64>> {
        let words = self.process.read_bytes(header, 16).ok()?;
        let begin = u64::from_le_bytes(words[..8].try_into().ok()?);
        let end = u64::from_le_bytes(words[8..].try_into().ok()?);
        if begin == 0 && end == 0 {
            return Some(Vec::new());
        }
        if !is_user_pointer(begin) || end < begin || !(end - begin).is_multiple_of(8) || end - begin > 8 * most {
            return None;
        }
        let bytes = self.process.read_bytes(begin, (end - begin) as usize).ok()?;
        Some(bytes.as_chunks::<8>().0.iter().map(|&word| u64::from_le_bytes(word)).collect())
    }

    /// The nation whose national teams the container at `container` holds: what a plan for a nation, and what a
    /// member of staff knows of one, point at. `None` where the layout does not place nations' containers.
    pub(crate) fn nation_of_container(&self, container: u64) -> Option<u64> {
        let n = self.layout.national.as_ref()?;
        self.process.read_u64(container + n.container_nation).ok().filter(|&nation| is_user_pointer(nation))
    }

    /// The career plans of `player`, in the game's order. Empty for a player without any, and where the layout does
    /// not place them. Only reads memory.
    pub fn career_plans(&self, player: &PlayerSummary) -> Result<Vec<CareerPlan>, MoveError> {
        let Some(l) = self.layout.career_plan.as_ref() else {
            return Ok(Vec::new());
        };
        let p = &self.layout.player;
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        let header = self.process.read_u64(player.address + p.at(l.list, player.shift))?;
        if !is_user_pointer(header) {
            return Ok(Vec::new());
        }
        let plans = self.pointer_list(header, MOST_PLANS).ok_or(MoveError::NotListed)?;
        Ok(plans.into_iter().filter_map(|plan| self.plan_at(l, plan)).collect())
    }

    /// The plan at `plan`, or `None` for one of a kind the editor does not know or that points nowhere.
    fn plan_at(&self, l: &CareerPlanLayout, plan: u64) -> Option<CareerPlan> {
        let bytes = is_user_pointer(plan).then(|| self.process.read_bytes(plan, l.size as usize).ok()).flatten()?;
        let target = PlanTarget::from_code(bytes[l.kind as usize])?;
        let at = u64::from_le_bytes(bytes[l.target as usize..l.target as usize + 8].try_into().ok()?);
        if !is_user_pointer(at) {
            return None;
        }
        let text = |name: u64| read_fm_string(&self.process, self.process.read_u64(at + name).ok()?);
        let uid = |uid: u64| self.process.read_u32(at + uid).ok();
        let competition = self.layout.competition.as_ref();
        let (name, uid) = match target {
            PlanTarget::Club => (text(self.layout.club.name), uid(self.layout.club.uid)),
            PlanTarget::Nation => {
                let nation = self.nation_of_container(at)?;
                (nation_name(&self.process, &self.layout, nation), nation_uid(&self.process, &self.layout, nation))
            }
            PlanTarget::Competition => (competition.and_then(|c| text(c.name)), competition.and_then(|c| uid(c.uid))),
            PlanTarget::Continent => (competition.and_then(|c| text(c.place_name)), None),
        };
        Some(CareerPlan { target, name: name.filter(|name| !name.trim().is_empty()), uid })
    }
}

#[cfg(test)]
mod tests {
    use super::PlanTarget;

    #[test]
    fn only_the_four_traced_codes_are_plans() {
        let known: Vec<u8> = (0..=u8::MAX).filter(|&code| PlanTarget::from_code(code).is_some()).collect();
        assert_eq!(known, [3, 5, 9, 25]);
        assert_eq!(PlanTarget::from_code(25), Some(PlanTarget::Competition));
    }
}
