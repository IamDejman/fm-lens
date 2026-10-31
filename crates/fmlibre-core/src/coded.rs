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
            MemoryError::Win32 { .. } => "memory.win32",
            MemoryError::Read { .. } => "memory.read",
            MemoryError::Write { .. } => "memory.write",
            MemoryError::ReadOnly => "memory.readOnly",
            MemoryError::NotWritable { .. } => "memory.notWritable",
            MemoryError::InvalidPe { .. } => "memory.invalidPe",
        }
    }

    fn params(&self) -> Vec<(&'static str, String)> {
        match self {
            MemoryError::Win32 { op, code } => vec![("operation", (*op).to_owned()), ("code", code.to_string())],
            MemoryError::Read { addr, code, .. } | MemoryError::Write { addr, code, .. } => {
                vec![("address", format!("{addr:#x}")), ("code", code.to_string())]
            }
            MemoryError::NotWritable { addr, .. } | MemoryError::InvalidPe { base: addr, .. } => {
                vec![("address", format!("{addr:#x}"))]
            }
            MemoryError::ReadOnly => Vec::new(),
        }
    }
}
