//! Runs a call of the editor ([`fmlens_mem::call`]) on the game's main thread.
//!
//! The game's own screens run their edits on the main thread, so a call runs there too: the
//! bridge's thread queues it on the main dispatch queue, which the game's run loop serves, and
//! waits. A call the main thread has not taken up in time is cancelled and never runs; one that
//! has started is waited for, since it cannot be stopped halfway.

use std::ffi::{CStr, c_char, c_void};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use fmlens_mem::bridge::{CALL_START_MS, CallReply, CallRequest, CapabilitiesReply};
use fmlens_mem::call::{Arg, MAX_STEPS, SCRATCH_SIZE, Status, Step, refusal};
use mach2::message::mach_msg_header_t;

// The functions each build lets the editor run, from the build profiles (see build.rs).
include!(concat!(env!("OUT_DIR"), "/allowed.rs"));

/// The file name of the game plugin inside its bundle.
const GAME_PLUGIN: &[u8] = b"game_plugin";

const MH_MAGIC_64: u32 = 0xFEED_FACF;
const LC_UUID: u32 = 0x1B;

unsafe extern "C" {
    fn _dyld_image_count() -> u32;
    fn _dyld_get_image_header(index: u32) -> *const u8;
    fn _dyld_get_image_name(index: u32) -> *const c_char;
    fn dispatch_async_f(queue: *mut c_void, context: *mut c_void, work: extern "C" fn(*mut c_void));
    static mut _dispatch_main_q: c_void;
}

/// The answer to `request`, from a sender of the game's user or not.
pub fn answer(request: &CallRequest, same_user: bool) -> CallReply {
    let mut reply = CallReply::to(&request.header, Status::Done);
    let status = check(request, same_user).unwrap_or_else(|| run(request, &mut reply));
    reply.status = status as u32;
    reply
}

/// Reports the running helper's allowlist without calling any game function or dispatching
/// work to the main thread. Its version may differ from the companion's version.
pub fn capabilities(header: &mach_msg_header_t, same_user: bool) -> CapabilitiesReply {
    let mut reply = CapabilitiesReply::to(header, Status::Refused);
    if !same_user {
        return reply;
    }
    reply.status = Status::WrongBuild as u32;
    let Some((_, uuid)) = game_plugin() else { return reply };
    let Some((_, functions)) = ALLOWED.iter().find(|(build, _)| *build == uuid) else { return reply };
    if functions.len() > reply.functions.len() {
        return reply;
    }
    reply.plugin_uuid = uuid;
    reply.count = functions.len() as u32;
    reply.functions[..functions.len()].copy_from_slice(functions);
    reply.status =
        if cfg!(any(target_arch = "aarch64", target_arch = "x86_64")) { Status::Done } else { Status::Unsupported }
            as u32;
    reply
}

/// Why `request` may not run; `None` when it may.
fn check(request: &CallRequest, same_user: bool) -> Option<Status> {
    if !same_user {
        return Some(Status::Refused);
    }
    if !cfg!(any(target_arch = "aarch64", target_arch = "x86_64")) {
        return Some(Status::Unsupported);
    }
    let Some((_, uuid)) = game_plugin() else {
        return Some(Status::WrongBuild);
    };
    let allowed = ALLOWED.iter().find(|(build, _)| *build == uuid).map(|(_, rvas)| *rvas);
    let Some(allowed) = allowed.filter(|_| request.plugin_uuid == uuid) else {
        return Some(Status::WrongBuild);
    };
    let count = request.step_count as usize;
    let steps = request.steps.get(..count).unwrap_or_default();
    if refusal(steps, |rva| allowed.contains(&rva)).is_some() {
        return Some(Status::NotAllowed);
    }
    // On x86_64 the place for a returned object goes in as a hidden first argument, which no call on an Intel build
    // needs yet: there the bridge passes plain arguments only.
    let indirect = steps.iter().any(|step| step.indirect != Arg::default());
    (cfg!(target_arch = "x86_64") && indirect).then_some(Status::Unsupported)
}

/// Where the game plugin is loaded and its `LC_UUID`, read from this process's own image list.
fn game_plugin() -> Option<(u64, [u8; 16])> {
    for index in 0..unsafe { _dyld_image_count() } {
        let name = unsafe { _dyld_get_image_name(index) };
        let header = unsafe { _dyld_get_image_header(index) };
        if name.is_null() || header.is_null() {
            continue;
        }
        let path = unsafe { CStr::from_ptr(name) }.to_bytes();
        if path.rsplit(|b| *b == b'/').next() != Some(GAME_PLUGIN) {
            continue;
        }
        return Some((header as u64, unsafe { uuid_of(header) }?));
    }
    None
}

/// The `LC_UUID` of the 64-bit Mach-O image whose header is at `header`.
///
/// # Safety
/// `header` must be the header of an image dyld has loaded, with its load commands mapped after it.
unsafe fn uuid_of(header: *const u8) -> Option<[u8; 16]> {
    let word = |at: usize| unsafe { header.add(at).cast::<u32>().read_unaligned() };
    if word(0) != MH_MAGIC_64 {
        return None;
    }
    let (count, size) = (word(16), word(20) as usize);
    let mut at = 32;
    for _ in 0..count {
        let (command, command_size) = (word(at), word(at + 4) as usize);
        if command_size < 8 || at - 32 + command_size > size {
            return None;
        }
        if command == LC_UUID && command_size >= 24 {
            return Some(unsafe { header.add(at + 8).cast::<[u8; 16]>().read_unaligned() });
        }
        at += command_size;
    }
    None
}

/// Where a call stands between the bridge's thread and the main thread.
enum State {
    Waiting,
    Running,
    Cancelled,
    Finished { stopped: bool, steps_run: u32, results: [u64; MAX_STEPS] },
}

#[repr(C, align(16))]
struct Scratch([u8; SCRATCH_SIZE]);

struct Job {
    base: u64,
    steps: Vec<Step>,
    scratch: Mutex<Box<Scratch>>,
    state: Mutex<State>,
    changed: Condvar,
}

/// Runs a checked `request` on the main thread, filling in `reply`.
fn run(request: &CallRequest, reply: &mut CallReply) -> Status {
    let Some((base, _)) = game_plugin() else {
        return Status::WrongBuild;
    };
    let job = Arc::new(Job {
        base,
        steps: request.steps[..request.step_count as usize].to_vec(),
        scratch: Mutex::new(Box::new(Scratch(request.scratch))),
        state: Mutex::new(State::Waiting),
        changed: Condvar::new(),
    });
    let context = Arc::into_raw(Arc::clone(&job)).cast_mut().cast::<c_void>();
    unsafe { dispatch_async_f(&raw mut _dispatch_main_q, context, on_main_thread) };

    let state = job.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let start = Duration::from_millis(u64::from(CALL_START_MS));
    let (mut state, _) = job
        .changed
        .wait_timeout_while(state, start, |state| matches!(state, State::Waiting))
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if matches!(*state, State::Waiting) {
        *state = State::Cancelled;
        return Status::Busy;
    }
    // Started: it cannot be stopped halfway, so wait for it to end.
    let state = job
        .changed
        .wait_while(state, |state| matches!(state, State::Running))
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let State::Finished { stopped, steps_run, results } = *state else {
        return Status::Busy;
    };
    reply.steps_run = steps_run;
    reply.results = results;
    reply.scratch = job.scratch.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).0;
    if stopped { Status::Stopped } else { Status::Done }
}

/// The main thread's part: runs the job unless the bridge's thread gave up on it first.
extern "C" fn on_main_thread(context: *mut c_void) {
    let job = unsafe { Arc::from_raw(context.cast_const().cast::<Job>()) };
    {
        let mut state = job.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if !matches!(*state, State::Waiting) {
            return;
        }
        *state = State::Running;
    }
    let finished = {
        let mut scratch = job.scratch.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        execute(&job, &mut scratch)
    };
    *job.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = finished;
    job.changed.notify_all();
}

/// Runs the steps in order. After a step that stops the call, only clean-ups run.
fn execute(job: &Job, scratch: &mut Scratch) -> State {
    let ran = crate::run::execute(job.base, &job.steps, scratch.0.as_mut_ptr() as u64);
    State::Finished { stopped: ran.stopped, steps_run: ran.steps_run, results: ran.results }
}

#[cfg(all(test, any(target_arch = "aarch64", target_arch = "x86_64")))]
mod tests {
    use super::capabilities;
    use fmlens_mem::call::Status;
    use mach2::message::mach_msg_header_t;

    #[test]
    fn discovery_never_advertises_calls_to_another_user_or_without_a_known_plugin() {
        let header = mach_msg_header_t::default();
        let refused = capabilities(&header, false);
        assert_eq!(refused.status, Status::Refused as u32);
        assert_eq!(refused.count, 0);
        let no_game = capabilities(&header, true);
        assert_eq!(no_game.status, Status::WrongBuild as u32);
        assert_eq!(no_game.count, 0);
    }
}
