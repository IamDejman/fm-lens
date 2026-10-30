use std::ffi::c_void;
use std::path::PathBuf;

use windows_sys::Win32::Foundation::{APPMODEL_ERROR_NO_PACKAGE, ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS, HANDLE};
use windows_sys::Win32::Security::{GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation};
use windows_sys::Win32::Storage::Packaging::Appx::GetPackageFullName;
use windows_sys::Win32::System::Diagnostics::Debug::ReadProcessMemory;
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_NAME_WIN32, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    QueryFullProcessImageNameW,
};

use crate::error::{Error, Result, last_error};
use crate::handle::{OwnedHandle, create_snapshot, from_wide};

/// A process seen in a system snapshot; not opened.
#[derive(Debug, Clone)]
pub struct ProcessEntry {
    pub pid: u32,
    pub exe_name: String,
}

/// Lists running processes whose executable name equals `exe_name`, ignoring case.
pub fn find_processes(exe_name: &str) -> Result<Vec<ProcessEntry>> {
    let snapshot = create_snapshot(TH32CS_SNAPPROCESS, 0)?;
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;

    let mut found = Vec::new();
    let mut more = unsafe { Process32FirstW(snapshot.0, &mut entry) } != 0;
    while more {
        let name = from_wide(&entry.szExeFile);
        if name.eq_ignore_ascii_case(exe_name) {
            found.push(ProcessEntry { pid: entry.th32ProcessID, exe_name: name });
        }
        more = unsafe { Process32NextW(snapshot.0, &mut entry) } != 0;
    }
    Ok(found)
}

/// Whether this process runs elevated (as administrator).
pub fn is_current_process_elevated() -> bool {
    let mut token: HANDLE = std::ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
        return false;
    }
    let token = OwnedHandle(token);
    let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
    let mut returned = 0u32;
    let ok = unsafe {
        GetTokenInformation(
            token.0,
            TokenElevation,
            (&mut elevation as *mut TOKEN_ELEVATION).cast(),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        )
    };
    ok != 0 && elevation.TokenIsElevated != 0
}

/// A process opened for querying and reading memory. Write access is never requested.
pub struct Process {
    handle: OwnedHandle,
    pid: u32,
}

// Process handles may be used from any thread; ReadProcessMemory is thread-safe.
unsafe impl Send for Process {}
unsafe impl Sync for Process {}

impl Process {
    pub fn open_read(pid: u32) -> Result<Self> {
        let handle = unsafe { OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid) };
        if handle.is_null() {
            return Err(Error::last("OpenProcess"));
        }
        Ok(Self { handle: OwnedHandle(handle), pid })
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    pub(crate) fn raw_handle(&self) -> HANDLE {
        self.handle.0
    }

    /// Full path of the process executable.
    pub fn image_path(&self) -> Result<PathBuf> {
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = unsafe { QueryFullProcessImageNameW(self.handle.0, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len) };
        if ok == 0 {
            return Err(Error::last("QueryFullProcessImageNameW"));
        }
        Ok(PathBuf::from(String::from_utf16_lossy(&buf[..len as usize])))
    }

    /// Package full name of a packaged (Microsoft Store / Game Pass) process, `None` otherwise.
    pub fn package_full_name(&self) -> Result<Option<String>> {
        let mut len = 0u32;
        match unsafe { GetPackageFullName(self.handle.0, &mut len, std::ptr::null_mut()) } {
            APPMODEL_ERROR_NO_PACKAGE => return Ok(None),
            ERROR_INSUFFICIENT_BUFFER => {}
            code => return Err(Error::Win32 { op: "GetPackageFullName", code }),
        }
        let mut buf = vec![0u16; len as usize];
        match unsafe { GetPackageFullName(self.handle.0, &mut len, buf.as_mut_ptr()) } {
            ERROR_SUCCESS => Ok(Some(from_wide(&buf))),
            code => Err(Error::Win32 { op: "GetPackageFullName", code }),
        }
    }

    /// Fills `buf` from target memory at `addr`; fails unless every byte could be read.
    pub fn read_into(&self, addr: u64, buf: &mut [u8]) -> Result<()> {
        if buf.is_empty() {
            return Ok(());
        }
        let mut read = 0usize;
        let ok = unsafe {
            ReadProcessMemory(self.handle.0, addr as *const c_void, buf.as_mut_ptr().cast(), buf.len(), &mut read)
        };
        if ok == 0 || read != buf.len() {
            return Err(Error::Read { addr, len: buf.len(), code: last_error() });
        }
        Ok(())
    }

    pub fn read_bytes(&self, addr: u64, len: usize) -> Result<Vec<u8>> {
        let mut buf = vec![0u8; len];
        self.read_into(addr, &mut buf)?;
        Ok(buf)
    }

    pub fn read_u64(&self, addr: u64) -> Result<u64> {
        let mut b = [0u8; 8];
        self.read_into(addr, &mut b)?;
        Ok(u64::from_le_bytes(b))
    }

    pub fn read_u32(&self, addr: u64) -> Result<u32> {
        let mut b = [0u8; 4];
        self.read_into(addr, &mut b)?;
        Ok(u32::from_le_bytes(b))
    }
}
