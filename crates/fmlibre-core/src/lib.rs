//! Football Manager specific logic shared by the probe and the app:
//! recognising a running game and locating its object arrays.

#![cfg(windows)]

mod game;
mod scan;

pub use game::{GAME_EXE, GAME_PLUGIN, GameInfo, Storefront};
pub use scan::{ArrayCandidate, ScanOptions, VtableCount, scan_object_arrays};
