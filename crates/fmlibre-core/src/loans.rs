//! A loaned player's loan: a contract of its own (`db::LOAN_CONTRACT` on macOS), besides the contract with his parent
//! club, which he keeps. The player points at a slot that points at it; it is laid out as a contract
//! ([`ContractLayout`]): its owner is the player, its team the borrowing club's, its wage what the borrower pays, and
//! its expiry when the loan ends.
//!
//! [`ContractLayout`]: crate::profile::ContractLayout

use fmlibre_mem::is_user_pointer;
use serde::Serialize;

use crate::date::FmDate;
use crate::players::{PlayerSummary, club_of_team, club_uid_of_team};
use crate::session::Session;

/// The terms of a player's loan, as the profile shows them; the club he plays for is the borrower.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoanTerms {
    /// The club he is on loan from: the one his own contract is with.
    pub parent: Option<String>,
    pub parent_uid: Option<u32>,
    /// Pounds per week the borrowing club pays of his wage.
    pub wage: i32,
    pub starts: Option<FmDate>,
    pub ends: Option<FmDate>,
}

impl Session {
    /// The loan contract of the player at `address`, whose person block is shifted by `shift`, where the layout
    /// places loans and every step checks out: the slot and the contract are the game's, the contract is of the loan
    /// class and its owner is the player. Only reads memory.
    pub(crate) fn loan_contract(&self, address: u64, shift: u64) -> Option<u64> {
        let (l, p) = (self.layout.loan.as_ref()?, &self.layout.player);
        let slot = self.process.read_u64(address + p.at(l.slot, shift)).ok().filter(|&s| is_user_pointer(s))?;
        let loan = self.process.read_u64(slot).ok().filter(|&c| is_user_pointer(c))?;
        if crate::rtti::class_of(&self.process, &self.plugin, loan).as_deref() != Some(l.class.as_str()) {
            return None;
        }
        let owner = self.process.read_u64(loan + self.layout.contract.owner).ok()?;
        (owner == address + p.identity() + shift).then_some(loan)
    }

    /// The terms of the loan `player` is on, if he is on one. Only reads memory.
    pub fn loan(&self, player: &PlayerSummary) -> Option<LoanTerms> {
        let loan = self.loan_contract(player.address, player.shift)?;
        let c = &self.layout.contract;
        let bytes = self.process.read_bytes(loan, c.end() as usize).ok()?;
        let u16_at = |at: u64| u16::from_le_bytes([bytes[at as usize], bytes[at as usize + 1]]);
        let date = |at: u64| FmDate::from_raw(u16_at(at), u16_at(at + 2));
        // His own contract is with the parent club's team.
        let p = &self.layout.player;
        let contract = self.process.read_u64(player.address + p.at(p.contract, player.shift)).unwrap_or(0);
        let team = is_user_pointer(contract).then(|| self.process.read_u64(contract + c.team).ok()).flatten();
        let team = team.filter(|&team| is_user_pointer(team)).unwrap_or(0);
        Some(LoanTerms {
            parent: (team != 0).then(|| club_of_team(&self.process, &self.layout, team)).flatten(),
            parent_uid: club_uid_of_team(&self.process, &self.layout, team),
            wage: i32::from_le_bytes(bytes[c.wage as usize..c.wage as usize + 4].try_into().expect("4 bytes")),
            starts: date(c.joined),
            ends: date(c.expires),
        })
    }
}
