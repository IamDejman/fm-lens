use std::collections::{BTreeMap, HashMap};

use fmlens_mem::{Module, Process, is_user_pointer};
use serde::Serialize;

use crate::calibrate::ArrayRef;
use crate::date::FmDate;
use crate::details::{Attribute, PERSONALITY, Reputation};
use crate::filter::attribute_keys;
use crate::index::{Listed, SearchIndex};
use crate::languages::Language;
use crate::national::NationalJob;
use crate::players::{club_of_team, club_uid_of_team, nation_name, nation_uid};
use crate::profile::{Layout, StaffLayout};
use crate::relations::Preference;
use crate::squad::{TeamId, team_id};
use crate::text::{Memo, display_name, is_name_like, read_fm_string, read_name_entry};

/// Staff attributes grouped the way FM shows them.
pub const STAFF_ATTRIBUTE_GROUPS: &[(&str, &[&str])] = &[
    (
        "coaching",
        &[
            "attacking",
            "defending",
            "fitness",
            "goalkeeping",
            "possession",
            "set_pieces",
            "tactical",
            "technical",
            "working_with_youngsters",
        ],
    ),
    ("mental", &["authority", "determination", "motivating", "people_management"]),
    (
        "knowledge",
        &[
            "data_analysis",
            "judging_ability",
            "judging_potential",
            "judging_staff",
            "negotiating",
            "tactical_knowledge",
        ],
    ),
    ("medical", &["physiotherapy", "sports_science"]),
];

/// English name of an FM job code, as stored in contracts. Coaching jobs of
/// player-coaches use the code plus one.
pub fn job_name(code: u8) -> Option<&'static str> {
    let base = if code > 1 && code % 2 == 1 { code - 1 } else { code };
    Some(match base {
        1 => "Player",
        2 => "Coach",
        4 => "Chairperson",
        6 => "Director",
        8 => "Managing Director",
        10 => "Director of Football",
        // Giuseppe Marotta (Inter) and Florentino Pérez (Real Madrid).
        70 => "President",
        12 => "Physio",
        14 => "Scout",
        16 => "Manager",
        20 => "Assistant Manager",
        22 => "Set Piece Coach",
        24 => "General Manager",
        26 => "Fitness Coach",
        34 => "Goalkeeping Coach",
        38 => "Chief Doctor",
        40 => "Head of Sports Science",
        44 => "Chief Scout",
        46 => "Doctor",
        48 => "Sports Scientist",
        50 => "Head Physio",
        58 => "Recruitment Analyst",
        60 => "Performance Analyst",
        62 => "Head Performance Analyst",
        64 => "Head of Youth Development",
        // John Henry (Liverpool) and Tony Bloom.
        66 => "Owner",
        86 => "Loan Manager",
        88 => "Technical Director",
        _ => return None,
    })
}

/// The fields shown in staff lists.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffSummary {
    pub uid: u32,
    pub name: String,
    pub full_name: Option<String>,
    pub date_of_birth: Option<FmDate>,
    pub age: Option<u16>,
    pub nation: Option<String>,
    /// The nation's UID, e.g. for its flag.
    pub nation_uid: Option<u32>,
    /// Address of the nation object, which the nation field points at.
    #[serde(skip)]
    pub nation_address: u64,
    /// The employer, from the contract.
    pub club: Option<String>,
    /// The employer's UID, e.g. for its logo.
    pub club_uid: Option<u32>,
    /// Which of the employer's teams the contract is with: the first team, the U21s...
    pub team: Option<TeamId>,
    /// FM job code from the contract; see [`job_name`].
    pub job: Option<u8>,
    /// The national team they manage (see [`Session::national_managers`]): a job with no club contract. `None` until
    /// the lists are loaded with the nations.
    ///
    /// [`Session::national_managers`]: crate::session::Session::national_managers
    pub national: Option<NationalJob>,
    pub current_ability: u16,
    pub potential_ability: i16,
    /// The manager the player controls in this save.
    pub is_human: bool,
    /// The attributes as FM shows them (1–20), in [`STAFF_ATTRIBUTE_GROUPS`] order, for the list's filters; 0 for one
    /// the layout does not place.
    #[serde(skip)]
    pub attributes: Vec<u8>,
    #[serde(skip)]
    pub address: u64,
    /// How far this object's identity block is shifted (see [`StaffLayout::identity_shifts`]).
    #[serde(skip)]
    pub shift: u64,
    /// The game's own index of the person, which its screens link to: the u32 before the UID, in the identity block.
    #[serde(skip)]
    pub index: u32,
}

impl Listed for StaffSummary {
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
        // The human manager first, then by current ability.
        i32::from(self.current_ability) + if self.is_human { 1000 } else { 0 }
    }
}

pub type StaffIndex = SearchIndex<StaffSummary>;

/// Reads every member of staff; ages are computed for `today`. Only reads memory.
pub fn read_staff(
    process: &Process,
    module: &Module,
    array: &ArrayRef,
    layout: &Layout,
    today: Option<FmDate>,
) -> fmlens_mem::Result<Vec<StaffSummary>> {
    let s = &layout.staff;
    let c = &layout.contract;
    let (begin, count) = array.locate(process, module)?;
    let pointers = process.read_bytes(begin, (count * 8) as usize)?;
    let plain_len = s.end() as usize;
    let mut buf = Vec::with_capacity(plain_len + s.max_shift() as usize);
    let mut contract = vec![0u8; c.end() as usize];
    // Each attribute's offset, and whether it is stored as FM shows it (a rating) rather than 0–100.
    let attribute_offsets: Vec<Option<(u64, bool)>> = attribute_keys(STAFF_ATTRIBUTE_GROUPS)
        .map(|key| {
            s.attributes.get(key).map(|&offset| (offset, false)).or(s.ratings.get(key).map(|&offset| (offset, true)))
        })
        .collect();

    let mut shifts: HashMap<u64, u64> = HashMap::new();
    let mut names = Memo::default();
    let mut clubs = Memo::default();
    let mut club_uids: HashMap<u64, Option<u32>> = HashMap::new();
    let mut teams: HashMap<u64, Option<TeamId>> = HashMap::new();
    let mut nations = Memo::default();
    let mut nation_uids: HashMap<u64, Option<u32>> = HashMap::new();

    let mut staff = Vec::with_capacity(count as usize);
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
        let shift = *shifts.entry(class).or_insert_with(|| person_shift(process, s, object));
        if shift > 0 {
            buf.resize(plain_len + shift as usize, 0);
            if process.read_into(object, &mut buf).is_err() {
                continue;
            }
        }

        let u16_at = |offset: usize| u16::from_le_bytes([buf[offset], buf[offset + 1]]);
        let u32_at = |offset: usize| u32::from_le_bytes(buf[offset..offset + 4].try_into().expect("4 bytes"));
        let u64_at = |offset: usize| u64::from_le_bytes(buf[offset..offset + 8].try_into().expect("8 bytes"));
        let at = |offset: u64| s.at(offset, shift) as usize;

        let uid = u32_at(at(s.uid));
        let full_name = read_fm_string(process, u64_at(at(s.full_name)));
        let mut name_part = |offset| names.get(u64_at(at(offset)), |entry| read_name_entry(process, entry));
        let (common, first, last) = (name_part(s.common_name), name_part(s.first_name), name_part(s.last_name));
        let name = display_name(common, first, last, full_name.as_ref());
        let date_of_birth = FmDate::from_raw(u16_at(at(s.date_of_birth)), u16_at(at(s.date_of_birth) + 2));
        // The human-manager class also holds an account placeholder with no person behind it.
        if shift != 0 && date_of_birth.is_none() {
            continue;
        }
        let nation_ptr = u64_at(at(s.nation));
        let nation = nations.get(nation_ptr, |nation| nation_name(process, layout, nation));
        let nation_uid = *nation_uids.entry(nation_ptr).or_insert_with(|| nation_uid(process, layout, nation_ptr));

        let contract_ptr = u64_at(at(s.contract));
        let (job, club, club_uid, team) = if is_user_pointer(contract_ptr)
            && process.read_into(contract_ptr, &mut contract).is_ok()
        {
            let team = u64::from_le_bytes(contract[c.team as usize..c.team as usize + 8].try_into().expect("8 bytes"));
            let club = clubs.get(team, |team| club_of_team(process, layout, team));
            let club_uid = *club_uids.entry(team).or_insert_with(|| club_uid_of_team(process, layout, team));
            let team = club.as_ref().and(*teams.entry(team).or_insert_with(|| team_id(process, layout, team)));
            (Some(contract[c.job as usize]), club.clone(), club.and(club_uid), team)
        } else {
            (None, None, None, None)
        };

        staff.push(StaffSummary {
            uid,
            name,
            full_name,
            date_of_birth,
            age: date_of_birth.zip(today).and_then(|(born, today)| born.age_on(today)),
            nation_uid: nation.as_ref().and(nation_uid),
            nation,
            nation_address: nation_ptr,
            club,
            club_uid,
            team,
            job,
            national: None,
            current_ability: u16_at(at(s.current_ability)),
            potential_ability: u16_at(at(s.potential_ability)) as i16,
            is_human: shift != 0,
            attributes: attribute_offsets
                .iter()
                .map(|place| match *place {
                    Some((offset, true)) => buf[at(offset)],
                    Some((offset, false)) => Attribute::from_raw(buf[at(offset)]).value,
                    None => 0,
                })
                .collect(),
            address: object,
            shift,
            index: u32_at(at(s.uid) - 4),
        });
    }
    Ok(staff)
}

/// Finds where `object` keeps its person block: the candidate shift under which most
/// of the name decodes, preferring the smaller shift on a tie.
pub(crate) fn person_shift(process: &Process, s: &StaffLayout, object: u64) -> u64 {
    let named = |text: Option<String>| u32::from(text.is_some_and(|t| is_name_like(&t)));
    let mut best = (0, 0);
    for &shift in &s.person_block_shifts {
        let pointer_at = |offset: u64| process.read_u64(object + s.at(offset, shift)).unwrap_or(0);
        let score = named(read_fm_string(process, pointer_at(s.full_name)))
            + named(read_name_entry(process, pointer_at(s.first_name)))
            + named(read_name_entry(process, pointer_at(s.last_name)))
            + named(read_name_entry(process, pointer_at(s.common_name)));
        if score > best.0 {
            best = (score, shift);
        }
    }
    best.1
}

/// Everything the staff profile shows.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffDetails {
    #[serde(flatten)]
    pub summary: StaffSummary,
    pub reputation: Reputation,
    /// Personality ratings (1–20) by [`PERSONALITY`] key.
    pub personality: BTreeMap<&'static str, u8>,
    /// Attributes by key. Ratings FM stores as shown have `raw` equal to `value`.
    pub attributes: BTreeMap<String, Attribute>,
    pub contract: Option<StaffContract>,
    /// Whether a human manager is protected from the sack, where the build and the object make that readable;
    /// `None` for everyone else, never a guess.
    pub unsackable: Option<bool>,
    /// Whether a human manager may register his squad outside the registration windows; read like `unsackable`.
    pub registration_anytime: Option<bool>,
    /// The languages he speaks besides, usually, his native one.
    pub languages: Vec<Language>,
    /// The people and clubs he favours and dislikes.
    pub preferences: Vec<Preference>,
    /// What he knows of each nation (see [`crate::Session::nation_knowledge`]).
    pub knowledge: Vec<crate::knowledge::NationKnowledge>,
    /// His coaching licence: 1 Continental Pro, 2 to 4 Continental A to C, 5 to 7 National A to C, and 8 or 0
    /// none; `None` where the layout does not place it.
    pub coaching_licence: Option<u8>,
    /// The formation ids of his preferred formation in possession and out of possession, 0 for none; `None` where the
    /// layout does not place them.
    pub formations: Option<[u8; 2]>,
    /// The tendencies the game keeps a value for, in its order; `None` where the layout does not place them or the
    /// list does not read as one.
    pub tendencies: Option<Vec<Tendency>>,
    /// Whether he holds a seat on a club's board that can be swapped for another.
    pub board_seat: bool,
    /// Whether the editor can read the retirements the game has planned in this build, and the date he retires on
    /// when the game has planned it (see [`crate::Session::planned_staff_retirement`]).
    pub retirement_known: bool,
    pub retires: Option<FmDate>,
}

/// One of a member of staff's tendencies as the game keeps it: its id and how far he leans to it. One he has no entry
/// for counts as 10. FM's profile lists those of 15 and over under Tendencies and those of 5 and under under "Tends
/// not to", and leaves out his touchline manner and dress (ids 48 to 55).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Tendency {
    /// 1 to [`MOST_TENDENCY`].
    pub id: u8,
    /// 1 to 20.
    pub value: u8,
}

/// The highest tendency id.
pub const MOST_TENDENCY: u8 = 100;

/// The tendencies in `entries`, the bytes of the game's list: an id and a value each. `None` unless every id is one
/// of the game's, none comes twice and every value is a rating.
fn tendencies_from(entries: &[u8]) -> Option<Vec<Tendency>> {
    let (pairs, rest) = entries.as_chunks::<2>();
    let mut seen = [false; MOST_TENDENCY as usize + 1];
    let known = pairs.iter().all(|&[id, value]| {
        (1..=MOST_TENDENCY).contains(&id)
            && (1..=20).contains(&value)
            && !std::mem::replace(&mut seen[id as usize], true)
    });
    (rest.is_empty() && known).then(|| pairs.iter().map(|&[id, value]| Tendency { id, value }).collect())
}

/// The tendencies FM has a name for, and so the ones the editor offers; it shows the rest as a blank line.
pub const NAMED_TENDENCIES: [u8; 67] = [
    1, 2, 3, 4, 5, 6, 15, 16, 17, 19, 20, 21, 22, 24, 25, 27, 31, 33, 34, 35, 36, 37, 38, 39, 40, 48, 49, 50, 51, 52,
    53, 54, 55, 57, 58, 59, 60, 61, 62, 63, 65, 69, 72, 73, 75, 76, 77, 78, 79, 80, 81, 82, 84, 85, 87, 89, 90, 91, 92,
    93, 94, 95, 96, 97, 98, 99, 100,
];

/// The tendencies in the record at `record`, which starts with the `(begin, end)` of their list, and where the list
/// starts (0 for an empty one).
fn read_tendency_list(process: &Process, record: u64) -> Option<(u64, Vec<Tendency>)> {
    if !is_user_pointer(record) {
        return None;
    }
    let (begin, end) = (process.read_u64(record).ok()?, process.read_u64(record + 8).ok()?);
    if begin == end {
        return Some((0, Vec::new()));
    }
    let len = end.checked_sub(begin).filter(|&len| len <= 2 * u64::from(MOST_TENDENCY))?;
    if !is_user_pointer(begin) {
        return None;
    }
    Some((begin, tendencies_from(&process.read_bytes(begin, len as usize).ok()?)?))
}

/// Where the entry of the tendency `id` is, its id and then its value, in the list of the record at `record`; `None`
/// where the list does not read as one or he has no entry for it.
pub(crate) fn tendency_entry(process: &Process, record: u64, id: u8) -> Option<u64> {
    let (begin, list) = read_tendency_list(process, record)?;
    list.iter().position(|tendency| tendency.id == id).map(|at| begin + 2 * at as u64)
}

/// The highest coaching licence level.
pub const MOST_LICENCE: u8 = 8;

/// The coaching licence level the game reads from the byte `byte`: 1 to 8 as it is, -1 to -7 as levels 2 to 8, and
/// anything else as none (0).
pub fn licence_level(byte: u8) -> u8 {
    match byte as i8 {
        level @ 1..=8 => level as u8,
        level @ -7..=-1 => (1 - level) as u8,
        _ => 0,
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffContract {
    /// Pounds per week.
    pub wage: i32,
    pub signed: Option<FmDate>,
    pub expires: Option<FmDate>,
    pub joined: Option<FmDate>,
    pub job: u8,
}

/// Reads the full profile of `member`. Returns `None` when the object no longer belongs
/// to them. Only reads memory.
pub fn read_staff_details(
    process: &Process,
    layout: &Layout,
    member: &StaffSummary,
) -> fmlens_mem::Result<Option<StaffDetails>> {
    let s = &layout.staff;
    let shift = member.shift;
    let buf = process.read_bytes(member.address, (s.end() + shift) as usize)?;
    let at = |offset: u64| s.at(offset, shift) as usize;
    let u8_at = |offset: u64| buf[at(offset)];
    let u16_at = |offset: u64| u16::from_le_bytes([buf[at(offset)], buf[at(offset) + 1]]);
    let u32_at = |offset: u64| u32::from_le_bytes(buf[at(offset)..at(offset) + 4].try_into().expect("4 bytes"));
    let u64_at = |offset: u64| u64::from_le_bytes(buf[at(offset)..at(offset) + 8].try_into().expect("8 bytes"));

    if u32_at(s.uid) != member.uid {
        return Ok(None);
    }
    let personality = PERSONALITY.iter().enumerate().map(|(i, &key)| (key, u8_at(s.personality + i as u64))).collect();
    let attributes = s
        .attributes
        .iter()
        .map(|(key, &offset)| (key.clone(), Attribute::from_raw(u8_at(offset))))
        .chain(s.ratings.iter().map(|(key, &offset)| {
            let value = u8_at(offset);
            (key.clone(), Attribute { raw: value, value })
        }))
        .collect();

    Ok(Some(StaffDetails {
        summary: member.clone(),
        reputation: Reputation {
            home: u16_at(s.home_reputation),
            current: u16_at(s.current_reputation),
            world: u16_at(s.world_reputation),
        },
        personality,
        attributes,
        contract: read_staff_contract(process, layout, u64_at(s.contract)),
        unsackable: None,
        registration_anytime: None,
        languages: Vec::new(),
        preferences: Vec::new(),
        knowledge: Vec::new(),
        coaching_licence: s.coaching_licence.map(|offset| licence_level(u8_at(offset))),
        formations: s.formations.map(|offsets| offsets.map(u8_at)),
        tendencies: s.tendencies.and_then(|offset| read_tendency_list(process, u64_at(offset))).map(|(_, list)| list),
        board_seat: false,
        retirement_known: false,
        retires: None,
    }))
}

fn read_staff_contract(process: &Process, layout: &Layout, address: u64) -> Option<StaffContract> {
    if !is_user_pointer(address) {
        return None;
    }
    let c = &layout.contract;
    let buf = process.read_bytes(address, c.end() as usize).ok()?;
    let u16_at = |offset: u64| u16::from_le_bytes([buf[offset as usize], buf[offset as usize + 1]]);
    let date_at = |offset: u64| FmDate::from_raw(u16_at(offset), u16_at(offset + 2));
    Some(StaffContract {
        wage: i32::from_le_bytes(buf[c.wage as usize..c.wage as usize + 4].try_into().expect("4 bytes")),
        signed: date_at(c.signed),
        expires: date_at(c.expires),
        joined: date_at(c.joined),
        job: buf[c.job as usize],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn licence_levels_as_the_game_reads_them() {
        assert_eq!([1, 2, 7, 8].map(licence_level), [1, 2, 7, 8]);
        assert_eq!([0xFF, 0xFE, 0xF9].map(licence_level), [2, 3, 8]);
        assert_eq!([0, 9, 0x7F, 0x80, 0xF8].map(licence_level), [0; 5]);
    }

    #[test]
    fn tendencies_only_from_a_list_that_reads_as_one() {
        let of = |id, value| Tendency { id, value };
        assert_eq!(tendencies_from(&[]), Some(Vec::new()));
        assert_eq!(tendencies_from(&[75, 13, 48, 20, 100, 1]), Some(vec![of(75, 13), of(48, 20), of(100, 1)]));
        // Half an entry, an id or a value out of range, and an id that comes twice.
        assert_eq!(tendencies_from(&[75, 13, 48]), None);
        assert_eq!(tendencies_from(&[0, 13]), None);
        assert_eq!(tendencies_from(&[101, 13]), None);
        assert_eq!(tendencies_from(&[75, 0]), None);
        assert_eq!(tendencies_from(&[75, 21]), None);
        assert_eq!(tendencies_from(&[75, 13, 75, 14]), None);
    }

    #[test]
    fn job_names() {
        assert_eq!(job_name(16), Some("Manager"));
        assert_eq!(job_name(35), Some("Goalkeeping Coach")); // player-coach variant
        assert_eq!(job_name(1), Some("Player"));
        assert_eq!(job_name(3), Some("Coach"));
        assert_eq!(job_name(7), Some("Director"));
        assert_eq!(job_name(8), Some("Managing Director"));
        assert_eq!(job_name(10), Some("Director of Football"));
        assert_eq!(job_name(24), Some("General Manager"));
        assert_eq!(job_name(38), Some("Chief Doctor"));
        assert_eq!(job_name(46), Some("Doctor"));
        assert_eq!(job_name(62), Some("Head Performance Analyst"));
        assert_eq!(job_name(66), Some("Owner"));
        assert_eq!(job_name(255), None);
    }

    #[test]
    fn staff_groups_cover_the_layout() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let mut grouped: Vec<&str> = STAFF_ATTRIBUTE_GROUPS.iter().flat_map(|(_, keys)| keys.iter().copied()).collect();
        grouped.sort_unstable();
        let mut mapped: Vec<&str> =
            layout.staff.attributes.keys().chain(layout.staff.ratings.keys()).map(String::as_str).collect();
        mapped.sort_unstable();
        assert_eq!(grouped, mapped);
    }
}
