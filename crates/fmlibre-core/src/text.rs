use fmlibre_mem::Process;
use unicode_normalization::UnicodeNormalization;

/// Longest FM string accepted; anything longer is treated as a bad pointer.
const MAX_STRING_LEN: usize = 1024;

/// Reads an FM string: a `u32` byte length followed by UTF-8 text.
/// Returns `None` for null pointers and for bytes that are not a valid string.
pub fn read_fm_string(process: &Process, ptr: u64) -> Option<String> {
    if ptr == 0 {
        return None;
    }
    // Names are short, so one read usually covers both the length and the text.
    let mut head = [0u8; 64];
    let have_head = process.read_into(ptr, &mut head).is_ok();
    if !have_head {
        process.read_into(ptr, &mut head[..4]).ok()?;
    }
    let len = u32::from_le_bytes([head[0], head[1], head[2], head[3]]) as usize;
    if len == 0 || len > MAX_STRING_LEN {
        return None;
    }
    let bytes = if have_head && 4 + len <= head.len() {
        head[4..4 + len].to_vec()
    } else {
        process.read_bytes(ptr + 4, len).ok()?
    };
    String::from_utf8(bytes).ok()
}

/// Reads a name-table entry, whose first field points at an FM string.
pub fn read_name_entry(process: &Process, entry: u64) -> Option<String> {
    if entry == 0 {
        return None;
    }
    read_fm_string(process, process.read_u64(entry).ok()?)
}

/// Whether `text` looks like a human-readable name rather than bytes that happen to decode.
pub fn is_name_like(text: &str) -> bool {
    text.chars().any(char::is_alphabetic) && !text.chars().any(char::is_control)
}

/// Lower-cases `text` and strips accents, so "gokhan" matches "Gökhan" and "odegaard" matches "Ødegaard".
pub fn fold(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.nfd() {
        match c {
            '\u{300}'..='\u{36f}' => {} // combining marks split off by the decomposition
            'ı' => out.push('i'),
            'ø' | 'Ø' => out.push('o'),
            'đ' | 'Đ' => out.push('d'),
            'ł' | 'Ł' => out.push('l'),
            'ß' => out.push_str("ss"),
            'æ' | 'Æ' => out.push_str("ae"),
            'œ' | 'Œ' => out.push_str("oe"),
            'þ' | 'Þ' => out.push_str("th"),
            c => out.extend(c.to_lowercase()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fold_strips_accents_and_case() {
        assert_eq!(fold("Gökhan"), "gokhan");
        assert_eq!(fold("Çağlar Söyüncü"), "caglar soyuncu");
        assert_eq!(fold("Kılıç"), "kilic");
        assert_eq!(fold("İlkay Gündoğan"), "ilkay gundogan");
        assert_eq!(fold("Martin Ødegaard"), "martin odegaard");
        assert_eq!(fold("Łukasz Fabiański"), "lukasz fabianski");
        assert_eq!(fold("Lionel Andrés Messi"), "lionel andres messi");
    }

    #[test]
    fn name_like() {
        assert!(is_name_like("Lionel Messi"));
        assert!(is_name_like("Vinícius"));
        assert!(!is_name_like("\0\0\0"));
        assert!(!is_name_like("123"));
    }
}
