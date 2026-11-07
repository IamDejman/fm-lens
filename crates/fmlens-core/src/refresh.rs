//! Notify FM's UI after a successful edit; never advances simulation or reapplies an edit.

use std::sync::Mutex;

use fmlens_mem::{
    call::{Arg, Program, Step},
    is_user_pointer,
};

use crate::rtti::class_of;
use crate::transfer::MoveError;
use crate::{Entity, Session, Target};

/// Earlier helpers cannot advertise their allowlist. Remember only explicit, zero-execution
/// refusals of optional refresh functions, independently; never hide a timeout or guard error.
#[derive(Default)]
pub(crate) struct OptionalRefresh(Mutex<Vec<u64>>);

impl OptionalRefresh {
    fn run(&self, function: u64, call: impl FnOnce() -> Result<(), MoveError>) -> Result<bool, MoveError> {
        let mut unsupported = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if unsupported.contains(&function) {
            return Ok(false);
        }
        match call() {
            Ok(()) => Ok(true),
            Err(MoveError::Memory(fmlens_mem::Error::BridgeUnsupported { .. })) => {
                unsupported.push(function);
                Ok(false)
            }
            Err(error) => Err(error),
        }
    }
}

/// The class of the game's UI object and its virtual slot that `entity_changed` fills: MSVC lays the slots out 8 bytes
/// sooner than the Itanium C++ ABI.
#[cfg(target_os = "macos")]
const GAME_UI_CLASS: &str = "N11game_plugin7GAME_UIE";
#[cfg(target_os = "macos")]
const ENTITY_CHANGED_SLOT: u64 = 0xA0;
#[cfg(windows)]
const GAME_UI_CLASS: &str = ".?AVGAME_UI@game_plugin@@";
#[cfg(windows)]
const ENTITY_CHANGED_SLOT: u64 = 0x98;

impl Session {
    /// Refresh entire active views after a contract change. FM's transfer UI uses the same rfui
    /// message with an empty entity vector. The dispatcher owns screen-reference lifetimes and
    /// supplies the game's default options; no editor context or navigation is synthesized.
    pub fn refresh_views(&self) -> Result<bool, MoveError> {
        let Some(function) = self.profile.as_ref().and_then(|p| p.calls.as_ref()).and_then(|c| c.refresh_views) else {
            return Ok(false);
        };
        if !self.helper_supports(function)? {
            return Ok(false);
        }
        // A reference vector is three pointers (begin/end/capacity), as initialized by 0x43FE850.
        // The zeroed scratch holds an empty vector, read synchronously by 0x2FC20 / 0x77DB60.
        // The 16 bytes of options come after it in two registers on macOS; Windows passes them by address.
        let mut program = Program::new();
        #[cfg(target_os = "macos")]
        program.push(Step::new(function, &[Arg::scratch(0), Arg::value(0), Arg::value(0)]));
        #[cfg(windows)]
        program.push(Step::new(function, &[Arg::scratch(0), Arg::scratch(0x20)]));
        self.refresh_support.run(function, || self.call_game(&program).map(|_| ()))
    }

    /// Refresh views of an entity after Apply or Undo. False means this build has no traced notifier.
    /// Failure does not undo the already successful data write.
    pub fn refresh_entity(&self, target: &Target) -> Result<bool, MoveError> {
        let Some(profile) = self.profile.as_ref() else { return Ok(false) };
        let (Some(slot), Some(function)) = (profile.game_ui, profile.calls.as_ref().and_then(|c| c.entity_changed))
        else {
            return Ok(false);
        };
        if !self.helper_supports(function)? {
            return Ok(false);
        }
        if let Some(lock) = self.structure_lock() {
            return Err(MoveError::Locked(lock));
        }
        self.check_uid(target).map_err(|_| MoveError::Moved { uid: target.uid })?;
        let ui = self.process.read_u64(self.plugin.base + slot)?;
        if !is_user_pointer(ui) || class_of(&self.process, &self.plugin, ui).as_deref() != Some(GAME_UI_CLASS) {
            return Err(MoveError::CallUnavailable);
        }
        let table = self.process.read_u64(ui)?;
        if self.process.read_u64(table + ENTITY_CHANGED_SLOT)? != self.plugin.base + function {
            return Err(MoveError::CallUnavailable);
        }
        // Player and staff identities differ from their person blocks. Use the established layout, including
        // player-coaches and human-manager shifts; the primary staff vtable's last virtual base is not its identity.
        let table = self.process.read_u64(target.address)?;
        if !self.plugin.contains(table) {
            return Err(MoveError::Moved { uid: target.uid });
        }
        let offset = match target.entity {
            Entity::Player => self.layout.player.at(self.layout.player.identity(), target.shift),
            Entity::Staff => self.layout.staff.at(self.layout.staff.identity(), target.shift),
            #[cfg(target_os = "macos")]
            Entity::Official => self.process.read_u64(table - 0x18)?,
            // MSVC's vtables keep no offset to the identity, and it has not been traced for officials.
            #[cfg(windows)]
            Entity::Official => return Ok(false),
            // Clubs and nations inherit IDENTITY directly: their primary vtables have the same reference getter
            // at +0x88 (0x11B3D1C) that the notifier uses through 0x1B23A8.
            Entity::Club | Entity::Nation => 0,
        };
        if offset > 0x1000 {
            return Err(MoveError::CallUnavailable);
        }
        let identity = target.address + offset;
        if !is_user_pointer(identity) {
            return Err(MoveError::CallUnavailable);
        }
        let mut program = Program::new();
        program.push(Step::new(function, &[Arg::value(ui), Arg::value(identity)]));
        self.refresh_support.run(function, || self.call_game(&program).map(|_| ()))
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn older_helpers_skip_only_the_refused_refresh_and_keep_other_calls_working() {
        let support = OptionalRefresh::default();
        let refused = || Err(MoveError::Memory(fmlens_mem::Error::BridgeUnsupported { pid: 1 }));
        assert!(!support.run(100, refused).unwrap());
        assert!(!support.run(100, || panic!("must not retry a known unsupported notifier")).unwrap());
        assert!(support.run(200, || Ok(())).unwrap(), "independent view refresh still works");
    }

    #[test]
    fn refresh_errors_are_reported_and_do_not_disable_the_function() {
        let support = OptionalRefresh::default();
        for error in [
            fmlens_mem::Error::Bridge { pid: 1, reason: "timed out; it may have run" },
            fmlens_mem::Error::NoBridge { pid: 1 },
            fmlens_mem::Error::ReadOnly,
        ] {
            assert!(support.run(100, || Err(MoveError::Memory(error))).is_err());
            assert!(support.run(100, || Ok(())).unwrap());
        }
        assert!(support.run(100, || Err(MoveError::Moved { uid: 1 })).is_err());
        assert!(support.run(100, || Ok(())).unwrap());
    }
}
