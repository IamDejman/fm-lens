//! Changing values in the game: which fields can be written, where they live and
//! which values they take. Every write re-checks whose object it lands in, follows
//! pointers only to records that point back or check out, refuses a value the field
//! cannot hold, refuses to touch a field whose current value does not look like one
//! (the layout would not fit), and reads the value back afterwards.

use std::fmt;
use std::ops::RangeInclusive;

use fmlens_mem::is_user_pointer;
use serde::{Deserialize, Serialize};

use crate::clubs::{ClubSummary, finances_look_real};
use crate::coded::Coded;
use crate::date::FmDate;
use crate::details::{PERSONALITY, POSITIONS};
use crate::health::Lock;
use crate::national::Side;
use crate::officials::OfficialSummary;
use crate::players::{Nation, PlayerSummary};
use crate::position_records::Records;
use crate::profile::{HumanManagerLayout, Layout};
use crate::session::Session;
use crate::staff::StaffSummary;
use crate::transfer::{MoveError, Patch};

/// The kind of object a field belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Entity {
    Player,
    Staff,
    Club,
    Nation,
    /// A match official.
    Official,
}

impl fmt::Display for Entity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Entity::Player => "player",
            Entity::Staff => "staff",
            Entity::Club => "club",
            Entity::Nation => "nation",
            Entity::Official => "official",
        })
    }
}

/// How a value is stored.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    U8,
    I8,
    U16,
    I16,
    /// An amount of money, in pounds.
    I32,
    /// A count, such as a stadium's capacity.
    U32,
    /// A `u16` day of the year (flags above bit 8) and a `u16` year. Values are numbers
    /// like 20290630; 0 is a date the game has not set.
    Date,
    /// One bit of a byte, 0 or 1; the field says which bit. The rest of the byte is left as it is.
    Flag,
    /// A pointer to another of the game's objects, such as a person's nation. Only an object of the same class as
    /// the one it points at now may take its place.
    Pointer,
    /// A non-negative `f32`, such as a nation's FIFA points, held as its bits: for such numbers the bits run in the
    /// order of the values, so ranges and expected values compare exactly and an undo writes back the very value.
    F32,
}

/// The bits of `value`, a non-negative `f32`, as a field of [`Kind::F32`] holds them.
pub fn f32_bits(value: f32) -> i64 {
    i64::from(value.to_bits())
}

impl Kind {
    pub fn size(self) -> usize {
        match self {
            Kind::U8 | Kind::I8 | Kind::Flag => 1,
            Kind::U16 | Kind::I16 => 2,
            Kind::I32 | Kind::U32 | Kind::Date | Kind::F32 => 4,
            Kind::Pointer => 8,
        }
    }

    /// The value in `bytes`; a flag's whole byte, as only its field knows which bit is meant.
    pub(crate) fn decode(self, bytes: &[u8]) -> i64 {
        let u16_at = |i: usize| u16::from_le_bytes([bytes[i], bytes[i + 1]]);
        match self {
            Kind::U8 | Kind::Flag => i64::from(bytes[0]),
            Kind::I8 => i64::from(bytes[0] as i8),
            Kind::U16 => i64::from(u16_at(0)),
            Kind::I16 => i64::from(u16_at(0) as i16),
            Kind::I32 => i64::from(i32::from_le_bytes(bytes[..4].try_into().expect("4 bytes"))),
            Kind::U32 | Kind::F32 => i64::from(u32::from_le_bytes(bytes[..4].try_into().expect("4 bytes"))),
            Kind::Date => FmDate::from_raw(u16_at(0), u16_at(2)).map_or(0, FmDate::to_number),
            Kind::Pointer => i64::from_le_bytes(bytes[..8].try_into().expect("8 bytes")),
        }
    }

    /// The bytes of `value`, which must fit the kind, written over `old`: a date keeps
    /// the flags the game keeps next to its day.
    pub(crate) fn encode(self, value: i64, old: &[u8]) -> Vec<u8> {
        const FITS: &str = "checked against the field's range";
        match self {
            Kind::U8 | Kind::Flag => vec![u8::try_from(value).expect(FITS)],
            Kind::I8 => i8::try_from(value).expect(FITS).to_le_bytes().to_vec(),
            Kind::U16 => u16::try_from(value).expect(FITS).to_le_bytes().to_vec(),
            Kind::I16 => i16::try_from(value).expect(FITS).to_le_bytes().to_vec(),
            Kind::I32 => i32::try_from(value).expect(FITS).to_le_bytes().to_vec(),
            Kind::U32 | Kind::F32 => u32::try_from(value).expect(FITS).to_le_bytes().to_vec(),
            Kind::Date => {
                let date = FmDate::from_number(value).expect(FITS);
                let flags = u16::from_le_bytes([old[0], old[1]]) & !0x1FF;
                [(flags | date.day_of_year()).to_le_bytes(), date.year.to_le_bytes()].concat()
            }
            Kind::Pointer => value.to_le_bytes().to_vec(),
        }
    }
}

/// The addresses a pointer field may hold: the user half of a 64-bit address space, past the first page.
const POINTERS: RangeInclusive<i64> = 0x1_0000..=0x7FFF_FFFF_FFFF;

/// Why a pointer field refuses a new value; the app has the words in Turkish and Spanish too.
const OTHER_CLASS: &str = "the new value is not one of the game's own records of that kind";

/// Why a position is left as it is when the records the game keeps of the player's positions cannot be read.
const ODD_RECORDS: &str = "the game's records of the player's positions do not read as expected";

/// Why a position is left as it is when the records of the player's positions changed meanwhile: the game
/// changed them, or a later edit took another record out.
const RECORDS_CHANGED: &str = "the player's position records changed after this edit; undo newer position edits first";

/// How the game shows a stored value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Scale {
    /// As stored.
    Plain,
    /// Stored 0–100, shown 1–20 (see [`crate::Attribute`]).
    Attribute,
    /// Stored 0–10000, shown as a percentage 0–100.
    Percent,
}

impl Scale {
    /// The value the game shows for `stored`.
    pub fn shown(self, stored: i64) -> i64 {
        match self {
            Scale::Plain => stored,
            Scale::Attribute => ((stored + 2) / 5).clamp(1, 20),
            Scale::Percent => (stored + 50) / 100,
        }
    }

    /// A stored value the game shows as `shown`: the middle of the values it rounds to it.
    pub fn stored(self, shown: i64) -> i64 {
        match self {
            Scale::Plain => shown,
            Scale::Attribute => shown * 5,
            Scale::Percent => shown * 100,
        }
    }
}

/// The record a field lives in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Place {
    /// The object itself.
    Object,
    /// The contract of a player or member of staff, which points back at its owner.
    Contract,
    /// The club's info record.
    ClubInfo,
    /// The club's finance record, written only when it is of the full class.
    ClubFinance,
    /// The club's senior team, which points back at the club.
    SeniorTeam,
    /// The stadium the club's senior team plays at, written only when it is of the stadium class.
    Stadium,
    /// The record of a player's reasons to be unhappy, which his contract points at.
    Concerns,
    /// The flags word of a human manager, on the build that traced it, for a member of staff of its class.
    HumanManagerFlags,
    /// A nation's men's or women's senior national team, found through its container (see
    /// [`crate::national::senior_team`]).
    NationalTeam(Side),
    /// A nation's men's or women's container, which points back at it (see [`crate::national::container`]).
    NationalContainer(Side),
    /// A loaned player's loan contract, where the layout places loans (see [`crate::Session::loan`]).
    Loan,
}

/// A value of a player, member of staff or club that the editor can change.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Field {
    /// E.g. `current_ability`, `attribute.finishing`, `contract.wage`, `finance.transfer_budget`.
    pub key: String,
    pub entity: Entity,
    pub kind: Kind,
    pub scale: Scale,
    /// Smallest stored value the editor writes.
    pub min: i64,
    /// Largest stored value the editor writes.
    pub max: i64,
    /// A stored value meaning "none" that the field may be set to besides `min..=max`, such
    /// as 255 for no squad number.
    pub blank: Option<i64>,
    /// The values the field takes, in the order to offer them, when it holds a code from a
    /// list (a squad status) rather than any value of its range.
    pub choices: Option<Vec<i64>>,
    /// Whether a mass edit may change the field; some only make sense one person at a time.
    pub mass: bool,
    /// For a flag, which bit of its byte it is.
    #[serde(skip)]
    bit: u8,
    #[serde(skip)]
    place: Place,
    /// Offset in its record, for the object before any person-block shift.
    #[serde(skip)]
    offset: u64,
    /// Whether the field is in the object's person block and moves with its shift.
    #[serde(skip)]
    shifted: bool,
    /// The stored values a correct layout can produce; anything else means the layout
    /// does not fit this object, and the field is left alone.
    #[serde(skip)]
    plausible: RangeInclusive<i64>,
    /// Whether the field is only written over 0 or one of its choices: a code the editor cannot name stays as the
    /// game holds it.
    #[serde(skip)]
    listed_only: bool,
}

impl Field {
    fn new(entity: Entity, key: impl Into<String>, offset: u64, kind: Kind, range: RangeInclusive<i64>) -> Self {
        Self {
            key: key.into(),
            entity,
            kind,
            scale: Scale::Plain,
            min: *range.start(),
            max: *range.end(),
            blank: None,
            choices: None,
            mass: true,
            bit: 0,
            place: Place::Object,
            offset,
            shifted: false,
            plausible: range,
            listed_only: false,
        }
    }

    /// A field that is one `bit` of the byte at `offset`: 0 or 1.
    fn flag(entity: Entity, key: impl Into<String>, offset: u64, bit: u8) -> Self {
        Self { bit, ..Field::new(entity, key, offset, Kind::Flag, 0..=1) }
    }

    fn attribute(mut self) -> Self {
        self.scale = Scale::Attribute;
        self
    }

    fn percent(mut self) -> Self {
        self.scale = Scale::Percent;
        self
    }

    /// Lets the field be set to `blank`, which means "none", besides its range.
    fn blank(mut self, blank: i64) -> Self {
        self.blank = Some(blank);
        self
    }

    /// Restricts the field to the codes in `choices`.
    fn choices(mut self, choices: &[i64]) -> Self {
        self.choices = Some(choices.to_vec());
        self
    }

    /// Keeps the field out of mass edits.
    fn single(mut self) -> Self {
        self.mass = false;
        self
    }

    /// Whether the editor writes `value` to this field: one of its range (and of its choices,
    /// when it has them), or its blank.
    pub fn takes(&self, value: i64) -> bool {
        self.blank == Some(value)
            || ((self.min..=self.max).contains(&value) && self.choices.as_ref().is_none_or(|c| c.contains(&value)))
    }

    /// The value of the field in its bytes: for a flag, its bit.
    pub(crate) fn decode(&self, bytes: &[u8]) -> i64 {
        match self.kind {
            Kind::Flag => i64::from((bytes[0] >> self.bit) & 1),
            kind => kind.decode(bytes),
        }
    }

    /// The bytes of `value` written over `old`: a flag keeps the other bits of its byte.
    pub(crate) fn encode(&self, value: i64, old: &[u8]) -> Vec<u8> {
        match self.kind {
            Kind::Flag if value == 0 => vec![old[0] & !(1 << self.bit)],
            Kind::Flag => vec![old[0] | (1 << self.bit)],
            kind => kind.encode(value, old),
        }
    }

    /// Accepts stored values in `plausible` as the game's own, beyond the ones the editor writes.
    fn plausible(mut self, plausible: RangeInclusive<i64>) -> Self {
        self.plausible = plausible;
        self
    }

    /// Writes the field only over 0 or one of its choices.
    fn listed_only(mut self) -> Self {
        self.listed_only = true;
        self
    }

    /// Whether `old` is a value the editor may write over.
    pub fn replaceable(&self, old: i64) -> bool {
        !self.listed_only || old == 0 || self.choices.as_ref().is_some_and(|c| c.contains(&old))
    }

    fn in_record(mut self, place: Place) -> Self {
        self.place = place;
        self
    }

    fn in_person_block(mut self, person_block: u64) -> Self {
        self.shifted = self.place == Place::Object && self.offset >= person_block;
        self
    }

    /// Whether `value` is one this field can hold in a correctly read object. For a
    /// date that includes a date the game has not set (0).
    pub fn is_plausible(&self, value: i64) -> bool {
        self.plausible.contains(&value)
            && (self.kind != Kind::Date || value == 0 || FmDate::from_number(value).is_some())
    }

    /// Where the field is, given where its record starts.
    fn address(&self, record: u64, target: &Target) -> u64 {
        record + self.offset + if self.shifted { target.shift } else { 0 }
    }
}

/// Every field of `entity` the editor can change, in display order.
pub fn fields(layout: &Layout, entity: Entity) -> Vec<Field> {
    match entity {
        Entity::Player => player_fields(layout),
        Entity::Staff => staff_fields(layout),
        Entity::Club => club_fields(layout),
        Entity::Nation => nation_fields(layout),
        Entity::Official => official_fields(layout),
    }
}

/// The days a contract may have been signed on, or its holder have joined the club: from 1950, as a member of staff
/// may have been at his club for decades, to the game's date once that is read (see [`Session::fields`]).
const CONTRACT_STARTS: RangeInclusive<i64> = 19500101..=21001231;

/// The fields whose latest day is the game's date: a contract is not signed, nor a club joined, on a day to come.
const CONTRACT_START_KEYS: [&str; 2] = ["contract.signed", "contract.joined"];

/// A wage in pounds per week, a contract end between 2000 and 2100, and the days the contract was signed and its
/// holder joined the club: those two one person at a time.
fn contract_fields(layout: &Layout, entity: Entity) -> [Field; 4] {
    let c = &layout.contract;
    let start = |key: &str, offset: u64| {
        Field::new(entity, key, offset, Kind::Date, CONTRACT_STARTS)
            .plausible(0..=22001231)
            .single()
            .in_record(Place::Contract)
    };
    [
        Field::new(entity, "contract.wage", c.wage, Kind::I32, 0..=10_000_000)
            .plausible(0..=i64::from(i32::MAX))
            .in_record(Place::Contract),
        Field::new(entity, "contract.expires", c.expires, Kind::Date, 20000101..=21001231)
            .plausible(0..=22001231)
            .in_record(Place::Contract),
        start("contract.signed", c.signed),
        start("contract.joined", c.joined),
    ]
}

/// The latest day the editor writes to a field of [`CONTRACT_START_KEYS`] on `today`, the game's date, where it is
/// read.
fn latest_contract_start(today: Option<FmDate>) -> i64 {
    today.map_or(*CONTRACT_STARTS.end(), |today| today.to_number().min(*CONTRACT_STARTS.end()))
}

/// What the borrowing club pays of a loaned player's wage, and when the loan ends: one player at a time, where the
/// layout places loans.
fn loan_fields(layout: &Layout) -> Vec<Field> {
    if layout.loan.is_none() {
        return Vec::new();
    }
    let c = &layout.contract;
    vec![
        Field::new(Entity::Player, "loan.wage", c.wage, Kind::I32, 0..=10_000_000)
            .plausible(0..=i64::from(i32::MAX))
            .single()
            .in_record(Place::Loan),
        Field::new(Entity::Player, "loan.ends", c.expires, Kind::Date, 20000101..=21001231)
            .plausible(0..=22001231)
            .single()
            .in_record(Place::Loan),
    ]
}

/// The squad statuses the editor offers, by the codes contracts hold them as (see the names in the app's
/// dictionaries). The game uses more codes than these, named from FM's contract screen: 7 fringe player, 9 and
/// 21 emergency backup, 10 breakthrough prospect, 11 future prospect, 13 youngster, 15 first-choice goalkeeper,
/// 16 cup goalkeeper, 17 domestic cup goalkeeper, 20 backup, 22 surplus to requirements; 14 is unnamed.
pub const SQUAD_STATUSES: [i64; 5] = [1, 2, 3, 4, 5];

/// A squad number from 1 to 99 (255: none), the squad status, and whether the player is on
/// the transfer list and on the loan list: one player at a time.
fn player_contract_fields(layout: &Layout) -> [Field; 4] {
    let c = &layout.contract;
    let field = |key: &str, offset: u64, range: RangeInclusive<i64>| {
        Field::new(Entity::Player, key, offset, Kind::U8, range).single().in_record(Place::Contract)
    };
    [
        field("contract.squad_number", c.squad_number, 1..=99).plausible(1..=255).blank(NO_SQUAD_NUMBER),
        field("contract.squad_status", c.squad_status, 1..=40).plausible(0..=40).choices(&SQUAD_STATUSES),
        Field::flag(Entity::Player, "contract.transfer_listed", c.listing, 0).single().in_record(Place::Contract),
        Field::flag(Entity::Player, "contract.loan_listed", c.listing, 1).single().in_record(Place::Contract),
    ]
}

/// The loyalty bonus, and how happy the player is and how happy with his playing time, as FMRTE shows them (the
/// game shows them in words). Happiness ran from -40 to 97 on the test save.
fn player_mood_fields(layout: &Layout) -> [Field; 4] {
    let c = &layout.contract;
    let mood = |key: &str, offset: u64| {
        Field::new(Entity::Player, key, offset, Kind::I8, -100..=100).plausible(-128..=127).in_record(Place::Contract)
    };
    [
        Field::new(Entity::Player, "contract.loyalty_bonus", c.loyalty_bonus, Kind::I32, 0..=10_000_000)
            .plausible(0..=i64::from(i32::MAX))
            .in_record(Place::Contract),
        mood("contract.happiness", c.happiness),
        mood("contract.playing_time_happiness", c.playing_time_happiness),
        // How many reasons to be unhappy his record lists. The editor no longer writes it: it ends the reasons as the
        // game does (`Session::plan_end_concerns`). It stays so that a list emptied before can be listed again.
        Field::new(Entity::Player, "contract.unhappiness", 0, Kind::U32, 0..=0)
            .plausible(0..=crate::details::MOST_CONCERNS as i64)
            .in_record(Place::Concerns),
    ]
}

/// The birth dates the editor writes before the game's date is known. Youth players born later arrive as a long career
/// goes on, so once the game is past 2020 its date is the latest (see [`Session::fields`]).
const BIRTH_DATES: RangeInclusive<i64> = 19400101..=20201231;

/// The same for staff, from 1920: chairmen and owners are staff too, and can be far older than any player.
const STAFF_BIRTH_DATES: RangeInclusive<i64> = 19200101..=20201231;

/// The latest birth date the editor writes on `today`, the game's date, where it is read.
fn latest_birth(today: Option<FmDate>) -> i64 {
    today.map_or(*BIRTH_DATES.end(), |today| today.to_number().max(*BIRTH_DATES.end()))
}

/// The squad number of a player without one.
pub(crate) const NO_SQUAD_NUMBER: i64 = 255;

fn player_fields(layout: &Layout) -> Vec<Field> {
    let p = &layout.player;
    let field = |key: &str, offset: u64, kind: Kind, range: RangeInclusive<i64>| {
        Field::new(Entity::Player, key, offset, kind, range)
    };
    let mut out = vec![
        field("current_ability", p.current_ability, Kind::U16, 1..=200),
        // Database ranges are negative; the game settles them when a save starts.
        field("potential_ability", p.potential_ability, Kind::I16, 1..=200).plausible(-200..=200),
        field("height", p.height, Kind::U16, 140..=220).plausible(100..=250),
        field("nation", p.nation, Kind::Pointer, POINTERS).single(),
        // Any birth date from 1940 to 2020, or to the game's date later on; the game works out the age from it.
        field("date_of_birth", p.date_of_birth, Kind::Date, BIRTH_DATES).plausible(19000101..=21001231),
        // Pounds; -1 is none set.
        field("asking_price", p.asking_price, Kind::I32, 0..=2_000_000_000)
            .plausible(-1..=i64::from(i32::MAX))
            .blank(-1),
        field("reputation.home", p.home_reputation, Kind::U16, 0..=10_000),
        field("reputation.current", p.current_reputation, Kind::U16, 0..=10_000),
        field("reputation.world", p.world_reputation, Kind::U16, 0..=10_000),
        field("international.caps", p.international_caps, Kind::U16, 0..=1_000),
        field("international.goals", p.international_goals, Kind::U16, 0..=1_000),
        field("international.u21_caps", p.u21_caps, Kind::U8, 0..=255),
        field("international.u21_goals", p.u21_goals, Kind::U8, 0..=255),
        // What the game changes every day: energy, match fitness, jadedness and morale. A full
        // 30,314-player Mac career includes sharpness below 35%; use the full percentage scale.
        // Morale ran from 1 to 20. Jadedness is -500 for a rested player, the least the game keeps;
        // the most seen was 252, early in a season, so the editor writes up to 1000 and accepts any
        // value of a worn-out player as it is.
        field("condition", p.condition, Kind::U16, 0..=10_000).percent(),
        field("match_sharpness", p.match_sharpness, Kind::U16, 0..=10_000).percent(),
        field("jadedness", p.jadedness, Kind::I16, -500..=1_000).plausible(-500..=i64::from(i16::MAX)),
        field("morale", p.morale, Kind::U8, 1..=20),
    ];
    out.extend(crate::ATTRIBUTE_GROUPS.iter().flat_map(|(_, keys)| keys.iter()).filter_map(|key| {
        let offset = *p.attributes.get(*key)?;
        Some(field(&format!("attribute.{key}"), offset, Kind::U8, 1..=100).plausible(0..=100).attribute())
    }));
    // The game no longer plays a sweeper: every player rates 1 there, so it is not offered. It writes a rating back
    // from the record it keeps of the position, so the rest are offered only where the layout places those records.
    out.extend(
        POSITIONS.iter().enumerate().filter(|&(_, &key)| key != "sw" && p.position_records.is_some()).map(
            |(i, key)| field(&format!("position.{key}"), p.positions + i as u64, Kind::U8, 1..=20).plausible(0..=20),
        ),
    );
    out.extend(PERSONALITY.iter().enumerate().map(|(i, key)| {
        field(&format!("personality.{key}"), p.personality + i as u64, Kind::U8, 1..=20).plausible(0..=20)
    }));
    out.extend(contract_fields(layout, Entity::Player));
    out.extend(player_contract_fields(layout));
    out.extend(player_mood_fields(layout));
    out.extend(loan_fields(layout));
    // His traits: one flag each, `trait.0` to `trait.63`, bit n of the mask.
    out.extend((0..64u64).map(|n| Field::flag(Entity::Player, format!("trait.{n}"), p.traits + n / 8, (n % 8) as u8)));
    out.into_iter().map(|f| f.in_person_block(p.person_block)).collect()
}

fn staff_fields(layout: &Layout) -> Vec<Field> {
    let s = &layout.staff;
    let field = |key: &str, offset: u64, kind: Kind, range: RangeInclusive<i64>| {
        Field::new(Entity::Staff, key, offset, kind, range)
    };
    let mut out = vec![
        field("current_ability", s.current_ability, Kind::U16, 1..=200).plausible(0..=200),
        field("potential_ability", s.potential_ability, Kind::I16, 1..=200).plausible(-200..=200),
        field("reputation.home", s.home_reputation, Kind::U16, 0..=10_000),
        field("reputation.current", s.current_reputation, Kind::U16, 0..=10_000),
        field("reputation.world", s.world_reputation, Kind::U16, 0..=10_000),
        field("nation", s.nation, Kind::Pointer, POINTERS).single(),
        // The person record's own date, where a player's keeps his; the game works out the age from it. A member of
        // staff without one is left as he is.
        field("date_of_birth", s.date_of_birth, Kind::Date, STAFF_BIRTH_DATES).plausible(19000101..=21001231),
    ];
    out.extend(crate::STAFF_ATTRIBUTE_GROUPS.iter().flat_map(|(_, keys)| keys.iter()).filter_map(|key| {
        if let Some(&offset) = s.attributes.get(*key) {
            Some(field(&format!("attribute.{key}"), offset, Kind::U8, 0..=100).attribute())
        } else {
            let offset = *s.ratings.get(*key)?;
            Some(field(&format!("attribute.{key}"), offset, Kind::U8, 1..=20).plausible(0..=20))
        }
    }));
    out.extend(PERSONALITY.iter().enumerate().map(|(i, key)| {
        field(&format!("personality.{key}"), s.personality + i as u64, Kind::U8, 1..=20).plausible(0..=20)
    }));
    out.extend(contract_fields(layout, Entity::Staff));
    // Written in the positive form the game reads as is; it also reads -1 to -7 as levels 2 to 8.
    if let Some(offset) = s.coaching_licence {
        let field = field("coaching_licence", offset, Kind::I8, 0..=i64::from(crate::staff::MOST_LICENCE));
        out.push(field.plausible(-7..=8).choices(&COACHING_LICENCES));
    }
    // The formations he prefers in possession and out of it, the two FM's staff profile shows, offered as ids the game
    // itself uses for each. One he holds that is not among them is unidentified, and left as it is.
    if let Some([in_possession, out_of_possession]) = s.formations {
        for (key, offset, choices) in [
            ("formation.in_possession", in_possession, &IN_POSSESSION_FORMATIONS[..]),
            ("formation.out_of_possession", out_of_possession, &OUT_OF_POSSESSION_FORMATIONS[..]),
        ] {
            let field = field(key, offset, Kind::U8, 1..=i64::from(MOST_FORMATION));
            out.push(field.plausible(0..=255).choices(choices).listed_only().single());
        }
    }
    // A human manager's protection from the sack: bit 1 of his flags, as the game's own action toggles it. Only
    // located on the build and class it was traced on, so it reads as missing for everyone else.
    out.push(Field::flag(Entity::Staff, "manager.unsackable", 0, 1).in_record(Place::HumanManagerFlags).single());
    // Squad registration at any time: bit 8 of the same word (bit 0 of its second byte), as the game's own
    // `squad_registration_anytime` action toggles it.
    out.push(
        Field::flag(Entity::Staff, "manager.registration_anytime", 1, 0).in_record(Place::HumanManagerFlags).single(),
    );
    out.into_iter().map(|f| f.in_person_block(s.person_block)).collect()
}

fn club_fields(layout: &Layout) -> Vec<Field> {
    let (i, f) = (&layout.club_info, &layout.club_finance);
    let field = |key: &str, offset: u64, kind: Kind, range: RangeInclusive<i64>, place: Place| {
        Field::new(Entity::Club, key, offset, kind, range).in_record(place)
    };
    let facility = |key: &str, offset: u64, place: Place| field(key, offset, Kind::U8, 1..=20, place).plausible(0..=20);
    let money = |key: &str, offset: u64, range: RangeInclusive<i64>| {
        field(key, offset, Kind::I32, range, Place::ClubFinance).plausible(i64::from(i32::MIN)..=i64::from(i32::MAX))
    };
    let mut fields = vec![
        field("reputation", layout.team.reputation, Kind::U16, 0..=10_000, Place::SeniorTeam),
        facility("facilities.training", i.training, Place::ClubInfo),
        facility("facilities.youth_facilities", i.youth_facilities, Place::ClubInfo),
        facility("facilities.youth_coaching", i.youth_coaching, Place::ClubInfo),
        facility("facilities.youth_recruitment", i.youth_recruitment, Place::ClubInfo),
        facility("facilities.corporate", f.corporate, Place::ClubFinance),
        money("finance.balance", f.balance, -2_000_000_000..=2_000_000_000),
        money("finance.transfer_budget", f.transfer_budget, 0..=2_000_000_000),
        money("finance.wage_budget", f.wage_budget, 0..=100_000_000),
        money("finance.total_wage_budget", f.total_wage_budget, 0..=100_000_000),
    ];
    // Capacities, as stored. The biggest stadium of the test save held 115,109.
    if let Some(s) = &layout.stadium {
        let seats = |key: &str, offset: u64| {
            field(key, offset, Kind::U32, 0..=250_000, Place::Stadium).plausible(0..=i64::from(i32::MAX))
        };
        fields.extend([
            seats("stadium.capacity", s.capacity),
            seats("stadium.seating", s.seating),
            seats("stadium.used", s.used),
            seats("stadium.expansion", s.expansion),
        ]);
    }
    fields
}

/// The coaching licence levels a member of staff may be given, lowest first: none (0), then 7 National C up to 1
/// Continental Pro. Level 8 is the game's own none, which FM shows as 0 is, so it is not offered twice.
pub const COACHING_LICENCES: [i64; 8] = [0, 7, 6, 5, 4, 3, 2, 1];

/// The in-possession formation ids the editor offers for a member of staff: those staff of the test save held most
/// (11 Dec 2027).
pub const IN_POSSESSION_FORMATIONS: [i64; 12] = [3, 4, 7, 22, 28, 29, 30, 32, 33, 35, 63, 64];

/// The out-of-possession formation ids the editor offers: those the game gives a member of staff for an
/// in-possession formation when his own is unset (function 0x4ADDE2C in the arm64 half of 27.0.0).
pub const OUT_OF_POSSESSION_FORMATIONS: [i64; 10] = [4, 7, 22, 27, 30, 32, 33, 35, 63, 64];

/// Why a field holding a code the editor cannot name is left as it is.
const UNLISTED: &str = "it holds a value the editor cannot name";

/// The highest formation id the editor writes.
const MOST_FORMATION: u8 = 64;

/// What a nation's `dual_nationality` byte holds: its people may hold another nationality as well, or may not.
pub const DUAL_NATIONALITY: [i64; 2] = [0, 2];

/// The most FIFA points the editor writes; the leaders of the test save had 1,995.88 (men's) and 2,105.4 (women's).
const MOST_FIFA_POINTS: f32 = 3000.0;

/// The senior national teams' reputations and the containers' youth ratings, game importance, attendance and style
/// ratings and FIFA points, men's and women's, the population, whether dual nationality is allowed, and the years of
/// residence that gain the nationality (255: no number of years does). One nation at a time; none where the build's
/// layout does not place nations.
fn nation_fields(layout: &Layout) -> Vec<Field> {
    let Some(n) = layout.national.as_ref() else {
        return Vec::new();
    };
    let field = |key: &str, offset: u64, kind: Kind, range: RangeInclusive<i64>| {
        Field::new(Entity::Nation, key, offset, kind, range).single()
    };
    let youth = |key: &str, side: Side| {
        field(key, n.youth_rating, Kind::I16, 0..=crate::national::MOST_YOUTH_RATING)
            .plausible(0..=i64::from(i16::MAX))
            .in_record(Place::NationalContainer(side))
    };
    let importance = |key: &str, side: Side| {
        field(key, n.game_importance, Kind::I8, 0..=crate::national::MOST_GAME_IMPORTANCE)
            .plausible(0..=i64::from(i8::MAX))
            .in_record(Place::NationalContainer(side))
    };
    let attendance = |key: &str, side: Side| {
        field(key, n.attendance, Kind::U8, 0..=crate::national::MOST_ATTENDANCE)
            .plausible(0..=i64::from(u8::MAX))
            .in_record(Place::NationalContainer(side))
    };
    // Twelve style ratings a side, after the side's other fields.
    let style = |prefix: &str, side: Side| -> Vec<Field> {
        let Some(offset) = n.style else {
            return Vec::new();
        };
        (0u64..)
            .zip(crate::national::STYLE)
            .map(|(index, key)| {
                field(&format!("{prefix}style.{key}"), offset + index, Kind::I8, 0..=crate::national::MOST_STYLE)
                    .plausible(0..=i64::from(i8::MAX))
                    .in_record(Place::NationalContainer(side))
            })
            .collect()
    };
    let mut fields = vec![
        field("reputation", layout.team.reputation, Kind::U16, 0..=10_000).in_record(Place::NationalTeam(Side::Men)),
        youth("youth_rating", Side::Men),
        importance("game_importance", Side::Men),
        attendance("attendance", Side::Men),
    ];
    fields.extend(style("", Side::Men));
    fields.extend([
        field("women.reputation", layout.team.reputation, Kind::U16, 0..=10_000)
            .in_record(Place::NationalTeam(Side::Women)),
        youth("women.youth_rating", Side::Women),
        importance("women.game_importance", Side::Women),
        attendance("women.attendance", Side::Women),
    ]);
    fields.extend(style("women.", Side::Women));
    // The live points FM ranks by at its next ranking date; the published position follows then, not at once. The
    // women's container holds the women's ranking the same way.
    let points = |key: &str, side: Side| {
        field(key, n.points, Kind::F32, 0..=f32_bits(MOST_FIFA_POINTS))
            .plausible(0..=f32_bits(f32::MAX))
            .in_record(Place::NationalContainer(side))
    };
    fields.extend([
        points("points", Side::Men),
        points("women.points", Side::Women),
        // Tuvalu has 9,646 people, Nigeria 232,679,478.
        field("population", n.population, Kind::U32, 1..=2_000_000_000).plausible(0..=i64::from(u32::MAX)),
        field("dual_nationality", n.dual_nationality, Kind::U8, 0..=2).choices(&DUAL_NATIONALITY),
        // 99 years for Madagascar, Liberia and Palestine. The game takes 0 for never too, so never is the blank.
        field("naturalisation", n.naturalisation, Kind::U8, 1..=99)
            .plausible(0..=255)
            .blank(i64::from(crate::national::NEVER)),
    ]);
    fields
}

/// An official's abilities, reputation and birth date, as the officials list reads them. One official at a time; none
/// where the build's layout does not place officials.
fn official_fields(layout: &Layout) -> Vec<Field> {
    let Some(o) = layout.official.as_ref() else {
        return Vec::new();
    };
    let field = |key: &str, offset: u64, kind: Kind, range: RangeInclusive<i64>| {
        Field::new(Entity::Official, key, offset, kind, range).single()
    };
    vec![
        // About a hundred officials read 200 for both, the rest less; young ones have more potential than ability.
        field("current_ability", o.current_ability, Kind::U16, 1..=200).plausible(0..=200),
        field("potential_ability", o.potential_ability, Kind::U16, 1..=200).plausible(0..=200),
        field("reputation", o.reputation, Kind::U16, 0..=10_000),
        field("date_of_birth", o.date_of_birth, Kind::Date, BIRTH_DATES).plausible(19000101..=21001231),
    ]
}

/// The offset of the human manager's flags in `target`, when the build has traced them (`layout`) and the target is
/// a member of staff at the person-block shift and of the class (`class`, as [`crate::rtti::class_of`] names it) they
/// were traced at.
fn human_manager_flags(layout: Option<&HumanManagerLayout>, target: &Target, class: Option<&str>) -> Option<u64> {
    let layout = layout?;
    let fits = target.entity == Entity::Staff
        && target.shift != 0
        && target.shift == layout.person_shift
        && class == Some(layout.class.as_str());
    fits.then_some(layout.flags)
}

/// The object an edit lands in, as found when the lists were read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Target {
    pub entity: Entity,
    pub uid: u32,
    pub address: u64,
    /// The object's person-block shift; 0 for clubs and nations.
    pub shift: u64,
}

impl PlayerSummary {
    pub fn target(&self) -> Target {
        Target { entity: Entity::Player, uid: self.uid, address: self.address, shift: self.shift }
    }

    /// Brings the fields a list row shows, and is filtered by, up to date after `field` was set to `value`; an
    /// attribute's value as FM shows it (1–20).
    pub fn note_change(&mut self, field: &str, value: i64) {
        if let Some(key) = field.strip_prefix("attribute.") {
            if let Some(slot) = crate::filter::player_attribute(key).and_then(|i| self.attributes.get_mut(i)) {
                *slot = value as u8;
            }
            return;
        }
        match field {
            "current_ability" => self.current_ability = value as u16,
            "potential_ability" => self.potential_ability = value as i16,
            "contract.expires" => self.contract_expires = FmDate::from_number(value),
            // The age follows from the game's date, which the caller has (see `note_birth`).
            "date_of_birth" => self.date_of_birth = FmDate::from_number(value),
            // The nation's name and UID follow from the app's list of nations (see `crate::nations`).
            "nation" => self.nation_address = value as u64,
            "contract.transfer_listed" => self.transfer_listed = value != 0,
            "contract.loan_listed" => self.loan_listed = value != 0,
            "contract.wage" => self.wage = Some(value as i32),
            "reputation.current" => self.current_reputation = value as u16,
            "height" => self.height_cm = value as u16,
            _ => {
                let position = field.strip_prefix("position.").and_then(|key| POSITIONS.iter().position(|&k| k == key));
                if let Some(i) = position {
                    self.position_ratings[i] = value as u8;
                    self.positions = crate::players::natural_positions(&self.position_ratings);
                }
                let rating =
                    field.strip_prefix("personality.").and_then(|key| PERSONALITY.iter().position(|&k| k == key));
                if let Some(i) = rating {
                    self.personality[i] = value as u8;
                }
                // A trait is one bit of the mask.
                if let Some(bit) = field.strip_prefix("trait.").and_then(|n| n.parse::<u32>().ok()).filter(|&n| n < 64)
                {
                    self.traits = if value != 0 { self.traits | 1 << bit } else { self.traits & !(1 << bit) };
                }
            }
        }
    }
}

impl PlayerSummary {
    /// Works the age out again on `today`, the game's date, after the birth date changed.
    pub fn note_birth(&mut self, today: Option<FmDate>) {
        self.age = self.date_of_birth.zip(today).and_then(|(born, today)| born.age_on(today));
    }
}

impl StaffSummary {
    pub fn target(&self) -> Target {
        Target { entity: Entity::Staff, uid: self.uid, address: self.address, shift: self.shift }
    }

    /// Brings the fields a list row shows, and is filtered by, up to date after `field` was set to `value`; an
    /// attribute's value as FM shows it (1–20).
    pub fn note_change(&mut self, field: &str, value: i64) {
        if let Some(key) = field.strip_prefix("attribute.") {
            if let Some(slot) = crate::filter::staff_attribute(key).and_then(|i| self.attributes.get_mut(i)) {
                *slot = value as u8;
            }
            return;
        }
        match field {
            "current_ability" => self.current_ability = value as u16,
            "potential_ability" => self.potential_ability = value as i16,
            // The age follows from the game's date, which the caller has (see `note_birth`).
            "date_of_birth" => self.date_of_birth = FmDate::from_number(value),
            "nation" => self.nation_address = value as u64,
            _ => {}
        }
    }

    /// Works the age out again on `today`, the game's date, after the birth date changed.
    pub fn note_birth(&mut self, today: Option<FmDate>) {
        self.age = self.date_of_birth.zip(today).and_then(|(born, today)| born.age_on(today));
    }
}

impl Nation {
    /// The nation as an edit target; `None` without a UID of its own to check it by.
    pub fn target(&self) -> Option<Target> {
        self.uid.map(|uid| Target { entity: Entity::Nation, uid, address: self.address, shift: 0 })
    }
}

impl OfficialSummary {
    pub fn target(&self) -> Target {
        Target { entity: Entity::Official, uid: self.uid, address: self.address, shift: 0 }
    }

    /// Brings the fields a list row shows up to date after `field` was set to `value`; the age follows from the game's
    /// date, `today`.
    pub fn note_change(&mut self, field: &str, value: i64, today: Option<FmDate>) {
        match field {
            "current_ability" => self.current_ability = value as u16,
            "potential_ability" => self.potential_ability = value as u16,
            "reputation" => self.reputation = value as u16,
            "date_of_birth" => {
                self.date_of_birth = FmDate::from_number(value);
                self.age = self.date_of_birth.zip(today).and_then(|(born, today)| born.age_on(today));
            }
            _ => {}
        }
    }
}

impl ClubSummary {
    pub fn target(&self) -> Target {
        Target { entity: Entity::Club, uid: self.uid, address: self.address, shift: 0 }
    }

    /// Brings the fields a list row shows up to date after `field` was set to `value`.
    pub fn note_change(&mut self, field: &str, value: i64) {
        if field == "reputation" {
            self.reputation = Some(value as u16);
        }
    }
}

/// A value the editor changed: enough to show it in a change log and to undo it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub entity: Entity,
    pub uid: u32,
    pub field: String,
    pub old: i64,
    pub new: i64,
    /// The writes that took the game's record of a position out of the player's list as his rating changed, which
    /// an undo puts back; none for any other field. They hold only in the game they were written in.
    #[serde(skip)]
    pub record: Vec<Patch>,
}

#[derive(Debug)]
pub enum EditError {
    UnknownField {
        entity: Entity,
        key: String,
    },
    OutOfRange {
        field: String,
        value: i64,
        min: i64,
        max: i64,
    },
    /// A date field was given a number that is not a date.
    NotADate {
        field: String,
        value: i64,
    },
    /// A field that holds a code from a list was given a code the editor does not offer.
    NotAChoice {
        field: String,
        value: i64,
    },
    /// Another player of the team already has this squad number.
    Taken {
        field: String,
        value: i64,
        /// The UID of the player who has it.
        holder: u32,
    },
    /// The field cannot be changed this way, e.g. a date by adding to it.
    Unsupported {
        field: String,
        reason: &'static str,
    },
    /// The object no longer belongs to the person or club: the game has moved on.
    Moved {
        entity: Entity,
        uid: u32,
    },
    /// The record the field lives in is missing or does not check out, e.g. no
    /// contract, or a club without full finances.
    NoRecord {
        field: String,
    },
    /// The game has not set this date, so it is left alone.
    Unset {
        field: String,
    },
    /// The game holds a value the field cannot have, so the layout does not fit this object.
    Implausible {
        field: String,
        value: i64,
    },
    /// The value read back is not the one written.
    NotApplied {
        field: String,
        wrote: i64,
        read: i64,
    },
    /// The value has changed in the game since the change being undone was made.
    Conflict {
        field: String,
        expected: i64,
        found: i64,
    },
    /// The editor does not write this field to this game: see [`Lock`].
    Locked {
        field: String,
        lock: Lock,
    },
    Memory(fmlens_mem::Error),
}

impl fmt::Display for EditError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EditError::UnknownField { entity, key } => write!(f, "{entity} has no editable field {key}"),
            EditError::OutOfRange { field, value, min, max } => {
                write!(f, "{value} is not a valid {field}; it takes {min} to {max}")
            }
            EditError::NotADate { field, value } => write!(f, "{value} is not a date for {field}"),
            EditError::NotAChoice { field, value } => write!(f, "{value} is not one of the values {field} takes"),
            EditError::Taken { field, value, holder } => {
                write!(f, "{field} {value} is taken: the player with UID {holder} in the same team has it")
            }
            EditError::Unsupported { field, reason } => write!(f, "{field}: {reason}"),
            EditError::Moved { entity, uid } => {
                write!(f, "the {entity} with id {uid} has moved in the game's memory; reload and try again")
            }
            EditError::NoRecord { field } => {
                write!(f, "{field} cannot be changed here: its record is missing or does not check out")
            }
            EditError::Unset { field } => write!(f, "{field} is not set in the game, so it is left alone"),
            EditError::Implausible { field, value } => {
                write!(f, "{field} reads {value}, which it cannot hold; left unchanged to be safe")
            }
            EditError::NotApplied { field, wrote, read } => {
                write!(f, "wrote {wrote} to {field} but read back {read}")
            }
            EditError::Conflict { field, expected, found } => {
                write!(f, "{field} is now {found}, not {expected}; the game has changed it since")
            }
            EditError::Locked { field, lock } => write!(f, "{field} is left unchanged: {lock}"),
            EditError::Memory(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for EditError {}

impl Coded for EditError {
    fn code(&self) -> &'static str {
        match self {
            EditError::UnknownField { .. } => "edit.unknownField",
            EditError::OutOfRange { .. } => "edit.outOfRange",
            EditError::NotADate { .. } => "edit.notADate",
            EditError::NotAChoice { .. } => "edit.notAChoice",
            EditError::Taken { .. } => "edit.taken",
            EditError::Unsupported { .. } => "edit.unsupported",
            EditError::Moved { .. } => "edit.moved",
            EditError::NoRecord { .. } => "edit.noRecord",
            EditError::Unset { .. } => "edit.unset",
            EditError::Implausible { .. } => "edit.implausible",
            EditError::NotApplied { .. } => "edit.notApplied",
            EditError::Conflict { .. } => "edit.conflict",
            EditError::Locked { lock, .. } => lock.code(),
            EditError::Memory(err) => err.code(),
        }
    }

    fn params(&self) -> Vec<(&'static str, String)> {
        let field = |key: &String| ("field", key.clone());
        let number = |name: &'static str, value: &i64| (name, value.to_string());
        match self {
            EditError::UnknownField { entity, key } => vec![("entity", entity.to_string()), field(key)],
            EditError::OutOfRange { field: key, value, min, max } => {
                vec![field(key), number("value", value), number("min", min), number("max", max)]
            }
            EditError::NotADate { field: key, value }
            | EditError::NotAChoice { field: key, value }
            | EditError::Implausible { field: key, value } => vec![field(key), number("value", value)],
            EditError::Taken { field: key, value, holder } => {
                vec![field(key), number("value", value), ("uid", holder.to_string())]
            }
            EditError::Unsupported { field: key, reason } => vec![field(key), ("reason", (*reason).to_owned())],
            EditError::Moved { entity, uid } => vec![("entity", entity.to_string()), ("uid", uid.to_string())],
            EditError::NoRecord { field: key } | EditError::Unset { field: key } => vec![field(key)],
            EditError::NotApplied { field: key, wrote, read } => {
                vec![field(key), number("wrote", wrote), number("read", read)]
            }
            EditError::Conflict { field: key, expected, found } => {
                vec![field(key), number("expected", expected), number("found", found)]
            }
            EditError::Locked { field: key, lock } => [vec![field(key)], lock.params()].concat(),
            EditError::Memory(err) => err.params(),
        }
    }
}

impl From<fmlens_mem::Error> for EditError {
    fn from(err: fmlens_mem::Error) -> Self {
        EditError::Memory(err)
    }
}

impl Session {
    /// The fields of `entity` the editor can change.
    pub fn fields(&self, entity: Entity) -> Vec<Field> {
        let mut out = fields(&self.layout, entity);
        let latest = latest_birth(self.game_date());
        for field in out.iter_mut().filter(|field| field.key == "date_of_birth") {
            field.max = latest;
        }
        let latest = latest_contract_start(self.game_date());
        for field in out.iter_mut().filter(|field| CONTRACT_START_KEYS.contains(&field.key.as_str())) {
            field.max = latest;
        }
        out
    }

    /// The field of `entity` called `key`.
    pub fn field(&self, entity: Entity, key: &str) -> Result<Field, EditError> {
        self.fields(entity)
            .into_iter()
            .find(|f| f.key == key)
            .ok_or_else(|| EditError::UnknownField { entity, key: key.to_owned() })
    }

    /// Reads `field` of `target`, after checking the object still belongs to it.
    pub fn read_field(&self, target: &Target, field: &Field) -> Result<i64, EditError> {
        self.check_target(target, field)?;
        let address = self.locate(target, field)?.ok_or_else(|| EditError::NoRecord { field: field.key.clone() })?;
        Ok(field.decode(&self.process.read_bytes(address, field.kind.size())?))
    }

    /// Reads every one of `fields` of `target`: `None` for a field whose record the
    /// target lacks (no contract, a club without full finances).
    pub fn read_fields(&self, target: &Target, fields: &[Field]) -> Result<Vec<Option<i64>>, EditError> {
        for field in fields {
            if field.entity != target.entity {
                return Err(EditError::UnknownField { entity: target.entity, key: field.key.clone() });
            }
        }
        self.check_uid(target)?;
        // The fields in the object itself come from a single read of it.
        let in_object = |field: &&Field| field.place == Place::Object;
        let local = |field: &Field| (field.address(target.address, target) - target.address) as usize;
        let len = fields.iter().filter(in_object).map(|field| local(field) + field.kind.size()).max().unwrap_or(0);
        let object = self.process.read_bytes(target.address, len)?;
        let mut records: Vec<(Place, Option<u64>)> = Vec::new();
        let mut out = Vec::with_capacity(fields.len());
        for field in fields {
            if field.place == Place::Object {
                out.push(Some(field.decode(&object[local(field)..])));
                continue;
            }
            let record = match records.iter().find(|(place, _)| *place == field.place) {
                Some(&(_, record)) => record,
                None => {
                    let record = self.record(target, field.place)?;
                    records.push((field.place, record));
                    record
                }
            };
            out.push(match record {
                Some(record) => {
                    let bytes = self.process.read_bytes(field.address(record, target), field.kind.size())?;
                    Some(field.decode(&bytes))
                }
                None => None,
            });
        }
        Ok(out)
    }

    /// Writes `value` (as stored) to `field` of `target` and reads it back.
    ///
    /// Nothing is written unless `value` is in the field's range, the object still
    /// belongs to the target, the field's record checks out and its current value is
    /// plausible. If the value read back differs, the old bytes are written back before
    /// the error is returned.
    pub fn write_field(&self, target: &Target, field: &Field, value: i64) -> Result<Change, EditError> {
        self.write(target, field, value, None, false)
    }

    /// Like [`Session::write_field`], but only while the game still holds `expected`, or
    /// already holds `value`, when nothing needs writing: otherwise nothing is written and the
    /// error is a [`EditError::Conflict`]. An undo of a value the game has put back itself
    /// is done.
    pub fn write_field_if(
        &self,
        target: &Target,
        field: &Field,
        expected: i64,
        value: i64,
    ) -> Result<Change, EditError> {
        self.write(target, field, value, Some(expected), false)
    }

    /// Writes `value`. A value being restored (`restoring`) was the game's own, so it only
    /// has to be plausible, not in the range the editor writes: a potential ability the
    /// database left negative goes back as it was.
    fn write(
        &self,
        target: &Target,
        field: &Field,
        value: i64,
        expected: Option<i64>,
        restoring: bool,
    ) -> Result<Change, EditError> {
        // Undo may restore the game's original range, but never bypass build or career identity.
        if (!restoring || !self.writes_allowed())
            && let Some(lock) = self.field_lock(field)
        {
            return Err(EditError::Locked { field: field.key.clone(), lock });
        }
        let allowed = if restoring { field.is_plausible(value) } else { field.takes(value) };
        if !allowed {
            if field.choices.is_some() && (field.min..=field.max).contains(&value) {
                return Err(EditError::NotAChoice { field: field.key.clone(), value });
            }
            return Err(EditError::OutOfRange { field: field.key.clone(), value, min: field.min, max: field.max });
        }
        if field.kind == Kind::Date && FmDate::from_number(value).is_none() {
            return Err(EditError::NotADate { field: field.key.clone(), value });
        }
        self.check_target(target, field)?;
        let address = self.locate(target, field)?.ok_or_else(|| EditError::NoRecord { field: field.key.clone() })?;
        let old_bytes = self.process.read_bytes(address, field.kind.size())?;
        let old = field.decode(&old_bytes);
        if let Some(expected) = expected
            && conflicts(expected, old, value)
        {
            return Err(EditError::Conflict { field: field.key.clone(), expected, found: old });
        }
        if !field.is_plausible(old) {
            return Err(EditError::Implausible { field: field.key.clone(), value: old });
        }
        if !restoring && !field.replaceable(old) {
            return Err(EditError::Unsupported { field: field.key.clone(), reason: UNLISTED });
        }
        if field.kind == Kind::Date && old == 0 {
            return Err(EditError::Unset { field: field.key.clone() });
        }
        let mut change = Change {
            entity: target.entity,
            uid: target.uid,
            field: field.key.clone(),
            old,
            new: value,
            record: Vec::new(),
        };
        if old == value {
            return Ok(change);
        }
        if field.kind == Kind::Pointer && !self.same_class(old, value)? {
            return Err(EditError::Unsupported { field: field.key.clone(), reason: OTHER_CLASS });
        }
        // Two players of a team on the pitch with one number would confuse the game; the players it has lent out
        // keep theirs, so they do not count.
        if field.key == "contract.squad_number"
            && !restoring
            && field.blank != Some(value)
            && let Some(holder) = self.squad_number_holder(target, value)?
        {
            return Err(EditError::Taken { field: field.key.clone(), value, holder });
        }
        // The game writes a position's rating back from the record it keeps of it: the record goes first, as in the
        // game's own editor. An undo puts it back itself.
        if !restoring {
            change.record = self.position_record(target, field)?;
            self.write_patches(&change.record).map_err(|err| record_error(field, err))?;
        }
        if let Err(err) = self.write_checked(address, field, value, &old_bytes) {
            // Best effort: the record goes back, as the rating has.
            let _ = self.undo_patches(&change.record);
            return Err(err);
        }
        // The game reuses the scores it keeps of a squad's mood for a week: have it work them out from this.
        if target.entity == Entity::Player && crate::mood::MOOD_FIELDS.contains(&field.key.as_str()) {
            self.recheck_squad_mood(target.address);
        }
        Ok(change)
    }

    /// Writes `value` to `field` at `address`, over `old_bytes`, and reads it back; where the game then holds something
    /// else, what was there goes back.
    fn write_checked(&self, address: u64, field: &Field, value: i64, old_bytes: &[u8]) -> Result<(), EditError> {
        self.process.write_bytes(address, &field.encode(value, old_bytes))?;
        let read = field.decode(&self.process.read_bytes(address, field.kind.size())?);
        if read != value {
            // Best effort: put back what was there.
            let _ = self.process.write_bytes(address, old_bytes);
            return Err(EditError::NotApplied { field: field.key.clone(), wrote: value, read });
        }
        Ok(())
    }

    /// The writes that take the game's record of the position `field` rates out of the player's list; none for any
    /// other field, or for a position the game keeps no record of. Refused when his records do not read as such.
    fn position_record(&self, target: &Target, field: &Field) -> Result<Vec<Patch>, EditError> {
        let p = &self.layout.player;
        let position = field.key.strip_prefix("position.").filter(|_| target.entity == Entity::Player);
        let (Some(key), Some(offset)) = (position, p.position_records) else {
            return Ok(Vec::new());
        };
        let Some(position) = POSITIONS.iter().position(|&name| name == key) else {
            return Ok(Vec::new());
        };
        let pointer = self.process.read_u64(target.address + p.at(offset, target.shift))?;
        let records = Records::read(&self.process, pointer)
            .ok_or_else(|| EditError::Unsupported { field: field.key.clone(), reason: ODD_RECORDS })?;
        Ok(records.removal(position))
    }

    /// Whether the objects at `a` and `b` are of one class: their first word, the class's table, is the same.
    fn same_class(&self, a: i64, b: i64) -> Result<bool, EditError> {
        if !is_user_pointer(b as u64) {
            return Ok(false);
        }
        Ok(self.process.read_u64(a as u64)? == self.process.read_u64(b as u64)?)
    }

    /// The UID of another player of the team the player `target` plays for who wears the
    /// squad number `number`, among the players who play for that team now.
    fn squad_number_holder(&self, target: &Target, number: i64) -> Result<Option<u32>, EditError> {
        let (p, c) = (&self.layout.player, &self.layout.contract);
        let team = self.process.read_u64(target.address + p.team)?;
        if !is_user_pointer(team) {
            return Ok(None);
        }
        let header = self.process.read_bytes(team + self.layout.team.players, 16)?;
        let begin = u64::from_le_bytes(header[..8].try_into().expect("8 bytes"));
        let end = u64::from_le_bytes(header[8..].try_into().expect("8 bytes"));
        if !is_user_pointer(begin) || end <= begin || end - begin > 8 * 2_000 {
            return Ok(None);
        }
        for element in self.process.read_bytes(begin, (end - begin) as usize)?.as_chunks::<8>().0 {
            let player = u64::from_le_bytes(*element);
            if player == target.address || self.process.read_u64(player + p.team)? != team {
                continue;
            }
            let shift = crate::players::person_shift(&self.process, p, player);
            let contract = self.process.read_u64(player + p.at(p.contract, shift))?;
            if is_user_pointer(contract)
                && i64::from(self.process.read_bytes(contract + c.squad_number, 1)?[0]) == number
            {
                return Ok(Some(self.process.read_u32(player + p.at(p.uid, shift))?));
            }
        }
        Ok(None)
    }

    /// Undoes `change`, provided the game still holds the value it wrote, or already holds the
    /// one it found. The record of a position the change took out goes back with the rating; where the game has
    /// changed the player's records since, neither does.
    pub fn revert(&self, target: &Target, change: &Change) -> Result<Change, EditError> {
        let field = self.field(target.entity, &change.field)?;
        let undone = self.write(target, &field, change.old, Some(change.new), true)?;
        if let Err(err) = self.undo_patches(&change.record) {
            // Best effort: the rating stays as the change wrote it, with no record to write another back from.
            let _ = self.write(target, &field, change.new, Some(change.old), true);
            return Err(record_error(&field, err));
        }
        Ok(undone)
    }

    fn check_target(&self, target: &Target, field: &Field) -> Result<(), EditError> {
        if field.entity != target.entity {
            return Err(EditError::UnknownField { entity: target.entity, key: field.key.clone() });
        }
        self.check_uid(target)
    }

    /// Checks that the object at the target's address still carries the target's UID.
    pub(crate) fn check_uid(&self, target: &Target) -> Result<(), EditError> {
        let uid_offset = match target.entity {
            Entity::Player => self.layout.player.at(self.layout.player.uid, target.shift),
            Entity::Staff => self.layout.staff.at(self.layout.staff.uid, target.shift),
            Entity::Club => self.layout.club.uid,
            Entity::Nation => self.layout.nation.uid,
            Entity::Official => match self.layout.official.as_ref() {
                Some(o) => o.uid,
                None => return Err(EditError::Moved { entity: target.entity, uid: target.uid }),
            },
        };
        if self.process.read_u32(target.address + uid_offset)? != target.uid {
            return Err(EditError::Moved { entity: target.entity, uid: target.uid });
        }
        Ok(())
    }

    /// Where `field` of `target` is, or `None` when its record is missing or does not check out.
    fn locate(&self, target: &Target, field: &Field) -> Result<Option<u64>, EditError> {
        Ok(self.record(target, field.place)?.map(|record| field.address(record, target)))
    }

    /// Where the record `place` of `target` starts, following its pointer, or `None`
    /// when the target has none or it does not check out.
    fn record(&self, target: &Target, place: Place) -> Result<Option<u64>, EditError> {
        let pointer = |offset: u64| -> Result<Option<u64>, EditError> {
            let value = self.process.read_u64(target.address + offset)?;
            Ok(is_user_pointer(value).then_some(value))
        };
        let club = &self.layout.club;
        Ok(match (place, target.entity) {
            (Place::Object, _) => Some(target.address),
            (Place::Contract, Entity::Player | Entity::Staff) => {
                let (contract, identity) = match target.entity {
                    Entity::Player => (self.layout.player.contract, self.layout.player.identity()),
                    _ => (self.layout.staff.contract, self.layout.staff.identity()),
                };
                // Both the pointer and the identity block it must point back at move with the shift.
                let Some(record) = pointer(contract + target.shift)? else {
                    return Ok(None);
                };
                let owner = self.process.read_u64(record + self.layout.contract.owner)?;
                (owner == target.address + identity + target.shift).then_some(record)
            }
            (Place::Loan, Entity::Player) => self.loan_contract(target.address, target.shift),
            (Place::ClubInfo, Entity::Club) => pointer(club.info)?,
            (Place::ClubFinance, Entity::Club) => {
                let Some(record) = pointer(club.finance)? else {
                    return Ok(None);
                };
                let bytes = self.process.read_bytes(record, self.layout.club_finance.end() as usize)?;
                let class = u64::from_le_bytes(bytes[..8].try_into().expect("8 bytes"));
                let full = self.finance_class() == Some(class) && finances_look_real(&bytes, &self.layout.club_finance);
                full.then_some(record)
            }
            (Place::SeniorTeam, Entity::Club) => {
                let Some(teams) = pointer(club.teams)? else {
                    return Ok(None);
                };
                let team = self.process.read_u64(teams)?;
                let belongs =
                    is_user_pointer(team) && self.process.read_u64(team + self.layout.team.club)? == target.address;
                belongs.then_some(team)
            }
            (Place::Concerns, Entity::Player) => {
                let Some(contract) = self.record(target, Place::Contract)? else {
                    return Ok(None);
                };
                let record = self.process.read_u64(contract + self.layout.contract.unhappiness)?;
                is_user_pointer(record).then_some(record)
            }
            (Place::Stadium, Entity::Club) => {
                let Some((stadium, bytes)) = crate::clubs::club_stadium(&self.process, &self.layout, target.address)
                else {
                    return Ok(None);
                };
                let class = u64::from_le_bytes(bytes[..8].try_into().expect("8 bytes"));
                (self.stadium_class() == Some(class)).then_some(stadium)
            }
            (Place::HumanManagerFlags, Entity::Staff) => {
                let Some(layout) = self.profile.as_ref().and_then(|profile| profile.human_manager.as_ref()) else {
                    return Ok(None);
                };
                if !self.current_career() {
                    return Ok(None);
                }
                // The object's own class, not the list's guess that a shifted person is the human.
                let class = crate::rtti::class_of(&self.process, &self.plugin, target.address + layout.class_at);
                human_manager_flags(Some(layout), target, class.as_deref()).map(|flags| target.address + flags)
            }
            (Place::NationalTeam(side), Entity::Nation) => {
                crate::national::senior_team(&self.process, &self.layout, target.address, target.uid, side)
            }
            (Place::NationalContainer(side), Entity::Nation) => {
                crate::national::container(&self.process, &self.layout, target.address, side)
            }
            _ => None,
        })
    }
}

/// What went wrong taking the record of a position out of a player's list, or putting it back, as an edit's failure.
fn record_error(field: &Field, err: MoveError) -> EditError {
    match err {
        MoveError::Locked(lock) => EditError::Locked { field: field.key.clone(), lock },
        MoveError::Memory(err) => EditError::Memory(err),
        _ => EditError::Unsupported { field: field.key.clone(), reason: RECORDS_CHANGED },
    }
}

/// Whether a write of `value` over `expected` meets something else: the game holds `old`, neither what the write
/// expects nor what it would write.
fn conflicts(expected: i64, old: i64, value: i64) -> bool {
    old != expected && old != value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_write_meets_a_conflict_only_where_the_game_holds_neither_value() {
        // Undo of 10 to 7: the game holds 7, or has put 10 back itself.
        assert!(!conflicts(7, 7, 10));
        assert!(!conflicts(7, 10, 10));
        assert!(conflicts(7, 8, 10));
    }

    #[test]
    fn birth_dates_run_to_the_game_date_in_a_long_career() {
        assert_eq!(latest_birth(None), 20201231);
        assert_eq!(latest_birth(FmDate::from_number(20260701)), 20260701);
        assert_eq!(latest_birth(FmDate::from_number(20460315)), 20460315);
        assert_eq!(latest_birth(FmDate::from_number(20190101)), 20201231);
    }

    #[test]
    fn contract_starts_end_at_the_game_date() {
        // Without the game's date, the static range; with it, no day after it.
        assert_eq!(latest_contract_start(None), 21001231);
        assert_eq!(latest_contract_start(FmDate::from_number(20271211)), 20271211);
        assert_eq!(latest_contract_start(FmDate::from_number(21500101)), 21001231);
    }

    #[test]
    fn kinds_round_trip() {
        let old = [0u8; 4];
        for (kind, value) in [
            (Kind::U8, 200),
            (Kind::U16, 10_000),
            (Kind::I16, -95),
            (Kind::I16, 200),
            (Kind::I32, -1_500_000),
            (Kind::U32, 250_000),
        ] {
            assert_eq!(kind.decode(&kind.encode(value, &old)), value);
            assert_eq!(kind.encode(value, &old).len(), kind.size());
        }
    }

    #[test]
    fn dates_keep_the_game_s_flags() {
        // 31 Dec 2028 with a flag above the day, as the game may store it.
        let old = [(0x8000u16 | 366).to_le_bytes(), 2028u16.to_le_bytes()].concat();
        assert_eq!(Kind::Date.decode(&old), 20281231);
        let new = Kind::Date.encode(20290630, &old);
        assert_eq!(u16::from_le_bytes([new[0], new[1]]), 0x8000 | 181);
        assert_eq!(u16::from_le_bytes([new[2], new[3]]), 2029);
        assert_eq!(Kind::Date.decode(&new), 20290630);
        // A date the game has not set reads 0.
        assert_eq!(Kind::Date.decode(&[2, 0, 0x6C, 0x07]), 0); // 2 Jan 1900
    }

    #[test]
    fn attribute_scale_round_trips() {
        for shown in 1..=20 {
            assert_eq!(Scale::Attribute.shown(Scale::Attribute.stored(shown)), shown);
        }
        assert_eq!(Scale::Attribute.shown(97), 19);
        assert_eq!(Scale::Plain.stored(15), 15);
        for shown in 0..=100 {
            assert_eq!(Scale::Percent.shown(Scale::Percent.stored(shown)), shown);
        }
        assert_eq!(Scale::Percent.shown(8865), 89);
        assert_eq!(Scale::Percent.shown(6950), 70);
    }

    #[test]
    fn flags_keep_the_rest_of_their_byte() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let players = fields(&layout, Entity::Player);
        let field = |key: &str| players.iter().find(|f| f.key == key).cloned().expect(key);
        let (transfer, loan) = (field("contract.transfer_listed"), field("contract.loan_listed"));
        // Bit 6 is the game's own, set for many youngsters.
        let byte = [0b0100_0010];
        assert_eq!((transfer.decode(&byte), loan.decode(&byte)), (0, 1));
        assert_eq!(transfer.encode(1, &byte), [0b0100_0011]);
        assert_eq!(loan.encode(0, &byte), [0b0100_0000]);
        assert_eq!(transfer.kind.size(), 1);
    }

    #[test]
    fn some_fields_take_a_blank_or_a_list_of_codes() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let players = fields(&layout, Entity::Player);
        let field = |key: &str| players.iter().find(|f| f.key == key).cloned().expect(key);
        let number = field("contract.squad_number");
        assert!(number.takes(1) && number.takes(99) && number.takes(255));
        assert!(!number.takes(0) && !number.takes(100));
        let status = field("contract.squad_status");
        assert!(status.takes(1) && !status.takes(6) && !status.takes(0));
        let price = field("asking_price");
        assert!(price.takes(-1) && price.takes(0) && price.takes(25_000_000) && !price.takes(-2));
        let born = field("date_of_birth");
        assert!(born.takes(19960912) && !born.takes(18991231) && !born.takes(20300101));
        // Reasons to be unhappy are only ever removed, all at once.
        let unhappiness = field("contract.unhappiness");
        assert!(unhappiness.takes(0) && !unhappiness.takes(1));
        // Happiness is a signed byte: Olivier Boscagli's read -4.
        let happiness = field("contract.happiness");
        assert!(happiness.kind == Kind::I8 && happiness.takes(-4) && happiness.takes(100) && !happiness.takes(101));
        // Rested is -500, the least the game keeps.
        let jaded = field("jadedness");
        assert!(jaded.takes(-500) && jaded.takes(252) && !jaded.takes(-501) && jaded.kind == Kind::I16);
    }

    #[test]
    fn field_tables_cover_the_layout() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let key = |list: &[Field], key: &str| list.iter().find(|f| f.key == key).cloned().expect(key);
        let players = fields(&layout, Entity::Player);
        // Every position but the sweeper; the contract's wage, end and the days it was signed and he joined; and the
        // squad number, squad status and the transfer and loan listing, which only players have.
        // The 13 basic fields and the 4 live ones (condition, match sharpness, jadedness, morale); and a loan's wage
        // and end, where the layout places loans.
        let loan = if layout.loan.is_some() { 2 } else { 0 };
        assert_eq!(
            players.len(),
            13 + 4 + layout.player.attributes.len() + POSITIONS.len() - 1 + PERSONALITY.len() + 4 + 4 + 4 + 64 + loan
        );
        if layout.loan.is_some() {
            for key in ["loan.wage", "loan.ends"] {
                let field = players.iter().find(|f| f.key == key).expect(key);
                assert_eq!(field.place, Place::Loan);
                assert!(!field.shifted && !field.mass);
                assert!(!field.mass);
            }
        }
        assert_eq!(key(&players, "nation").kind, Kind::Pointer);
        assert!(!key(&players, "nation").mass);
        assert!(!key(&players, "contract.squad_number").mass);
        assert!(key(&players, "contract.wage").mass);
        // The days a contract was signed and its holder joined: in the contract, one person at a time, players and
        // staff alike.
        let c = &layout.contract;
        for (entity, list) in [(Entity::Player, &players), (Entity::Staff, &fields(&layout, Entity::Staff))] {
            for (name, offset) in [("contract.signed", c.signed), ("contract.joined", c.joined)] {
                let field = key(list, name);
                assert_eq!((field.entity, field.offset, field.kind), (entity, offset, Kind::Date));
                assert_eq!(field.place, Place::Contract);
                assert!(!field.mass && !field.shifted);
                assert!(field.takes(20090701) && !field.takes(19491231) && field.blank.is_none());
            }
        }
        assert!(!players.iter().any(|f| f.key == "position.sw"));
        let staff = fields(&layout, Entity::Staff);
        let staff_attributes = layout.staff.attributes.len() + layout.staff.ratings.len();
        // The 7 basic fields; the 4 contract fields, the coaching licence and the 2 formations where the layout places
        // them, and the human manager's 2 flags.
        let licence = usize::from(layout.staff.coaching_licence.is_some());
        let formations = if layout.staff.formations.is_some() { 2 } else { 0 };
        assert_eq!(staff.len(), 7 + staff_attributes + PERSONALITY.len() + 4 + licence + formations + 2);
        let clubs = fields(&layout, Entity::Club);
        // Reputation, the 5 facilities and the 4 amounts of money; and the 4 capacities of the stadium where the layout
        // knows it (Windows so far).
        assert_eq!(clubs.len(), 10 + if layout.stadium.is_some() { 4 } else { 0 });
        if layout.stadium.is_some() {
            assert_eq!(key(&clubs, "stadium.capacity").place, Place::Stadium);
            // A count of seats, not money, which the app shows with a pound sign.
            assert_eq!(key(&clubs, "stadium.capacity").kind, Kind::U32);
        }

        // Before the person block: never shifted. In it: shifted. Other records: never.
        assert!(!key(&players, "attribute.finishing").shifted);
        assert!(key(&players, "personality.ambition").shifted);
        assert!(key(&players, "international.caps").shifted);
        assert!(!key(&players, "contract.wage").shifted);
        assert!(!key(&staff, "current_ability").shifted);
        assert!(key(&staff, "personality.ambition").shifted);
        assert_eq!(key(&staff, "attribute.authority").scale, Scale::Plain);
        assert_eq!(key(&staff, "attribute.tactical").scale, Scale::Attribute);
        assert_eq!(key(&clubs, "finance.transfer_budget").place, Place::ClubFinance);
        assert_eq!(key(&clubs, "reputation").place, Place::SeniorTeam);

        let target = Target { entity: Entity::Player, uid: 1, address: 0x1000, shift: 0xF8 };
        let finishing = key(&players, "attribute.finishing");
        assert_eq!(finishing.address(target.address, &target), 0x1000 + layout.player.attributes["finishing"]);
        let adaptability = key(&players, "personality.adaptability");
        assert_eq!(adaptability.address(target.address, &target), 0x1000 + layout.player.personality + 0xF8);
        assert_eq!(key(&players, "contract.wage").address(0x9000, &target), 0x9000 + layout.contract.wage);
    }

    #[test]
    fn officials_take_their_own_values_one_at_a_time() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let officials = fields(&layout, Entity::Official);
        let Some(o) = layout.official.as_ref() else {
            assert!(officials.is_empty());
            return;
        };
        let keys: Vec<&str> = officials.iter().map(|f| f.key.as_str()).collect();
        assert_eq!(keys, ["current_ability", "potential_ability", "reputation", "date_of_birth"]);
        assert!(officials.iter().all(|f| !f.mass && !f.shifted && f.place == Place::Object));
        let key = |key: &str| officials.iter().find(|f| f.key == key).cloned().expect(key);

        // Michael Oliver: 180/180, reputation 8388, born 20 February 1985.
        let ca = key("current_ability");
        assert_eq!((ca.offset, ca.kind), (o.current_ability, Kind::U16));
        assert!(ca.takes(180) && ca.takes(200) && !ca.takes(201) && !ca.takes(0) && ca.is_plausible(0));
        assert_eq!(key("potential_ability").kind, Kind::U16);
        let reputation = key("reputation");
        assert!(reputation.takes(8388) && reputation.takes(0) && !reputation.takes(10_001));
        let born = key("date_of_birth");
        assert_eq!((born.offset, born.kind), (o.date_of_birth, Kind::Date));
        assert!(born.takes(19850220) && !born.takes(19300101) && !born.is_plausible(19850230));

        // Checked by its own UID, with no person-block shift; the row follows an edit.
        let mut oliver = OfficialSummary {
            uid: 103994,
            address: 0x7000,
            name: "Michael Oliver".into(),
            nation: Some("England".into()),
            nation_uid: Some(765),
            date_of_birth: FmDate::from_number(19850220),
            age: Some(41),
            current_ability: 180,
            potential_ability: 180,
            reputation: 8388,
        };
        let target = oliver.target();
        assert_eq!((target.entity, target.uid, target.shift), (Entity::Official, 103994, 0));
        assert_eq!(reputation.address(target.address, &target), 0x7000 + o.reputation);
        let today = FmDate::from_number(20261116);
        oliver.note_change("reputation", 9000, today);
        oliver.note_change("date_of_birth", 19900101, today);
        assert_eq!((oliver.reputation, oliver.age), (9000, Some(36)));
    }

    #[test]
    fn staff_take_a_birth_date_where_a_player_keeps_his() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let (p, s) = (&layout.player, &layout.staff);
        let staff = fields(&layout, Entity::Staff);
        let born = staff.iter().find(|f| f.key == "date_of_birth").cloned().expect("field");
        assert_eq!((born.offset, born.kind, born.place), (s.date_of_birth, Kind::Date, Place::Object));
        // The same place in the person record as a player's, whose edit is already in use.
        assert_eq!(s.date_of_birth - s.person_block, p.date_of_birth - p.person_block);
        assert_eq!(crate::health::Check::of_field(&born), crate::health::Check::Staff);

        // A chairman born in the 1930s keeps a date of his own; no one is born before 1920 or after the game's date.
        assert!(born.takes(19470308) && born.takes(19350101) && born.takes(20201231));
        assert!(!born.takes(19191231) && !born.takes(20300101));
        // No date at all, or one that is no day, is not written over.
        assert!(born.is_plausible(19030101) && !born.is_plausible(0) && !born.is_plausible(19470230));

        // In the person block, so the human manager's is 0x340 further.
        assert!(born.shifted);
        let coach = Target { entity: Entity::Staff, uid: 1, address: 0x1000, shift: 0 };
        let manager = Target { entity: Entity::Staff, uid: 2, address: 0x1000, shift: 0x340 };
        assert_eq!(born.address(coach.address, &coach), 0x1000 + s.date_of_birth);
        assert_eq!(born.address(manager.address, &manager), 0x1000 + s.date_of_birth + 0x340);
    }

    #[test]
    fn nations_take_their_own_rules_one_at_a_time() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let nations = fields(&layout, Entity::Nation);
        let Some(n) = layout.national.as_ref() else {
            // A build whose layout does not place nations offers none of their fields.
            assert!(nations.is_empty());
            return;
        };
        let key = |key: &str| nations.iter().find(|f| f.key == key).cloned().expect(key);
        let keys: Vec<&str> = nations.iter().map(|f| f.key.as_str()).collect();
        let styles = |prefix: &str| -> Vec<String> {
            let style = n.style.map(|_| crate::national::STYLE.as_slice()).unwrap_or_default();
            style.iter().map(|key| format!("{prefix}style.{key}")).collect()
        };
        let side = |prefix: &str| {
            ["reputation", "youth_rating", "game_importance", "attendance"]
                .map(|key| format!("{prefix}{key}"))
                .into_iter()
                .chain(styles(prefix))
        };
        let expected: Vec<String> = side("")
            .chain(side("women."))
            .chain(["points", "women.points", "population", "dual_nationality", "naturalisation"].map(String::from))
            .collect();
        assert_eq!(keys, expected);
        assert!(nations.iter().all(|f| !f.mass && !f.shifted));

        // The FIFA points, an f32 in each side's container held as its bits: England's 1,922.83 (its women's 2,027.1)
        // is in range, a negative number or one past 3,000 is not, and the bytes written are the float's own.
        for (name, side, england) in [("points", Side::Men, 1922.83f32), ("women.points", Side::Women, 2027.1)] {
            let points = key(name);
            assert_eq!(
                (points.place, points.offset, points.kind),
                (Place::NationalContainer(side), n.points, Kind::F32)
            );
            let bits = f32_bits(england);
            assert!(points.takes(0) && points.takes(bits) && points.takes(f32_bits(3000.0)));
            assert!(!points.takes(f32_bits(3000.01)) && !points.takes(f32_bits(-1.0)));
            assert_eq!(points.decode(&england.to_le_bytes()), bits);
            assert_eq!(points.encode(f32_bits(2000.5), &[0; 4]), 2000.5f32.to_le_bytes());
        }

        // The senior teams' reputations, found through the containers; the youth ratings in the containers; the rest
        // in the nation itself.
        for (key, side) in [("reputation", Side::Men), ("women.reputation", Side::Women)] {
            let reputation = nations.iter().find(|f| f.key == key).expect(key);
            assert_eq!(
                (reputation.place, reputation.offset, reputation.kind),
                (Place::NationalTeam(side), layout.team.reputation, Kind::U16)
            );
            assert!(reputation.takes(0) && reputation.takes(10_000) && !reputation.takes(10_001));
        }
        for (key, side) in [("youth_rating", Side::Men), ("women.youth_rating", Side::Women)] {
            let youth = nations.iter().find(|f| f.key == key).expect(key);
            assert_eq!(
                (youth.place, youth.offset, youth.kind),
                (Place::NationalContainer(side), n.youth_rating, Kind::I16)
            );
            // England's men have 135, its women 161.
            assert!(youth.takes(0) && youth.takes(135) && youth.takes(165) && !youth.takes(166) && !youth.takes(-1));
        }
        // FM's game importance, 0 to 4 (England's men 1), and attendance, 0 to 16 (England's men 15, women 10).
        for (name, side) in [("game_importance", Side::Men), ("women.game_importance", Side::Women)] {
            let importance = key(name);
            assert_eq!(
                (importance.place, importance.offset, importance.kind),
                (Place::NationalContainer(side), n.game_importance, Kind::I8)
            );
            assert!(importance.takes(0) && importance.takes(4) && !importance.takes(5) && !importance.takes(-1));
        }
        for (name, side) in [("attendance", Side::Men), ("women.attendance", Side::Women)] {
            let attendance = key(name);
            assert_eq!(
                (attendance.place, attendance.offset, attendance.kind),
                (Place::NationalContainer(side), n.attendance, Kind::U8)
            );
            assert!(attendance.takes(0) && attendance.takes(16) && !attendance.takes(17));
        }
        // Style ratings, 0 to 20 (most nations 10), twelve bytes a side from Ndep to Nwid.
        if let Some(style) = n.style {
            for (prefix, side) in [("", Side::Men), ("women.", Side::Women)] {
                let depth = key(&format!("{prefix}style.depth"));
                let width = key(&format!("{prefix}style.width"));
                assert_eq!((depth.place, depth.offset, depth.kind), (Place::NationalContainer(side), style, Kind::I8));
                assert_eq!((width.place, width.offset), (Place::NationalContainer(side), style + 11));
                assert!(depth.takes(0) && depth.takes(10) && depth.takes(20) && !depth.takes(21) && !depth.takes(-1));
            }
        }
        let population = key("population");
        assert_eq!((population.place, population.offset, population.kind), (Place::Object, n.population, Kind::U32));
        assert!(population.takes(9_646) && population.takes(232_679_478) && !population.takes(0));

        // Allowed (0) or not (2); no other code.
        let dual = key("dual_nationality");
        assert_eq!((dual.offset, dual.kind), (n.dual_nationality, Kind::U8));
        assert!(dual.takes(0) && dual.takes(2) && !dual.takes(1) && !dual.takes(3));

        // Years of residence, or never (255); the game takes 0 for never too, so it is not offered as a number.
        let years = key("naturalisation");
        assert_eq!((years.offset, years.kind, years.blank), (n.naturalisation, Kind::U8, Some(255)));
        assert!(years.takes(1) && years.takes(99) && years.takes(255) && !years.takes(0) && !years.takes(100));
        assert!(years.is_plausible(255) && years.is_plausible(2));

        // A nation is checked by its own UID, like a club's; no person-block shift.
        let target = Nation { address: 0x5000, uid: Some(765), name: "England".into() }.target().expect("UID");
        assert_eq!((target.entity, target.uid, target.shift), (Entity::Nation, 765, 0));
        assert_eq!(population.address(target.address, &target), 0x5000 + n.population);
        assert_eq!(Nation { address: 0x5000, uid: None, name: "?".into() }.target(), None);
    }

    #[test]
    fn a_coaching_licence_is_written_in_the_positive_form() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let staff = fields(&layout, Entity::Staff);
        let Some(offset) = layout.staff.coaching_licence else {
            assert!(!staff.iter().any(|f| f.key == "coaching_licence"));
            return;
        };
        let field = staff.iter().find(|f| f.key == "coaching_licence").cloned().expect("field");
        assert_eq!((field.offset, field.kind, field.min, field.max), (offset, Kind::I8, 0, 8));
        assert!(field.shifted && field.mass);
        assert!(field.takes(0) && field.takes(1) && field.takes(7) && !field.takes(9) && !field.takes(-1));
        // Level 8, the game's own none, is not offered beside 0, but an undo may still write it back.
        assert!(!field.takes(8) && field.is_plausible(8));
        // The game's other form of levels 2 to 8 reads as plausible, and is replaced on a write.
        assert!(field.is_plausible(-1) && field.is_plausible(-7) && !field.is_plausible(-8) && !field.is_plausible(9));
    }

    #[test]
    fn a_manager_s_formations_are_the_two_fm_s_profile_shows() {
        let layout: crate::profile::Layout =
            toml::from_str(include_str!("../../../profiles/fm27/layout-macos.toml")).expect("macOS layout");
        assert_eq!(layout.staff.formations, Some([0xDF, 0xE3]));
        let staff = fields(&layout, Entity::Staff);
        let field = |key: &str| staff.iter().find(|f| f.key == key).cloned().expect("field");
        let (with_the_ball, without_it) = (field("formation.in_possession"), field("formation.out_of_possession"));
        assert_eq!((with_the_ball.offset, without_it.offset), (0xDF, 0xE3));
        // 29 is a common formation with the ball, never one the game gives without it.
        assert!(with_the_ball.takes(29) && with_the_ball.takes(22));
        assert!(without_it.takes(22) && !without_it.takes(29));
        // A formation the editor cannot name stays as it is; none or a listed one may be replaced.
        assert!(with_the_ball.replaceable(0) && with_the_ball.replaceable(29));
        assert!(!with_the_ball.replaceable(50) && with_the_ball.is_plausible(50));
        assert!(field("coaching_licence").replaceable(-3));
    }

    #[test]
    fn the_unsackable_flag_is_one_manager_s_bit() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let staff = fields(&layout, Entity::Staff);
        let field = staff.iter().find(|f| f.key == "manager.unsackable").cloned().expect("field");
        assert_eq!((field.kind, field.min, field.max, field.bit), (Kind::Flag, 0, 1, 1));
        assert_eq!(field.place, Place::HumanManagerFlags);
        assert!(!field.shifted && !field.mass);
        assert!(field.takes(0) && field.takes(1) && !field.takes(2));
        assert_eq!(crate::health::Check::of_field(&field), crate::health::Check::Staff);
        // At the start of the flags word, whatever the person block's shift.
        let target = Target { entity: Entity::Staff, uid: 1, address: 0x1000, shift: 0x340 };
        assert_eq!(field.address(0x13FC, &target), 0x13FC);

        // Setting and clearing bit 1 keeps the seven others, whichever they are.
        for others in [0b0000_0000u8, 0b1111_1101, 0b1010_0101, 0b0101_1000] {
            let off = [others & !0b10];
            let on = [others | 0b10];
            assert_eq!((field.decode(&off), field.decode(&on)), (0, 1));
            assert_eq!(field.encode(1, &off), on);
            assert_eq!(field.encode(0, &on), off);
            assert_eq!(field.encode(1, &on), on);
            assert_eq!(field.encode(0, &off), off);
        }
    }

    #[test]
    fn registration_anytime_is_bit_8_of_the_manager_s_flags() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let staff = fields(&layout, Entity::Staff);
        let field = staff.iter().find(|f| f.key == "manager.registration_anytime").cloned().expect("field");
        assert_eq!((field.kind, field.min, field.max, field.bit), (Kind::Flag, 0, 1, 0));
        assert_eq!(field.place, Place::HumanManagerFlags);
        assert!(!field.shifted && !field.mass);
        // The second byte of the flags word, whatever the person block's shift.
        let target = Target { entity: Entity::Staff, uid: 1, address: 0x1000, shift: 0x340 };
        assert_eq!(field.address(0x13FC, &target), 0x13FD);
        for others in [0b0000_0000u8, 0b1111_1110, 0b1010_0100, 0b0000_0010] {
            let (off, on) = ([others & !1], [others | 1]);
            assert_eq!((field.decode(&off), field.decode(&on)), (0, 1));
            assert_eq!(field.encode(1, &off), on);
            assert_eq!(field.encode(0, &on), off);
        }
    }

    #[test]
    fn only_a_traced_human_manager_has_the_flags() {
        let traced = HumanManagerLayout {
            flags: 0x3FC,
            person_shift: 0x340,
            class: "N2db16HUMAN_NON_PLAYERE".into(),
            class_at: 0,
        };
        let class = Some("N2db16HUMAN_NON_PLAYERE");
        let manager = Target { entity: Entity::Staff, uid: 7, address: 0x1000, shift: 0x340 };
        assert_eq!(human_manager_flags(Some(&traced), &manager, class), Some(0x3FC));
        // A build without the trace, another class, an unshifted or differently shifted person, or a player.
        assert_eq!(human_manager_flags(None, &manager, class), None);
        assert_eq!(human_manager_flags(Some(&traced), &manager, Some("N2db9NON_PLAYERE")), None);
        assert_eq!(human_manager_flags(Some(&traced), &manager, None), None);
        assert_eq!(human_manager_flags(Some(&traced), &Target { shift: 0, ..manager }, class), None);
        assert_eq!(human_manager_flags(Some(&traced), &Target { shift: 0xF8, ..manager }, class), None);
        assert_eq!(human_manager_flags(Some(&traced), &Target { entity: Entity::Player, ..manager }, class), None);
        let unshifted = HumanManagerLayout { person_shift: 0, ..traced };
        assert_eq!(human_manager_flags(Some(&unshifted), &Target { shift: 0, ..manager }, class), None);
    }

    #[test]
    fn date_fields_are_plausible_when_unset_or_real() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let expires = fields(&layout, Entity::Player).into_iter().find(|f| f.key == "contract.expires").expect("field");
        assert!(expires.is_plausible(0));
        assert!(expires.is_plausible(20290630));
        assert!(!expires.is_plausible(20290631));
        assert!(!expires.is_plausible(12345));
    }

    #[test]
    fn list_rows_follow_edits() {
        let mut position_ratings = [1u8; 15];
        position_ratings[12] = 18; // ST
        let mut player = PlayerSummary {
            uid: 1,
            name: "A".to_owned(),
            full_name: None,
            date_of_birth: None,
            age: None,
            nation: None,
            nation_uid: None,
            club: None,
            club_uid: None,
            positions: vec!["st"],
            contract_expires: None,
            current_ability: 120,
            potential_ability: 150,
            position_ratings,
            nation_address: 0,
            attributes: vec![10; crate::ATTRIBUTE_GROUPS.iter().map(|(_, keys)| keys.len()).sum()],
            base: crate::players::Base::default(),
            transfer_listed: false,
            loan_listed: false,
            height_cm: 180,
            wage: Some(1_000),
            transfer_value: None,
            current_reputation: 5000,
            personality: [10; 8],
            traits: 0b100,
            address: 0,
            shift: 0,
        };
        // What the list's filters read follows too.
        player.note_change("contract.wage", 25_000);
        player.note_change("height", 191);
        player.note_change("personality.ambition", 17);
        player.note_change("trait.7", 1);
        player.note_change("trait.2", 0);
        player.note_change("trait.64", 1);
        assert_eq!((player.wage, player.height_cm), (Some(25_000), 191));
        assert_eq!(player.personality[PERSONALITY.iter().position(|&key| key == "ambition").unwrap()], 17);
        assert_eq!(player.traits, 1 << 7);
        player.note_change("current_ability", 130);
        player.note_change("potential_ability", 160);
        player.note_change("position.dc", 19);
        player.note_change("attribute.finishing", 18);
        player.note_change("contract.transfer_listed", 1);
        player.note_change("contract.expires", 20290630);
        assert_eq!(player.attributes[crate::filter::player_attribute("finishing").unwrap()], 18);
        assert!(player.transfer_listed && !player.loan_listed);
        assert_eq!((player.current_ability, player.potential_ability), (130, 160));
        assert_eq!(player.positions, ["dc", "st"]);
        assert_eq!(player.contract_expires, Some(FmDate { year: 2029, month: 6, day: 30 }));
        player.note_change("position.st", 10);
        assert_eq!(player.positions, ["dc"]);
    }

    #[test]
    fn keys_are_unique() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        for entity in [Entity::Player, Entity::Staff, Entity::Club, Entity::Nation, Entity::Official] {
            let mut keys: Vec<String> = fields(&layout, entity).into_iter().map(|f| f.key).collect();
            let all = keys.len();
            keys.sort();
            keys.dedup();
            assert_eq!(keys.len(), all, "{entity}");
        }
    }
}
