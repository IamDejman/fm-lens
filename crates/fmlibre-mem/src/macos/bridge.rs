//! What the editor and the bridge library inside the game say to each other.
//!
//! macOS gives the memory of a hardened app, such as Football Manager, to no other process
//! while System Integrity Protection is on, debuggers and root included. The game does load
//! the libraries named in `DYLD_INSERT_LIBRARIES`, as Steam has it do for its overlay, so a
//! Steam launch option has it load the bridge of `fmlibre-bridge` as well. The bridge checks
//! in a Mach service named [`service_name`] of the game's pid and answers each [`REQUEST`] from
//! a process of the same user with the game's task port. Through that port the editor reads
//! and writes the game's memory the way it does through a process handle on Windows, with
//! the same checks.
//!
//! A [`CALL`] asks the bridge to run a short program of the game's own functions on its main
//! thread ([`crate::call`]), for the edits only the game can make whole, such as a transfer. The
//! bridge runs only functions the build profiles name for the running build.

use std::ffi::{CString, c_int};

use mach2::bootstrap::{BOOTSTRAP_UNKNOWN_SERVICE, bootstrap_look_up, bootstrap_port};
use mach2::kern_return::{KERN_SUCCESS, kern_return_t};
use mach2::mach_port::{mach_port_allocate, mach_port_deallocate, mach_port_mod_refs};
use mach2::message::{
    MACH_MSG_PORT_DESCRIPTOR, MACH_MSG_TYPE_COPY_SEND, MACH_MSG_TYPE_MAKE_SEND_ONCE, MACH_MSGH_BITS,
    MACH_MSGH_BITS_COMPLEX, MACH_RCV_MSG, MACH_RCV_TIMEOUT, MACH_RCV_TRAILER_AUDIT, MACH_SEND_MSG, mach_msg,
    mach_msg_audit_trailer_t, mach_msg_body_t, mach_msg_destroy, mach_msg_header_t, mach_msg_option_t,
    mach_msg_port_descriptor_t, mach_msg_size_t,
};
use mach2::port::{MACH_PORT_NULL, MACH_PORT_RIGHT_RECEIVE, mach_port_name_t, mach_port_t};
use mach2::traps::mach_task_self;

use crate::call::{MAX_STEPS, Outcome, SCRATCH_SIZE, Status, Step, refusal};
use crate::error::{Error, Result};

/// The start of the bridge's service name; the game's pid follows it.
pub const SERVICE_PREFIX: &str = "io.github.tozmoz.fmlibreeditor.bridge.";

/// `msgh_id` of a request for the game's task port: "FML" and version 1 of the protocol.
pub const REQUEST: i32 = 0x464D_4C01;

/// `msgh_id` of the answer: the request's plus 100, as MIG does.
pub const REPLY: i32 = REQUEST + 100;

/// `msgh_id` of a call into the game ([`CallRequest`]), added in version 2 of the protocol.
pub const CALL: i32 = 0x464D_4C02;

/// `msgh_id` of the answer to a call.
pub const CALL_REPLY: i32 = CALL + 100;

/// `msgh_id` of the notice the kernel sends when the receiver of a message drops it unanswered:
/// what a bridge older than [`CALL`] does with a call.
const SEND_ONCE_NOTICE: i32 = 0x47;

/// Receive options that have the kernel append the sender's audit token to a message.
pub const RECEIVE_WITH_AUDIT: mach_msg_option_t = MACH_RCV_MSG | ((MACH_RCV_TRAILER_AUDIT as mach_msg_option_t) << 24);

/// How long the editor waits for the bridge to answer, in milliseconds.
const TIMEOUT_MS: u32 = 3000;

/// How long the bridge waits for the game's main thread to take a call up, in milliseconds.
pub const CALL_START_MS: u32 = 10_000;

/// How long the editor waits for the answer to a call, in milliseconds: long enough for the
/// main thread to take it up and run it.
const CALL_TIMEOUT_MS: u32 = CALL_START_MS + 20_000;

/// The Mach service of the bridge in the game with `pid`.
pub fn service_name(pid: u32) -> String {
    format!("{SERVICE_PREFIX}{pid}")
}

/// A request: no more than a header, which carries the port to answer on.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct Request {
    pub header: mach_msg_header_t,
}

/// A call: the program to run and the UUID of the game plugin it was written for.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct CallRequest {
    pub header: mach_msg_header_t,
    pub plugin_uuid: [u8; 16],
    pub step_count: u32,
    pub reserved: u32,
    pub steps: [Step; MAX_STEPS],
}

/// The answer to a call.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct CallReply {
    pub header: mach_msg_header_t,
    /// A [`Status`].
    pub status: u32,
    pub steps_run: u32,
    pub results: [u64; MAX_STEPS],
    pub scratch: [u8; SCRATCH_SIZE],
}

impl CallReply {
    /// The answer to the message with `header`, before anything ran.
    pub fn to(header: &mach_msg_header_t, status: Status) -> Self {
        CallReply {
            header: answer_header(header, size_of::<CallReply>(), CALL_REPLY, false),
            status: status as u32,
            steps_run: 0,
            results: [0; MAX_STEPS],
            scratch: [0; SCRATCH_SIZE],
        }
    }
}

/// Room for any message the bridge takes, followed by the trailer that names its sender.
#[repr(C, align(8))]
pub struct Received {
    bytes: [u8; size_of::<CallRequest>() + size_of::<mach_msg_audit_trailer_t>()],
}

impl Received {
    pub fn new() -> Box<Self> {
        Box::new(Received { bytes: [0; size_of::<CallRequest>() + size_of::<mach_msg_audit_trailer_t>()] })
    }

    pub const CAPACITY: mach_msg_size_t =
        (size_of::<CallRequest>() + size_of::<mach_msg_audit_trailer_t>()) as mach_msg_size_t;

    /// Where the kernel writes the message.
    pub fn buffer(&mut self) -> *mut mach_msg_header_t {
        self.bytes.as_mut_ptr().cast()
    }

    pub fn header(&self) -> mach_msg_header_t {
        unsafe { self.bytes.as_ptr().cast::<mach_msg_header_t>().read() }
    }

    /// The sender's effective user id and process id, from the audit token in the trailer, which
    /// follows the message wherever it ends.
    pub fn sender(&self) -> Option<(u32, u32)> {
        let at = self.header().msgh_size as usize;
        let trailer = self.bytes.get(at..at + size_of::<mach_msg_audit_trailer_t>())?;
        let trailer = unsafe { trailer.as_ptr().cast::<mach_msg_audit_trailer_t>().read_unaligned() };
        // The words audit_token_to_euid and audit_token_to_pid read.
        let token = trailer.msgh_audit.val;
        Some((token[1], token[5]))
    }

    /// The call this message is, when it is one of the right size.
    pub fn call(&self) -> Option<CallRequest> {
        let header = self.header();
        (header.msgh_id == CALL && header.msgh_size as usize == size_of::<CallRequest>())
            .then(|| unsafe { self.bytes.as_ptr().cast::<CallRequest>().read() })
    }
}

/// The header of the answer to the message with `header`, sent on the reply right it brought.
fn answer_header(header: &mach_msg_header_t, size: usize, id: i32, complex: bool) -> mach_msg_header_t {
    // The kernel turned the sender's reply port into this message's remote port.
    let reply_disposition = header.msgh_bits & 0x1f;
    mach_msg_header_t {
        msgh_bits: MACH_MSGH_BITS(reply_disposition, 0) | if complex { MACH_MSGH_BITS_COMPLEX } else { 0 },
        msgh_size: size as mach_msg_size_t,
        msgh_remote_port: header.msgh_remote_port,
        msgh_local_port: MACH_PORT_NULL,
        msgh_voucher_port: MACH_PORT_NULL,
        msgh_id: id,
    }
}

/// The answer: the game's task port, or `MACH_PORT_NULL` when the bridge refuses.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct Reply {
    pub header: mach_msg_header_t,
    pub body: mach_msg_body_t,
    pub task: mach_msg_port_descriptor_t,
}

impl Reply {
    /// The answer to the request with `header` that hands over a copy of the send right `task`.
    pub fn to(header: &mach_msg_header_t, task: mach_port_t) -> Self {
        Reply {
            header: answer_header(header, size_of::<Reply>(), REPLY, true),
            body: mach_msg_body_t { msgh_descriptor_count: 1 },
            task: mach_msg_port_descriptor_t::new(task, MACH_MSG_TYPE_COPY_SEND),
        }
    }
}

/// A send right of this process, released on drop.
struct SendRight(mach_port_name_t);

impl Drop for SendRight {
    fn drop(&mut self) {
        unsafe { mach_port_deallocate(mach_task_self(), self.0) };
    }
}

/// A receive right of this process, destroyed on drop.
struct ReceiveRight(mach_port_name_t);

impl Drop for ReceiveRight {
    fn drop(&mut self) {
        unsafe { mach_port_mod_refs(mach_task_self(), self.0, MACH_PORT_RIGHT_RECEIVE, -1) };
    }
}

unsafe extern "C" {
    fn pid_for_task(task: mach_port_name_t, pid: *mut c_int) -> kern_return_t;
}

/// The bridge's service in the game with `pid`, and a port of this process to hear back on;
/// `None` when the game runs without the bridge.
fn connect(pid: u32) -> Result<Option<(SendRight, ReceiveRight)>> {
    let name = CString::new(service_name(pid)).expect("a service name holds no NUL");
    let mut server = MACH_PORT_NULL;
    match unsafe { bootstrap_look_up(bootstrap_port, name.as_ptr(), &mut server) } {
        KERN_SUCCESS => {}
        BOOTSTRAP_UNKNOWN_SERVICE => return Ok(None),
        code => return Err(Error::Mach { op: "bootstrap_look_up", code }),
    }
    let server = SendRight(server);

    let mut reply_port = MACH_PORT_NULL;
    let code = unsafe { mach_port_allocate(mach_task_self(), MACH_PORT_RIGHT_RECEIVE, &mut reply_port) };
    if code != KERN_SUCCESS {
        return Err(Error::Mach { op: "mach_port_allocate", code });
    }
    Ok(Some((server, ReceiveRight(reply_port))))
}

/// The header of a message to `server` that asks for an answer on `reply_port`.
fn request_header(server: &SendRight, reply_port: &ReceiveRight, size: usize, id: i32) -> mach_msg_header_t {
    mach_msg_header_t {
        msgh_bits: MACH_MSGH_BITS(MACH_MSG_TYPE_COPY_SEND, MACH_MSG_TYPE_MAKE_SEND_ONCE),
        msgh_size: size as mach_msg_size_t,
        msgh_remote_port: server.0,
        msgh_local_port: reply_port.0,
        msgh_voucher_port: MACH_PORT_NULL,
        msgh_id: id,
    }
}

/// Asks the bridge in the game with `pid` for the game's task port; `None` when the game
/// runs without the bridge.
pub(crate) fn request_task(pid: u32) -> Result<Option<mach_port_t>> {
    let Some((server, reply_port)) = connect(pid)? else {
        return Ok(None);
    };

    // The request goes out of the same buffer the answer comes back in, with room for its trailer.
    #[repr(C)]
    struct Buffer {
        reply: Reply,
        trailer: [u8; 64],
    }
    let mut buffer: Buffer = unsafe { std::mem::zeroed() };
    buffer.reply.header = request_header(&server, &reply_port, size_of::<Request>(), REQUEST);
    let code = unsafe {
        mach_msg(
            &mut buffer.reply.header,
            MACH_SEND_MSG | MACH_RCV_MSG | MACH_RCV_TIMEOUT,
            size_of::<Request>() as mach_msg_size_t,
            size_of::<Buffer>() as mach_msg_size_t,
            reply_port.0,
            TIMEOUT_MS,
            MACH_PORT_NULL,
        )
    };
    if code != KERN_SUCCESS {
        return Err(Error::Bridge { pid, reason: "it did not answer" });
    }

    let reply = &buffer.reply;
    let well_formed = reply.header.msgh_id == REPLY
        && reply.header.msgh_bits & MACH_MSGH_BITS_COMPLEX != 0
        && reply.header.msgh_size as usize >= size_of::<Reply>()
        && reply.body.msgh_descriptor_count == 1
        && u32::from(reply.task.type_) == MACH_MSG_PORT_DESCRIPTOR;
    if !well_formed {
        // Releases whatever rights the message brought.
        unsafe { mach_msg_destroy(&mut buffer.reply.header) };
        return Err(Error::Bridge { pid, reason: "its answer was not one the editor understands" });
    }
    let task = SendRight(reply.task.name);
    if task.0 == MACH_PORT_NULL {
        return Err(Error::Bridge { pid, reason: "it refused" });
    }

    // Only the bridge in the game can hand over the game's own task: a service of another
    // process under the same name would hand over its own.
    let mut owner: c_int = 0;
    if unsafe { pid_for_task(task.0, &mut owner) } != KERN_SUCCESS || owner as u32 != pid {
        return Err(Error::Bridge { pid, reason: "another process answered for it" });
    }
    let task = std::mem::ManuallyDrop::new(task);
    Ok(Some(task.0))
}

/// Has the bridge in the game with `pid` run `steps`, written for the game plugin with
/// `plugin_uuid`, on the game's main thread. `allowed` tells the functions the build profile
/// names, checked here before the bridge checks them again.
pub(crate) fn call(pid: u32, plugin_uuid: [u8; 16], steps: &[Step], allowed: impl Fn(u64) -> bool) -> Result<Outcome> {
    if let Some(reason) = refusal(steps, allowed) {
        return Err(Error::Bridge { pid, reason });
    }
    let Some((server, reply_port)) = connect(pid)? else {
        return Err(Error::NoBridge { pid });
    };

    #[repr(C)]
    union Message {
        request: CallRequest,
        reply: CallReply,
    }
    // The answer comes back in the same buffer, with room for its trailer.
    #[repr(C)]
    struct Buffer {
        message: Message,
        trailer: [u8; 64],
    }
    let mut buffer: Box<Buffer> = Box::new(unsafe { std::mem::zeroed() });
    let mut request = CallRequest {
        header: request_header(&server, &reply_port, size_of::<CallRequest>(), CALL),
        plugin_uuid,
        step_count: steps.len() as u32,
        reserved: 0,
        steps: [Step::default(); MAX_STEPS],
    };
    request.steps[..steps.len()].copy_from_slice(steps);
    buffer.message.request = request;
    let code = unsafe {
        mach_msg(
            &mut buffer.message.request.header,
            MACH_SEND_MSG | MACH_RCV_MSG | MACH_RCV_TIMEOUT,
            size_of::<CallRequest>() as mach_msg_size_t,
            size_of::<Buffer>() as mach_msg_size_t,
            reply_port.0,
            CALL_TIMEOUT_MS,
            MACH_PORT_NULL,
        )
    };
    if code != KERN_SUCCESS {
        return Err(Error::Bridge {
            pid,
            reason: "it did not answer in time; check the game before trying again, the call may still have run",
        });
    }

    let reply = unsafe { buffer.message.reply };
    if reply.header.msgh_id == SEND_ONCE_NOTICE {
        return Err(Error::Bridge {
            pid,
            reason: "it is older than this editor and cannot make calls. Set the bridge up again, then restart the \
                     game from Steam",
        });
    }
    let well_formed = reply.header.msgh_id == CALL_REPLY
        && reply.header.msgh_bits & MACH_MSGH_BITS_COMPLEX == 0
        && reply.header.msgh_size as usize >= size_of::<CallReply>();
    if !well_formed {
        unsafe { mach_msg_destroy(&mut buffer.message.reply.header) };
        return Err(Error::Bridge { pid, reason: "its answer was not one the editor understands" });
    }
    let reason = match Status::from_u32(reply.status) {
        Some(Status::Done | Status::Stopped) => None,
        Some(Status::Refused) => Some("it refused"),
        Some(Status::WrongBuild) => Some("the game is not the build the editor expected"),
        Some(Status::NotAllowed) => Some("it does not allow this call"),
        Some(Status::Busy) => Some("the game was busy and nothing ran; try again when the game is idle"),
        Some(Status::Unsupported) => Some("it cannot make calls on this Mac"),
        None => Some("its answer was not one the editor understands"),
    };
    if let Some(reason) = reason {
        return Err(Error::Bridge { pid, reason });
    }
    let steps_run = (reply.steps_run as usize).min(steps.len());
    Ok(Outcome {
        completed: reply.status == Status::Done as u32,
        steps_run,
        results: reply.results[..steps.len()].to_vec(),
        scratch: Box::new(reply.scratch),
    })
}
