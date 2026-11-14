//! The Addressables binary catalog (`catalog_info.bin`): which bundle holds each picture key.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::error::{Error, Result};
use crate::{Counts, Kind};

const MAGIC: u32 = 0x0DE3_8942;
const VERSION: u32 = 2;
const KEY_TABLE: usize = 0x24;
const NONE: u32 = u32::MAX;
const MULTI_PART: u32 = 0x4000_0000;
const OFFSET_MASK: u32 = 0x3fff_ffff;
const MAX_PARTS: usize = 64;
const MAX_STRING: usize = 4096;
const PICTURE_PREFIXES: [&str; 6] = ["club_", "comp_", "person_", "nation_flag_", "nation_logo_", "kit2d_"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Res {
    Texture,
    Sprite,
}

/// Where one picture lives.
#[derive(Debug, Clone)]
pub(crate) struct Entry {
    /// The address GUID, lowercase hex.
    pub guid: String,
    /// The bundle file name on disk.
    pub bundle: Arc<str>,
    pub res: Res,
}

#[derive(Debug, Default)]
pub(crate) struct Catalog {
    entries: HashMap<String, Entry>,
    pub aliases: HashMap<String, String>,
}

fn u32_at(b: &[u8], off: usize) -> Result<u32> {
    let end = off.checked_add(4).ok_or(Error::Format("catalog offset overflow"))?;
    let s = b.get(off..end).ok_or(Error::Format("catalog offset past the end"))?;
    Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

/// A string pointer: plain, or (flag 0x40000000) parts chained tail first.
fn string(b: &[u8], ptr: u32, depth: u8) -> Result<String> {
    if ptr == 0 || ptr == NONE {
        return Err(Error::Format("catalog string is empty"));
    }
    let off = (ptr & OFFSET_MASK) as usize;
    if ptr & MULTI_PART == 0 {
        let len = u32_at(b, off.checked_sub(4).ok_or(Error::Format("catalog offset past the end"))?)? as usize;
        let end = off.checked_add(len).ok_or(Error::Format("catalog offset overflow"))?;
        let s = b.get(off..end).ok_or(Error::Format("catalog string past the end"))?;
        return Ok(String::from_utf8_lossy(s).into_owned());
    }
    if depth > 2 {
        return Err(Error::Format("catalog string nests too deeply"));
    }
    let (mut node, mut parts) = (off, Vec::new());
    loop {
        if parts.len() >= MAX_PARTS {
            return Err(Error::Format("catalog string has too many parts"));
        }
        parts.push(string(b, u32_at(b, node)?, depth + 1)?);
        let next = u32_at(b, node + 4)?;
        if next == NONE {
            break;
        }
        node = next as usize;
    }
    parts.reverse();
    let joined = parts.concat();
    if joined.len() > MAX_STRING {
        return Err(Error::Format("catalog string is too long"));
    }
    Ok(joined)
}

/// An array of u32 values whose byte length sits just before it.
fn array(b: &[u8], ptr: u32) -> Result<Vec<u32>> {
    let off = ptr as usize;
    let bytes = u32_at(b, off.checked_sub(4).ok_or(Error::Format("catalog offset past the end"))?)? as usize;
    let end = off.checked_add(bytes).ok_or(Error::Format("catalog offset overflow"))?;
    let s = b.get(off..end).ok_or(Error::Format("catalog array past the end"))?;
    Ok(s.as_chunks::<4>().0.iter().map(|c| u32::from_le_bytes(*c)).collect())
}

fn is_picture_key(key: &str) -> bool {
    PICTURE_PREFIXES.iter().any(|p| key.starts_with(p))
}

fn uid(text: &str) -> Option<u32> {
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

/// The catalog key of a picture. Flags have two spellings, tried in order.
pub(crate) fn keys(kind: Kind, id: u32) -> Vec<String> {
    match kind {
        Kind::Club => vec![format!("club_{id}")],
        Kind::Competition => vec![format!("comp_{id}")],
        Kind::Face => vec![format!("person_{id}")],
        Kind::Flag => vec![format!("nation_logo_{id}"), format!("nation_flag_{id}")],
        Kind::KitHome => vec![format!("kit2d_{id}_home")],
        Kind::KitAway => vec![format!("kit2d_{id}_away")],
        Kind::KitThird => vec![format!("kit2d_{id}_third")],
    }
}

/// `club-eng_pl_assets_all_<32 hex>.bundle` is `club-eng_pl_assets_all.bundle` on disk.
pub(crate) fn bundle_file_name(catalog_name: &str) -> Option<String> {
    let stem = catalog_name.strip_suffix(".bundle")?;
    let stem = match stem.rsplit_once('_') {
        Some((head, hash)) if hash.len() == 32 && hash.bytes().all(|b| b.is_ascii_hexdigit()) => head,
        _ => stem,
    };
    let safe = !stem.is_empty()
        && !stem.starts_with('.')
        && stem.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
        && !stem.contains("..");
    safe.then(|| format!("{stem}.bundle"))
}

impl Catalog {
    pub fn parse(b: &[u8]) -> Result<Self> {
        if u32_at(b, 0)? != MAGIC || u32_at(b, 4)? != VERSION {
            return Err(Error::Format("not an Addressables catalog this reader knows"));
        }
        let n_keys = u32_at(b, 0x20)? as usize / 8;
        if KEY_TABLE
            .checked_add(n_keys.checked_mul(8).ok_or(Error::Format("catalog offset overflow"))?)
            .is_none_or(|e| e > b.len())
        {
            return Err(Error::Format("catalog key table past the end"));
        }
        let mut entries: HashMap<String, Entry> = HashMap::new();
        let mut seen = HashSet::new();
        let mut classes: HashMap<u32, Option<Res>> = HashMap::new();
        let mut names: HashMap<u32, Option<Arc<str>>> = HashMap::new();
        let mut interned: HashMap<String, Arc<str>> = HashMap::new();
        for i in 0..n_keys {
            let list = u32_at(b, KEY_TABLE + 8 * i + 4)? & OFFSET_MASK;
            for loc in array(b, list)? {
                if !seen.insert(loc) {
                    continue;
                }
                let loc = loc as usize;
                let word = |n: usize| u32_at(b, loc + 4 * n);
                let Ok(key) = string(b, word(0)?, 0) else { continue };
                if !is_picture_key(&key) {
                    continue;
                }
                let rt = word(6)?;
                let res = match classes.get(&rt) {
                    Some(r) => *r,
                    None => {
                        let r = resource(b, rt).ok().flatten();
                        classes.insert(rt, r);
                        r
                    }
                };
                let Some(res) = res else { continue };
                let deps = word(3)?;
                if deps == 0 || deps == NONE {
                    continue;
                }
                let Some(&first) = array(b, deps)?.first() else { continue };
                let bundle = match names.get(&first) {
                    Some(n) => n.clone(),
                    None => {
                        let n = string(b, u32_at(b, first as usize)?, 0)
                            .ok()
                            .and_then(|s| bundle_file_name(&s))
                            .map(|f| interned.entry(f.clone()).or_insert_with(|| Arc::from(f)).clone());
                        names.insert(first, n.clone());
                        n
                    }
                };
                let Some(bundle) = bundle else { continue };
                let Ok(guid) = string(b, word(1)?, 0) else { continue };
                let entry = Entry { guid: guid.to_ascii_lowercase(), bundle, res };
                match entries.get(&key) {
                    Some(old) if old.res == Res::Texture || res == Res::Sprite => {}
                    _ => {
                        entries.insert(key, entry);
                    }
                }
            }
        }
        Ok(Self { entries, aliases: HashMap::new() })
    }

    /// A key's entry, going through the alias table when it is not a primary key.
    pub fn find(&self, key: &str) -> Option<&Entry> {
        self.entries.get(key).or_else(|| self.aliases.get(key).and_then(|target| self.entries.get(target)))
    }

    pub fn lookup(&self, kind: Kind, id: u32) -> Option<&Entry> {
        keys(kind, id).iter().find_map(|k| self.find(k))
    }

    pub fn counts(&self) -> Counts {
        let mut counts = Counts::default();
        let mut flags = HashSet::new();
        for key in self.entries.keys() {
            if let Some(rest) = key.strip_prefix("club_") {
                counts.clubs += usize::from(uid(rest).is_some());
            } else if let Some(rest) = key.strip_prefix("comp_") {
                counts.competitions += usize::from(uid(rest).is_some());
            } else if let Some(rest) = key.strip_prefix("person_") {
                counts.faces += usize::from(uid(rest).is_some());
            } else if let Some(id) = key.strip_prefix("nation_logo_").or_else(|| key.strip_prefix("nation_flag_")) {
                flags.extend(uid(id));
            } else if let Some(rest) = key.strip_prefix("kit2d_")
                && let Some((id, variant)) = rest.split_once('_')
                && uid(id).is_some()
                && matches!(variant, "home" | "away" | "third")
            {
                counts.kits += 1;
            }
        }
        counts.flags = flags.len();
        counts
    }
}

/// What a location's resource type is, when it is one this reader draws.
fn resource(b: &[u8], rt: u32) -> Result<Option<Res>> {
    let class = string(b, u32_at(b, (rt & OFFSET_MASK) as usize + 4)?, 0)?;
    Ok(match class.as_str() {
        // The catalog stores this one as two parts that join without a dot.
        "UnityEngine.Texture2D" | "UnityEngineTexture2D" => Some(Res::Texture),
        "UnityEngine.Sprite" => Some(Res::Sprite),
        _ => None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_primary_keys() {
        assert_eq!(keys(Kind::Club, 602), ["club_602"]);
        assert_eq!(keys(Kind::Competition, 11), ["comp_11"]);
        assert_eq!(keys(Kind::Face, 28122642), ["person_28122642"]);
        assert_eq!(keys(Kind::Flag, 765), ["nation_logo_765", "nation_flag_765"]);
        assert_eq!(keys(Kind::KitHome, 602), ["kit2d_602_home"]);
        assert_eq!(keys(Kind::KitAway, 602), ["kit2d_602_away"]);
        assert_eq!(keys(Kind::KitThird, 602), ["kit2d_602_third"]);
    }

    #[test]
    fn strips_the_hash_from_bundle_names() {
        let hash = "0123456789abcdef0123456789ABCDEF";
        assert_eq!(
            bundle_file_name(&format!("club-eng_pl_assets_all_{hash}.bundle")).unwrap(),
            "club-eng_pl_assets_all.bundle"
        );
        assert_eq!(bundle_file_name("catalog_info_assets_all.bundle").unwrap(), "catalog_info_assets_all.bundle");
        assert_eq!(
            bundle_file_name(&format!("a_{}.bundle", &hash[..31])).unwrap(),
            format!("a_{}.bundle", &hash[..31])
        );
        assert!(bundle_file_name("club.zip").is_none());
        assert!(bundle_file_name("../club.bundle").is_none());
        assert!(bundle_file_name("a/b.bundle").is_none());
        assert!(bundle_file_name(".bundle").is_none());
    }

    #[test]
    fn uids_are_plain_digits() {
        assert_eq!(uid("602"), Some(602));
        assert_eq!(uid("default_1"), None);
        assert_eq!(uid(""), None);
        assert_eq!(uid("99999999999"), None);
    }

    /// Builds a catalog string area where `[len][bytes]` sits right before each offset.
    fn push_str(buf: &mut Vec<u8>, s: &str) -> u32 {
        buf.extend_from_slice(&(s.len() as u32).to_le_bytes());
        let off = buf.len() as u32;
        buf.extend_from_slice(s.as_bytes());
        while !buf.len().is_multiple_of(4) {
            buf.push(0);
        }
        off
    }

    fn push_u32s(buf: &mut Vec<u8>, words: &[u32]) -> u32 {
        buf.extend_from_slice(&(words.len() as u32 * 4).to_le_bytes());
        let off = buf.len() as u32;
        for w in words {
            buf.extend_from_slice(&w.to_le_bytes());
        }
        off
    }

    #[test]
    fn reads_plain_and_multi_part_strings() {
        let mut b = vec![0u8; 8];
        let tex = push_str(&mut b, "UnityEngine");
        let tail = push_str(&mut b, ".Texture2D");
        let last = b.len() as u32;
        b.extend_from_slice(&tail.to_le_bytes());
        b.extend_from_slice(&NONE.to_le_bytes());
        let head = b.len() as u32;
        b.extend_from_slice(&tex.to_le_bytes());
        b.extend_from_slice(&last.to_le_bytes());
        assert_eq!(string(&b, tex, 0).unwrap(), "UnityEngine");
        assert_eq!(string(&b, head | MULTI_PART, 0).unwrap(), ".Texture2DUnityEngine");
        assert!(string(&b, 0, 0).is_err());
        assert!(string(&b, 2, 0).is_err());
        assert!(string(&b, 9000, 0).is_err());
    }

    #[test]
    fn a_looping_multi_part_string_is_refused() {
        let mut b = vec![0u8; 8];
        let s = push_str(&mut b, "x");
        let node = b.len() as u32;
        b.extend_from_slice(&s.to_le_bytes());
        b.extend_from_slice(&node.to_le_bytes());
        assert!(string(&b, node | MULTI_PART, 0).is_err());
    }

    #[test]
    fn parses_a_tiny_catalog() {
        let mut b = vec![0u8; KEY_TABLE + 8];
        b[0..4].copy_from_slice(&MAGIC.to_le_bytes());
        b[4..8].copy_from_slice(&VERSION.to_le_bytes());
        b[0x20..0x24].copy_from_slice(&8u32.to_le_bytes());
        let pk = push_str(&mut b, "club_602");
        let guid = push_str(&mut b, "ABCDEF0123456789ABCDEF0123456789");
        let bundle_key = push_str(&mut b, "club-eng_pl_assets_all_0123456789abcdef0123456789abcdef.bundle");
        let class = push_str(&mut b, "UnityEngine.Texture2D");
        let rt = b.len() as u32;
        b.extend_from_slice(&0u32.to_le_bytes());
        b.extend_from_slice(&class.to_le_bytes());
        let dep_loc = b.len() as u32;
        for w in [bundle_key, 0, 0, NONE, 0, 0, 0] {
            b.extend_from_slice(&w.to_le_bytes());
        }
        let deps = push_u32s(&mut b, &[dep_loc]);
        let loc = b.len() as u32;
        for w in [pk, guid, 0, deps, 0, 0, rt] {
            b.extend_from_slice(&w.to_le_bytes());
        }
        let list = push_u32s(&mut b, &[loc]);
        b[KEY_TABLE + 4..KEY_TABLE + 8].copy_from_slice(&list.to_le_bytes());
        let mut cat = Catalog::parse(&b).unwrap();
        let entry = cat.lookup(Kind::Club, 602).unwrap();
        assert_eq!(entry.guid, "abcdef0123456789abcdef0123456789");
        assert_eq!(&*entry.bundle, "club-eng_pl_assets_all.bundle");
        assert!(cat.lookup(Kind::Club, 603).is_none());
        cat.aliases.insert("club_7".into(), "club_602".into());
        assert!(cat.lookup(Kind::Club, 7).is_some());
        assert_eq!(cat.counts().clubs, 1);
    }

    #[test]
    fn refuses_other_files() {
        assert!(Catalog::parse(&[]).is_err());
        assert!(Catalog::parse(&[0; 64]).is_err());
        let mut b = vec![0u8; 0x30];
        b[0..4].copy_from_slice(&MAGIC.to_le_bytes());
        b[4..8].copy_from_slice(&VERSION.to_le_bytes());
        b[0x20..0x24].copy_from_slice(&0xffff_fff0u32.to_le_bytes());
        assert!(Catalog::parse(&b).is_err());
    }
}
