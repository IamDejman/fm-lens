use mach2::kern_return::KERN_SUCCESS;
use mach2::vm::mach_vm_region_recurse;
use mach2::vm_prot::{VM_PROT_EXECUTE, VM_PROT_READ, VM_PROT_WRITE, vm_prot_t};
use mach2::vm_region::{SM_SHARED, SM_SHARED_ALIASED, SM_TRUESHARED, vm_region_submap_info_64};
use mach2::vm_types::{mach_vm_address_t, mach_vm_size_t, natural_t};

use super::process::Process;

/// A run of pages with the same protection and backing, as `mach_vm_region_recurse` reports it.
#[derive(Debug, Clone, Copy)]
pub struct Region {
    pub base: u64,
    pub size: u64,
    /// The region's own base: macOS keeps no record of a larger allocation it came from.
    pub allocation_base: u64,
    /// `VM_PROT_*` bits of the pages now.
    pub protect: vm_prot_t,
    /// Who mapped the memory (`VM_MEMORY_*`), e.g. 1 for malloc.
    pub user_tag: u32,
    /// How the pages are shared (`SM_*`).
    pub share_mode: u8,
    /// Whether a file backs the pages: a module, or a file the process mapped. A module's data
    /// pages that the process has written to count as its own memory instead, as the kernel
    /// reports them.
    pub file_backed: bool,
    /// Whether this is a submap, such as the dyld shared cache of the system's libraries.
    pub submap: bool,
}

impl Region {
    pub fn end(&self) -> u64 {
        self.base + self.size
    }

    /// Always true: macOS has no reserved-only memory to tell apart.
    pub fn is_committed(&self) -> bool {
        true
    }

    /// File-backed memory: a module, or a file the process mapped, which the region alone
    /// does not tell apart.
    pub fn is_image(&self) -> bool {
        self.file_backed || self.submap
    }

    /// Memory the process allocated for itself (heaps): no file backs it and no other process shares it.
    pub fn is_private(&self) -> bool {
        !self.is_image() && ![SM_SHARED, SM_TRUESHARED, SM_SHARED_ALIASED].contains(&self.share_mode)
    }

    /// Whether the editor may write here: heap data, writable and not executable.
    pub fn holds_data(&self) -> bool {
        self.is_private() && self.is_writable() && !self.is_executable()
    }

    pub fn is_readable(&self) -> bool {
        self.protect & VM_PROT_READ != 0
    }

    pub fn is_writable(&self) -> bool {
        self.is_readable() && self.protect & VM_PROT_WRITE != 0
    }

    pub fn is_executable(&self) -> bool {
        self.protect & VM_PROT_EXECUTE != 0
    }

    /// Protection as a short "RWX" string, e.g. "RW-" or "R-X".
    pub fn protection(&self) -> String {
        if !self.is_readable() {
            return if self.is_executable() { "--X".to_owned() } else { "---".to_owned() };
        }
        let w = if self.is_writable() { 'W' } else { '-' };
        let x = if self.is_executable() { 'X' } else { '-' };
        format!("R{w}{x}")
    }
}

/// Walks the mapped regions of `process` between `start` and `end`. Leaves out submaps: the
/// dyld shared cache, which holds the system's libraries, spans gigabytes and none of the game.
pub fn regions(process: &Process, start: u64, end: u64) -> Vec<Region> {
    let mut out = Vec::new();
    let mut addr = start;
    while addr < end {
        let Some(region) = region_from(process, addr) else {
            break;
        };
        if region.base >= end {
            break;
        }
        addr = region.end();
        if !region.submap {
            out.push(region);
        }
    }
    out
}

/// The region that contains `addr`.
pub fn region_at(process: &Process, addr: u64) -> Option<Region> {
    region_from(process, addr).filter(|region| region.base <= addr)
}

/// The region that contains `addr`, or the first one above it.
fn region_from(process: &Process, addr: u64) -> Option<Region> {
    let mut base: mach_vm_address_t = addr;
    let mut size: mach_vm_size_t = 0;
    let mut depth: natural_t = 0;
    let mut info = vm_region_submap_info_64::default();
    let mut count = vm_region_submap_info_64::count();
    let code = unsafe {
        mach_vm_region_recurse(process.task(), &mut base, &mut size, &mut depth, (&raw mut info).cast(), &mut count)
    };
    if code != KERN_SUCCESS || size == 0 {
        return None;
    }
    Some(Region {
        base,
        size,
        allocation_base: base,
        protect: info.protection,
        user_tag: info.user_tag,
        share_mode: info.share_mode,
        file_backed: info.external_pager != 0,
        submap: info.is_submap != 0,
    })
}
