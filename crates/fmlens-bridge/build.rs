//! Writes the bridge's list of the functions it may run in the game: the `[calls]` table of every
//! build profile, under the UUID of that build's game plugin on macOS and its `SizeOfImage` and link
//! timestamp on Windows. The profiles are the one place the editor and the bridge learn them from.

use std::fmt::Write as _;
use std::path::Path;

fn main() {
    // Windows: the library brings its own C++ runtime, as the app that carries it does, so that it loads on a PC
    // without Microsoft's Visual C++ Redistributable. The app's build checks it (app/src-tauri/build.rs).
    static_vcruntime::metabuild();

    let profiles = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../profiles/fm27");
    println!("cargo:rerun-if-changed={}", profiles.display());
    let mut paths: Vec<_> = std::fs::read_dir(&profiles)
        .expect("the build profiles")
        .map(|entry| entry.expect("a profile").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "toml"))
        .collect();
    paths.sort();

    let mut mach_o =
        String::from("#[cfg(target_os = \"macos\")]\npub(crate) const ALLOWED: &[([u8; 16], &[u64])] = &[\n");
    let mut pe = String::from("#[cfg(windows)]\npub(crate) const ALLOWED_PE: &[((u32, u32), &[u64])] = &[\n");
    for path in paths {
        println!("cargo:rerun-if-changed={}", path.display());
        let text = std::fs::read_to_string(&path).expect("a readable profile");
        let profile: toml::Table = text.parse().unwrap_or_else(|err| panic!("{}: {err}", path.display()));
        let Some(calls) = profile.get("calls").and_then(|calls| calls.as_table()) else {
            continue;
        };
        let rvas: Vec<String> = calls
            .iter()
            .map(|(name, rva)| {
                let rva = rva.as_integer().unwrap_or_else(|| panic!("{}: calls.{name} is an RVA", path.display()));
                format!("{rva:#x}")
            })
            .collect();
        let plugin = profile.get("plugin");
        let field = |name: &str| plugin.and_then(|plugin| plugin.get(name));
        if let Some(uuid) = field("uuid").and_then(|uuid| uuid.as_str()) {
            let hex: String = uuid.chars().filter(|c| *c != '-').collect();
            assert_eq!(hex.len(), 32, "{}: a uuid is 16 bytes", path.display());
            let bytes: Vec<String> = (0..16).map(|i| format!("0x{}", &hex[i * 2..i * 2 + 2])).collect();
            writeln!(mach_o, "    ([{}], &[{}]),", bytes.join(", "), rvas.join(", ")).expect("writing to a string");
        } else if let (Some(size), Some(timestamp)) = (
            field("size_of_image").and_then(|size| size.as_integer()),
            field("link_timestamp").and_then(|timestamp| timestamp.as_integer()),
        ) {
            writeln!(pe, "    (({size:#x}, {timestamp:#x}), &[{}]),", rvas.join(", ")).expect("writing to a string");
        } else {
            panic!("{}: [calls] needs the plugin's uuid, or its size_of_image and link_timestamp", path.display());
        }
    }
    let out = format!("{mach_o}];\n{pe}];\n");
    let target = Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR")).join("allowed.rs");
    std::fs::write(target, out).expect("writing the list of calls");
}
