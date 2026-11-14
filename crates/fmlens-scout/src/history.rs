//! How players developed in the user's careers, as FM Lens saw them: for each career, once a month of game time, every
//! player's age, current and potential ability. Kept on the user's computer only (the app keeps one file per career),
//! so a player's profile can show how the same real player turned out in the user's other careers.
//!
//! The same real player keeps his ID from one career to the next. Players FM makes up during a career (regens) can
//! get an ID that another career used for someone else, so a player is matched by ID and by `identity`: a hash of his
//! name and birth date, which the app works out.

use serde::{Deserialize, Serialize};

/// The version of the format below; a file of another version is left alone.
pub const VERSION: u32 = 1;

/// One career's record.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CareerHistory {
    pub version: u32,
    /// Who the user manages in it, and where: how the career is named.
    pub manager: String,
    pub club: Option<String>,
    /// One snapshot per in-game year, oldest first.
    pub seasons: Vec<Season>,
}

/// Every player at one date of a career.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Season {
    /// The in-game date the snapshot was taken on: year, month, day.
    pub date: [u16; 3],
    /// Ordered by UID.
    pub players: Vec<Seen>,
}

/// One player in a snapshot: his UID, identity, age, current and potential ability.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Seen(pub u32, pub u32, pub u8, pub u8, pub i16);

impl Seen {
    pub fn uid(&self) -> u32 {
        self.0
    }
}

/// Where a player stood in one snapshot of another career.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub year: u16,
    pub age: u8,
    pub current_ability: u8,
    pub potential_ability: i16,
}

impl CareerHistory {
    pub fn new(manager: String, club: Option<String>) -> Self {
        Self { version: VERSION, manager, club, seasons: Vec::new() }
    }

    /// Records `players` as they are on `date` (year, month, day): a new snapshot for a new year, or in place of this
    /// year's when it was taken in another month. Returns whether anything changed, so the file needs writing.
    pub fn record(&mut self, date: [u16; 3], mut players: Vec<Seen>) -> bool {
        players.sort_unstable_by_key(Seen::uid);
        players.dedup_by_key(|seen| seen.uid());
        match self.seasons.iter_mut().find(|season| season.date[0] == date[0]) {
            Some(season) if season.date[1] == date[1] => false,
            Some(season) => {
                *season = Season { date, players };
                true
            }
            None => {
                self.seasons.push(Season { date, players });
                self.seasons.sort_by_key(|season| season.date);
                true
            }
        }
    }

    /// The player with `uid` and `identity` in each snapshot that has him, oldest first.
    pub fn find(&self, uid: u32, identity: u32) -> Vec<Point> {
        self.seasons
            .iter()
            .filter_map(|season| {
                let at = season.players.binary_search_by_key(&uid, Seen::uid).ok()?;
                let seen = season.players[at];
                (seen.1 == identity).then_some(Point {
                    year: season.date[0],
                    age: seen.2,
                    current_ability: seen.3,
                    potential_ability: seen.4,
                })
            })
            .collect()
    }
}

/// A 32-bit FNV-1a hash of `text`: how the app turns a player's name and birth date into his identity, and a career's
/// key into a file name.
pub fn fnv1a(text: &str) -> u32 {
    text.bytes().fold(0x811c_9dc5, |hash, byte| (hash ^ u32::from(byte)).wrapping_mul(0x0100_0193))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_snapshot_a_year_kept_monthly() {
        let mut career = CareerHistory::new("Ada".to_owned(), Some("Northbridge".to_owned()));
        assert!(career.record([2027, 8, 1], vec![Seen(7, 1, 18, 100, 160), Seen(3, 2, 30, 140, 140)]));
        assert!(!career.record([2027, 8, 20], vec![Seen(7, 1, 18, 101, 160)]), "same month");
        assert!(career.record([2027, 9, 1], vec![Seen(7, 1, 18, 103, 160)]), "a new month replaces the year's");
        assert!(career.record([2026, 12, 1], vec![Seen(7, 1, 17, 90, 160)]));
        assert_eq!(career.seasons.len(), 2);
        assert_eq!(career.seasons[0].date, [2026, 12, 1], "oldest first");
        let found = career.find(7, 1);
        assert_eq!(found.iter().map(|p| (p.year, p.current_ability)).collect::<Vec<_>>(), [(2026, 90), (2027, 103)]);
        assert!(career.find(7, 9).is_empty(), "someone else with his ID");
        assert!(career.find(3, 2).is_empty(), "the snapshot that had him was replaced");
    }

    #[test]
    fn the_file_format_round_trips() {
        let mut career = CareerHistory::new("Ada".to_owned(), None);
        career.record([2027, 8, 1], vec![Seen(7, 1, 18, 100, -9)]);
        let json = serde_json::to_string(&career).expect("json");
        assert!(json.contains("[7,1,18,100,-9]"), "{json}");
        assert_eq!(serde_json::from_str::<CareerHistory>(&json).expect("read back"), career);
        assert_eq!(fnv1a(""), 0x811c_9dc5);
        assert_ne!(fnv1a("Saka 2001-09-05"), fnv1a("Saka 2001-09-06"));
    }
}
