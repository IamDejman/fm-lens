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
    std::fs::copy(&library, out.join("fmlens_bridge.dll")).expect("copying the bridge library");
    println!("cargo:rustc-cfg=fmlens_bridge");
}
