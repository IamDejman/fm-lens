use mach2::vm_prot::{VM_PROT_EXECUTE, VM_PROT_READ, VM_PROT_WRITE};

use super::process::Process;
use crate::error::{Error, Result};

const MH_MAGIC_64: u32 = 0xFEED_FACF;
const LC_SEGMENT_64: u32 = 0x19;
const LC_UUID: u32 = 0x1B;
/// The library lives in the dyld shared cache, its segments apart from each other.
const MH_DYLIB_IN_CACHE: u32 = 0x8000_0000;
/// Load commands are a few kilobytes; more than this is not a header.
const MAX_COMMANDS_SIZE: u32 = 1 << 20;

/// A segment of a mapped image.
#[derive(Debug, Clone)]
pub struct Segment {
    pub name: String,
    /// Where the segment starts, from the image's header: the RVA of Windows.
    pub rva: u64,
    pub size: u64,
    /// `VM_PROT_*` bits the segment is mapped with.
    pub protection: i32,
    pub sections: Vec<MachSection>,
}

impl Segment {
    pub fn contains_rva(&self, rva: u64) -> bool {
        (self.rva..self.rva + self.size).contains(&rva)
    }

    /// Mapped access as a short "RWX" string.
    pub fn flags(&self) -> String {
        let flag = |bit, c| if self.protection & bit != 0 { c } else { '-' };
        [flag(VM_PROT_READ, 'R'), flag(VM_PROT_WRITE, 'W'), flag(VM_PROT_EXECUTE, 'X')].iter().collect()
    }
}

/// A section of a segment, such as `__DATA,__bss`.
#[derive(Debug, Clone)]
pub struct MachSection {
    pub segment: String,
    pub name: String,
    pub rva: u64,
    pub size: u64,
}

impl MachSection {
    pub fn contains_rva(&self, rva: u64) -> bool {
        (self.rva..self.rva + self.size).contains(&rva)
    }
}

/// Mach-O headers of a module, read from the target's memory rather than from disk,
/// so they describe the architecture that is actually mapped.
#[derive(Debug, Clone)]
pub struct MachImage {
    pub base: u64,
    pub file_type: u32,
    pub flags: u32,
    /// The image's `LC_UUID`, which changes with every build, and differs between the
    /// arm64 and x86_64 halves of a universal binary.
    pub uuid: Option<[u8; 16]>,
    pub segments: Vec<Segment>,
}

impl MachImage {
    pub fn read(process: &Process, base: u64) -> Result<Self> {
        let bad = |reason| Error::InvalidMachO { base, reason };
        let header = process.read_bytes(base, 32)?;
        if u32_at(&header, 0) != MH_MAGIC_64 {
            return Err(bad("missing 64-bit Mach-O magic"));
        }
        let file_type = u32_at(&header, 12);
        let command_count = u32_at(&header, 16);
        let commands_size = u32_at(&header, 20);
        let flags = u32_at(&header, 24);
        if commands_size > MAX_COMMANDS_SIZE {
            return Err(bad("load commands too large"));
        }
        let commands = process.read_bytes(base + 32, commands_size as usize)?;

        let mut uuid = None;
        // Segments with their addresses as linked: (name, address, size, protection, sections).
        let mut linked = Vec::new();
        let mut offset = 0;
        for _ in 0..command_count {
            let Some(head) = commands.get(offset..offset + 8) else {
                return Err(bad("load commands run past their size"));
            };
            let size = u32_at(head, 4) as usize;
            let Some(command) = commands.get(offset..offset + size).filter(|_| size >= 8) else {
                return Err(bad("a load command does not fit"));
            };
            match u32_at(head, 0) {
                LC_UUID if size >= 24 => uuid = Some(command[8..24].try_into().expect("16 bytes")),
                LC_SEGMENT_64 if size >= 72 => {
                    let section_count = u32_at(command, 64) as usize;
                    let sections: Vec<(String, String, u64, u64)> = (0..section_count)
                        .filter_map(|i| command.get(72 + i * 80..72 + (i + 1) * 80))
                        .map(|s| (name_at(&s[16..32]), name_at(&s[..16]), u64_at(s, 32), u64_at(s, 40)))
                        .collect();
                    let max_protection = i32_at(command, 56);
                    // __PAGEZERO maps nothing that can be reached.
                    if max_protection != 0 {
                        let name = name_at(&command[8..24]);
                        linked.push((name, u64_at(command, 24), u64_at(command, 32), i32_at(command, 60), sections));
                    }
                }
                _ => {}
            }
            offset += size;
        }

        // Addresses count from __TEXT, which starts with the header.
        let text = linked.iter().find(|s| s.0 == "__TEXT").map_or(0, |s| s.1);
        let segments = linked
            .into_iter()
            .filter(|s| s.1 >= text)
            .map(|(name, address, size, protection, sections)| Segment {
                name,
                rva: address - text,
                size,
                protection,
                sections: sections
                    .into_iter()
                    .filter(|s| s.2 >= text)
                    .map(|(segment, name, address, size)| MachSection { segment, name, rva: address - text, size })
                    .collect(),
            })
            .collect();
        Ok(Self { base, file_type, flags, uuid, segments })
    }

    /// Bytes from the header to the end of the last segment. A library in the shared cache
    /// has its segments apart, so only its `__TEXT` counts.
    pub fn size(&self) -> u64 {
        if self.flags & MH_DYLIB_IN_CACHE != 0 {
            return self.segments.iter().find(|s| s.name == "__TEXT").map_or(0, |s| s.size);
        }
        self.segments.iter().map(|s| s.rva + s.size).max().unwrap_or(0)
    }

    /// The UUID as macOS writes it, e.g. "9E8E47DE-F704-314C-917D-C32D12637678".
    pub fn uuid_text(&self) -> Option<String> {
        let b = self.uuid?;
        let hex = |range: std::ops::Range<usize>| b[range].iter().map(|x| format!("{x:02X}")).collect::<String>();
        Some(format!("{}-{}-{}-{}-{}", hex(0..4), hex(4..6), hex(6..8), hex(8..10), hex(10..16)))
    }

    pub fn segment_for_rva(&self, rva: u64) -> Option<&Segment> {
        self.segments.iter().find(|s| s.contains_rva(rva))
    }

    pub fn section_for_rva(&self, rva: u64) -> Option<&MachSection> {
        self.segments.iter().flat_map(|s| &s.sections).find(|s| s.contains_rva(rva))
    }
}

/// A NUL-padded name of up to 16 bytes.
fn name_at(raw: &[u8]) -> String {
    let len = raw.iter().position(|&b| b == 0).unwrap_or(raw.len());
    String::from_utf8_lossy(&raw[..len]).into_owned()
}

fn u32_at(b: &[u8], off: usize) -> u32 {
    u32::from_le_bytes(b[off..off + 4].try_into().expect("4 bytes"))
}

fn i32_at(b: &[u8], off: usize) -> i32 {
    i32::from_le_bytes(b[off..off + 4].try_into().expect("4 bytes"))
}

fn u64_at(b: &[u8], off: usize) -> u64 {
    u64::from_le_bytes(b[off..off + 8].try_into().expect("8 bytes"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_this_executable() {
        let process = Process::open_read(std::process::id()).expect("open this process");
        let modules = crate::list_modules(&process).expect("list modules");
        let exe = std::env::current_exe().expect("own path");
        let own = modules.iter().find(|m| m.path == exe).expect("this executable among the modules");
        let image = MachImage::read(&process, own.base).expect("read own headers");
        assert_eq!(image.file_type, 2, "MH_EXECUTE");
        assert!(image.uuid_text().is_some_and(|u| u.len() == 36));
        let text = image.segment_for_rva(0).expect("__TEXT starts at the header");
        assert_eq!(text.name, "__TEXT");
        assert_eq!(text.flags(), "R-X");
        assert!(image.segments.iter().any(|s| s.name == "__DATA" && s.flags() == "RW-"));
        assert_eq!(own.size, image.size());

        // A function of this binary lies in its __TEXT,__text section.
        let rva = reads_this_executable as *const () as u64 - own.base;
        let section = image.section_for_rva(rva).expect("a section");
        assert_eq!((section.segment.as_str(), section.name.as_str()), ("__TEXT", "__text"));
    }
}
