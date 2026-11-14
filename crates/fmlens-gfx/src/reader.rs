use crate::error::{Error, Result};

/// A reader over a byte slice that fails instead of reading past the end.
pub(crate) struct Cur<'a> {
    buf: &'a [u8],
    pos: usize,
    /// Where `buf` starts inside the file it was cut from, so alignment matches the file.
    base: u64,
    big: bool,
}

macro_rules! num {
    ($name:ident, $t:ty, $n:expr) => {
        pub fn $name(&mut self) -> Result<$t> {
            let a = self.array::<$n>()?;
            Ok(if self.big { <$t>::from_be_bytes(a) } else { <$t>::from_le_bytes(a) })
        }
    };
}

impl<'a> Cur<'a> {
    pub fn new(buf: &'a [u8], base: u64, big: bool) -> Self {
        Self { buf, pos: 0, base, big }
    }

    pub fn pos(&self) -> usize {
        self.pos
    }

    pub fn seek(&mut self, pos: usize) -> Result<()> {
        if pos > self.buf.len() {
            return Err(Error::Format("offset past the end"));
        }
        self.pos = pos;
        Ok(())
    }

    pub fn remaining(&self) -> usize {
        self.buf.len().saturating_sub(self.pos)
    }

    pub fn bytes(&mut self, n: usize) -> Result<&'a [u8]> {
        let end = self.pos.checked_add(n).ok_or(Error::Format("length overflow"))?;
        let out = self.buf.get(self.pos..end).ok_or(Error::Format("read past the end"))?;
        self.pos = end;
        Ok(out)
    }

    fn array<const N: usize>(&mut self) -> Result<[u8; N]> {
        <[u8; N]>::try_from(self.bytes(N)?).map_err(|_| Error::Format("read past the end"))
    }

    pub fn skip(&mut self, n: usize) -> Result<()> {
        self.bytes(n).map(|_| ())
    }

    /// Skips `count` items of `size` bytes each.
    pub fn skip_items(&mut self, count: usize, size: usize) -> Result<()> {
        self.skip(count.checked_mul(size).ok_or(Error::Format("length overflow"))?)
    }

    num!(u8, u8, 1);
    num!(u16, u16, 2);
    num!(i16, i16, 2);
    num!(u32, u32, 4);
    num!(i32, i32, 4);
    num!(u64, u64, 8);
    num!(i64, i64, 8);
    num!(f32, f32, 4);

    /// Moves to the next multiple of `n` counted from the start of the file.
    pub fn align(&mut self, n: u64) -> Result<()> {
        let abs = self.base.checked_add(self.pos as u64).ok_or(Error::Format("length overflow"))?;
        let rem = abs % n;
        if rem != 0 {
            self.skip((n - rem) as usize)?;
        }
        Ok(())
    }

    /// An item count, refused when `count * min_size` could not fit in what is left.
    pub fn count(&mut self, min_size: usize) -> Result<usize> {
        let n = self.u32()? as usize;
        if n.checked_mul(min_size.max(1)).is_none_or(|total| total > self.remaining()) {
            return Err(Error::Format("count larger than the data"));
        }
        Ok(n)
    }

    /// A zero-terminated string.
    pub fn cstr(&mut self) -> Result<String> {
        let rest = self.buf.get(self.pos..).ok_or(Error::Format("read past the end"))?;
        let len = rest.iter().position(|&b| b == 0).ok_or(Error::Format("unterminated string"))?;
        let s = String::from_utf8_lossy(&rest[..len]).into_owned();
        self.pos += len + 1;
        Ok(s)
    }

    /// A length-prefixed string padded to 4 bytes.
    pub fn astr(&mut self) -> Result<String> {
        let len = self.u32()? as usize;
        let s = String::from_utf8_lossy(self.bytes(len)?).into_owned();
        self.align(4)?;
        Ok(s)
    }

    /// A packed pointer (file id and path id) to an object.
    pub fn pptr(&mut self) -> Result<(i32, i64)> {
        Ok((self.i32()?, self.i64()?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aligned_string_skips_padding() {
        let mut data = vec![3, 0, 0, 0, b'a', b'b', b'c', 0];
        data.extend_from_slice(&7u32.to_le_bytes());
        let mut c = Cur::new(&data, 0, false);
        assert_eq!(c.astr().unwrap(), "abc");
        assert_eq!(c.u32().unwrap(), 7);
    }

    #[test]
    fn alignment_follows_the_file_offset() {
        let data = [1u8, 0, 0, 0, 0, 0];
        let mut c = Cur::new(&data, 2, false);
        c.u8().unwrap();
        c.align(4).unwrap();
        assert_eq!(c.pos(), 2);
    }

    #[test]
    fn reads_past_the_end_fail() {
        let mut c = Cur::new(&[1, 2, 3], 0, true);
        assert!(c.u32().is_err());
        assert!(c.bytes(usize::MAX).is_err());
        assert!(c.seek(4).is_err());
        let long = [255u8, 255, 255, 255, 1];
        assert!(Cur::new(&long, 0, false).astr().is_err());
    }

    #[test]
    fn counts_larger_than_the_data_fail() {
        let data = [0, 0, 0, 9, 1, 2];
        assert!(Cur::new(&data, 0, true).count(1).is_err());
        let ok = [0, 0, 0, 2, 1, 2];
        assert_eq!(Cur::new(&ok, 0, true).count(1).unwrap(), 2);
    }

    #[test]
    fn unterminated_string_fails() {
        assert!(Cur::new(b"abc", 0, false).cstr().is_err());
        assert_eq!(Cur::new(b"ab\0c", 0, false).cstr().unwrap(), "ab");
    }

    #[test]
    fn byte_order_follows_the_flag() {
        let data = [0, 0, 1, 0];
        assert_eq!(Cur::new(&data, 0, true).u32().unwrap(), 256);
        assert_eq!(Cur::new(&data, 0, false).u32().unwrap(), 65536);
    }
}
