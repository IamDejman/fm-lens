//! What a list is ranked for: a recipe of weighted attributes, and how well each person fits it.

use serde::{Deserialize, Serialize};

use crate::details::POSITIONS;
use crate::filter::{player_attribute, staff_attribute};
use crate::players::{PLAYABLE_RATING, PlayerSummary};
use crate::staff::StaffSummary;

/// One attribute of a recipe and what a point of it counts for.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Weight {
    /// An attribute key of the list's entity, e.g. "finishing" for players or "attacking" for staff.
    pub key: String,
    pub weight: f32,
}

/// What the player or staff list is ranked for. Without weights the list is not ranked.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BestFor {
    pub weights: Vec<Weight>,
    /// Position keys: only the players who can play one of them are listed. Empty for any position, and for staff.
    pub positions: Vec<String>,
}

/// How well a person fits a recipe.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Fit {
    /// 0 to 100: the weighted mean of the recipe's attributes, 100 for 20 in every one of them.
    pub score: f32,
    /// The rating (1–20) of each attribute of the recipe, in the recipe's order; 0 for one that is not known.
    pub values: Vec<u8>,
}

/// The jobs of those who run a club (chairperson, director, managing director, general manager, owner, president).
const BOARD_JOBS: [u8; 6] = [4, 6, 8, 24, 66, 70];

/// Whether `job`, a code of a contract, is one of the board's. The game keeps coaching attributes for the board,
/// high ones that mean nothing, so a ranked list leaves the board out unless it is filtered to one of its jobs.
pub fn board_job(job: Option<u8>) -> bool {
    job.is_some_and(|code| BOARD_JOBS.contains(&code))
}

impl BestFor {
    /// Whether the list is ranked at all.
    pub fn ranks(&self) -> bool {
        !self.weights.is_empty()
    }

    /// Whether `p` can play one of the recipe's positions; anyone can when it names none.
    pub fn plays(&self, p: &PlayerSummary) -> bool {
        self.positions.is_empty()
            || self.positions.iter().any(|key| {
                POSITIONS.iter().position(|&k| k == key).is_some_and(|i| p.position_ratings[i] >= PLAYABLE_RATING)
            })
    }

    pub fn player(&self, p: &PlayerSummary) -> Option<Fit> {
        self.fit(player_attribute, &p.attributes)
    }

    pub fn staff(&self, s: &StaffSummary) -> Option<Fit> {
        self.fit(staff_attribute, &s.attributes)
    }

    /// The fit of `attributes`, a summary's, placed by `index`. An attribute the person does not have (0) counts as
    /// none of it, so that a chairman with no coaching in him is not the best coach; with none of them there is no fit.
    fn fit(&self, index: impl Fn(&str) -> Option<usize>, attributes: &[u8]) -> Option<Fit> {
        let values: Vec<u8> = self
            .weights
            .iter()
            .map(|weight| index(&weight.key).and_then(|i| attributes.get(i)).copied().unwrap_or(0))
            .collect();
        let (sum, most) = self
            .weights
            .iter()
            .zip(&values)
            .filter(|(weight, _)| weight.weight > 0.0)
            .fold((0.0, 0.0), |(sum, most), (weight, value)| {
                (sum + weight.weight * f32::from(*value), most + weight.weight * 20.0)
            });
        (sum > 0.0).then(|| Fit { score: 100.0 * sum / most, values })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recipe(weights: &[(&str, f32)]) -> BestFor {
        BestFor {
            weights: weights.iter().map(|&(key, weight)| Weight { key: key.to_owned(), weight }).collect(),
            positions: Vec::new(),
        }
    }

    fn fit(best: &BestFor, values: &[(&str, u8)]) -> Option<Fit> {
        let index = |key: &str| values.iter().position(|(name, _)| *name == key);
        let attributes: Vec<u8> = values.iter().map(|&(_, value)| value).collect();
        best.fit(index, &attributes)
    }

    #[test]
    fn the_score_is_the_weighted_mean_out_of_a_hundred() {
        let best = recipe(&[("attacking", 3.0), ("tactical", 1.0)]);
        let coach = fit(&best, &[("attacking", 20), ("tactical", 10)]).unwrap();
        assert_eq!(coach.score, 87.5);
        assert_eq!(coach.values, [20, 10]);
        assert_eq!(fit(&best, &[("attacking", 20), ("tactical", 20)]).unwrap().score, 100.0);
    }

    #[test]
    fn the_board_is_told_from_the_staff() {
        assert!(board_job(Some(4)) && board_job(Some(70)) && board_job(Some(66)));
        assert!(!board_job(Some(20)) && !board_job(Some(10)) && !board_job(None));
    }

    #[test]
    fn an_attribute_he_does_not_have_counts_as_none_of_it() {
        let best = recipe(&[("attacking", 3.0), ("tactical", 1.0), ("juggling", 1.0)]);
        let coach = fit(&best, &[("attacking", 20), ("tactical", 0)]).unwrap();
        assert_eq!(coach.score, 60.0);
        assert_eq!(coach.values, [20, 0, 0]);
        assert_eq!(fit(&best, &[("attacking", 0), ("tactical", 0)]), None);
        assert_eq!(fit(&recipe(&[]), &[("attacking", 16)]), None);
    }
}
