use std::collections::BTreeMap;

use fmlibre_mem::{Module, Process, is_user_pointer};
use serde::Serialize;

use crate::calibrate::ArrayRef;
use crate::index::{Listed, SearchIndex};
use crate::profile::Layout;
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
) -> fmlibre_mem::Result<Vec<ClubSummary>> {
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
) -> fmlibre_mem::Result<Option<ClubDetails>> {
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
    };

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
    {
        let i32_at =
            |offset: u64| i32::from_le_bytes(bytes[offset as usize..offset as usize + 4].try_into().expect("4 bytes"));
        let ticket_price = f32::from_le_bytes(
            bytes[f.ticket_price as usize..f.ticket_price as usize + 4].try_into().expect("4 bytes"),
        );
        let corporate = bytes[f.corporate as usize];
        let finances = Finances {
            balance: i32_at(f.balance),
            transfer_budget: i32_at(f.transfer_budget),
            wage_budget: i32_at(f.wage_budget),
            total_wage_budget: i32_at(f.total_wage_budget),
            ticket_price,
        };
        // The smaller finance class ends long before these offsets, so only trust
        // values that look like a real club's.
        let sane = ticket_price.is_finite()
            && (1.0..=1000.0).contains(&ticket_price)
            && (1..=20).contains(&corporate)
            && finances.transfer_budget >= -1
            && finances.wage_budget >= 0
            && finances.total_wage_budget >= 0;
        if sane {
            details.facilities.insert("corporate", corporate);
            details.finances = Some(finances);
        }
    }
    Ok(Some(details))
}
