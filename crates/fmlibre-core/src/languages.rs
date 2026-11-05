//! The languages a player or member of staff speaks, read-only.
//!
//! A person keeps a list of pointers to small links, each naming a language and how well he speaks it, 0 to 10 (see
//! [`LanguageLayout`]). His native language is usually not among them: the list is the languages he has besides it.
//!
//! [`LanguageLayout`]: crate::profile::LanguageLayout

use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::players::PlayerSummary;
use crate::session::Session;
use crate::staff::StaffSummary;
use crate::text::read_fm_string;
use crate::transfer::MoveError;

/// The longest list the editor reads; nobody on the test save spoke more than seven.
const MOST_LANGUAGES: u64 = 32;

/// The highest level the game gives.
const TOP_LEVEL: u64 = 10;

/// One language a person speaks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Language {
    pub name: Option<String>,
    /// How well he speaks it, 0 to 10.
    pub level: u8,
}

impl Session {
    /// The languages `player` speaks besides, usually, his native one. Empty where the layout does not place them.
    pub fn player_languages(&self, player: &PlayerSummary) -> Result<Vec<Language>, MoveError> {
        let Some(l) = self.layout.language.as_ref() else {
            return Ok(Vec::new());
        };
        let p = &self.layout.player;
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        self.languages_at(player.address + p.at(l.player, player.shift))
    }

    /// The languages the member of staff `member` speaks besides, usually, his native one.
    pub fn staff_languages(&self, member: &StaffSummary) -> Result<Vec<Language>, MoveError> {
        let Some(l) = self.layout.language.as_ref() else {
            return Ok(Vec::new());
        };
        let s = &self.layout.staff;
        if self.process.read_u32(member.address + s.at(s.uid, member.shift))? != member.uid {
            return Err(MoveError::Moved { uid: member.uid });
        }
        self.languages_at(member.address + s.at(l.staff, member.shift))
    }

    /// The languages of the list whose `(begin, end, capacity)` header is at `header`.
    fn languages_at(&self, header: u64) -> Result<Vec<Language>, MoveError> {
        let l = self.layout.language.as_ref().expect("checked by the caller");
        let words = self.process.read_bytes(header, 24)?;
        let word = |i: usize| u64::from_le_bytes(words[i * 8..i * 8 + 8].try_into().expect("8 bytes"));
        let (begin, end, capacity) = (word(0), word(1), word(2));
        if begin == end {
            return Ok(Vec::new());
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
        let mut languages = Vec::new();
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
            languages.push(Language { name, level: level as u8 });
        }
        Ok(languages)
    }
}
