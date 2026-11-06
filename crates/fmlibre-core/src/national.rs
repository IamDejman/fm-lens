//! A nation's profile, read-only: its rules on nationality, its FIFA ranking, its rivals and its national teams.
//!
//! The nation object players point at has the nation's own facts (see [`NationalLayout`]) and a pointer to its men's
//! national team container, which points back at it. The container has the FIFA ranking, the rivals (a relation list
//! laid out as a person's, see [`RelationLayout`]) and the national teams, laid out as a club's teams.
//!
//! [`NationalLayout`]: crate::profile::NationalLayout
//! [`RelationLayout`]: crate::profile::RelationLayout

use fmlibre_mem::{Process, is_user_pointer};
use serde::Serialize;

use crate::players::{Nation, PlayerIndex};
use crate::profile::Layout;
use crate::relations::Related;
use crate::session::Session;
use crate::staff::StaffIndex;
use crate::text::read_fm_string;
use crate::transfer::{MoveError, PointerList};

/// The game's codes, in a container's relations, for a nation and for its rivalry with another.
const NATION_TARGET: u8 = 2;
const RIVAL: u8 = 6;

/// The most teams, languages and squad players the editor reads.
const MOST_TEAMS: u64 = 16;
const MOST_LANGUAGES: u64 = 32;
const MOST_PLAYERS: u64 = 64;

/// What a nation's `naturalisation` byte holds when no number of years gains its nationality. The game reads the byte
/// as signed and treats any number of years below 1 as never (0x13B7E94 in 27.0.0's arm64 half), 0 included.
pub(crate) const NEVER: u8 = 255;

/// Whether the game takes `years`, a nation's `naturalisation` byte, for "never".
pub(crate) fn never(years: u8) -> bool {
    (years as i8) < 1
}

/// The kind of a senior national team.
const SENIOR: u32 = 0;

/// The age limit byte of a team without one.
const NO_AGE_LIMIT: u8 = 255;

/// Everything the nation profile shows.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NationDetails {
    /// Its three-letter code, e.g. "ENG".
    pub code: Option<String>,
    pub continent: Option<String>,
    pub capital: Option<String>,
    pub population: Option<u32>,
    /// Whether its people may hold another nationality as well.
    pub dual_nationality: Option<bool>,
    /// Years of residence that gain its nationality; `None` when unknown or when no number of years does.
    pub naturalisation_years: Option<u8>,
    /// Whether no number of years gains its nationality.
    pub naturalisation_never: bool,
    pub languages: Vec<NationLanguage>,
    /// Its place in the FIFA ranking; `None` when unranked.
    pub ranking: Option<u16>,
    pub points: Option<f32>,
    /// The year its football association was founded, and the years it joined FIFA and its continental body.
    pub founded: Option<u16>,
    pub joined_fifa: Option<u16>,
    pub joined_continental: Option<u16>,
    /// How good the young players it brings through are, 0 to 165.
    pub youth_rating: Option<u16>,
    /// FM's game importance, 0 to 4, and attendance, 0 to 16, of its men's football.
    pub game_importance: Option<u8>,
    pub attendance: Option<u8>,
    /// Its rivals, strongest first.
    pub rivals: Vec<Related>,
    /// Its national teams with a squad or a manager, and its senior team; the senior team first.
    pub teams: Vec<NationalTeam>,
    /// Its women's football, where the nation has a women's container.
    pub women: Option<WomenFootball>,
}

/// A nation's women's football: the years its women's teams joined FIFA and the continental body, their youth
/// rating, and the teams.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WomenFootball {
    pub joined_fifa: Option<u16>,
    pub joined_continental: Option<u16>,
    pub youth_rating: Option<u16>,
    pub game_importance: Option<u8>,
    pub attendance: Option<u8>,
    /// The senior team first.
    pub teams: Vec<NationalTeam>,
}

/// What a container holds by value.
struct Association {
    ranking: Option<u16>,
    points: Option<f32>,
    founded: Option<u16>,
    joined_fifa: Option<u16>,
    joined_continental: Option<u16>,
    youth_rating: Option<u16>,
    game_importance: Option<u8>,
    attendance: Option<u8>,
}

/// A language spoken in a nation, and by what share of its people.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NationLanguage {
    pub name: Option<String>,
    pub percent: u8,
}

/// One of a nation's national teams.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NationalTeam {
    /// The game's code: 0 for the senior team, 0x100 and up for the youth teams.
    pub kind: u32,
    /// The oldest its players may be; `None` for the senior team.
    pub age_limit: Option<u8>,
    /// 0 to 10000.
    pub reputation: u16,
    /// The UID and name of the manager, when the lists have him.
    pub manager: Option<Person>,
    pub captain: Option<Person>,
    pub vice_captain: Option<Person>,
    /// The squad, as the game lists it.
    pub squad: Vec<Person>,
}

/// A person a nation's profile names.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub uid: u32,
    pub name: String,
}

/// Which of a nation's two containers: the men's national teams or the women's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Men,
    Women,
}

/// The highest youth rating the editor writes: the most a container holds in 27.0.0 is 165.
pub const MOST_YOUTH_RATING: i64 = 165;

/// The highest game importance and attendance the editor writes: the most a container holds in 27.0.0.
pub const MOST_GAME_IMPORTANCE: i64 = 4;
pub const MOST_ATTENDANCE: i64 = 16;

/// The `side` container of the nation at `nation`, where it points back at the nation. Only reads memory.
pub(crate) fn container(process: &Process, layout: &Layout, nation: u64, side: Side) -> Option<u64> {
    let n = layout.national.as_ref()?;
    let offset = match side {
        Side::Men => n.container,
        Side::Women => n.women_container,
    };
    let container = process.read_u64(nation + offset).ok().filter(|&p| is_user_pointer(p))?;
    (process.read_u64(container + n.container_nation).ok()? == nation).then_some(container)
}

/// The `side` senior national team of the nation at `nation`, whose UID is `uid`, where every pointer on the way
/// checks out: the container points back at the nation, and the team belongs to the container and is of the senior
/// kind. The men's carries the nation's UID as its id; the women's has an id of its own. Only reads memory.
pub(crate) fn senior_team(process: &Process, layout: &Layout, nation: u64, uid: u32, side: Side) -> Option<u64> {
    let (n, t) = (layout.national.as_ref()?, &layout.team);
    let container = container(process, layout, nation, side)?;
    let list = PointerList::read_up_to(process, container + n.teams, MOST_TEAMS).ok()??;
    list.elements(process).ok()?.into_iter().find(|&team| {
        is_user_pointer(team)
            && process.read_u64(team + t.club).ok() == Some(container)
            && process.read_u32(team + t.kind).ok() == Some(SENIOR)
            && (side == Side::Women || process.read_u32(team + n.team_id).ok() == Some(uid))
    })
}

impl Session {
    /// The profile of `nation`; `None` where the layout does not place nations' details or the nation's object does
    /// not check out. Only reads memory.
    pub fn nation_details(
        &self,
        nation: &Nation,
        players: &PlayerIndex,
        staff: &StaffIndex,
    ) -> Result<Option<NationDetails>, MoveError> {
        let Some(n) = self.layout.national.as_ref() else {
            return Ok(None);
        };
        let address = nation.address;
        if !is_user_pointer(address)
            || nation.uid.is_some_and(|uid| self.process.read_u32(address + self.layout.nation.uid).ok() != Some(uid))
        {
            return Err(MoveError::Changed { address });
        }
        let bytes = self.process.read_bytes(address, n.nation_end() as usize)?;
        let u64_at =
            |offset: u64| u64::from_le_bytes(bytes[offset as usize..offset as usize + 8].try_into().expect("8"));
        // FM's strings need not be 8-byte aligned, so only their range is checked.
        let string = |pointer: u64| {
            (0x1_0000..0x7FFF_FFFF_0000).contains(&pointer).then(|| read_fm_string(&self.process, pointer)).flatten()
        };
        let named = |record: u64| {
            is_user_pointer(record)
                .then(|| self.process.read_u64(record + n.place_name).ok().and_then(string))
                .flatten()
        };
        let population =
            u32::from_le_bytes(bytes[n.population as usize..n.population as usize + 4].try_into().expect("4"));
        let dual = bytes[n.dual_nationality as usize];
        let years = bytes[n.naturalisation as usize];
        let mut details = NationDetails {
            code: string(u64_at(n.code)),
            continent: named(u64_at(n.continent)),
            capital: named(u64_at(n.capital)),
            population: (population > 0).then_some(population),
            dual_nationality: match dual {
                0 => Some(true),
                2 => Some(false),
                _ => None,
            },
            naturalisation_years: (!never(years)).then_some(years),
            naturalisation_never: never(years),
            languages: self.nation_languages(address + n.languages).unwrap_or_default(),
            ranking: None,
            points: None,
            founded: None,
            joined_fifa: None,
            joined_continental: None,
            youth_rating: None,
            game_importance: None,
            attendance: None,
            rivals: Vec::new(),
            teams: Vec::new(),
            women: None,
        };

        if let Some(container) = container(&self.process, &self.layout, address, Side::Women) {
            let facts = self.association(container)?;
            details.women = Some(WomenFootball {
                joined_fifa: facts.joined_fifa,
                joined_continental: facts.joined_continental,
                youth_rating: facts.youth_rating,
                game_importance: facts.game_importance,
                attendance: facts.attendance,
                teams: self.national_teams(container, players, staff).unwrap_or_default(),
            });
        }
        // Without the men's container, the nation's own facts are all the rest of the profile has.
        let Some(container) = container(&self.process, &self.layout, address, Side::Men) else {
            return Ok(Some(details));
        };
        let facts = self.association(container)?;
        details.ranking = facts.ranking;
        details.points = facts.points;
        details.founded = facts.founded;
        details.joined_fifa = facts.joined_fifa;
        details.joined_continental = facts.joined_continental;
        details.youth_rating = facts.youth_rating;
        details.game_importance = facts.game_importance;
        details.attendance = facts.attendance;
        details.rivals = self.nation_rivals(container + n.rivals, nation.uid).unwrap_or_default();
        details.teams = self.national_teams(container, players, staff).unwrap_or_default();
        Ok(Some(details))
    }

    /// The facts a container holds by value: the FIFA standing, the association's years, the youth rating, the game
    /// importance and the attendance.
    fn association(&self, container: u64) -> Result<Association, MoveError> {
        let n = self.national()?;
        let c = self.process.read_bytes(container, n.container_end() as usize)?;
        let u16_at = |offset: u64| u16::from_le_bytes([c[offset as usize], c[offset as usize + 1]]);
        let ranking = u16_at(n.ranking);
        let points = f32::from_le_bytes(c[n.points as usize..n.points as usize + 4].try_into().expect("4"));
        let year = |offset: u64| Some(u16_at(offset)).filter(|year| (1850..=2100).contains(year));
        let youth = i16::from_le_bytes([c[n.youth_rating as usize], c[n.youth_rating as usize + 1]]);
        let within = |byte: u8, most: i64| Some(byte).filter(|&byte| i64::from(byte) <= most);
        Ok(Association {
            ranking: (ranking > 0).then_some(ranking),
            points: (ranking > 0 && points.is_finite() && points > 0.0).then_some(points),
            founded: year(n.founded),
            joined_fifa: year(n.joined_fifa),
            joined_continental: year(n.joined_continental),
            youth_rating: u16::try_from(youth).ok().filter(|&youth| i64::from(youth) <= MOST_YOUTH_RATING),
            game_importance: within(c[n.game_importance as usize], MOST_GAME_IMPORTANCE),
            attendance: within(c[n.attendance as usize], MOST_ATTENDANCE),
        })
    }

    /// The languages of the list at `header`: 16-byte entries of a language and the share of people who speak it.
    fn nation_languages(&self, header: u64) -> Result<Vec<NationLanguage>, MoveError> {
        let (n, name) = (self.national()?, self.layout.language.as_ref().map(|l| l.name));
        let entries = self.entries(header, n.entry_size, MOST_LANGUAGES)?;
        Ok(entries
            .iter()
            .filter_map(|entry| {
                let language = u64::from_le_bytes(entry[0..8].try_into().ok()?);
                if !is_user_pointer(language) {
                    return None;
                }
                let percent = entry[n.language_percent as usize];
                let name = name
                    .and_then(|name| self.process.read_u64(language + name).ok())
                    .and_then(|text| read_fm_string(&self.process, text));
                Some(NationLanguage { name, percent: percent.min(100) })
            })
            .collect())
    }

    /// The rivals in the relation list at `header` of a container, strongest first.
    fn nation_rivals(&self, header: u64, own: Option<u32>) -> Result<Vec<Related>, MoveError> {
        let (n, r) = (self.national()?, &self.layout.relation);
        let entries = self.entries(header, r.size, 256)?;
        let mut rivals: Vec<Related> = entries
            .iter()
            .filter(|entry| entry[r.target_kind as usize] == NATION_TARGET && entry[r.relation as usize] == RIVAL)
            .filter_map(|entry| {
                let container = u64::from_le_bytes(entry[r.target as usize..r.target as usize + 8].try_into().ok()?);
                if !is_user_pointer(container) {
                    return None;
                }
                let nation =
                    self.process.read_u64(container + n.container_nation).ok().filter(|&p| is_user_pointer(p))?;
                let uid = self.process.read_u32(nation + self.layout.nation.uid).ok()?;
                let name = self
                    .process
                    .read_u64(nation + self.layout.nation.name)
                    .ok()
                    .and_then(|text| read_fm_string(&self.process, text));
                Some(Related { uid, name, strength: Some(entry[r.value as usize]) })
            })
            .filter(|rival| Some(rival.uid) != own)
            .collect();
        rivals.sort_by_key(|rival| std::cmp::Reverse(rival.strength));
        Ok(rivals)
    }

    /// The national teams of `container` that have a squad or a manager, and the senior team; the senior team first.
    fn national_teams(
        &self,
        container: u64,
        players: &PlayerIndex,
        staff: &StaffIndex,
    ) -> Result<Vec<NationalTeam>, MoveError> {
        let (n, t) = (self.national()?, &self.layout.team);
        let Some(list) = PointerList::read_up_to(&self.process, container + n.teams, MOST_TEAMS)? else {
            return Ok(Vec::new());
        };
        let mut teams = Vec::new();
        for team in list.elements(&self.process)? {
            if !is_user_pointer(team) || self.process.read_u64(team + t.club)? != container {
                continue;
            }
            let bytes = self.process.read_bytes(team, t.end().max(n.team_manager + 8) as usize)?;
            let u64_at =
                |offset: u64| u64::from_le_bytes(bytes[offset as usize..offset as usize + 8].try_into().expect("8"));
            let kind = u32::from_le_bytes(bytes[t.kind as usize..t.kind as usize + 4].try_into().expect("4"));
            let age_limit = bytes[t.age_limit as usize];
            let squad = match PointerList::read_up_to(&self.process, team + t.players, MOST_PLAYERS)? {
                Some(list) => {
                    list.elements(&self.process)?.into_iter().filter_map(|p| self.player_at(p, players)).collect()
                }
                None => Vec::new(),
            };
            let manager = self.staff_at(u64_at(n.team_manager), staff);
            if squad.is_empty() && manager.is_none() && kind != SENIOR {
                continue;
            }
            let reputation = u16::from_le_bytes([bytes[t.reputation as usize], bytes[t.reputation as usize + 1]]);
            teams.push(NationalTeam {
                kind,
                age_limit: (age_limit != NO_AGE_LIMIT && age_limit < 100).then_some(age_limit),
                reputation,
                manager,
                captain: self.player_by_block(u64_at(t.captain), players),
                vice_captain: self.player_by_block(u64_at(t.vice_captain), players),
                squad,
            });
        }
        teams.sort_by_key(|team| (team.kind != 0, std::cmp::Reverse(team.age_limit)));
        Ok(teams)
    }

    /// The player whose object is at `object`, if the lists have him there.
    fn player_at(&self, object: u64, players: &PlayerIndex) -> Option<Person> {
        let p = &self.layout.player;
        p.person_block_shifts.iter().find_map(|&shift| {
            let uid = self.process.read_u32(object + p.at(p.uid, shift)).ok()?;
            players
                .get(uid)
                .filter(|player| player.address == object)
                .map(|player| Person { uid, name: player.name.clone() })
        })
    }

    /// The player whose identity block is at `block`, as a captaincy points at him.
    fn player_by_block(&self, block: u64, players: &PlayerIndex) -> Option<Person> {
        let p = &self.layout.player;
        if !is_user_pointer(block) {
            return None;
        }
        let uid = self.process.read_u32(block + (p.uid - p.identity())).ok()?;
        players
            .get(uid)
            .filter(|player| player.address + p.identity() + player.shift == block)
            .map(|player| Person { uid, name: player.name.clone() })
    }

    /// The member of staff whose object is at `object`, if the lists have him there.
    fn staff_at(&self, object: u64, staff: &StaffIndex) -> Option<Person> {
        let s = &self.layout.staff;
        if !is_user_pointer(object) {
            return None;
        }
        s.person_block_shifts.iter().find_map(|&shift| {
            let uid = self.process.read_u32(object + s.at(s.uid, shift)).ok()?;
            staff
                .get(uid)
                .filter(|member| member.address == object)
                .map(|member| Person { uid, name: member.name.clone() })
        })
    }

    /// The entries of `size` bytes of the `(begin, end, capacity)` list at `header`; at most `most` of them.
    fn entries(&self, header: u64, size: u64, most: u64) -> Result<Vec<Vec<u8>>, MoveError> {
        let words = self.process.read_bytes(header, 24)?;
        let word = |i: usize| u64::from_le_bytes(words[i * 8..i * 8 + 8].try_into().expect("8 bytes"));
        let (begin, end, capacity) = (word(0), word(1), word(2));
        if begin == end {
            return Ok(Vec::new());
        }
        let sane = is_user_pointer(begin)
            && begin < end
            && end <= capacity
            && (end - begin).is_multiple_of(size)
            && end - begin <= size * most;
        if !sane {
            return Err(MoveError::NotListed);
        }
        let bytes = self.process.read_bytes(begin, (end - begin) as usize)?;
        Ok(bytes.chunks(size as usize).map(<[u8]>::to_vec).collect())
    }

    fn national(&self) -> Result<&crate::profile::NationalLayout, MoveError> {
        self.layout.national.as_ref().ok_or(MoveError::NotListed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn years_below_one_are_never() {
        // As the game reads the byte: signed, and never below 1.
        assert!(never(NEVER) && never(0) && never(128));
        assert!(!never(1) && !never(7) && !never(99) && !never(127));
    }
}
