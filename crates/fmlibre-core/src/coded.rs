//! Errors the app can say in the user's language. Each has a stable code, such as
//! `edit.outOfRange`, and names the values its message mentions, so the window can put
//! the message together in Turkish as well as show the English one.

use fmlibre_mem::Error as MemoryError;

/// A failure with a stable code and the values its message names.
pub trait Coded: std::fmt::Display {
    fn code(&self) -> &'static str;

    /// The values the message names, as text, by name.
    fn params(&self) -> Vec<(&'static str, String)> {
        Vec::new()
    }
}

impl Coded for MemoryError {
    fn code(&self) -> &'static str {
        match self {
            #[cfg(windows)]
            MemoryError::Win32 { .. } => "memory.win32",
            #[cfg(target_os = "macos")]
            MemoryError::Mach { .. } => "memory.mach",
            #[cfg(target_os = "macos")]
            MemoryError::Posix { .. } => "memory.posix",
            #[cfg(target_os = "macos")]
            MemoryError::NoBridge { .. } => "memory.noBridge",
            #[cfg(target_os = "macos")]
            MemoryError::Bridge { .. } => "memory.bridge",
            MemoryError::Read { .. } => "memory.read",
            MemoryError::Write { .. } => "memory.write",
            MemoryError::ReadOnly => "memory.readOnly",
            MemoryError::NotWritable { .. } => "memory.notWritable",
            #[cfg(windows)]
            MemoryError::InvalidPe { .. } => "memory.invalidPe",
            #[cfg(target_os = "macos")]
            MemoryError::InvalidMachO { .. } => "memory.invalidMachO",
        }
    }

    fn params(&self) -> Vec<(&'static str, String)> {
        match self {
            #[cfg(windows)]
            MemoryError::Win32 { op, code } => vec![("operation", (*op).to_owned()), ("code", code.to_string())],
            #[cfg(target_os = "macos")]
            MemoryError::Mach { op, code } | MemoryError::Posix { op, code } => {
                vec![("operation", (*op).to_owned()), ("code", code.to_string())]
            }
            #[cfg(target_os = "macos")]
            MemoryError::NoBridge { pid } => vec![("pid", pid.to_string())],
            #[cfg(target_os = "macos")]
            MemoryError::Bridge { pid, reason } => vec![("pid", pid.to_string()), ("reason", (*reason).to_owned())],
            MemoryError::Read { addr, code, .. } | MemoryError::Write { addr, code, .. } => {
                vec![("address", format!("{addr:#x}")), ("code", code.to_string())]
            }
            MemoryError::NotWritable { addr, .. } => vec![("address", format!("{addr:#x}"))],
            #[cfg(windows)]
            MemoryError::InvalidPe { base, .. } => vec![("address", format!("{base:#x}"))],
            #[cfg(target_os = "macos")]
            MemoryError::InvalidMachO { base, .. } => vec![("address", format!("{base:#x}"))],
            MemoryError::ReadOnly => Vec::new(),
        }
    }
}
