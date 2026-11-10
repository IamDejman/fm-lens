use std::path::PathBuf;

fn main() {
    carry_bridge();
    tauri_build::build()
}

/// Windows: the app carries the bridge library of `fmlens-bridge`, which it hooks into the game for each of the game's
/// own actions. Build that first (`cargo build --release -p fmlens-bridge`), or name the library in
/// `FMLENS_BRIDGE_DLL`. Without it the app builds with those actions off.
fn carry_bridge() {
    println!("cargo:rustc-check-cfg=cfg(fmlens_bridge)");
    println!("cargo:rerun-if-env-changed=FMLENS_BRIDGE_DLL");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let out = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    // OUT_DIR is <target>/<profile>/build/<package>/out, beside the library the same build of fmlens-bridge writes.
    let built = out.ancestors().nth(3).map(|dir| dir.join("fmlens_bridge.dll"));
    let Some(library) = std::env::var_os("FMLENS_BRIDGE_DLL").map(PathBuf::from).or(built) else {
        return;
    };
    println!("cargo:rerun-if-changed={}", library.display());
    if !library.is_file() {
        println!(
            "cargo:warning={} is missing: build fmlens-bridge first, or the game's own actions stay off",
            library.display()
        );
        return;
    }
    // The app brings its own C++ runtime, so it starts on a PC without Microsoft's Visual C++ Redistributable. A
    // library that asks for that runtime does not load there: "LoadLibraryW failed: Win32 error 126".
    let image = std::fs::read(&library).expect("reading the bridge library");
    let runtime: Vec<String> =
        imports(&image).into_iter().filter(|name| name.starts_with("vcruntime") || name.starts_with("msvcp")).collect();
    assert!(
        runtime.is_empty(),
        "{} needs {runtime:?}, which Windows does not come with: link the runtime into it (crates/fmlens-bridge/build.rs)",
        library.display()
    );
    std::fs::write(out.join("fmlens_bridge.dll"), image).expect("copying the bridge library");
    println!("cargo:rustc-cfg=fmlens_bridge");
}

/// The libraries the 64-bit PE image `image` imports, in lower case.
fn imports(image: &[u8]) -> Vec<String> {
    let u16_at = |at: usize| u16::from_le_bytes(image[at..at + 2].try_into().unwrap()) as usize;
    let u32_at = |at: usize| u32::from_le_bytes(image[at..at + 4].try_into().unwrap()) as usize;

    let pe = u32_at(0x3c);
    let optional = pe + 24;
    assert_eq!((&image[pe..pe + 4], u16_at(optional)), (&b"PE\0\0"[..], 0x20b), "a 64-bit PE image");
    let sections: Vec<(usize, usize, usize)> = (0..u16_at(pe + 6))
        .map(|index| optional + u16_at(pe + 20) + index * 40)
        .map(|section| (u32_at(section + 12), u32_at(section + 16), u32_at(section + 20)))
        .collect();
    // Where the image keeps what it loads at `rva`.
    let offset = |rva: usize| {
        let (address, _, raw) = sections
            .iter()
            .find(|(address, size, _)| (*address..address + size).contains(&rva))
            .expect("an address inside a section");
        rva - address + raw
    };

    // The import directory is the second data directory; each of its entries names one library.
    let mut entry = offset(u32_at(optional + 112 + 8));
    let mut names = Vec::new();
    while u32_at(entry + 12) != 0 {
        let name = offset(u32_at(entry + 12));
        let end = name + image[name..].iter().position(|byte| *byte == 0).expect("the end of a name");
        names.push(String::from_utf8_lossy(&image[name..end]).to_lowercase());
        entry += 20;
    }
    names
}
