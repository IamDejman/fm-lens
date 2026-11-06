use std::path::PathBuf;

use windows_sys::Win32::Foundation::ERROR_BAD_LENGTH;
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    MODULEENTRY32W, Module32FirstW, Module32NextW, TH32CS_SNAPMODULE, TH32CS_SNAPMODULE32,
};

use super::handle::{create_snapshot, from_wide};
use super::process::Process;
use crate::error::{Error, Result};
use crate::module::Module;

/// Lists the modules of `process`.
pub fn list_modules(process: &Process) -> Result<Vec<Module>> {
    // The snapshot fails with ERROR_BAD_LENGTH while the loader is busy; retry a few times.
    let mut attempts = 0;
    let snapshot = loop {
        match create_snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, process.pid()) {
            Err(Error::Win32 { code: ERROR_BAD_LENGTH, .. }) if attempts < 10 => attempts += 1,
            other => break other?,
        }
    };

    let mut entry: MODULEENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = size_of::<MODULEENTRY32W>() as u32;

    let mut modules = Vec::new();
    let mut more = unsafe { Module32FirstW(snapshot.0, &mut entry) } != 0;
    while more {
        modules.push(Module {
            name: from_wide(&entry.szModule),
            base: entry.modBaseAddr as u64,
            size: entry.modBaseSize as u64,
            path: PathBuf::from(from_wide(&entry.szExePath)),
        });
        more = unsafe { Module32NextW(snapshot.0, &mut entry) } != 0;
    }
    Ok(modules)
}
