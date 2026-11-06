use std::os::unix::ffi::OsStringExt;
use std::path::PathBuf;

use mach2::kern_return::KERN_SUCCESS;
use mach2::message::mach_msg_type_number_t;
use mach2::task::task_info;
use mach2::task_info::{TASK_DYLD_INFO, task_dyld_info};

use super::macho::MachImage;
use super::process::Process;
use crate::error::{Error, Result};
use crate::module::Module;

/// Size of a `dyld_image_info`: load address, path pointer and modification date.
const IMAGE_INFO_SIZE: usize = 24;

/// Lists the modules of `process` (its executable, libraries and bundles) from the list
/// dyld keeps in the process for debuggers.
pub fn list_modules(process: &Process) -> Result<Vec<Module>> {
    let mut info = task_dyld_info { all_image_info_addr: 0, all_image_info_size: 0, all_image_info_format: 0 };
    let mut count = (size_of::<task_dyld_info>() / size_of::<u32>()) as mach_msg_type_number_t;
    let code = unsafe { task_info(process.task(), TASK_DYLD_INFO, (&raw mut info).cast(), &mut count) };
    if code != KERN_SUCCESS {
        return Err(Error::Mach { op: "task_info", code });
    }

    // dyld_all_image_infos starts with a version, the image count and the array. dyld clears
    // the array while it changes the list; retry a few times.
    let mut attempts = 0;
    let (image_count, array) = loop {
        let head = process.read_bytes(info.all_image_info_addr, 16)?;
        let image_count = u32::from_le_bytes(head[4..8].try_into().expect("4 bytes")) as usize;
        let array = u64::from_le_bytes(head[8..16].try_into().expect("8 bytes"));
        if array != 0 || attempts >= 10 {
            break (image_count, array);
        }
        attempts += 1;
        std::thread::sleep(std::time::Duration::from_millis(5));
    };
    if array == 0 {
        return Ok(Vec::new());
    }

    let entries = process.read_bytes(array, image_count * IMAGE_INFO_SIZE)?;
    let mut modules = Vec::with_capacity(image_count);
    for entry in entries.as_chunks::<IMAGE_INFO_SIZE>().0 {
        let base = u64::from_le_bytes(entry[..8].try_into().expect("8 bytes"));
        let path_at = u64::from_le_bytes(entry[8..16].try_into().expect("8 bytes"));
        // An image whose header or path cannot be read is being loaded or unloaded.
        let (Ok(image), Some(path)) = (MachImage::read(process, base), read_c_string(process, path_at)) else {
            continue;
        };
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        modules.push(Module { name, base, size: image.size(), path });
    }
    Ok(modules)
}

/// The NUL-terminated path at `addr`, read a page at a time so as not to run into unmapped memory.
fn read_c_string(process: &Process, addr: u64) -> Option<PathBuf> {
    const PAGE: u64 = 0x1000;
    const MAX: usize = 4096;
    let mut bytes = Vec::new();
    let mut at = addr;
    while bytes.len() < MAX {
        let chunk = process.read_bytes(at, (PAGE - at % PAGE) as usize).ok()?;
        if let Some(end) = chunk.iter().position(|&b| b == 0) {
            bytes.extend_from_slice(&chunk[..end]);
            return Some(PathBuf::from(std::ffi::OsString::from_vec(bytes)));
        }
        bytes.extend_from_slice(&chunk);
        at += chunk.len() as u64;
    }
    None
}
