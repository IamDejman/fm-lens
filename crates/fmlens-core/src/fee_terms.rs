//! What is still owed on a transfer: the instalments of a fee, and a buy-back clause the selling club kept.
//!
//! Instalments are records of `TRANSFER_MANAGER`'s own list, one for each fee paid over time: the club that pays, the
//! club that is paid, the amount a month and the months left. A buy-back clause is a `db::PLAYER_BUY_BACK_INFO` in the
//! list of deals of the club the player is contracted to: the fee, the days it can be used between, and the club that
//! holds it. Both are found from the player and read; their amounts and dates are edited as fields (see
//! [`crate::edit`]).

use fmlens_mem::is_user_pointer;
use serde::Serialize;

use crate::date::FmDate;
use crate::players::PlayerSummary;
use crate::session::Session;
use crate::text::read_fm_string;

/// The most instalment records the manager's list is read with; the save measured had 1,158.
const MOST_RECORDS: u64 = 100_000;
/// The most deals one club's list is read with; the longest measured had 26.
const MOST_DEALS: u64 = 4_096;
/// The most instalments of one player the profile shows and the editor changes.
pub const MOST_INSTALMENTS: usize = 4;

/// A fee still being paid for a player, a month at a time.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Instalment {
    /// The club that pays.
    pub payer: Option<String>,
    pub payer_uid: Option<u32>,
    /// The club that is paid.
    pub receiver: Option<String>,
    pub receiver_uid: Option<u32>,
    /// The day the fee was agreed.
    pub agreed: Option<FmDate>,
    /// Pounds for each month; paid every `period` months, that many months' worth at a time.
    pub amount: i32,
    /// Months between payments: 1, 6 or 12 in the saves read.
    pub period: u8,
    pub months_left: u8,
}

/// The right of a club that sold a player to buy him back.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuyBack {
    /// The club that holds the right.
    pub club: Option<String>,
    pub club_uid: Option<u32>,
    /// Pounds.
    pub fee: i32,
    pub starts: Option<FmDate>,
    pub ends: Option<FmDate>,
}

impl Session {
    /// The name and UID of the club object at `club`.
    fn club_named(&self, club: u64) -> (Option<String>, Option<u32>) {
        if !is_user_pointer(club) {
            return (None, None);
        }
        let c = &self.layout.club;
        let name = self.process.read_u64(club + c.name).ok().and_then(|name| read_fm_string(&self.process, name));
        (name, self.process.read_u32(club + c.uid).ok())
    }

    /// The pointers of the vector (begin, end) at `at`, of at most `most`; none where it does not read as one.
    fn pointers_at(&self, at: u64, most: u64) -> Option<Vec<u64>> {
        let begin = self.process.read_u64(at).ok()?;
        let end = self.process.read_u64(at + 8).ok()?;
        let count = end.checked_sub(begin).filter(|len| len % 8 == 0)? / 8;
        if count == 0 {
            return Some(Vec::new());
        }
        if !is_user_pointer(begin) || count > most {
            return None;
        }
        let bytes = self.process.read_bytes(begin, (count * 8) as usize).ok()?;
        Some(bytes.as_chunks::<8>().0.iter().map(|word| u64::from_le_bytes(*word)).collect())
    }

    /// The instalment records of the player at `address`, whose person block is shifted by `shift`, in the manager's
    /// order; none where the layout places no fee terms or the manager is not where it says. Each names two clubs,
    /// pays every 1 to 12 months and has months left. Only reads memory.
    pub(crate) fn instalment_records(&self, address: u64, shift: u64) -> Vec<u64> {
        let found = || {
            let t = self.layout.fee_terms.as_ref()?;
            let slot = self.profile.as_ref()?.transfer_manager?;
            let manager = self.process.read_u64(self.plugin.base + slot).ok().filter(|&m| is_user_pointer(m))?;
            if crate::rtti::class_of(&self.process, &self.plugin, manager).as_deref() != Some(t.manager_class.as_str())
            {
                return None;
            }
            let id = self.process.read_u32(address + self.layout.player.at(t.person, shift)).ok()?;
            let records = self.pointers_at(manager + t.instalments, MOST_RECORDS)?;
            let his = |&record: &u64| {
                if !is_user_pointer(record) || self.process.read_u32(record + t.instalment_person).ok() != Some(id) {
                    return false;
                }
                let Ok(bytes) = self.process.read_bytes(record, t.instalment_size as usize) else {
                    return false;
                };
                let club = |at: u64| u64::from_le_bytes(bytes[at as usize..at as usize + 8].try_into().expect("8"));
                let (period, left) = (bytes[t.instalment_period as usize], bytes[t.instalment_months as usize]);
                is_user_pointer(club(t.instalment_payer))
                    && is_user_pointer(club(t.instalment_receiver))
                    && (1..=12).contains(&period)
                    && (1..=120).contains(&left)
            };
            Some(records.into_iter().filter(his).take(MOST_INSTALMENTS).collect::<Vec<_>>())
        };
        found().unwrap_or_default()
    }

    /// The fees still being paid for `player`. Only reads memory.
    pub fn instalments(&self, player: &PlayerSummary) -> Vec<Instalment> {
        let Some(t) = self.layout.fee_terms.as_ref() else {
            return Vec::new();
        };
        self.instalment_records(player.address, player.shift)
            .into_iter()
            .filter_map(|record| {
                let bytes = self.process.read_bytes(record, t.instalment_size as usize).ok()?;
                let u16_at = |at: u64| u16::from_le_bytes([bytes[at as usize], bytes[at as usize + 1]]);
                let u64_at = |at: u64| u64::from_le_bytes(bytes[at as usize..at as usize + 8].try_into().expect("8"));
                let (payer, payer_uid) = self.club_named(u64_at(t.instalment_payer));
                let (receiver, receiver_uid) = self.club_named(u64_at(t.instalment_receiver));
                let amount = t.instalment_amount as usize;
                Some(Instalment {
                    payer,
                    payer_uid,
                    receiver,
                    receiver_uid,
                    agreed: FmDate::from_raw(u16_at(t.instalment_agreed), u16_at(t.instalment_agreed + 2)),
                    amount: i32::from_le_bytes(bytes[amount..amount + 4].try_into().expect("4 bytes")),
                    period: bytes[t.instalment_period as usize],
                    months_left: bytes[t.instalment_months as usize],
                })
            })
            .collect()
    }

    /// The buy-back clause on the player at `address`, whose person block is shifted by `shift`: the record of the
    /// buy-back class that names him, in the list of deals of the club his contract is with. Only reads memory.
    pub(crate) fn buy_back_record(&self, address: u64, shift: u64) -> Option<u64> {
        let (t, p) = (self.layout.fee_terms.as_ref()?, &self.layout.player);
        let pointer = |at: u64| self.process.read_u64(at).ok().filter(|&p| is_user_pointer(p));
        let uid = self.process.read_u32(address + p.uid).ok()?;
        let contract = pointer(address + p.at(p.contract, shift))?;
        let team = pointer(contract + self.layout.contract.team)?;
        let club = pointer(team + self.layout.team.club)?;
        let deals = pointer(club + t.club_deals)?;
        self.pointers_at(deals, MOST_DEALS)?.into_iter().find(|&deal| {
            is_user_pointer(deal)
                && self.process.read_u32(deal + t.buy_back_player).ok() == Some(uid)
                && crate::rtti::class_of(&self.process, &self.plugin, deal).as_deref()
                    == Some(t.buy_back_class.as_str())
        })
    }

    /// The buy-back clause on `player`, if a club holds one. Only reads memory.
    pub fn buy_back(&self, player: &PlayerSummary) -> Option<BuyBack> {
        let t = self.layout.fee_terms.as_ref()?;
        let record = self.buy_back_record(player.address, player.shift)?;
        let bytes = self.process.read_bytes(record, t.buy_back_size as usize).ok()?;
        let u16_at = |at: u64| u16::from_le_bytes([bytes[at as usize], bytes[at as usize + 1]]);
        let date = |at: u64| FmDate::from_raw(u16_at(at), u16_at(at + 2));
        let holder = t.buy_back_club as usize;
        let (club, club_uid) = self.club_named(u64::from_le_bytes(bytes[holder..holder + 8].try_into().expect("8")));
        let fee = t.buy_back_fee as usize;
        Some(BuyBack {
            club,
            club_uid,
            fee: i32::from_le_bytes(bytes[fee..fee + 4].try_into().expect("4 bytes")),
            starts: date(t.buy_back_starts),
            ends: date(t.buy_back_ends),
        })
    }
}
