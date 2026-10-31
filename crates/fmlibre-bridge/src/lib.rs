//! The library Football Manager loads on macOS so that FMLibreEditor can reach its memory.
//!
//! macOS opens the memory of a hardened app such as the game to no other process. The game
//! loads the libraries named in `DYLD_INSERT_LIBRARIES`, though, as Steam has it do for its
//! overlay, and a Steam launch option names this one. Once loaded it checks in the Mach
//! service of [`fmlibre_mem::bridge`] and, when the editor of the same user asks, hands over
//! the game's task port. That is all it does: it hooks nothing, patches nothing and reads none
//! of the game's data; the editor does the reading and writing, with the checks it makes on
//! Windows.
//!
//! It runs inside the game, so it never panics and stays idle whenever something is not as
//! it expects.

#![cfg(target_os = "macos")]

use std::ffi::CString;

use fmlibre_mem::bridge::{RECEIVE_WITH_AUDIT, REQUEST, ReceivedRequest, Reply, service_name};
use mach2::bootstrap::{bootstrap_check_in, bootstrap_port};
use mach2::kern_return::KERN_SUCCESS;
use mach2::mach_port::mach_port_deallocate;
use mach2::message::{
    MACH_MSG_TIMEOUT_NONE, MACH_MSGH_BITS_COMPLEX, MACH_RCV_INTERRUPTED, MACH_RCV_TOO_LARGE, MACH_SEND_MSG,
    MACH_SEND_TIMEOUT, mach_msg, mach_msg_destroy, mach_msg_size_t,
};
use mach2::port::{MACH_PORT_NULL, mach_port_t};
use mach2::traps::mach_task_self;

/// The executables of Football Manager on macOS: `fm.app/Contents/MacOS/Football Manager 27`.
const GAME_EXE_PREFIX: &str = "Football Manager ";

/// How long an answer may wait to be delivered, in milliseconds.
const SEND_TIMEOUT_MS: u32 = 1000;

/// dyld runs the functions in this section when it loads the library, before the game starts.
#[used]
#[unsafe(link_section = "__DATA,__mod_init_func")]
static START: extern "C" fn() = start;

extern "C" fn start() {
    // DYLD_INSERT_LIBRARIES also reaches the processes the game starts; only the game serves.
    if !in_the_game() {
        return;
    }
    let Ok(name) = CString::new(service_name(std::process::id())) else {
        return;
    };
    let mut port = MACH_PORT_NULL;
    let code = unsafe { bootstrap_check_in(bootstrap_port, name.as_ptr(), &mut port) };
    if code != KERN_SUCCESS {
        eprintln!("FMLibreEditor bridge: could not check in {name:?} (error {code})");
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("FMLibreEditor bridge".to_owned())
        .stack_size(128 * 1024)
        .spawn(move || serve(port));
    if let Err(err) = spawned {
        eprintln!("FMLibreEditor bridge: could not start: {err}");
    }
}

/// Whether this process is Football Manager.
fn in_the_game() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let in_a_bundle = exe.parent().is_some_and(|dir| dir.ends_with("Contents/MacOS"));
    let named = exe.file_name().and_then(|name| name.to_str()).is_some_and(|name| name.starts_with(GAME_EXE_PREFIX));
    in_a_bundle && named
}

/// Answers requests on `port` for as long as the game runs: a request of the game's own user
/// gets the game's task port, any other an empty answer.
fn serve(port: mach_port_t) {
    let task = unsafe { mach_task_self() };
    let user = unsafe { libc::geteuid() };
    loop {
        let mut received: ReceivedRequest = unsafe { std::mem::zeroed() };
        let size = size_of::<ReceivedRequest>() as mach_msg_size_t;
        let code = unsafe {
            mach_msg(
                &mut received.request.header,
                RECEIVE_WITH_AUDIT,
                0,
                size,
                port,
                MACH_MSG_TIMEOUT_NONE,
                MACH_PORT_NULL,
            )
        };
        match code {
            KERN_SUCCESS => {}
            // The kernel has dropped a message too large to be a request.
            MACH_RCV_TOO_LARGE | MACH_RCV_INTERRUPTED => continue,
            _ => {
                eprintln!("FMLibreEditor bridge: stopped (error {code})");
                return;
            }
        }

        let header = received.request.header;
        if header.msgh_id != REQUEST
            || header.msgh_bits & MACH_MSGH_BITS_COMPLEX != 0
            || header.msgh_remote_port == MACH_PORT_NULL
        {
            // Releases the rights the message brought; none of them is the game's.
            unsafe { mach_msg_destroy(&mut received.request.header) };
            continue;
        }
        let (sender_user, _) = received.sender();
        let answer = if sender_user == user { task } else { MACH_PORT_NULL };
        let mut reply = Reply::to(&received.request, answer);
        let code = unsafe {
            mach_msg(
                &mut reply.header,
                MACH_SEND_MSG | MACH_SEND_TIMEOUT,
                size_of::<Reply>() as mach_msg_size_t,
                0,
                MACH_PORT_NULL,
                SEND_TIMEOUT_MS,
                MACH_PORT_NULL,
            )
        };
        if code != KERN_SUCCESS {
            // The editor has gone. Only its reply right is released. A copy of the task port
            // that the kernel may hand back is left alone: releasing one too many would cut
            // the game off from its own task.
            unsafe { mach_port_deallocate(task, header.msgh_remote_port) };
        }
    }
}
