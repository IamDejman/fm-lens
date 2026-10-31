//! Access to another process's memory on Windows.
//!
//! This crate knows nothing about Football Manager. It finds and opens
//! processes, lists their modules and memory regions, reads bytes and parses
//! PE headers straight from the target's memory. It writes only through
//! [`Process::write_bytes`], on a process opened for writing, and only into heap
//! data: never into a module's code or data.

#![cfg(windows)]

mod error;
mod handle;
mod module;
mod pe;
mod process;
mod region;

pub use error::{Error, Result};
pub use module::{Module, list_modules};
pub use pe::{Export, PeImage, Section};
pub use process::{Process, ProcessEntry, find_processes, is_current_process_elevated};
pub use region::{Region, region_at, regions};

/// Whether `p` looks like a user-mode pointer: 8-byte aligned and inside the
/// canonical user address range of a 64-bit Windows process.
pub fn is_user_pointer(p: u64) -> bool {
    p.is_multiple_of(8) && (0x1_0000..0x7FFF_FFFF_0000).contains(&p)
}
