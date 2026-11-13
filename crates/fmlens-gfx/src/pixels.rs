//! Turning stored texture data into an upright RGBA picture, shrinking it and writing a PNG.

use std::panic::{AssertUnwindSafe, catch_unwind};

use crate::error::{Error, Result};

const BC7: i32 = 25;
const DXT5: i32 = 12;
const DXT1_CRUNCHED: i32 = 28;
const DXT5_CRUNCHED: i32 = 29;

/// An 8-bit RGBA picture, rows top to bottom.
#[derive(Debug)]
pub(crate) struct Rgba {
    pub w: u32,
    pub h: u32,
    pub data: Vec<u8>,
}

/// How many bytes of the stored data to read for mip 0, or `None` for crunched data (all of it).
pub(crate) fn mip0_bytes(format: i32, w: u32, h: u32) -> Result<Option<u64>> {
    match format {
        BC7 | DXT5 => {
            if !w.is_multiple_of(4) || !h.is_multiple_of(4) {
                return Err(Error::Unsupported("block texture size not a multiple of 4".into()));
            }
            Ok(Some(u64::from(w / 4) * u64::from(h / 4) * 16))
        }
        DXT1_CRUNCHED | DXT5_CRUNCHED => Ok(None),
        other => Err(Error::Unsupported(format!("texture format {other}"))),
    }
}

/// Decodes mip 0 as stored (rows bottom to top, as Unity keeps them).
pub(crate) fn decode(format: i32, w: u32, h: u32, data: &[u8]) -> Result<Rgba> {
    let (width, height) = (w as usize, h as usize);
    let mut px = vec![0u32; width * height];
    // The decoder crate indexes freely, so damaged data must not be able to take the caller down.
    let done = catch_unwind(AssertUnwindSafe(|| match format {
        BC7 => texture2ddecoder::decode_bc7(data, width, height, &mut px),
        DXT5 => texture2ddecoder::decode_bc3(data, width, height, &mut px),
        _ => texture2ddecoder::decode_unity_crunch(data, width, height, &mut px),
    }));
    match done {
        Ok(Ok(())) => {}
        Ok(Err(_)) | Err(_) => return Err(Error::Format("texture data does not decode")),
    }
    let mut out = Vec::with_capacity(px.len() * 4);
    for p in px {
        let [b, g, r, a] = p.to_le_bytes();
        out.extend_from_slice(&[r, g, b, a]);
    }
    Ok(Rgba { w, h, data: out })
}

impl Rgba {
    fn stride(&self) -> usize {
        self.w as usize * 4
    }

    /// Reverses the row order.
    pub fn flip(&mut self) {
        let stride = self.stride();
        self.data = self.data.chunks_exact(stride).rev().flatten().copied().collect();
    }

    /// The rectangle at `x`, `y` with the given size, counted from the first row.
    pub fn crop(&self, x: u32, y: u32, w: u32, h: u32) -> Result<Rgba> {
        let fits = |start: u32, len: u32, total: u32| len > 0 && start.checked_add(len).is_some_and(|e| e <= total);
        if !fits(x, w, self.w) || !fits(y, h, self.h) {
            return Err(Error::Format("sprite rectangle is outside its texture"));
        }
        let stride = self.stride();
        let mut data = Vec::with_capacity(w as usize * h as usize * 4);
        for row in y..y + h {
            let from = row as usize * stride + x as usize * 4;
            data.extend_from_slice(
                self.data.get(from..from + w as usize * 4).ok_or(Error::Format("crop past the end"))?,
            );
        }
        Ok(Rgba { w, h, data })
    }

    /// Scales down so the longer side is at most `max_side`, averaging the covered area. Never scales up.
    pub fn shrink(self, max_side: u32) -> Rgba {
        let longer = self.w.max(self.h);
        if longer <= max_side || max_side == 0 {
            return self;
        }
        let fit =
            |v: u32| ((u64::from(v) * u64::from(max_side) + u64::from(longer) / 2) / u64::from(longer)).max(1) as u32;
        let (nw, nh) = (fit(self.w), fit(self.h));
        // Colour is averaged premultiplied by alpha so clear pixels do not tint their neighbours.
        let mut src = Vec::with_capacity(self.data.len());
        for p in self.data.as_chunks::<4>().0 {
            let a = f32::from(p[3]);
            src.extend_from_slice(&[
                f32::from(p[0]) * a / 255.0,
                f32::from(p[1]) * a / 255.0,
                f32::from(p[2]) * a / 255.0,
                a,
            ]);
        }
        let across = squeeze(&src, self.w as usize, self.h as usize, nw as usize, true);
        let down = squeeze(&across, nw as usize, self.h as usize, nh as usize, false);
        let mut data = Vec::with_capacity(nw as usize * nh as usize * 4);
        for p in down.as_chunks::<4>().0 {
            let a = p[3];
            let un = |c: f32| if a > 0.0 { (c * 255.0 / a).round().clamp(0.0, 255.0) as u8 } else { 0 };
            data.extend_from_slice(&[un(p[0]), un(p[1]), un(p[2]), a.round().clamp(0.0, 255.0) as u8]);
        }
        Rgba { w: nw, h: nh, data }
    }

    pub fn to_png(&self) -> Result<Vec<u8>> {
        let mut out = Vec::new();
        let encode = |e: png::EncodingError| Error::Encode(e.to_string());
        let mut enc = png::Encoder::new(&mut out, self.w, self.h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().map_err(encode)?;
        writer.write_image_data(&self.data).map_err(encode)?;
        writer.finish().map_err(encode)?;
        Ok(out)
    }
}

/// Shrinks one axis of a 4-channel float image to `to` pixels by area averaging.
/// `src` is `w` by `h` pixels; the horizontal axis is shrunk when `horizontal`, else the vertical one.
fn squeeze(src: &[f32], w: usize, h: usize, to: usize, horizontal: bool) -> Vec<f32> {
    let (from, lines) = if horizontal { (w, h) } else { (h, w) };
    let step = from as f64 / to as f64;
    let mut out = vec![0f32; if horizontal { to * h * 4 } else { w * to * 4 }];
    for o in 0..to {
        let (lo, hi) = (o as f64 * step, (o + 1) as f64 * step);
        for i in (lo.floor() as usize)..(hi.ceil() as usize).min(from) {
            let weight = ((hi.min((i + 1) as f64) - lo.max(i as f64)) / step) as f32;
            for line in 0..lines {
                let (s, d) = if horizontal {
                    ((line * w + i) * 4, (line * to + o) * 4)
                } else {
                    ((i * w + line) * 4, (o * w + line) * 4)
                };
                for c in 0..4 {
                    out[d + c] += src[s + c] * weight;
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(w: u32, h: u32, px: [u8; 4]) -> Rgba {
        Rgba { w, h, data: px.iter().copied().cycle().take((w * h * 4) as usize).collect() }
    }

    #[test]
    fn downscale_never_enlarges() {
        let img = solid(8, 4, [1, 2, 3, 255]).shrink(16);
        assert_eq!((img.w, img.h), (8, 4));
        let same = solid(8, 4, [1, 2, 3, 255]).shrink(8);
        assert_eq!((same.w, same.h), (8, 4));
    }

    #[test]
    fn downscale_keeps_the_aspect_ratio() {
        let img = solid(512, 320, [9, 9, 9, 255]).shrink(256);
        assert_eq!((img.w, img.h), (256, 160));
        let tiny = solid(1000, 3, [9, 9, 9, 255]).shrink(10);
        assert_eq!((tiny.w, tiny.h), (10, 1));
    }

    #[test]
    fn downscale_averages_the_covered_area() {
        let mut img = solid(4, 1, [0, 0, 0, 255]);
        img.data[0..4].copy_from_slice(&[200, 0, 0, 255]);
        img.data[4..8].copy_from_slice(&[100, 0, 0, 255]);
        let out = img.shrink(2);
        assert_eq!((out.w, out.h), (2, 1));
        assert_eq!(&out.data[0..4], &[150, 0, 0, 255]);
        assert_eq!(&out.data[4..8], &[0, 0, 0, 255]);
    }

    #[test]
    fn downscale_does_not_tint_from_clear_pixels() {
        let mut img = solid(2, 1, [255, 0, 0, 255]);
        img.data[4..8].copy_from_slice(&[0, 255, 0, 0]);
        let out = img.shrink(1);
        assert_eq!(out.data, vec![255, 0, 0, 128]);
    }

    #[test]
    fn downscale_handles_uneven_ratios() {
        let img = solid(5, 5, [10, 20, 30, 255]).shrink(2);
        assert_eq!((img.w, img.h), (2, 2));
        assert!(img.data.as_chunks::<4>().0.iter().all(|p| *p == [10, 20, 30, 255]));
    }

    #[test]
    fn flip_reverses_rows_and_crop_checks_bounds() {
        let mut img = Rgba { w: 1, h: 3, data: vec![1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3] };
        let mid = img.crop(0, 1, 1, 1).unwrap();
        assert_eq!(mid.data, [2, 2, 2, 2]);
        assert!(img.crop(0, 2, 1, 2).is_err());
        assert!(img.crop(1, 0, 1, 1).is_err());
        assert!(img.crop(0, 0, 0, 1).is_err());
        assert!(img.crop(u32::MAX, 0, 2, 1).is_err());
        img.flip();
        assert_eq!(img.data, [3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]);
    }

    #[test]
    fn unknown_formats_and_bad_data_are_errors() {
        assert!(matches!(mip0_bytes(4, 8, 8), Err(Error::Unsupported(_))));
        assert!(mip0_bytes(25, 6, 8).is_err());
        assert_eq!(mip0_bytes(25, 8, 8).unwrap(), Some(64));
        assert_eq!(mip0_bytes(29, 8, 8).unwrap(), None);
        assert!(decode(29, 8, 8, &[1, 2, 3]).is_err());
        assert!(decode(25, 8, 8, &[0; 3]).is_err());
    }

    #[test]
    fn png_round_trips() {
        let img = solid(3, 2, [10, 20, 30, 40]);
        let bytes = img.to_png().unwrap();
        let mut reader = png::Decoder::new(std::io::Cursor::new(bytes)).read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut buf).unwrap();
        assert_eq!((info.width, info.height), (3, 2));
        assert_eq!(&buf[..4], &[10, 20, 30, 40]);
    }
}
