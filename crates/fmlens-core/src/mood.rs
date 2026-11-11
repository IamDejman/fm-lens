//! Ending a player's reasons to be unhappy as the game does, and having the game work out a squad's mood again.
//!
//! The game keeps a player's reasons to be unhappy in a ring of ten (see [`crate::details::concern_entries`]). Its own
//! "Remove unhappiness" ends today each one that lasts and leaves it listed. An ended reason is what keeps the game
//! from raising the same one again: it waits ten days or more, by what the reason is about, after the last one of
//! its kind ended. A list emptied instead, as the editor emptied it before, leaves nothing to wait on, and the game
//! raises the reasons again the next day.
//!
//! A team's dynamics record keeps the dressing room atmosphere and the support for the manager as scores, each with
//! the date it was worked out. FM's Dynamics screen works a score out afresh, but the game's own logic, such as the
//! squad complaining about the atmosphere, reuses one for seven days. So a change to a player's mood resets those
//! dates, and the game works the scores out again from how the players feel now.
//!
//! A contract's happiness is not the game's to keep as written: it holds it in a band (-100 to 100) set by the worst
//! reason to be unhappy that lasts, and with none that counts, by the player's morale. A happiness written outside
//! that band is put back inside it, so [`Session::happiness_hold`] says what has to move with it.

use fmlens_mem::is_user_pointer;

use crate::date::FmDate;
use crate::details::{CONCERN_ENDED, CONCERN_SIZE, concern_entries};
use crate::edit::Entity;
use crate::players::PlayerSummary;
use crate::profile::DynamicsLayout;
use crate::session::Session;
use crate::transfer::{MoveError, Patch, Patches, PointerList};

/// The date the game gives a score it has not worked out yet: 1 January 1900.
const NEVER: [u8; 4] = [0x01, 0x00, 0x6C, 0x07];

/// The most teams of a club the editor looks at.
const MOST_TEAMS: u64 = 16;

/// The fields of a player that feed his squad's mood: a write to one resets the scores the game keeps of it.
pub(crate) const MOOD_FIELDS: [&str; 4] =
    ["morale", "contract.happiness", "contract.playing_time_happiness", "contract.unhappiness"];

/// Where a reason to be unhappy keeps what it is about, how bad it is, and how far the talk about it has got.
const CONCERN_MOTIVE: usize = 0x16;
const CONCERN_KIND: usize = 0x18;
const CONCERN_STATUS: usize = 0x19;

/// What it takes for the game to leave a player's happiness where an edit put it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct HappinessHold {
    /// Whether a reason to be unhappy that lasts holds his happiness elsewhere: ending them frees it.
    pub end_concerns: bool,
    /// The morale nearest his own that allows it, where his own does not.
    pub morale: Option<i64>,
}

/// Ending a player's reasons to be unhappy worked out: the writes that end each one that lasts.
#[derive(Debug, Clone)]
pub struct ConcernsPlan {
    pub player: u32,
    /// How many reasons end.
    pub concerns: usize,
    address: u64,
    patches: Vec<Patch>,
}

/// Reasons to be unhappy that were ended: what undoing it takes.
#[derive(Debug, Clone)]
pub struct ConcernsEnded {
    pub player: u32,
    pub concerns: usize,
    address: u64,
    patches: Vec<Patch>,
}

impl Session {
    /// Works out ending today every reason to be unhappy of `player` that lasts, as the game's own "Remove
    /// unhappiness" does: on his contract, and on his loan while he is on one. Nothing is written.
    pub fn plan_end_concerns(&self, player: &PlayerSummary) -> Result<ConcernsPlan, MoveError> {
        let c = &self.layout.contract;
        let contract = self.contract_of(player)?;
        let today = self.game_date().zip(self.raw_game_date());
        let (_, today) = today.ok_or(MoveError::Changed { address: contract })?;
        let mut patches = Patches::default();
        for contract in std::iter::once(contract).chain(self.loan_contract(player.address, player.shift)) {
            let record = self.process.read_u64(contract + c.unhappiness)?;
            for entry in concern_entries(&self.process, record) {
                let bytes = self.process.read_bytes(entry, CONCERN_SIZE)?;
                if lasts(&bytes) {
                    // The date as the game holds it, flags and all: what its own action writes here.
                    let ended = bytes[CONCERN_ENDED..CONCERN_ENDED + 4].to_vec();
                    patches.push(entry + CONCERN_ENDED as u64, ended, today.to_le_bytes());
                }
            }
        }
        if patches.0.is_empty() {
            return Err(MoveError::NotInList { index: 0 });
        }
        Ok(ConcernsPlan { player: player.uid, concerns: patches.0.len(), address: player.address, patches: patches.0 })
    }

    /// The contract of `player`, where he is still the player listed and the contract is his.
    fn contract_of(&self, player: &PlayerSummary) -> Result<u64, MoveError> {
        let (p, c) = (&self.layout.player, &self.layout.contract);
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        let contract = self.process.read_u64(player.address + p.at(p.contract, player.shift))?;
        let owner = player.address + p.at(p.identity(), player.shift);
        if !is_user_pointer(contract) || self.process.read_u64(contract + c.owner)? != owner {
            return Err(MoveError::NotInList { index: 0 });
        }
        Ok(contract)
    }

    /// What has to move with a happiness of `happiness` written to the contract of `player` for the game to leave it
    /// there: the reasons to be unhappy that hold it elsewhere, and a morale that allows it. `None` where his
    /// contract or morale cannot be read. Only reads memory.
    pub fn happiness_hold(&self, player: &PlayerSummary, happiness: i64) -> Option<HappinessHold> {
        let contract = self.contract_of(player).ok()?;
        let record = self.process.read_u64(contract + self.layout.contract.unhappiness).ok()?;
        let worst = concern_entries(&self.process, record)
            .into_iter()
            .filter_map(|entry| self.process.read_bytes(entry, CONCERN_SIZE).ok())
            .filter(|bytes| lasts(bytes))
            .filter_map(|bytes| {
                let motive = u16::from_le_bytes([bytes[CONCERN_MOTIVE], bytes[CONCERN_MOTIVE + 1]]);
                let kind = bytes[CONCERN_KIND] as i8;
                concern_counts(motive, kind, bytes[CONCERN_STATUS]).then_some(kind)
            })
            .max();
        let morale = self.field(Entity::Player, "morale").ok()?;
        let morale = self.read_field(&player.target(), &morale).ok()?;
        Some(hold(happiness, worst, morale))
    }

    /// Writes a planned ending, each write only over what the plan found, and has the game work out his squad's mood
    /// again.
    pub fn apply_end_concerns(&self, plan: &ConcernsPlan) -> Result<ConcernsEnded, MoveError> {
        self.apply_patches(&plan.patches)?;
        self.recheck_squad_mood(plan.address);
        Ok(ConcernsEnded {
            player: plan.player,
            concerns: plan.concerns,
            address: plan.address,
            patches: plan.patches.clone(),
        })
    }

    /// Has the reasons last again, provided they are still as the ending left them.
    pub fn undo_end_concerns(&self, done: &ConcernsEnded) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)?;
        self.recheck_squad_mood(done.address);
        Ok(())
    }

    /// Has the game work out again the dressing room atmosphere and the support for the manager of every team of the
    /// club the player at `player` plays for, by resetting the dates it worked them out on. Best effort: a team whose
    /// dynamics record does not check out is left alone.
    pub(crate) fn recheck_squad_mood(&self, player: u64) {
        let Some(d) = self.layout.dynamics.as_ref() else {
            return;
        };
        let Some(today) = self.read_game_date() else {
            return;
        };
        for team in self.teams_of_player(player) {
            let _ = self.forget_mood(team, d, today);
        }
    }

    /// The team the player at `player` plays for, and the other teams of its club.
    fn teams_of_player(&self, player: u64) -> Vec<u64> {
        let t = &self.layout.team;
        let Ok(team) = self.process.read_u64(player + self.layout.player.team) else {
            return Vec::new();
        };
        if !is_user_pointer(team) {
            return Vec::new();
        }
        let club = self.process.read_u64(team + t.club).ok().filter(|&club| is_user_pointer(club));
        let listed = club
            .and_then(|club| PointerList::read(&self.process, club + self.layout.club.teams).ok().flatten())
            .filter(|list| list.len() <= MOST_TEAMS)
            .and_then(|list| list.elements(&self.process).ok())
            .unwrap_or_default();
        let mut teams = vec![team];
        for other in listed {
            let belongs = is_user_pointer(other) && self.process.read_u64(other + t.club).ok() == club;
            if belongs && !teams.contains(&other) {
                teams.push(other);
            }
        }
        teams
    }

    /// When the game worked out the dressing room atmosphere and the support for the manager of each team of the club
    /// `player` plays for: the team, then the two dates, `None` for one not worked out yet. Only the teams whose
    /// dynamics record checks out. Only reads memory.
    pub fn squad_mood_dates(&self, player: &PlayerSummary) -> Vec<(u64, Option<FmDate>, Option<FmDate>)> {
        let Some(d) = self.layout.dynamics.as_ref() else {
            return Vec::new();
        };
        let date = |address: u64| {
            let raw = self.process.read_u32(address).ok()?;
            FmDate::from_raw(raw as u16, (raw >> 16) as u16)
        };
        self.teams_of_player(player.address)
            .into_iter()
            .filter_map(|team| Some((team, self.dynamics_record(team, d)?)))
            .map(|(team, record)| (team, date(record + d.atmosphere_date), date(record + d.support_date)))
            .collect()
    }

    /// The dynamics record of `team`, where it points back at the team.
    fn dynamics_record(&self, team: u64, d: &DynamicsLayout) -> Option<u64> {
        let holder = self.process.read_u64(team + d.holder).ok().filter(|&holder| is_user_pointer(holder))?;
        let record = self.process.read_u64(holder + d.record).ok().filter(|&record| is_user_pointer(record))?;
        (self.process.read_u64(record + d.team).ok()? == team).then_some(record)
    }

    /// Resets the dates the scores of `team` were worked out on, where its dynamics record checks out and holds
    /// dates the game could have put there: a day of this year or the last.
    fn forget_mood(&self, team: u64, d: &DynamicsLayout, today: FmDate) -> Option<()> {
        let record = self.dynamics_record(team, d)?;
        for at in [d.atmosphere_date, d.support_date] {
            let bytes = self.process.read_bytes(record + at, 4).ok()?;
            if worked_out_lately(&bytes, today) {
                self.process.write_bytes(record + at, &NEVER).ok()?;
            }
        }
        Some(())
    }
}

/// Whether the reason to be unhappy in `entry` lasts: it has no date it ended on.
fn lasts(entry: &[u8]) -> bool {
    let ended = &entry[CONCERN_ENDED..CONCERN_ENDED + 4];
    FmDate::from_raw(u16::from_le_bytes([ended[0], ended[1]]), u16::from_le_bytes([ended[2], ended[3]])).is_none()
}

/// Whether the game looks at a reason that lasts when it holds happiness: not one being talked over with the
/// manager (statuses 19 and 20), nor one about a motive it leaves out.
fn concern_counts(motive: u16, kind: i8, status: u8) -> bool {
    let left_out = motive == 0 || (900..=930).contains(&motive) || matches!(motive, 1100 | 1104 | 1106);
    kind >= -1 && !left_out && !matches!(status, 19 | 20)
}

/// The band the game holds happiness in while the worst reason that counts is of `kind`; `None` for a kind that
/// leaves it where it is.
fn concern_band(kind: i8) -> Option<(i64, i64)> {
    match kind {
        -1 | 1 => Some((-40, -20)),
        2 => Some((-60, -40)),
        3 | 4 => Some((-80, -60)),
        5 => Some((-100, -80)),
        6 | 99 | 100 => Some((-100, -100)),
        _ => None,
    }
}

/// The band the game holds the happiness of a player with no reason that counts in, by his morale (1 to 20).
fn morale_band(morale: i64) -> (i64, i64) {
    match morale {
        18.. => (80, 100),
        15..=17 => (60, 80),
        13..=14 => (40, 60),
        11..=12 => (20, 40),
        _ => (-20, 20),
    }
}

/// What has to move for `happiness` to stay, given the kind of the worst reason that counts and his morale. A
/// happiness under -20 only stays while a reason holds it there: without one the game brings it up to -20.
fn hold(happiness: i64, worst: Option<i8>, morale: i64) -> HappinessHold {
    let band = worst.and_then(concern_band);
    if band.is_some_and(|(low, high)| (low..=high).contains(&happiness)) {
        return HappinessHold::default();
    }
    let allows = |morale: i64| {
        let (low, high) = morale_band(morale);
        (low..=high).contains(&happiness.max(-20))
    };
    let nearest = || (1..=20).filter(|&other| allows(other)).min_by_key(|other| (other - morale).abs());
    HappinessHold { end_concerns: band.is_some(), morale: if allows(morale) { None } else { nearest() } }
}

/// Whether the four bytes of a date say a score was worked out this year or the last, up to today.
fn worked_out_lately(bytes: &[u8], today: FmDate) -> bool {
    let day = u16::from_le_bytes([bytes[0], bytes[1]]) & 0x1FF;
    let year = u16::from_le_bytes([bytes[2], bytes[3]]);
    (1..=366).contains(&day) && year + 1 >= today.year && (year, day) <= (today.year, today.day_of_year())
}

#[cfg(test)]
mod tests {
    use super::{HappinessHold, NEVER, concern_counts, hold, worked_out_lately};
    use crate::date::FmDate;
    use crate::profile::Layout;

    const WINDOWS: &str = include_str!("../../../profiles/fm27/layout.toml");
    const MACOS: &str = include_str!("../../../profiles/fm27/layout-macos.toml");

    /// The dynamics record is laid out the same on both systems, and reached the same way from a team.
    #[test]
    fn both_layouts_place_the_dynamics_record() {
        for text in [MACOS, WINDOWS] {
            let layout: Layout = toml::from_str(text).expect("FM27 layout");
            let d = layout.dynamics.as_ref().expect("dynamics layout");
            assert_eq!((d.holder, d.record, d.team), (0xA0, 0xC8, 0x40));
            assert_eq!((d.atmosphere_date, d.support_date), (0xA8, 0xAC));
        }
    }

    #[test]
    fn only_a_recent_date_is_reset() {
        let today = FmDate::from_number(20271210).expect("a date");
        let date = |day: u16, year: u16| [day.to_le_bytes(), year.to_le_bytes()].concat();
        // Three days ago, with the flags the game keeps above the day.
        assert!(worked_out_lately(&date(341 | 0x2000, 2027), today));
        assert!(worked_out_lately(&date(today.day_of_year(), 2027), today));
        assert!(worked_out_lately(&date(200, 2026), today));
        // Never worked out, long ago, in the future, or not a date.
        assert!(!worked_out_lately(&NEVER, today));
        assert!(!worked_out_lately(&date(341, 2025), today));
        assert!(!worked_out_lately(&date(345, 2027), today));
        assert!(!worked_out_lately(&date(0, 2027), today));
        assert!(!worked_out_lately(&date(400, 2027), today));
    }

    /// The reasons the squad raised on the day of the report: status 19, so the game left happiness to morale.
    #[test]
    fn a_reason_being_talked_over_does_not_hold_happiness() {
        assert!(!concern_counts(811, 1, 19));
        assert!(!concern_counts(811, 1, 20));
        assert!(concern_counts(570, 2, 4));
        // The motives the game leaves out, and a kind below -1.
        assert!(!concern_counts(0, 2, 4));
        assert!(!concern_counts(915, 2, 4));
        assert!(!concern_counts(1104, 2, 4));
        assert!(concern_counts(1101, 2, 4));
        assert!(!concern_counts(570, -2, 4));
    }

    #[test]
    fn a_happiness_the_morale_allows_needs_nothing() {
        assert_eq!(hold(100, None, 20), HappinessHold::default());
        assert_eq!(hold(80, None, 16), HappinessHold::default());
        assert_eq!(hold(20, None, 11), HappinessHold::default());
        assert_eq!(hold(-20, None, 3), HappinessHold::default());
    }

    #[test]
    fn morale_moves_to_the_nearest_that_allows_the_happiness() {
        let morale = |happiness, now| hold(happiness, None, now).morale;
        assert_eq!(morale(100, 11), Some(18));
        assert_eq!(morale(70, 11), Some(15));
        assert_eq!(morale(70, 20), Some(17));
        assert_eq!(morale(50, 20), Some(14));
        assert_eq!(morale(30, 5), Some(11));
        assert_eq!(morale(0, 20), Some(10));
        // Under -20 nothing but a reason holds it: the lowest band is the nearest the game allows.
        assert_eq!(morale(-90, 14), Some(10));
        assert_eq!(morale(-90, 6), None);
    }

    #[test]
    fn a_reason_that_holds_happiness_elsewhere_has_to_end() {
        // Kind 2 holds -60 to -40: inside it nothing moves, whatever his morale.
        assert_eq!(hold(-50, Some(2), 20), HappinessHold::default());
        assert_eq!(hold(100, Some(2), 20), HappinessHold { end_concerns: true, morale: None });
        assert_eq!(hold(100, Some(5), 9), HappinessHold { end_concerns: true, morale: Some(18) });
        assert_eq!(hold(-100, Some(6), 9), HappinessHold::default());
        // A kind that leaves happiness alone stays, and morale is made to allow it for when the reason ends.
        assert_eq!(hold(100, Some(0), 11), HappinessHold { end_concerns: false, morale: Some(18) });
        assert_eq!(hold(100, Some(50), 20), HappinessHold::default());
    }
}
