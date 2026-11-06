use std::path::PathBuf;

/// An executable or library mapped into the target process: an EXE or DLL on Windows,
/// the executable, a dylib or a bundle on macOS.
#[derive(Debug, Clone)]
pub struct Module {
    pub name: String,
    pub base: u64,
    pub size: u64,
    pub path: PathBuf,
}

impl Module {
    pub fn end(&self) -> u64 {
        self.base + self.size
    }

    pub fn contains(&self, addr: u64) -> bool {
        (self.base..self.end()).contains(&addr)
    }
}
