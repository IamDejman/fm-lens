//! Scouting estimates FM Lens works out from a player's own data: his attributes at his potential, how well he suits a
//! role, how like another player he is, how likely he is to reach his potential and how fast he is growing, and the
//! record of how he developed in other careers.
//!
//! None of this is read from FM. FM does not store attributes at a player's potential, role ratings or a chance of
//! development; these are FM Lens's own estimates, explained in docs/SCOUTING.md. Nothing here touches the game, so
//! the crate builds and tests on any platform.

mod attributes;
pub mod development;
pub mod history;
pub mod peak;
pub mod roles;
pub mod similar;

pub use attributes::{ATTRIBUTE_COUNT, ATTRIBUTES, PERSONALITY, POSITIONS, attribute_index, position_index};
pub use development::{Development, WITHIN, development};
pub use peak::{peak_attributes, resolved_potential};
pub use roles::{Duty, ROLES, Role, role};
pub use similar::Likeness;

/// The ratings FM shows a player's attributes on run from 1 to 20.
pub const MOST: f32 = 20.0;

/// FM calls a player accomplished in a position from this rating.
pub const ACCOMPLISHED: u8 = 15;

/// A player as the estimates see him.
#[derive(Debug, Clone, Copy)]
pub struct Player<'a> {
    /// Age on the in-game date.
    pub age: Option<u16>,
    /// 1 to 200.
    pub current_ability: u16,
    /// 1 to 200; a negative value is one of FM's ranges (see [`resolved_potential`]).
    pub potential_ability: i16,
    /// The attributes as FM shows them (1 to 20), in [`ATTRIBUTES`] order; 0 for one that is not known.
    pub attributes: &'a [u8],
    /// The personality ratings (1 to 20), in [`PERSONALITY`] order; empty when they are not known.
    pub personality: &'a [u8],
    /// The 15 position ratings (1 to 20), in [`POSITIONS`] order.
    pub positions: &'a [u8],
}

impl Player<'_> {
    /// The attribute `key`, when it is known.
    pub fn attribute(&self, key: &str) -> Option<u8> {
        attribute_index(key).and_then(|i| self.attributes.get(i).copied()).filter(|&value| value > 0)
    }

    /// The personality rating `key`, when it is known.
    pub fn personality(&self, key: &str) -> Option<u8> {
        PERSONALITY.iter().position(|&k| k == key).and_then(|i| self.personality.get(i).copied()).filter(|&v| v > 0)
    }

    /// Whether he is a goalkeeper: accomplished in goal.
    pub fn is_goalkeeper(&self) -> bool {
        self.positions.first().is_some_and(|&rating| rating >= ACCOMPLISHED)
    }

    /// His attributes as numbers, in [`ATTRIBUTES`] order; 0 for one that is not known.
    pub fn values(&self) -> [f32; ATTRIBUTE_COUNT] {
        let mut values = [0.0; ATTRIBUTE_COUNT];
        for (value, &raw) in values.iter_mut().zip(self.attributes) {
            *value = f32::from(raw);
        }
        values
    }
}

#[cfg(test)]
pub(crate) mod test_player {
    use super::*;

    /// A player with every attribute and personality rating at `level`, playing only `position` (rated 20).
    pub fn level(level: u8, position: &str) -> (Vec<u8>, Vec<u8>, Vec<u8>) {
        let mut positions = vec![1; POSITIONS.len()];
        positions[position_index(position).expect("a position")] = 20;
        (vec![level; ATTRIBUTE_COUNT], vec![level; PERSONALITY.len()], positions)
    }

    /// Sets the attribute `key` of `attributes`.
    pub fn set(attributes: &mut [u8], key: &str, value: u8) {
        attributes[attribute_index(key).expect("an attribute")] = value;
    }
}
