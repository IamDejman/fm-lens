//! Edits the game makes itself.
//!
//! An injury is an object from the game's own pool, a work permit a record the transfer manager
//! keeps and files, and a loan or a free agent's signing a contract, an offer and a move: more than
//! values the editor can write. For those FM Lens has the game
//! run its own functions, on its main thread, through the bridge ([`fmlibre_mem::call`]). Only on
//! macOS, and only on a build whose profile lists the functions ([`CallRvas`]).

use fmlibre_mem::call::{Arg, Outcome, Program, Step};
use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::clubs::ClubSummary;
use crate::date::FmDate;
use crate::medical::HealPlan;
use crate::players::PlayerSummary;
use crate::profile::CallRvas;
use crate::rtti::class_of;
use crate::session::Session;
use crate::text::read_fm_string;
use crate::transfer::{MoveError, MoveTerms, PointerList};

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
    pub start_loan: bool,
    pub sign_free_agent: bool,
}

/// An FM date as the game's functions take it: the day of the year, then the year.
fn packed_date(date: FmDate) -> u32 {
    u32::from(date.day_of_year()) | u32::from(date.year) << 16
}

/// A date FM keeps for "not set": 1 January 1900.
const UNSET_DATE: u32 = 0x076C_0001;

/// An injury the game gave a player, with what takes it away again.
#[derive(Debug, Clone)]
pub struct AddedInjury {
    pub player: u32,
    pub kind: String,
    pub undo: HealPlan,
}

/// A loan the game started: the player went from his club to another until `ends`.
#[derive(Debug, Clone, Copy)]
pub struct StartedLoan {
    pub player: u32,
    pub from_club: u32,
    pub to_club: u32,
    pub ends: FmDate,
}

/// A free agent the game signed for a club, and the end of the contract he has now.
#[derive(Debug, Clone, Copy)]
pub struct SignedPlayer {
    pub player: u32,
    pub club: u32,
    pub expires: Option<FmDate>,
}

/// Where the signing's terms map and its list of entity references sit in the call's scratch memory: three qwords
/// each, from zero.
const TERMS_MAP: usize = 0;
const REFERENCES: usize = 0x20;

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
            start_loan: calls.start_loan.is_some()
                && profile.transfer_manager.is_some()
                && profile.starting_loan.is_some()
                && self.layout.work_permit.is_some()
                && self.layout.starting_loan.is_some()
                && self.layout.loan.is_some(),
            sign_free_agent: calls.sign_free_agent.is_some()
                && calls.map_new.is_some()
                && calls.map_drop.is_some()
                && calls.refs_drop.is_some()
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

    /// Has the game loan `player` to the senior team of `club` from today until `ends`, as its own editor does: it
    /// makes the loan contract and moves him. Not for a player on loan already, a free agent, or a move between a men's
    /// and a women's club. The game says nothing back, so the loan is read back to tell.
    pub fn start_loan(
        &self,
        player: &PlayerSummary,
        club: &ClubSummary,
        ends: FmDate,
    ) -> Result<StartedLoan, MoveError> {
        let function = self.game_function(|calls| calls.start_loan)?;
        let (Some(rvas), Some(o)) =
            (self.profile.as_ref().and_then(|p| p.starting_loan.as_ref()), self.layout.starting_loan.as_ref())
        else {
            return Err(MoveError::CallUnavailable);
        };
        let class = self.layout.work_permit.as_ref().map(|w| w.class.as_str()).unwrap_or_default();
        let manager = self.singleton(self.profile.as_ref().and_then(|p| p.transfer_manager), class)?;
        let object = self.player_object(player)?;
        if self.loan(player).is_some() {
            return Err(MoveError::OnLoan);
        }
        let (process, layout) = (&self.process, &self.layout);
        let team = process.read_u64(object + layout.player.team)?;
        if !is_user_pointer(team) {
            return Err(MoveError::FreeAgent);
        }
        let own_club = process.read_u64(team + layout.team.club)?;
        if process.read_u32(club.address + layout.club.uid)? != club.uid {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        if club.address == own_club {
            return Err(MoveError::SameClub);
        }
        let women = |address: u64| process.read_bytes(address + layout.club.women, 1).map(|b| b[0]);
        if !is_user_pointer(own_club) || women(own_club)? != women(club.address)? {
            return Err(MoveError::MenAndWomen);
        }
        let senior = self.senior_team(club)?;
        let today = self.game_date().ok_or(MoveError::CallUnavailable)?;
        if ends <= today {
            let max = self.field(crate::edit::Entity::Player, "loan.ends").map_or(i64::MAX, |field| field.max);
            return Err(MoveError::OutOfRange {
                field: "loan.ends",
                value: ends.to_number(),
                min: today.plus_days(1).to_number(),
                max,
            });
        }
        let from_club = process.read_u32(own_club + layout.club.uid)?;

        // The object as the game's editor builds it, then the player, the club and the dates.
        let mut loan = vec![0u8; o.size as usize];
        let mut put = |at: u64, bytes: &[u8]| loan[at as usize..at as usize + bytes.len()].copy_from_slice(bytes);
        put(0, &(self.plugin.base + rvas.vtable).to_le_bytes());
        put(0x08, &[0xFF; 8]);
        put(0x30, &[UNSET_DATE.to_le_bytes(), UNSET_DATE.to_le_bytes(), UNSET_DATE.to_le_bytes()].concat());
        put(0x3C, &[0xFF; 0x0D]);
        put(o.defaults, &process.read_bytes(self.plugin.base + rvas.defaults, 16)?);
        put(0x6F, &[0xFF]);
        put(o.player, &self.identity_block(object)?.to_le_bytes());
        put(o.club, &senior.to_le_bytes());
        put(o.starts, &packed_date(today).to_le_bytes());
        put(o.ends, &packed_date(ends).to_le_bytes());

        let mut program = Program::new();
        program.write(0, &loan);
        program.push(Step::new(function, &[Arg::value(manager), Arg::scratch(0), Arg::value(1)]));
        self.call_game(&program)?;
        if self.loan(player).is_none() {
            return Err(MoveError::CallDeclined);
        }
        Ok(StartedLoan { player: player.uid, from_club, to_club: club.uid, ends })
    }

    /// Has the game sign the free agent `player` for the senior team of `club`, as its own editor does: it makes the
    /// contract, on its own terms, and moves him. `terms` then replace its wage and end date, where given; the caller
    /// writes them. The game says whether he signed, and his team is read back to tell.
    pub fn sign_free_agent(
        &self,
        player: &PlayerSummary,
        club: &ClubSummary,
        terms: MoveTerms,
    ) -> Result<SignedPlayer, MoveError> {
        let function = self.game_function(|calls| calls.sign_free_agent)?;
        let map_new = self.game_function(|calls| calls.map_new)?;
        let map_drop = self.game_function(|calls| calls.map_drop)?;
        let refs_drop = self.game_function(|calls| calls.refs_drop)?;
        let class = self.layout.work_permit.as_ref().map(|w| w.class.as_str()).unwrap_or_default();
        let manager = self.singleton(self.profile.as_ref().and_then(|p| p.transfer_manager), class)?;
        let object = self.player_object(player)?;
        let (process, layout) = (&self.process, &self.layout);
        let p = &layout.player;
        if is_user_pointer(process.read_u64(object + p.team)?)
            || is_user_pointer(process.read_u64(object + p.contract)?)
        {
            return Err(MoveError::HasClub);
        }
        if process.read_u32(club.address + layout.club.uid)? != club.uid {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        let senior = self.senior_team(club)?;
        self.check_terms(terms, self.game_date())?;

        // The map and the list start empty, and are destroyed whatever the signing does.
        let mut program = Program::new();
        program.push(Step::new(map_new, &[Arg::scratch(TERMS_MAP)]));
        let signing = program.push(Step::new(
            function,
            &[
                Arg::value(manager),
                Arg::value(object + p.person_block),
                Arg::value(senior),
                Arg::scratch(TERMS_MAP),
                Arg::scratch(REFERENCES),
                Arg::value(0),
            ],
        ));
        program.push(Step::new(refs_drop, &[Arg::scratch(REFERENCES)]).cleanup());
        program.push(Step::new(map_drop, &[Arg::scratch(TERMS_MAP)]).cleanup());
        let outcome = self.call_game(&program)?;
        let signed = outcome.results.get(signing).is_some_and(|&result| result as u8 != 0);
        let team = process.read_u64(object + p.team)?;
        if !signed || !is_user_pointer(team) || process.read_u64(team + layout.team.club)? != club.address {
            return Err(MoveError::CallDeclined);
        }
        let contract = process.read_u64(object + p.contract)?;
        let expires = if is_user_pointer(contract) {
            let date = process.read_bytes(contract + layout.contract.expires, 4)?;
            FmDate::from_raw(u16::from_le_bytes([date[0], date[1]]), u16::from_le_bytes([date[2], date[3]]))
        } else {
            None
        };
        Ok(SignedPlayer { player: player.uid, club: club.uid, expires })
    }

    /// The senior team of `club`, checked to point back at it.
    fn senior_team(&self, club: &ClubSummary) -> Result<u64, MoveError> {
        let (process, layout) = (&self.process, &self.layout);
        let senior = match PointerList::read(process, club.address + layout.club.teams)? {
            Some(teams) => teams.elements(process)?.first().copied().unwrap_or(0),
            None => 0,
        };
        if !is_user_pointer(senior) || process.read_u64(senior + layout.team.club)? != club.address {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        Ok(senior)
    }

    /// The player object's identity block: where its vtable says its virtual base starts.
    fn identity_block(&self, object: u64) -> Result<u64, MoveError> {
        let vtable = self.process.read_u64(object)?;
        Ok(object.wrapping_add_signed(self.process.read_u64(vtable - 0x18)? as i64))
    }
}
