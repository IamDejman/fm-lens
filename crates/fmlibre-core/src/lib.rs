//! Football Manager specific logic shared by the probe and the app: recognising a
//! running game, locating its entity arrays, decoding what they hold and changing it.

#![cfg(any(windows, target_os = "macos"))]

#[cfg(target_os = "macos")]
pub mod bridge_setup;
mod calibrate;
mod clubs;
mod coded;
mod date;
mod details;
mod edit;
mod filter;
mod game;
mod graphics;
mod index;
mod mass;
mod medical;
mod players;
mod profile;
mod scan;
mod session;
mod squad;
mod staff;
mod text;
mod transfer;

pub use calibrate::{ArrayRef, EntityArrays, calibrate};
pub use clubs::{
    ClubDetails, ClubIndex, ClubSummary, Finances, SUPPORTER_MIX, SUPPORTER_TRAITS, read_club_details, read_clubs,
};
pub use coded::Coded;
pub use date::FmDate;
pub use details::{
    ATTRIBUTE_GROUPS, Attribute, Contract, International, PERSONALITY, POSITIONS, PlayerDetails, Reputation,
    read_player_details,
};
pub use edit::{Change, EditError, Entity, Field, Kind, Scale, Target, fields};
pub use filter::{AttributeBound, ClubFilter, PlayerFilter, PlayerOrder, PlayerSort, StaffFilter, sort_players};
pub use game::{GAME_EXE, GAME_PLUGIN, GameInfo, Storefront};
pub use graphics::{GraphicsCounts, GraphicsIndex, Picture};
pub use index::{Listed, SearchIndex};
pub use mass::{Operation, Plan, Planned, Skipped};
pub use medical::{HealPlan, Healed, Injury};
pub use players::{Nation, PLAYABLE_RATING, PlayerIndex, PlayerSummary, nations, read_players};
pub use profile::{
    ArrayRvas, BuildProfile, ContractLayout, Layout, PlayerLayout, PluginFingerprint, StaffLayout, layout_for,
    profile_for,
};
pub use scan::{ArrayCandidate, ScanOptions, VtableCount, scan_object_arrays};
pub use session::{ArraySource, Session, SessionError, find_game};
pub use squad::{CaptainPlan, CaptainRole, CaptainSet, ClubTeam, Loan, SquadMember};
pub use staff::{
    STAFF_ATTRIBUTE_GROUPS, StaffContract, StaffDetails, StaffIndex, StaffSummary, job_name, read_staff,
    read_staff_details,
};
pub use text::{fold, is_name_like, read_fm_string, read_name_entry};
pub use transfer::{Amounts, ClubMoney, ClubMove, FeePlan, MAX_FEE, MoveError, MovePlan, MoveTerms, Paid};
