//! Checks against a real Football Manager 27 install. They are ignored by default; run them with
//! `FMLENS_ADDR_DATA` set to the game's `AddrData` folder, and `FMLENS_GFX_SAMPLES` set to a folder of
//! reference PNGs for the pixel comparison.

use std::path::{Path, PathBuf};
use std::time::Instant;

use fmlens_gfx::{GameGraphics, Kind};

fn open() -> GameGraphics {
    let dir = std::env::var_os("FMLENS_ADDR_DATA").expect("set FMLENS_ADDR_DATA to the AddrData folder");
    let start = Instant::now();
    let gfx = GameGraphics::open(Path::new(&dir)).expect("catalog opens");
    eprintln!("open: {:?}", start.elapsed());
    gfx
}

fn decode(bytes: &[u8]) -> (u32, u32, Vec<u8>) {
    let mut reader = png::Decoder::new(std::io::Cursor::new(bytes)).read_info().expect("valid png");
    let mut buf = vec![0; reader.output_buffer_size().expect("size known")];
    let info = reader.next_frame(&mut buf).expect("frame");
    assert_eq!(info.color_type, png::ColorType::Rgba, "output is RGBA");
    buf.truncate(info.buffer_size());
    (info.width, info.height, buf)
}

fn size_of(gfx: &GameGraphics, kind: Kind, uid: u32, max_side: u32) -> (u32, u32) {
    let start = Instant::now();
    let bytes = gfx.png(kind, uid, max_side).expect("reads").expect("picture exists");
    eprintln!("png {kind:?} {uid} at {max_side}: {:?}, {} bytes", start.elapsed(), bytes.len());
    let (w, h, _) = decode(&bytes);
    (w, h)
}

#[test]
#[ignore = "needs FMLENS_ADDR_DATA"]
fn known_pictures_have_the_right_size() {
    let gfx = open();
    assert_eq!(size_of(&gfx, Kind::Club, 602, 512), (512, 512));
    assert_eq!(size_of(&gfx, Kind::Club, 602, 64), (64, 64));
    assert_eq!(size_of(&gfx, Kind::Face, 28122642, 512), (256, 256));
    assert_eq!(size_of(&gfx, Kind::Flag, 765, 512), (256, 160));
    assert_eq!(size_of(&gfx, Kind::Competition, 11, 512), (512, 512));
    assert_eq!(size_of(&gfx, Kind::KitHome, 602, 1024), (1024, 1024));
    assert_eq!(size_of(&gfx, Kind::KitHome, 602, 100), (100, 100));
}

#[test]
#[ignore = "needs FMLENS_ADDR_DATA"]
fn missing_pictures_are_none_and_has_agrees() {
    let gfx = open();
    assert!(gfx.png(Kind::Face, 49039004, 256).expect("reads").is_none());
    assert!(!gfx.has(Kind::Face, 49039004));
    for (kind, uid) in [
        (Kind::Club, 602),
        (Kind::Face, 28122642),
        (Kind::Flag, 765),
        (Kind::Competition, 11),
        (Kind::KitHome, 602),
        (Kind::KitAway, 602),
    ] {
        assert!(gfx.has(kind, uid), "{kind:?} {uid}");
    }
    assert!(!gfx.has(Kind::Club, 1));
    assert!(gfx.png(Kind::Club, 1, 64).expect("reads").is_none());
}

#[test]
#[ignore = "needs FMLENS_ADDR_DATA"]
fn counts_are_plausible() {
    let counts = open().counts();
    eprintln!("{counts:?}");
    assert!((850..=1000).contains(&counts.clubs), "{counts:?}");
    assert!((15_000..=17_000).contains(&counts.faces), "{counts:?}");
    assert!((70..=85).contains(&counts.competitions), "{counts:?}");
    assert!((220..=250).contains(&counts.flags), "{counts:?}");
    assert!((1_500..=2_500).contains(&counts.kits), "{counts:?}");
}

#[test]
#[ignore = "needs FMLENS_ADDR_DATA"]
fn aliases_resolve_to_a_picture() {
    let gfx = open();
    assert!(gfx.has(Kind::Club, 2000254864));
    assert_eq!(size_of(&gfx, Kind::Club, 2000254864, 512), (512, 512));
}

/// Mean absolute difference per channel against a reference PNG, at the reference's own size.
fn compare(gfx: &GameGraphics, dir: &Path, file: &str, kind: Kind, uid: u32) {
    let reference = std::fs::read(dir.join(file)).expect("reference png");
    let (rw, rh, want) = decode(&reference);
    let bytes = gfx.png(kind, uid, rw.max(rh)).expect("reads").expect("picture exists");
    let (w, h, got) = decode(&bytes);
    assert_eq!((w, h), (rw, rh), "{file} size");
    let mut sums = [0u64; 4];
    for (a, b) in got.as_chunks::<4>().0.iter().zip(want.as_chunks::<4>().0) {
        for c in 0..4 {
            sums[c] += u64::from(a[c].abs_diff(b[c]));
        }
    }
    let n = u64::from(w) * u64::from(h);
    let means: Vec<f64> = sums.iter().map(|s| *s as f64 / n as f64).collect();
    eprintln!("{file}: mean abs diff per channel {means:?}");
    assert!(means.iter().all(|m| *m < 2.0), "{file}: {means:?}");
}

#[test]
#[ignore = "needs FMLENS_ADDR_DATA and FMLENS_GFX_SAMPLES"]
fn pixels_match_the_reference_pictures() {
    let gfx = open();
    let dir = PathBuf::from(std::env::var_os("FMLENS_GFX_SAMPLES").expect("set FMLENS_GFX_SAMPLES"));
    compare(&gfx, &dir, "arsenal_logo.png", Kind::Club, 602);
    compare(&gfx, &dir, "saka_face.png", Kind::Face, 28122642);
    compare(&gfx, &dir, "england_nation_logo.png", Kind::Flag, 765);
    compare(&gfx, &dir, "premier_league.png", Kind::Competition, 11);
    compare(&gfx, &dir, "arsenal_home_kit.png", Kind::KitHome, 602);
}
