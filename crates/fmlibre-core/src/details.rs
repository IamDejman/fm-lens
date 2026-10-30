use std::collections::BTreeMap;

use fmlibre_mem::{Process, is_user_pointer};
use serde::Serialize;

use crate::date::FmDate;
use crate::players::PlayerSummary;
use crate::profile::Layout;

/// Position ratings in the order FM stores them.
pub const POSITIONS: [&str; 15] =
    ["gk", "sw", "dl", "dc", "dr", "dm", "ml", "mc", "mr", "aml", "amc", "amr", "st", "wbl", "wbr"];

/// Personality ratings in the order FM stores them.
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

/// Player attributes grouped the way FM shows them.
pub const ATTRIBUTE_GROUPS: &[(&str, &[&str])] = &[
    (
        "technical",
        &[
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
        ],
    ),
    (
        "mental",
        &[
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
        ],
    ),
    (
        "physical",
        &["acceleration", "agility", "balance", "jumping_reach", "natural_fitness", "pace", "stamina", "strength"],
    ),
    (
        "goalkeeping",
        &[
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
        ],
    ),
    ("hidden", &["consistency", "dirtiness", "important_matches", "injury_proneness", "versatility"]),
    ("feet", &["left_foot", "right_foot"]),
];

/// Everything the player profile shows.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerDetails {
    #[serde(flatten)]
    pub summary: PlayerSummary,
    pub height_cm: u16,
    /// Asking price in pounds, when the club has set one.
    pub asking_price: Option<i32>,
    pub reputation: Reputation,
    pub international: International,
    /// Position ratings (1–20) by [`POSITIONS`] key.
    pub positions: BTreeMap<&'static str, u8>,
    /// Personality ratings (1–20) by [`PERSONALITY`] key.
    pub personality: BTreeMap<&'static str, u8>,
    pub attributes: BTreeMap<String, Attribute>,
    pub contract: Option<Contract>,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Reputation {
    pub home: u16,
    pub current: u16,
    pub world: u16,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct International {
    pub caps: u16,
    pub goals: u16,
    pub u21_caps: u8,
    pub u21_goals: u8,
}

/// An attribute as stored (`raw`, 0–100) and as FM shows it (`value`, 1–20).
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Attribute {
    pub raw: u8,
    pub value: u8,
}

impl Attribute {
    pub fn from_raw(raw: u8) -> Self {
        Self { raw, value: ((u16::from(raw) + 2) / 5).clamp(1, 20) as u8 }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Contract {
    /// Pounds per week.
    pub wage: i32,
    pub signed: Option<FmDate>,
    pub expires: Option<FmDate>,
    pub joined: Option<FmDate>,
    pub squad_status: u8,
    pub squad_number: Option<u8>,
    pub transfer_listed: bool,
    pub loan_listed: bool,
}

/// Reads the full profile of `player`. Returns `None` when the object at the player's
/// address no longer belongs to that player (e.g. the game moved on). Only reads memory.
pub fn read_player_details(
    process: &Process,
    layout: &Layout,
    player: &PlayerSummary,
) -> fmlibre_mem::Result<Option<PlayerDetails>> {
    let p = &layout.player;
    let shift = player.shift;
    let buf = process.read_bytes(player.address, (p.end() + shift) as usize)?;
    let at = |offset: u64| p.at(offset, shift) as usize;
    let u8_at = |offset: u64| buf[at(offset)];
    let u16_at = |offset: u64| u16::from_le_bytes([buf[at(offset)], buf[at(offset) + 1]]);
    let u32_at = |offset: u64| u32::from_le_bytes(buf[at(offset)..at(offset) + 4].try_into().expect("4 bytes"));
    let u64_at = |offset: u64| u64::from_le_bytes(buf[at(offset)..at(offset) + 8].try_into().expect("8 bytes"));

    if u32_at(p.uid) != player.uid {
        return Ok(None);
    }

    let asking_price = u32_at(p.asking_price) as i32;
    let positions = POSITIONS.iter().enumerate().map(|(i, &key)| (key, u8_at(p.positions + i as u64))).collect();
    let personality = PERSONALITY.iter().enumerate().map(|(i, &key)| (key, u8_at(p.personality + i as u64))).collect();
    let attributes =
        p.attributes.iter().map(|(key, &offset)| (key.clone(), Attribute::from_raw(u8_at(offset)))).collect();

    Ok(Some(PlayerDetails {
        summary: player.clone(),
        height_cm: u16_at(p.height),
        asking_price: (asking_price >= 0).then_some(asking_price),
        reputation: Reputation {
            home: u16_at(p.home_reputation),
            current: u16_at(p.current_reputation),
            world: u16_at(p.world_reputation),
        },
        international: International {
            caps: u16_at(p.international_caps),
            goals: u16_at(p.international_goals),
            u21_caps: u8_at(p.u21_caps),
            u21_goals: u8_at(p.u21_goals),
        },
        positions,
        personality,
        attributes,
        contract: read_contract(process, layout, u64_at(p.contract)),
    }))
}

fn read_contract(process: &Process, layout: &Layout, address: u64) -> Option<Contract> {
    if !is_user_pointer(address) {
        return None;
    }
    let c = &layout.contract;
    let buf = process.read_bytes(address, c.end() as usize).ok()?;
    let u16_at = |offset: u64| u16::from_le_bytes([buf[offset as usize], buf[offset as usize + 1]]);
    let date_at = |offset: u64| FmDate::from_raw(u16_at(offset), u16_at(offset + 2));
    let listing = buf[c.listing as usize];
    let squad_number = buf[c.squad_number as usize];
    Some(Contract {
        wage: i32::from_le_bytes(buf[c.wage as usize..c.wage as usize + 4].try_into().expect("4 bytes")),
        signed: date_at(c.signed),
        expires: date_at(c.expires),
        joined: date_at(c.joined),
        squad_status: buf[c.squad_status as usize],
        squad_number: (squad_number != 255).then_some(squad_number),
        transfer_listed: listing & 1 != 0,
        loan_listed: listing & 2 != 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attribute_scale() {
        assert_eq!(Attribute::from_raw(100).value, 20); // Messi's left foot
        assert_eq!(Attribute::from_raw(97).value, 19);
        assert_eq!(Attribute::from_raw(28).value, 6);
        assert_eq!(Attribute::from_raw(3).value, 1);
        assert_eq!(Attribute::from_raw(0).value, 1);
    }
}
