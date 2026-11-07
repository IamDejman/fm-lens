//! Match officials. The game keeps a list of pointers to them, whose `(begin, end, capacity)` header is a
//! static in the game plugin (see [`BuildProfile::officials`]); each is laid out as [`OfficialLayout`] places.
//!
//! [`BuildProfile::officials`]: crate::profile::BuildProfile::officials
//! [`OfficialLayout`]: crate::profile::OfficialLayout

use fmlens_mem::is_user_pointer;
use serde::Serialize;

use crate::date::FmDate;
use crate::index::Listed;
use crate::players::{nation_name, nation_uid};
use crate::rtti::class_of;
use crate::session::Session;
use crate::text::{Memo, display_name, read_name_entry};
use crate::transfer::{MoveError, PointerList};

/// The class every official is, as its vtable names it: MSVC's name on Windows, the Itanium C++ ABI's on macOS.
#[cfg(windows)]
const OFFICIAL_CLASS: &str = ".?AVOFFICIAL@db@@";
#[cfg(target_os = "macos")]
const OFFICIAL_CLASS: &str = "N2db8OFFICIALE";

/// The most officials the editor reads; the test save had 1166.
const MOST_OFFICIALS: u64 = 20_000;

/// One match official, as the officials list shows him.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialSummary {
    pub uid: u32,
    /// Where the official lives in the game, for edits.
    #[serde(skip)]
    pub address: u64,
    pub name: String,
    pub nation: Option<String>,
    /// For the nation's flag.
    pub nation_uid: Option<u32>,
    pub date_of_birth: Option<FmDate>,
    pub age: Option<u16>,
    pub current_ability: u16,
    pub potential_ability: u16,
    /// 0 to 10000.
    pub reputation: u16,
}

impl Listed for OfficialSummary {
    fn uid(&self) -> u32 {
        self.uid
    }

    fn names(&self) -> String {
        self.name.clone()
    }

    fn display_name(&self) -> &str {
        &self.name
    }

    fn rank(&self) -> i32 {
        i32::from(self.current_ability)
    }
}

impl Session {
    /// The pointers in the officials' list, the first checked to be an official. `None` where this build's profile or
    /// layout does not place them; empty where the list does not check out. Only reads memory.
    pub(crate) fn official_pointers(&self) -> Result<Option<Vec<u64>>, MoveError> {
        let (Some(_), Some(rva)) = (self.layout.official.as_ref(), self.profile.as_ref().and_then(|p| p.officials))
        else {
            return Ok(None);
        };
        let Some(list) = PointerList::read_up_to(&self.process, self.plugin.base + rva, MOST_OFFICIALS)? else {
            return Ok(Some(Vec::new()));
        };
        let pointers = list.elements(&self.process)?;
        let official = |first: u64| {
            is_user_pointer(first) && class_of(&self.process, &self.plugin, first).as_deref() == Some(OFFICIAL_CLASS)
        };
        Ok(Some(if pointers.first().is_some_and(|&first| official(first)) { pointers } else { Vec::new() }))
    }

    /// Every match official. Empty where this build's profile or layout does not place them, or the array does not
    /// check out. Only reads memory.
    pub fn officials(&self) -> Result<Vec<OfficialSummary>, MoveError> {
        let (Some(o), Some(pointers)) = (self.layout.official.as_ref(), self.official_pointers()?) else {
            return Ok(Vec::new());
        };
        let Some(&first) = pointers.first() else {
            return Ok(Vec::new());
        };
        let vtable = self.process.read_u64(first)?;
        let today = self.game_date();
        let (mut names, mut nations) = (Memo::default(), Memo::default());
        let mut officials = Vec::with_capacity(pointers.len());
        for pointer in pointers {
            if !is_user_pointer(pointer) {
                continue;
            }
            let object = self.process.read_bytes(pointer, o.size as usize)?;
            // Every official is of one class: anything else means the list is not what the profile says.
            if u64::from_le_bytes(object[0..8].try_into().expect("8 bytes")) != vtable {
                return Ok(Vec::new());
            }
            let u16_at = |offset: u64| u16::from_le_bytes([object[offset as usize], object[offset as usize + 1]]);
            let u64_at =
                |offset: u64| u64::from_le_bytes(object[offset as usize..offset as usize + 8].try_into().expect("8"));
            let uid = u32::from_le_bytes(object[o.uid as usize..o.uid as usize + 4].try_into().expect("4 bytes"));
            if uid == 0 {
                continue;
            }
            let mut part = |offset| names.get(u64_at(offset), |entry| read_name_entry(&self.process, entry));
            let (common, first, last) = (part(o.common_name), part(o.first_name), part(o.last_name));
            let nation = u64_at(o.nation);
            let date_of_birth = FmDate::from_raw(u16_at(o.date_of_birth), u16_at(o.date_of_birth + 2));
            officials.push(OfficialSummary {
                uid,
                address: pointer,
                name: display_name(common, first, last, None, uid),
                nation: nations.get(nation, |nation| nation_name(&self.process, &self.layout, nation)),
                nation_uid: nation_uid(&self.process, &self.layout, nation),
                date_of_birth,
                age: date_of_birth.zip(today).and_then(|(born, today)| born.age_on(today)),
                current_ability: u16_at(o.current_ability),
                potential_ability: u16_at(o.potential_ability),
                reputation: u16_at(o.reputation),
            });
        }
        Ok(officials)
    }
}
