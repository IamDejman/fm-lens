use serde::Serialize;

/// A calendar date decoded from FM's `[u16 day_of_year][u16 year]` pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct FmDate {
    pub year: u16,
    pub month: u8,
    pub day: u8,
}

const MONTH_LENGTHS: [u16; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

impl FmDate {
    /// Decodes FM's day-of-year (1-based) and year. FM27 keeps flags above bit 8 of the
    /// day field, so only its low 9 bits are the day. Returns `None` for unset dates.
    pub fn from_raw(day_field: u16, year: u16) -> Option<Self> {
        let mut day = day_field & 0x1FF;
        if year == 0 || day == 0 {
            return None;
        }
        for (month, &length) in MONTH_LENGTHS.iter().enumerate() {
            let length = if month == 1 && is_leap(year) { 29 } else { length };
            if day <= length {
                return Some(Self { year, month: month as u8 + 1, day: day as u8 });
            }
            day -= length;
        }
        None
    }
}

fn is_leap(year: u16) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(year: u16, month: u8, day: u8) -> Option<FmDate> {
        Some(FmDate { year, month, day })
    }

    #[test]
    fn decodes_day_of_year() {
        assert_eq!(FmDate::from_raw(175, 1987), date(1987, 6, 24)); // Messi
        assert_eq!(FmDate::from_raw(203, 2000), date(2000, 7, 21)); // Haaland, leap year
        assert_eq!(FmDate::from_raw(1, 2001), date(2001, 1, 1));
        assert_eq!(FmDate::from_raw(60, 2000), date(2000, 2, 29));
        assert_eq!(FmDate::from_raw(60, 2001), date(2001, 3, 1));
        assert_eq!(FmDate::from_raw(366, 2000), date(2000, 12, 31));
    }

    #[test]
    fn ignores_flag_bits_and_rejects_unset() {
        assert_eq!(FmDate::from_raw(0x200 | 175, 1987), date(1987, 6, 24));
        assert_eq!(FmDate::from_raw(0, 1987), None);
        assert_eq!(FmDate::from_raw(175, 0), None);
        assert_eq!(FmDate::from_raw(366, 2001), None);
    }
}
