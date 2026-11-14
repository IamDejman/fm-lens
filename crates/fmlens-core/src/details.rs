use std::collections::BTreeMap;

use fmlens_mem::{Process, is_user_pointer};
use serde::Serialize;

use crate::date::FmDate;
use crate::languages::Language;
use crate::medical::{Ban, Injury};
use crate::players::PlayerSummary;
use crate::profile::Layout;
use crate::promises::Promise;
use crate::relations::{Preference, Relation};

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
    /// Stored base valuation, not the club asking price or a scouting estimate.
    pub transfer_value: Option<i32>,
    pub reputation: Reputation,
    pub international: International,
    /// Position ratings (1–20) by [`POSITIONS`] key; the summary's `positions` lists the playable ones.
    pub position_ratings: BTreeMap<&'static str, u8>,
    /// Personality ratings (1–20) by [`PERSONALITY`] key.
    pub personality: BTreeMap<&'static str, u8>,
    pub attributes: BTreeMap<String, Attribute>,
    pub contract: Option<Contract>,
    /// Energy and match sharpness, 0–10000 (100.00%), jadedness, -500 when rested, and morale,
    /// 1–20, which the game shows as his overall happiness: what the game changes every day.
    pub condition: u16,
    pub match_sharpness: u16,
    pub jadedness: i16,
    pub morale: u8,
    /// His traits (preferred moves), by their bit in the mask: 0 to 63.
    pub traits: Vec<u8>,
    /// Current injuries (see [`crate::Session::injuries`]).
    pub injuries: Vec<Injury>,
    /// Current bans (see [`crate::Session::bans`]).
    pub bans: Vec<Ban>,
    /// The promises made to him, open and recently closed (see [`crate::Session::promises`]); none where the layout does
    /// not place them.
    pub promises: Option<Vec<Promise>>,
    /// Secondary nationalities and homegrown status (see [`crate::Session::relations`]), and how many more his list
    /// has room for.
    pub ties: Vec<Relation>,
    pub tie_room: usize,
    /// The people and clubs he favours and dislikes (see [`crate::Session::preferences`]).
    pub preferences: Vec<Preference>,
    /// The languages he speaks besides, usually, his native one (see [`crate::Session::player_languages`]).
    pub languages: Vec<Language>,
    /// Whether the editor can read the retirements the game has planned (see
    /// [`crate::Session::planned_retirement`]), and the date he retires on when the game has planned it.
    pub retirement_known: bool,
    pub retires: Option<FmDate>,
    /// How many more clauses the list of his contract has room for (see [`crate::Session::clause_room`]).
    pub clause_room: usize,
    /// The terms of the loan he is on (see [`crate::Session::loan`]).
    pub loan: Option<crate::loans::LoanTerms>,
    /// His work permits (see [`crate::Session::work_permits`]).
    pub work_permits: Vec<crate::work_permits::WorkPermit>,
    /// The transfers the game agreed for him on a later day (see [`crate::Session::future_transfers`]).
    pub future_transfers: Vec<crate::game_calls::FutureTransfer>,
}

/// The range getter treats 300 million specially and may compute a value instead.
/// Do not present that marker as a price or infer a transfer status from it.
pub(crate) fn transfer_value(raw: i32, has_team: bool) -> Option<i32> {
    match raw {
        _ if !has_team => Some(0),
        300_000_000 => None,
        0.. => Some(raw),
        _ => None,
    }
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

#[derive(Debug, Clone, Serialize)]
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
    /// Pounds per week.
    pub loyalty_bonus: i32,
    /// How happy he is, and how happy with his playing time, as FMRTE shows them.
    pub happiness: i8,
    pub playing_time_happiness: i8,
    /// His clauses and bonuses, in the contract's order.
    pub clauses: Vec<Clause>,
    /// What the contract pays for competitions, in the contract's order; a separate list from the clauses.
    pub competition_bonuses: Vec<CompetitionBonus>,
    /// His reasons to be unhappy, over ones too, in the order the game keeps them.
    pub concerns: Vec<Concern>,
    /// A player-coach's contract: he works as staff too, and does not move.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub player_coach: bool,
}

/// One of a player's reasons to be unhappy, as FMRTE lists them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Concern {
    pub started: Option<FmDate>,
    /// When it was over; none while it lasts.
    pub ended: Option<FmDate>,
    /// The game's code for what it is about (see the names in the app's dictionaries).
    pub motive: u16,
    /// 1 concerned, 2 internal; other codes as they are.
    pub kind: u8,
}

/// The most entries a record of reasons to be unhappy holds: the game keeps them in a ring of ten.
pub(crate) const MOST_CONCERNS: u64 = 10;

/// The bytes of one reason to be unhappy, and where the date it ended is in them.
pub(crate) const CONCERN_SIZE: usize = 28;
pub(crate) const CONCERN_ENDED: usize = 4;

/// Where the record keeps which slot of its ring holds the oldest entry: a `u8` after the ten slots.
const CONCERNS_HEAD: u64 = 8 + 8 * MOST_CONCERNS;

/// The entries of the record of reasons to be unhappy `record` points at, oldest first; none when there is no
/// record or it does not look like one. The record is a `u8` count, ten pointer slots from +8 used as a ring, and
/// the slot of the oldest entry.
pub(crate) fn concern_entries(process: &Process, record: u64) -> Vec<u64> {
    if !is_user_pointer(record) {
        return Vec::new();
    }
    let Ok(bytes) = process.read_bytes(record, CONCERNS_HEAD as usize + 1) else {
        return Vec::new();
    };
    let (count, head) = (u64::from(bytes[0]), u64::from(bytes[CONCERNS_HEAD as usize]));
    if count > MOST_CONCERNS || head >= MOST_CONCERNS {
        return Vec::new();
    }
    (0..count)
        .map(|i| 8 + 8 * ((head + i) % MOST_CONCERNS) as usize)
        .map(|at| u64::from_le_bytes(bytes[at..at + 8].try_into().expect("8 bytes")))
        .filter(|&entry| is_concern_pointer(entry))
        .collect()
}

/// Whether `entry` could point at a reason to be unhappy. The game packs them 28 bytes apart, so one is aligned to
/// four bytes, not the eight of [`is_user_pointer`].
fn is_concern_pointer(entry: u64) -> bool {
    entry.is_multiple_of(4) && is_user_pointer(entry & !7)
}

/// The reasons to be unhappy listed in the record `record` points at; none when there is no record or it does not
/// look like one.
pub(crate) fn read_concerns(process: &Process, record: u64) -> Vec<Concern> {
    concern_entries(process, record)
        .into_iter()
        .filter_map(|entry| process.read_bytes(entry, CONCERN_SIZE).ok())
        .map(|e| {
            let date = |at: usize| {
                FmDate::from_raw(u16::from_le_bytes([e[at], e[at + 1]]), u16::from_le_bytes([e[at + 2], e[at + 3]]))
            };
            Concern {
                started: date(0),
                ended: date(CONCERN_ENDED),
                motive: u16::from_le_bytes([e[0x16], e[0x17]]),
                kind: e[0x18],
            }
        })
        .collect()
}

/// One of a contract's clauses or bonuses: a release clause, an appearance fee, a yearly wage rise...
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Clause {
    /// Its place in the contract's list.
    pub index: usize,
    /// The game's code for what it is (see the names in the app's dictionaries).
    pub kind: u16,
    /// Pounds; none for a clause without an amount, such as a yearly wage rise.
    pub amount: Option<u32>,
    /// What it depends on: goals, assists, matches, years or a percentage, by kind; none for most.
    pub condition: Option<u16>,
}

/// A bonus a contract pays for a competition, from its own list beside the clauses. Read-only: what the bonus is
/// paid for (a title, a round reached, an appearance) is held elsewhere in the entry and is not decoded, so only the
/// competition and the amount are given.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompetitionBonus {
    /// Its place in the contract's list.
    pub index: usize,
    /// What it names: the competition's place in the game's table of competitions, or the award's UID for an award
    /// bonus.
    pub key: u32,
    /// The competition's (or award's) name, where the app finds one by its key; none here.
    pub competition: Option<String>,
    /// Pounds; none where the entry holds none.
    pub amount: Option<u32>,
    /// Whether it comes from the contract's list of award bonuses, so the UID is an award's.
    #[serde(skip)]
    pub award: bool,
}

/// Bytes per competition bonus, and where in one the competition's place in the game's table and its amount are.
/// Read on Windows (Game Pass, Kylian Mbappé) and on macOS ARM64 (Declan Rice: 637, 850,975). On Windows, place 637
/// is the UEFA Champions League, which FM's contract page names for Rice's bonus.
const BONUS_ENTRY: usize = 32;
const BONUS_KEY: usize = 0x14;
const BONUS_AMOUNT: usize = 0x18;

/// The longest list of competition bonuses read; the test save's longest held a handful.
const MOST_BONUSES: u64 = 64;

/// The competition bonus `entry` at `index` says, its competition not yet named.
fn bonus_at(index: usize, entry: &[u8; BONUS_ENTRY]) -> CompetitionBonus {
    let u32_at = |at: usize| u32::from_le_bytes(entry[at..at + 4].try_into().expect("4 bytes"));
    let amount = u32_at(BONUS_AMOUNT);
    CompetitionBonus {
        index,
        key: u32_at(BONUS_KEY),
        competition: None,
        amount: (amount != u32::MAX).then_some(amount),
        award: false,
    }
}

/// The competition bonuses of the contract at `contract`, from its list of 32-byte entries; none when the list does
/// not look like one.
pub(crate) fn read_competition_bonuses(process: &Process, layout: &Layout, contract: u64) -> Vec<CompetitionBonus> {
    let size = BONUS_ENTRY as u64;
    let at = contract + layout.contract.competition_bonuses;
    let (Ok(begin), Ok(end)) = (process.read_u64(at), process.read_u64(at + 8)) else {
        return Vec::new();
    };
    if !is_user_pointer(begin) || end < begin || end - begin > size * MOST_BONUSES || (end - begin) % size != 0 {
        return Vec::new();
    }
    let Ok(bytes) = process.read_bytes(begin, (end - begin) as usize) else {
        return Vec::new();
    };
    bytes.as_chunks::<BONUS_ENTRY>().0.iter().enumerate().map(|(index, entry)| bonus_at(index, entry)).collect()
}

/// Bytes per award bonus: a pointer to the award, then the amount in pounds. Read on Windows (Steam 26577676): Declan
/// Rice's two, the World Footballer of the Year and the World Golden Ball at 1,171,666 each, as FM's contract page
/// shows them.
const AWARD_BONUS_ENTRY: usize = 16;

/// The award an award bonus `entry` points at, and its amount.
fn award_bonus_at(entry: &[u8; AWARD_BONUS_ENTRY]) -> (u64, Option<u32>) {
    let award = u64::from_le_bytes(entry[..8].try_into().expect("8 bytes"));
    let amount = u32::from_le_bytes(entry[8..12].try_into().expect("4 bytes"));
    (award, (amount != u32::MAX).then_some(amount))
}

/// The award bonuses of the contract at `contract`, numbered from `first`: the contract points at a list of 16-byte
/// entries. None where the layout does not say where the pointer is or the list does not look like one. Each gives
/// the UID read from the award it points at; whoever names them checks that an award has that UID.
pub(crate) fn read_award_bonuses(
    process: &Process,
    layout: &Layout,
    contract: u64,
    first: usize,
) -> Vec<CompetitionBonus> {
    let (Some(at), Some(award)) = (layout.contract.award_bonuses, layout.award.as_ref()) else {
        return Vec::new();
    };
    let size = AWARD_BONUS_ENTRY as u64;
    let Some(list) = process.read_u64(contract + at).ok().filter(|&list| is_user_pointer(list)) else {
        return Vec::new();
    };
    let (Ok(begin), Ok(end)) = (process.read_u64(list), process.read_u64(list + 8)) else {
        return Vec::new();
    };
    if !is_user_pointer(begin) || end < begin || end - begin > size * MOST_BONUSES || (end - begin) % size != 0 {
        return Vec::new();
    }
    let Ok(bytes) = process.read_bytes(begin, (end - begin) as usize) else {
        return Vec::new();
    };
    let mut bonuses = Vec::new();
    for (index, entry) in bytes.as_chunks::<AWARD_BONUS_ENTRY>().0.iter().enumerate() {
        let (target, amount) = award_bonus_at(entry);
        let uid = is_user_pointer(target).then(|| process.read_u32(target + award.uid).ok()).flatten();
        // One entry that does not point at something readable: the list is not what it is taken for.
        let Some(key) = uid else { return Vec::new() };
        bonuses.push(CompetitionBonus { index: first + index, key, competition: None, amount, award: true });
    }
    bonuses
}

/// The clauses of the contract at `contract`, from its list of 8-byte entries; none when the list does not look
/// like one.
pub(crate) fn read_clauses(process: &Process, layout: &Layout, contract: u64) -> Vec<Clause> {
    const MOST: u64 = 64;
    let at = contract + layout.contract.clauses;
    let (Ok(begin), Ok(end)) = (process.read_u64(at), process.read_u64(at + 8)) else {
        return Vec::new();
    };
    if !is_user_pointer(begin) || end < begin || end - begin > 8 * MOST || (end - begin) % 8 != 0 {
        return Vec::new();
    }
    let Ok(bytes) = process.read_bytes(begin, (end - begin) as usize) else {
        return Vec::new();
    };
    bytes
        .as_chunks::<8>()
        .0
        .iter()
        .enumerate()
        .map(|(index, e)| {
            let amount = u32::from_le_bytes([e[0], e[1], e[2], e[3]]);
            let condition = u16::from_le_bytes([e[4], e[5]]);
            Clause {
                index,
                kind: u16::from_le_bytes([e[6], e[7]]),
                amount: (amount != u32::MAX).then_some(amount),
                condition: (condition != u16::MAX).then_some(condition),
            }
        })
        .collect()
}

/// Reads the full profile of `player`. Returns `None` when the object at the player's
/// address no longer belongs to that player (e.g. the game moved on). Only reads memory.
pub fn read_player_details(
    process: &Process,
    layout: &Layout,
    player: &PlayerSummary,
) -> fmlens_mem::Result<Option<PlayerDetails>> {
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
    let position_ratings = POSITIONS.iter().enumerate().map(|(i, &key)| (key, u8_at(p.positions + i as u64))).collect();
    let personality = PERSONALITY.iter().enumerate().map(|(i, &key)| (key, u8_at(p.personality + i as u64))).collect();
    let attributes =
        p.attributes.iter().map(|(key, &offset)| (key.clone(), Attribute::from_raw(u8_at(offset)))).collect();

    Ok(Some(PlayerDetails {
        summary: player.clone(),
        height_cm: u16_at(p.height),
        asking_price: (asking_price >= 0).then_some(asking_price),
        transfer_value: p.transfer_value.and_then(|offset| transfer_value(u32_at(offset) as i32, u64_at(p.team) != 0)),
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
        position_ratings,
        personality,
        attributes,
        contract: read_contract(process, layout, u64_at(p.contract)),
        condition: u16_at(p.condition),
        match_sharpness: u16_at(p.match_sharpness),
        jadedness: u16_at(p.jadedness) as i16,
        morale: u8_at(p.morale),
        traits: {
            let mask = u64::from_le_bytes(buf[at(p.traits)..at(p.traits) + 8].try_into().expect("8 bytes"));
            (0..64u8).filter(|&n| mask >> n & 1 == 1).collect()
        },
        // The session reads them, as they hang off a record of their own.
        injuries: Vec::new(),
        bans: Vec::new(),
        promises: None,
        ties: Vec::new(),
        tie_room: 0,
        preferences: Vec::new(),
        languages: Vec::new(),
        retirement_known: false,
        retires: None,
        clause_room: 0,
        loan: None,
        work_permits: Vec::new(),
        future_transfers: Vec::new(),
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
    let job = buf[c.job as usize];
    Some(Contract {
        wage: i32::from_le_bytes(buf[c.wage as usize..c.wage as usize + 4].try_into().expect("4 bytes")),
        signed: date_at(c.signed),
        expires: date_at(c.expires),
        joined: date_at(c.joined),
        squad_status: buf[c.squad_status as usize],
        squad_number: (squad_number != 255).then_some(squad_number),
        transfer_listed: listing & 1 != 0,
        loan_listed: listing & 2 != 0,
        loyalty_bonus: i32::from_le_bytes(
            buf[c.loyalty_bonus as usize..c.loyalty_bonus as usize + 4].try_into().expect("4 bytes"),
        ),
        happiness: buf[c.happiness as usize] as i8,
        playing_time_happiness: buf[c.playing_time_happiness as usize] as i8,
        clauses: read_clauses(process, layout, address),
        competition_bonuses: {
            let mut bonuses = read_competition_bonuses(process, layout, address);
            bonuses.extend(read_award_bonuses(process, layout, address, bonuses.len()));
            bonuses
        },
        concerns: read_concerns(
            process,
            u64::from_le_bytes(buf[c.unhappiness as usize..c.unhappiness as usize + 8].try_into().expect("8 bytes")),
        ),
        // A coaching job's code plus one.
        player_coach: job > 1 && job % 2 == 1,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn competition_bonuses_give_the_competition_and_the_amount() {
        // Declan Rice's one bonus, read on macOS ARM64: the competition at 637 (0x27D) and 850,975 (0xCFC1F).
        let words: [u32; 8] = [0x076C_0001, 0xFFFF_FFFF, 0x14, 0xFFFF_FFFF, 0, 0x27D, 0x000C_FC1F, 0xFFFF];
        let entry: [u8; BONUS_ENTRY] = words.map(u32::to_le_bytes).concat().try_into().expect("32 bytes");
        let bonus = bonus_at(1, &entry);
        assert_eq!(
            bonus,
            CompetitionBonus { index: 1, key: 637, competition: None, amount: Some(850_975), award: false }
        );
        // An entry that holds no amount gives none.
        let mut none = entry;
        none[BONUS_AMOUNT..BONUS_AMOUNT + 4].copy_from_slice(&u32::MAX.to_le_bytes());
        assert_eq!(bonus_at(0, &none).amount, None);
    }

    #[test]
    fn award_bonuses_give_the_award_and_the_amount() {
        // Declan Rice's bonus for the World Footballer of the Year, read on Windows: 1,171,666 (0x11E0D2).
        let mut entry = [0u8; AWARD_BONUS_ENTRY];
        entry[..8].copy_from_slice(&0x0222_b0a9_6ab0u64.to_le_bytes());
        entry[8..12].copy_from_slice(&0x0011_e0d2u32.to_le_bytes());
        assert_eq!(award_bonus_at(&entry), (0x0222_b0a9_6ab0, Some(1_171_666)));
        entry[8..12].copy_from_slice(&u32::MAX.to_le_bytes());
        assert_eq!(award_bonus_at(&entry).1, None);
    }

    /// Entries sit 28 bytes apart, so half of them are not aligned to eight bytes: Bukayo Saka's was at ...8f64.
    #[test]
    fn a_concern_may_sit_on_a_four_byte_boundary() {
        assert!(is_concern_pointer(0x7b_d8f9_7620));
        assert!(is_concern_pointer(0x7b_d8f9_8f64));
        assert!(!is_concern_pointer(0x7b_d8f9_8f62));
        assert!(!is_concern_pointer(0));
        assert!(!is_concern_pointer(4));
    }

    #[test]
    fn valuation_is_not_an_asking_price_or_a_sentinel_amount() {
        assert_eq!(transfer_value(85_000_000, true), Some(85_000_000));
        assert_eq!(transfer_value(300_000_000, true), None);
        assert_eq!(transfer_value(-1, true), None);
        assert_eq!(transfer_value(i32::MIN, true), None);
        assert_eq!(transfer_value(0, true), Some(0));
        assert_eq!(transfer_value(300_000_000, false), Some(0));
    }

    #[test]
    fn attribute_scale() {
        assert_eq!(Attribute::from_raw(100).value, 20); // Messi's left foot
        assert_eq!(Attribute::from_raw(97).value, 19);
        assert_eq!(Attribute::from_raw(28).value, 6);
        assert_eq!(Attribute::from_raw(3).value, 1);
        assert_eq!(Attribute::from_raw(0).value, 1);
    }
}
