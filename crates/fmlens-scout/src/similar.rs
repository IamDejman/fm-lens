//! How like one player another is: their attributes, the strong ones of the player they are compared with counting
//! most, and the positions they play. Players are compared as they are today, or both at their potential (see
//! [`crate::peak_attributes`]), which finds who could become what he will be.

use crate::attributes::{ATTRIBUTE_COUNT, GOALKEEPING, OUTFIELD, indices};
use crate::{MOST, Player, peak_attributes};
use std::sync::LazyLock;

/// The attribute difference, on FM's 1 to 20, at which two players count as nothing alike.
const UNLIKE: f32 = 8.0;

/// How much the attributes count against the positions.
const ATTRIBUTE_SHARE: f32 = 0.8;

/// A position counts when either player is rated this much there.
const PLAYED: u8 = 10;

/// What a goalkeeper is compared on: goalkeeping, his distribution, and the mental and physical attributes.
static GOALKEEPER_SET: LazyLock<Vec<usize>> = LazyLock::new(|| {
    let mut set = indices(&["first_touch", "passing"]);
    set.extend(14..OUTFIELD.end);
    set.extend(GOALKEEPING);
    set
});

/// What an outfield player is compared on: the technical, mental and physical attributes.
static OUTFIELD_SET: LazyLock<Vec<usize>> = LazyLock::new(|| OUTFIELD.collect());

/// A player others are compared with.
#[derive(Debug, Clone)]
pub struct Likeness {
    values: [f32; ATTRIBUTE_COUNT],
    positions: Vec<u8>,
    goalkeeper: bool,
    peak: bool,
}

impl Likeness {
    /// `player` as he is today, or at his potential with `peak`.
    pub fn new(player: &Player, peak: bool) -> Self {
        let values = if peak { peak_attributes(player) } else { player.values() };
        Self { values, positions: player.positions.to_vec(), goalkeeper: player.is_goalkeeper(), peak }
    }

    /// How like him `other` is, from 0 to 100: compared as he is today, or at his potential when he was taken at his.
    pub fn score(&self, other: &Player) -> u8 {
        let values = if self.peak { peak_attributes(other) } else { other.values() };
        let attributes: &[usize] = if self.goalkeeper { &GOALKEEPER_SET } else { &OUTFIELD_SET };
        let (mut sum, mut weight) = (0.0, 0.0);
        for &i in attributes {
            let (mine, theirs) = (self.values[i], values[i]);
            if mine <= 0.0 || theirs <= 0.0 {
                continue;
            }
            let w = 0.5 + mine / MOST;
            sum += w * (mine - theirs).powi(2);
            weight += w;
        }
        let attribute_score = if weight == 0.0 { 0.0 } else { (1.0 - (sum / weight).sqrt() / UNLIKE).max(0.0) };
        let played: Vec<f32> = self
            .positions
            .iter()
            .zip(other.positions)
            .filter(|&(&a, &b)| a.max(b) >= PLAYED)
            .map(|(&a, &b)| f32::from(a.abs_diff(b)))
            .collect();
        let position_score =
            if played.is_empty() { 1.0 } else { 1.0 - played.iter().sum::<f32>() / played.len() as f32 / (MOST - 1.0) };
        let score = ATTRIBUTE_SHARE * attribute_score + (1.0 - ATTRIBUTE_SHARE) * position_score;
        (score * 100.0).round().clamp(0.0, 100.0) as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_player::{level, set};

    fn player<'a>(attributes: &'a [u8], personality: &'a [u8], positions: &'a [u8], ca: u16, pa: i16) -> Player<'a> {
        Player { age: Some(20), current_ability: ca, potential_ability: pa, attributes, personality, positions }
    }

    #[test]
    fn the_same_player_is_wholly_alike_and_others_less() {
        let (striker, personality, st) = level(14, "st");
        let target = player(&striker, &personality, &st, 150, 160);
        let today = Likeness::new(&target, false);
        assert_eq!(today.score(&target), 100);

        let (mut close, _, _) = level(14, "st");
        set(&mut close, "finishing", 12);
        let near = today.score(&player(&close, &personality, &st, 145, 160));
        assert!((90..100).contains(&near), "{near}");

        let (weak, _, _) = level(6, "st");
        let far = today.score(&player(&weak, &personality, &st, 70, 90));
        assert!(far < near && far < 60, "{far}");

        let (keeper, _, gk) = level(14, "gk");
        assert!(today.score(&player(&keeper, &personality, &gk, 150, 160)) < near);
    }

    #[test]
    fn at_his_peak_a_youngster_can_match_a_star() {
        let (star_attributes, personality, st) = level(15, "st");
        let star = player(&star_attributes, &personality, &st, 160, 160);
        let (mut young_attributes, _, _) = level(10, "st");
        // What ability does not raise he has already.
        for key in [
            "aggression",
            "bravery",
            "determination",
            "flair",
            "leadership",
            "natural_fitness",
            "teamwork",
            "work_rate",
        ] {
            set(&mut young_attributes, key, 15);
        }
        let young = player(&young_attributes, &personality, &st, 100, 165);
        let peak = Likeness::new(&star, true);
        assert!(peak.score(&young) > Likeness::new(&star, false).score(&young));
        assert!(peak.score(&young) >= 90, "{}", peak.score(&young));
    }
}
