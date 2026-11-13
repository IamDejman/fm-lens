//! Players written to a file that a spreadsheet or a script reads: CSV, a row per player, or JSON, an object per player.
//! What a profile holds that is worth comparing, across players and over time: abilities, positions, the attributes on
//! the 1–20 scale the game shows, personality, reputation, caps, and the contract with its clauses, with the in-game
//! date they were read on. Money is in pounds, as the game keeps it. Only reads memory.

use std::io::{self, Write};

use serde::{Deserialize, Serialize, Serializer};

use crate::{
    ATTRIBUTE_GROUPS, Contract, FmDate, International, PERSONALITY, PlayerDetails, PlayerSummary, RELEASE_CLAUSE,
    Reputation, Session, read_player_details,
};

/// How an export writes the players.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    /// Values separated by commas, a row per player.
    Csv,
    /// The same, separated by semicolons: what Excel takes where the comma is the decimal mark (in Turkish, Spanish
    /// or German, say).
    CsvSemicolon,
    /// An object per player, with the position ratings, attributes and personality as objects of their own.
    Json,
}

impl ExportFormat {
    /// The extension of the file's name.
    pub fn extension(self) -> &'static str {
        match self {
            ExportFormat::Csv | ExportFormat::CsvSemicolon => "csv",
            ExportFormat::Json => "json",
        }
    }
}

/// What an export says about where it comes from: at the top of a JSON file. A CSV file has the in-game date on every
/// row, so that exports can be put together and compared.
#[derive(Debug, Clone)]
pub struct ExportHeader {
    /// What wrote it, e.g. "FM Lens 0.4.1".
    pub writer: String,
    /// The game it was read from, e.g. "FM27 Steam build 26340721".
    pub game: String,
    pub game_date: Option<FmDate>,
}

/// What an export wrote.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Exported {
    pub players: usize,
    /// Players whose objects had changed since the lists were read: left out.
    pub skipped: usize,
}

/// The position ratings an export has, in the order of the pitch: each but the sweeper, which the game no longer plays.
const RATINGS: [&str; 14] = ["gk", "dl", "dc", "dr", "wbl", "wbr", "dm", "ml", "mc", "mr", "aml", "amc", "amr", "st"];

impl Session {
    /// Writes `players`, in their order, to `out` as `format`. Each is read again, as his profile is; one whose object
    /// has changed since the lists were read is left out and counted. Only reads memory.
    pub fn export_players(
        &self,
        players: &[&PlayerSummary],
        format: ExportFormat,
        header: &ExportHeader,
        out: &mut impl Write,
    ) -> io::Result<Exported> {
        let mut exported = Exported::default();
        let details =
            players.iter().filter_map(|player| match read_player_details(&self.process, &self.layout, player) {
                Ok(Some(details)) => {
                    exported.players += 1;
                    Some(details)
                }
                _ => {
                    exported.skipped += 1;
                    None
                }
            });
        match format {
            ExportFormat::Csv => write_csv(out, header, details, b',')?,
            ExportFormat::CsvSemicolon => write_csv(out, header, details, b';')?,
            ExportFormat::Json => write_json(out, header, details)?,
        }
        Ok(exported)
    }
}

/// A cell of a CSV row, read from a player's profile.
type Cell = Box<dyn Fn(&PlayerDetails) -> String>;

/// The columns of a CSV export, in order: the name of each, and how it reads a player.
#[derive(Default)]
struct Columns(Vec<(String, Cell)>);

impl Columns {
    fn add(&mut self, name: impl Into<String>, cell: impl Fn(&PlayerDetails) -> String + 'static) {
        self.0.push((name.into(), Box::new(cell)));
    }

    /// A column read from the contract: empty for a player without one.
    fn contract(&mut self, name: &str, cell: fn(&Contract) -> String) {
        self.add(name, move |d| d.contract.as_ref().map(cell).unwrap_or_default());
    }
}

fn csv_columns(game_date: Option<FmDate>) -> Columns {
    let mut columns = Columns::default();
    columns.add("game_date", move |_| game_date.map(iso).unwrap_or_default());
    columns.add("uid", |d| d.summary.uid.to_string());
    columns.add("name", |d| d.summary.name.clone());
    columns.add("full_name", |d| d.summary.full_name.clone().unwrap_or_default());
    columns.add("date_of_birth", |d| d.summary.date_of_birth.map(iso).unwrap_or_default());
    columns.add("age", |d| text(d.summary.age));
    columns.add("nationality", |d| d.summary.nation.clone().unwrap_or_default());
    columns.add("club", |d| d.summary.club.clone().unwrap_or_default());
    columns.add("positions", |d| positions(&d.summary).join(" "));
    columns.add("current_ability", |d| d.summary.current_ability.to_string());
    columns.add("potential_ability", |d| d.summary.potential_ability.to_string());
    columns.add("height_cm", |d| d.height_cm.to_string());
    for key in RATINGS {
        columns.add(format!("rating_{key}"), move |d| text(d.position_ratings.get(key)));
    }
    for key in ATTRIBUTE_GROUPS.iter().flat_map(|(_, keys)| keys.iter().copied()) {
        columns.add(key, move |d| text(d.attributes.get(key).map(|attribute| attribute.value)));
    }
    for key in PERSONALITY {
        columns.add(key, move |d| text(d.personality.get(key)));
    }
    columns.add("reputation_home", |d| d.reputation.home.to_string());
    columns.add("reputation_current", |d| d.reputation.current.to_string());
    columns.add("reputation_world", |d| d.reputation.world.to_string());
    columns.add("international_caps", |d| d.international.caps.to_string());
    columns.add("international_goals", |d| d.international.goals.to_string());
    columns.add("u21_caps", |d| d.international.u21_caps.to_string());
    columns.add("u21_goals", |d| d.international.u21_goals.to_string());
    columns.add("asking_price_gbp", |d| text(d.asking_price));
    columns.contract("wage_per_week_gbp", |c| c.wage.to_string());
    columns.contract("contract_signed", |c| c.signed.map(iso).unwrap_or_default());
    columns.contract("contract_expires", |c| c.expires.map(iso).unwrap_or_default());
    columns.contract("contract_joined", |c| c.joined.map(iso).unwrap_or_default());
    columns.contract("squad_status", |c| {
        squad_status_name(c.squad_status).map_or_else(|| c.squad_status.to_string(), str::to_owned)
    });
    columns.contract("squad_number", |c| text(c.squad_number));
    columns.contract("transfer_listed", |c| c.transfer_listed.to_string());
    columns.contract("loan_listed", |c| c.loan_listed.to_string());
    columns.contract("release_clause_gbp", |c| text(release_clause(c)));
    columns.contract("clauses", clauses_text);
    columns
}

/// Writes the players as CSV: a row of column names, then a row per player, each cell apart by `separator`.
fn write_csv(
    out: &mut impl Write,
    header: &ExportHeader,
    players: impl Iterator<Item = PlayerDetails>,
    separator: u8,
) -> io::Result<()> {
    let columns = csv_columns(header.game_date);
    // The byte order mark tells Excel the file is UTF-8, so that the accents in names come through.
    out.write_all("\u{FEFF}".as_bytes())?;
    write_csv_row(out, columns.0.iter().map(|(name, _)| name.as_str()), separator)?;
    for details in players {
        let cells: Vec<String> = columns.0.iter().map(|(_, cell)| cell(&details)).collect();
        write_csv_row(out, cells.iter().map(String::as_str), separator)?;
    }
    Ok(())
}

/// One line of a CSV file: the cells apart by `separator`, each in quotes where it holds the separator, a quote or a
/// line break, with its quotes doubled. A cell a spreadsheet would run as a formula, such as a name an edited database
/// set to `=HYPERLINK(...)`, starts with `'` so that it stays text; numbers stay as they are.
fn write_csv_row<'a>(out: &mut impl Write, cells: impl Iterator<Item = &'a str>, separator: u8) -> io::Result<()> {
    for (i, cell) in cells.enumerate() {
        if i > 0 {
            out.write_all(&[separator])?;
        }
        let text;
        let cell =
            if cell.starts_with(['=', '+', '-', '@', '\t', '\r']) && !cell.parse::<f64>().is_ok_and(f64::is_finite) {
                text = format!("'{cell}");
                text.as_str()
            } else {
                cell
            };
        if cell.bytes().any(|byte| byte == separator || matches!(byte, b'"' | b'\n' | b'\r')) {
            write!(out, "\"{}\"", cell.replace('"', "\"\""))?;
        } else {
            out.write_all(cell.as_bytes())?;
        }
    }
    out.write_all(b"\r\n")
}

/// Writes the players as JSON: where they come from, then the players, one object to a line.
fn write_json(
    out: &mut impl Write,
    header: &ExportHeader,
    players: impl Iterator<Item = PlayerDetails>,
) -> io::Result<()> {
    writeln!(out, "{{")?;
    writeln!(out, "  \"writer\": {},", serde_json::to_string(&header.writer)?)?;
    writeln!(out, "  \"game\": {},", serde_json::to_string(&header.game)?)?;
    writeln!(out, "  \"gameDate\": {},", serde_json::to_string(&header.game_date.map(iso))?)?;
    writeln!(out, "  \"currency\": \"GBP\",")?;
    writeln!(out, "  \"attributeScale\": \"1-20\",")?;
    write!(out, "  \"players\": [")?;
    for (i, details) in players.enumerate() {
        out.write_all(if i == 0 { b"\n    " } else { b",\n    " })?;
        serde_json::to_writer(&mut *out, &JsonPlayer::from(&details))?;
    }
    writeln!(out, "\n  ]\n}}")
}

/// A player as a JSON export writes him.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonPlayer<'a> {
    uid: u32,
    name: &'a str,
    full_name: Option<&'a str>,
    date_of_birth: Option<String>,
    age: Option<u16>,
    nationality: Option<&'a str>,
    club: Option<&'a str>,
    positions: Vec<String>,
    current_ability: u16,
    potential_ability: i16,
    height_cm: u16,
    position_ratings: InOrder<String, Option<u8>>,
    attributes: InOrder<&'static str, u8>,
    personality: InOrder<&'static str, Option<u8>>,
    reputation: Reputation,
    international: International,
    /// Pounds; none when the club has set none.
    asking_price: Option<i32>,
    contract: Option<JsonContract>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonContract {
    /// Pounds.
    wage_per_week: i32,
    signed: Option<String>,
    expires: Option<String>,
    joined: Option<String>,
    squad_status: u8,
    squad_status_name: Option<&'static str>,
    squad_number: Option<u8>,
    transfer_listed: bool,
    loan_listed: bool,
    clauses: Vec<JsonClause>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonClause {
    /// The game's code for what it is.
    kind: u16,
    name: Option<&'static str>,
    /// Pounds.
    amount: Option<u32>,
    /// Goals, assists, matches, years or a percentage, by kind.
    condition: Option<u16>,
}

impl<'a> From<&'a PlayerDetails> for JsonPlayer<'a> {
    fn from(d: &'a PlayerDetails) -> Self {
        let p = &d.summary;
        let attributes = ATTRIBUTE_GROUPS.iter().flat_map(|(_, keys)| keys.iter().copied());
        Self {
            uid: p.uid,
            name: &p.name,
            full_name: p.full_name.as_deref(),
            date_of_birth: p.date_of_birth.map(iso),
            age: p.age,
            nationality: p.nation.as_deref(),
            club: p.club.as_deref(),
            positions: positions(p),
            current_ability: p.current_ability,
            potential_ability: p.potential_ability,
            height_cm: d.height_cm,
            position_ratings: InOrder(
                RATINGS.iter().map(|&key| (key.to_uppercase(), d.position_ratings.get(key).copied())).collect(),
            ),
            attributes: InOrder(attributes.filter_map(|key| Some((key, d.attributes.get(key)?.value))).collect()),
            personality: InOrder(PERSONALITY.iter().map(|&key| (key, d.personality.get(key).copied())).collect()),
            reputation: d.reputation,
            international: d.international,
            asking_price: d.asking_price,
            contract: d.contract.as_ref().map(|c| JsonContract {
                wage_per_week: c.wage,
                signed: c.signed.map(iso),
                expires: c.expires.map(iso),
                joined: c.joined.map(iso),
                squad_status: c.squad_status,
                squad_status_name: squad_status_name(c.squad_status),
                squad_number: c.squad_number,
                transfer_listed: c.transfer_listed,
                loan_listed: c.loan_listed,
                clauses: c
                    .clauses
                    .iter()
                    .map(|clause| JsonClause {
                        kind: clause.kind,
                        name: clause_name(clause.kind),
                        amount: clause.amount,
                        condition: clause.condition,
                    })
                    .collect(),
            }),
        }
    }
}

/// Keys and values written as one JSON object, in their order.
struct InOrder<K, V>(Vec<(K, V)>);

impl<K: Serialize, V: Serialize> Serialize for InOrder<K, V> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_map(self.0.iter().map(|(key, value)| (key, value)))
    }
}

/// "2027-01-02".
fn iso(date: FmDate) -> String {
    format!("{:04}-{:02}-{:02}", date.year, date.month, date.day)
}

/// A value as text; nothing for none.
fn text<T: ToString>(value: Option<T>) -> String {
    value.map_or_else(String::new, |value| value.to_string())
}

/// The positions he plays (rated 15 or more), best first, as the game abbreviates them: "AMR", "AML".
fn positions(player: &PlayerSummary) -> Vec<String> {
    player.positions.iter().map(|key| key.to_uppercase()).collect()
}

/// The amount of the contract's minimum fee release clause, if it has one.
fn release_clause(contract: &Contract) -> Option<u32> {
    contract.clauses.iter().find(|clause| clause.kind == RELEASE_CLAUSE).and_then(|clause| clause.amount)
}

/// The clauses and bonuses of a contract in words, apart by semicolons: "Minimum fee release clause: 100000000 GBP;
/// Yearly wage rise: 10%".
fn clauses_text(contract: &Contract) -> String {
    let clause = |clause: &crate::Clause| {
        let name = clause_name(clause.kind).unwrap_or("Unknown clause");
        let condition = clause.condition.and_then(|value| condition_text(clause.kind, value));
        match (clause.amount, condition) {
            (Some(amount), Some(condition)) => format!("{name}: {amount} GBP, {condition}"),
            (Some(amount), None) => format!("{name}: {amount} GBP"),
            (None, Some(condition)) => format!("{name}: {condition}"),
            (None, None) => name.to_owned(),
        }
    };
    contract.clauses.iter().map(clause).collect::<Vec<_>>().join("; ")
}

/// The English name of a squad status, by the code a contract holds it as; as the app's English dictionary names it.
fn squad_status_name(code: u8) -> Option<&'static str> {
    Some(match code {
        1 => "Star player",
        2 => "Important player",
        3 => "Regular starter",
        4 => "Squad player",
        5 => "Impact sub",
        7 => "Fringe player",
        9 | 21 => "Emergency backup",
        10 => "Breakthrough prospect",
        11 => "Future prospect",
        13 => "Youngster",
        15 => "First-choice goalkeeper",
        16 => "Cup goalkeeper",
        17 => "Domestic cup goalkeeper",
        20 => "Backup",
        22 => "Surplus to requirements",
        _ => return None,
    })
}

/// The English name of a clause or bonus, by its kind; as the app's English dictionary names it.
fn clause_name(kind: u16) -> Option<&'static str> {
    Some(match kind {
        0 => "Minimum fee release clause",
        1 => "Relegation release clause",
        2 => "Non-promotion release clause",
        3 => "Yearly wage rise",
        4 => "Promotion wage rise",
        5 => "Relegation wage drop",
        6 => "Non-playing job release clause",
        7 => "Release at any time",
        8 => "Sell-on fee percentage",
        9 => "Sell-on fee from profit",
        10 => "Seasonal landmark goal bonus",
        11 => "One-year extension after league games",
        12 => "Match highest earner",
        13 => "Wage after reaching club league games",
        14 => "Top division promotion wage rise",
        15 => "Top division relegation wage drop",
        16 => "Minimum fee release clause (foreign clubs)",
        17 => "Minimum fee release clause (clubs in a higher division)",
        18 => "Minimum fee release clause (domestic clubs)",
        19 => "Wage after reaching international matches",
        20 => "Wages paid by sponsor",
        21 => "Share of gate receipts",
        22 => "Optional contract extension by club",
        23 => "No compensation if offered a manager's job",
        24 => "Compensation needed to leave",
        25 => "One-year extension if promoted",
        26 => "One-year extension if relegation is avoided",
        27 => "Minimum fee release clause (clubs in the Champions Cup)",
        28 => "Guaranteed contract",
        29 => "Automatic extension if promoted",
        30 => "Injury release clause",
        31 => "Minimum fee release clause (clubs in continental competitions)",
        32 => "Appearance fee",
        33 => "Goal bonus",
        34 => "Clean sheet bonus",
        37 => "International cap bonus",
        38 => "Unused substitute fee",
        39 => "Assist bonus",
        40 => "Seasonal landmark assist bonus",
        41 => "Seasonal landmark combined goal and assist bonus",
        55 => "Active relegation release clause",
        _ => return None,
    })
}

/// What a clause depends on, in words, by its kind: goals, assists, matches, years or a percentage; nothing for a
/// release clause, whose condition's meaning is not known.
fn condition_text(kind: u16, value: u16) -> Option<String> {
    Some(match kind {
        0 | 16 | 17 | 18 | 27 | 31 => return None,
        3 | 4 | 5 | 8 | 9 | 14 | 15 | 20 | 21 | 24 => format!("{value}%"),
        10 => format!("{value} goals"),
        40 => format!("{value} assists"),
        41 => format!("{value} goals and assists"),
        11 | 13 => format!("{value} league games"),
        19 => format!("{value} international matches"),
        22 if value == 1 => "1 year".to_owned(),
        22 => format!("{value} years"),
        _ => value.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::{Attribute, Clause, POSITIONS};

    fn saka() -> PlayerDetails {
        let summary = PlayerSummary {
            uid: 28122642,
            name: "Bukayo Saka".to_owned(),
            full_name: Some("Bukayo Ayoyinka Saka".to_owned()),
            date_of_birth: Some(FmDate { year: 2001, month: 9, day: 5 }),
            age: Some(25),
            nation: Some("England".to_owned()),
            nation_uid: Some(765),
            nation_address: 0,
            club: Some("Arsenal".to_owned()),
            club_uid: Some(602),
            positions: vec!["amr", "aml"],
            contract_expires: Some(FmDate { year: 2031, month: 6, day: 30 }),
            current_ability: 181,
            potential_ability: 188,
            position_ratings: [1; 15],
            attributes: Vec::new(),
            base: crate::players::Base::default(),
            transfer_listed: false,
            loan_listed: false,
            height_cm: 178,
            wage: Some(300_000),
            transfer_value: None,
            current_reputation: 7600,
            personality: [10; 8],
            traits: 0,
            address: 0,
            shift: 0,
        };
        let attributes: BTreeMap<String, Attribute> = ATTRIBUTE_GROUPS
            .iter()
            .flat_map(|(_, keys)| keys.iter())
            .map(|&key| (key.to_owned(), Attribute::from_raw(70)))
            .collect();
        PlayerDetails {
            summary,
            height_cm: 178,
            asking_price: None,
            transfer_value: None,
            reputation: Reputation { home: 8000, current: 7600, world: 7400 },
            international: International { caps: 50, goals: 12, u21_caps: 10, u21_goals: 3 },
            position_ratings: POSITIONS.iter().map(|&key| (key, if key == "amr" { 20 } else { 10 })).collect(),
            personality: PERSONALITY.iter().map(|&key| (key, 15)).collect(),
            attributes,
            contract: Some(Contract {
                wage: 195_000,
                signed: Some(FmDate { year: 2025, month: 5, day: 23 }),
                expires: Some(FmDate { year: 2031, month: 6, day: 30 }),
                joined: Some(FmDate { year: 2018, month: 7, day: 1 }),
                squad_status: 1,
                squad_number: Some(7),
                transfer_listed: false,
                loan_listed: false,
                loyalty_bonus: 0,
                happiness: 0,
                playing_time_happiness: 0,
                clauses: vec![
                    Clause { index: 0, kind: 0, amount: Some(150_000_000), condition: None },
                    Clause { index: 1, kind: 3, amount: None, condition: Some(10) },
                ],
                concerns: Vec::new(),
                player_coach: false,
            }),
            condition: 10_000,
            match_sharpness: 10_000,
            jadedness: -500,
            morale: 15,
            traits: Vec::new(),
            injuries: Vec::new(),
            bans: Vec::new(),
            promises: None,
            ties: Vec::new(),
            tie_room: 0,
            preferences: Vec::new(),
            languages: Vec::new(),
            retirement_known: false,
            retires: None,
            clause_room: 0,
            loan: None,
            work_permits: Vec::new(),
            future_transfers: Vec::new(),
        }
    }

    fn header() -> ExportHeader {
        ExportHeader {
            writer: "FM Lens test".to_owned(),
            game: "FM27 Steam build 26340721".to_owned(),
            game_date: Some(FmDate { year: 2027, month: 1, day: 2 }),
        }
    }

    #[test]
    fn csv_has_a_header_and_a_row_of_the_same_length() {
        let mut out = Vec::new();
        write_csv(&mut out, &header(), std::iter::once(saka()), b',').unwrap();
        let text = String::from_utf8(out).unwrap();
        let text = text.strip_prefix('\u{FEFF}').expect("a byte order mark");
        let lines: Vec<&str> = text.split("\r\n").filter(|line| !line.is_empty()).collect();
        assert_eq!(lines.len(), 2);
        let header: Vec<&str> = lines[0].split(',').collect();
        assert_eq!(&header[..4], ["game_date", "uid", "name", "full_name"]);
        assert!(header.contains(&"finishing") && header.contains(&"rating_amr") && header.contains(&"ambition"));
        assert!(!header.contains(&"rating_sw"));
        // The clauses hold no comma, so the row splits like the header.
        let row: Vec<&str> = lines[1].split(',').collect();
        assert_eq!(row.len(), header.len());
        let cell = |name: &str| row[header.iter().position(|&column| column == name).unwrap()];
        assert_eq!(cell("game_date"), "2027-01-02");
        assert_eq!(cell("positions"), "AMR AML");
        assert_eq!(cell("rating_amr"), "20");
        assert_eq!(cell("finishing"), "14");
        assert_eq!(cell("squad_status"), "Star player");
        assert_eq!(cell("release_clause_gbp"), "150000000");
        assert_eq!(cell("asking_price_gbp"), "");
        assert_eq!(cell("clauses"), "Minimum fee release clause: 150000000 GBP; Yearly wage rise: 10%");
    }

    #[test]
    fn squad_statuses_carry_fm_names() {
        // As FM's contract screen named them for Zaïre-Emery, Nwaneri, Quintero, Kepa and Gyökeres.
        assert_eq!(squad_status_name(4), Some("Squad player"));
        assert_eq!(squad_status_name(10), Some("Breakthrough prospect"));
        assert_eq!(squad_status_name(11), Some("Future prospect"));
        assert_eq!(squad_status_name(17), Some("Domestic cup goalkeeper"));
        assert_eq!(squad_status_name(22), Some("Surplus to requirements"));
        assert_eq!(squad_status_name(14), None);
    }

    #[test]
    fn csv_quotes_what_holds_the_separator() {
        let mut out = Vec::new();
        write_csv_row(&mut out, ["plain", "a;b", "say \"hi\"", "a,b"].into_iter(), b';').unwrap();
        assert_eq!(String::from_utf8(out).unwrap(), "plain;\"a;b\";\"say \"\"hi\"\"\";a,b\r\n");
    }

    #[test]
    fn csv_keeps_formulas_as_text() {
        let mut out = Vec::new();
        let cells = ["=HYPERLINK(\"x\")", "+1+1", "@SUM(A1)", "-2+3", "\tx", "-12", "+3.5"];
        write_csv_row(&mut out, cells.into_iter(), b';').unwrap();
        assert_eq!(
            String::from_utf8(out).unwrap(),
            "\"'=HYPERLINK(\"\"x\"\")\";'+1+1;'@SUM(A1);'-2+3;'\tx;-12;+3.5\r\n"
        );
    }

    #[test]
    fn json_reads_back_in_order() {
        let mut out = Vec::new();
        write_json(&mut out, &header(), [saka(), saka()].into_iter()).unwrap();
        let text = String::from_utf8(out).unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["gameDate"], "2027-01-02");
        assert_eq!(value["players"].as_array().unwrap().len(), 2);
        let player = &value["players"][0];
        assert_eq!(player["positions"], serde_json::json!(["AMR", "AML"]));
        assert_eq!(player["attributes"]["finishing"], 14);
        assert_eq!(player["positionRatings"]["AMR"], 20);
        assert_eq!(player["contract"]["squadStatusName"], "Star player");
        assert_eq!(player["contract"]["clauses"][0]["amount"], 150_000_000);
        // The object keeps the order it was written in: the UID first, the attributes in the game's groups.
        let line = text.lines().find(|line| line.contains("28122642")).unwrap();
        assert!(line.trim_start().starts_with("{\"uid\":28122642,\"name\":\"Bukayo Saka\""));
        assert!(line.find("\"corners\"").unwrap() < line.find("\"finishing\"").unwrap());
    }
}
