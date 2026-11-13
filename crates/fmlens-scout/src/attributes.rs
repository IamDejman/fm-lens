//! The order FM Lens keeps a player's attributes, personality and positions in, as the editor reads them.

/// The player attributes, group after group as FM shows them: technical, mental, physical, goalkeeping, hidden and
/// feet. The editor's summaries keep them in this order (fmlens-core checks that its list is the same).
pub const ATTRIBUTES: [&str; ATTRIBUTE_COUNT] = [
    "corners",
    "crossing",
    "dribbling",
    "finishing",
    "first_touch",
    "free_kicks",
    "heading",
    "long_shots",
    "long_throws",
    "marking",
    "passing",
    "penalty_taking",
    "tackling",
    "technique",
    "aggression",
    "anticipation",
    "bravery",
    "composure",
    "concentration",
    "decisions",
    "determination",
    "flair",
    "leadership",
    "off_the_ball",
    "positioning",
    "teamwork",
    "vision",
    "work_rate",
    "acceleration",
    "agility",
    "balance",
    "jumping_reach",
    "natural_fitness",
    "pace",
    "stamina",
    "strength",
    "aerial_reach",
    "command_of_area",
    "communication",
    "eccentricity",
    "handling",
    "kicking",
    "one_on_ones",
    "punching",
    "reflexes",
    "rushing_out",
    "throwing",
    "consistency",
    "dirtiness",
    "important_matches",
    "injury_proneness",
    "versatility",
    "left_foot",
    "right_foot",
];

pub const ATTRIBUTE_COUNT: usize = 54;

/// The position ratings in the order FM stores them.
pub const POSITIONS: [&str; 15] =
    ["gk", "sw", "dl", "dc", "dr", "dm", "ml", "mc", "mr", "aml", "amc", "amr", "st", "wbl", "wbr"];

/// The personality ratings in the order FM stores them.
pub const PERSONALITY: [&str; 8] = [
    "adaptability",
    "ambition",
    "loyalty",
    "pressure",
    "professionalism",
    "sportsmanship",
    "temperament",
    "controversy",
];

/// Where the attribute `key` sits in [`ATTRIBUTES`].
pub fn attribute_index(key: &str) -> Option<usize> {
    ATTRIBUTES.iter().position(|&k| k == key)
}

/// Where the position `key` sits in [`POSITIONS`].
pub fn position_index(key: &str) -> Option<usize> {
    POSITIONS.iter().position(|&k| k == key)
}

/// The indices of `keys` in [`ATTRIBUTES`]; panics on a key that is not an attribute, which the tests rule out.
pub(crate) fn indices(keys: &[&str]) -> Vec<usize> {
    keys.iter().map(|key| attribute_index(key).unwrap_or_else(|| panic!("{key} is not an attribute"))).collect()
}

/// The technical, mental and physical attributes: what an outfield player is compared on.
pub(crate) const OUTFIELD: std::ops::Range<usize> = 0..36;

/// The goalkeeping attributes.
pub(crate) const GOALKEEPING: std::ops::Range<usize> = 36..47;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_sit_where_they_are_named() {
        assert_eq!(ATTRIBUTES.len(), ATTRIBUTE_COUNT);
        assert_eq!(ATTRIBUTES[OUTFIELD.start], "corners");
        assert_eq!(ATTRIBUTES[OUTFIELD.end - 1], "strength");
        assert_eq!(ATTRIBUTES[GOALKEEPING.start], "aerial_reach");
        assert_eq!(ATTRIBUTES[GOALKEEPING.end - 1], "throwing");
        let unique: std::collections::HashSet<_> = ATTRIBUTES.iter().collect();
        assert_eq!(unique.len(), ATTRIBUTE_COUNT);
        assert_eq!(position_index("st"), Some(12));
        assert_eq!(attribute_index("nothing"), None);
    }
}
