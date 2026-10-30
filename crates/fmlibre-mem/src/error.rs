use std::fmt;

use windows_sys::Win32::Foundation::{ERROR_ACCESS_DENIED, ERROR_PARTIAL_COPY, GetLastError};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone)]
pub enum Error {
    /// A Win32 call failed with the given error code.
    Win32 { op: &'static str, code: u32 },
    /// Reading target memory failed (unmapped, guarded or freed pages).
    Read { addr: u64, len: usize, code: u32 },
    /// The bytes at `base` are not a 64-bit PE image.
    InvalidPe { base: u64, reason: &'static str },
}

impl Error {
    pub(crate) fn last(op: &'static str) -> Self {
        Error::Win32 { op, code: last_error() }
    }

    /// True when Windows refused access to the process.
    pub fn is_access_denied(&self) -> bool {
        matches!(self, Error::Win32 { code: ERROR_ACCESS_DENIED, .. })
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Win32 { op, code } => write!(f, "{op} failed: {}", describe(*code)),
            Error::Read { addr, len, code } => {
                write!(f, "reading {len:#x} bytes at {addr:#x} failed: {}", describe(*code))
            }
            Error::InvalidPe { base, reason } => write!(f, "no valid PE image at {base:#x}: {reason}"),
        }
    }
}

impl std::error::Error for Error {}

fn describe(code: u32) -> String {
    match code {
        ERROR_ACCESS_DENIED => "access denied (Win32 error 5)".to_owned(),
        ERROR_PARTIAL_COPY => "only part of the range is readable (Win32 error 299)".to_owned(),
        code => format!("Win32 error {code}"),
    }
}

pub(crate) fn last_error() -> u32 {
    unsafe { GetLastError() }
}
