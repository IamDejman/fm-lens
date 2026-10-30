use serde::Serialize;

/// A calendar date decoded from FM's `[u16 day_of_year][u16 year]` pair.
/// Field order makes the derived ordering chronological.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct FmDate {
    pub year: u16,
    pub month: u8,
    pub day: u8,
}

const MONTH_LENGTHS: [u16; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

impl FmDate {
    /// Decodes FM's day-of-year (1-based) and year. FM27 keeps flags above bit 8 of the
    /// day field, so only its low 9 bits are the day. Returns `None` for unset dates,
    /// which FM stores as zero or as days in 1900 (e.g. rolling contracts end "1900-01-02").
    pub fn from_raw(day_field: u16, year: u16) -> Option<Self> {
        let mut day = day_field & 0x1FF;
        if year <= 1900 || day == 0 {
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

    /// Completed years from `self` (a birth date) to `today`; `None` if `today` is earlier.
    pub fn age_on(self, today: FmDate) -> Option<u16> {
        if today < self {
            return None;
        }
        let birthday_passed = (today.month, today.day) >= (self.month, self.day);
        Some(today.year - self.year - u16::from(!birthday_passed))
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
    fn age_counts_completed_years() {
        let today = FmDate { year: 2026, month: 7, day: 18 };
        assert_eq!(FmDate { year: 1987, month: 6, day: 24 }.age_on(today), Some(39)); // Messi
        assert_eq!(FmDate { year: 2000, month: 7, day: 21 }.age_on(today), Some(25)); // Haaland, birthday not yet
        assert_eq!(FmDate { year: 2000, month: 7, day: 18 }.age_on(today), Some(26)); // birthday today
        assert_eq!(FmDate { year: 2027, month: 1, day: 1 }.age_on(today), None);
    }

    #[test]
    fn ignores_flag_bits_and_rejects_unset() {
        assert_eq!(FmDate::from_raw(0x200 | 175, 1987), date(1987, 6, 24));
        assert_eq!(FmDate::from_raw(0x80c7, 2026), date(2026, 7, 18)); // the game date as stored
        assert_eq!(FmDate::from_raw(0, 1987), None);
        assert_eq!(FmDate::from_raw(175, 0), None);
        assert_eq!(FmDate::from_raw(2, 1900), None);
        assert_eq!(FmDate::from_raw(366, 2001), None);
    }
}
