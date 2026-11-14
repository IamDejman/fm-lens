//! The records the game keeps of the positions a player has. Some days later it writes the rating a record holds
//! back over the player's own, so a position rating the editor changes only stays once its record is gone. The
//! game's own editor takes the record out of the list as it writes the rating; so does this one.

use fmlens_mem::{Process, is_user_pointer};

use crate::transfer::Patch;

/// Bytes in one record.
const SIZE: usize = 0x18;

/// Where a record keeps the place on the pitch it is for: the low six bits of a `u16`, signed.
const PLACE: usize = 8;

/// Where a record keeps the rating the game writes back over the player's own.
const RATING: usize = 0x14;

/// More records than any player has: the game knows 27 places on the pitch.
const MOST: u64 = 64;

/// The position, by its index in [`crate::POSITIONS`], that the game's editor takes a record of the place `place`
/// to be for, from the game's own tables. The places it gives no one position (the left or right of a pair in the
/// middle, and the ones no formation uses) have none, and there is no place for a sweeper.
fn position_of(place: i8) -> Option<usize> {
    Some(match place {
        -15 => 0,
        -13 => 4,
        -11 => 3,
        -9 => 2,
        -8 => 14,
        -6 => 5,
        -4 => 13,
        -3 => 8,
        -1 => 7,
        1 => 6,
        2 => 11,
        4 => 10,
        6 => 9,
        9 => 12,
        _ => return None,
    })
}

/// The place on the pitch the record `entry` is for.
fn place(entry: &[u8]) -> i8 {
    // The low six bits, sign-extended.
    ((entry[PLACE] << 2) as i8) >> 2
}

/// Whether `entry` reads as a record: a place the game knows, and ratings a position can have.
fn checks_out(entry: &[u8]) -> bool {
    (-15..=11).contains(&place(entry)) && entry[RATING..RATING + 3].iter().all(|&rating| rating <= 20)
}

/// The records of one player's positions, as the game holds them now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Records {
    /// Where the list's `(begin, end, capacity)` is.
    header: u64,
    begin: u64,
    entries: Vec<Vec<u8>>,
}

impl Records {
    /// Reads the records behind `pointer`, the one a player holds to their list; a player the game keeps none of
    /// holds no pointer and has none. `None` when what is there does not read as such a list, which nothing is
    /// then written to.
    pub(crate) fn read(process: &Process, pointer: u64) -> Option<Records> {
        if pointer == 0 {
            return Some(Records { header: 0, begin: 0, entries: Vec::new() });
        }
        if !is_user_pointer(pointer) {
            return None;
        }
        let header = process.read_bytes(pointer, 24).ok()?;
        let word = |at: usize| u64::from_le_bytes(header[at..at + 8].try_into().expect("8 bytes"));
        let (begin, end, capacity) = (word(0), word(8), word(16));
        let entries = if (begin, end, capacity) == (0, 0, 0) {
            Vec::new()
        } else {
            let length = end.checked_sub(begin)?;
            let fits = is_user_pointer(begin)
                && end <= capacity
                && length.is_multiple_of(SIZE as u64)
                && length <= MOST * SIZE as u64;
            if !fits {
                return None;
            }
            process
                .read_bytes(begin, length as usize)
                .ok()?
                .as_chunks::<SIZE>()
                .0
                .iter()
                .map(|entry| entry.to_vec())
                .collect()
        };
        entries.iter().all(|entry| checks_out(entry)).then_some(Records { header: pointer, begin, entries })
    }

    /// The writes that take the record of the position `position` (its index in [`crate::POSITIONS`]) out of the
    /// list, the first one as in the game's editor; none when the player has no record of it.
    pub(crate) fn removal(&self, position: usize) -> Vec<Patch> {
        match self.entries.iter().position(|entry| position_of(place(entry)) == Some(position)) {
            Some(index) => crate::relations::removal(self.header, self.begin, &self.entries, index),
            None => Vec::new(),
        }
    }

    /// For each record of a position: that position, and the rating the record holds for it.
    pub(crate) fn ratings(&self) -> impl Iterator<Item = (usize, u8)> + '_ {
        self.entries.iter().filter_map(|entry| Some((position_of(place(entry))?, entry[RATING])))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::POSITIONS;

    /// A record as the game holds one: the place among the flags it shares a `u16` with.
    fn entry(word: u16, ratings: [u8; 4]) -> Vec<u8> {
        let mut entry = vec![0u8; SIZE];
        entry[..8].copy_from_slice(&[0xCB, 0x1A, 0xEA, 0x07, 0x72, 0x58, 0xEB, 0x07]);
        entry[PLACE..PLACE + 2].copy_from_slice(&word.to_le_bytes());
        entry[RATING..].copy_from_slice(&ratings);
        entry
    }

    #[test]
    fn a_record_names_its_place_in_six_signed_bits() {
        // Records read from the game: a left-back's, a centre-back's and a goalkeeper's.
        assert_eq!(place(&entry(0x1937, [20, 20, 20, 0])), -9);
        assert_eq!(place(&entry(0x1D75, [16, 14, 20, 1])), -11);
        assert_eq!(place(&entry(0x1871, [20, 20, 20, 0])), -15);
        assert_eq!(place(&entry(0x0009, [20, 20, 20, 0])), 9);
    }

    #[test]
    fn every_position_but_the_sweeper_has_one_place() {
        let positions: Vec<usize> = (-32..32).filter_map(position_of).collect();
        let mut sorted = positions.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), positions.len());
        let sweeper = POSITIONS.iter().position(|&key| key == "sw").expect("sweeper");
        assert_eq!(sorted, (0..POSITIONS.len()).filter(|&position| position != sweeper).collect::<Vec<_>>());
        assert_eq!(POSITIONS[position_of(-9).expect("left-back")], "dl");
        assert_eq!(POSITIONS[position_of(9).expect("striker")], "st");
        assert_eq!(POSITIONS[position_of(-8).expect("right wing-back")], "wbr");
    }

    #[test]
    fn only_a_place_the_game_knows_with_ratings_checks_out() {
        assert!(checks_out(&entry(0x1937, [20, 20, 20, 0])));
        assert!(!checks_out(&entry(0x1937, [21, 20, 20, 0])));
        // Place 12 is past the last the game's table has.
        assert!(!checks_out(&entry(0x000C, [20, 20, 20, 0])));
        assert!(!checks_out(&entry(0x0030, [20, 20, 20, 0])));
    }

    #[test]
    fn the_first_record_of_the_position_comes_out() {
        let (left, centre) = (entry(0x1937, [20, 20, 20, 0]), entry(0x1D75, [16, 14, 20, 1]));
        let records = Records { header: 0x100, begin: 0x1000, entries: vec![left.clone(), centre.clone()] };
        let position = |key: &str| POSITIONS.iter().position(|&name| name == key).expect("a position");

        assert_eq!(records.ratings().collect::<Vec<_>>(), [(position("dl"), 20), (position("dc"), 16)]);
        assert_eq!(
            records.removal(position("dl")),
            crate::relations::removal(0x100, 0x1000, &[left.clone(), centre.clone()], 0)
        );
        assert_eq!(records.removal(position("dc")), crate::relations::removal(0x100, 0x1000, &[left, centre], 1));
        assert!(records.removal(position("st")).is_empty());
    }
}
