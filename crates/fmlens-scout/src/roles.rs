//! Roles and duties, and how well a player suits each: FM Lens's own ratings, from the attributes each role leans on
//! (its key attributes count twice, its preferred ones once) and how well he plays the positions it is played from.
//! FM's own role ratings are not read; these are worked out the same way for every player, so they rank players
//! fairly against each other.

use std::sync::LazyLock;

use serde::Serialize;

use crate::MOST;
use crate::attributes::{ATTRIBUTE_COUNT, indices, position_index};

/// What a role asks of a player besides its attributes: to hold back, to link play or to go forward.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Duty {
    Defend,
    Support,
    Attack,
}

impl Duty {
    pub fn key(self) -> &'static str {
        match self {
            Duty::Defend => "defend",
            Duty::Support => "support",
            Duty::Attack => "attack",
        }
    }
}

/// A role with a duty.
#[derive(Debug, Clone, Copy)]
pub struct Role {
    /// The role, e.g. "ball_playing_defender".
    pub key: &'static str,
    pub duty: Duty,
    /// The positions it is played from (see [`crate::POSITIONS`]).
    pub positions: &'static [&'static str],
    /// The attributes it leans on most, and those that help.
    pub key_attributes: &'static [&'static str],
    pub preferred: &'static [&'static str],
}

/// How much a key attribute counts against a preferred one.
const KEY_WEIGHT: f32 = 2.0;

/// Highest a rating goes.
pub const MOST_RATING: u8 = 100;

impl Role {
    /// The role and its duty, e.g. "ball_playing_defender.defend": how the app names it.
    pub fn id(&self) -> String {
        format!("{}.{}", self.key, self.duty.key())
    }

    /// How well a player with these attributes (in [`crate::ATTRIBUTES`] order, 0 for one that is not known) and
    /// position ratings suits the role, from 0 to 100: the weighted average of its attributes on a scale of 100, less
    /// for a player who plays none of its positions well.
    pub fn rating(&self, attributes: &[f32; ATTRIBUTE_COUNT], positions: &[u8]) -> u8 {
        let weights = &WEIGHTS[self.index()];
        let (mut sum, mut weight) = (0.0, 0.0);
        for &(i, w) in weights {
            if attributes[i] > 0.0 {
                sum += attributes[i] * w;
                weight += w;
            }
        }
        if weight == 0.0 {
            return 0;
        }
        let familiar =
            POSITION_INDICES[self.index()].iter().filter_map(|&i| positions.get(i).copied()).max().unwrap_or(1);
        let rating = sum / weight / MOST * f32::from(MOST_RATING) * familiarity(familiar);
        rating.round().clamp(0.0, f32::from(MOST_RATING)) as u8
    }

    /// Where the role is in [`ROLES`]: found from its address when it is one of them, as [`role`] hands out.
    fn index(&self) -> usize {
        let (base, at, size) = (ROLES.as_ptr() as usize, self as *const Role as usize, size_of::<Role>());
        if (base..base + ROLES.len() * size).contains(&at) {
            return (at - base) / size;
        }
        ROLES.iter().position(|role| role.key == self.key && role.duty == self.duty).expect("a role of the list")
    }
}

/// How much of the attributes' worth a player keeps in a role with his best rating among its positions: all of it
/// from 18, 95% when accomplished (15), down to 30% for a position he cannot play.
fn familiarity(rating: u8) -> f32 {
    const POINTS: [(f32, f32); 6] = [(1.0, 0.3), (5.0, 0.5), (9.0, 0.7), (12.0, 0.85), (15.0, 0.95), (18.0, 1.0)];
    let r = f32::from(rating.clamp(1, 20));
    if r >= POINTS[POINTS.len() - 1].0 {
        return 1.0;
    }
    POINTS
        .windows(2)
        .find(|pair| r <= pair[1].0)
        .map(|pair| {
            let ((r0, f0), (r1, f1)) = (pair[0], pair[1]);
            f0 + (f1 - f0) * (r - r0) / (r1 - r0)
        })
        .unwrap_or(0.3)
}

/// The role with the id `id` (see [`Role::id`]).
pub fn role(id: &str) -> Option<&'static Role> {
    let (key, duty) = id.split_once('.')?;
    ROLES.iter().find(|role| role.key == key && role.duty.key() == duty)
}

/// Each role's attributes with their weights, and its positions, in [`ROLES`] order.
static WEIGHTS: LazyLock<Vec<Vec<(usize, f32)>>> = LazyLock::new(|| {
    ROLES
        .iter()
        .map(|role| {
            let key = indices(role.key_attributes).into_iter().map(|i| (i, KEY_WEIGHT));
            key.chain(indices(role.preferred).into_iter().map(|i| (i, 1.0))).collect()
        })
        .collect()
});
static POSITION_INDICES: LazyLock<Vec<Vec<usize>>> = LazyLock::new(|| {
    ROLES
        .iter()
        .map(|role| {
            role.positions
                .iter()
                .map(|key| position_index(key).unwrap_or_else(|| panic!("{key} is not a position")))
                .collect()
        })
        .collect()
});

use Duty::{Attack, Defend, Support};

const GK: &[&str] = &["gk"];
const DC: &[&str] = &["dc"];
const FULL_BACK: &[&str] = &["dl", "dr"];
const WING_BACK: &[&str] = &["dl", "dr", "wbl", "wbr"];
const DM: &[&str] = &["dm"];
const DM_MC: &[&str] = &["dm", "mc"];
const MC: &[&str] = &["mc"];
const PLAYMAKER: &[&str] = &["mc", "amc", "ml", "mr", "aml", "amr"];
const WIDE_MID: &[&str] = &["ml", "mr"];
const WIDE: &[&str] = &["ml", "mr", "aml", "amr"];
const WIDE_FORWARD: &[&str] = &["aml", "amr"];
const AMC: &[&str] = &["amc"];
const AMC_ST: &[&str] = &["amc", "st"];
const ST: &[&str] = &["st"];

/// Every role FM Lens rates, from the goal to the front.
pub static ROLES: &[Role] = &[
    Role {
        key: "goalkeeper",
        duty: Defend,
        positions: GK,
        key_attributes: &[
            "aerial_reach",
            "command_of_area",
            "communication",
            "handling",
            "kicking",
            "reflexes",
            "concentration",
            "positioning",
            "agility",
        ],
        preferred: &["one_on_ones", "throwing", "anticipation", "decisions"],
    },
    Role {
        key: "sweeper_keeper",
        duty: Support,
        positions: GK,
        key_attributes: &[
            "command_of_area",
            "kicking",
            "one_on_ones",
            "reflexes",
            "rushing_out",
            "anticipation",
            "composure",
            "concentration",
            "positioning",
            "agility",
        ],
        preferred: &[
            "aerial_reach",
            "communication",
            "first_touch",
            "handling",
            "passing",
            "throwing",
            "decisions",
            "vision",
            "acceleration",
        ],
    },
    Role {
        key: "central_defender",
        duty: Defend,
        positions: DC,
        key_attributes: &["heading", "marking", "tackling", "positioning", "jumping_reach", "strength"],
        preferred: &["aggression", "anticipation", "bravery", "composure", "concentration", "decisions", "pace"],
    },
    Role {
        key: "stopper",
        duty: Defend,
        positions: DC,
        key_attributes: &[
            "heading",
            "tackling",
            "aggression",
            "bravery",
            "decisions",
            "positioning",
            "jumping_reach",
            "strength",
        ],
        preferred: &["marking", "anticipation", "composure", "concentration"],
    },
    Role {
        key: "covering_defender",
        duty: Defend,
        positions: DC,
        key_attributes: &["marking", "anticipation", "concentration", "decisions", "positioning", "pace"],
        preferred: &["heading", "tackling", "bravery", "composure", "acceleration", "jumping_reach", "strength"],
    },
    Role {
        key: "ball_playing_defender",
        duty: Defend,
        positions: DC,
        key_attributes: &[
            "heading",
            "marking",
            "passing",
            "tackling",
            "composure",
            "positioning",
            "jumping_reach",
            "strength",
        ],
        preferred: &[
            "first_touch",
            "technique",
            "aggression",
            "anticipation",
            "bravery",
            "concentration",
            "decisions",
            "vision",
            "pace",
        ],
    },
    Role {
        key: "no_nonsense_defender",
        duty: Defend,
        positions: DC,
        key_attributes: &["heading", "marking", "tackling", "positioning", "jumping_reach", "strength"],
        preferred: &["aggression", "bravery", "anticipation", "concentration"],
    },
    Role {
        key: "full_back",
        duty: Defend,
        positions: FULL_BACK,
        key_attributes: &["marking", "tackling", "anticipation", "concentration", "positioning"],
        preferred: &["crossing", "passing", "decisions", "teamwork", "pace", "stamina"],
    },
    Role {
        key: "full_back",
        duty: Support,
        positions: FULL_BACK,
        key_attributes: &["marking", "tackling", "anticipation", "concentration", "positioning", "teamwork"],
        preferred: &["crossing", "dribbling", "passing", "technique", "decisions", "pace", "stamina"],
    },
    Role {
        key: "full_back",
        duty: Attack,
        positions: FULL_BACK,
        key_attributes: &["crossing", "marking", "tackling", "anticipation", "positioning", "teamwork"],
        preferred: &[
            "dribbling",
            "first_touch",
            "passing",
            "technique",
            "concentration",
            "decisions",
            "off_the_ball",
            "agility",
            "pace",
            "stamina",
        ],
    },
    Role {
        key: "wing_back",
        duty: Support,
        positions: WING_BACK,
        key_attributes: &[
            "crossing",
            "dribbling",
            "marking",
            "tackling",
            "off_the_ball",
            "teamwork",
            "work_rate",
            "acceleration",
            "stamina",
        ],
        preferred: &[
            "first_touch",
            "passing",
            "technique",
            "anticipation",
            "concentration",
            "decisions",
            "positioning",
            "agility",
            "balance",
            "pace",
        ],
    },
    Role {
        key: "wing_back",
        duty: Attack,
        positions: WING_BACK,
        key_attributes: &[
            "crossing",
            "dribbling",
            "tackling",
            "technique",
            "off_the_ball",
            "teamwork",
            "work_rate",
            "acceleration",
            "pace",
            "stamina",
        ],
        preferred: &[
            "first_touch",
            "marking",
            "passing",
            "anticipation",
            "concentration",
            "decisions",
            "flair",
            "positioning",
            "agility",
            "balance",
        ],
    },
    Role {
        key: "inverted_wing_back",
        duty: Support,
        positions: WING_BACK,
        key_attributes: &["passing", "tackling", "composure", "decisions", "positioning", "teamwork"],
        preferred: &[
            "first_touch",
            "marking",
            "technique",
            "anticipation",
            "concentration",
            "off_the_ball",
            "vision",
            "work_rate",
            "acceleration",
            "agility",
            "stamina",
        ],
    },
    Role {
        key: "complete_wing_back",
        duty: Attack,
        positions: WING_BACK,
        key_attributes: &[
            "crossing",
            "dribbling",
            "technique",
            "flair",
            "off_the_ball",
            "teamwork",
            "work_rate",
            "acceleration",
            "stamina",
        ],
        preferred: &[
            "first_touch",
            "marking",
            "passing",
            "tackling",
            "anticipation",
            "decisions",
            "positioning",
            "agility",
            "balance",
            "pace",
        ],
    },
    Role {
        key: "defensive_midfielder",
        duty: Defend,
        positions: DM,
        key_attributes: &["tackling", "anticipation", "concentration", "positioning", "teamwork"],
        preferred: &["marking", "passing", "aggression", "composure", "decisions", "work_rate", "stamina", "strength"],
    },
    Role {
        key: "anchor",
        duty: Defend,
        positions: DM,
        key_attributes: &["marking", "tackling", "anticipation", "concentration", "decisions", "positioning"],
        preferred: &["composure", "teamwork", "strength"],
    },
    Role {
        key: "half_back",
        duty: Defend,
        positions: DM,
        key_attributes: &[
            "marking",
            "tackling",
            "anticipation",
            "composure",
            "concentration",
            "decisions",
            "positioning",
            "teamwork",
        ],
        preferred: &[
            "first_touch",
            "passing",
            "aggression",
            "bravery",
            "work_rate",
            "jumping_reach",
            "stamina",
            "strength",
        ],
    },
    Role {
        key: "ball_winning_midfielder",
        duty: Defend,
        positions: DM_MC,
        key_attributes: &["tackling", "aggression", "anticipation", "teamwork", "work_rate", "stamina"],
        preferred: &["marking", "bravery", "concentration", "positioning", "agility", "pace", "strength"],
    },
    Role {
        key: "deep_lying_playmaker",
        duty: Defend,
        positions: DM_MC,
        key_attributes: &[
            "first_touch",
            "passing",
            "technique",
            "composure",
            "decisions",
            "positioning",
            "teamwork",
            "vision",
        ],
        preferred: &["tackling", "anticipation", "balance"],
    },
    Role {
        key: "deep_lying_playmaker",
        duty: Support,
        positions: DM_MC,
        key_attributes: &["first_touch", "passing", "technique", "composure", "decisions", "teamwork", "vision"],
        preferred: &["anticipation", "off_the_ball", "positioning", "balance"],
    },
    Role {
        key: "regista",
        duty: Support,
        positions: DM,
        key_attributes: &[
            "dribbling",
            "first_touch",
            "passing",
            "technique",
            "composure",
            "decisions",
            "flair",
            "off_the_ball",
            "teamwork",
            "vision",
        ],
        preferred: &["long_shots", "anticipation", "balance"],
    },
    Role {
        key: "roaming_playmaker",
        duty: Support,
        positions: DM_MC,
        key_attributes: &[
            "first_touch",
            "passing",
            "technique",
            "anticipation",
            "composure",
            "decisions",
            "off_the_ball",
            "teamwork",
            "vision",
            "work_rate",
            "acceleration",
            "stamina",
        ],
        preferred: &["dribbling", "long_shots", "concentration", "flair", "positioning", "agility", "balance", "pace"],
    },
    Role {
        key: "segundo_volante",
        duty: Attack,
        positions: DM,
        key_attributes: &[
            "marking",
            "passing",
            "tackling",
            "off_the_ball",
            "positioning",
            "work_rate",
            "pace",
            "stamina",
        ],
        preferred: &[
            "finishing",
            "first_touch",
            "long_shots",
            "anticipation",
            "composure",
            "decisions",
            "acceleration",
            "balance",
            "strength",
        ],
    },
    Role {
        key: "central_midfielder",
        duty: Defend,
        positions: MC,
        key_attributes: &["tackling", "concentration", "decisions", "positioning", "teamwork"],
        preferred: &[
            "first_touch",
            "marking",
            "passing",
            "technique",
            "aggression",
            "anticipation",
            "composure",
            "work_rate",
            "stamina",
        ],
    },
    Role {
        key: "central_midfielder",
        duty: Support,
        positions: MC,
        key_attributes: &["first_touch", "passing", "tackling", "decisions", "teamwork"],
        preferred: &[
            "technique",
            "anticipation",
            "composure",
            "concentration",
            "off_the_ball",
            "vision",
            "work_rate",
            "stamina",
        ],
    },
    Role {
        key: "central_midfielder",
        duty: Attack,
        positions: MC,
        key_attributes: &["first_touch", "passing", "decisions", "off_the_ball"],
        preferred: &[
            "long_shots",
            "tackling",
            "technique",
            "anticipation",
            "composure",
            "teamwork",
            "vision",
            "work_rate",
            "acceleration",
            "stamina",
        ],
    },
    Role {
        key: "box_to_box_midfielder",
        duty: Support,
        positions: MC,
        key_attributes: &["passing", "tackling", "off_the_ball", "teamwork", "work_rate", "stamina"],
        preferred: &[
            "dribbling",
            "finishing",
            "first_touch",
            "long_shots",
            "technique",
            "aggression",
            "anticipation",
            "composure",
            "decisions",
            "positioning",
            "balance",
            "pace",
            "strength",
        ],
    },
    Role {
        key: "mezzala",
        duty: Support,
        positions: MC,
        key_attributes: &["passing", "technique", "decisions", "off_the_ball", "work_rate", "acceleration"],
        preferred: &[
            "dribbling",
            "first_touch",
            "long_shots",
            "tackling",
            "anticipation",
            "composure",
            "vision",
            "balance",
            "stamina",
        ],
    },
    Role {
        key: "mezzala",
        duty: Attack,
        positions: MC,
        key_attributes: &[
            "dribbling",
            "passing",
            "technique",
            "decisions",
            "off_the_ball",
            "vision",
            "work_rate",
            "acceleration",
        ],
        preferred: &[
            "finishing",
            "first_touch",
            "long_shots",
            "anticipation",
            "composure",
            "flair",
            "balance",
            "stamina",
        ],
    },
    Role {
        key: "carrilero",
        duty: Support,
        positions: MC,
        key_attributes: &["first_touch", "passing", "tackling", "decisions", "positioning", "teamwork"],
        preferred: &[
            "technique",
            "anticipation",
            "composure",
            "concentration",
            "off_the_ball",
            "vision",
            "work_rate",
            "stamina",
        ],
    },
    Role {
        key: "advanced_playmaker",
        duty: Support,
        positions: PLAYMAKER,
        key_attributes: &[
            "first_touch",
            "passing",
            "technique",
            "composure",
            "decisions",
            "off_the_ball",
            "teamwork",
            "vision",
        ],
        preferred: &["dribbling", "anticipation", "flair", "agility"],
    },
    Role {
        key: "advanced_playmaker",
        duty: Attack,
        positions: PLAYMAKER,
        key_attributes: &[
            "first_touch",
            "passing",
            "technique",
            "composure",
            "decisions",
            "off_the_ball",
            "teamwork",
            "vision",
        ],
        preferred: &["dribbling", "anticipation", "flair", "acceleration", "agility"],
    },
    Role {
        key: "wide_midfielder",
        duty: Support,
        positions: WIDE_MID,
        key_attributes: &["passing", "tackling", "decisions", "teamwork", "work_rate", "stamina"],
        preferred: &[
            "crossing",
            "first_touch",
            "technique",
            "anticipation",
            "composure",
            "concentration",
            "off_the_ball",
            "positioning",
            "vision",
        ],
    },
    Role {
        key: "defensive_winger",
        duty: Support,
        positions: WIDE_MID,
        key_attributes: &[
            "technique",
            "anticipation",
            "off_the_ball",
            "positioning",
            "teamwork",
            "work_rate",
            "stamina",
        ],
        preferred: &[
            "crossing",
            "dribbling",
            "first_touch",
            "marking",
            "tackling",
            "aggression",
            "concentration",
            "decisions",
            "acceleration",
        ],
    },
    Role {
        key: "winger",
        duty: Support,
        positions: WIDE,
        key_attributes: &["crossing", "dribbling", "technique", "acceleration", "agility"],
        preferred: &["first_touch", "passing", "off_the_ball", "work_rate", "balance", "pace", "stamina"],
    },
    Role {
        key: "winger",
        duty: Attack,
        positions: WIDE,
        key_attributes: &["crossing", "dribbling", "technique", "acceleration", "agility"],
        preferred: &["first_touch", "passing", "anticipation", "flair", "off_the_ball", "balance", "pace", "stamina"],
    },
    Role {
        key: "inverted_winger",
        duty: Support,
        positions: WIDE,
        key_attributes: &["crossing", "dribbling", "passing", "technique", "acceleration", "agility"],
        preferred: &[
            "first_touch",
            "long_shots",
            "composure",
            "decisions",
            "off_the_ball",
            "vision",
            "work_rate",
            "balance",
            "pace",
            "stamina",
        ],
    },
    Role {
        key: "inside_forward",
        duty: Support,
        positions: WIDE_FORWARD,
        key_attributes: &[
            "dribbling",
            "finishing",
            "first_touch",
            "technique",
            "off_the_ball",
            "acceleration",
            "agility",
        ],
        preferred: &[
            "long_shots",
            "passing",
            "anticipation",
            "composure",
            "flair",
            "vision",
            "work_rate",
            "balance",
            "pace",
            "stamina",
        ],
    },
    Role {
        key: "inside_forward",
        duty: Attack,
        positions: WIDE_FORWARD,
        key_attributes: &[
            "dribbling",
            "finishing",
            "first_touch",
            "technique",
            "anticipation",
            "off_the_ball",
            "acceleration",
            "agility",
        ],
        preferred: &["long_shots", "passing", "composure", "flair", "balance", "pace", "stamina"],
    },
    Role {
        key: "raumdeuter",
        duty: Attack,
        positions: WIDE_FORWARD,
        key_attributes: &[
            "finishing",
            "anticipation",
            "composure",
            "concentration",
            "decisions",
            "off_the_ball",
            "balance",
        ],
        preferred: &["first_touch", "technique", "acceleration", "pace", "stamina"],
    },
    Role {
        key: "wide_target_forward",
        duty: Attack,
        positions: WIDE,
        key_attributes: &["heading", "bravery", "off_the_ball", "jumping_reach", "strength"],
        preferred: &["crossing", "first_touch", "anticipation", "teamwork", "work_rate", "balance", "stamina"],
    },
    Role {
        key: "attacking_midfielder",
        duty: Support,
        positions: AMC,
        key_attributes: &[
            "first_touch",
            "long_shots",
            "passing",
            "technique",
            "anticipation",
            "decisions",
            "flair",
            "off_the_ball",
        ],
        preferred: &["dribbling", "composure", "vision", "agility"],
    },
    Role {
        key: "attacking_midfielder",
        duty: Attack,
        positions: AMC,
        key_attributes: &[
            "dribbling",
            "first_touch",
            "long_shots",
            "passing",
            "technique",
            "anticipation",
            "decisions",
            "flair",
            "off_the_ball",
        ],
        preferred: &["finishing", "composure", "vision", "agility"],
    },
    Role {
        key: "enganche",
        duty: Support,
        positions: AMC,
        key_attributes: &["first_touch", "passing", "technique", "composure", "decisions", "vision"],
        preferred: &["dribbling", "anticipation", "flair", "off_the_ball", "teamwork", "agility"],
    },
    Role {
        key: "shadow_striker",
        duty: Attack,
        positions: AMC,
        key_attributes: &[
            "dribbling",
            "finishing",
            "first_touch",
            "anticipation",
            "composure",
            "off_the_ball",
            "acceleration",
        ],
        preferred: &[
            "passing",
            "technique",
            "concentration",
            "decisions",
            "work_rate",
            "agility",
            "balance",
            "pace",
            "stamina",
        ],
    },
    Role {
        key: "trequartista",
        duty: Attack,
        positions: AMC_ST,
        key_attributes: &[
            "dribbling",
            "first_touch",
            "passing",
            "technique",
            "composure",
            "decisions",
            "flair",
            "off_the_ball",
            "vision",
        ],
        preferred: &["finishing", "anticipation", "acceleration", "agility", "balance"],
    },
    Role {
        key: "advanced_forward",
        duty: Attack,
        positions: ST,
        key_attributes: &[
            "dribbling",
            "finishing",
            "first_touch",
            "technique",
            "composure",
            "off_the_ball",
            "acceleration",
        ],
        preferred: &["passing", "anticipation", "decisions", "work_rate", "agility", "balance", "pace", "stamina"],
    },
    Role {
        key: "poacher",
        duty: Attack,
        positions: ST,
        key_attributes: &["finishing", "anticipation", "composure", "off_the_ball"],
        preferred: &["first_touch", "heading", "technique", "decisions", "acceleration"],
    },
    Role {
        key: "target_forward",
        duty: Support,
        positions: ST,
        key_attributes: &["heading", "bravery", "composure", "off_the_ball", "balance", "jumping_reach", "strength"],
        preferred: &["finishing", "first_touch", "aggression", "anticipation", "decisions", "teamwork"],
    },
    Role {
        key: "target_forward",
        duty: Attack,
        positions: ST,
        key_attributes: &[
            "finishing",
            "heading",
            "bravery",
            "composure",
            "off_the_ball",
            "balance",
            "jumping_reach",
            "strength",
        ],
        preferred: &["first_touch", "aggression", "anticipation", "decisions", "teamwork"],
    },
    Role {
        key: "deep_lying_forward",
        duty: Support,
        positions: ST,
        key_attributes: &["first_touch", "passing", "technique", "composure", "decisions", "off_the_ball", "teamwork"],
        preferred: &["finishing", "anticipation", "flair", "vision", "balance", "strength"],
    },
    Role {
        key: "deep_lying_forward",
        duty: Attack,
        positions: ST,
        key_attributes: &["first_touch", "passing", "technique", "composure", "decisions", "off_the_ball", "teamwork"],
        preferred: &["dribbling", "finishing", "anticipation", "flair", "vision", "balance", "strength"],
    },
    Role {
        key: "false_nine",
        duty: Support,
        positions: ST,
        key_attributes: &[
            "dribbling",
            "first_touch",
            "passing",
            "technique",
            "composure",
            "decisions",
            "off_the_ball",
            "vision",
        ],
        preferred: &["finishing", "anticipation", "flair", "teamwork", "acceleration", "agility"],
    },
    Role {
        key: "complete_forward",
        duty: Support,
        positions: ST,
        key_attributes: &[
            "dribbling",
            "first_touch",
            "heading",
            "long_shots",
            "passing",
            "technique",
            "anticipation",
            "composure",
            "decisions",
            "off_the_ball",
            "vision",
            "acceleration",
            "agility",
            "strength",
        ],
        preferred: &["finishing", "teamwork", "work_rate", "balance", "jumping_reach", "pace", "stamina"],
    },
    Role {
        key: "complete_forward",
        duty: Attack,
        positions: ST,
        key_attributes: &[
            "dribbling",
            "finishing",
            "first_touch",
            "heading",
            "technique",
            "anticipation",
            "composure",
            "off_the_ball",
            "acceleration",
            "agility",
            "strength",
        ],
        preferred: &[
            "long_shots",
            "passing",
            "decisions",
            "teamwork",
            "vision",
            "work_rate",
            "balance",
            "jumping_reach",
            "pace",
            "stamina",
        ],
    },
    Role {
        key: "pressing_forward",
        duty: Defend,
        positions: ST,
        key_attributes: &[
            "aggression",
            "anticipation",
            "bravery",
            "decisions",
            "teamwork",
            "work_rate",
            "acceleration",
            "stamina",
        ],
        preferred: &["first_touch", "composure", "concentration", "agility", "balance", "pace", "strength"],
    },
    Role {
        key: "pressing_forward",
        duty: Attack,
        positions: ST,
        key_attributes: &[
            "finishing",
            "aggression",
            "anticipation",
            "bravery",
            "off_the_ball",
            "teamwork",
            "work_rate",
            "acceleration",
            "stamina",
        ],
        preferred: &[
            "first_touch",
            "composure",
            "concentration",
            "decisions",
            "agility",
            "balance",
            "pace",
            "strength",
        ],
    },
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Player;
    use crate::test_player::{level, set};

    #[test]
    fn every_role_names_real_attributes_and_positions() {
        assert_eq!(WEIGHTS.len(), ROLES.len());
        assert_eq!(POSITION_INDICES.len(), ROLES.len());
        let ids: std::collections::HashSet<String> = ROLES.iter().map(Role::id).collect();
        assert_eq!(ids.len(), ROLES.len(), "each role and duty once");
        for role in ROLES {
            assert!(!role.key_attributes.is_empty() && !role.positions.is_empty(), "{}", role.id());
            for key in role.key_attributes {
                assert!(!role.preferred.contains(key), "{} lists {key} twice", role.id());
            }
            assert_eq!(super::role(&role.id()).map(Role::id), Some(role.id()));
        }
        assert!(super::role("poacher.defend").is_none());
        assert!(super::role("nothing").is_none());
    }

    #[test]
    fn ratings_follow_the_role_s_attributes_and_positions() {
        let (mut attributes, personality, positions) = level(8, "dc");
        for key in ["heading", "marking", "tackling", "positioning", "jumping_reach", "strength"] {
            set(&mut attributes, key, 18);
        }
        let defender = Player {
            age: Some(25),
            current_ability: 140,
            potential_ability: 145,
            attributes: &attributes,
            personality: &personality,
            positions: &positions,
        };
        let values = defender.values();
        let rate = |id: &str| role(id).expect("a role").rating(&values, defender.positions);
        let central = rate("central_defender.defend");
        assert!(central > 70, "{central}");
        assert!(central > rate("covering_defender.defend"));
        // A striker's role is played from a position he cannot play.
        assert!(rate("poacher.attack") < 30, "{}", rate("poacher.attack"));

        let (top, _, all_positions) = level(20, "dc");
        assert_eq!(
            role("central_defender.defend")
                .expect("a role")
                .rating(&Player { attributes: &top, ..defender }.values(), &all_positions),
            100
        );
        let (mut accomplished, _, _) = level(1, "dc");
        accomplished.fill(15);
        assert_eq!(
            role("central_defender.defend")
                .expect("a role")
                .rating(&Player { attributes: &top, ..defender }.values(), &accomplished),
            95
        );
        assert_eq!(role("central_defender.defend").expect("a role").rating(&[0.0; ATTRIBUTE_COUNT], &all_positions), 0);
    }

    #[test]
    fn familiarity_runs_from_a_third_to_all() {
        assert_eq!(familiarity(20), 1.0);
        assert_eq!(familiarity(18), 1.0);
        assert!((familiarity(15) - 0.95).abs() < 1e-6);
        assert!((familiarity(1) - 0.3).abs() < 1e-6);
        assert!(familiarity(10) > familiarity(9) && familiarity(10) < familiarity(12));
    }
}

#[cfg(test)]
mod app_list {
    use super::ROLES;

    /// The app lists the roles for its select (app/src/scoutRoles.ts): the same ones, each once.
    #[test]
    fn the_app_lists_every_role() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../app/src/scoutRoles.ts");
        let source = std::fs::read_to_string(path).expect("the app's list of roles");
        let mut listed: Vec<String> = source
            .lines()
            .map(str::trim)
            .filter_map(|line| line.strip_prefix('"').and_then(|rest| rest.strip_suffix("\",")))
            .map(str::to_owned)
            .collect();
        let mut ours: Vec<String> = ROLES.iter().map(|role| role.id()).collect();
        let count = listed.len();
        listed.sort();
        listed.dedup();
        assert_eq!(listed.len(), count, "a role listed twice");
        ours.sort();
        assert_eq!(listed, ours);
    }
}
