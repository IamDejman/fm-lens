//! Windows: runs a call of the editor on the game's main thread.
//!
//! The editor hooks the messages of the game's main thread with this library and posts the game's window one
//! message ([`fmlens_mem::bridge`]). Windows loads the library into the game to deliver it, on the main thread,
//! where the game's own screens run their edits. The hook takes the message out of the game's way, opens the
//! request the message names, runs it if the build profiles allow it for the running build, checked by the game
//! plugin's `SizeOfImage` and link timestamp, and writes the answer back. Once the editor has its answer it takes
//! the hook away and Windows unloads the library.

use std::sync::atomic::Ordering;

use fmlens_mem::bridge::{self, MAGIC, Scratch, Section, Shared, VERSION, state};
use fmlens_mem::call::{Arg, MAX_STEPS, Status, Step, refusal};
use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::WindowsAndMessaging::{CallNextHookEx, MSG, PM_REMOVE, WM_NULL};

// The functions each build lets the editor run, from the build profiles (see build.rs).
include!(concat!(env!("OUT_DIR"), "/allowed.rs"));

/// The file name of the game plugin.
const GAME_PLUGIN: &str = "game_plugin.dll";

/// The hook procedure: runs the call a message of the editor names, as the game's main thread takes the message.
///
/// # Safety
/// Called by Windows as a `WH_GETMESSAGE` hook procedure.
#[unsafe(no_mangle)]
pub unsafe extern "system" fn fmlens_bridge_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && wparam == PM_REMOVE as usize && lparam != 0 {
        let message = unsafe { &mut *(lparam as *mut MSG) };
        let id = bridge::message_id();
        if id != 0 && message.message == id {
            // The game sees an empty message in its place.
            message.message = WM_NULL;
            serve(message.lParam as u32, message.wParam as u32);
        }
    }
    unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) }
}

/// Runs call `nonce` of the editor with process id `editor`, unless the editor has given up on it.
fn serve(editor: u32, nonce: u32) {
    let Some(section) = Section::open(&bridge::section_name(editor, nonce)) else {
        return;
    };
    let shared = section.shared();
    if unsafe { (*shared).magic } != MAGIC {
        return;
    }
    let state = unsafe { &(*shared).state };
    if state.compare_exchange(state::WAITING, state::RUNNING, Ordering::AcqRel, Ordering::Acquire).is_err() {
        return;
    }
    // The request is the bridge's now; it works on its own copy.
    let request = unsafe { Request::read(shared) };
    let mut scratch = Box::new(request.scratch);
    let (status, ran) = match check(&request) {
        Err(status) => (status, None),
        Ok(base) => {
            let ran = crate::run::execute(base, request.steps(), scratch.0.as_mut_ptr() as u64);
            (if ran.stopped { Status::Stopped } else { Status::Done }, Some(ran))
        }
    };
    unsafe {
        (*shared).status = status as u32;
        if let Some(ran) = ran {
            (*shared).steps_run = ran.steps_run;
            (*shared).results = ran.results;
            (*shared).scratch = *scratch;
        }
    }
    state.store(state::FINISHED, Ordering::Release);
}

/// A copy of the request in a section.
struct Request {
    version: u32,
    plugin: (u32, u32),
    step_count: usize,
    steps: [Step; MAX_STEPS],
    scratch: Scratch,
}

impl Request {
    /// # Safety
    /// `shared` must be the mapped section of a call this bridge has taken up.
    unsafe fn read(shared: *const Shared) -> Self {
        unsafe {
            Self {
                version: (*shared).version,
                plugin: ((*shared).size_of_image, (*shared).link_timestamp),
                step_count: (*shared).step_count as usize,
                steps: (*shared).steps,
                scratch: (*shared).scratch,
            }
        }
    }

    fn steps(&self) -> &[Step] {
        self.steps.get(..self.step_count).unwrap_or_default()
    }
}

/// Where the game plugin is loaded, when the request may run; why not otherwise.
fn check(request: &Request) -> Result<u64, Status> {
    if request.version != VERSION || !cfg!(target_arch = "x86_64") {
        return Err(Status::Unsupported);
    }
    let name: Vec<u16> = GAME_PLUGIN.encode_utf16().chain(Some(0)).collect();
    let base = unsafe { GetModuleHandleW(name.as_ptr()) } as u64;
    if base == 0 || unsafe { fingerprint(base) } != Some(request.plugin) {
        return Err(Status::WrongBuild);
    }
    let allowed = ALLOWED_PE.iter().find(|(build, _)| *build == request.plugin).map(|(_, rvas)| *rvas);
    let allowed = allowed.ok_or(Status::WrongBuild)?;
    if request.step_count > MAX_STEPS || refusal(request.steps(), |rva| allowed.contains(&rva)).is_some() {
        return Err(Status::NotAllowed);
    }
    // On Windows the place for a returned object goes in as a hidden first argument, which no call needs yet.
    if request.steps().iter().any(|step| step.indirect != Arg::default()) {
        return Err(Status::Unsupported);
    }
    Ok(base)
}

/// The `SizeOfImage` and link timestamp of the PE image loaded at `base`.
///
/// # Safety
/// `base` must be the start of a module loaded in this process.
unsafe fn fingerprint(base: u64) -> Option<(u32, u32)> {
    let image = base as *const u8;
    let word = |at: usize| unsafe { image.add(at).cast::<u32>().read_unaligned() };
    if unsafe { image.cast::<u16>().read_unaligned() } != 0x5A4D {
        return None;
    }
    let headers = word(0x3C) as usize;
    if word(headers) != 0x0000_4550 {
        return None;
    }
    // The file header follows the "PE\0\0" signature; SizeOfImage is 56 bytes into the optional header after it.
    Some((word(headers + 24 + 56), word(headers + 8)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_fingerprint_of_a_loaded_module() {
        let name: Vec<u16> = "kernel32.dll".encode_utf16().chain(Some(0)).collect();
        let base = unsafe { GetModuleHandleW(name.as_ptr()) } as u64;
        let (size, _) = unsafe { fingerprint(base) }.expect("kernel32 is a PE image");
        assert!(size > 0x1000);
    }

    #[test]
    fn a_request_for_a_build_without_calls_is_refused() {
        let request = Request {
            version: VERSION,
            plugin: (1, 2),
            step_count: 1,
            steps: [Step::default(); MAX_STEPS],
            scratch: Scratch([0; fmlens_mem::call::SCRATCH_SIZE]),
        };
        assert_eq!(check(&request), Err(Status::WrongBuild));
        let request = Request { version: VERSION + 1, ..request };
        assert_eq!(check(&request), Err(Status::Unsupported));
    }
}
