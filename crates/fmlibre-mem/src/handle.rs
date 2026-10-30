use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::System::Diagnostics::ToolHelp::CreateToolhelp32Snapshot;

use crate::error::{Error, Result};

/// A Win32 handle that is closed on drop.
pub(crate) struct OwnedHandle(pub(crate) HANDLE);

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

pub(crate) fn create_snapshot(flags: u32, pid: u32) -> Result<OwnedHandle> {
    let handle = unsafe { CreateToolhelp32Snapshot(flags, pid) };
    if handle == INVALID_HANDLE_VALUE {
        return Err(Error::last("CreateToolhelp32Snapshot"));
    }
    Ok(OwnedHandle(handle))
}

/// Converts a NUL-terminated UTF-16 buffer to a `String`.
pub(crate) fn from_wide(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}
