//! Runs a call of the editor ([`fmlibre_mem::call`]) on the game's main thread.
//!
//! The game's own screens run their edits on the main thread, so a call runs there too: the
//! bridge's thread queues it on the main dispatch queue, which the game's run loop serves, and
//! waits. A call the main thread has not taken up in time is cancelled and never runs; one that
//! has started is waited for, since it cannot be stopped halfway.

use std::ffi::{CStr, c_char, c_void};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use fmlibre_mem::bridge::{CALL_START_MS, CallReply, CallRequest};
use fmlibre_mem::call::{Arg, MAX_STEPS, SCRATCH_SIZE, Status, Step, refusal};

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
    let scratch = scratch.0.as_mut_ptr() as u64;
    let mut results = [0u64; MAX_STEPS];
    let (mut stopped, mut steps_run) = (false, 0);
    for (index, step) in job.steps.iter().enumerate() {
        if stopped && step.flags & Step::CLEANUP == 0 {
            continue;
        }
        let value = |arg: &Arg| match arg.kind {
            Arg::SCRATCH => scratch.wrapping_add(arg.value),
            Arg::RESULT => results[arg.value as usize],
            _ => arg.value,
        };
        let registers = step.registers.each_ref().map(value);
        let stack = step.stack.each_ref().map(value);
        let result = unsafe { invoke(job.base.wrapping_add(step.rva), &registers, value(&step.indirect), &stack) };
        results[index] = result;
        steps_run += 1;
        // A C++ bool comes back in the low byte of w0 (al on x86_64).
        if step.flags & Step::STOP_IF_FALSE != 0 && result & 0xFF == 0 {
            stopped = true;
        }
    }
    State::Finished { stopped, steps_run, results }
}

/// Calls the function at `address` with `x0` to `x7` from `registers`, `x8` set to `indirect` and
/// `stack` in the first four stack slots, and gives back `x0`.
///
/// # Safety
/// `address` must be a function of the game plugin that takes these arguments.
#[cfg(target_arch = "aarch64")]
unsafe fn invoke(address: u64, registers: &[u64; 8], indirect: u64, stack: &[u64; 4]) -> u64 {
    let result: u64;
    unsafe {
        std::arch::asm!(
            "sub sp, sp, #32",
            "stp {first}, {second}, [sp]",
            "stp {third}, {fourth}, [sp, #16]",
            "blr {function}",
            "add sp, sp, #32",
            function = in(reg) address,
            first = in(reg) stack[0],
            second = in(reg) stack[1],
            third = in(reg) stack[2],
            fourth = in(reg) stack[3],
            inout("x0") registers[0] => result,
            inout("x1") registers[1] => _,
            inout("x2") registers[2] => _,
            inout("x3") registers[3] => _,
            inout("x4") registers[4] => _,
            inout("x5") registers[5] => _,
            inout("x6") registers[6] => _,
            inout("x7") registers[7] => _,
            inout("x8") indirect => _,
            clobber_abi("C"),
        );
    }
    result
}

/// Calls the function at `address` with the same twelve arguments the System V way: the first six of `registers` in
/// `rdi`, `rsi`, `rdx`, `rcx`, `r8` and `r9`, the other two and then `stack` in the first six stack slots, and gives
/// back `rax`. check() refuses a step with an indirect result here.
///
/// # Safety
/// `address` must be a function of the game plugin that takes these arguments.
#[cfg(target_arch = "x86_64")]
unsafe fn invoke(address: u64, registers: &[u64; 8], _: u64, stack: &[u64; 4]) -> u64 {
    let spilled = [registers[6], registers[7], stack[0], stack[1], stack[2], stack[3]];
    let result: u64;
    unsafe {
        // Six slots keep the stack 16-byte aligned at the call, as it is on entry to the block.
        std::arch::asm!(
            "sub rsp, 48",
            "mov rax, [{spilled}]",
            "mov [rsp], rax",
            "mov rax, [{spilled} + 8]",
            "mov [rsp + 8], rax",
            "mov rax, [{spilled} + 16]",
            "mov [rsp + 16], rax",
            "mov rax, [{spilled} + 24]",
            "mov [rsp + 24], rax",
            "mov rax, [{spilled} + 32]",
            "mov [rsp + 32], rax",
            "mov rax, [{spilled} + 40]",
            "mov [rsp + 40], rax",
            "call {function}",
            "add rsp, 48",
            function = in(reg) address,
            spilled = in(reg) spilled.as_ptr(),
            inout("rdi") registers[0] => _,
            inout("rsi") registers[1] => _,
            inout("rdx") registers[2] => _,
            inout("rcx") registers[3] => _,
            inout("r8") registers[4] => _,
            inout("r9") registers[5] => _,
            out("rax") result,
            clobber_abi("C"),
        );
    }
    result
}

#[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
unsafe fn invoke(_: u64, _: &[u64; 8], _: u64, _: &[u64; 4]) -> u64 {
    // check() refuses every call on other architectures first.
    0
}

#[cfg(all(test, any(target_arch = "aarch64", target_arch = "x86_64")))]
mod tests {
    use super::invoke;

    /// Each argument is one hex digit of the answer, so one out of place changes it.
    extern "C" fn digits(
        a: u64,
        b: u64,
        c: u64,
        d: u64,
        e: u64,
        f: u64,
        g: u64,
        h: u64,
        i: u64,
        j: u64,
        k: u64,
        l: u64,
    ) -> u64 {
        [a, b, c, d, e, f, g, h, i, j, k, l].iter().fold(0, |number, digit| number * 16 + digit)
    }

    #[test]
    fn a_call_gets_its_twelve_arguments_in_order() {
        let result = unsafe { invoke(digits as *const () as u64, &[1, 2, 3, 4, 5, 6, 7, 8], 0, &[9, 10, 11, 12]) };
        assert_eq!(result, 0x1234_5678_9ABC);
    }
}
