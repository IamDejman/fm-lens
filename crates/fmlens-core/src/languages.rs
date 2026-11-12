//! The languages a player or member of staff speaks.
//!
//! A person keeps a list of pointers to small links, each naming a language and how well he speaks it, 0 to 10 (see
//! [`LanguageLayout`]). His native language is usually not among them: the list is the languages he has besides it.
//!
//! The editor gives a language another level, 1 to 10, or takes it out of the list; the link it pointed at stays where
//! it is, so an undo can point at it again. Adding a language needs a new link, which the editor does not allocate.
//!
//! [`LanguageLayout`]: crate::profile::LanguageLayout

use fmlens_mem::is_user_pointer;
use serde::Serialize;

use crate::edit::Entity;
use crate::players::PlayerSummary;
use crate::relations::{PersonRef, removal};
use crate::session::Session;
use crate::staff::StaffSummary;
use crate::text::read_fm_string;
use crate::transfer::{MoveError, Patch, Patches};

/// The longest list the editor reads; nobody on the test save spoke more than seven.
const MOST_LANGUAGES: u64 = 32;

/// The highest level the game gives.
const TOP_LEVEL: u64 = 10;

/// The levels the editor writes: the game's 0 to 10 was seen from 1, and a language he does not speak is taken out.
pub const LEAST_LEVEL: u8 = 1;
pub const MOST_LEVEL: u8 = TOP_LEVEL as u8;

/// One language a person speaks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Language {
    pub name: Option<String>,
    /// How well he speaks it, 0 to 10.
    pub level: u8,
    /// A main language of the country his club is in: the game raises a level set lower back on its own, within days.
    pub local: bool,
}

/// A person's list of languages, as read.
struct LanguageList {
    header: u64,
    begin: u64,
    /// The pointer to each link, and what it says.
    links: Vec<u64>,
    /// The language each link points at.
    targets: Vec<u64>,
    languages: Vec<Language>,
}

/// A change to a person's languages, worked out from the game as it is now and ready to be written.
#[derive(Debug, Clone)]
pub struct LanguagePlan {
    pub entity: Entity,
    pub person: u32,
    /// The language before and after: none after for one taken out.
    pub before: Language,
    pub after: Option<Language>,
    patches: Vec<Patch>,
}

/// A change to a person's languages that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct LanguageSet {
    pub entity: Entity,
    pub person: u32,
    pub before: Language,
    pub after: Option<Language>,
    patches: Vec<Patch>,
}

impl Session {
    /// The languages `player` speaks besides, usually, his native one. Empty where the layout does not place them.
    pub fn player_languages(&self, player: &PlayerSummary) -> Result<Vec<Language>, MoveError> {
        let p = &self.layout.player;
        let team = self.process.read_u64(player.address + p.at(p.team, player.shift)).unwrap_or(0);
        Ok(self.language_list(PersonRef::Player(player))?.map_or_else(Vec::new, |list| self.marked(list, team)))
    }

    /// The languages the member of staff `member` speaks besides, usually, his native one.
    pub fn staff_languages(&self, member: &StaffSummary) -> Result<Vec<Language>, MoveError> {
        let s = &self.layout.staff;
        let contract = self.process.read_u64(member.address + s.at(s.contract, member.shift)).unwrap_or(0);
        let team = if is_user_pointer(contract) {
            self.process.read_u64(contract + self.layout.contract.team).unwrap_or(0)
        } else {
            0
        };
        Ok(self.language_list(PersonRef::Staff(member))?.map_or_else(Vec::new, |list| self.marked(list, team)))
    }

    /// The languages of `list`, each marked where it is a main language of the country of the club whose team is
    /// `team`.
    fn marked(&self, list: LanguageList, team: u64) -> Vec<Language> {
        let spoken = self.club_country(team).map(|nation| self.main_languages(nation)).unwrap_or_default();
        let mut languages = list.languages;
        for (language, target) in languages.iter_mut().zip(&list.targets) {
            language.local = spoken.contains(target);
        }
        languages
    }

    /// The own nation of the club whose team is `team`, else the one whose league it plays in. None for a person
    /// without a club, or where the layout does not place them.
    fn club_country(&self, team: u64) -> Option<u64> {
        let c = &self.layout.club;
        let (plays_in, nation) = (c.plays_in?, c.nation?);
        if !is_user_pointer(team) {
            return None;
        }
        let club = self.process.read_u64(team + self.layout.team.club).ok().filter(|&club| is_user_pointer(club))?;
        [plays_in, nation]
            .into_iter()
            .filter_map(|offset| self.process.read_u64(club + offset).ok())
            .find(|&nation| is_user_pointer(nation))
    }

    /// Works out giving the language at `index` in the list of `person` the level `level`, 1 to 10. Nothing is
    /// written.
    pub fn plan_language_level(&self, person: PersonRef, index: usize, level: u8) -> Result<LanguagePlan, MoveError> {
        let (list, before) = self.language_in(person, index)?;
        if !(LEAST_LEVEL..=MOST_LEVEL).contains(&level) {
            let (min, max) = (i64::from(LEAST_LEVEL), i64::from(MOST_LEVEL));
            return Err(MoveError::OutOfRange { field: "level", value: level.into(), min, max });
        }
        let l = self.layout.language.as_ref().expect("a list was read");
        let mut patches = Patches::default();
        let (was, now) = (u64::from(before.level), u64::from(level));
        patches.push(list.links[index] + l.level, was.to_le_bytes(), now.to_le_bytes());
        if patches.0.is_empty() {
            return Err(MoveError::SameRelation);
        }
        let after = Language { level, ..before.clone() };
        Ok(LanguagePlan {
            entity: person.entity(),
            person: person.uid(),
            before,
            after: Some(after),
            patches: patches.0,
        })
    }

    /// Works out taking the language at `index` out of the list of `person`: the ones after it move up one. Nothing
    /// is written.
    pub fn plan_language_removal(&self, person: PersonRef, index: usize) -> Result<LanguagePlan, MoveError> {
        let (list, before) = self.language_in(person, index)?;
        let entries: Vec<Vec<u8>> = list.links.iter().map(|link| link.to_le_bytes().to_vec()).collect();
        let patches = removal(list.header, list.begin, &entries, index);
        Ok(LanguagePlan { entity: person.entity(), person: person.uid(), before, after: None, patches })
    }

    /// Writes a planned change to a person's languages, each write over the bytes it expects, after checking them all.
    pub fn apply_language(&self, plan: &LanguagePlan) -> Result<LanguageSet, MoveError> {
        self.apply_patches(&plan.patches)?;
        let LanguagePlan { entity, person, ref before, ref after, ref patches } = *plan;
        Ok(LanguageSet { entity, person, before: before.clone(), after: after.clone(), patches: patches.clone() })
    }

    /// Puts the languages back as they were, provided the list still holds what the change wrote.
    pub fn undo_language(&self, done: &LanguageSet) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// The list of languages of `person` and the language at `index` in it.
    fn language_in(&self, person: PersonRef, index: usize) -> Result<(LanguageList, Language), MoveError> {
        let list = self.language_list(person)?.ok_or(MoveError::NotInList { index })?;
        let before = list.languages.get(index).cloned().ok_or(MoveError::NotInList { index })?;
        Ok((list, before))
    }

    /// The list of languages of `person`, once his UID is where it was. None where the layout does not place it.
    fn language_list(&self, person: PersonRef) -> Result<Option<LanguageList>, MoveError> {
        let Some(l) = self.layout.language.as_ref() else {
            return Ok(None);
        };
        let header = match person {
            PersonRef::Player(player) => {
                let p = &self.layout.player;
                if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
                    return Err(MoveError::Moved { uid: player.uid });
                }
                player.address + p.at(l.player, player.shift)
            }
            PersonRef::Staff(member) => {
                let s = &self.layout.staff;
                if self.process.read_u32(member.address + s.at(s.uid, member.shift))? != member.uid {
                    return Err(MoveError::Moved { uid: member.uid });
                }
                member.address + s.at(l.staff, member.shift)
            }
        };
        self.language_list_at(header).map(Some)
    }

    /// The list of languages whose `(begin, end, capacity)` header is at `header`.
    fn language_list_at(&self, header: u64) -> Result<LanguageList, MoveError> {
        let l = self.layout.language.as_ref().expect("checked by the caller");
        let words = self.process.read_bytes(header, 24)?;
        let word = |i: usize| u64::from_le_bytes(words[i * 8..i * 8 + 8].try_into().expect("8 bytes"));
        let (begin, end, capacity) = (word(0), word(1), word(2));
        let mut list = LanguageList { header, begin, links: Vec::new(), targets: Vec::new(), languages: Vec::new() };
        if begin == end {
            return Ok(list);
        }
        let sane = is_user_pointer(begin)
            && begin < end
            && end <= capacity
            && (end - begin).is_multiple_of(8)
            && end - begin <= 8 * MOST_LANGUAGES;
        if !sane {
            return Err(MoveError::NotListed);
        }
        let bytes = self.process.read_bytes(begin, (end - begin) as usize)?;
        for word in bytes.chunks(8) {
            let link = u64::from_le_bytes(word.try_into().expect("8 bytes"));
            if !is_user_pointer(link) {
                return Err(MoveError::NotListed);
            }
            let language = self.process.read_u64(link + l.language)?;
            let level = self.process.read_u64(link + l.level)?;
            if !is_user_pointer(language) || level > TOP_LEVEL {
                return Err(MoveError::NotListed);
            }
            let name =
                self.process.read_u64(language + l.name).ok().and_then(|text| read_fm_string(&self.process, text));
            list.links.push(link);
            list.targets.push(language);
            list.languages.push(Language { name, level: level as u8, local: false });
        }
        Ok(list)
    }
}
