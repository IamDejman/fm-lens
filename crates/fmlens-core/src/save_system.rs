//! Which save the game has loaded.
//!
//! The game keeps one `SAVE_SYSTEM` object, which a static points at and the build profile places
//! ([`BuildProfile::save_system`]). It holds the loaded save's name as the game's own string: the file's name without
//! its folder or `.fm`. The name follows Save As at once, and a load from its start.
//!
//! [`BuildProfile::save_system`]: crate::profile::BuildProfile::save_system

use fmlens_mem::is_user_pointer;

use crate::rtti::class_of;
use crate::session::Session;
use crate::text::read_fm_string;

/// The name the compiler keeps for the class: MSVC's on Windows, the Itanium C++ ABI's on macOS.
#[cfg(windows)]
const CLASS: &str = ".?AVSAVE_SYSTEM@@";
#[cfg(target_os = "macos")]
const CLASS: &str = "11SAVE_SYSTEM";

impl Session {
    /// The name of the save the game has loaded, as FM lists it; `None` where the build does not place the record,
    /// what the static points at is not one, or the name is empty or not text (a career never saved, say).
    pub fn save_name(&self) -> Option<String> {
        let at = self.layout.save_system.as_ref()?.name;
        let slot = self.profile.as_ref()?.save_system?;
        let record = self.process.read_u64(self.plugin.base + slot).ok().filter(|&at| is_user_pointer(at))?;
        if class_of(&self.process, &self.plugin, record)? != CLASS {
            return None;
        }
        // The game's strings sit four bytes into their blocks, so this pointer is not on an eight-byte boundary.
        let name = self.process.read_u64(record + at).ok()?;
        read_fm_string(&self.process, name).filter(|name| is_save_name(name))
    }
}

/// Whether `name` could name a save file: some text, with nothing a file's name cannot hold.
fn is_save_name(name: &str) -> bool {
    !name.trim().is_empty() && !name.chars().any(|c| c.is_control() || matches!(c, '/' | '\\' | '\u{FFFD}'))
}

#[cfg(test)]
mod tests {
    use super::is_save_name;

    #[test]
    fn a_save_name_is_text_a_file_could_be_called() {
        assert!(is_save_name("FM-Lens-SaveName-2026-11-15"));
        assert!(is_save_name("Ayo Elu - Arsenal (v02)"));
        assert!(!is_save_name(""));
        assert!(!is_save_name("   "));
        assert!(!is_save_name("games\\Arsenal"));
        assert!(!is_save_name("Arsenal\u{0}"));
    }
}
