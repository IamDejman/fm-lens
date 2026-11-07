//! How the editor has the game run a call ([`crate::call`]) on Windows, and what the bridge library and the
//! editor say to each other.
//!
//! Windows lets the editor into the game's memory but not onto its main thread, where the game's own screens
//! run their edits. For each call the editor puts the request in a shared section that only its own user may
//! open, hooks the messages of the game's main thread with the bridge library (`fmlens-bridge`) and posts the
//! game's window one message. Windows loads the library into the game to deliver it; the library takes the
//! request, runs it there and writes the answer back. The editor then takes its hook away and Windows unloads
//! the library: nothing of FM Lens stays in the game between calls.

use std::ffi::CStr;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{
    ERROR_ALREADY_EXISTS, FreeLibrary, GetLastError, HMODULE, HWND, INVALID_HANDLE_VALUE, LPARAM, LocalFree,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, GetSecurityInfo, SDDL_REVISION_1,
    SE_KERNEL_OBJECT,
};
use windows_sys::Win32::Security::{
    EqualSid, GetTokenInformation, OWNER_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, PSID, SECURITY_ATTRIBUTES,
    TOKEN_QUERY, TOKEN_USER, TokenUser,
};
use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
use windows_sys::Win32::System::Memory::{
    CreateFileMappingW, FILE_MAP_READ, FILE_MAP_WRITE, MEMORY_MAPPED_VIEW_ADDRESS, MapViewOfFile, OpenFileMappingW,
    PAGE_READWRITE, UnmapViewOfFile,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GW_OWNER, GetWindow, GetWindowThreadProcessId, HHOOK, IsWindowVisible, PostMessageW,
    RegisterWindowMessageW, SetWindowsHookExW, UnhookWindowsHookEx, WH_GETMESSAGE,
};
use windows_sys::core::{BOOL, PWSTR};

use super::handle::OwnedHandle;
use crate::call::{MAX_STEPS, Outcome, Program, SCRATCH_SIZE, Status, Step};
use crate::error::{Error, Result};

/// The file name of the bridge library.
pub const LIBRARY: &str = "fmlens_bridge.dll";

/// The hook procedure the bridge library exports.
pub const HOOK: &CStr = c"fmlens_bridge_hook";

/// The registered window message that asks the bridge library to run a call. Its `wParam` is the call's
/// number and its `lParam` the editor's process id, which together name the section of the request.
pub const MESSAGE: &str = "FMLensBridgeCall";

/// "FMLB": the first four bytes of a request.
pub const MAGIC: u32 = u32::from_le_bytes(*b"FMLB");

/// The layout of [`Shared`]. The library ships with the editor, so the two always agree; the bridge refuses
/// any other.
pub const VERSION: u32 = 1;

/// How long the editor waits for the game's main thread to take a call up, in milliseconds.
pub const CALL_START_MS: u32 = 10_000;

/// How long the editor waits for a call that has started to end, in milliseconds.
const CALL_TIMEOUT_MS: u32 = CALL_START_MS + 20_000;

/// `READ_CONTROL`: the right to read an object's owner.
const READ_CONTROL: u32 = 0x0002_0000;

/// Where a call stands, in [`Shared::state`]. Only the editor sets [`WAITING`](state::WAITING) and
/// [`CANCELLED`](state::CANCELLED), only the bridge [`RUNNING`](state::RUNNING) and
/// [`FINISHED`](state::FINISHED); the step from waiting to either is a compare-and-swap, so a call the editor
/// gave up on never runs.
pub mod state {
    pub const EMPTY: u32 = 0;
    pub const WAITING: u32 = 1;
    pub const RUNNING: u32 = 2;
    pub const CANCELLED: u32 = 3;
    pub const FINISHED: u32 = 4;
}

#[repr(C, align(16))]
#[derive(Clone, Copy)]
pub struct Scratch(pub [u8; SCRATCH_SIZE]);

/// The section of one call: the request the editor writes and the answer the bridge writes back.
#[repr(C)]
pub struct Shared {
    pub magic: u32,
    pub version: u32,
    pub state: AtomicU32,
    /// A [`Status`], set by the bridge.
    pub status: u32,
    /// The game plugin the program was made for: `SizeOfImage` and the link timestamp of its PE headers.
    pub size_of_image: u32,
    pub link_timestamp: u32,
    pub step_count: u32,
    pub steps_run: u32,
    pub steps: [Step; MAX_STEPS],
    pub results: [u64; MAX_STEPS],
    pub scratch: Scratch,
}

/// The name of the section of call `nonce` of the editor with process id `editor`.
pub fn section_name(editor: u32, nonce: u32) -> String {
    format!(r"Local\fmlens-bridge-{editor}-{nonce}")
}

/// The number of [`MESSAGE`] in this session; zero if Windows could not register it.
pub fn message_id() -> u32 {
    static ID: OnceLock<u32> = OnceLock::new();
    *ID.get_or_init(|| unsafe { RegisterWindowMessageW(wide(MESSAGE).as_ptr()) })
}

static LIBRARY_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Has the editor use the bridge library at `path`. The app calls this once, with the copy of the library it
/// carries; without it the editor looks beside its own executable.
pub fn set_library(path: PathBuf) {
    let _ = LIBRARY_PATH.set(path);
}

/// The bridge library the editor uses, if there is one.
pub fn library() -> Option<PathBuf> {
    if let Some(path) = LIBRARY_PATH.get() {
        return path.is_file().then(|| path.clone());
    }
    let beside = std::env::current_exe().ok()?.with_file_name(LIBRARY);
    beside.is_file().then_some(beside)
}

/// The SID of the user a process runs as, in the buffer of its `TOKEN_USER`.
pub struct UserSid(Vec<u64>);

impl UserSid {
    /// The user this process runs as.
    pub fn current() -> Result<Self> {
        let mut token = std::ptr::null_mut();
        if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
            return Err(Error::last("OpenProcessToken"));
        }
        let token = OwnedHandle(token);
        let mut needed = 0u32;
        unsafe { GetTokenInformation(token.0, TokenUser, std::ptr::null_mut(), 0, &mut needed) };
        let mut buffer = vec![0u64; (needed as usize).div_ceil(8).max(1)];
        let size = (buffer.len() * 8) as u32;
        if unsafe { GetTokenInformation(token.0, TokenUser, buffer.as_mut_ptr().cast(), size, &mut needed) } == 0 {
            return Err(Error::last("GetTokenInformation"));
        }
        Ok(Self(buffer))
    }

    pub fn sid(&self) -> PSID {
        unsafe { (*self.0.as_ptr().cast::<TOKEN_USER>()).User.Sid }
    }

    fn text(&self) -> Result<String> {
        let mut text: PWSTR = std::ptr::null_mut();
        if unsafe { ConvertSidToStringSidW(self.sid(), &mut text) } == 0 {
            return Err(Error::last("ConvertSidToStringSidW"));
        }
        let length = (0..).take_while(|&at| unsafe { *text.add(at) } != 0).count();
        let string = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, length) });
        unsafe { LocalFree(text.cast()) };
        Ok(string)
    }
}

/// The section of one call, mapped into this process.
pub struct Section {
    _handle: OwnedHandle,
    view: MEMORY_MAPPED_VIEW_ADDRESS,
}

impl Section {
    /// Creates the section `name` for a call, which only `user` may open, with `user` as its owner. Fails if
    /// the name is taken.
    pub fn create(name: &str, user: &UserSid) -> Result<Self> {
        let sid = user.text()?;
        let rules = wide(&format!("O:{sid}D:P(A;;GA;;;{sid})"));
        let mut descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
        let converted = unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                rules.as_ptr(),
                SDDL_REVISION_1,
                &mut descriptor,
                std::ptr::null_mut(),
            )
        };
        if converted == 0 {
            return Err(Error::last("ConvertStringSecurityDescriptorToSecurityDescriptorW"));
        }
        let attributes = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor,
            bInheritHandle: 0,
        };
        let size = size_of::<Shared>() as u32;
        let name = wide(name);
        let handle =
            unsafe { CreateFileMappingW(INVALID_HANDLE_VALUE, &attributes, PAGE_READWRITE, 0, size, name.as_ptr()) };
        let code = unsafe { GetLastError() };
        unsafe { LocalFree(descriptor) };
        if handle.is_null() {
            return Err(Error::Win32 { op: "CreateFileMappingW", code });
        }
        let handle = OwnedHandle(handle);
        if code == ERROR_ALREADY_EXISTS {
            return Err(Error::Win32 { op: "CreateFileMappingW", code });
        }
        Self::map(handle)
    }

    /// Opens the section `name`, if this process's own user owns it.
    pub fn open(name: &str) -> Option<Self> {
        let name = wide(name);
        let handle = unsafe { OpenFileMappingW(FILE_MAP_READ | FILE_MAP_WRITE | READ_CONTROL, 0, name.as_ptr()) };
        if handle.is_null() {
            return None;
        }
        let handle = OwnedHandle(handle);
        let user = UserSid::current().ok()?;
        let mut owner: PSID = std::ptr::null_mut();
        let mut descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
        let code = unsafe {
            GetSecurityInfo(
                handle.0,
                SE_KERNEL_OBJECT,
                OWNER_SECURITY_INFORMATION,
                &mut owner,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut descriptor,
            )
        };
        if code != 0 {
            return None;
        }
        let same = !owner.is_null() && unsafe { EqualSid(owner, user.sid()) } != 0;
        unsafe { LocalFree(descriptor) };
        if !same {
            return None;
        }
        Self::map(handle).ok()
    }

    fn map(handle: OwnedHandle) -> Result<Self> {
        let view = unsafe { MapViewOfFile(handle.0, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, size_of::<Shared>()) };
        if view.Value.is_null() {
            return Err(Error::last("MapViewOfFile"));
        }
        Ok(Self { _handle: handle, view })
    }

    /// The call in the section. Its fields other than `state` belong to one side at a time: the editor's until
    /// it sets the call waiting, the bridge's while it runs, the editor's again once it has finished.
    pub fn shared(&self) -> *mut Shared {
        self.view.Value.cast()
    }
}

impl Drop for Section {
    fn drop(&mut self) {
        unsafe { UnmapViewOfFile(self.view) };
    }
}

/// The bridge library loaded into this process and hooked into the messages of one thread of the game.
struct Hook {
    library: HMODULE,
    hook: HHOOK,
}

impl Hook {
    fn install(path: &std::path::Path, thread: u32) -> Result<Self> {
        let library = unsafe { LoadLibraryW(wide(&path.to_string_lossy()).as_ptr()) };
        if library.is_null() {
            return Err(Error::last("LoadLibraryW"));
        }
        let procedure = unsafe { GetProcAddress(library, HOOK.as_ptr().cast()) };
        let Some(procedure) = procedure else {
            let error = Error::last("GetProcAddress");
            unsafe { FreeLibrary(library) };
            return Err(error);
        };
        // The library exports the hook procedure with this signature.
        let procedure = unsafe {
            std::mem::transmute::<
                unsafe extern "system" fn() -> isize,
                unsafe extern "system" fn(i32, usize, isize) -> isize,
            >(procedure)
        };
        let hook = unsafe { SetWindowsHookExW(WH_GETMESSAGE, Some(procedure), library, thread) };
        if hook.is_null() {
            let error = Error::last("SetWindowsHookExW");
            unsafe { FreeLibrary(library) };
            return Err(error);
        }
        Ok(Self { library, hook })
    }
}

impl Drop for Hook {
    fn drop(&mut self) {
        // Windows unloads the library from the game the next time its thread takes a message.
        unsafe {
            UnhookWindowsHookEx(self.hook);
            FreeLibrary(self.library);
        }
    }
}

/// Has the game with `pid` run `program`, made for the game plugin with `plugin` = (`SizeOfImage`, link
/// timestamp). The caller has checked the program.
pub(crate) fn call(pid: u32, plugin: (u32, u32), program: &Program) -> Result<Outcome> {
    let library = library().ok_or(Error::BridgeUnsupported { pid })?;
    let message = message_id();
    if message == 0 {
        return Err(Error::last("RegisterWindowMessageW"));
    }
    let (window, thread) = main_window(pid).ok_or(Error::Bridge { pid, reason: "the game has no window open" })?;

    static CALLS: AtomicU32 = AtomicU32::new(0);
    let nonce = CALLS.fetch_add(1, Ordering::Relaxed);
    let editor = std::process::id();
    let section = Section::create(&section_name(editor, nonce), &UserSid::current()?)?;
    let shared = section.shared();
    let count = program.steps.len();
    unsafe {
        (*shared).magic = MAGIC;
        (*shared).version = VERSION;
        (*shared).size_of_image = plugin.0;
        (*shared).link_timestamp = plugin.1;
        (*shared).step_count = count as u32;
        (&mut (*shared).steps)[..count].copy_from_slice(&program.steps);
        (*shared).scratch.0 = *program.scratch;
    }
    let state = unsafe { &(*shared).state };
    state.store(state::WAITING, Ordering::Release);

    let hook = Hook::install(&library, thread)?;
    if unsafe { PostMessageW(window, message, nonce as usize, editor as LPARAM) } == 0 {
        return Err(Error::last("PostMessageW"));
    }
    let started = Instant::now();
    loop {
        let now = state.load(Ordering::Acquire);
        if now == state::FINISHED {
            break;
        }
        let waited = started.elapsed();
        if now == state::WAITING && waited >= Duration::from_millis(u64::from(CALL_START_MS)) {
            let cancelled =
                state.compare_exchange(state::WAITING, state::CANCELLED, Ordering::AcqRel, Ordering::Acquire).is_ok();
            if cancelled {
                return Err(Error::Bridge {
                    pid,
                    reason: "the game was busy and nothing ran; try again when the game is idle",
                });
            }
        } else if waited >= Duration::from_millis(u64::from(CALL_TIMEOUT_MS)) {
            return Err(Error::Bridge {
                pid,
                reason: "it did not answer in time; check the game before trying again, the call may still have run",
            });
        }
        std::thread::sleep(Duration::from_millis(2));
    }
    drop(hook);
    let (status, steps_run, results, scratch) =
        unsafe { ((*shared).status, (*shared).steps_run, (*shared).results, (*shared).scratch.0) };
    let reason = match Status::from_u32(status) {
        Some(Status::Done | Status::Stopped) => None,
        Some(Status::Refused) => Some("it refused"),
        Some(Status::WrongBuild) => Some("the game is not the build the editor expected"),
        Some(Status::NotAllowed | Status::Unsupported) if steps_run == 0 => {
            return Err(Error::BridgeUnsupported { pid });
        }
        Some(Status::NotAllowed | Status::Unsupported) => Some("a refused call reported executed steps"),
        Some(Status::Busy) => Some("the game was busy and nothing ran; try again when the game is idle"),
        None => Some("its answer was not one the editor understands"),
    };
    if let Some(reason) = reason {
        return Err(Error::Bridge { pid, reason });
    }
    Ok(Outcome {
        completed: status == Status::Done as u32,
        steps_run: (steps_run as usize).min(count),
        results: results[..count].to_vec(),
        scratch: Box::new(scratch),
    })
}

/// The game's visible top-level window and the thread that owns it, the game's main thread.
fn main_window(pid: u32) -> Option<(HWND, u32)> {
    struct Search {
        pid: u32,
        found: Option<(HWND, u32)>,
    }
    unsafe extern "system" fn visit(window: HWND, search: LPARAM) -> BOOL {
        let search = unsafe { &mut *(search as *mut Search) };
        let mut owner = 0u32;
        let thread = unsafe { GetWindowThreadProcessId(window, &mut owner) };
        let main = owner == search.pid
            && thread != 0
            && unsafe { IsWindowVisible(window) } != 0
            && unsafe { GetWindow(window, GW_OWNER) }.is_null();
        if main {
            search.found = Some((window, thread));
        }
        BOOL::from(!main)
    }
    let mut search = Search { pid, found: None };
    unsafe { EnumWindows(Some(visit), (&raw mut search) as LPARAM) };
    search.found
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_scratch_memory_is_aligned_for_any_object() {
        assert_eq!(std::mem::offset_of!(Shared, scratch) % 16, 0);
        assert!(size_of::<Shared>() < 4096, "one page");
    }

    #[test]
    fn a_section_opens_for_its_own_user_only_once() {
        let name = section_name(std::process::id(), u32::MAX);
        let user = UserSid::current().expect("this user");
        let created = Section::create(&name, &user).expect("a new section");
        unsafe { (*created.shared()).magic = MAGIC };
        let opened = Section::open(&name).expect("its owner opens it");
        assert_eq!(unsafe { (*opened.shared()).magic }, MAGIC);
        assert!(Section::create(&name, &user).is_err(), "a taken name is refused");
    }

    #[test]
    fn a_missing_window_is_reported() {
        assert!(main_window(u32::MAX - 1).is_none());
    }
}
