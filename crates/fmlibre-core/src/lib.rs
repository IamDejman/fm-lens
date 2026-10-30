//! Football Manager specific logic shared by the probe and the app: recognising a
//! running game, locating its entity arrays and decoding what they hold.

#![cfg(windows)]

mod calibrate;
mod date;
mod details;
mod game;
mod players;
mod profile;
mod scan;
mod session;
mod text;

pub use calibrate::{ArrayRef, EntityArrays, calibrate};
pub use date::FmDate;
pub use details::{
    ATTRIBUTE_GROUPS, Attribute, Contract, International, PERSONALITY, POSITIONS, PlayerDetails, Reputation,
    read_player_details,
};
pub use game::{GAME_EXE, GAME_PLUGIN, GameInfo, Storefront};
pub use players::{PlayerIndex, PlayerSummary, read_players};
pub use profile::{
    ArrayRvas, BuildProfile, ContractLayout, Layout, PlayerLayout, PluginFingerprint, layout_for, profile_for,
};
pub use scan::{ArrayCandidate, ScanOptions, VtableCount, scan_object_arrays};
pub use session::{ArraySource, Session, SessionError, find_game};
pub use text::{fold, is_name_like, read_fm_string, read_name_entry};
