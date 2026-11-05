//! Edits the game makes itself.
//!
//! An injury is an object from the game's own pool, and a work permit a record the transfer
//! manager keeps and files: more than values the editor can write. For those FM Lens has the game
//! run its own functions, on its main thread, through the bridge ([`fmlibre_mem::call`]). Only on
//! macOS, and only on a build whose profile lists the functions ([`CallRvas`]).

use fmlibre_mem::call::{Arg, Outcome, Program, Step};
use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::medical::HealPlan;
use crate::players::PlayerSummary;
use crate::profile::CallRvas;
use crate::rtti::class_of;
use crate::session::Session;
use crate::text::read_fm_string;
use crate::transfer::MoveError;

/// The cause the game's own training injuries give `add_injury`.
const TRAINING_CAUSE: u64 = 3;

/// A kind of injury the game knows, as a choice for [`Session::add_injury`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InjuryKind {
    pub uid: u32,
    pub name: String,
}

/// Which edits the game can make itself on this connection: those whose functions and objects this build's profile
/// names, on a system the bridge runs them on.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameActions {
    pub add_injury: bool,
    pub work_permit: bool,
}

/// An injury the game gave a player, with what takes it away again.
#[derive(Debug, Clone)]
pub struct AddedInjury {
    pub player: u32,
    pub kind: String,
    pub undo: HealPlan,
}

/// A work permit the game granted or took away.
#[derive(Debug, Clone, Copy)]
pub struct PermitChange {
    pub player: u32,
    pub granted: bool,
    /// Whether he held a granted work permit before.
    pub was_granted: bool,
}

impl Session {
    /// Which edits the game can make itself here.
    pub fn game_actions(&self) -> GameActions {
        let (Some(profile), Some(calls)) = (&self.profile, self.profile.as_ref().and_then(|p| p.calls.as_ref())) else {
            return GameActions::default();
        };
        if !cfg!(target_os = "macos") {
            return GameActions::default();
        }
        GameActions {
            add_injury: calls.add_injury.is_some()
                && profile.injury_manager.is_some()
                && profile.injury_kinds.is_some()
                && self.layout.injury_kind.is_some(),
            work_permit: calls.set_work_permit.is_some()
                && profile.transfer_manager.is_some()
                && self.layout.work_permit.is_some(),
        }
    }

    /// Has the game run `program`. Refused while the checks a change to the game's lists and records needs have not
    /// passed, as any such change is.
    fn call_game(&self, program: &Program) -> Result<Outcome, MoveError> {
        if let Some(lock) = self.structure_lock() {
            return Err(MoveError::Locked(lock));
        }
        #[cfg(target_os = "macos")]
        {
            let crate::profile::PluginFingerprint::MachO { uuid } = self.fingerprint else {
                return Err(MoveError::CallUnavailable);
            };
            let allowed = self.profile.as_ref().and_then(|p| p.calls.as_ref()).map(CallRvas::all).unwrap_or_default();
            Ok(self.process.call(uuid, program, |rva| allowed.contains(&rva))?)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = program;
            Err(MoveError::CallUnavailable)
        }
    }

    /// The function `pick` names in this build's profile.
    fn game_function(&self, pick: impl Fn(&CallRvas) -> Option<u64>) -> Result<u64, MoveError> {
        self.profile.as_ref().and_then(|p| p.calls.as_ref()).and_then(pick).ok_or(MoveError::CallUnavailable)
    }

    /// The object behind the static pointer at `slot`, when it is of `class`.
    fn singleton(&self, slot: Option<u64>, class: &str) -> Result<u64, MoveError> {
        let slot = slot.ok_or(MoveError::CallUnavailable)?;
        let object = self.process.read_u64(self.plugin.base + slot)?;
        if !is_user_pointer(object) || class_of(&self.process, &self.plugin, object).as_deref() != Some(class) {
            return Err(MoveError::CallUnavailable);
        }
        Ok(object)
    }

    /// `player`'s object, checked to still be his, and not a player-coach's.
    fn player_object(&self, player: &PlayerSummary) -> Result<u64, MoveError> {
        let p = &self.layout.player;
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        if player.shift != 0 {
            return Err(MoveError::PlayerCoach);
        }
        Ok(player.address)
    }

    /// The kinds of injury in the game's database, in its order.
    pub fn injury_kinds(&self) -> Result<Vec<InjuryKind>, MoveError> {
        Ok(self.indexed_injury_kinds()?.into_iter().map(|(_, kind)| kind).collect())
    }

    /// The kinds of injury with their places in the game's table, which is what its functions take. Unnamed ones are
    /// left out.
    fn indexed_injury_kinds(&self) -> Result<Vec<(u64, InjuryKind)>, MoveError> {
        let (Some(k), Some(slot)) = (&self.layout.injury_kind, self.profile.as_ref().and_then(|p| p.injury_kinds))
        else {
            return Ok(Vec::new());
        };
        let rows = crate::competitions::table_rows(self, slot, k.table_items, &k.class, k.index, k.size)?;
        let name_at = self.layout.injury.kind_name as usize;
        let mut kinds = Vec::with_capacity(rows.len());
        for (index, (_, bytes)) in rows.into_iter().enumerate() {
            let uid = u32::from_le_bytes(bytes[k.uid as usize..k.uid as usize + 4].try_into().expect("4 bytes"));
            let text = u64::from_le_bytes(bytes[name_at..name_at + 8].try_into().expect("8 bytes"));
            if let Some(name) = read_fm_string(&self.process, text).filter(|name| !name.is_empty()) {
                kinds.push((index as u64, InjuryKind { uid, name }));
            }
        }
        Ok(kinds)
    }

    /// Has the game give `player` an injury of the kind with `kind_uid`, as its training injuries do: only a player
    /// with no current injury gets one, and the game picks how long it lasts.
    pub fn add_injury(&self, player: &PlayerSummary, kind_uid: u32) -> Result<AddedInjury, MoveError> {
        let function = self.game_function(|calls| calls.add_injury)?;
        let manager_class = self.layout.injury_kind.as_ref().map(|k| k.manager_class.as_str()).unwrap_or_default();
        let manager = self.singleton(self.profile.as_ref().and_then(|p| p.injury_manager), manager_class)?;
        let object = self.player_object(player)?;
        if !self.injuries(player)?.is_empty() {
            return Err(MoveError::AlreadyInjured);
        }
        let (index, kind) = self
            .indexed_injury_kinds()?
            .into_iter()
            .find(|(_, kind)| kind.uid == kind_uid)
            .ok_or(MoveError::NoInjuryKind { uid: kind_uid })?;

        let mut program = Program::new();
        let zero = Arg::value(0);
        program.push(Step::new(
            function,
            &[
                Arg::value(manager),
                Arg::value(object),
                Arg::value(index),
                Arg::value(TRAINING_CAUSE),
                zero,
                zero,
                zero,
                zero,
                // On the stack: no news item, then a null pointer and a u16 0.
                zero,
                zero,
                zero,
            ],
        ));
        let outcome = self.call_game(&program)?;
        if outcome.results.first().is_none_or(|&injury| !is_user_pointer(injury)) {
            return Err(MoveError::CallDeclined);
        }
        // What takes it away again: the list emptied, as healing does.
        let undo = self.plan_heal(player)?;
        Ok(AddedInjury { player: player.uid, kind: kind.name, undo })
    }

    /// Has the game grant `player` a work permit for his club's country, or take it away, as its own editor does.
    pub fn set_work_permit(&self, player: &PlayerSummary, grant: bool) -> Result<PermitChange, MoveError> {
        let function = self.game_function(|calls| calls.set_work_permit)?;
        let class = self.layout.work_permit.as_ref().map(|w| w.class.as_str()).unwrap_or_default();
        let manager = self.singleton(self.profile.as_ref().and_then(|p| p.transfer_manager), class)?;
        let object = self.player_object(player)?;
        let team = self.process.read_u64(object + self.layout.player.team)?;
        if !is_user_pointer(team) {
            return Err(MoveError::FreeAgent);
        }
        // The game takes the player's identity block: where his vtable says his virtual base starts.
        let vtable = self.process.read_u64(object)?;
        let identity = object.wrapping_add_signed(self.process.read_u64(vtable - 0x18)? as i64);
        let was_granted = self.work_permits(player).iter().any(|permit| permit.granted);

        let mut program = Program::new();
        program.push(Step::new(
            function,
            &[Arg::value(manager), Arg::value(identity), Arg::value(team), Arg::value(1), Arg::value(u64::from(grant))],
        ));
        self.call_game(&program)?;
        let granted = self.work_permits(player).iter().any(|permit| permit.granted);
        if granted != grant {
            return Err(MoveError::CallDeclined);
        }
        Ok(PermitChange { player: player.uid, granted, was_granted })
    }
}
