//! Changing values in the game: which fields can be written, where they live and
//! which values they take. Every write re-checks whose object it lands in, follows
//! pointers only to records that point back or check out, refuses a value the field
//! cannot hold, refuses to touch a field whose current value does not look like one
//! (the layout would not fit), and reads the value back afterwards.

use std::fmt;
use std::ops::RangeInclusive;

use fmlibre_mem::is_user_pointer;
use serde::{Deserialize, Serialize};

use crate::clubs::{ClubSummary, finances_look_real};
use crate::date::FmDate;
use crate::details::{PERSONALITY, POSITIONS};
use crate::players::PlayerSummary;
use crate::profile::Layout;
use crate::session::Session;
use crate::staff::StaffSummary;

/// The kind of object a field belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Entity {
    Player,
    Staff,
    Club,
}

impl fmt::Display for Entity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Entity::Player => "player",
            Entity::Staff => "staff",
            Entity::Club => "club",
        })
    }
}

/// How a value is stored.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    U8,
    U16,
    I16,
    I32,
    /// A `u16` day of the year (flags above bit 8) and a `u16` year. Values are numbers
    /// like 20290630; 0 is a date the game has not set.
    Date,
}

impl Kind {
    pub fn size(self) -> usize {
        match self {
            Kind::U8 => 1,
            Kind::U16 | Kind::I16 => 2,
            Kind::I32 | Kind::Date => 4,
        }
    }

    pub(crate) fn decode(self, bytes: &[u8]) -> i64 {
        let u16_at = |i: usize| u16::from_le_bytes([bytes[i], bytes[i + 1]]);
        match self {
            Kind::U8 => i64::from(bytes[0]),
            Kind::U16 => i64::from(u16_at(0)),
            Kind::I16 => i64::from(u16_at(0) as i16),
            Kind::I32 => i64::from(i32::from_le_bytes(bytes[..4].try_into().expect("4 bytes"))),
            Kind::Date => FmDate::from_raw(u16_at(0), u16_at(2)).map_or(0, FmDate::to_number),
        }
    }

    /// The bytes of `value`, which must fit the kind, written over `old`: a date keeps
    /// the flags the game keeps next to its day.
    pub(crate) fn encode(self, value: i64, old: &[u8]) -> Vec<u8> {
        const FITS: &str = "checked against the field's range";
        match self {
            Kind::U8 => vec![u8::try_from(value).expect(FITS)],
            Kind::U16 => u16::try_from(value).expect(FITS).to_le_bytes().to_vec(),
            Kind::I16 => i16::try_from(value).expect(FITS).to_le_bytes().to_vec(),
            Kind::I32 => i32::try_from(value).expect(FITS).to_le_bytes().to_vec(),
            Kind::Date => {
                let date = FmDate::from_number(value).expect(FITS);
                let flags = u16::from_le_bytes([old[0], old[1]]) & !0x1FF;
                [(flags | date.day_of_year()).to_le_bytes(), date.year.to_le_bytes()].concat()
            }
        }
    }
}

/// How the game shows a stored value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Scale {
    /// As stored.
    Plain,
    /// Stored 0–100, shown 1–20 (see [`crate::Attribute`]).
    Attribute,
}

impl Scale {
    /// The value the game shows for `stored`.
    pub fn shown(self, stored: i64) -> i64 {
        match self {
            Scale::Plain => stored,
            Scale::Attribute => ((stored + 2) / 5).clamp(1, 20),
        }
    }

    /// A stored value the game shows as `shown`: the middle of the values it rounds to it.
    pub fn stored(self, shown: i64) -> i64 {
        match self {
            Scale::Plain => shown,
            Scale::Attribute => shown * 5,
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
            place: Place::Object,
            offset,
            shifted: false,
            plausible: range,
        }
    }

    fn attribute(mut self) -> Self {
        self.scale = Scale::Attribute;
        self
    }

    /// Accepts stored values in `plausible` as the game's own, beyond the ones the editor writes.
    fn plausible(mut self, plausible: RangeInclusive<i64>) -> Self {
        self.plausible = plausible;
        self
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
    }
}

/// A wage in pounds per week, and a contract end between 2000 and 2100.
fn contract_fields(layout: &Layout, entity: Entity) -> [Field; 2] {
    let c = &layout.contract;
    [
        Field::new(entity, "contract.wage", c.wage, Kind::I32, 0..=10_000_000)
            .plausible(0..=i64::from(i32::MAX))
            .in_record(Place::Contract),
        Field::new(entity, "contract.expires", c.expires, Kind::Date, 20000101..=21001231)
            .plausible(0..=22001231)
            .in_record(Place::Contract),
    ]
}

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
        field("reputation.home", p.home_reputation, Kind::U16, 0..=10_000),
        field("reputation.current", p.current_reputation, Kind::U16, 0..=10_000),
        field("reputation.world", p.world_reputation, Kind::U16, 0..=10_000),
        field("international.caps", p.international_caps, Kind::U16, 0..=1_000),
        field("international.goals", p.international_goals, Kind::U16, 0..=1_000),
        field("international.u21_caps", p.u21_caps, Kind::U8, 0..=255),
        field("international.u21_goals", p.u21_goals, Kind::U8, 0..=255),
    ];
    out.extend(crate::ATTRIBUTE_GROUPS.iter().flat_map(|(_, keys)| keys.iter()).filter_map(|key| {
        let offset = *p.attributes.get(*key)?;
        Some(field(&format!("attribute.{key}"), offset, Kind::U8, 1..=100).plausible(0..=100).attribute())
    }));
    // The game no longer plays a sweeper: every player rates 1 there, so it is not offered.
    out.extend(
        POSITIONS.iter().enumerate().filter(|&(_, &key)| key != "sw").map(|(i, key)| {
            field(&format!("position.{key}"), p.positions + i as u64, Kind::U8, 1..=20).plausible(0..=20)
        }),
    );
    out.extend(PERSONALITY.iter().enumerate().map(|(i, key)| {
        field(&format!("personality.{key}"), p.personality + i as u64, Kind::U8, 1..=20).plausible(0..=20)
    }));
    out.extend(contract_fields(layout, Entity::Player));
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
    vec![
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
    ]
}

/// The object an edit lands in, as found when the lists were read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Target {
    pub entity: Entity,
    pub uid: u32,
    pub address: u64,
    /// The object's person-block shift; 0 for clubs.
    pub shift: u64,
}

impl PlayerSummary {
    pub fn target(&self) -> Target {
        Target { entity: Entity::Player, uid: self.uid, address: self.address, shift: self.shift }
    }

    /// Brings the fields a list row shows up to date after `field` was set to `value`.
    pub fn note_change(&mut self, field: &str, value: i64) {
        match field {
            "current_ability" => self.current_ability = value as u16,
            "potential_ability" => self.potential_ability = value as i16,
            "contract.expires" => self.contract_expires = FmDate::from_number(value),
            _ => {
                let position = field.strip_prefix("position.").and_then(|key| POSITIONS.iter().position(|&k| k == key));
                if let Some(i) = position {
                    self.position_ratings[i] = value as u8;
                    self.positions = crate::players::natural_positions(&self.position_ratings);
                }
            }
        }
    }
}

impl StaffSummary {
    pub fn target(&self) -> Target {
        Target { entity: Entity::Staff, uid: self.uid, address: self.address, shift: self.shift }
    }

    /// Brings the fields a list row shows up to date after `field` was set to `value`.
    pub fn note_change(&mut self, field: &str, value: i64) {
        match field {
            "current_ability" => self.current_ability = value as u16,
            "potential_ability" => self.potential_ability = value as i16,
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
    Memory(fmlibre_mem::Error),
}

impl fmt::Display for EditError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EditError::UnknownField { entity, key } => write!(f, "{entity} has no editable field {key}"),
            EditError::OutOfRange { field, value, min, max } => {
                write!(f, "{value} is not a valid {field}; it takes {min} to {max}")
            }
            EditError::NotADate { field, value } => write!(f, "{value} is not a date for {field}"),
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
            EditError::Memory(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for EditError {}

impl From<fmlibre_mem::Error> for EditError {
    fn from(err: fmlibre_mem::Error) -> Self {
        EditError::Memory(err)
    }
}

impl Session {
    /// The fields of `entity` the editor can change.
    pub fn fields(&self, entity: Entity) -> Vec<Field> {
        fields(&self.layout, entity)
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
        Ok(field.kind.decode(&self.process.read_bytes(address, field.kind.size())?))
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
                out.push(Some(field.kind.decode(&object[local(field)..])));
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
                    Some(field.kind.decode(&bytes))
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

    /// Like [`Session::write_field`], but only while the game still holds `expected`:
    /// otherwise nothing is written and the error is a [`EditError::Conflict`].
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
        let allowed = if restoring { field.is_plausible(value) } else { (field.min..=field.max).contains(&value) };
        if !allowed {
            return Err(EditError::OutOfRange { field: field.key.clone(), value, min: field.min, max: field.max });
        }
        if field.kind == Kind::Date && FmDate::from_number(value).is_none() {
            return Err(EditError::NotADate { field: field.key.clone(), value });
        }
        self.check_target(target, field)?;
        let address = self.locate(target, field)?.ok_or_else(|| EditError::NoRecord { field: field.key.clone() })?;
        let old_bytes = self.process.read_bytes(address, field.kind.size())?;
        let old = field.kind.decode(&old_bytes);
        if let Some(expected) = expected
            && old != expected
        {
            return Err(EditError::Conflict { field: field.key.clone(), expected, found: old });
        }
        if !field.is_plausible(old) {
            return Err(EditError::Implausible { field: field.key.clone(), value: old });
        }
        if field.kind == Kind::Date && old == 0 {
            return Err(EditError::Unset { field: field.key.clone() });
        }
        let change = Change { entity: target.entity, uid: target.uid, field: field.key.clone(), old, new: value };
        if old == value {
            return Ok(change);
        }
        self.process.write_bytes(address, &field.kind.encode(value, &old_bytes))?;
        let read = field.kind.decode(&self.process.read_bytes(address, field.kind.size())?);
        if read != value {
            // Best effort: put back what was there.
            let _ = self.process.write_bytes(address, &old_bytes);
            return Err(EditError::NotApplied { field: field.key.clone(), wrote: value, read });
        }
        Ok(change)
    }

    /// Undoes `change`, provided the game still holds the value it wrote.
    pub fn revert(&self, target: &Target, change: &Change) -> Result<Change, EditError> {
        let field = self.field(target.entity, &change.field)?;
        self.write(target, &field, change.old, Some(change.new), true)
    }

    fn check_target(&self, target: &Target, field: &Field) -> Result<(), EditError> {
        if field.entity != target.entity {
            return Err(EditError::UnknownField { entity: target.entity, key: field.key.clone() });
        }
        self.check_uid(target)
    }

    /// Checks that the object at the target's address still carries the target's UID.
    fn check_uid(&self, target: &Target) -> Result<(), EditError> {
        let uid_offset = match target.entity {
            Entity::Player => self.layout.player.at(self.layout.player.uid, target.shift),
            Entity::Staff => self.layout.staff.at(self.layout.staff.uid, target.shift),
            Entity::Club => self.layout.club.uid,
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
                let (contract, person_block) = match target.entity {
                    Entity::Player => (self.layout.player.contract, self.layout.player.person_block),
                    _ => (self.layout.staff.contract, self.layout.staff.person_block),
                };
                // Both the pointer and the person block it must point back at move with the shift.
                let Some(record) = pointer(contract + target.shift)? else {
                    return Ok(None);
                };
                let owner = self.process.read_u64(record + self.layout.contract.owner)?;
                (owner == target.address + person_block + target.shift).then_some(record)
            }
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
            _ => None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_round_trip() {
        let old = [0u8; 4];
        for (kind, value) in
            [(Kind::U8, 200), (Kind::U16, 10_000), (Kind::I16, -95), (Kind::I16, 200), (Kind::I32, -1_500_000)]
        {
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
    }

    #[test]
    fn field_tables_cover_the_layout() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        let players = fields(&layout, Entity::Player);
        // Every position but the sweeper, and the contract's wage and end.
        assert_eq!(players.len(), 10 + layout.player.attributes.len() + POSITIONS.len() - 1 + PERSONALITY.len() + 2);
        assert!(!players.iter().any(|f| f.key == "position.sw"));
        let staff = fields(&layout, Entity::Staff);
        let staff_attributes = layout.staff.attributes.len() + layout.staff.ratings.len();
        assert_eq!(staff.len(), 5 + staff_attributes + PERSONALITY.len() + 2);
        let clubs = fields(&layout, Entity::Club);
        assert_eq!(clubs.len(), 10);

        let key = |list: &[Field], key: &str| list.iter().find(|f| f.key == key).cloned().expect(key);
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
            address: 0,
            shift: 0,
        };
        player.note_change("current_ability", 130);
        player.note_change("potential_ability", 160);
        player.note_change("position.dc", 19);
        player.note_change("attribute.finishing", 90); // not on the row
        player.note_change("contract.expires", 20290630);
        assert_eq!((player.current_ability, player.potential_ability), (130, 160));
        assert_eq!(player.positions, ["dc", "st"]);
        assert_eq!(player.contract_expires, Some(FmDate { year: 2029, month: 6, day: 30 }));
        player.note_change("position.st", 10);
        assert_eq!(player.positions, ["dc"]);
    }

    #[test]
    fn keys_are_unique() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        for entity in [Entity::Player, Entity::Staff, Entity::Club] {
            let mut keys: Vec<String> = fields(&layout, entity).into_iter().map(|f| f.key).collect();
            let all = keys.len();
            keys.sort();
            keys.dedup();
            assert_eq!(keys.len(), all, "{entity}");
        }
    }
}
