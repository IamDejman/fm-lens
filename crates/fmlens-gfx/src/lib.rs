//! A read-only reader for the pictures built into Football Manager 27: club and competition logos, player
//! faces, nation flags and club kits.
//!
//! The game ships them as Unity Addressables bundles. Opening the folder reads only the catalog; a bundle is
//! opened the first time one of its pictures is asked for, and only the parts holding that picture are decoded.
#![forbid(unsafe_code)]

mod catalog;
mod error;
mod pixels;
mod reader;
mod unity;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use serde::Serialize;

use catalog::{Catalog, Entry, Res};
pub use error::Error;
use error::Result;
use pixels::Rgba;
use unity::{Bundle, CLASS_MONO_BEHAVIOUR, CLASS_SPRITE, CLASS_TEXTURE2D};

const CATALOG_FILE: &str = "catalog_info.bin";
const ALIAS_BUNDLE: &str = "catalog_info_assets_all.bundle";
/// The catalog is a few MB; a file far beyond that is not one.
const MAX_CATALOG_BYTES: u64 = 256 << 20;
/// Atlas sprites packed with a rotation are not handled.
const ATLAS_ROTATION_BITS: u32 = 0x3c;

/// The families of pictures the game has.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Kind {
    Club,
    Competition,
    Face,
    Flag,
    KitHome,
    KitAway,
    KitThird,
}

/// How many pictures of each family the game has.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub clubs: usize,
    pub competitions: usize,
    pub faces: usize,
    pub flags: usize,
    pub kits: usize,
}

/// The game's pictures, read from an `AddrData` folder.
pub struct GameGraphics {
    dir: PathBuf,
    catalog: Catalog,
    counts: Counts,
    bundles: Mutex<HashMap<Arc<str>, Arc<Bundle>>>,
}

impl GameGraphics {
    /// Reads the catalog (and the alias table) of an `AddrData` folder. Fails when the folder or catalog is
    /// missing or not the format this reader knows.
    pub fn open(addr_data: &Path) -> Result<Self> {
        let path = addr_data.join(CATALOG_FILE);
        if std::fs::metadata(&path)?.len() > MAX_CATALOG_BYTES {
            return Err(Error::Format("catalog is far larger than expected"));
        }
        let mut catalog = Catalog::parse(&std::fs::read(&path)?)?;
        let aliases = Bundle::open(&addr_data.join(ALIAS_BUNDLE))?;
        let table = aliases.first_of_class(CLASS_MONO_BEHAVIOUR).ok_or(Error::Format("alias table is missing"))?;
        let (data, base) = aliases.read_object(table)?;
        catalog.aliases = unity::parse_aliases(&data, base)?;
        let counts = catalog.counts();
        Ok(Self { dir: addr_data.to_path_buf(), catalog, counts, bundles: Mutex::new(HashMap::new()) })
    }

    /// Whether the game has this picture. Only the catalog is looked at; no bundle is read.
    pub fn has(&self, kind: Kind, uid: u32) -> bool {
        self.catalog.lookup(kind, uid).is_some()
    }

    pub fn counts(&self) -> Counts {
        self.counts
    }

    /// The picture as PNG bytes: upright, RGBA, scaled down so its longer side is at most `max_side` (never
    /// scaled up). `Ok(None)` when the game has no such picture.
    pub fn png(&self, kind: Kind, uid: u32, max_side: u32) -> Result<Option<Vec<u8>>> {
        if max_side == 0 {
            return Err(Error::Format("max_side must be at least 1"));
        }
        let Some(entry) = self.catalog.lookup(kind, uid) else { return Ok(None) };
        let bundle = self.bundle(&entry.bundle)?;
        let picture = picture(&bundle, entry)?;
        Ok(Some(picture.shrink(max_side).to_png()?))
    }

    /// The opened index of a bundle, built on first use.
    fn bundle(&self, name: &Arc<str>) -> Result<Arc<Bundle>> {
        let cached = self.bundles.lock().unwrap_or_else(PoisonError::into_inner).get(name).cloned();
        if let Some(bundle) = cached {
            return Ok(bundle);
        }
        let opened = Arc::new(Bundle::open(&self.dir.join(&**name))?);
        let mut map = self.bundles.lock().unwrap_or_else(PoisonError::into_inner);
        Ok(map.entry(name.clone()).or_insert(opened).clone())
    }
}

/// The picture of a catalog entry, upright.
fn picture(bundle: &Bundle, entry: &Entry) -> Result<Rgba> {
    let ids = bundle.container.get(&entry.guid).ok_or(Error::Format("picture is missing from its bundle"))?;
    let class = if entry.res == Res::Texture { CLASS_TEXTURE2D } else { CLASS_SPRITE };
    let id = *ids
        .iter()
        .find(|id| bundle.object(**id).is_some_and(|o| o.class == class))
        .ok_or(Error::Format("picture object is missing from its bundle"))?;
    let mut img = if class == CLASS_TEXTURE2D { texture(bundle, id)? } else { sprite(bundle, id)? };
    img.flip();
    Ok(img)
}

/// A Texture2D's mip 0, rows bottom to top.
fn texture(bundle: &Bundle, id: i64) -> Result<Rgba> {
    let obj = bundle.object(id).filter(|o| o.class == CLASS_TEXTURE2D).ok_or(Error::Format("texture is missing"))?;
    let (data, base) = bundle.read_object(obj)?;
    let tex = unity::parse_texture(&data, base)?;
    let want = pixels::mip0_bytes(tex.format, tex.width, tex.height)?.unwrap_or(u64::from(tex.stream_size));
    if want > u64::from(tex.stream_size) {
        return Err(Error::Format("texture data is shorter than its size"));
    }
    let node = bundle.fs.stream_node(&tex.stream_path)?;
    let raw = bundle.fs.read(node, tex.stream_off, want)?;
    pixels::decode(tex.format, tex.width, tex.height, &raw)
}

/// A sprite cut out of its atlas texture, rows bottom to top.
fn sprite(bundle: &Bundle, id: i64) -> Result<Rgba> {
    let obj = bundle.object(id).ok_or(Error::Format("sprite is missing"))?;
    let (data, base) = bundle.read_object(obj)?;
    let key = unity::parse_sprite_key(&data, base)?;
    let part = bundle.atlas.get(&key).ok_or(Error::Format("sprite is not in its atlas"))?;
    if part.settings & ATLAS_ROTATION_BITS != 0 {
        return Err(Error::Unsupported("rotated sprite in an atlas".into()));
    }
    let atlas = texture(bundle, part.texture)?;
    let whole = |v: f32| (0.0..=65_536.0).contains(&v).then(|| v.round() as u32);
    let [x, y, w, h] = part.rect.map(whole);
    let (Some(x), Some(y), Some(w), Some(h)) = (x, y, w, h) else {
        return Err(Error::Format("sprite rectangle is out of range"));
    };
    atlas.crop(x, y, w, h)
}

/// The `AddrData` folder of the install a game executable belongs to, if it exists.
///
/// Windows: `<install>\fm.exe` has it in `<install>\fm_Data\StreamingAssets\AddrData`. macOS:
/// `<install>/fm.app/Contents/MacOS/fm` has it in `<install>/fm.app/Contents/Resources/Data/StreamingAssets/AddrData`.
pub fn addr_data_for(game_executable: &Path) -> Option<PathBuf> {
    let name = game_executable.file_name()?.to_str()?;
    let dir = game_executable.parent()?;
    let folder = if name.eq_ignore_ascii_case("fm.exe") {
        dir.join("fm_Data").join("StreamingAssets").join("AddrData")
    } else if name == "fm" && dir.file_name()? == "MacOS" {
        let contents = dir.parent()?;
        if contents.file_name()? != "Contents" {
            return None;
        }
        contents.join("Resources").join("Data").join("StreamingAssets").join("AddrData")
    } else {
        return None;
    };
    folder.is_dir().then_some(folder)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("fmlens-gfx-{}-{name}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn finds_the_windows_folder() {
        let root = scratch("win");
        let addr = root.join("fm_Data").join("StreamingAssets").join("AddrData");
        assert_eq!(addr_data_for(&root.join("fm.exe")), None);
        std::fs::create_dir_all(&addr).unwrap();
        assert_eq!(addr_data_for(&root.join("fm.exe")), Some(addr));
        assert_eq!(addr_data_for(&root.join("other.exe")), None);
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn finds_the_mac_folder() {
        let root = scratch("mac");
        let contents = root.join("fm.app").join("Contents");
        let addr = contents.join("Resources").join("Data").join("StreamingAssets").join("AddrData");
        std::fs::create_dir_all(&addr).unwrap();
        assert_eq!(addr_data_for(&contents.join("MacOS").join("fm")), Some(addr));
        assert_eq!(addr_data_for(&root.join("fm.app").join("Other").join("fm")), None);
        assert_eq!(addr_data_for(&contents.join("MacOS").join("fm2")), None);
        assert_eq!(addr_data_for(Path::new("fm")), None);
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn open_fails_without_a_catalog() {
        assert!(GameGraphics::open(Path::new("/definitely/not/here")).is_err());
        let dir = scratch("empty");
        assert!(GameGraphics::open(&dir).is_err());
        std::fs::write(dir.join(CATALOG_FILE), b"not a catalog").unwrap();
        assert!(GameGraphics::open(&dir).is_err());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn counts_serialise_in_camel_case() {
        let counts = Counts { clubs: 1, competitions: 2, faces: 3, flags: 4, kits: 5 };
        let json = serde_json::to_string(&counts).unwrap();
        assert_eq!(json, r#"{"clubs":1,"competitions":2,"faces":3,"flags":4,"kits":5}"#);
    }
}
