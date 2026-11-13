//! Unity asset bundles (UnityFS version 8) and the serialized files inside them.
//!
//! A bundle is opened lazily: only the header, the block table and the object table are read.
//! Pixels are pulled out later by decompressing just the blocks that cover them.

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::reader::Cur;

pub(crate) const CLASS_TEXTURE2D: i32 = 28;
pub(crate) const CLASS_MONO_BEHAVIOUR: i32 = 114;
pub(crate) const CLASS_ASSET_BUNDLE: i32 = 142;
pub(crate) const CLASS_SPRITE: i32 = 213;
const CLASS_SPRITE_ATLAS: i32 = 687_078_895;

const SERIALIZED_VERSION: u32 = 22;
const HEADER_READ: u64 = 512;
/// No single block in a real bundle comes near this; it stops a damaged size from allocating a lot.
const MAX_BLOCK_BYTES: u64 = 64 << 20;
const FLAG_INFO_AT_END: u32 = 0x80;
const FLAG_PADDING: u32 = 0x200;

#[derive(Debug)]
struct Block {
    /// Where this block starts in the decompressed data.
    start: u64,
    size: u32,
    compressed: u32,
    /// Where the compressed bytes start in the file.
    file_off: u64,
    method: u8,
}

#[derive(Debug, Clone)]
pub(crate) struct Node {
    off: u64,
    pub size: u64,
    path: String,
}

/// The container of one bundle file: its blocks and the files inside.
#[derive(Debug)]
pub(crate) struct Fs {
    path: PathBuf,
    blocks: Vec<Block>,
    nodes: Vec<Node>,
}

fn read_at(file: &mut File, file_len: u64, off: u64, len: u64) -> Result<Vec<u8>> {
    let end = off.checked_add(len).ok_or(Error::Format("length overflow"))?;
    if end > file_len {
        return Err(Error::Format("file is cut short"));
    }
    file.seek(SeekFrom::Start(off))?;
    let mut buf = vec![0u8; usize::try_from(len).map_err(|_| Error::Format("length overflow"))?];
    file.read_exact(&mut buf)?;
    Ok(buf)
}

/// Decompresses one block (0 stored, 2 or 3 LZ4) to exactly `out_len` bytes.
fn unpack(method: u8, data: &[u8], out_len: usize) -> Result<Vec<u8>> {
    match method {
        0 if data.len() == out_len => Ok(data.to_vec()),
        0 => Err(Error::Format("stored block has the wrong size")),
        2 | 3 => {
            let max = (data.len() as u64).saturating_mul(255).saturating_add(64).min(MAX_BLOCK_BYTES);
            if out_len as u64 > max {
                return Err(Error::Format("block claims an impossible size"));
            }
            let mut out = vec![0u8; out_len];
            let n = lz4_flex::block::decompress_into(data, &mut out)
                .map_err(|_| Error::Format("block does not decompress"))?;
            if n != out_len {
                return Err(Error::Format("block decompresses to the wrong size"));
            }
            Ok(out)
        }
        other => Err(Error::Unsupported(format!("bundle compression {other}"))),
    }
}

impl Fs {
    pub fn open(path: &Path) -> Result<Self> {
        let mut file = File::open(path)?;
        let file_len = file.metadata()?.len();
        let head = read_at(&mut file, file_len, 0, file_len.min(HEADER_READ))?;
        let mut c = Cur::new(&head, 0, true);
        if c.cstr()? != "UnityFS" {
            return Err(Error::Format("not a UnityFS bundle"));
        }
        if c.u32()? != 8 {
            return Err(Error::Unsupported("UnityFS version other than 8".into()));
        }
        c.cstr()?;
        c.cstr()?;
        let size = c.i64()?;
        if size < 0 || size as u64 > file_len {
            return Err(Error::Format("file is cut short"));
        }
        let info_compressed = u64::from(c.u32()?);
        let info_size = c.u32()? as usize;
        let flags = c.u32()?;
        if flags & FLAG_INFO_AT_END != 0 {
            return Err(Error::Unsupported("block table at the end of the bundle".into()));
        }
        if flags & FLAG_PADDING != 0 {
            c.align(16)?;
        }
        let info_off = c.pos() as u64;
        let raw = read_at(&mut file, file_len, info_off, info_compressed)?;
        let info = unpack((flags & 0x3f) as u8, &raw, info_size)?;
        let data_start = (info_off + info_compressed).div_ceil(16) * 16;

        let mut c = Cur::new(&info, 0, true);
        c.skip(16)?;
        let n_blocks = c.count(10)?;
        let mut blocks = Vec::with_capacity(n_blocks);
        let (mut start, mut file_off) = (0u64, data_start);
        for _ in 0..n_blocks {
            let (size, compressed, bflags) = (c.u32()?, c.u32()?, c.u16()?);
            if u64::from(size) > MAX_BLOCK_BYTES {
                return Err(Error::Format("block claims an impossible size"));
            }
            let end = file_off.checked_add(u64::from(compressed)).ok_or(Error::Format("length overflow"))?;
            if end > file_len {
                return Err(Error::Format("file is cut short"));
            }
            blocks.push(Block { start, size, compressed, file_off, method: (bflags & 0x3f) as u8 });
            start += u64::from(size);
            file_off = end;
        }
        let n_nodes = c.count(21)?;
        let mut nodes = Vec::with_capacity(n_nodes);
        for _ in 0..n_nodes {
            let (off, size) = (c.i64()?, c.i64()?);
            c.u32()?;
            let path = c.cstr()?;
            let (off, size) = (u64::try_from(off), u64::try_from(size));
            let (Ok(off), Ok(size)) = (off, size) else { return Err(Error::Format("negative file range")) };
            if off.checked_add(size).is_none_or(|end| end > start) {
                return Err(Error::Format("file range past the data"));
            }
            nodes.push(Node { off, size, path });
        }
        Ok(Self { path: path.to_path_buf(), blocks, nodes })
    }

    fn serialized(&self) -> Result<&Node> {
        self.nodes.iter().find(|n| !n.path.ends_with(".resS")).ok_or(Error::Format("bundle has no serialized file"))
    }

    /// The streamed-data file a texture names, matched on its last path part.
    pub fn stream_node(&self, texture_path: &str) -> Result<&Node> {
        let want = texture_path.rsplit('/').next().unwrap_or(texture_path);
        self.nodes
            .iter()
            .find(|n| n.path.rsplit('/').next() == Some(want))
            .ok_or(Error::Format("texture data file is missing from the bundle"))
    }

    /// `len` bytes at `rel` inside `node`, decompressing only the blocks that cover them.
    pub fn read(&self, node: &Node, rel: u64, len: u64) -> Result<Vec<u8>> {
        let end_rel = rel.checked_add(len).ok_or(Error::Format("length overflow"))?;
        if end_rel > node.size {
            return Err(Error::Format("range past the end of the file"));
        }
        let start = node.off + rel;
        let end = node.off + end_rel;
        let mut out = Vec::with_capacity(usize::try_from(len).map_err(|_| Error::Format("length overflow"))?);
        if len == 0 {
            return Ok(out);
        }
        let first = self.blocks.partition_point(|b| b.start + u64::from(b.size) <= start);
        let covering: Vec<&Block> = self.blocks.iter().skip(first).take_while(|b| b.start < end).collect();
        let (Some(&head), Some(&tail)) = (covering.first(), covering.last()) else {
            return Err(Error::Format("range past the data"));
        };
        let mut file = File::open(&self.path)?;
        let file_len = file.metadata()?.len();
        let span = tail.file_off + u64::from(tail.compressed) - head.file_off;
        let raw = read_at(&mut file, file_len, head.file_off, span)?;
        for b in covering.iter().copied() {
            let from = (b.file_off - head.file_off) as usize;
            let chunk = raw.get(from..from + b.compressed as usize).ok_or(Error::Format("file is cut short"))?;
            let block = unpack(b.method, chunk, b.size as usize)?;
            let lo = start.saturating_sub(b.start) as usize;
            let hi = (end - b.start).min(u64::from(b.size)) as usize;
            out.extend_from_slice(block.get(lo..hi).ok_or(Error::Format("range past the data"))?);
        }
        if out.len() as u64 != len {
            return Err(Error::Format("range past the data"));
        }
        Ok(out)
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct Obj {
    pub class: i32,
    start: u64,
    size: u32,
}

/// Where a sprite's pixels sit in its atlas texture.
#[derive(Debug, Clone, Copy)]
pub(crate) struct AtlasEntry {
    pub texture: i64,
    /// x, y, width, height in pixels, origin bottom-left.
    pub rect: [f32; 4],
    pub settings: u32,
}

pub(crate) type RenderKey = ([u8; 16], i64);

/// An opened bundle: the object table, the address container and any sprite atlases.
#[derive(Debug)]
pub(crate) struct Bundle {
    pub fs: Fs,
    data_offset: u64,
    objects: HashMap<i64, Obj>,
    /// Address GUID (lowercase hex) to the path ids of its objects: a texture and its sprite share one GUID.
    pub container: HashMap<String, Vec<i64>>,
    pub atlas: HashMap<RenderKey, AtlasEntry>,
}

impl Bundle {
    pub fn open(path: &Path) -> Result<Self> {
        let fs = Fs::open(path)?;
        let node = fs.serialized()?.clone();
        let head = fs.read(&node, 0, node.size.min(0x30))?;
        let mut c = Cur::new(&head, 0, true);
        c.skip(8)?;
        if c.u32()? != SERIALIZED_VERSION {
            return Err(Error::Unsupported("serialized file version other than 22".into()));
        }
        c.skip(4)?;
        if c.u8()? != 0 {
            return Err(Error::Unsupported("big-endian serialized file".into()));
        }
        c.skip(3)?;
        c.skip(4)?;
        let file_size = c.u64()?;
        let data_offset = c.u64()?;
        if file_size > node.size || data_offset > node.size || data_offset < 0x30 {
            return Err(Error::Format("serialized file header is out of range"));
        }
        let meta = fs.read(&node, 0, data_offset)?;
        let objects = parse_object_table(&meta)?;
        let mut bundle = Self { fs, data_offset, objects, container: HashMap::new(), atlas: HashMap::new() };
        bundle.index()?;
        Ok(bundle)
    }

    fn index(&mut self) -> Result<()> {
        let mut found: Vec<(i64, Obj)> = self.objects.iter().map(|(k, v)| (*k, *v)).collect();
        found.sort_by_key(|(id, _)| *id);
        for (_, obj) in found {
            match obj.class {
                CLASS_ASSET_BUNDLE if self.container.is_empty() => {
                    let (data, base) = self.read_object(&obj)?;
                    self.container = parse_container(&data, base)?;
                }
                CLASS_SPRITE_ATLAS => {
                    let (data, base) = self.read_object(&obj)?;
                    parse_atlas(&data, base, &mut self.atlas)?;
                }
                _ => {}
            }
        }
        Ok(())
    }

    pub fn object(&self, id: i64) -> Option<&Obj> {
        self.objects.get(&id)
    }

    /// The bytes of an object and where they start in the serialized file (for alignment).
    pub fn read_object(&self, obj: &Obj) -> Result<(Vec<u8>, u64)> {
        let node = self.fs.serialized()?;
        let rel = self.data_offset.checked_add(obj.start).ok_or(Error::Format("length overflow"))?;
        Ok((self.fs.read(node, rel, u64::from(obj.size))?, rel))
    }

    /// The first object of a class, for bundles that hold exactly one of it.
    pub fn first_of_class(&self, class: i32) -> Option<&Obj> {
        self.objects.values().filter(|o| o.class == class).min_by_key(|o| o.start)
    }
}

/// Reads the type list and the object table at the start of a serialized file.
fn parse_object_table(meta: &[u8]) -> Result<HashMap<i64, Obj>> {
    let mut c = Cur::new(meta, 0, false);
    c.seek(0x30)?;
    c.cstr()?;
    c.u32()?;
    let tree = c.u8()?;
    let n_types = c.count(23)?;
    let mut types = Vec::with_capacity(n_types);
    for _ in 0..n_types {
        let class = c.i32()?;
        c.u8()?;
        let script = c.i16()?;
        if class == CLASS_MONO_BEHAVIOUR || script >= 0 {
            c.skip(16)?;
        }
        c.skip(16)?;
        if tree != 0 {
            let nodes = c.u32()? as usize;
            let strings = c.u32()? as usize;
            c.skip(
                nodes.checked_mul(32).and_then(|n| n.checked_add(strings)).ok_or(Error::Format("length overflow"))?,
            )?;
        }
        let deps = c.count(4)?;
        c.skip_items(deps, 4)?;
        types.push(class);
    }
    let n_objects = c.count(24)?;
    let mut objects = HashMap::with_capacity(n_objects);
    for _ in 0..n_objects {
        c.align(4)?;
        let (id, start, size, type_index) = (c.i64()?, c.i64()?, c.u32()?, c.u32()?);
        let class = *types.get(type_index as usize).ok_or(Error::Format("object has an unknown type"))?;
        let start = u64::try_from(start).map_err(|_| Error::Format("negative object offset"))?;
        objects.insert(id, Obj { class, start, size });
    }
    Ok(objects)
}

/// The AssetBundle object's address table: GUID to path id (objects in this same file only).
fn parse_container(data: &[u8], base: u64) -> Result<HashMap<String, Vec<i64>>> {
    let mut c = Cur::new(data, base, false);
    c.astr()?;
    let preload = c.count(12)?;
    c.skip_items(preload, 12)?;
    let n = c.count(24)?;
    let mut out: HashMap<String, Vec<i64>> = HashMap::with_capacity(n);
    for _ in 0..n {
        let key = c.astr()?;
        c.skip(8)?;
        let (file_id, path_id) = c.pptr()?;
        if file_id == 0 {
            out.entry(key.to_ascii_lowercase()).or_default().push(path_id);
        }
    }
    Ok(out)
}

fn parse_atlas(data: &[u8], base: u64, out: &mut HashMap<RenderKey, AtlasEntry>) -> Result<()> {
    let mut c = Cur::new(data, base, false);
    c.astr()?;
    let packed = c.count(12)?;
    c.skip_items(packed, 12)?;
    let names = c.count(4)?;
    for _ in 0..names {
        c.astr()?;
    }
    let n = c.count(108)?;
    for _ in 0..n {
        let guid: [u8; 16] = c.bytes(16)?.try_into().map_err(|_| Error::Format("read past the end"))?;
        let key_id = c.i64()?;
        let (tex_file, texture) = c.pptr()?;
        c.skip(12)?;
        let rect = [c.f32()?, c.f32()?, c.f32()?, c.f32()?];
        c.skip(8 + 8 + 16 + 4)?;
        let settings = c.u32()?;
        if c.u32()? != 0 {
            return Err(Error::Unsupported("sprite atlas with secondary textures".into()));
        }
        if tex_file == 0 {
            out.insert((guid, key_id), AtlasEntry { texture, rect, settings });
        }
    }
    Ok(())
}

/// A Texture2D's size, format and where its streamed pixels are.
#[derive(Debug)]
pub(crate) struct Texture {
    pub width: u32,
    pub height: u32,
    pub format: i32,
    pub stream_off: u64,
    pub stream_size: u32,
    pub stream_path: String,
}

const MAX_SIDE: i32 = 16_384;

pub(crate) fn parse_texture(data: &[u8], base: u64) -> Result<Texture> {
    let mut c = Cur::new(data, base, false);
    c.astr()?;
    c.u8()?;
    c.align(4)?;
    let (width, height) = (c.i32()?, c.i32()?);
    c.skip(8)?;
    let format = c.i32()?;
    c.i32()?;
    c.skip(3)?;
    c.align(4)?;
    c.astr()?;
    c.u8()?;
    c.align(4)?;
    c.skip(3 * 4)?;
    c.skip(6 * 4 + 4 + 4)?;
    let blob = c.u32()? as usize;
    c.skip(blob)?;
    c.align(4)?;
    let inline = c.u32()?;
    if inline != 0 {
        return Err(Error::Unsupported("texture with its pixels inside the bundle".into()));
    }
    c.align(4)?;
    let stream_off = c.u64()?;
    let stream_size = c.u32()?;
    let path_len = c.u32()? as usize;
    let stream_path = String::from_utf8_lossy(c.bytes(path_len)?).into_owned();
    if !(1..=MAX_SIDE).contains(&width) || !(1..=MAX_SIDE).contains(&height) {
        return Err(Error::Format("texture size is out of range"));
    }
    Ok(Texture { width: width as u32, height: height as u32, format, stream_off, stream_size, stream_path })
}

/// A sprite's key into its atlas's render data.
pub(crate) fn parse_sprite_key(data: &[u8], base: u64) -> Result<RenderKey> {
    let mut c = Cur::new(data, base, false);
    c.astr()?;
    c.skip(16 + 8 + 16 + 4 + 8 + 4)?;
    c.u8()?;
    c.align(4)?;
    let guid: [u8; 16] = c.bytes(16)?.try_into().map_err(|_| Error::Format("read past the end"))?;
    Ok((guid, c.i64()?))
}

/// The alias table inside the catalog bundle: alias key to the key it stands for.
pub(crate) fn parse_aliases(data: &[u8], base: u64) -> Result<HashMap<String, String>> {
    let mut c = Cur::new(data, base, false);
    c.skip(12)?;
    c.u8()?;
    c.align(4)?;
    c.skip(12)?;
    c.astr()?;
    c.astr()?;
    let n = c.count(4)?;
    let mut aliases = Vec::with_capacity(n);
    for _ in 0..n {
        aliases.push(c.astr()?);
    }
    let m = c.count(4)?;
    let mut from = Vec::with_capacity(m);
    for _ in 0..m {
        from.push(c.i32()?);
    }
    let k = c.count(4)?;
    let mut addresses = Vec::with_capacity(k);
    for _ in 0..k {
        addresses.push(c.astr()?);
    }
    if m != n {
        return Err(Error::Format("alias table lengths differ"));
    }
    let mut out = HashMap::with_capacity(n);
    for (alias, idx) in aliases.into_iter().zip(from) {
        let target =
            usize::try_from(idx).ok().and_then(|i| addresses.get(i)).ok_or(Error::Format("alias points nowhere"))?;
        out.insert(alias, target.clone());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A small stored (uncompressed) UnityFS file with two blocks and two files.
    fn stored_bundle(first: &[u8], second: &[u8]) -> Vec<u8> {
        let mut info = vec![0u8; 16];
        info.extend_from_slice(&2u32.to_be_bytes());
        for part in [first, second] {
            info.extend_from_slice(&(part.len() as u32).to_be_bytes());
            info.extend_from_slice(&(part.len() as u32).to_be_bytes());
            info.extend_from_slice(&0u16.to_be_bytes());
        }
        info.extend_from_slice(&2u32.to_be_bytes());
        let total = (first.len() + second.len()) as i64;
        for (off, size, name) in [(0i64, total, "CAB-a"), (2, 4, "CAB-a.resS")] {
            info.extend_from_slice(&off.to_be_bytes());
            info.extend_from_slice(&size.to_be_bytes());
            info.extend_from_slice(&0u32.to_be_bytes());
            info.extend_from_slice(name.as_bytes());
            info.push(0);
        }
        let mut out = b"UnityFS\0".to_vec();
        out.extend_from_slice(&8u32.to_be_bytes());
        out.extend_from_slice(b"5.x.x\0");
        out.extend_from_slice(b"6000.3.18f1\0");
        let size_at = out.len();
        out.extend_from_slice(&0i64.to_be_bytes());
        out.extend_from_slice(&(info.len() as u32).to_be_bytes());
        out.extend_from_slice(&(info.len() as u32).to_be_bytes());
        out.extend_from_slice(&0x240u32.to_be_bytes());
        while !out.len().is_multiple_of(16) {
            out.push(0);
        }
        out.extend_from_slice(&info);
        while !out.len().is_multiple_of(16) {
            out.push(0);
        }
        out.extend_from_slice(first);
        out.extend_from_slice(second);
        let len = out.len() as i64;
        out[size_at..size_at + 8].copy_from_slice(&len.to_be_bytes());
        out
    }

    fn write_temp(name: &str, bytes: &[u8]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("fmlens-gfx-{}-{name}", std::process::id()));
        std::fs::write(&dir, bytes).unwrap();
        dir
    }

    #[test]
    fn reads_ranges_across_blocks() {
        let path = write_temp("stored", &stored_bundle(b"abcd", b"efgh"));
        let fs = Fs::open(&path).unwrap();
        let node = fs.nodes[0].clone();
        assert_eq!(fs.read(&node, 0, 8).unwrap(), b"abcdefgh");
        assert_eq!(fs.read(&node, 3, 2).unwrap(), b"de");
        let res = fs.stream_node("archive:/CAB-a/CAB-a.resS").unwrap().clone();
        assert_eq!(fs.read(&res, 0, 4).unwrap(), b"cdef");
        assert!(fs.read(&res, 1, 4).is_err());
        assert!(fs.read(&node, u64::MAX, 2).is_err());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn damaged_bundles_are_refused() {
        let good = stored_bundle(b"abcd", b"efgh");
        let mut bad_magic = good.clone();
        bad_magic[0] = b'X';
        let mut bad_version = good.clone();
        bad_version[11] = 7;
        let cut = good[..good.len() - 3].to_vec();
        for (name, bytes) in [("magic", bad_magic), ("version", bad_version), ("cut", cut), ("empty", Vec::new())] {
            let path = write_temp(name, &bytes);
            assert!(Fs::open(&path).is_err(), "{name} should fail");
            std::fs::remove_file(path).ok();
        }
        assert!(Fs::open(Path::new("/definitely/not/here.bundle")).is_err());
    }

    #[test]
    fn unknown_compression_is_unsupported() {
        assert!(matches!(unpack(1, b"x", 1), Err(Error::Unsupported(_))));
        assert!(unpack(0, b"abc", 2).is_err());
        assert!(unpack(3, b"\x10", usize::MAX / 2).is_err());
        assert!(unpack(3, b"\xff\xff", 8).is_err());
    }

    #[test]
    fn object_table_rejects_garbage() {
        assert!(parse_object_table(&[0u8; 8]).is_err());
        let mut meta = vec![0u8; 0x30];
        meta.extend_from_slice(b"6000\0");
        meta.extend_from_slice(&5u32.to_le_bytes());
        meta.push(1);
        meta.extend_from_slice(&u32::MAX.to_le_bytes());
        assert!(parse_object_table(&meta).is_err());
    }

    #[test]
    fn texture_and_container_reads_fail_cleanly_on_short_data() {
        assert!(parse_texture(&[1, 0, 0, 0, b'a'], 0).is_err());
        assert!(parse_container(&[0xff; 12], 0).is_err());
        assert!(parse_sprite_key(&[0; 6], 0).is_err());
        assert!(parse_aliases(&[0; 20], 0).is_err());
    }
}
