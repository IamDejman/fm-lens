//! Writes the bridge's list of the functions it may run in the game: the `[calls]` table of every
//! build profile, under the UUID of that build's game plugin. The profiles are the one place the
//! editor and the bridge learn them from.

use std::fmt::Write as _;
use std::path::Path;

fn main() {
    let profiles = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../profiles/fm27");
    println!("cargo:rerun-if-changed={}", profiles.display());
    let mut paths: Vec<_> = std::fs::read_dir(&profiles)
        .expect("the build profiles")
        .map(|entry| entry.expect("a profile").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "toml"))
        .collect();
    paths.sort();

    let mut out = String::from("pub(crate) const ALLOWED: &[([u8; 16], &[u64])] = &[\n");
    for path in paths {
        println!("cargo:rerun-if-changed={}", path.display());
        let text = std::fs::read_to_string(&path).expect("a readable profile");
        let profile: toml::Table = text.parse().unwrap_or_else(|err| panic!("{}: {err}", path.display()));
        let Some(calls) = profile.get("calls").and_then(|calls| calls.as_table()) else {
            continue;
        };
        let uuid = profile
            .get("plugin")
            .and_then(|plugin| plugin.get("uuid"))
            .and_then(|uuid| uuid.as_str())
            .unwrap_or_else(|| panic!("{}: [calls] needs the plugin's uuid", path.display()));
        let hex: String = uuid.chars().filter(|c| *c != '-').collect();
        assert_eq!(hex.len(), 32, "{}: a uuid is 16 bytes", path.display());
        let bytes: Vec<String> = (0..16).map(|i| format!("0x{}", &hex[i * 2..i * 2 + 2])).collect();
        let rvas: Vec<String> = calls
            .iter()
            .map(|(name, rva)| {
                let rva = rva.as_integer().unwrap_or_else(|| panic!("{}: calls.{name} is an RVA", path.display()));
                format!("{rva:#x}")
            })
            .collect();
        writeln!(out, "    ([{}], &[{}]),", bytes.join(", "), rvas.join(", ")).expect("writing to a string");
    }
    out.push_str("];\n");
    let target = Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR")).join("allowed.rs");
    std::fs::write(target, out).expect("writing the list of calls");
}
