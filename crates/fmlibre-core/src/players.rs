use std::collections::HashMap;

use fmlibre_mem::{Module, Process, is_user_pointer};
use serde::Serialize;

use crate::calibrate::ArrayRef;
use crate::date::FmDate;
use crate::details::POSITIONS;
use crate::index::{Listed, SearchIndex};
use crate::profile::{Layout, PlayerLayout};
use crate::text::{Memo, display_name, is_name_like, read_fm_string, read_name_entry};

/// The fields shown in player lists.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSummary {
    pub uid: u32,
    /// Display name: the common name if set, otherwise first and last name.
    pub name: String,
    /// Full birth name, when FM stores one.
    pub full_name: Option<String>,
    pub date_of_birth: Option<FmDate>,
    /// Age on the in-game date, when both dates are known.
    pub age: Option<u16>,
    pub nation: Option<String>,
    pub club: Option<String>,
    /// Positions rated 15 or more (see [`crate::POSITIONS`] keys), best first.
    pub positions: Vec<&'static str>,
    pub contract_expires: Option<FmDate>,
    pub current_ability: u16,
    pub potential_ability: i16,
    /// All 15 position ratings, in [`crate::POSITIONS`] order.
    #[serde(skip)]
    pub position_ratings: [u8; 15],
    /// Address of the player object in the game process.
    #[serde(skip)]
    pub address: u64,
    /// How far this object's person block is shifted (see [`PlayerLayout::person_block_shifts`]).
    #[serde(skip)]
    pub shift: u64,
}

impl Listed for PlayerSummary {
    fn uid(&self) -> u32 {
        self.uid
    }

    fn names(&self) -> String {
        match &self.full_name {
            Some(full) => format!("{} {full}", self.name),
            None => self.name.clone(),
        }
    }

    fn display_name(&self) -> &str {
        &self.name
    }

    fn rank(&self) -> i32 {
        i32::from(self.current_ability)
    }
}

/// Players with a search index over their names.
pub type PlayerIndex = SearchIndex<PlayerSummary>;

/// Reads every player in the players array; ages are computed for `today`. Only reads memory.
pub fn read_players(
    process: &Process,
    module: &Module,
    array: &ArrayRef,
    layout: &Layout,
    today: Option<FmDate>,
) -> fmlibre_mem::Result<Vec<PlayerSummary>> {
    let p = &layout.player;
    let (begin, count) = array.locate(process, module)?;
    let pointers = process.read_bytes(begin, (count * 8) as usize)?;
    let plain_len = p.end() as usize;
    let mut buf = Vec::with_capacity(plain_len + p.max_shift() as usize);

    // The person-block shift is a property of the object's class, so decide it once per vtable.
    let mut shifts: HashMap<u64, u64> = HashMap::new();
    // Many players share first names, clubs and nations; resolve each pointer once.
    let mut names = Memo::default();
    let mut clubs = Memo::default();
    let mut nations = Memo::default();

    let mut players = Vec::with_capacity(count as usize);
    for chunk in pointers.as_chunks::<8>().0 {
        let object = u64::from_le_bytes(*chunk);
        if !is_user_pointer(object) {
            continue;
        }
        buf.resize(plain_len, 0);
        if process.read_into(object, &mut buf).is_err() {
            continue;
        }
        let class = u64::from_le_bytes(buf[..8].try_into().expect("8 bytes"));
        let shift = *shifts.entry(class).or_insert_with(|| person_shift(process, p, object));
        if shift > 0 {
            buf.resize(plain_len + shift as usize, 0);
            if process.read_into(object, &mut buf).is_err() {
                continue;
            }
        }

        let at = |offset: u64| p.at(offset, shift) as usize;
        let u16_at = |offset: u64| u16::from_le_bytes([buf[at(offset)], buf[at(offset) + 1]]);
        let u32_at = |offset: u64| u32::from_le_bytes(buf[at(offset)..at(offset) + 4].try_into().expect("4 bytes"));
        let u64_at = |offset: u64| u64::from_le_bytes(buf[at(offset)..at(offset) + 8].try_into().expect("8 bytes"));

        let uid = u32_at(p.uid);
        let full_name = read_fm_string(process, u64_at(p.full_name));
        let mut name_part = |offset| names.get(u64_at(offset), |entry| read_name_entry(process, entry));
        let (common, first, last) = (name_part(p.common_name), name_part(p.first_name), name_part(p.last_name));
        let name = display_name(common, first, last, full_name.as_ref(), uid);

        let club = clubs.get(u64_at(p.team), |team| club_of_team(process, layout, team));
        let nation = nations.get(u64_at(p.nation), |nation| nation_name(process, layout, nation));

        let date_of_birth = FmDate::from_raw(u16_at(p.date_of_birth), u16_at(p.date_of_birth + 2));
        let mut position_ratings = [0u8; POSITIONS.len()];
        position_ratings.copy_from_slice(&buf[at(p.positions)..at(p.positions) + POSITIONS.len()]);
        let contract = u64_at(p.contract);
        let contract_expires = is_user_pointer(contract)
            .then(|| process.read_u32(contract + layout.contract.expires).ok())
            .flatten()
            .and_then(|raw| FmDate::from_raw(raw as u16, (raw >> 16) as u16));
        players.push(PlayerSummary {
            uid,
            name,
            full_name,
            date_of_birth,
            age: date_of_birth.zip(today).and_then(|(born, today)| born.age_on(today)),
            nation,
            club,
            positions: natural_positions(&position_ratings),
            contract_expires,
            current_ability: u16_at(p.current_ability),
            potential_ability: u16_at(p.potential_ability) as i16,
            position_ratings,
            address: object,
            shift,
        });
    }
    Ok(players)
}

/// Rating from which FM calls a position one the player can play ("accomplished").
pub const PLAYABLE_RATING: u8 = 15;

/// Positions rated at least [`PLAYABLE_RATING`], best first.
pub(crate) fn natural_positions(ratings: &[u8; POSITIONS.len()]) -> Vec<&'static str> {
    let mut playable: Vec<(u8, usize)> =
        ratings.iter().enumerate().filter(|&(_, &r)| r >= PLAYABLE_RATING).map(|(i, &r)| (r, i)).collect();
    playable.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    playable.into_iter().map(|(_, i)| POSITIONS[i]).collect()
}

/// The name of the club a team belongs to.
pub(crate) fn club_of_team(process: &Process, layout: &Layout, team: u64) -> Option<String> {
    let club = process.read_u64(team + layout.team.club).ok()?;
    read_fm_string(process, process.read_u64(club + layout.club.name).ok()?)
}

/// The name of a nation object.
pub(crate) fn nation_name(process: &Process, layout: &Layout, nation: u64) -> Option<String> {
    read_fm_string(process, process.read_u64(nation + layout.nation.name).ok()?)
}

/// Finds where `object` keeps its person block: the candidate shift under which most
/// of the player's name decodes, preferring the smaller shift on a tie.
pub(crate) fn person_shift(process: &Process, p: &PlayerLayout, object: u64) -> u64 {
    let mut best = (0, 0);
    for &shift in &p.person_block_shifts {
        let score = name_score(process, p, object, shift);
        if score > best.0 {
            best = (score, shift);
        }
    }
    best.1
}

/// How many of a player's name parts (full name, first, last) decode under `shift`;
/// zero when the UID is unset.
pub(crate) fn name_score(process: &Process, p: &PlayerLayout, object: u64, shift: u64) -> u32 {
    if !process.read_u32(object + p.at(p.uid, shift)).is_ok_and(|uid| uid != 0) {
        return 0;
    }
    let pointer_at = |offset: u64| process.read_u64(object + p.at(offset, shift)).unwrap_or(0);
    let named = |text: Option<String>| u32::from(text.is_some_and(|t| is_name_like(&t)));
    named(read_fm_string(process, pointer_at(p.full_name)))
        + named(read_name_entry(process, pointer_at(p.first_name)))
        + named(read_name_entry(process, pointer_at(p.last_name)))
}
