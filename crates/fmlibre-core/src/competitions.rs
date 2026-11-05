//! Competitions and awards, read-only. The game keeps each kind in a database table (`db::DATABASE_TABLE<T>`), a
//! static pointer to which sits in the game plugin (see [`BuildProfile::competitions`]); the table points at a
//! `(begin, end, capacity)` vector of pointers to the objects, laid out as [`CompetitionLayout`] and [`AwardLayout`]
//! place. Every object holds its index in the table, which is checked.
//!
//! [`BuildProfile::competitions`]: crate::profile::BuildProfile::competitions
//! [`CompetitionLayout`]: crate::profile::CompetitionLayout
//! [`AwardLayout`]: crate::profile::AwardLayout

use fmlibre_mem::{Process, is_user_pointer};
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
    /// How often it is given: 1 weekly, 2 monthly, 3 each season; other codes are not named yet.
    pub period: u8,
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
        for (_, bytes) in rows {
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
            });
        }
        Ok(competitions)
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
                recipients: bytes[a.recipients as usize],
                goalkeepers_only: bytes[a.goalkeepers_only as usize] == 1,
                max_age: (max_age != 0 && max_age != 0xFF).then_some(max_age),
            });
        }
        Ok(awards)
    }
}
