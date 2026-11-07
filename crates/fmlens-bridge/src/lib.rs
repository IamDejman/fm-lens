//! The library FM Lens has Football Manager load: on macOS so that FM Lens can reach the game's memory
//! ([`macos`]), and on both macOS and Windows to run some of the game's own functions on its main thread
//! ([`fmlens_mem::call`]).
//!
//! It runs inside the game, so it never panics and stays idle whenever something is not as it expects.

#![cfg(any(target_os = "macos", windows))]

#[cfg(target_os = "macos")]
mod calls;
#[cfg(target_os = "macos")]
mod macos;
mod run;
#[cfg(windows)]
mod windows;
