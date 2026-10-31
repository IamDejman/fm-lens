//! Changing values in the game: which fields can be written, where they live and
//! which values they take. Every write re-checks whose object it lands in, refuses a
//! value the field cannot hold, refuses to touch a field whose current value does not
//! look like one (the layout would not fit), and reads the value back afterwards.

use std::fmt;
use std::ops::RangeInclusive;

use serde::{Deserialize, Serialize};

use crate::details::{PERSONALITY, POSITIONS};
use crate::players::PlayerSummary;
use crate::profile::{Layout, PlayerLayout, StaffLayout};
use crate::session::Session;
use crate::staff::StaffSummary;

/// The kind of object a field belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Entity {
    Player,
    Staff,
}

impl fmt::Display for Entity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Entity::Player => "player",
            Entity::Staff => "staff",
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
}

impl Kind {
    pub fn size(self) -> usize {
        match self {
            Kind::U8 => 1,
            Kind::U16 | Kind::I16 => 2,
        }
    }

    fn decode(self, bytes: &[u8]) -> i64 {
        match self {
            Kind::U8 => i64::from(bytes[0]),
            Kind::U16 => i64::from(u16::from_le_bytes([bytes[0], bytes[1]])),
            Kind::I16 => i64::from(i16::from_le_bytes([bytes[0], bytes[1]])),
        }
    }

    /// The bytes of `value`, which must fit the kind.
    fn encode(self, value: i64) -> Vec<u8> {
        match self {
            Kind::U8 => vec![u8::try_from(value).expect("checked against the field's range")],
            Kind::U16 => u16::try_from(value).expect("checked against the field's range").to_le_bytes().to_vec(),
            Kind::I16 => i16::try_from(value).expect("checked against the field's range").to_le_bytes().to_vec(),
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

/// A value of a player or member of staff that the editor can change.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Field {
    /// E.g. `current_ability`, `attribute.finishing`, `position.st`, `personality.ambition`.
    pub key: String,
    pub entity: Entity,
    pub kind: Kind,
    pub scale: Scale,
    /// Smallest stored value the editor writes.
    pub min: i64,
    /// Largest stored value the editor writes.
    pub max: i64,
    /// Offset in the object, before any person-block shift.
    #[serde(skip)]
    offset: u64,
    /// Whether the field is in the person block and moves with its shift.
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

    fn in_person_block(mut self, person_block: u64) -> Self {
        self.shifted = self.offset >= person_block;
        self
    }

    /// Whether `value` is one this field can hold in a correctly read object.
    pub fn is_plausible(&self, value: i64) -> bool {
        self.plausible.contains(&value)
    }

    fn address(&self, target: &Target) -> u64 {
        target.address + self.offset + if self.shifted { target.shift } else { 0 }
    }
}

/// Every field of `entity` the editor can change, in display order.
pub fn fields(layout: &Layout, entity: Entity) -> Vec<Field> {
    match entity {
        Entity::Player => player_fields(&layout.player),
        Entity::Staff => staff_fields(&layout.staff),
    }
}

fn player_fields(p: &PlayerLayout) -> Vec<Field> {
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
    out.into_iter().map(|f| f.in_person_block(p.person_block)).collect()
}

fn staff_fields(s: &StaffLayout) -> Vec<Field> {
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
    out.into_iter().map(|f| f.in_person_block(s.person_block)).collect()
}

/// The object an edit lands in, as found when the lists were read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Target {
    pub entity: Entity,
    pub uid: u32,
    pub address: u64,
    /// The object's person-block shift.
    pub shift: u64,
}

impl PlayerSummary {
    pub fn target(&self) -> Target {
        Target { entity: Entity::Player, uid: self.uid, address: self.address, shift: self.shift }
    }
}

impl StaffSummary {
    pub fn target(&self) -> Target {
        Target { entity: Entity::Staff, uid: self.uid, address: self.address, shift: self.shift }
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
    /// The object no longer belongs to the person: the game has moved on.
    Moved {
        entity: Entity,
        uid: u32,
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
            EditError::Moved { entity, uid } => {
                write!(f, "the {entity} with id {uid} has moved in the game's memory; reload and try again")
            }
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
        Ok(self.read_value(target, field)?)
    }

    /// Reads every one of `fields` of `target` with a single read of the object.
    pub fn read_fields(&self, target: &Target, fields: &[Field]) -> Result<Vec<i64>, EditError> {
        for field in fields {
            if field.entity != target.entity {
                return Err(EditError::UnknownField { entity: target.entity, key: field.key.clone() });
            }
        }
        self.check_uid(target)?;
        let local = |field: &Field| (field.address(target) - target.address) as usize;
        let len = fields.iter().map(|field| local(field) + field.kind.size()).max().unwrap_or(0);
        let buf = self.process.read_bytes(target.address, len)?;
        Ok(fields.iter().map(|field| field.kind.decode(&buf[local(field)..])).collect())
    }

    /// Writes `value` (as stored) to `field` of `target` and reads it back.
    ///
    /// Nothing is written unless `value` is in the field's range, the object still
    /// belongs to the target and the field's current value is plausible. If the value
    /// read back differs, the old value is written back before the error is returned.
    pub fn write_field(&self, target: &Target, field: &Field, value: i64) -> Result<Change, EditError> {
        if !(field.min..=field.max).contains(&value) {
            return Err(EditError::OutOfRange { field: field.key.clone(), value, min: field.min, max: field.max });
        }
        self.check_target(target, field)?;
        let old = self.read_value(target, field)?;
        if !field.is_plausible(old) {
            return Err(EditError::Implausible { field: field.key.clone(), value: old });
        }
        let change = Change { entity: target.entity, uid: target.uid, field: field.key.clone(), old, new: value };
        if old == value {
            return Ok(change);
        }
        let address = field.address(target);
        self.process.write_bytes(address, &field.kind.encode(value))?;
        let read = self.read_value(target, field)?;
        if read != value {
            // Best effort: put back what was there.
            let _ = self.process.write_bytes(address, &field.kind.encode(old));
            return Err(EditError::NotApplied { field: field.key.clone(), wrote: value, read });
        }
        Ok(change)
    }

    /// Undoes `change`, provided the game still holds the value it wrote.
    pub fn revert(&self, target: &Target, change: &Change) -> Result<Change, EditError> {
        let field = self.field(target.entity, &change.field)?;
        let found = self.read_field(target, &field)?;
        if found != change.new {
            return Err(EditError::Conflict { field: field.key, expected: change.new, found });
        }
        self.write_field(target, &field, change.old)
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
        };
        if self.process.read_u32(target.address + uid_offset)? != target.uid {
            return Err(EditError::Moved { entity: target.entity, uid: target.uid });
        }
        Ok(())
    }

    fn read_value(&self, target: &Target, field: &Field) -> fmlibre_mem::Result<i64> {
        let bytes = self.process.read_bytes(field.address(target), field.kind.size())?;
        Ok(field.kind.decode(&bytes))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_round_trip() {
        for (kind, value) in [(Kind::U8, 200), (Kind::U16, 10_000), (Kind::I16, -95), (Kind::I16, 200)] {
            assert_eq!(kind.decode(&kind.encode(value)), value);
            assert_eq!(kind.encode(value).len(), kind.size());
        }
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
        // Every position but the sweeper.
        assert_eq!(players.len(), 10 + layout.player.attributes.len() + POSITIONS.len() - 1 + PERSONALITY.len());
        assert!(!players.iter().any(|f| f.key == "position.sw"));
        let staff = fields(&layout, Entity::Staff);
        let staff_attributes = layout.staff.attributes.len() + layout.staff.ratings.len();
        assert_eq!(staff.len(), 5 + staff_attributes + PERSONALITY.len());

        let key = |list: &[Field], key: &str| list.iter().find(|f| f.key == key).cloned().expect(key);
        // Before the person block: never shifted. In it: shifted.
        assert!(!key(&players, "attribute.finishing").shifted);
        assert!(key(&players, "personality.ambition").shifted);
        assert!(key(&players, "international.caps").shifted);
        assert!(!key(&staff, "current_ability").shifted);
        assert!(key(&staff, "personality.ambition").shifted);
        assert_eq!(key(&staff, "attribute.authority").scale, Scale::Plain);
        assert_eq!(key(&staff, "attribute.tactical").scale, Scale::Attribute);

        let target = Target { entity: Entity::Player, uid: 1, address: 0x1000, shift: 0xF8 };
        assert_eq!(
            key(&players, "attribute.finishing").address(&target),
            0x1000 + layout.player.attributes["finishing"]
        );
        assert_eq!(
            key(&players, "personality.adaptability").address(&target),
            0x1000 + layout.player.personality + 0xF8
        );
    }

    #[test]
    fn keys_are_unique() {
        let layout = crate::layout_for(27).expect("FM27 layout");
        for entity in [Entity::Player, Entity::Staff] {
            let mut keys: Vec<String> = fields(&layout, entity).into_iter().map(|f| f.key).collect();
            let all = keys.len();
            keys.sort();
            keys.dedup();
            assert_eq!(keys.len(), all, "{entity}");
        }
    }
}
