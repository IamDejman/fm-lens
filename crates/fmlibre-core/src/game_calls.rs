//! Edits the game makes itself.
//!
//! An injury is an object from the game's own pool, a work permit a record the transfer manager
//! keeps and files, and a loan, its end or a free agent's signing (now or on a later day) a contract,
//! an offer and a move: more than values the editor can write. For those FM Lens has the game
//! run its own functions, on its main thread, through the bridge ([`fmlibre_mem::call`]). Only on
//! macOS, and only on a build whose profile lists the functions ([`CallRvas`]).

use fmlibre_mem::call::{Arg, Outcome, Program, Step};
use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::clubs::ClubSummary;
use crate::date::FmDate;
use crate::medical::HealPlan;
use crate::players::PlayerSummary;
use crate::profile::{CallRvas, FutureTransferLayout};
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
    pub end_loan: bool,
    /// Signing a free agent on a later day, and cancelling it.
    pub future_transfer: bool,
    /// Every player of a team fully familiar with its tactic, as the game's editor does it.
    pub max_tactics: bool,
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

/// A loan the game ended: the player went back from the club he was loaned to, to his own. `starts`, `ends` and `wage`
/// are the loan's terms, for starting it again as it was.
#[derive(Debug, Clone, Copy)]
pub struct EndedLoan {
    pub player: u32,
    pub from_club: u32,
    pub to_club: u32,
    pub starts: Option<FmDate>,
    pub ends: Option<FmDate>,
    /// Pounds per week the borrowing club paid of his wage.
    pub wage: i32,
    /// Whether his own club had him on its loan list, which the game's end of a loan can change; none where it could
    /// not be read.
    pub loan_listed: Option<bool>,
}

/// The kinds of contract end the game's daily check passes for a loan that ran out, which pick its news: one for a
/// parent club a human manager runs, one for any other.
const LOAN_ENDED_HUMAN: u64 = 2;
const LOAN_ENDED: u64 = 3;

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

/// A free agent the game agreed to sign for a club on a later day, `joins`; until then he stays a free agent. `offer`
/// is the id of the game's pending transfer, which undoing cancels.
#[derive(Debug, Clone, Copy)]
pub struct AgreedSigning {
    pub player: u32,
    pub club: u32,
    pub joins: FmDate,
    pub offer: u32,
}

/// The key of a signing's date in its terms map: 'TrDt'.
const TRANSFER_DATE: u64 = 0x5472_4474;
/// Where the signing's date sits in the scratch memory, as the game's raw date, and the Value made from it.
const RAW_DATE: usize = 0x40;
const DATE_VALUE: usize = 0x50;

/// Where cancelling puts the offer in the scratch memory: as read, and the copy that holds a reference through the call.
/// Each slot is a pointer and a u32.
const OFFER_READ: usize = 0;
const OFFER_HELD: usize = 0x10;
/// What `cancel_offer` cancels for: the team the player joins, or the one he leaves.
const CANCEL_JOINING: u64 = 2;
const CANCEL_LEAVING: u64 = 0;
/// The longest list of offers the editor reads.
const LONGEST_OFFERS: u64 = 1 << 20;

/// A work permit for his club's country the game gave a player or took away.
#[derive(Debug, Clone, Copy)]
pub struct PermitChange {
    pub player: u32,
    /// Whether he holds one now.
    pub granted: bool,
    /// Whether he held one before, and whether it was an ESC slot.
    pub was_granted: bool,
    pub was_esc: bool,
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
                && calls.find_work_permit.is_some()
                && calls.remove_work_permit.is_some()
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
            end_loan: calls.end_contract.is_some()
                && profile.transfer_manager.is_some()
                && self.layout.work_permit.is_some()
                && self.layout.loan.is_some(),
            future_transfer: calls.sign_free_agent.is_some()
                && calls.map_new.is_some()
                && calls.map_drop.is_some()
                && calls.refs_drop.is_some()
                && calls.date_type.is_some()
                && calls.date_value.is_some()
                && calls.map_insert.is_some()
                && calls.value_drop.is_some()
                && calls.cancel_offer.is_some()
                && calls.drop_dated_transfer.is_some()
                && calls.ref_copy.is_some()
                && calls.ref_drop.is_some()
                && profile.transfer_manager.is_some()
                && self.layout.work_permit.is_some()
                && self.layout.future_transfer.is_some(),
            max_tactics: calls.maximise_tactics.is_some()
                && calls.struct_value.is_some()
                && calls.map_new.is_some()
                && calls.map_insert.is_some()
                && calls.map_drop.is_some()
                && profile.editor.as_ref().is_some_and(|editor| {
                    self.process.read_bytes(self.plugin.base + editor.enabled, 1).is_ok_and(|byte| byte[0] == 1)
                })
                && self.layout.tactics.is_some(),
        }
    }

    /// Has the game run `program`. Refused while the checks a change to the game's lists and records needs have not
    /// passed, as any such change is.
    pub(crate) fn call_game(&self, program: &Program) -> Result<Outcome, MoveError> {
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
    pub(crate) fn game_function(&self, pick: impl Fn(&CallRvas) -> Option<u64>) -> Result<u64, MoveError> {
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

    /// Has the game give `player` a work permit for his club's country, or take his away, as its own editor does: it
    /// makes him a record without an ESC slot, where its rules say he needs one, or removes his record.
    pub fn set_work_permit(&self, player: &PlayerSummary, grant: bool) -> Result<PermitChange, MoveError> {
        let (manager, identity, team) = self.permit_holder(player)?;
        let held = self.club_permit(manager, identity, team)?;
        let was_esc = held.is_some_and(|(_, esc)| esc);
        match (grant, held) {
            (true, None) => self.give_permit(manager, identity, team, false, false)?,
            (false, Some((record, _))) => self.take_permit(manager, identity, team, record)?,
            // The profile offers Grant only without a record and Revoke only with one: the game has moved on.
            _ => return Err(MoveError::CallDeclined),
        }
        Ok(PermitChange { player: player.uid, granted: grant, was_granted: held.is_some(), was_esc })
    }

    /// Undoes `change`: a permit given is taken away again, and one taken away given back, as an ESC slot where it was
    /// one (from today, as the game dates a new slot).
    pub fn undo_work_permit(&self, player: &PlayerSummary, change: &PermitChange) -> Result<(), MoveError> {
        let (manager, identity, team) = self.permit_holder(player)?;
        match (change.was_granted, self.club_permit(manager, identity, team)?) {
            (true, None) => self.give_permit(manager, identity, team, true, change.was_esc),
            (false, Some((record, _))) => self.take_permit(manager, identity, team, record),
            _ => Err(MoveError::CallDeclined),
        }
    }

    /// What the game's work permit functions take: the transfer manager, the player's identity block (where his
    /// vtable says his virtual base starts) and his club team.
    fn permit_holder(&self, player: &PlayerSummary) -> Result<(u64, u64, u64), MoveError> {
        let class = self.layout.work_permit.as_ref().map(|w| w.class.as_str()).unwrap_or_default();
        let manager = self.singleton(self.profile.as_ref().and_then(|p| p.transfer_manager), class)?;
        let object = self.player_object(player)?;
        let team = self.process.read_u64(object + self.layout.player.team)?;
        if !is_user_pointer(team) {
            return Err(MoveError::FreeAgent);
        }
        let vtable = self.process.read_u64(object)?;
        let identity = object.wrapping_add_signed(self.process.read_u64(vtable - 0x18)? as i64);
        Ok((manager, identity, team))
    }

    /// The player's record for his club's country, as the game finds it, and whether it is an ESC slot; none when he
    /// holds no permit there. The game gives its place in the list of records, which is read here.
    fn club_permit(&self, manager: u64, identity: u64, team: u64) -> Result<Option<(u64, bool)>, MoveError> {
        let find = self.game_function(|calls| calls.find_work_permit)?;
        let w = self.layout.work_permit.as_ref().ok_or(MoveError::CallUnavailable)?;
        let mut program = Program::new();
        program.push(Step::new(find, &[Arg::value(manager), Arg::value(identity), Arg::value(team)]));
        let outcome = self.call_game(&program)?;
        // An int: its place, or -1.
        let Ok(index) = usize::try_from(outcome.results.first().copied().unwrap_or(u64::MAX) as u32 as i32) else {
            return Ok(None);
        };
        let records = self.permit_records().ok_or(MoveError::CallUnavailable)?;
        let record = *records.get(index).ok_or(MoveError::CallDeclined)?;
        // The record must be his: the person's id the identity block holds at +0x08.
        if self.process.read_u32(record + w.record_person)? != self.process.read_u32(identity + 8)? {
            return Err(MoveError::Changed { address: record });
        }
        let esc = self.process.read_bytes(record + w.record_flags, 1)?[0] & 1 == 1;
        Ok(Some((record, esc)))
    }

    /// Has the game make the player a record for his club's country: with `force` 0 and no ESC slot, as its editor
    /// does, only where its rules say he needs a permit; forced, as it was, to give back one taken away.
    fn give_permit(&self, manager: u64, identity: u64, team: u64, force: bool, esc: bool) -> Result<(), MoveError> {
        let set = self.game_function(|calls| calls.set_work_permit)?;
        let mut program = Program::new();
        program.push(Step::new(
            set,
            &[
                Arg::value(manager),
                Arg::value(identity),
                Arg::value(team),
                Arg::value(u64::from(force)),
                Arg::value(u64::from(esc)),
            ],
        ));
        self.call_game(&program)?;
        match self.club_permit(manager, identity, team)? {
            Some((_, made)) if made == esc => Ok(()),
            _ => Err(MoveError::CallDeclined),
        }
    }

    /// Has the game remove the player's `record`, as its editor does; it frees the record and drops it from its lists.
    fn take_permit(&self, manager: u64, identity: u64, team: u64, record: u64) -> Result<(), MoveError> {
        let remove = self.game_function(|calls| calls.remove_work_permit)?;
        let mut program = Program::new();
        program.push(Step::new(remove, &[Arg::value(manager), Arg::value(identity), Arg::value(record)]));
        self.call_game(&program)?;
        match self.club_permit(manager, identity, team)? {
            None => Ok(()),
            Some(_) => Err(MoveError::CallDeclined),
        }
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
        self.start_loan_from(player, club, None, ends)
    }

    /// Has the game start again the loan it ended, `ended`, back to `club`: from the day it started until the day it
    /// was to end. The game's loan has the borrower pay nothing; the caller writes `ended.wage` back.
    pub fn restart_loan(
        &self,
        player: &PlayerSummary,
        club: &ClubSummary,
        ended: &EndedLoan,
    ) -> Result<StartedLoan, MoveError> {
        let ends = ended.ends.ok_or(MoveError::UnusualContract)?;
        self.start_loan_from(player, club, ended.starts, ends)
    }

    /// As [`Session::start_loan`], from `starts` where it is given and not after today.
    fn start_loan_from(
        &self,
        player: &PlayerSummary,
        club: &ClubSummary,
        starts: Option<FmDate>,
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
        put(o.starts, &packed_date(starts.filter(|&day| day <= today).unwrap_or(today)).to_le_bytes());
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
        let (object, senior) = self.signing_target(player, club)?;
        self.check_terms(terms, self.game_date())?;
        let signed = self.run_signing(object, senior, None)?;
        let (process, layout) = (&self.process, &self.layout);
        let p = &layout.player;
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

    /// Has the game agree to sign the free agent `player` for the senior team of `club` on `joins`, a day after
    /// today, as its own editor does with a date: it keeps the signing, pending, until that day, and makes the
    /// contract then, on its own terms. He stays a free agent until then. The game's new record of it is read back.
    pub fn sign_free_agent_later(
        &self,
        player: &PlayerSummary,
        club: &ClubSummary,
        joins: FmDate,
    ) -> Result<AgreedSigning, MoveError> {
        let f = self.layout.future_transfer.as_ref().ok_or(MoveError::CallUnavailable)?;
        let manager = self.transfer_manager()?;
        let (object, senior) = self.signing_target(player, club)?;
        let today = self.game_date().ok_or(MoveError::CallUnavailable)?;
        if joins <= today {
            let max = self.field(crate::edit::Entity::Player, "contract.expires").map_or(i64::MAX, |field| field.max);
            return Err(MoveError::OutOfRange {
                field: "transfer.joins",
                value: joins.to_number(),
                min: today.plus_days(1).to_number(),
                max,
            });
        }
        let before = self.dated_offers(manager, f)?;
        let signed = self.run_signing(object, senior, Some(joins))?;
        // One new dated record, for an offer that names him and waits for its day; and he has not joined yet.
        let added: Vec<u32> = self.dated_offers(manager, f)?.into_iter().filter(|id| !before.contains(id)).collect();
        let [offer] = added[..] else {
            return Err(MoveError::CallDeclined);
        };
        let names_him = match self.pending_offer(manager, f, offer)? {
            Some(found) => self.process.read_u64(found + f.offer_person)? == self.identity_block(object)?,
            None => false,
        };
        if !signed || !names_him || is_user_pointer(self.process.read_u64(object + self.layout.player.team)?) {
            return Err(MoveError::CallDeclined);
        }
        Ok(AgreedSigning { player: player.uid, club: club.uid, joins, offer })
    }

    /// Has the game cancel the signing of `player` it agreed for a later day, the pending transfer `offer`, as its own
    /// editor cancels a future transfer: it cancels the offer, then drops its dated record. Read back to tell.
    pub fn cancel_signing(&self, player: &PlayerSummary, offer: u32) -> Result<(), MoveError> {
        let f = self.layout.future_transfer.as_ref().ok_or(MoveError::CallUnavailable)?;
        let cancel = self.game_function(|calls| calls.cancel_offer)?;
        let drop_dated = self.game_function(|calls| calls.drop_dated_transfer)?;
        let ref_copy = self.game_function(|calls| calls.ref_copy)?;
        let ref_drop = self.game_function(|calls| calls.ref_drop)?;
        let manager = self.transfer_manager()?;
        let object = self.player_object(player)?;
        let identity = self.identity_block(object)?;
        let process = &self.process;
        let found = self.pending_offer(manager, f, offer)?.ok_or(MoveError::NotPending)?;
        if process.read_u64(found + f.offer_person)? != identity {
            return Err(MoveError::NotPending);
        }
        let (joining, leaving) =
            (process.read_u64(found + f.offer_to_team)?, process.read_u64(found + f.offer_from_team)?);
        let (team, kind) = if is_user_pointer(joining) {
            (joining, CANCEL_JOINING)
        } else if is_user_pointer(leaving) {
            (leaving, CANCEL_LEAVING)
        } else {
            return Err(MoveError::CallDeclined);
        };

        let zero = Arg::value(0);
        let mut program = Program::new();
        program.write_u64(OFFER_READ, found);
        // The game's editor holds a reference to the offer while it cancels it, and gives it back after; so does this.
        program.push(Step::new(ref_copy, &[Arg::scratch(OFFER_HELD), Arg::scratch(OFFER_READ)]));
        program.push(Step::new(
            cancel,
            &[
                Arg::value(manager),
                Arg::scratch(OFFER_HELD),
                Arg::value(team),
                Arg::value(kind),
                zero,
                zero,
                zero,
                Arg::value(1),
                // On the stack: two zeros, as the game's editor passes.
                zero,
                zero,
            ],
        ));
        program.push(Step::new(
            drop_dated,
            &[Arg::value(manager + f.dated_owner), Arg::value(found), Arg::value(identity)],
        ));
        program.push(Step::new(ref_drop, &[Arg::value(found)]).cleanup());
        self.call_game(&program)?;
        if self.dated_offers(manager, f)?.contains(&offer) || self.pending_offer(manager, f, offer)?.is_some() {
            return Err(MoveError::CallDeclined);
        }
        Ok(())
    }

    /// `player`'s object and the senior team of `club`, checked for a signing: he is a free agent, and the club is
    /// still the club.
    fn signing_target(&self, player: &PlayerSummary, club: &ClubSummary) -> Result<(u64, u64), MoveError> {
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
        Ok((object, self.senior_team(club)?))
    }

    /// Has the game sign the player `object` for the team `senior`, on `joins` when given (the date term of the terms
    /// map), else today. Says whether the game says he signed.
    fn run_signing(&self, object: u64, senior: u64, joins: Option<FmDate>) -> Result<bool, MoveError> {
        let function = self.game_function(|calls| calls.sign_free_agent)?;
        let map_new = self.game_function(|calls| calls.map_new)?;
        let map_drop = self.game_function(|calls| calls.map_drop)?;
        let refs_drop = self.game_function(|calls| calls.refs_drop)?;
        let manager = self.transfer_manager()?;

        // The map and the list start empty, and are destroyed whatever the signing does.
        let mut program = Program::new();
        program.push(Step::new(map_new, &[Arg::scratch(TERMS_MAP)]));
        if let Some(joins) = joins {
            let date_type = self.game_function(|calls| calls.date_type)?;
            let date_value = self.game_function(|calls| calls.date_value)?;
            let map_insert = self.game_function(|calls| calls.map_insert)?;
            let value_drop = self.game_function(|calls| calls.value_drop)?;
            // The date, as the game's editor adds it: a date Value made from the raw date, copied into the map.
            program.write_u32(RAW_DATE, packed_date(joins));
            let kind = program.push(Step::new(date_type, &[]));
            program.push(Step::new(date_value, &[Arg::result(kind), Arg::scratch(DATE_VALUE), Arg::scratch(RAW_DATE)]));
            program.push(Step::new(
                map_insert,
                &[Arg::scratch(TERMS_MAP), Arg::value(TRANSFER_DATE), Arg::scratch(DATE_VALUE)],
            ));
            program.push(Step::new(value_drop, &[Arg::scratch(DATE_VALUE)]).cleanup());
        }
        let signing = program.push(Step::new(
            function,
            &[
                Arg::value(manager),
                Arg::value(object + self.layout.player.person_block),
                Arg::value(senior),
                Arg::scratch(TERMS_MAP),
                Arg::scratch(REFERENCES),
                Arg::value(0),
            ],
        ));
        program.push(Step::new(refs_drop, &[Arg::scratch(REFERENCES)]).cleanup());
        program.push(Step::new(map_drop, &[Arg::scratch(TERMS_MAP)]).cleanup());
        let outcome = self.call_game(&program)?;
        Ok(outcome.results.get(signing).is_some_and(|&result| result as u8 != 0))
    }

    /// The transfer manager, which the build profile points at.
    fn transfer_manager(&self) -> Result<u64, MoveError> {
        let class = self.layout.work_permit.as_ref().map(|w| w.class.as_str()).unwrap_or_default();
        self.singleton(self.profile.as_ref().and_then(|p| p.transfer_manager), class)
    }

    /// The ids of the offers the transfer manager `manager` has dated records of: the transfers agreed for a later day.
    fn dated_offers(&self, manager: u64, f: &FutureTransferLayout) -> Result<Vec<u32>, MoveError> {
        let Some(records) = PointerList::read_up_to(&self.process, manager + f.dated, LONGEST_OFFERS)? else {
            return Ok(Vec::new());
        };
        let mut ids = Vec::new();
        for record in records.elements(&self.process)? {
            if is_user_pointer(record) {
                ids.push(self.process.read_u32(record + f.record_offer)?);
            }
        }
        Ok(ids)
    }

    /// The offer `id` of the transfer manager `manager`, while it waits for its day.
    fn pending_offer(&self, manager: u64, f: &FutureTransferLayout, id: u32) -> Result<Option<u64>, MoveError> {
        let Some(offers) = PointerList::read_up_to(&self.process, manager + f.offers, LONGEST_OFFERS)? else {
            return Ok(None);
        };
        for offer in offers.elements(&self.process)? {
            if is_user_pointer(offer)
                && self.process.read_u32(offer + f.offer_id)? == id
                && self.process.read_bytes(offer + f.offer_status, 1)?[0] == f.pending
            {
                return Ok(Some(offer));
            }
        }
        Ok(None)
    }

    /// The UIDs of the clubs `player`'s loan would end between: the club he is loaned to, then his own. Only reads
    /// memory.
    pub fn plan_end_loan(&self, player: &PlayerSummary) -> Result<(u32, u32), MoveError> {
        let object = self.player_object(player)?;
        let terms = self.loan(player).ok_or(MoveError::NotOnLoan)?;
        // The game completes a transfer with a mandatory future fee when the loan ends; which fees are mandatory is
        // not known, so no loan with one is ended.
        if terms.future_fee.is_some() {
            return Err(MoveError::FutureFee);
        }
        // He plays for the club he is loaned to; his own contract names his parent club.
        let team = self.process.read_u64(object + self.layout.player.team)?;
        match (crate::players::club_uid_of_team(&self.process, &self.layout, team), terms.parent_uid) {
            (Some(borrower), Some(parent)) if borrower != parent => Ok((borrower, parent)),
            _ => Err(MoveError::UnusualContract),
        }
    }

    /// Has the game end `player`'s loan today, as its daily check does once a loan runs out: it ends the loan
    /// contract and he goes back to his own club, with the game's news of it. `human_clubs` are the UIDs of the clubs
    /// human managers run, for the news. The game says nothing back, so the loan is read back to tell.
    pub fn end_loan(&self, player: &PlayerSummary, human_clubs: &[u32]) -> Result<EndedLoan, MoveError> {
        let function = self.game_function(|calls| calls.end_contract)?;
        let class = self.layout.work_permit.as_ref().map(|w| w.class.as_str()).unwrap_or_default();
        let manager = self.singleton(self.profile.as_ref().and_then(|p| p.transfer_manager), class)?;
        let object = self.player_object(player)?;
        let (from_club, to_club) = self.plan_end_loan(player)?;
        let loan = self.loan_contract(object, 0).ok_or(MoveError::NotOnLoan)?;
        let terms = self.loan(player).ok_or(MoveError::NotOnLoan)?;
        let loan_listed = self
            .field(crate::edit::Entity::Player, "contract.loan_listed")
            .and_then(|field| self.read_field(&player.target(), &field))
            .ok()
            .map(|value| value != 0);
        let kind = if human_clubs.contains(&to_club) { LOAN_ENDED_HUMAN } else { LOAN_ENDED };

        let zero = Arg::value(0);
        let mut program = Program::new();
        program.push(Step::new(
            function,
            &[
                Arg::value(manager),
                Arg::value(object),
                Arg::value(loan),
                Arg::value(kind),
                zero,
                Arg::value(1),
                zero,
                zero,
                // On the stack: a byte 0 and a qword 0, as the game's own callers pass.
                zero,
                zero,
            ],
        ));
        self.call_game(&program)?;
        let (process, layout) = (&self.process, &self.layout);
        let team = process.read_u64(object + layout.player.team)?;
        if self.loan_contract(object, 0).is_some() {
            return Err(MoveError::CallDeclined);
        }
        if crate::players::club_uid_of_team(process, layout, team) != Some(to_club) {
            let club = crate::players::club_of_team(process, layout, team).unwrap_or_else(|| "-".to_owned());
            return Err(MoveError::JoinedOther { club });
        }
        Ok(EndedLoan {
            player: player.uid,
            from_club,
            to_club,
            starts: terms.starts,
            ends: terms.ends,
            wage: terms.wage,
            loan_listed,
        })
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
