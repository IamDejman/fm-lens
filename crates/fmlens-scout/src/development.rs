//! How a player is likely to develop, from his own data only: his age, current and potential ability, professionalism,
//! ambition, determination and injury proneness. His club, training, facilities and playing time are not taken into
//! account, so the same player is rated the same wherever he is.
//!
//! Each year a player closes part of the gap between his current and potential ability: most at 17 to 20, less every
//! year after, nothing from 29 (two years later for a goalkeeper). How much depends on his personality and how often he
//! is likely to be injured. The estimate follows that over the rest of his career, and over the next two years for the
//! progress rate.

use serde::Serialize;

use crate::{Player, resolved_potential};

/// A player has reached his potential, for the chance of development, once his current ability is this close to it.
pub const WITHIN: u16 = 7;

/// How spread out the outcome is around the expected one: the standard deviation of the log of the gap left.
const SPREAD: f32 = 0.6;

/// The share of the gap to his potential a player of average personality closes in a year, by age: from 15 years old.
const YEARLY: [f32; 14] = [0.24, 0.24, 0.26, 0.27, 0.27, 0.26, 0.23, 0.2, 0.16, 0.12, 0.08, 0.05, 0.03, 0.015];
const FIRST_AGE: u16 = 15;

/// Goalkeepers develop and peak about two years later.
const GOALKEEPER_DELAY: u16 = 2;

/// Upper bounds on the expected gain in ability over two years for each half star, from half a star to five.
const HALF_STARS: [f32; 10] = [1.0, 3.0, 5.0, 8.0, 11.0, 15.0, 19.0, 24.0, 30.0, 37.0];

/// The development estimates of one player.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Development {
    /// The chance, in percent, that his current ability comes within [`WITHIN`] of his potential during his career.
    pub probability: u8,
    /// The ability he is expected to gain over the next two years.
    pub gain: f32,
    /// That gain as a rate, in half stars from 0 to 10.
    pub half_stars: u8,
}

/// The share of the gap a player of average personality closes at `age`.
fn yearly(age: u16, goalkeeper: bool) -> f32 {
    let age = if goalkeeper { age.saturating_sub(GOALKEEPER_DELAY) } else { age };
    match age.checked_sub(FIRST_AGE) {
        None => YEARLY[0],
        Some(year) => YEARLY.get(usize::from(year)).copied().unwrap_or(0.0),
    }
}

/// How much faster than average a player develops: from about 0.6 for the least professional, ambitious and
/// determined to 1.4 for the most, less for one often injured.
fn pace(player: &Player) -> f32 {
    let rating = |value: Option<u8>| f32::from(value.unwrap_or(10));
    let professionalism = rating(player.personality("professionalism"));
    let ambition = rating(player.personality("ambition"));
    let determination = rating(player.attribute("determination"));
    let character = (2.0 * professionalism + ambition + determination) / 4.0;
    let injuries = 1.0 - 0.015 * (rating(player.attribute("injury_proneness")) - 8.0).max(0.0);
    (0.6 + 0.04 * character) * injuries
}

/// The development estimates of `player`; none when his age or potential is not known.
pub fn development(player: &Player) -> Option<Development> {
    let age = player.age?;
    let potential = resolved_potential(player.potential_ability)?;
    let gap = f32::from(potential.saturating_sub(player.current_ability));
    let pace = pace(player);
    let goalkeeper = player.is_goalkeeper();
    let mut left = gap;
    let mut gain = 0.0;
    for year in 0..25 {
        left *= 1.0 - (yearly(age + year, goalkeeper) * pace).min(0.9);
        if year == 1 {
            gain = gap - left;
        }
    }
    let probability = if gap <= f32::from(WITHIN) {
        100
    } else if left <= 0.01 {
        99
    } else {
        let chance = normal_cdf(((f32::from(WITHIN)).ln() - left.ln()) / SPREAD);
        (chance * 100.0).round().clamp(1.0, 99.0) as u8
    };
    let half_stars = HALF_STARS.iter().filter(|&&bound| gain >= bound).count() as u8;
    Some(Development { probability, gain, half_stars })
}

/// The standard normal distribution's cumulative probability at `x`.
fn normal_cdf(x: f32) -> f32 {
    0.5 * (1.0 + erf(x / std::f32::consts::SQRT_2))
}

/// The error function, to within 1.5e-7 (Abramowitz and Stegun 7.1.26).
fn erf(x: f32) -> f32 {
    let sign = x.signum();
    let x = f64::from(x.abs());
    let t = 1.0 / (1.0 + 0.327_591_1 * x);
    let poly =
        t * (0.254_829_592 + t * (-0.284_496_736 + t * (1.421_413_741 + t * (-1.453_152_027 + t * 1.061_405_429))));
    sign * (1.0 - poly * (-x * x).exp()) as f32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_player::{level, set};

    fn estimate(age: u16, ca: u16, pa: i16, character: u8, injury_proneness: u8) -> Option<Development> {
        let (mut attributes, mut personality, positions) = level(10, "mc");
        set(&mut attributes, "determination", character);
        set(&mut attributes, "injury_proneness", injury_proneness);
        personality.fill(character);
        development(&Player {
            age: Some(age),
            current_ability: ca,
            potential_ability: pa,
            attributes: &attributes,
            personality: &personality,
            positions: &positions,
        })
    }

    #[test]
    fn character_and_age_decide_the_chance() {
        let model = estimate(18, 100, 160, 18, 5).expect("an estimate");
        let average = estimate(18, 100, 160, 10, 5).expect("an estimate");
        let lazy = estimate(18, 100, 160, 4, 5).expect("an estimate");
        assert!(model.probability > average.probability && average.probability > lazy.probability);
        assert!((55..85).contains(&model.probability), "{}", model.probability);
        assert!((20..50).contains(&average.probability), "{}", average.probability);
        assert!(lazy.probability < 20, "{}", lazy.probability);
        let fragile = estimate(18, 100, 160, 10, 20).expect("an estimate");
        assert!(fragile.probability < average.probability);

        let late = estimate(26, 100, 160, 18, 5).expect("an estimate");
        assert!(late.probability < 5, "{}", late.probability);
    }

    #[test]
    fn progress_is_the_gain_of_the_next_two_years() {
        let young = estimate(18, 100, 160, 10, 5).expect("an estimate");
        assert!((25.0..32.0).contains(&young.gain), "{}", young.gain);
        assert_eq!(young.half_stars, 8);
        let settled = estimate(25, 140, 150, 10, 5).expect("an estimate");
        assert!(settled.gain < 3.0 && settled.half_stars <= 1, "{settled:?}");
        let veteran = estimate(33, 140, 150, 10, 5).expect("an estimate");
        assert_eq!((veteran.half_stars, veteran.gain), (0, 0.0));
    }

    #[test]
    fn close_to_potential_is_certain_and_unknowns_give_nothing() {
        assert_eq!(estimate(30, 150, 155, 10, 5).map(|d| d.probability), Some(100));
        assert_eq!(estimate(18, 100, 0, 10, 5), None);
        let (attributes, personality, positions) = level(10, "mc");
        let ageless = Player {
            age: None,
            current_ability: 100,
            potential_ability: 150,
            attributes: &attributes,
            personality: &personality,
            positions: &positions,
        };
        assert_eq!(development(&ageless), None);
        assert!((normal_cdf(0.0) - 0.5).abs() < 1e-6);
        assert!((normal_cdf(1.96) - 0.975).abs() < 1e-3);
    }

    #[test]
    fn goalkeepers_develop_later() {
        assert_eq!(yearly(27, true), yearly(25, false));
        assert_eq!(yearly(40, false), 0.0);
        assert_eq!(yearly(12, false), YEARLY[0]);
    }
}
