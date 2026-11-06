//! Competitions and awards, read-only. The game keeps each kind in a database table (`db::DATABASE_TABLE<T>`), a
//! static pointer to which sits in the game plugin (see [`BuildProfile::competitions`]); the table points at a
//! `(begin, end, capacity)` vector of pointers to the objects, laid out as [`CompetitionLayout`] and [`AwardLayout`]
//! place. Every object holds its index in the table, which is checked.
//!
//! [`BuildProfile::competitions`]: crate::profile::BuildProfile::competitions
//! [`CompetitionLayout`]: crate::profile::CompetitionLayout
//! [`AwardLayout`]: crate::profile::AwardLayout

use fmlens_mem::{Process, is_user_pointer};
use serde::Serialize;

use crate::index::Listed;
use crate::players::{nation_name, nation_uid};
use crate::rtti::class_of;
use crate::session::Session;
use crate::text::{Memo, read_fm_string};
use crate::transfer::{MoveError, PointerList};

/// The most rows a table is read with; the save measured had 8,238 competitions and 3,902 awards.
const MOST_ROWS: u64 = 100_000;

/// One competition, as the competitions list shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompetitionSummary {
    pub uid: u32,
    pub name: String,
    pub short_name: Option<String>,
    /// None for an international competition.
    pub nation: Option<String>,
    pub nation_uid: Option<u32>,
    pub continent: Option<String>,
    /// 0 to 200.
    pub reputation: u16,
    pub women: bool,
    /// Where the competition was when the list was read.
    #[serde(skip)]
    pub address: u64,
}

/// A rule of a competition, as its loaded rule data holds it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CompetitionRule {
    /// The editor's name for it, e.g. "max_foreign_players".
    pub key: &'static str,
    pub value: RuleValue,
}

/// A number, or yes or no.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum RuleValue {
    Flag(bool),
    Number(u32),
}

/// The rules the profile shows: FM's code for each, the editor's name for it, and whether it is a yes or no. FM's
/// names, from its own rule loader, are the editor's names but for a few shortened ones.
const RULES: [(&[u8; 4], &str, bool); 19] = [
    (b"levl", "level", false),
    (b"mxss", "max_squad_size", false),
    (b"miss", "min_squad_size", false),
    (b"rcss", "recommended_squad_size", false),
    (b"mxps", "max_prelim_squad_size", false),
    (b"MiFp", "min_foreign_players", false),
    (b"MxFp", "max_foreign_players", false),
    (b"ftcp", "foreign_trialists_can_play", true),
    (b"SBal", "subs_allowed", false),
    (b"SBmx", "max_subs", false),
    (b"Ueit", "extended_injury_time", true),
    (b"DaOr", "daylight_offside_rule", true),
    (b"yctf", "yellow_cards_for_fine", false),
    (b"mgqm", "min_games_for_medal", false),
    (b"NoMd", "number_of_medals", false),
    (b"mnsc", "min_stadium_capacity", false),
    (b"mstc", "min_stadium_seating", false),
    (b"rqgp", "requires_grass_pitch", true),
    (b"rquh", "requires_undersoil_heating", true),
];

/// The most rules a competition is read with; the Premier League has 52.
const MOST_RULES: u64 = 512;

/// The key of a rule entry for FM's code `code`: the code's letters, first letter highest, in the low 32 bits.
fn rule_code(code: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*code)
}

impl Listed for CompetitionSummary {
    fn uid(&self) -> u32 {
        self.uid
    }

    fn names(&self) -> String {
        match &self.short_name {
            Some(short) => format!("{} {short}", self.name),
            None => self.name.clone(),
        }
    }

    fn display_name(&self) -> &str {
        &self.name
    }

    fn rank(&self) -> i32 {
        i32::from(self.reputation)
    }
}

/// One award, as the awards list shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AwardSummary {
    pub uid: u32,
    pub name: String,
    /// The competition it is given in; none for a nation's or the world's award.
    pub competition: Option<String>,
    pub competition_uid: Option<u32>,
    pub nation: Option<String>,
    pub nation_uid: Option<u32>,
    pub continent: Option<String>,
    /// 0 to 20.
    pub prestige: u8,
    /// How often it is given: 1 weekly, 2 monthly, 3 each season, 4 at the end of the competition, 5 each calendar
    /// year, 6 each year, 7 each round; other codes are not named yet.
    pub period: u8,
    /// Whether it is a women's award.
    pub women: bool,
    /// Who gets it: 1 a player, 2 a manager, 7 a team of players; other codes are not named yet.
    pub recipients: u8,
    pub goalkeepers_only: bool,
    /// The oldest a winner may be; none when any age may win.
    pub max_age: Option<u8>,
}

impl Listed for AwardSummary {
    fn uid(&self) -> u32 {
        self.uid
    }

    fn names(&self) -> String {
        match &self.competition {
            Some(competition) => format!("{} {competition}", self.name),
            None => self.name.clone(),
        }
    }

    fn display_name(&self) -> &str {
        &self.name
    }

    fn rank(&self) -> i32 {
        i32::from(self.prestige)
    }
}

/// The objects of the database table whose static pointer is `slot` bytes into the game plugin, each read as `size`
/// bytes: those whose index is their place in the table, all of class `class`. Empty when the table is not there or
/// is not of that class. Only reads memory.
pub(crate) fn table_rows(
    session: &Session,
    slot: u64,
    items: u64,
    class: &str,
    index_at: u64,
    size: u64,
) -> Result<Vec<(u64, Vec<u8>)>, MoveError> {
    let process = &session.process;
    let Some(table) = process.read_u64(session.plugin.base + slot).ok().filter(|&t| is_user_pointer(t)) else {
        return Ok(Vec::new());
    };
    let Some(vector) = process.read_u64(table + items).ok().filter(|&v| is_user_pointer(v)) else {
        return Ok(Vec::new());
    };
    let Some(list) = PointerList::read_up_to(process, vector, MOST_ROWS)? else {
        return Ok(Vec::new());
    };
    let pointers = list.elements(process)?;
    let Some(&first) = pointers.first() else {
        return Ok(Vec::new());
    };
    if !is_user_pointer(first) || class_of(process, &session.plugin, first).as_deref() != Some(class) {
        return Ok(Vec::new());
    }
    let vtable = process.read_u64(first)?;
    let mut rows = Vec::with_capacity(pointers.len());
    for (index, pointer) in pointers.into_iter().enumerate() {
        if !is_user_pointer(pointer) {
            continue;
        }
        let bytes = process.read_bytes(pointer, size as usize)?;
        let word = |at: u64| u64::from_le_bytes(bytes[at as usize..at as usize + 8].try_into().expect("8 bytes"));
        let own_index = u32::from_le_bytes(bytes[index_at as usize..index_at as usize + 4].try_into().expect("4"));
        // Every row is of one class and knows its place: anything else means the table is not what the profile says.
        if word(0) != vtable || own_index as usize != index {
            return Ok(Vec::new());
        }
        rows.push((pointer, bytes));
    }
    Ok(rows)
}

/// The name of a place (a nation or continent) at `place`: an FM string at `name` bytes into it.
fn place_name(process: &Process, place: u64, name: u64) -> Option<String> {
    is_user_pointer(place).then(|| read_fm_string(process, process.read_u64(place + name).ok()?)).flatten()
}

impl Session {
    /// Every competition. Empty where this build's profile or layout does not place them, or the table does not check
    /// out. Only reads memory.
    pub fn competitions(&self) -> Result<Vec<CompetitionSummary>, MoveError> {
        let (Some(c), Some(slot)) =
            (self.layout.competition.as_ref(), self.profile.as_ref().and_then(|p| p.competitions))
        else {
            return Ok(Vec::new());
        };
        let rows = table_rows(self, slot, c.table_items, &c.class, c.index, c.size)?;
        let (mut nations, mut continents) = (Memo::default(), Memo::default());
        let mut competitions = Vec::with_capacity(rows.len());
        for (pointer, bytes) in rows {
            let u16_at = |at: u64| u16::from_le_bytes([bytes[at as usize], bytes[at as usize + 1]]);
            let u64_at = |at: u64| u64::from_le_bytes(bytes[at as usize..at as usize + 8].try_into().expect("8 bytes"));
            let uid = u32::from_le_bytes(bytes[c.uid as usize..c.uid as usize + 4].try_into().expect("4 bytes"));
            // The table ends with a placeholder that has no name.
            let Some(name) = read_fm_string(&self.process, u64_at(c.name)).filter(|name| !name.trim().is_empty())
            else {
                continue;
            };
            let (nation, continent) = (u64_at(c.nation), u64_at(c.continent));
            competitions.push(CompetitionSummary {
                uid,
                name,
                short_name: read_fm_string(&self.process, u64_at(c.short_name)).filter(|s| !s.trim().is_empty()),
                nation: nations.get(nation, |nation| nation_name(&self.process, &self.layout, nation)),
                nation_uid: is_user_pointer(nation).then(|| nation_uid(&self.process, &self.layout, nation)).flatten(),
                continent: continents.get(continent, |continent| place_name(&self.process, continent, c.place_name)),
                reputation: u16_at(c.reputation),
                women: bytes[c.women as usize] != 0,
                address: pointer,
            });
        }
        Ok(competitions)
    }

    /// The rules of `competition` that FM keeps as plain numbers and yes-or-no values, in the order of [`RULES`];
    /// `None` where the layout does not place them or the rule data does not check out. Only reads memory.
    pub fn competition_rules(
        &self,
        competition: &CompetitionSummary,
    ) -> Result<Option<Vec<CompetitionRule>>, MoveError> {
        let Some(c) = self.layout.competition.as_ref() else {
            return Ok(None);
        };
        let (Some(actual), Some(rules)) = (c.actual, c.rules) else {
            return Ok(None);
        };
        let address = competition.address;
        if !is_user_pointer(address)
            || self.process.read_u32(address + c.uid).ok() != Some(competition.uid)
            || class_of(&self.process, &self.plugin, address).as_deref() != Some(c.class.as_str())
        {
            return Err(MoveError::Changed { address });
        }
        let actual = self.process.read_u64(address + actual)?;
        if !is_user_pointer(actual) {
            return Ok(None);
        }
        let header = self.process.read_bytes(actual + rules, 16)?;
        let begin = u64::from_le_bytes(header[0..8].try_into().expect("8 bytes"));
        let end = u64::from_le_bytes(header[8..16].try_into().expect("8 bytes"));
        let size = end.wrapping_sub(begin);
        if !is_user_pointer(begin) || end < begin || size % 16 != 0 || size / 16 > MOST_RULES {
            return Ok(None);
        }
        // Each entry's code and its node's type and first four value bytes.
        let entries = self.process.read_bytes(begin, size as usize)?;
        let mut nodes = Vec::with_capacity(entries.len() / 16);
        for entry in entries.as_chunks::<16>().0 {
            let code = u32::from_le_bytes(entry[0..4].try_into().expect("4 bytes"));
            let node = u64::from_le_bytes(entry[8..16].try_into().expect("8 bytes"));
            if !is_user_pointer(node) {
                return Ok(None);
            }
            let bytes = self.process.read_bytes(node, 12)?;
            let kind = u64::from_le_bytes(bytes[0..8].try_into().expect("8 bytes"));
            nodes.push((code, kind, u32::from_le_bytes(bytes[8..12].try_into().expect("4 bytes"))));
        }
        let node = |code: &[u8; 4]| nodes.iter().find(|&&(at, ..)| at == rule_code(code)).copied();
        // FM's value types are objects of its own, found where they are this run: every competition holds its year,
        // year interval and base year as numbers and says whether it is inactive and whether it is a league as yes or
        // no.
        let Some((_, number, year)) = node(b"year") else {
            return Ok(None);
        };
        if !(1900..=2100).contains(&year)
            || [b"ygap", b"bsyr"].iter().any(|code| node(code).map(|n| n.1) != Some(number))
        {
            return Ok(None);
        }
        let flag = [b"inac", b"ilgf", b"cita"].iter().find_map(|code| node(code)).map(|n| n.1).filter(|&f| f != number);
        Ok(Some(
            RULES
                .iter()
                .filter_map(|&(code, key, is_flag)| {
                    let (_, kind, value) = node(code)?;
                    let value = if is_flag {
                        (Some(kind) == flag && value & 0xFF <= 1).then_some(RuleValue::Flag(value & 0xFF == 1))?
                    } else {
                        // FM's "none" is all bits set.
                        (kind == number && value != u32::MAX).then_some(RuleValue::Number(value))?
                    };
                    Some(CompetitionRule { key, value })
                })
                .collect(),
        ))
    }

    /// Every award. Empty where this build's profile or layout does not place them, or the table does not check out.
    /// Only reads memory.
    pub fn awards(&self) -> Result<Vec<AwardSummary>, MoveError> {
        let (Some(a), Some(c), Some(slot)) = (
            self.layout.award.as_ref(),
            self.layout.competition.as_ref(),
            self.profile.as_ref().and_then(|p| p.awards),
        ) else {
            return Ok(Vec::new());
        };
        let rows = table_rows(self, slot, a.table_items, &a.class, a.index, a.size)?;
        let (mut nations, mut continents, mut competitions) = (Memo::default(), Memo::default(), Memo::default());
        let mut awards = Vec::with_capacity(rows.len());
        for (_, bytes) in rows {
            let u64_at = |at: u64| u64::from_le_bytes(bytes[at as usize..at as usize + 8].try_into().expect("8 bytes"));
            let uid = u32::from_le_bytes(bytes[a.uid as usize..a.uid as usize + 4].try_into().expect("4 bytes"));
            let Some(name) = read_fm_string(&self.process, u64_at(a.name)).filter(|name| !name.trim().is_empty())
            else {
                continue;
            };
            let (nation, continent, competition) = (u64_at(a.nation), u64_at(a.continent), u64_at(a.competition));
            let competition = is_user_pointer(competition).then_some(competition);
            let max_age = bytes[a.max_age as usize];
            awards.push(AwardSummary {
                uid,
                name,
                competition: competition.and_then(|comp| {
                    competitions
                        .get(comp, |comp| read_fm_string(&self.process, self.process.read_u64(comp + c.name).ok()?))
                }),
                competition_uid: competition.and_then(|comp| self.process.read_u32(comp + c.uid).ok()),
                nation: nations.get(nation, |nation| nation_name(&self.process, &self.layout, nation)),
                nation_uid: is_user_pointer(nation).then(|| nation_uid(&self.process, &self.layout, nation)).flatten(),
                continent: continents.get(continent, |continent| place_name(&self.process, continent, c.place_name)),
                prestige: bytes[a.prestige as usize],
                period: bytes[a.period as usize],
                women: bytes[a.women as usize] == 1,
                recipients: bytes[a.recipients as usize],
                goalkeepers_only: bytes[a.goalkeepers_only as usize] == 1,
                max_age: (max_age != 0 && max_age != 0xFF).then_some(max_age),
            });
        }
        Ok(awards)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rule_codes_read_as_fm_stores_them() {
        // The Premier League's entry for its year has the key 0x79656172, "year" from its highest byte down.
        assert_eq!(rule_code(b"year"), 0x7965_6172);
        assert_eq!(rule_code(b"MxFp"), 0x4D78_4670);
        // Every rule is named once.
        let mut keys: Vec<&str> = RULES.iter().map(|&(_, key, _)| key).collect();
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), RULES.len());
    }

    #[test]
    fn the_macos_layout_places_the_rules() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        if let Some(c) = layout.competition.as_ref() {
            assert_eq!((c.actual, c.rules), (Some(0xB0), Some(0x50)));
            assert!(c.actual.is_some_and(|actual| actual + 8 <= c.size));
        }
    }
}
