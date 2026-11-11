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

use fmlens_mem::is_user_pointer;

use crate::date::FmDate;
use crate::details::{CONCERN_ENDED, CONCERN_SIZE, concern_entries};
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
    /// unhappiness" does. Nothing is written.
    pub fn plan_end_concerns(&self, player: &PlayerSummary) -> Result<ConcernsPlan, MoveError> {
        let (p, c) = (&self.layout.player, &self.layout.contract);
        if self.process.read_u32(player.address + p.at(p.uid, player.shift))? != player.uid {
            return Err(MoveError::Moved { uid: player.uid });
        }
        let contract = self.process.read_u64(player.address + p.at(p.contract, player.shift))?;
        let owner = player.address + p.at(p.identity(), player.shift);
        if !is_user_pointer(contract) || self.process.read_u64(contract + c.owner)? != owner {
            return Err(MoveError::NotInList { index: 0 });
        }
        let record = self.process.read_u64(contract + c.unhappiness)?;
        let today = self.game_date().zip(self.raw_game_date());
        let (_, today) = today.ok_or(MoveError::Changed { address: record })?;
        let mut patches = Patches::default();
        for entry in concern_entries(&self.process, record) {
            let bytes = self.process.read_bytes(entry, CONCERN_SIZE)?;
            let ended = &bytes[CONCERN_ENDED..CONCERN_ENDED + 4];
            let lasts =
                FmDate::from_raw(u16::from_le_bytes([ended[0], ended[1]]), u16::from_le_bytes([ended[2], ended[3]]))
                    .is_none();
            if lasts {
                // The date as the game holds it, flags and all: what its own action writes here.
                patches.push(entry + CONCERN_ENDED as u64, ended.to_vec(), today.to_le_bytes());
            }
        }
        if patches.0.is_empty() {
            return Err(MoveError::NotInList { index: 0 });
        }
        Ok(ConcernsPlan { player: player.uid, concerns: patches.0.len(), address: player.address, patches: patches.0 })
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

/// Whether the four bytes of a date say a score was worked out this year or the last, up to today.
fn worked_out_lately(bytes: &[u8], today: FmDate) -> bool {
    let day = u16::from_le_bytes([bytes[0], bytes[1]]) & 0x1FF;
    let year = u16::from_le_bytes([bytes[2], bytes[3]]);
    (1..=366).contains(&day) && year + 1 >= today.year && (year, day) <= (today.year, today.day_of_year())
}

#[cfg(test)]
mod tests {
    use super::{NEVER, worked_out_lately};
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
}
