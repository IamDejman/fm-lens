use std::collections::HashMap;

use fmlibre_mem::{Module, Process, is_user_pointer};
use serde::Serialize;

use crate::calibrate::ArrayRef;
use crate::date::FmDate;
use crate::profile::{Layout, PlayerLayout};
use crate::text::{fold, is_name_like, read_fm_string, read_name_entry};

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
    pub nation: Option<String>,
    pub club: Option<String>,
    pub current_ability: u16,
    pub potential_ability: i16,
    /// Address of the player object in the game process.
    #[serde(skip)]
    pub address: u64,
    /// How far this object's person block is shifted (see [`PlayerLayout::person_block_shifts`]).
    #[serde(skip)]
    pub shift: u64,
}

/// Reads every player in the players array. Only reads memory.
pub fn read_players(
    process: &Process,
    module: &Module,
    array: &ArrayRef,
    layout: &Layout,
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
        let common = name_part(p.common_name);
        let first = name_part(p.first_name);
        let last = name_part(p.last_name);
        let name = common
            .or_else(|| match (first, last) {
                (Some(first), Some(last)) => Some(format!("{first} {last}")),
                (first, last) => first.or(last),
            })
            .or_else(|| full_name.clone())
            .unwrap_or_else(|| format!("UID {uid}"));

        let club = clubs.get(u64_at(p.team), |team| {
            let club = process.read_u64(team + layout.team.club).ok()?;
            read_fm_string(process, process.read_u64(club + layout.club.name).ok()?)
        });
        let nation = nations.get(u64_at(p.nation), |nation| {
            read_fm_string(process, process.read_u64(nation + layout.nation.name).ok()?)
        });

        players.push(PlayerSummary {
            uid,
            name,
            full_name,
            date_of_birth: FmDate::from_raw(u16_at(p.date_of_birth), u16_at(p.date_of_birth + 2)),
            nation,
            club,
            current_ability: u16_at(p.current_ability),
            potential_ability: u16_at(p.potential_ability) as i16,
            address: object,
            shift,
        });
    }
    Ok(players)
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

/// Players with a search index over their names.
pub struct PlayerIndex {
    players: Vec<PlayerSummary>,
    folded: Vec<String>,
    by_uid: HashMap<u32, usize>,
}

impl PlayerIndex {
    pub fn new(players: Vec<PlayerSummary>) -> Self {
        let folded = players
            .iter()
            .map(|p| match &p.full_name {
                Some(full) => fold(&format!("{} {full}", p.name)),
                None => fold(&p.name),
            })
            .collect();
        let by_uid = players.iter().enumerate().map(|(i, p)| (p.uid, i)).collect();
        Self { players, folded, by_uid }
    }

    pub fn len(&self) -> usize {
        self.players.len()
    }

    pub fn is_empty(&self) -> bool {
        self.players.is_empty()
    }

    pub fn get(&self, uid: u32) -> Option<&PlayerSummary> {
        self.by_uid.get(&uid).map(|&i| &self.players[i])
    }

    /// Players whose name contains every word of `query` (ignoring accents and case), or
    /// whose UID equals it; highest current ability first. An empty query matches everyone.
    pub fn search(&self, query: &str) -> Vec<&PlayerSummary> {
        let uid: Option<u32> = query.trim().parse().ok();
        let words: Vec<String> = fold(query).split_whitespace().map(str::to_owned).collect();
        let mut hits: Vec<&PlayerSummary> = self
            .players
            .iter()
            .zip(&self.folded)
            .filter(|(p, name)| uid == Some(p.uid) || words.iter().all(|w| name.contains(w.as_str())))
            .map(|(p, _)| p)
            .collect();
        hits.sort_by(|a, b| b.current_ability.cmp(&a.current_ability).then_with(|| a.name.cmp(&b.name)));
        hits
    }
}

/// Caches what a pointer resolves to.
#[derive(Default)]
struct Memo(HashMap<u64, Option<String>>);

impl Memo {
    fn get(&mut self, key: u64, load: impl FnOnce(u64) -> Option<String>) -> Option<String> {
        if !is_user_pointer(key) {
            return None;
        }
        self.0.entry(key).or_insert_with(|| load(key)).clone()
    }
}
