//! Renaming a club. The game keeps one copy of a name's text and counts who holds it: two clubs called "Arsenal Club"
//! point at the same text, so writing over it would rename both. A club is renamed by giving it text of its own
//! instead: the new name is placed in memory the game sets aside for it, laid out as the game lays a name out, and the
//! club is pointed at it. The old text is left as it was, for whoever else holds it.
//!
//! A club holds its full name once. Its short name is held twice: by the club, and by the game's list of clubs by UID,
//! which its screens name a club from. Both are pointed at the new text.
//!
//! The game names clubs afresh from its database whenever a save is loaded, so the new names are also kept in a file
//! of name changes the game reads when it starts: see [`crate::name_file`].

use fmlens_mem::{is_user_pointer, regions};

use crate::clubs::ClubSummary;
use crate::name_file::{KeptNames, NameFile};
use crate::session::Session;
use crate::text::read_fm_string;
use crate::transfer::{MoveError, Patch, Patches};

/// The most characters a name takes.
pub const MOST_NAME_CHARS: usize = 50;

/// How many holders the new text is said to have. The game frees text when its last holder lets go, with its own
/// allocator, which never gave this text out: with this many it is never the last.
const HOLDERS: u32 = 0x4000_0000;

/// The most holders text the game made is believed to have; more means the layout does not fit.
const MOST_HOLDERS: u32 = 1_000_000;

/// The bytes read at a time when looking for the game's list of clubs.
const CHUNK: u64 = 8 << 20;

/// A club's names changed: what the log shows, and what undoing it takes.
#[derive(Debug, Clone)]
pub struct ClubRenamed {
    pub club: u32,
    /// The full name before and after, where it changed.
    pub name: Option<(String, String)>,
    /// The short name before and after, where it changed.
    pub short_name: Option<(String, String)>,
    patches: Vec<Patch>,
    /// The names the file of name changes gave the club before.
    kept_before: Option<KeptNames>,
}

/// `text` as a name is written: without the spaces around it, or none when it is no name, being empty, longer than
/// [`MOST_NAME_CHARS`] or holding something that is not text, such as a line break, or a quote, which the file of name
/// changes has no way to hold.
pub fn as_name(text: &str) -> Option<&str> {
    let name = text.trim();
    let fits = (1..=MOST_NAME_CHARS).contains(&name.chars().count());
    (fits && !name.chars().any(|c| c.is_control() || c == '"')).then_some(name)
}

fn name_file_error(err: std::io::Error) -> MoveError {
    match err.kind() {
        // Only macOS's App Management keeps FM Lens out of a folder the user can allow it into.
        std::io::ErrorKind::PermissionDenied if cfg!(target_os = "macos") => MoveError::NameFileBlocked,
        _ => MoveError::NameFile(err.to_string()),
    }
}

/// The record of a name as the game lays one out, and where in it the pointer to the name points: the record's size,
/// a gap, the count of holders, the length, the text and a zero byte, in a whole number of 8 bytes.
fn name_record(name: &str, holders_before: u64) -> (Vec<u8>, usize) {
    let size = holders_before as usize + 4 + name.len() + 1;
    let mut record = Vec::with_capacity(8 + size.next_multiple_of(8));
    record.extend_from_slice(&(size as u32).to_le_bytes());
    record.extend_from_slice(&[0; 4]);
    // The count ends where the length begins, however far before it the layout puts its start.
    record.resize(8 + holders_before as usize - 4, 0);
    record.extend_from_slice(&HOLDERS.to_le_bytes());
    let pointer = record.len();
    record.extend_from_slice(&(name.len() as u32).to_le_bytes());
    record.extend_from_slice(name.as_bytes());
    record.resize(8 + size.next_multiple_of(8), 0);
    (record, pointer)
}

/// The name the file keeps for one of a club's names, and the name the game gives it without the file, once the club
/// is given `new` (none leaves it as it is): `kept` and `was` are what the file held, `now` the name the club has. The
/// game's own name is what the club has where the file gave it none. Given the game's own name back, the file keeps
/// none.
fn keep_name(
    new: Option<&str>,
    kept: Option<String>,
    was: Option<String>,
    now: &str,
) -> (Option<String>, Option<String>) {
    let Some(new) = new else {
        return (kept, was);
    };
    let was = if kept.is_some() { was } else { Some(now.to_owned()) };
    if was.as_deref() == Some(new) { (None, None) } else { (Some(new.to_owned()), was) }
}

/// The names the game gives a club without FM Lens's file, where the file gives it others.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameNames {
    pub name: Option<String>,
    pub short_name: Option<String>,
}

/// `text` as a name, where there is text.
fn checked(text: Option<&str>) -> Result<Option<&str>, MoveError> {
    text.map(|text| as_name(text).ok_or(MoveError::BadName)).transpose()
}

impl Session {
    /// Whether clubs can be renamed here: the layout places what a name's text needs, the game is open for writing,
    /// and its file of name changes has a place.
    pub fn renames_clubs(&self) -> bool {
        self.layout.club_names.is_some() && self.process.can_write() && self.name_file().is_some()
    }

    fn name_file(&self) -> Option<NameFile> {
        NameFile::find(&self.game.exe_path)
    }

    /// Gives `club` the full name `name` and the short name `short_name`, each where one is given and differs from
    /// the one it has. The club must still be the one the row was read from and hold the names the row says.
    pub fn rename_club(
        &self,
        club: &ClubSummary,
        name: Option<&str>,
        short_name: Option<&str>,
    ) -> Result<ClubRenamed, MoveError> {
        let n = self.layout.club_names.as_ref().ok_or(MoveError::CallUnavailable)?;
        let file = self.name_file().ok_or(MoveError::CallUnavailable)?;
        let c = &self.layout.club;
        if self.process.read_u32(club.address + c.uid)? != club.uid {
            return Err(MoveError::Changed { address: club.address + c.uid });
        }
        let name = checked(name)?.filter(|&name| name != club.name);
        let short_name = checked(short_name)?.filter(|&short| Some(short) != club.short_name.as_deref());
        if name.is_none() && short_name.is_none() {
            return Err(MoveError::SameName);
        }

        // Every place to point at new text, with the text it holds now.
        let mut slots = Vec::new();
        if let Some(name) = name {
            let slot = club.address + c.name;
            slots.push((slot, self.held_name(slot, &club.name, n.holders)?, name));
        }
        if let Some(short) = short_name {
            let slot = club.address + c.short_name;
            let was = club.short_name.as_deref().ok_or(MoveError::CallUnavailable)?;
            let old = self.held_name(slot, was, n.holders)?;
            let listed = self.listed_name(old, club, n.listed_uid).ok_or(MoveError::CallUnavailable)?;
            slots.push((slot, old, short));
            slots.push((listed, old, short));
        }

        // One piece of the game's memory for the new text; a name given twice (the club's and the list's) is one text.
        let mut texts: Vec<(&str, usize)> = Vec::new();
        let mut bytes = Vec::new();
        for &(_, _, text) in &slots {
            if !texts.iter().any(|&(known, _)| known == text) {
                let (record, pointer) = name_record(text, n.holders);
                texts.push((text, bytes.len() + pointer));
                bytes.extend(record);
            }
        }
        if let Some(lock) = self.structure_lock() {
            return Err(MoveError::Locked(lock));
        }

        // The file first, given back what it held if the game's memory is not changed.
        let kept_before = file.kept(club.uid).map_err(name_file_error)?;
        let before = kept_before.clone().unwrap_or_default();
        let (name_kept, was_name) = keep_name(name, before.name, before.was_name, &club.name);
        let (short_kept, was_short) = match club.short_name.as_deref() {
            Some(now) => keep_name(short_name, before.short_name, before.was_short_name, now),
            None => (before.short_name, before.was_short_name),
        };
        let kept = KeptNames { name: name_kept, short_name: short_kept, was_name, was_short_name: was_short };
        file.keep(club.uid, Some(&kept)).map_err(name_file_error)?;
        let patches = self.place_names(&slots, &texts, &bytes).inspect_err(|_| {
            // Nothing in the game changed; should the file not go back, its names show from the next start.
            let _ = file.keep(club.uid, kept_before.as_ref());
        })?;
        let renamed = |now: Option<&str>, was: Option<&str>| Some((was?.to_owned(), now?.to_owned()));
        Ok(ClubRenamed {
            club: club.uid,
            name: renamed(name, Some(&club.name)),
            short_name: renamed(short_name, club.short_name.as_deref()),
            patches,
            kept_before,
        })
    }

    /// Places the texts `bytes` holds in the game's memory and points each slot at its text.
    fn place_names(
        &self,
        slots: &[(u64, u64, &str)],
        texts: &[(&str, usize)],
        bytes: &[u8],
    ) -> Result<Vec<Patch>, MoveError> {
        let base = self.process.allocate(bytes.len())?;
        self.process.write_bytes(base, bytes)?;
        if self.process.read_bytes(base, bytes.len())? != bytes {
            return Err(MoveError::NotApplied { address: base });
        }
        let mut patches = Patches::default();
        for &(slot, old, text) in slots {
            let at = texts.iter().find(|&&(known, _)| known == text).expect("every text was placed").1;
            patches.push(slot, old.to_le_bytes(), (base + at as u64).to_le_bytes());
        }
        self.apply_patches(&patches.0)?;
        Ok(patches.0)
    }

    /// The names the game gives the club `uid` without FM Lens's file, where the file gives it others and they are
    /// known; none where there are none.
    pub fn game_club_names(&self, uid: u32) -> Result<Option<GameNames>, MoveError> {
        let Some(kept) = self.name_file().map(|file| file.kept(uid)).transpose().map_err(name_file_error)?.flatten()
        else {
            return Ok(None);
        };
        let names =
            GameNames { name: kept.name.and(kept.was_name), short_name: kept.short_name.and(kept.was_short_name) };
        Ok((names.name.is_some() || names.short_name.is_some()).then_some(names))
    }

    /// Points the club back at the names it had, provided it still holds the ones the rename gave it, and has the file
    /// of name changes give it what it gave before.
    pub fn undo_club_rename(&self, done: &ClubRenamed) -> Result<(), MoveError> {
        let file = self.name_file().ok_or(MoveError::CallUnavailable)?;
        let kept = file.kept(done.club).map_err(name_file_error)?;
        file.keep(done.club, done.kept_before.as_ref()).map_err(name_file_error)?;
        self.undo_patches(&done.patches).inspect_err(|_| {
            let _ = file.keep(done.club, kept.as_ref());
        })
    }

    /// The pointer `slot` holds, to the text `expected`, counted as the game counts its text's holders.
    fn held_name(&self, slot: u64, expected: &str, holders_before: u64) -> Result<u64, MoveError> {
        let pointer = self.process.read_u64(slot)?;
        // A name's pointer is to its length, which follows the count: 4 bytes into an 8-byte step.
        if !is_user_pointer(pointer.wrapping_sub(holders_before)) {
            return Err(MoveError::CallUnavailable);
        }
        if read_fm_string(&self.process, pointer).as_deref() != Some(expected) {
            return Err(MoveError::Changed { address: slot });
        }
        let holders = self.process.read_u32(pointer - holders_before)?;
        if !(1..=MOST_HOLDERS).contains(&holders) && holders != HOLDERS {
            return Err(MoveError::CallUnavailable);
        }
        Ok(pointer)
    }

    /// Where the game's list of clubs by UID holds the short name `pointer` for `club`: the one place in the game's
    /// data that holds the pointer with the club's UID after it. None when there is no such place, or more than one.
    fn listed_name(&self, pointer: u64, club: &ClubSummary, uid_after: u64) -> Option<u64> {
        let own = club.address..club.address + self.layout.club.end();
        let needle = pointer.to_le_bytes();
        let mut found = None;
        for region in regions(&self.process, 0x1_0000, 0x7FFF_FFFF_0000).into_iter().filter(|r| r.holds_data()) {
            let mut offset = 0;
            while offset < region.size {
                let base = region.base + offset;
                let len = (region.size - offset).min(CHUNK);
                offset += CHUNK;
                let Ok(chunk) = self.process.read_bytes(base, len as usize) else {
                    continue;
                };
                for (i, word) in chunk.as_chunks::<8>().0.iter().enumerate() {
                    if *word != needle {
                        continue;
                    }
                    let slot = base + (i * 8) as u64;
                    if own.contains(&slot) || self.process.read_u32(slot + uid_after).ok() != Some(club.uid) {
                        continue;
                    }
                    if found.replace(slot).is_some() {
                        return None;
                    }
                }
            }
        }
        found
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_is_trimmed_text_of_one_to_fifty_characters() {
        assert_eq!(as_name("  Methil Rovers "), Some("Methil Rovers"));
        assert_eq!(as_name("Köln"), Some("Köln"));
        assert_eq!(as_name(""), None);
        assert_eq!(as_name("   "), None);
        assert_eq!(as_name("Methil\nRovers"), None);
        assert_eq!(as_name("The \"Rovers\""), None);
        assert_eq!(as_name(&"é".repeat(50)), Some("é".repeat(50).as_str()));
        assert_eq!(as_name(&"a".repeat(51)), None);
    }

    #[test]
    fn the_file_keeps_a_new_name_until_the_game_s_own_is_given_back() {
        let s = |text: &str| Some(text.to_owned());
        // A first rename notes the name the club had as the game's own.
        assert_eq!(keep_name(Some("Leven"), None, None, "Ipswich"), (s("Leven"), s("Ipswich")));
        // A second keeps the game's own name from the first.
        assert_eq!(keep_name(Some("Methil"), s("Leven"), s("Ipswich"), "Leven"), (s("Methil"), s("Ipswich")));
        // The game's own name given back leaves the file nothing to keep.
        assert_eq!(keep_name(Some("Ipswich"), s("Leven"), s("Ipswich"), "Leven"), (None, None));
        // A name left as it is stays as the file had it.
        assert_eq!(keep_name(None, s("Leven"), s("Ipswich"), "Leven"), (s("Leven"), s("Ipswich")));
        // A file that never noted the game's own name has none to give back.
        assert_eq!(keep_name(Some("Methil"), s("Leven"), None, "Leven"), (s("Methil"), None));
    }

    #[test]
    fn a_name_record_is_laid_out_as_the_game_lays_one_out() {
        // "Arsenal Kazanlak" in the game: size 25, the count, length 16, the text, a zero byte; 40 bytes in all.
        let (record, pointer) = name_record("Arsenal Kazanlak", 4);
        assert_eq!(record.len(), 40);
        assert_eq!(pointer, 12);
        assert_eq!(record[..4], 25u32.to_le_bytes());
        assert_eq!(record[8..12], HOLDERS.to_le_bytes());
        assert_eq!(record[12..16], 16u32.to_le_bytes());
        assert_eq!(&record[16..32], b"Arsenal Kazanlak");
        assert!(record[32..].iter().all(|&byte| byte == 0));
        // The pointer sits as the game's do: 4 bytes into an 8-byte step, so the count before it is aligned.
        assert_eq!(pointer % 8, 4);
        // Text in more bytes than characters is counted in bytes.
        let (record, pointer) = name_record("Köln", 4);
        assert_eq!(record[pointer..pointer + 4], 5u32.to_le_bytes());
    }
}
