//! A person's relations: a player's secondary nationalities and homegrown ties, and the people and clubs a player or
//! member of staff favours and dislikes.
//!
//! The game keeps a person's relations as one list, the first field of the record his `relations` pointer leads to
//! (see [`RelationLayout`]): 16-byte entries that each point at a nation, club, person or competition and say how he
//! is tied to it. A secondary nationality is a tie of kind 9 to a nation; a training is one of kind 70 to a nation or
//! 72 to a club, whose value is the homegrown rule it meets. His first nationality is not among them: it is the
//! player's `nation` field.
//!
//! The editor reads those three kinds of tie. It points one at another nation or club, gives a training another
//! rule, takes one out, or adds one. Like the squad lists, the list is as long as the game made it and the editor
//! allocates nothing: a tie is added only where the list's block has room (see [`HeapLayout`]), which most players'
//! lists lack, so changing one of his ties is the way to give him another.
//!
//! A preference, favoured or disliked, can be given another strength, pointed at another club or person, or taken out,
//! the human manager's too. Pointing one elsewhere writes only its target: the entry's bytes `0x08` and `0x0D`, which
//! are not decoded, stay as the game left them. Adding one waits until they are known.
//!
//! [`HeapLayout`]: crate::profile::HeapLayout
//! [`RelationLayout`]: crate::profile::RelationLayout

use fmlens_mem::is_user_pointer;
use serde::{Deserialize, Serialize};

use crate::clubs::ClubSummary;
use crate::edit::Entity;
use crate::players::{Nation, PlayerSummary, nation_name};
use crate::session::Session;
use crate::staff::StaffSummary;
use crate::text::read_fm_string;
use crate::transfer::{MoveError, Patch, Patches};

/// The longest list of relations the editor reads; on the test save the longest held 42.
const MOST_RELATIONS: u64 = 256;

/// The game's codes for the kinds of target.
const CLUB: u8 = 1;
const PERSON: u8 = 3;
const NATION: u8 = 8;

/// The game's code for a club's rivalry with another club.
const RIVAL: u8 = 5;

/// The strengths the editor writes for a preference: all but one of the 41,131 on the validation career were 1 to 100.
pub const MOST_STRENGTH: i8 = 100;

/// The homegrown rules the editor writes, by the game's code: 15–21, 0–21, 15–21 excluding loans, and 0–19 for a
/// year. The game has others, which the editor shows but does not write.
pub const HOMEGROWN_RULES: [u8; 4] = [1, 2, 5, 10];

/// The ties the editor reads and writes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Tie {
    /// A secondary nationality.
    Nationality,
    /// A nation he was trained in.
    TrainedInNation,
    /// A club he was trained at.
    TrainedAtClub,
}

impl Tie {
    const ALL: [Tie; 3] = [Tie::Nationality, Tie::TrainedInNation, Tie::TrainedAtClub];

    /// The kind of target and the kind of relation the game codes it with.
    fn codes(self) -> (u8, u8) {
        match self {
            Tie::Nationality => (NATION, 9),
            Tie::TrainedInNation => (NATION, 70),
            Tie::TrainedAtClub => (CLUB, 72),
        }
    }

    /// Whether its value is a homegrown rule.
    fn is_training(self) -> bool {
        self != Tie::Nationality
    }
}

/// What a tie points at.
#[derive(Debug, Clone, Copy)]
pub enum TieTarget<'a> {
    Nation(&'a Nation),
    Club(&'a ClubSummary),
}

impl TieTarget<'_> {
    fn uid(&self) -> u32 {
        match self {
            TieTarget::Nation(nation) => nation.uid.unwrap_or(0),
            TieTarget::Club(club) => club.uid,
        }
    }

    fn name(&self) -> String {
        match self {
            TieTarget::Nation(nation) => nation.name.clone(),
            TieTarget::Club(club) => club.name.clone(),
        }
    }
}

/// One of a player's ties.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Relation {
    /// Where it is in his list of relations.
    pub index: usize,
    pub tie: Tie,
    /// The nation or club.
    #[serde(skip)]
    pub target: u64,
    /// The UID of the nation or club.
    pub target_uid: u32,
    /// The name of the nation or club.
    pub name: Option<String>,
    /// For a training, the homegrown rule it meets.
    pub rule: Option<u8>,
}

/// The kinds of preference the editor can read from a person's relation list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PreferenceKind {
    FavouredPerson,
    DislikedPerson,
    FavouredClub,
    DislikedClub,
}

impl PreferenceKind {
    fn from_codes(target: u8, relation: u8) -> Option<Self> {
        match (target, relation) {
            (PERSON, 1) => Some(Self::FavouredPerson),
            (PERSON, 2) => Some(Self::DislikedPerson),
            (CLUB, 3) => Some(Self::FavouredClub),
            (CLUB, 4) => Some(Self::DislikedClub),
            _ => None,
        }
    }

    fn is_club(self) -> bool {
        matches!(self, Self::FavouredClub | Self::DislikedClub)
    }
}

/// A person's or club's place in a player's or member of staff's preferences.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preference {
    /// Where it is in the person's complete relation list.
    pub index: usize,
    pub kind: PreferenceKind,
    #[serde(skip)]
    pub target: u64,
    /// The database UID shared by player, staff and club records.
    pub target_uid: u32,
    /// Club names can be read directly. Person names are resolved by the caller's player/staff indexes.
    pub name: Option<String>,
    /// The preference strength stored by the game. Signed: one favoured club on the test career holds -35 beside a
    /// dislike of the same club at 35.
    pub strength: i8,
}

/// A club or nation another is related to: a rival, with how strong the rivalry is, or a club it has a link
/// with. Read-only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Related {
    pub uid: u32,
    pub name: Option<String>,
    /// How strong a rivalry is, 0 to 100; `None` for a link.
    pub strength: Option<u8>,
}

/// A change to a player's ties, worked out from the game as it is now and ready to be written.
#[derive(Debug, Clone)]
pub struct RelationPlan {
    pub player: u32,
    /// The tie before and after: none before for one added, none after for one taken out.
    pub before: Option<Relation>,
    pub after: Option<Relation>,
    patches: Vec<Patch>,
}

/// A change to a player's ties that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct RelationSet {
    pub player: u32,
    pub before: Option<Relation>,
    pub after: Option<Relation>,
    patches: Vec<Patch>,
}

/// Who or what a preference is pointed at: a club for a favoured or disliked club, a player or member of staff for a
/// favoured or disliked person.
#[derive(Debug, Clone, Copy)]
pub enum PreferenceTarget<'a> {
    Club(&'a ClubSummary),
    Person(PersonRef<'a>),
}

/// A person whose lists the editor changes: a player, or a member of staff, the human manager included.
#[derive(Debug, Clone, Copy)]
pub enum PersonRef<'a> {
    Player(&'a PlayerSummary),
    Staff(&'a StaffSummary),
}

impl PersonRef<'_> {
    pub(crate) fn uid(&self) -> u32 {
        match self {
            PersonRef::Player(player) => player.uid,
            PersonRef::Staff(member) => member.uid,
        }
    }

    pub(crate) fn entity(&self) -> Entity {
        match self {
            PersonRef::Player(_) => Entity::Player,
            PersonRef::Staff(_) => Entity::Staff,
        }
    }
}

/// A change to a person's preferences, worked out from the game as it is now and ready to be written.
#[derive(Debug, Clone)]
pub struct PreferencePlan {
    pub entity: Entity,
    pub person: u32,
    /// The preference before and after: none after for one taken out.
    pub before: Preference,
    pub after: Option<Preference>,
    patches: Vec<Patch>,
}

/// A change to a person's preferences that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct PreferenceSet {
    pub entity: Entity,
    pub person: u32,
    pub before: Preference,
    pub after: Option<Preference>,
    patches: Vec<Patch>,
}

/// A player's list of relations, as read.
struct RelationList {
    header: u64,
    begin: u64,
    end: u64,
    capacity: u64,
    /// The bytes of each entry.
    entries: Vec<Vec<u8>>,
}

impl Session {
    /// The ties of `player`: his secondary nationalities, and the nations and clubs he was trained in.
    pub fn relations(&self, player: &PlayerSummary) -> Result<Vec<Relation>, MoveError> {
        let Some(list) = self.relation_list(player)? else {
            return Ok(Vec::new());
        };
        Ok(list.entries.iter().enumerate().filter_map(|(index, entry)| self.tie_at(index, entry)).collect())
    }

    /// The player's favoured and disliked people and clubs. This is deliberately read-only until the relation codes
    /// and game behavior have passed native write, save and reload validation.
    pub fn preferences(&self, player: &PlayerSummary) -> Result<Vec<Preference>, MoveError> {
        let Some(list) = self.relation_list(player)? else {
            return Ok(Vec::new());
        };
        Ok(list.entries.iter().enumerate().filter_map(|(index, entry)| self.preference_at(index, entry)).collect())
    }

    /// The favoured and disliked people and clubs of the member of staff `member`, read-only like a player's. Empty
    /// where the layout does not place his relations.
    pub fn staff_preferences(&self, member: &StaffSummary) -> Result<Vec<Preference>, MoveError> {
        let Some(list) = self.staff_relation_list(member)? else {
            return Ok(Vec::new());
        };
        Ok(list.entries.iter().enumerate().filter_map(|(index, entry)| self.preference_at(index, entry)).collect())
    }

    /// The clubs `club` is a rival of, strongest first, with how strong each rivalry is (0 to 100). Empty where the
    /// layout does not place a club's relations.
    pub fn club_rivals(&self, club: &ClubSummary) -> Result<Vec<Related>, MoveError> {
        let c = &self.layout.club;
        let Some(relations) = c.relations else {
            return Ok(Vec::new());
        };
        if self.process.read_u32(club.address + c.uid)? != club.uid {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        let r = &self.layout.relation;
        let list = self.relation_list_at(club.address + relations)?;
        let mut rivals: Vec<Related> = list
            .entries
            .iter()
            .filter(|entry| entry[r.target_kind as usize] == CLUB && entry[r.relation as usize] == RIVAL)
            .filter_map(|entry| {
                let target = u64::from_le_bytes(entry[r.target as usize..r.target as usize + 8].try_into().ok()?);
                let mut tie = self.club_tie(target)?;
                tie.strength = Some(entry[r.value as usize]);
                Some(tie)
            })
            .filter(|tie| tie.uid != club.uid)
            .collect();
        rivals.sort_by_key(|rival| std::cmp::Reverse(rival.strength));
        Ok(rivals)
    }

    /// The clubs `club` has links with (affiliations), in the game's order. Empty where the layout does not place
    /// them.
    pub fn club_links(&self, club: &ClubSummary) -> Result<Vec<Related>, MoveError> {
        let c = &self.layout.club;
        let (Some(links), Some(link_club)) = (c.links, c.link_club) else {
            return Ok(Vec::new());
        };
        if self.process.read_u32(club.address + c.uid)? != club.uid {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        let words = self.process.read_bytes(club.address + links, 24)?;
        let word = |i: usize| u64::from_le_bytes(words[i * 8..i * 8 + 8].try_into().expect("8 bytes"));
        let (begin, end, capacity) = (word(0), word(1), word(2));
        if begin == end {
            return Ok(Vec::new());
        }
        let sane = is_user_pointer(begin)
            && begin < end
            && end <= capacity
            && (end - begin).is_multiple_of(8)
            && end - begin <= 8 * MOST_RELATIONS;
        if !sane {
            return Err(MoveError::NotListed);
        }
        let bytes = self.process.read_bytes(begin, (end - begin) as usize)?;
        let mut seen = Vec::new();
        let mut ties = Vec::new();
        for word in bytes.chunks(8) {
            let link = u64::from_le_bytes(word.try_into().expect("8 bytes"));
            if !is_user_pointer(link) {
                continue;
            }
            let Ok(other) = self.process.read_u64(link + link_club) else {
                continue;
            };
            // The game also links a club with its own men's or women's side, which carries its name: not an affiliate.
            let own_side = |tie: &Related| tie.uid == club.uid || tie.name.as_deref() == Some(club.name.as_str());
            if let Some(tie) = self.club_tie(other).filter(|tie| !own_side(tie) && !seen.contains(&tie.uid)) {
                seen.push(tie.uid);
                ties.push(tie);
            }
        }
        Ok(ties)
    }

    /// The club at `address`, when it looks like one: its UID and name.
    fn club_tie(&self, address: u64) -> Option<Related> {
        if !is_user_pointer(address) {
            return None;
        }
        let c = &self.layout.club;
        let uid = self.process.read_u32(address + c.uid).ok()?;
        let name = self.process.read_u64(address + c.name).ok().and_then(|text| read_fm_string(&self.process, text));
        name.is_some().then_some(Related { uid, name, strength: None })
    }

    /// How many more ties the list of `player` has room for.
    pub fn relation_room(&self, player: &PlayerSummary) -> Result<usize, MoveError> {
        match self.relation_list(player)? {
            Some(list) => self.room(&list),
            None => Ok(0),
        }
    }

    /// Works out pointing the tie at `index` in the list of `player` at another nation or club, and giving a training
    /// another rule; what is left out stays. Nothing is written.
    pub fn plan_relation_change(
        &self,
        player: &PlayerSummary,
        index: usize,
        target: Option<TieTarget>,
        rule: Option<u8>,
    ) -> Result<RelationPlan, MoveError> {
        let r = &self.layout.relation;
        let list = self.relation_list(player)?.ok_or(MoveError::NoRelation { index })?;
        let before = list.entries.get(index).and_then(|entry| self.tie_at(index, entry));
        let before = before.ok_or(MoveError::NoRelation { index })?;
        let address = list.begin + index as u64 * r.size;
        let mut after = before.clone();
        let mut patches = Patches::default();
        if let Some(target) = target {
            after.target = self.tie_target(player, before.tie, target)?;
            after.target_uid = target.uid();
            after.name = Some(target.name());
            patches.push(address + r.target, before.target.to_le_bytes(), after.target.to_le_bytes());
        }
        if let Some(rule) = rule {
            let old = before.rule.ok_or(MoveError::UnknownRule { rule })?;
            if !HOMEGROWN_RULES.contains(&rule) {
                return Err(MoveError::UnknownRule { rule });
            }
            after.rule = Some(rule);
            patches.push(address + r.value, [old], [rule]);
        }
        if patches.0.is_empty() || self.relations(player)?.iter().any(|tie| tie.index != index && same(tie, &after)) {
            return Err(MoveError::SameRelation);
        }
        Ok(RelationPlan { player: player.uid, before: Some(before), after: Some(after), patches: patches.0 })
    }

    /// Works out taking the tie at `index` out of the list of `player`: the entries after it move up one. Nothing is
    /// written.
    pub fn plan_relation_removal(&self, player: &PlayerSummary, index: usize) -> Result<RelationPlan, MoveError> {
        let list = self.relation_list(player)?.ok_or(MoveError::NoRelation { index })?;
        let before = list.entries.get(index).and_then(|entry| self.tie_at(index, entry));
        let before = before.ok_or(MoveError::NoRelation { index })?;
        let patches = removal(list.header, list.begin, &list.entries, index);
        Ok(RelationPlan { player: player.uid, before: Some(before), after: None, patches })
    }

    /// Works out giving the preference at `index` in the list of `owner` the strength `strength`, 1 to 100. Nothing is
    /// written.
    pub fn plan_preference_strength(
        &self,
        owner: PersonRef,
        index: usize,
        strength: i8,
    ) -> Result<PreferencePlan, MoveError> {
        let r = &self.layout.relation;
        let (list, before) = self.preference_in(owner, index)?;
        if !(1..=MOST_STRENGTH).contains(&strength) {
            let max = i64::from(MOST_STRENGTH);
            return Err(MoveError::OutOfRange { field: "strength", value: strength.into(), min: 1, max });
        }
        let mut patches = Patches::default();
        let address = list.begin + index as u64 * r.size + r.value;
        patches.push(address, before.strength.to_le_bytes(), strength.to_le_bytes());
        if patches.0.is_empty() {
            return Err(MoveError::SameRelation);
        }
        let after = Preference { strength, ..before.clone() };
        let (entity, person) = (owner.entity(), owner.uid());
        Ok(PreferencePlan { entity, person, before, after: Some(after), patches: patches.0 })
    }

    /// Works out pointing the preference at `index` in the list of `owner` at `target`, a club for a club's and a
    /// person for a person's, keeping its strength and the rest of the entry. Nothing is written.
    pub fn plan_preference_target(
        &self,
        owner: PersonRef,
        index: usize,
        target: PreferenceTarget,
    ) -> Result<PreferencePlan, MoveError> {
        let r = &self.layout.relation;
        let (list, before) = self.preference_in(owner, index)?;
        let (address, target_uid, name) = self.preference_target(before.kind, target)?;
        if matches!(target, PreferenceTarget::Person(person) if person.uid() == owner.uid()) {
            return Err(MoveError::PreferenceTarget);
        }
        let taken = list.entries.iter().enumerate().any(|(other, entry)| {
            other != index && self.preference_at(other, entry).is_some_and(|known| known.target == address)
        });
        if address == before.target || taken {
            return Err(MoveError::SamePreference);
        }
        let mut patches = Patches::default();
        let at = list.begin + index as u64 * r.size + r.target;
        patches.push(at, before.target.to_le_bytes(), address.to_le_bytes());
        let after = Preference { target: address, target_uid, name, ..before.clone() };
        let (entity, person) = (owner.entity(), owner.uid());
        Ok(PreferencePlan { entity, person, before, after: Some(after), patches: patches.0 })
    }

    /// The address a preference of `kind` keeps for `target`, checked, with its UID and, for a club, its name. A club
    /// is its record; a person is his identity block, which holds the UID where a club's record does.
    fn preference_target(
        &self,
        kind: PreferenceKind,
        target: PreferenceTarget,
    ) -> Result<(u64, u32, Option<String>), MoveError> {
        let (p, st) = (&self.layout.player, &self.layout.staff);
        let (address, uid, name) = match (kind.is_club(), target) {
            (true, PreferenceTarget::Club(club)) => (club.address, club.uid, Some(club.name.clone())),
            (false, PreferenceTarget::Person(PersonRef::Player(player))) => {
                (player.address + p.identity() + player.shift, player.uid, None)
            }
            (false, PreferenceTarget::Person(PersonRef::Staff(member))) => {
                (member.address + st.identity() + member.shift, member.uid, None)
            }
            _ => return Err(MoveError::PreferenceTarget),
        };
        if !is_user_pointer(address) || self.process.read_u32(address + self.layout.club.uid)? != uid {
            return Err(MoveError::PreferenceTarget);
        }
        Ok((address, uid, name))
    }

    /// Works out taking the preference at `index` out of the list of `owner`: the entries after it move up one.
    /// Nothing is written.
    pub fn plan_preference_removal(&self, owner: PersonRef, index: usize) -> Result<PreferencePlan, MoveError> {
        let (list, before) = self.preference_in(owner, index)?;
        let patches = removal(list.header, list.begin, &list.entries, index);
        Ok(PreferencePlan { entity: owner.entity(), person: owner.uid(), before, after: None, patches })
    }

    /// Writes a planned change to a person's preferences, each write over the bytes it expects, after checking them
    /// all.
    pub fn apply_preference(&self, plan: &PreferencePlan) -> Result<PreferenceSet, MoveError> {
        self.apply_patches(&plan.patches)?;
        let PreferencePlan { entity, person, ref before, ref after, ref patches } = *plan;
        Ok(PreferenceSet { entity, person, before: before.clone(), after: after.clone(), patches: patches.clone() })
    }

    /// Puts the preferences back as they were, provided the list still holds what the change wrote.
    pub fn undo_preference(&self, done: &PreferenceSet) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// The list of relations of `owner` and the preference at `index` in it.
    fn preference_in(&self, owner: PersonRef, index: usize) -> Result<(RelationList, Preference), MoveError> {
        let list = match owner {
            PersonRef::Player(player) => self.relation_list(player)?,
            PersonRef::Staff(member) => self.staff_relation_list(member)?,
        };
        let list = list.ok_or(MoveError::NotInList { index })?;
        let before = list.entries.get(index).and_then(|entry| self.preference_at(index, entry));
        let before = before.ok_or(MoveError::NotInList { index })?;
        Ok((list, before))
    }

    /// Works out adding a tie of `tie` to `target` to the list of `player`, with the homegrown rule `rule` for a
    /// training, where the list's block has room. Nothing is written.
    pub fn plan_relation_add(
        &self,
        player: &PlayerSummary,
        tie: Tie,
        target: TieTarget,
        rule: Option<u8>,
    ) -> Result<RelationPlan, MoveError> {
        let r = &self.layout.relation;
        let list = self.relation_list(player)?.ok_or(MoveError::RelationsFull)?;
        let rule = match (tie.is_training(), rule) {
            (true, Some(rule)) if HOMEGROWN_RULES.contains(&rule) => Some(rule),
            (false, None) => None,
            (_, rule) => return Err(MoveError::UnknownRule { rule: rule.unwrap_or(0) }),
        };
        let after = Relation {
            index: list.entries.len(),
            tie,
            target: self.tie_target(player, tie, target)?,
            target_uid: target.uid(),
            name: Some(target.name()),
            rule,
        };
        if self.relations(player)?.iter().any(|known| same(known, &after)) {
            return Err(MoveError::SameRelation);
        }
        if self.room(&list)? == 0 {
            return Err(MoveError::RelationsFull);
        }
        // A new entry as the game writes one: a nationality's strength of 100 and 80, or a training's rule.
        let mut entry = vec![0u8; r.size as usize];
        entry[r.target as usize..r.target as usize + 8].copy_from_slice(&after.target.to_le_bytes());
        let (kind, relation) = tie.codes();
        entry[r.target_kind as usize] = kind;
        entry[r.relation as usize] = relation;
        let value = r.value as usize;
        (entry[value], entry[value + 1]) = match rule {
            Some(rule) => (rule, 0xFF),
            None => (0x64, 0x50),
        };
        entry[r.size as usize - 1] = 0xFF;

        let mut patches = Patches::default();
        let slot = self.process.read_bytes(list.end, r.size as usize)?;
        patches.push(list.end, slot, entry);
        let end = list.end + r.size;
        let header = [list.end.to_le_bytes(), list.capacity.to_le_bytes()].concat();
        patches.push(list.header + 8, header, [end.to_le_bytes(), list.capacity.max(end).to_le_bytes()].concat());
        Ok(RelationPlan { player: player.uid, before: None, after: Some(after), patches: patches.0 })
    }

    /// Writes a planned change to a player's ties, each write over the bytes it expects, after checking them all.
    pub fn apply_relation(&self, plan: &RelationPlan) -> Result<RelationSet, MoveError> {
        self.apply_patches(&plan.patches)?;
        let RelationPlan { player, ref before, ref after, ref patches } = *plan;
        Ok(RelationSet { player, before: before.clone(), after: after.clone(), patches: patches.clone() })
    }

    /// Puts the ties back as they were, provided the list still holds what the change wrote.
    pub fn undo_relation(&self, done: &RelationSet) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// The list of relations of `player`, or `None` for a player without a record of them.
    fn relation_list(&self, player: &PlayerSummary) -> Result<Option<RelationList>, MoveError> {
        let p = &self.layout.player;
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        let header = self.process.read_u64(player.address + p.at(p.relations, player.shift))?;
        if !is_user_pointer(header) {
            return Ok(None);
        }
        self.relation_list_at(header).map(Some)
    }

    /// The list of relations of the member of staff `member`, or `None` for one without a record of them or where the
    /// layout does not place it.
    fn staff_relation_list(&self, member: &StaffSummary) -> Result<Option<RelationList>, MoveError> {
        let st = &self.layout.staff;
        let Some(relations) = st.relations else {
            return Ok(None);
        };
        if self.process.read_u32(member.address + st.at(st.uid, member.shift))? != member.uid {
            return Err(MoveError::Moved { uid: member.uid });
        }
        let header = self.process.read_u64(member.address + st.at(relations, member.shift))?;
        if !is_user_pointer(header) {
            return Ok(None);
        }
        self.relation_list_at(header).map(Some)
    }

    /// The list of relations whose `(begin, end, capacity)` header is at `header`.
    fn relation_list_at(&self, header: u64) -> Result<RelationList, MoveError> {
        let size = self.layout.relation.size;
        let words = self.process.read_bytes(header, 24)?;
        let word = |i: usize| u64::from_le_bytes(words[i * 8..i * 8 + 8].try_into().expect("8 bytes"));
        let (begin, end, capacity) = (word(0), word(1), word(2));
        if begin == 0 && end == 0 && capacity == 0 {
            return Ok(RelationList { header, begin, end, capacity, entries: Vec::new() });
        }
        let sane = is_user_pointer(begin)
            && begin <= end
            && end <= capacity
            && (end - begin).is_multiple_of(size)
            && (capacity - begin).is_multiple_of(size)
            && capacity - begin <= size * MOST_RELATIONS;
        if !sane {
            return Err(MoveError::NotListed);
        }
        let bytes = self.process.read_bytes(begin, (end - begin) as usize)?;
        let entries = bytes.chunks(size as usize).map(<[u8]>::to_vec).collect();
        Ok(RelationList { header, begin, end, capacity, entries })
    }

    /// The tie `entry` at `index` is, or `None` for a relation of another kind.
    fn tie_at(&self, index: usize, entry: &[u8]) -> Option<Relation> {
        let r = &self.layout.relation;
        let codes = (entry[r.target_kind as usize], entry[r.relation as usize]);
        let tie = Tie::ALL.into_iter().find(|tie| tie.codes() == codes)?;
        let target = u64::from_le_bytes(entry[r.target as usize..r.target as usize + 8].try_into().ok()?);
        if !is_user_pointer(target) {
            return None;
        }
        let (target_uid, name) = if tie == Tie::TrainedAtClub {
            let name = self.process.read_u64(target + self.layout.club.name).ok();
            (self.layout.club.uid, name.and_then(|text| read_fm_string(&self.process, text)))
        } else {
            (self.layout.nation.uid, nation_name(&self.process, &self.layout, target))
        };
        let target_uid = self.process.read_u32(target + target_uid).ok()?;
        let rule = tie.is_training().then_some(entry[r.value as usize]);
        Some(Relation { index, tie, target, target_uid, name, rule })
    }

    fn preference_at(&self, index: usize, entry: &[u8]) -> Option<Preference> {
        let r = &self.layout.relation;
        let kind = PreferenceKind::from_codes(entry[r.target_kind as usize], entry[r.relation as usize])?;
        let target = u64::from_le_bytes(entry[r.target as usize..r.target as usize + 8].try_into().ok()?);
        if !is_user_pointer(target) {
            return None;
        }
        // All four database targets checked here use the common entity UID at +0x0c. Name lookup differs by kind.
        let target_uid = self.process.read_u32(target + self.layout.club.uid).ok()?;
        let name = kind
            .is_club()
            .then(|| self.process.read_u64(target + self.layout.club.name).ok())
            .flatten()
            .and_then(|text| read_fm_string(&self.process, text));
        Some(Preference { index, kind, target, target_uid, name, strength: entry[r.value as usize] as i8 })
    }

    /// How many more entries the block of `list` holds: up to its capacity, or to the end of the allocator's block
    /// when its size is known and nothing has been written past the capacity.
    fn room(&self, list: &RelationList) -> Result<usize, MoveError> {
        if list.begin == 0 {
            return Ok(0);
        }
        let mut free = list.capacity - list.end;
        if let Some(block) = self.layout.heap.block_size(list.capacity - list.begin) {
            let spare = self.process.read_bytes(list.capacity, (list.begin + block - list.capacity) as usize)?;
            if spare.iter().all(|&b| b == 0) {
                free = list.begin + block - list.end;
            }
        }
        Ok((free / self.layout.relation.size) as usize)
    }

    /// The address of `target`, checked: one of the game's nations or clubs, as `tie` takes. A secondary nationality
    /// cannot be the player's first one.
    fn tie_target(&self, player: &PlayerSummary, tie: Tie, target: TieTarget) -> Result<u64, MoveError> {
        let p = &self.layout.player;
        match (tie, target) {
            (Tie::Nationality | Tie::TrainedInNation, TieTarget::Nation(nation)) => {
                let first = self.process.read_u64(player.address + p.at(p.nation, player.shift))?;
                let same_class = is_user_pointer(first)
                    && is_user_pointer(nation.address)
                    && self.process.read_u64(first)? == self.process.read_u64(nation.address)?;
                let uid = self.process.read_u32(nation.address + self.layout.nation.uid)?;
                if !same_class || Some(uid) != nation.uid {
                    return Err(MoveError::WrongTarget);
                }
                if tie == Tie::Nationality && nation.address == first {
                    return Err(MoveError::SameRelation);
                }
                Ok(nation.address)
            }
            (Tie::TrainedAtClub, TieTarget::Club(club)) => {
                if self.process.read_u32(club.address + self.layout.club.uid)? != club.uid {
                    return Err(MoveError::WrongTarget);
                }
                Ok(club.address)
            }
            _ => Err(MoveError::WrongTarget),
        }
    }
}

/// Whether two ties say the same: the same kind, to the same nation or club, under the same rule.
fn same(a: &Relation, b: &Relation) -> bool {
    a.tie == b.tie && a.target == b.target && a.rule == b.rule
}

/// The writes that take the entry at `index` out of the `(begin, end, capacity)` list whose header is at `header`, its
/// entries `entries` from `begin`. As in a squad list: the list repeats its last entry for a moment, then ends one
/// earlier and clears it.
pub(crate) fn removal(header: u64, begin: u64, entries: &[Vec<u8>], index: usize) -> Vec<Patch> {
    let size = entries[index].len() as u64;
    let last = entries.len() - 1;
    let end = begin + entries.len() as u64 * size;
    let mut patches = Patches::default();
    patches.push(begin + index as u64 * size, entries[index..last].concat(), entries[index + 1..].concat());
    patches.push(header + 8, end.to_le_bytes(), (end - size).to_le_bytes());
    patches.push(begin + last as u64 * size, entries[last].clone(), vec![0; size as usize]);
    patches.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removal_moves_the_later_entries_up_and_clears_the_last() {
        let entries = vec![vec![1u8; 8], vec![2; 8], vec![3; 8]];
        let (end, shorter) = (0x1018u64.to_le_bytes(), 0x1010u64.to_le_bytes());

        let mut first = Patches::default();
        first.push(0x1000, [[1u8; 8], [2; 8]].concat(), [[2u8; 8], [3; 8]].concat());
        first.push(0x108, end, shorter);
        first.push(0x1010, [3u8; 8], [0u8; 8]);
        assert_eq!(removal(0x100, 0x1000, &entries, 0), first.0);

        // The last entry: nothing moves up.
        let mut last = Patches::default();
        last.push(0x108, end, shorter);
        last.push(0x1010, [3u8; 8], [0u8; 8]);
        assert_eq!(removal(0x100, 0x1000, &entries, 2), last.0);
    }
}
