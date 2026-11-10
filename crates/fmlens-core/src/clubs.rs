use std::collections::hash_map::Entry;
use std::collections::{BTreeMap, HashMap};

use fmlens_mem::{Module, Process, is_user_pointer};
use serde::{Deserialize, Serialize};

use crate::calibrate::ArrayRef;
use crate::index::{Listed, SearchIndex};
use crate::profile::{ClubFinanceLayout, Layout, StadiumLayout};
use crate::relations::Related;
use crate::text::read_fm_string;

/// Supporter-mix percentages in the order FM stores them.
pub const SUPPORTER_MIX: [&str; 6] = ["hardcore", "core", "family", "fair_weather", "casual", "other"];

/// Supporter traits (1–20) in the order FM stores them.
pub const SUPPORTER_TRAITS: [&str; 6] = ["loyalty", "passion", "patience", "affluence", "temperament", "expectations"];

/// The fields shown in club lists.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClubSummary {
    pub uid: u32,
    /// Full name, e.g. "Tottenham Hotspur".
    pub name: String,
    pub short_name: Option<String>,
    /// A women's club.
    pub women: bool,
    /// 0–10000, from the senior team.
    pub reputation: Option<u16>,
    pub founded: Option<u16>,
    #[serde(skip)]
    pub address: u64,
}

impl Listed for ClubSummary {
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
        self.reputation.map_or(-1, i32::from)
    }
}

pub type ClubIndex = SearchIndex<ClubSummary>;

/// Reads every club. Entries without a name (a few special records share the array)
/// are skipped. Only reads memory.
pub fn read_clubs(
    process: &Process,
    module: &Module,
    array: &ArrayRef,
    layout: &Layout,
) -> fmlens_mem::Result<Vec<ClubSummary>> {
    let c = &layout.club;
    let (begin, count) = array.locate(process, module)?;
    let pointers = process.read_bytes(begin, (count * 8) as usize)?;
    let mut buf = vec![0u8; c.end() as usize];

    let mut clubs = Vec::with_capacity(count as usize);
    for chunk in pointers.as_chunks::<8>().0 {
        let object = u64::from_le_bytes(*chunk);
        if !is_user_pointer(object) || process.read_into(object, &mut buf).is_err() {
            continue;
        }
        let u64_at =
            |offset: u64| u64::from_le_bytes(buf[offset as usize..offset as usize + 8].try_into().expect("8 bytes"));
        let Some(name) = read_fm_string(process, u64_at(c.name)) else {
            continue;
        };
        let info = u64_at(c.info);
        clubs.push(ClubSummary {
            uid: u32::from_le_bytes(buf[c.uid as usize..c.uid as usize + 4].try_into().expect("4 bytes")),
            name,
            short_name: read_fm_string(process, u64_at(c.short_name)),
            women: buf[c.women as usize] == 1,
            reputation: senior_team(process, u64_at(c.teams))
                .and_then(|team| read_u16(process, team + layout.team.reputation)),
            founded: is_user_pointer(info)
                .then(|| read_u16(process, info + layout.club_info.founded))
                .flatten()
                .filter(|&year| year > 1800),
            address: object,
        });
    }
    Ok(clubs)
}

/// The first of a club's teams, which is its senior team.
fn senior_team(process: &Process, teams: u64) -> Option<u64> {
    if !is_user_pointer(teams) {
        return None;
    }
    process.read_u64(teams).ok().filter(|&team| is_user_pointer(team))
}

fn read_u16(process: &Process, addr: u64) -> Option<u16> {
    let bytes = process.read_bytes(addr, 2).ok()?;
    Some(u16::from_le_bytes([bytes[0], bytes[1]]))
}

/// Everything the club profile shows.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClubDetails {
    #[serde(flatten)]
    pub summary: ClubSummary,
    pub season_tickets: Option<u32>,
    pub social_media: Option<u32>,
    /// Supporter-mix percentages by [`SUPPORTER_MIX`] key; empty when unknown.
    pub supporter_mix: BTreeMap<&'static str, u8>,
    /// Supporter traits (1–20) by [`SUPPORTER_TRAITS`] key; empty when unknown.
    pub supporter_traits: BTreeMap<&'static str, u8>,
    /// training, youth_facilities, youth_coaching, youth_recruitment and, with full
    /// finances, corporate (1–20).
    pub facilities: BTreeMap<&'static str, u8>,
    /// Only clubs with the full finance record have these.
    pub finances: Option<Finances>,
    /// The stadium the senior team plays at, when the layout knows where it is and it looks real.
    pub stadium: Option<Stadium>,
    /// Its rivals, strongest first (see [`crate::Session::club_rivals`]). Read-only.
    pub rivals: Vec<Related>,
    /// The clubs it has links with (see [`crate::Session::club_links`]). Read-only.
    pub links: Vec<Related>,
}

/// A stadium's name and capacities, as stored.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stadium {
    pub name: Option<String>,
    pub capacity: u32,
    pub seating: u32,
    /// The capacity in use when it is limited; 0 when it is not.
    pub used: u32,
    /// The most it can be expanded to.
    pub expansion: u32,
}

/// A club whose senior team plays at a stadium.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StadiumClub {
    pub uid: u32,
    pub name: String,
    pub women: bool,
}

/// One senior-team stadium, with every club whose senior team plays there. Read from the same layout as the club
/// profile.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StadiumSummary {
    /// Row id: the UID of the first of `clubs`. A club plays at one stadium, so no two rows share it.
    pub uid: u32,
    /// Highest reputation first. Never empty.
    pub clubs: Vec<StadiumClub>,
    pub name: Option<String>,
    pub capacity: u32,
    pub seating: u32,
    pub used: u32,
    pub expansion: u32,
}

impl StadiumSummary {
    /// The club the row is named after when the stadium has no name of its own.
    fn first_club(&self) -> &str {
        self.clubs.first().map_or("", |club| club.name.as_str())
    }
}

impl Listed for StadiumSummary {
    fn uid(&self) -> u32 {
        self.uid
    }

    fn names(&self) -> String {
        self.name
            .iter()
            .map(String::as_str)
            .chain(self.clubs.iter().map(|club| club.name.as_str()))
            .collect::<Vec<_>>()
            .join(" ")
    }

    fn display_name(&self) -> &str {
        self.name.as_deref().unwrap_or_else(|| self.first_club())
    }

    fn rank(&self) -> i32 {
        i32::try_from(self.capacity).unwrap_or(i32::MAX)
    }
}

/// Filters for the stadiums list. Unset fields match every stadium.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StadiumFilter {
    /// `Some(true)` for the stadiums a women's club plays at, `Some(false)` for those a men's club plays at.
    pub women: Option<bool>,
    pub min_capacity: Option<u32>,
    pub max_capacity: Option<u32>,
}

impl StadiumFilter {
    pub fn matches(&self, stadium: &StadiumSummary) -> bool {
        self.women.is_none_or(|women| stadium.clubs.iter().any(|club| club.women == women))
            && self.min_capacity.is_none_or(|min| stadium.capacity >= min)
            && self.max_capacity.is_none_or(|max| stadium.capacity <= max)
    }
}

/// The largest capacity a stadium's fields are believed to hold; the biggest of the test save held 115,109.
const MOST_SEATS: u32 = 300_000;

/// Whether a stadium's bytes (from its start to [`StadiumLayout::end`]) look like a stadium's: capacities in range,
/// with no more seats than room.
pub(crate) fn stadium_looks_real(bytes: &[u8], s: &StadiumLayout) -> bool {
    let u32_at =
        |offset: u64| u32::from_le_bytes(bytes[offset as usize..offset as usize + 4].try_into().expect("4 bytes"));
    let (capacity, seating) = (u32_at(s.capacity), u32_at(s.seating));
    capacity <= MOST_SEATS && seating <= capacity && u32_at(s.used) <= MOST_SEATS && u32_at(s.expansion) <= MOST_SEATS
}

/// The stadium the senior team of the club at `club` plays at, with its address, when the layout knows where it is
/// and it looks real.
pub(crate) fn club_stadium(process: &Process, layout: &Layout, club: u64) -> Option<(u64, Vec<u8>)> {
    let s = layout.stadium.as_ref()?;
    let teams = process.read_u64(club + layout.club.teams).ok().filter(|&p| is_user_pointer(p))?;
    let team = process.read_u64(teams).ok().filter(|&p| is_user_pointer(p))?;
    if process.read_u64(team + layout.team.club).ok()? != club {
        return None;
    }
    let stadium = process.read_u64(team + s.team_pointer).ok().filter(|&p| is_user_pointer(p))?;
    let bytes = process.read_bytes(stadium, s.end() as usize).ok()?;
    stadium_looks_real(&bytes, s).then_some((stadium, bytes))
}

/// The senior stadiums the layout can read, each once with the clubs that play there. Empty when this build has no
/// stadium layout. Only reads memory.
pub fn read_stadiums<'a>(
    process: &Process,
    layout: &Layout,
    clubs: impl IntoIterator<Item = &'a ClubSummary>,
) -> Vec<StadiumSummary> {
    let Some(s) = layout.stadium.as_ref() else {
        return Vec::new();
    };
    let found = clubs.into_iter().filter_map(|club| {
        let (address, bytes) = club_stadium(process, layout, club.address)?;
        Some((address, club, bytes))
    });
    group_by_stadium(found, |bytes| stadium_row(process, s, bytes))
}

/// One row per stadium address in `found`, which gives the stadium each club plays at with the stadium's bytes; the
/// row is made by `row` from the bytes the first time the stadium is seen. Rows keep the order they were first seen in.
fn group_by_stadium<'a, B>(
    found: impl IntoIterator<Item = (u64, &'a ClubSummary, B)>,
    row: impl Fn(&B) -> StadiumSummary,
) -> Vec<StadiumSummary> {
    let mut at: HashMap<u64, usize> = HashMap::new();
    let mut rows: Vec<(StadiumSummary, Vec<&ClubSummary>)> = Vec::new();
    for (address, club, bytes) in found {
        match at.entry(address) {
            Entry::Occupied(seen) => rows[*seen.get()].1.push(club),
            Entry::Vacant(new) => {
                new.insert(rows.len());
                rows.push((row(&bytes), vec![club]));
            }
        }
    }
    rows.into_iter()
        .map(|(mut row, mut tenants)| {
            // Stable, and an unknown reputation goes last.
            tenants.sort_by_key(|club| std::cmp::Reverse(club.reputation));
            row.uid = tenants[0].uid;
            row.clubs = tenants
                .iter()
                .map(|club| StadiumClub { uid: club.uid, name: club.name.clone(), women: club.women })
                .collect();
            row
        })
        .collect()
}

/// A stadium's row from its bytes, with no clubs yet.
fn stadium_row(process: &Process, s: &StadiumLayout, bytes: &[u8]) -> StadiumSummary {
    let u32_at =
        |offset: u64| u32::from_le_bytes(bytes[offset as usize..offset as usize + 4].try_into().expect("4 bytes"));
    let name = u64::from_le_bytes(bytes[s.name as usize..s.name as usize + 8].try_into().expect("8 bytes"));
    StadiumSummary {
        uid: 0,
        clubs: Vec::new(),
        name: read_fm_string(process, name).filter(|name| !name.trim().is_empty()),
        capacity: u32_at(s.capacity),
        seating: u32_at(s.seating),
        used: u32_at(s.used),
        expansion: u32_at(s.expansion),
    }
}

/// The class (vtable) of stadiums: the one the clubs' stadiums share, when nearly all of them share one. Only objects
/// of this class are written to.
pub(crate) fn stadium_class(process: &Process, module: &Module, array: &ArrayRef, layout: &Layout) -> Option<u64> {
    let (begin, count) = array.locate(process, module).ok()?;
    let pointers = process.read_bytes(begin, (count * 8) as usize).ok()?;
    let mut classes: BTreeMap<u64, usize> = BTreeMap::new();
    let mut found = 0;
    for chunk in pointers.as_chunks::<8>().0 {
        let club = u64::from_le_bytes(*chunk);
        if let Some((_, bytes)) = is_user_pointer(club).then(|| club_stadium(process, layout, club)).flatten() {
            found += 1;
            *classes.entry(u64::from_le_bytes(bytes[..8].try_into().expect("8 bytes"))).or_default() += 1;
        }
    }
    let (&class, &count) = classes.iter().max_by_key(|&(_, &count)| count)?;
    (count >= 10 && count * 100 >= found * 99).then_some(class)
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finances {
    /// Pounds.
    pub balance: i32,
    /// Pounds.
    pub transfer_budget: i32,
    /// Pounds per week.
    pub wage_budget: i32,
    /// Pounds per week.
    pub total_wage_budget: i32,
    /// Average match ticket, pounds.
    pub ticket_price: f32,
}

/// Reads the full profile of `club`; `None` when its object no longer belongs to it.
/// Only reads memory.
pub fn read_club_details(
    process: &Process,
    layout: &Layout,
    club: &ClubSummary,
) -> fmlens_mem::Result<Option<ClubDetails>> {
    let c = &layout.club;
    let buf = process.read_bytes(club.address, c.end() as usize)?;
    let u64_at =
        |offset: u64| u64::from_le_bytes(buf[offset as usize..offset as usize + 8].try_into().expect("8 bytes"));
    if u32::from_le_bytes(buf[c.uid as usize..c.uid as usize + 4].try_into().expect("4 bytes")) != club.uid {
        return Ok(None);
    }

    let mut details = ClubDetails {
        summary: club.clone(),
        season_tickets: None,
        social_media: None,
        supporter_mix: BTreeMap::new(),
        supporter_traits: BTreeMap::new(),
        facilities: BTreeMap::new(),
        finances: None,
        stadium: None,
        rivals: Vec::new(),
        links: Vec::new(),
    };
    if let (Some(s), Some((_, bytes))) = (layout.stadium.as_ref(), club_stadium(process, layout, club.address)) {
        let u32_at =
            |offset: u64| u32::from_le_bytes(bytes[offset as usize..offset as usize + 4].try_into().expect("4 bytes"));
        let name = u64::from_le_bytes(bytes[s.name as usize..s.name as usize + 8].try_into().expect("8 bytes"));
        details.stadium = Some(Stadium {
            name: read_fm_string(process, name),
            capacity: u32_at(s.capacity),
            seating: u32_at(s.seating),
            used: u32_at(s.used),
            expansion: u32_at(s.expansion),
        });
    }

    let i = &layout.club_info;
    let info = u64_at(c.info);
    if let Some(info) = is_user_pointer(info).then(|| process.read_bytes(info, i.end() as usize).ok()).flatten() {
        let u32_at =
            |offset: u64| u32::from_le_bytes(info[offset as usize..offset as usize + 4].try_into().expect("4 bytes"));
        details.season_tickets = Some(u32_at(i.season_tickets));
        details.social_media = Some(u32_at(i.social_media));
        details.supporter_mix =
            SUPPORTER_MIX.iter().enumerate().map(|(n, &key)| (key, info[i.supporter_mix as usize + n])).collect();
        details.supporter_traits =
            SUPPORTER_TRAITS.iter().enumerate().map(|(n, &key)| (key, info[i.supporter_traits as usize + n])).collect();
        for (key, offset) in [
            ("training", i.training),
            ("youth_facilities", i.youth_facilities),
            ("youth_coaching", i.youth_coaching),
            ("youth_recruitment", i.youth_recruitment),
        ] {
            details.facilities.insert(key, info[offset as usize]);
        }
    }

    let f = &layout.club_finance;
    let finance = u64_at(c.finance);
    if let Some(bytes) = is_user_pointer(finance).then(|| process.read_bytes(finance, f.end() as usize).ok()).flatten()
        && finances_look_real(&bytes, f)
    {
        let i32_at =
            |offset: u64| i32::from_le_bytes(bytes[offset as usize..offset as usize + 4].try_into().expect("4 bytes"));
        details.facilities.insert("corporate", bytes[f.corporate as usize]);
        details.finances = Some(Finances {
            balance: i32_at(f.balance),
            transfer_budget: i32_at(f.transfer_budget),
            wage_budget: i32_at(f.wage_budget),
            total_wage_budget: i32_at(f.total_wage_budget),
            ticket_price: f32_at(&bytes, f.ticket_price),
        });
    }
    Ok(Some(details))
}

fn f32_at(bytes: &[u8], offset: u64) -> f32 {
    f32::from_le_bytes(bytes[offset as usize..offset as usize + 4].try_into().expect("4 bytes"))
}

/// Whether the bytes of a finance record (from its start to [`ClubFinanceLayout::end`])
/// look like a real club's full record. The smaller finance class ends long before the
/// budget fields, so what is read there belongs to something else and looks wrong.
/// The transfer budget is not checked: a club that has overspent has a real negative one.
pub(crate) fn finances_look_real(bytes: &[u8], f: &ClubFinanceLayout) -> bool {
    let i32_at =
        |offset: u64| i32::from_le_bytes(bytes[offset as usize..offset as usize + 4].try_into().expect("4 bytes"));
    let ticket_price = f32_at(bytes, f.ticket_price);
    ticket_price.is_finite()
        && (1.0..=1000.0).contains(&ticket_price)
        && (1..=20).contains(&bytes[f.corporate as usize])
        && i32_at(f.wage_budget) >= 0
        && i32_at(f.total_wage_budget) >= 0
}

/// The class (vtable) of the full finance record: the one shared by the clubs whose
/// finances look real, when nearly all of them share one. Only records of this class
/// are long enough to hold the budgets, so only they are ever written.
pub(crate) fn full_finance_class(process: &Process, module: &Module, array: &ArrayRef, layout: &Layout) -> Option<u64> {
    let f = &layout.club_finance;
    let (begin, count) = array.locate(process, module).ok()?;
    let pointers = process.read_bytes(begin, (count * 8) as usize).ok()?;
    let mut classes: BTreeMap<u64, usize> = BTreeMap::new();
    let mut real = 0;
    for chunk in pointers.as_chunks::<8>().0 {
        let club = u64::from_le_bytes(*chunk);
        let Some(finance) = is_user_pointer(club).then(|| process.read_u64(club + layout.club.finance).ok()).flatten()
        else {
            continue;
        };
        if !is_user_pointer(finance) {
            continue;
        }
        let Ok(bytes) = process.read_bytes(finance, f.end() as usize) else {
            continue;
        };
        if finances_look_real(&bytes, f) {
            real += 1;
            *classes.entry(u64::from_le_bytes(bytes[..8].try_into().expect("8 bytes"))).or_default() += 1;
        }
    }
    let (&class, &count) = classes.iter().max_by_key(|&(_, &count)| count)?;
    // One class for (nearly) every real-looking record, and more than a handful of them.
    (count >= 10 && count * 100 >= real * 99).then_some(class)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stadium(name: Option<&str>, capacity: u32) -> StadiumSummary {
        StadiumSummary {
            uid: 1,
            clubs: vec![StadiumClub { uid: 1, name: "Northbridge".to_owned(), women: false }],
            name: name.map(str::to_owned),
            capacity,
            seating: capacity,
            used: 0,
            expansion: capacity + 1000,
        }
    }

    #[test]
    fn overspent_transfer_budget_is_a_real_finance_record() {
        let f = ClubFinanceLayout {
            balance: 8,
            transfer_budget: 12,
            total_wage_budget: 16,
            wage_budget: 20,
            ticket_price: 24,
            corporate: 28,
        };
        let record = |transfer_budget: i32, wage_budget: i32| {
            let mut bytes = vec![0u8; f.end() as usize];
            bytes[12..16].copy_from_slice(&transfer_budget.to_le_bytes());
            bytes[16..20].copy_from_slice(&2_000_000i32.to_le_bytes());
            bytes[20..24].copy_from_slice(&wage_budget.to_le_bytes());
            bytes[24..28].copy_from_slice(&35.0f32.to_le_bytes());
            bytes[28] = 12;
            bytes
        };
        assert!(finances_look_real(&record(40_000_000, 1_500_000), &f));
        // No budget set by the board, and a club that has spent more than its budget.
        assert!(finances_look_real(&record(-1, 1_500_000), &f));
        assert!(finances_look_real(&record(-12_500_000, 1_500_000), &f));
        assert!(!finances_look_real(&record(40_000_000, -5), &f));
    }

    #[test]
    fn stadium_filter_bounds_capacity() {
        let row = stadium(Some("Harbour Park"), 40_000);
        assert!(
            StadiumFilter { min_capacity: Some(30_000), max_capacity: Some(50_000), ..StadiumFilter::default() }
                .matches(&row)
        );
        assert!(!StadiumFilter { min_capacity: Some(41_000), ..StadiumFilter::default() }.matches(&row));
        assert!(!StadiumFilter { max_capacity: Some(10_000), ..StadiumFilter::default() }.matches(&row));
        assert_eq!(row.names(), "Harbour Park Northbridge");
        assert_eq!(stadium(None, 12_000).display_name(), "Northbridge");
    }

    fn club(uid: u32, name: &str, women: bool, reputation: Option<u16>) -> ClubSummary {
        ClubSummary { uid, name: name.to_owned(), short_name: None, women, reputation, founded: None, address: 0 }
    }

    #[test]
    fn shared_stadiums_are_one_row_with_every_club() {
        let (city, rovers, ladies, town) = (
            club(10, "City", false, Some(6000)),
            club(20, "Rovers", false, Some(7000)),
            club(30, "City Women", true, None),
            club(40, "Town", false, Some(3000)),
        );
        let found = [(0x100, &city, 40_000), (0x200, &town, 9_000), (0x100, &rovers, 40_000), (0x100, &ladies, 40_000)];
        let rows = group_by_stadium(found, |&capacity| StadiumSummary { clubs: Vec::new(), ..stadium(None, capacity) });
        assert_eq!(rows.len(), 2);
        // The best-known club first; the row is named after it and takes its UID.
        let shared = &rows[0];
        assert_eq!(shared.clubs.iter().map(|c| c.uid).collect::<Vec<_>>(), [20, 10, 30]);
        assert_eq!((shared.uid, shared.display_name()), (20, "Rovers"));
        assert_eq!(shared.names(), "Rovers City City Women");
        assert_eq!((rows[1].uid, rows[1].clubs.len()), (40, 1));
        // A ground both kinds of club play at matches either kind.
        assert!(StadiumFilter { women: Some(true), ..StadiumFilter::default() }.matches(shared));
        assert!(StadiumFilter { women: Some(false), ..StadiumFilter::default() }.matches(shared));
        assert!(!StadiumFilter { women: Some(true), ..StadiumFilter::default() }.matches(&rows[1]));
    }
}
