use super::process::Process;
use crate::error::{Error, Result};

const SCN_MEM_EXECUTE: u32 = 0x2000_0000;
const SCN_MEM_READ: u32 = 0x4000_0000;
const SCN_MEM_WRITE: u32 = 0x8000_0000;

/// A section header of a mapped image.
#[derive(Debug, Clone)]
pub struct Section {
    pub name: String,
    pub rva: u32,
    pub virtual_size: u32,
    pub characteristics: u32,
}

impl Section {
    pub fn contains_rva(&self, rva: u64) -> bool {
        (u64::from(self.rva)..u64::from(self.rva) + u64::from(self.virtual_size)).contains(&rva)
    }

    /// Declared access as a short "RWX" string.
    pub fn flags(&self) -> String {
        let flag = |bit, c| if self.characteristics & bit != 0 { c } else { '-' };
        [flag(SCN_MEM_READ, 'R'), flag(SCN_MEM_WRITE, 'W'), flag(SCN_MEM_EXECUTE, 'X')].iter().collect()
    }
}

/// A named export.
#[derive(Debug, Clone)]
pub struct Export {
    pub name: String,
    pub rva: u32,
}

/// PE headers of a module, read from the target's memory rather than from disk,
/// so they reflect what is actually mapped (protectors may differ from the file).
#[derive(Debug, Clone)]
pub struct PeImage {
    pub base: u64,
    pub timestamp: u32,
    pub size_of_image: u32,
    pub sections: Vec<Section>,
    export_dir: (u32, u32),
}

impl PeImage {
    pub fn read(process: &Process, base: u64) -> Result<Self> {
        let hdr = process.read_bytes(base, 0x1000)?;
        let bad = |reason| Error::InvalidPe { base, reason };

        if &hdr[..2] != b"MZ" {
            return Err(bad("missing MZ signature"));
        }
        let nt = u32_at(&hdr, 0x3C) as usize;
        if nt + 24 > hdr.len() || &hdr[nt..nt + 4] != b"PE\0\0" {
            return Err(bad("missing PE signature"));
        }
        let coff = nt + 4;
        let section_count = usize::from(u16_at(&hdr, coff + 2));
        let timestamp = u32_at(&hdr, coff + 4);
        let optional_size = usize::from(u16_at(&hdr, coff + 16));
        let optional = coff + 20;
        if optional + 120 > hdr.len() || u16_at(&hdr, optional) != 0x20B {
            return Err(bad("not a PE32+ image"));
        }
        let size_of_image = u32_at(&hdr, optional + 56);
        let export_dir = (u32_at(&hdr, optional + 112), u32_at(&hdr, optional + 116));

        let table = optional + optional_size;
        if table + section_count * 40 > hdr.len() {
            return Err(bad("section table does not fit in the header page"));
        }
        let sections = (0..section_count)
            .map(|i| {
                let s = table + i * 40;
                let raw = &hdr[s..s + 8];
                let len = raw.iter().position(|&b| b == 0).unwrap_or(raw.len());
                Section {
                    name: String::from_utf8_lossy(&raw[..len]).into_owned(),
                    virtual_size: u32_at(&hdr, s + 8),
                    rva: u32_at(&hdr, s + 12),
                    characteristics: u32_at(&hdr, s + 36),
                }
            })
            .collect();

        Ok(Self { base, timestamp, size_of_image, sections, export_dir })
    }

    pub fn section_for_rva(&self, rva: u64) -> Option<&Section> {
        self.sections.iter().find(|s| s.contains_rva(rva))
    }

    /// Named exports, read from the export directory in target memory.
    pub fn exports(&self, process: &Process) -> Result<Vec<Export>> {
        let (dir_rva, dir_size) = self.export_dir;
        if dir_rva == 0 || dir_size < 40 {
            return Ok(Vec::new());
        }
        let dir = process.read_bytes(self.base + u64::from(dir_rva), dir_size as usize)?;
        let name_count = u32_at(&dir, 24) as usize;
        let functions = u32_at(&dir, 28);
        let names = u32_at(&dir, 32);
        let ordinals = u32_at(&dir, 36);

        // The tables and name strings normally sit inside the export directory itself.
        let offset = |table_rva: u32, index: usize, width: usize| {
            let off = table_rva.checked_sub(dir_rva)? as usize + index * width;
            (off + width <= dir.len()).then_some(off)
        };

        let mut out = Vec::with_capacity(name_count);
        for i in 0..name_count {
            let (Some(name_slot), Some(ordinal_slot)) = (offset(names, i, 4), offset(ordinals, i, 2)) else {
                break;
            };
            let Some(function_slot) = offset(functions, usize::from(u16_at(&dir, ordinal_slot)), 4) else {
                continue;
            };
            let Some(start) = offset(u32_at(&dir, name_slot), 0, 1) else {
                continue;
            };
            let len = dir[start..].iter().position(|&b| b == 0).unwrap_or(dir.len() - start);
            out.push(Export {
                name: String::from_utf8_lossy(&dir[start..start + len]).into_owned(),
                rva: u32_at(&dir, function_slot),
            });
        }
        Ok(out)
    }
}

fn u16_at(b: &[u8], off: usize) -> u16 {
    u16::from_le_bytes([b[off], b[off + 1]])
}

fn u32_at(b: &[u8], off: usize) -> u32 {
    u32::from_le_bytes([b[off], b[off + 1], b[off + 2], b[off + 3]])
}
