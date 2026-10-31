//! What the editor and the bridge library inside the game say to each other.
//!
//! macOS gives the memory of a hardened app, such as Football Manager, to no other process
//! while System Integrity Protection is on, debuggers and root included. The game does load
//! the libraries named in `DYLD_INSERT_LIBRARIES`, as Steam has it do for its overlay, so a
//! Steam launch option has it load the bridge of `fmlibre-bridge` as well. The bridge checks
//! in a Mach service named [`service_name`] of the game's pid and answers each [`REQUEST`] from
//! a process of the same user with the game's task port. Through that port the editor reads
//! and writes the game's memory the way it does through a process handle on Windows, with
//! the same checks; the bridge itself never touches the game's data.

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

use crate::error::{Error, Result};

/// The start of the bridge's service name; the game's pid follows it.
pub const SERVICE_PREFIX: &str = "io.github.tozmoz.fmlibreeditor.bridge.";

/// `msgh_id` of a request for the game's task port: "FML" and version 1 of the protocol.
pub const REQUEST: i32 = 0x464D_4C01;

/// `msgh_id` of the answer: the request's plus 100, as MIG does.
pub const REPLY: i32 = REQUEST + 100;

/// Receive options that have the kernel append the sender's audit token to a message.
pub const RECEIVE_WITH_AUDIT: mach_msg_option_t = MACH_RCV_MSG | ((MACH_RCV_TRAILER_AUDIT as mach_msg_option_t) << 24);

/// How long the editor waits for the bridge to answer, in milliseconds.
const TIMEOUT_MS: u32 = 3000;

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

/// A request as the bridge receives it, followed by the trailer that names the sender.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct ReceivedRequest {
    pub request: Request,
    pub trailer: mach_msg_audit_trailer_t,
}

impl ReceivedRequest {
    /// The sender's effective user id and process id, from the audit token in the trailer.
    pub fn sender(&self) -> (u32, u32) {
        // The words audit_token_to_euid and audit_token_to_pid read.
        let token = &self.trailer.msgh_audit.val;
        (token[1], token[5])
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
    /// The answer to `request` that hands over a copy of the send right `task`.
    pub fn to(request: &Request, task: mach_port_t) -> Self {
        // The kernel turned the sender's reply port into this message's remote port.
        let reply_disposition = request.header.msgh_bits & 0x1f;
        Reply {
            header: mach_msg_header_t {
                msgh_bits: MACH_MSGH_BITS(reply_disposition, 0) | MACH_MSGH_BITS_COMPLEX,
                msgh_size: size_of::<Reply>() as mach_msg_size_t,
                msgh_remote_port: request.header.msgh_remote_port,
                msgh_local_port: MACH_PORT_NULL,
                msgh_voucher_port: MACH_PORT_NULL,
                msgh_id: REPLY,
            },
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

/// Asks the bridge in the game with `pid` for the game's task port; `None` when the game
/// runs without the bridge.
pub(crate) fn request_task(pid: u32) -> Result<Option<mach_port_t>> {
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
    let reply_port = ReceiveRight(reply_port);

    // The request goes out of the same buffer the answer comes back in, with room for its trailer.
    #[repr(C)]
    struct Buffer {
        reply: Reply,
        trailer: [u8; 64],
    }
    let mut buffer: Buffer = unsafe { std::mem::zeroed() };
    buffer.reply.header = mach_msg_header_t {
        msgh_bits: MACH_MSGH_BITS(MACH_MSG_TYPE_COPY_SEND, MACH_MSG_TYPE_MAKE_SEND_ONCE),
        msgh_size: size_of::<Request>() as mach_msg_size_t,
        msgh_remote_port: server.0,
        msgh_local_port: reply_port.0,
        msgh_voucher_port: MACH_PORT_NULL,
        msgh_id: REQUEST,
    };
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
