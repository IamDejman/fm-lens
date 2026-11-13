//! A player's attributes at his potential ability, as FM Lens projects them.
//!
//! FM does not store what a player's attributes will be once he reaches his potential. Across FM's players a typical
//! attribute a player relies on sits near 3 + CA / 12.5 (about 7 at CA 50, 11 at 100, 15 at 150 and 19 at 200), so
//! each point of ability he still has to gain is worth about 0.08 of an attribute point. The projection spreads that
//! growth over the attributes that make up his ability, more on his stronger ones (which his position leans on),
//! and caps each at 20. Attributes that FM leaves out of ability (determination, flair, work rate and the like, and the
//! hidden ones) stay as they are, and so do a goalkeeper's outfield skills and an outfield player's goalkeeping.

use crate::attributes::{ATTRIBUTE_COUNT, OUTFIELD, indices};
use crate::{MOST, Player};
use std::sync::LazyLock;

/// Attribute points a typical attribute gains for each point of ability.
pub const POINTS_PER_ABILITY: f32 = 0.08;

/// How much more, or less, than the typical growth an attribute can get for being one of his strong or weak ones.
const LEAST_SHARE: f32 = 0.5;
const MOST_SHARE: f32 = 1.5;

/// The technical, mental and physical attributes FM leaves out of ability: growth does not raise them.
const OUTSIDE_ABILITY: [&str; 8] =
    ["aggression", "bravery", "determination", "flair", "leadership", "natural_fitness", "teamwork", "work_rate"];

/// Besides the goalkeeping ones, the attributes a goalkeeper's ability is made of.
const GOALKEEPER_EXTRAS: [&str; 2] = ["first_touch", "passing"];

/// The attributes that grow with an outfield player's ability, and with a goalkeeper's.
static OUTFIELD_GROWTH: LazyLock<Vec<usize>> = LazyLock::new(|| {
    let outside = indices(&OUTSIDE_ABILITY);
    OUTFIELD.filter(|i| !outside.contains(i)).collect()
});
static GOALKEEPER_GROWTH: LazyLock<Vec<usize>> = LazyLock::new(|| {
    let outside = indices(&OUTSIDE_ABILITY);
    let mut growing: Vec<usize> = indices(&GOALKEEPER_EXTRAS);
    // The mental and physical attributes after the technical ones.
    growing.extend((14..OUTFIELD.end).filter(|i| !outside.contains(i)));
    growing.extend(indices(&[
        "aerial_reach",
        "command_of_area",
        "communication",
        "handling",
        "kicking",
        "one_on_ones",
        "punching",
        "reflexes",
        "rushing_out",
        "throwing",
    ]));
    growing
});

/// The potential ability FM's value `raw` stands for. A positive value is the ability itself. A negative one is one of
/// FM's ranges, which a running career has usually settled already: -1 to -10 run in steps of 20 up to 200 (-9 is 150
/// to 180) and -15 to -95 in steps of 20 between them (-95 is 160 to 190); the middle of the range stands for it. None
/// for 0.
pub fn resolved_potential(raw: i16) -> Option<u16> {
    match raw {
        0 => None,
        1.. => Some(raw.unsigned_abs().min(200)),
        _ => {
            let v = raw.unsigned_abs();
            let high = if v <= 10 { 20 * v } else { 2 * v };
            Some(high.saturating_sub(15).clamp(1, 200))
        }
    }
}

/// His attributes at his potential ability, in [`crate::ATTRIBUTES`] order, as numbers to one decimal place's use;
/// round them to show them. An attribute that is not known stays 0. With no ability left to gain they are his
/// attributes now.
pub fn peak_attributes(player: &Player) -> [f32; ATTRIBUTE_COUNT] {
    let mut values = player.values();
    let gap = match resolved_potential(player.potential_ability) {
        Some(potential) if potential > player.current_ability => f32::from(potential - player.current_ability),
        _ => return values,
    };
    let growing: &[usize] = if player.is_goalkeeper() { &GOALKEEPER_GROWTH } else { &OUTFIELD_GROWTH };
    let known: Vec<usize> = growing.iter().copied().filter(|&i| values[i] > 0.0).collect();
    if known.is_empty() {
        return values;
    }
    let mean = known.iter().map(|&i| values[i]).sum::<f32>() / known.len() as f32;
    let growth = gap * POINTS_PER_ABILITY;
    for i in known {
        let share = (values[i] / mean).clamp(LEAST_SHARE, MOST_SHARE);
        values[i] = (values[i] + growth * share).min(MOST);
    }
    values
}

/// `values` rounded as FM shows attributes: 1 to 20, 0 for one that is not known.
pub fn shown(values: &[f32]) -> Vec<u8> {
    values.iter().map(|&value| if value <= 0.0 { 0 } else { value.round().clamp(1.0, MOST) as u8 }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::attribute_index;
    use crate::test_player::{level, set};

    fn at(values: &[f32], key: &str) -> f32 {
        values[attribute_index(key).expect("an attribute")]
    }

    #[test]
    fn negative_potentials_are_the_middle_of_their_range() {
        assert_eq!(resolved_potential(165), Some(165));
        assert_eq!(resolved_potential(0), None);
        assert_eq!(resolved_potential(-10), Some(185));
        assert_eq!(resolved_potential(-9), Some(165));
        assert_eq!(resolved_potential(-95), Some(175));
        assert_eq!(resolved_potential(-1), Some(5));
        assert_eq!(resolved_potential(250), Some(200));
    }

    #[test]
    fn growth_goes_to_the_ability_attributes_his_strengths_first() {
        let (mut attributes, personality, positions) = level(10, "st");
        set(&mut attributes, "finishing", 14);
        set(&mut attributes, "marking", 4);
        let young = Player {
            age: Some(18),
            current_ability: 100,
            potential_ability: 150,
            attributes: &attributes,
            personality: &personality,
            positions: &positions,
        };
        let peak = peak_attributes(&young);
        // 50 points of ability: about four attribute points for a typical attribute.
        assert!((at(&peak, "passing") - 14.0).abs() < 0.5, "{}", at(&peak, "passing"));
        assert!(at(&peak, "finishing") - 14.0 > at(&peak, "passing") - 10.0, "strengths grow more");
        assert!(at(&peak, "marking") - 4.0 < at(&peak, "passing") - 10.0, "weaknesses grow less");
        assert_eq!(at(&peak, "determination"), 10.0, "not part of ability");
        assert_eq!(at(&peak, "handling"), 10.0, "an outfield player's goalkeeping stays");
        assert_eq!(at(&peak, "consistency"), 10.0, "hidden");

        let star = Player { current_ability: 150, potential_ability: 195, ..young };
        let (mut high, _, _) = level(19, "st");
        set(&mut high, "finishing", 20);
        let peak = peak_attributes(&Player { attributes: &high, ..star });
        assert_eq!(at(&peak, "finishing"), 20.0, "capped");
    }

    #[test]
    fn no_growth_without_ability_to_gain() {
        let (attributes, personality, positions) = level(12, "dc");
        let done = Player {
            age: Some(29),
            current_ability: 140,
            potential_ability: 135,
            attributes: &attributes,
            personality: &personality,
            positions: &positions,
        };
        assert_eq!(peak_attributes(&done), done.values());
        assert_eq!(shown(&[0.0, 0.4, 12.5, 19.6, 25.0]), [0, 1, 13, 20, 20]);
    }

    #[test]
    fn a_goalkeeper_grows_his_goalkeeping() {
        let (attributes, personality, positions) = level(10, "gk");
        let keeper = Player {
            age: Some(19),
            current_ability: 90,
            potential_ability: 140,
            attributes: &attributes,
            personality: &personality,
            positions: &positions,
        };
        let peak = peak_attributes(&keeper);
        assert!(at(&peak, "reflexes") > 13.0);
        assert!(at(&peak, "passing") > 13.0);
        assert_eq!(at(&peak, "finishing"), 10.0);
        assert_eq!(at(&peak, "eccentricity"), 10.0);
    }
}
