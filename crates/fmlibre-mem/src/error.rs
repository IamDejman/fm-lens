use std::fmt;

#[cfg(windows)]
use windows_sys::Win32::Foundation::{ERROR_ACCESS_DENIED, ERROR_PARTIAL_COPY, GetLastError};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone)]
pub enum Error {
    /// A Win32 call failed with the given error code.
    #[cfg(windows)]
    Win32 { op: &'static str, code: u32 },
    /// A Mach call failed with the given `kern_return_t`.
    #[cfg(target_os = "macos")]
    Mach { op: &'static str, code: i32 },
    /// A BSD call failed with the given `errno`.
    #[cfg(target_os = "macos")]
    Posix { op: &'static str, code: i32 },
    /// macOS lets no other process into the game's memory, and the game was started without
    /// the FMLibreEditor bridge, the library that hands its memory over.
    #[cfg(target_os = "macos")]
    NoBridge { pid: u32 },
    /// The bridge in the game did not hand its memory over, for `reason`.
    #[cfg(target_os = "macos")]
    Bridge { pid: u32, reason: &'static str },
    /// Reading target memory failed (unmapped, guarded or freed pages).
    Read { addr: u64, len: usize, code: u32 },
    /// Writing target memory failed.
    Write { addr: u64, len: usize, code: u32 },
    /// The process was opened for reading only.
    ReadOnly,
    /// The range is not data the editor may change: it must lie in one region of
    /// committed, private, writable, non-executable memory (the heap), never in a module.
    NotWritable { addr: u64, len: usize },
    /// The bytes at `base` are not a 64-bit PE image.
    #[cfg(windows)]
    InvalidPe { base: u64, reason: &'static str },
    /// The bytes at `base` are not a 64-bit Mach-O image.
    #[cfg(target_os = "macos")]
    InvalidMachO { base: u64, reason: &'static str },
}

impl Error {
    #[cfg(windows)]
    pub(crate) fn last(op: &'static str) -> Self {
        Error::Win32 { op, code: last_error() }
    }

    #[cfg(target_os = "macos")]
    pub(crate) fn last_posix(op: &'static str) -> Self {
        Error::Posix { op, code: std::io::Error::last_os_error().raw_os_error().unwrap_or(0) }
    }

    /// True when Windows refused access to the process.
    #[cfg(windows)]
    pub fn is_access_denied(&self) -> bool {
        matches!(self, Error::Win32 { code: ERROR_ACCESS_DENIED, .. })
    }

    /// Always false: macOS refuses with [`Error::NoBridge`], which running as root does not change.
    #[cfg(target_os = "macos")]
    pub fn is_access_denied(&self) -> bool {
        false
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            #[cfg(windows)]
            Error::Win32 { op, code } => write!(f, "{op} failed: {}", describe(*code)),
            #[cfg(target_os = "macos")]
            Error::Mach { op, code } => write!(f, "{op} failed: {}", describe(*code as u32)),
            #[cfg(target_os = "macos")]
            Error::Posix { op, code } => {
                write!(f, "{op} failed: {} (errno {code})", std::io::Error::from_raw_os_error(*code))
            }
            #[cfg(target_os = "macos")]
            Error::NoBridge { pid } => write!(
                f,
                "macOS does not let FMLibreEditor into the game (pid {pid}): it was started without the \
                 FMLibreEditor bridge. Set the bridge up, then restart the game from Steam"
            ),
            #[cfg(target_os = "macos")]
            Error::Bridge { pid, reason } => {
                write!(f, "the FMLibreEditor bridge in the game (pid {pid}) did not hand it over: {reason}")
            }
            Error::Read { addr, len, code } => {
                write!(f, "reading {len:#x} bytes at {addr:#x} failed: {}", describe(*code))
            }
            Error::Write { addr, len, code } => {
                write!(f, "writing {len:#x} bytes at {addr:#x} failed: {}", describe(*code))
            }
            Error::ReadOnly => write!(f, "the game was opened for reading only"),
            Error::NotWritable { addr, len } => {
                write!(f, "refusing to write {len:#x} bytes at {addr:#x}: not in the game's writable heap memory")
            }
            #[cfg(windows)]
            Error::InvalidPe { base, reason } => write!(f, "no valid PE image at {base:#x}: {reason}"),
            #[cfg(target_os = "macos")]
            Error::InvalidMachO { base, reason } => write!(f, "no valid Mach-O image at {base:#x}: {reason}"),
        }
    }
}

impl std::error::Error for Error {}

#[cfg(windows)]
fn describe(code: u32) -> String {
    match code {
        ERROR_ACCESS_DENIED => "access denied (Win32 error 5)".to_owned(),
        ERROR_PARTIAL_COPY => "only part of the range is readable (Win32 error 299)".to_owned(),
        code => format!("Win32 error {code}"),
    }
}

/// A `kern_return_t` in words, e.g. "(os/kern) invalid address (Mach error 1)".
#[cfg(target_os = "macos")]
fn describe(code: u32) -> String {
    format!("{} (Mach error {code})", crate::macos::mach_error_text(code as i32))
}

#[cfg(windows)]
pub(crate) fn last_error() -> u32 {
    unsafe { GetLastError() }
}
