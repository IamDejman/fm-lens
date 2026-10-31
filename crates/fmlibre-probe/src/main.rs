//! `fmlibre-probe`: a look inside a running Football Manager process.
//!
//! Use it to check that FMLibreEditor can attach to a given build (Steam, Epic, Game
//! Pass) and to map where the game keeps its data. Only `set` writes to the game, one
//! field at a time, through the same checks as the app.

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Instant;

use anyhow::{Context, Result, anyhow, bail, ensure};
use clap::{Parser, Subcommand, ValueEnum};
use fmlibre_core::{
    ATTRIBUTE_GROUPS, ArrayCandidate, ArraySource, ClubIndex, Entity, Field, FmDate, GAME_EXE, GAME_PLUGIN, GameInfo,
    GraphicsIndex, Kind, MoveTerms, PERSONALITY, POSITIONS, Picture, PlayerFilter, PlayerIndex, PlayerOrder,
    PlayerSort, STAFF_ATTRIBUTE_GROUPS, SUPPORTER_MIX, SUPPORTER_TRAITS, Scale, ScanOptions, Session, SessionError,
    StaffIndex, Target, find_game, job_name, scan_object_arrays, sort_players,
};
use fmlibre_mem::{Module, PeImage, Process, is_current_process_elevated, is_user_pointer, list_modules, regions};
use serde::Serialize;

const KEY_MODULES: [&str; 4] = [GAME_EXE, "UnityPlayer.dll", "GameAssembly.dll", GAME_PLUGIN];

#[derive(Parser)]
#[command(
    name = "fmlibre-probe",
    version,
    about = "Probe for a running Football Manager 27 process. Only `set` writes to the game.",
    after_help = "Addresses and lengths are hexadecimal; ADDR is 0x... or module.dll+0x...; INDEX is decimal."
)]
struct Cli {
    /// Process id to use when several fm.exe instances are running.
    #[arg(long, global = true)]
    pid: Option<u32>,

    /// Also write the report (info and scan) as JSON to this file.
    #[arg(long, global = true, value_name = "FILE")]
    json: Option<PathBuf>,

    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Show the process, storefront, modules and the layout of game_plugin.dll (default).
    Info,
    /// Identify the build and locate the player, staff and club arrays.
    Calibrate {
        /// Ignore the build profile and find the arrays by scanning, as for an unknown build.
        #[arg(long)]
        scan: bool,
    },
    /// Show everything FMLibreEditor reads for the player with this UID.
    Player {
        /// The player's unique ID.
        uid: u32,
    },
    /// List staff (managers, coaches, scouts...), the human manager first, then best first.
    Staff {
        /// Words to look for in names (accents and case are ignored), or a staff id.
        text: Option<String>,
        /// How many to print.
        #[arg(long, default_value_t = 25)]
        limit: usize,
    },
    /// List clubs, highest reputation first, optionally only those matching TEXT.
    Clubs {
        /// Words to look for in club names (accents and case are ignored), or a UID.
        text: Option<String>,
        /// How many to print.
        #[arg(long, default_value_t = 25)]
        limit: usize,
    },
    /// Show everything FMLibreEditor reads for the club with this UID.
    Club {
        /// The club's unique ID.
        uid: u32,
    },
    /// Show everything FMLibreEditor reads for the member of staff with this id.
    StaffMember {
        /// The staff id.
        uid: u32,
    },
    /// List players, best first, optionally only those matching TEXT.
    Players {
        /// Words to look for in player names (accents and case are ignored), or a UID.
        text: Option<String>,
        /// How many players to print.
        #[arg(long, default_value_t = 25)]
        limit: usize,
        #[command(flatten)]
        filter: PlayerFilterArgs,
    },
    /// List the fields the editor can change, or with --stats check them against every object.
    Fields {
        #[arg(value_enum)]
        entity: EntityArg,
        /// Read every player, member of staff or club and show the values each field holds.
        #[arg(long)]
        stats: bool,
    },
    /// Show the editable fields of one player, member of staff or club.
    Get {
        #[arg(value_enum)]
        entity: EntityArg,
        /// UID of the player or club, or staff id.
        uid: u32,
        /// Field keys, from `fields`; all fields when none are given.
        fields: Vec<String>,
    },
    /// Change one field of a player, member of staff or club in the running game.
    Set {
        #[arg(value_enum)]
        entity: EntityArg,
        /// UID of the player or club, or staff id.
        uid: u32,
        /// The field's key, from `fields`.
        field: String,
        /// The new value as stored (attributes 0-100), as shown with --shown (1-20), or a
        /// date as YYYY-MM-DD.
        #[arg(allow_negative_numbers = true)]
        value: String,
        /// VALUE is as the game shows it.
        #[arg(long)]
        shown: bool,
        /// Write the old value back afterwards and check it: tests a field without changing the save.
        #[arg(long)]
        restore: bool,
    },
    /// Move a player to another club's senior team in the running game.
    Move {
        /// The player's UID.
        uid: u32,
        /// The UID of the club he joins.
        club: u32,
        /// A new wage in pounds per week; the contract's otherwise.
        #[arg(long)]
        wage: Option<i64>,
        /// A new contract end as YYYY-MM-DD; the contract's otherwise.
        #[arg(long)]
        expires: Option<String>,
        /// Move him back afterwards and check it: tests a move without changing the save.
        #[arg(long)]
        restore: bool,
        /// With --restore, how many seconds to wait before moving him back, to look at the game meanwhile.
        #[arg(long, default_value_t = 0)]
        hold: u64,
    },
    /// Read the graphics packs (logos, faces, flags) and show what they hold. Needs no game.
    Graphics {
        /// The graphics folder; by default Documents\Sports Interactive\Football Manager 27\graphics.
        #[arg(long)]
        root: Option<PathBuf>,
        /// Club UIDs to look up.
        clubs: Vec<u32>,
    },
    /// Find (begin, end) arrays of game objects in game_plugin.dll and count their vtables.
    Scan {
        /// Smallest array to report.
        #[arg(long, default_value_t = 500)]
        min: u64,
        /// Largest array to report.
        #[arg(long, default_value_t = 2_000_000)]
        max: u64,
        /// How many arrays to print.
        #[arg(long, default_value_t = 25)]
        top: usize,
    },
    /// Hex-dump memory at ADDR.
    Dump {
        /// Address to dump, e.g. 0x1d2f0a40 or game_plugin.dll+0x1000.
        addr: String,
        /// Number of bytes to dump.
        #[arg(long, default_value = "0x200")]
        len: String,
    },
    /// Follow the (begin, end) pair stored at PAIR and dump element INDEX of that array.
    Element {
        /// Address of the (begin, end) pair, e.g. game_plugin.dll+0x57037d0.
        pair: String,
        /// Element index (decimal).
        index: u64,
        /// Number of bytes of the element to dump.
        #[arg(long, default_value = "0x400")]
        len: String,
    },
    /// Print the field at OFFSET of each element of the array at PAIR, e.g. a UID.
    Column {
        /// Address of the (begin, end) pair, e.g. game_plugin.dll+0x57037d0.
        pair: String,
        /// Field offset inside each element, e.g. 0x294.
        offset: String,
        /// Field type.
        #[arg(long = "type", value_enum, default_value_t = FieldType::U32)]
        kind: FieldType,
        /// How many elements to print, from the start of the array.
        #[arg(long, default_value_t = 20)]
        first: u64,
        /// Search the whole array for elements whose field equals this decimal value.
        #[arg(long)]
        find: Option<u64>,
    },
    /// Search the game's memory for text (as UTF-8 and UTF-16), bytes or a number.
    Find {
        /// What to look for: text by default; hex bytes or a number with --as.
        pattern: String,
        /// How to read PATTERN.
        #[arg(long = "as", value_enum, default_value_t = PatternKind::Text)]
        kind: PatternKind,
        /// Only search this module, e.g. game_plugin.dll.
        #[arg(long)]
        module: Option<String>,
        /// Stop after this many hits.
        #[arg(long, default_value_t = 20)]
        max: usize,
    },
    /// Find the pointers to ADDR in the game's memory, e.g. everything that refers to a player.
    Refs {
        /// The address pointed at; `player` and `club` print object addresses.
        addr: String,
        /// Also count pointers into the SPAN bytes from ADDR on, e.g. into a person block.
        #[arg(long, default_value = "1")]
        span: String,
        /// Stop after this many hits.
        #[arg(long, default_value_t = 100)]
        max: usize,
    },
    /// Find the (begin, end) arrays in the game's memory that hold the 8-byte slot at ADDR,
    /// e.g. a hit from `refs`, and the object each array belongs to.
    Holders {
        /// The address of an array slot.
        addr: String,
        /// Stop after this many hits.
        #[arg(long, default_value_t = 20)]
        max: usize,
    },
    /// Read every team's player list and show how the game's allocator spaces their buffers.
    Squads,
    /// Count the values one field holds across all players, with their average age and a few names: what
    /// codes a field uses, or which offset holds a value the game shows.
    Histogram {
        /// Offset in the player object (before any person-block shift), or with --contract in his contract.
        offset: String,
        #[arg(long = "type", value_enum, default_value_t = FieldType::U8)]
        kind: FieldType,
        /// Read the field from the player's contract.
        #[arg(long)]
        contract: bool,
        /// Only players of clubs whose name contains this text.
        #[arg(long)]
        club: Option<String>,
        /// Show at most this many values, the most frequent first.
        #[arg(long, default_value_t = 30)]
        top: usize,
    },
    /// Show the memory region that holds ADDR and the start of its allocation.
    Region {
        /// Any address in the game process.
        addr: String,
    },
    /// Show the (begin, end) arrays inside the object at ADDR and name the players, staff
    /// and clubs they hold.
    Lists {
        /// The object's address, e.g. a club or a team.
        addr: String,
        /// How many bytes of the object to look through.
        #[arg(long, default_value = "0x800")]
        len: String,
    },
}

#[derive(Clone, Copy, ValueEnum)]
enum EntityArg {
    Player,
    Staff,
    Club,
}

impl From<EntityArg> for Entity {
    fn from(arg: EntityArg) -> Self {
        match arg {
            EntityArg::Player => Entity::Player,
            EntityArg::Staff => Entity::Staff,
            EntityArg::Club => Entity::Club,
        }
    }
}

#[derive(Clone, Copy, ValueEnum)]
enum PatternKind {
    /// Text, matched as UTF-8 and as UTF-16LE.
    Text,
    /// Bytes such as "c7 80 ea 07".
    Hex,
    /// A little-endian u16, decimal or 0x-prefixed hex.
    U16,
    /// A little-endian u32, decimal or 0x-prefixed hex.
    U32,
}

#[derive(Clone, Copy, ValueEnum)]
enum FieldType {
    U8,
    U16,
    U32,
    U64,
}

impl FieldType {
    fn width(self) -> usize {
        match self {
            FieldType::U8 => 1,
            FieldType::U16 => 2,
            FieldType::U32 => 4,
            FieldType::U64 => 8,
        }
    }

    fn decode(self, bytes: &[u8]) -> u64 {
        let mut buf = [0u8; 8];
        buf[..bytes.len()].copy_from_slice(bytes);
        u64::from_le_bytes(buf)
    }
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("error: {err:#}");
            ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli) -> Result<()> {
    if let Some(Command::Graphics { root, clubs }) = cli.command {
        return graphics(root, &clubs);
    }
    let elevated = is_current_process_elevated();
    let writes = matches!(cli.command, Some(Command::Set { .. } | Command::Move { .. }));
    let process = attach(cli.pid, elevated, writes)?;
    let json = cli.json.as_deref();

    match cli.command.unwrap_or(Command::Info) {
        Command::Info => {
            let (game, modules) = inspect(&process)?;
            info(&process, &game, &modules, elevated, json)
        }
        Command::Calibrate { scan } => {
            let source = if scan { ArraySource::ScanOnly } else { ArraySource::ProfileFirst };
            calibrate(&Session::connect(process, source)?)
        }
        Command::Player { uid } => player(&Session::connect(process, ArraySource::ProfileFirst)?, uid),
        Command::Staff { text, limit } => {
            staff(&Session::connect(process, ArraySource::ProfileFirst)?, text.as_deref(), limit)
        }
        Command::StaffMember { uid } => staff_member(&Session::connect(process, ArraySource::ProfileFirst)?, uid),
        Command::Clubs { text, limit } => {
            clubs(&Session::connect(process, ArraySource::ProfileFirst)?, text.as_deref(), limit)
        }
        Command::Club { uid } => club(&Session::connect(process, ArraySource::ProfileFirst)?, uid),
        Command::Players { text, limit, filter } => {
            players(&Session::connect(process, ArraySource::ProfileFirst)?, text.as_deref(), limit, &filter)
        }
        Command::Fields { entity, stats } => {
            fields(&Session::connect(process, ArraySource::ProfileFirst)?, entity.into(), stats)
        }
        Command::Get { entity, uid, fields } => {
            get(&Session::connect(process, ArraySource::ProfileFirst)?, entity.into(), uid, &fields)
        }
        Command::Set { entity, uid, field, value, shown, restore } => {
            let session = Session::connect(process, ArraySource::ProfileFirst)?;
            set(&session, entity.into(), uid, &field, &value, shown, restore)
        }
        Command::Move { uid, club, wage, expires, restore, hold } => {
            let expires = expires.as_deref().map(parse_iso_date).transpose()?.map(FmDate::to_number);
            let terms = MoveTerms { wage, expires };
            move_player(&Session::connect(process, ArraySource::ProfileFirst)?, uid, club, terms, restore, hold)
        }
        Command::Graphics { .. } => unreachable!("handled before attaching"),
        Command::Scan { min, max, top } => {
            let (game, modules) = inspect(&process)?;
            let opts = ScanOptions { min_count: min, max_count: max, ..ScanOptions::default() };
            scan(&process, &game, &modules, &opts, top, json)
        }
        Command::Dump { addr, len } => {
            let modules = list_modules(process.pid()).context("listing modules")?;
            dump(&process, &modules, resolve(&addr, &modules)?, parse_hex(&len)?)
        }
        Command::Element { pair, index, len } => {
            let modules = list_modules(process.pid()).context("listing modules")?;
            element(&process, &modules, resolve(&pair, &modules)?, index, parse_hex(&len)?)
        }
        Command::Column { pair, offset, kind, first, find } => {
            let modules = list_modules(process.pid()).context("listing modules")?;
            column(&process, &modules, resolve(&pair, &modules)?, parse_hex(&offset)?, kind, first, find)
        }
        Command::Find { pattern, kind, module, max } => {
            let modules = list_modules(process.pid()).context("listing modules")?;
            find(&process, &modules, &pattern, kind, module.as_deref(), max)
        }
        Command::Refs { addr, span, max } => {
            let modules = list_modules(process.pid()).context("listing modules")?;
            refs(&process, &modules, resolve(&addr, &modules)?, parse_hex(&span)?, max)
        }
        Command::Squads => squads(&Session::connect(process, ArraySource::ProfileFirst)?),
        Command::Histogram { offset, kind, contract, club, top } => {
            let session = Session::connect(process, ArraySource::ProfileFirst)?;
            histogram(&session, parse_hex(&offset)?, kind, contract, club.as_deref(), top)
        }
        Command::Region { addr } => {
            let modules = list_modules(process.pid()).context("listing modules")?;
            let addr = resolve(&addr, &modules)?;
            let r = fmlibre_mem::region_at(&process, addr).with_context(|| format!("{addr:#x} is not mapped"))?;
            println!(
                "{addr:#x} is in {:#x}..{:#x} ({:#x} bytes), allocated at {:#x}; {} {}{}",
                r.base,
                r.end(),
                r.size,
                r.allocation_base,
                r.protection(),
                if r.is_image() {
                    "image"
                } else if r.is_private() {
                    "private"
                } else {
                    "mapped"
                },
                if r.is_committed() { "" } else { ", not committed" }
            );
            dump(&process, &modules, r.allocation_base, 0x40)
        }
        Command::Holders { addr, max } => {
            let modules = list_modules(process.pid()).context("listing modules")?;
            holders(&process, &modules, resolve(&addr, &modules)?, max)
        }
        Command::Lists { addr, len } => {
            let modules = list_modules(process.pid()).context("listing modules")?;
            let session = Session::connect(process, ArraySource::ProfileFirst)?;
            lists(&session, &modules, resolve(&addr, &modules)?, parse_hex(&len)?)
        }
    }
}

// ---------------------------------------------------------------------------
// refs and lists

/// Prints every 8-byte-aligned value in readable memory that points into `addr..addr + span`.
fn refs(process: &Process, modules: &[Module], addr: u64, span: u64, max: usize) -> Result<()> {
    ensure!(span > 0, "the span is empty");
    const CHUNK: u64 = 8 << 20;
    let started = Instant::now();
    let (mut scanned, mut hits) = (0u64, 0usize);

    'regions: for region in regions(process, 0x1_0000, 0x7FFF_FFFF_0000).into_iter().filter(|r| r.is_readable()) {
        let mut offset = 0;
        while offset < region.size {
            let base = region.base + offset;
            let len = (region.size - offset).min(CHUNK);
            if let Ok(chunk) = process.read_bytes(base, len as usize) {
                for (i, word) in chunk.as_chunks::<8>().0.iter().enumerate() {
                    let value = u64::from_le_bytes(*word);
                    if value.wrapping_sub(addr) >= span {
                        continue;
                    }
                    let at = base + (i * 8) as u64;
                    let into = if value == addr { String::new() } else { format!("+{:#x}", value - addr) };
                    println!("{at:#014x}  {:<34} {into:<7} {}", describe_address(at, modules), neighbours(process, at));
                    hits += 1;
                    if hits >= max {
                        break 'regions;
                    }
                }
            }
            scanned += len;
            offset += CHUNK;
        }
    }
    println!(
        "{hits} hit(s){}; scanned {:.0} MiB in {:.1} s.",
        if hits >= max { " (stopped at --max)" } else { "" },
        scanned as f64 / 1_048_576.0,
        started.elapsed().as_secs_f64()
    );
    Ok(())
}

/// Prints every (begin, end) pair in readable memory whose array holds the slot at `addr`,
/// with the nearest vtable before the pair: the class of the object that owns the array.
fn holders(process: &Process, modules: &[Module], addr: u64, max: usize) -> Result<()> {
    const CHUNK: u64 = 8 << 20;
    // Longer arrays are the game-wide ones, and random words make false pairs that long.
    const LONGEST: u64 = 8 * 20_000;
    let started = Instant::now();
    let mut hits = 0usize;

    'regions: for region in regions(process, 0x1_0000, 0x7FFF_FFFF_0000).into_iter().filter(|r| r.is_readable()) {
        let mut offset = 0;
        while offset < region.size {
            let base = region.base + offset;
            // One extra word, so that a pair split by the chunk boundary is still seen.
            let len = (region.size - offset).min(CHUNK + 8);
            if let Ok(chunk) = process.read_bytes(base, len as usize) {
                let words: Vec<u64> = chunk.as_chunks::<8>().0.iter().map(|w| u64::from_le_bytes(*w)).collect();
                for (i, pair) in words.windows(2).enumerate() {
                    let (begin, end) = (pair[0], pair[1]);
                    if begin > addr
                        || addr >= end
                        || end - begin > LONGEST
                        || !begin.is_multiple_of(8)
                        || !(addr - begin).is_multiple_of(8)
                    {
                        continue;
                    }
                    let at = base + (i * 8) as u64;
                    let owner = (1..=0x80u64)
                        .map(|back| at - back * 8)
                        .find_map(|slot| {
                            let value = process.read_u64(slot).ok()?;
                            let module = modules.iter().find(|m| m.contains(value) && m.name == GAME_PLUGIN)?;
                            Some(format!("vtable {}+{:#x} at -{:#x}", module.name, value - module.base, at - slot))
                        })
                        .unwrap_or_default();
                    println!(
                        "{at:#014x}  {:<34} index {} of {}  {owner}",
                        describe_address(at, modules),
                        (addr - begin) / 8,
                        (end - begin) / 8
                    );
                    hits += 1;
                    if hits >= max {
                        break 'regions;
                    }
                }
            }
            offset += CHUNK;
        }
    }
    println!("{hits} pair(s) in {:.1} s.", started.elapsed().as_secs_f64());
    Ok(())
}

/// Reads the player list of every team (team + 0x38: begin, end, capacity) and reports,
/// per list length, the spacing of list buffers that share a 64 KiB page: a slab
/// allocator puts blocks of one size class at multiples of that size.
fn squads(session: &Session) -> Result<()> {
    let process = &session.process;
    let mut lists: Vec<(u64, u64, u64)> = Vec::new(); // (begin, length, capacity)
    let mut teams = 0;
    for club in session.clubs()? {
        let Ok(begin) = process.read_u64(club.address + session.layout.club.teams) else { continue };
        let Ok(end) = process.read_u64(club.address + session.layout.club.teams + 8) else { continue };
        if !is_user_pointer(begin) || end < begin || end - begin > 8 * 16 {
            continue;
        }
        for i in 0..(end - begin) / 8 {
            let Ok(team) = process.read_u64(begin + i * 8) else { continue };
            let Ok(words) = process.read_bytes(team + 0x38, 24) else { continue };
            let w: Vec<u64> = words.as_chunks::<8>().0.iter().map(|w| u64::from_le_bytes(*w)).collect();
            teams += 1;
            if is_user_pointer(w[0]) && w[1] > w[0] && w[2] >= w[1] {
                lists.push((w[0], (w[1] - w[0]) / 8, (w[2] - w[0]) / 8));
            }
        }
    }
    let with_room = lists.iter().filter(|l| l.2 > l.1).count();
    println!("{teams} teams, {} non-empty lists, {with_room} with capacity above their length", lists.len());

    // Squad numbers: repeated within one team's list, and within one club's lists taken together.
    let number_of = |player: u64| -> Option<u8> {
        let contract = process.read_u64(player + session.layout.player.contract).ok()?;
        if !is_user_pointer(contract) {
            return None;
        }
        let number = process.read_bytes(contract + session.layout.contract.squad_number, 1).ok()?[0];
        (number != 255).then_some(number)
    };
    let (mut in_team, mut in_club, mut clubs_seen) = (0, 0, 0);
    for club in session.clubs()? {
        let teams_at = club.address + session.layout.club.teams;
        let (Ok(begin), Ok(end)) = (process.read_u64(teams_at), process.read_u64(teams_at + 8)) else { continue };
        if !is_user_pointer(begin) || end <= begin || end - begin > 8 * 16 {
            continue;
        }
        clubs_seen += 1;
        let mut club_numbers: std::collections::HashMap<u8, std::collections::HashSet<u64>> = Default::default();
        for i in 0..(end - begin) / 8 {
            let Ok(team) = process.read_u64(begin + i * 8) else { continue };
            let (Ok(b), Ok(e)) = (process.read_u64(team + 0x38), process.read_u64(team + 0x40)) else { continue };
            if !is_user_pointer(b) || e <= b || e - b > 8 * 5000 {
                continue;
            }
            let mut team_numbers: std::collections::HashMap<u8, usize> = Default::default();
            for element in process.read_bytes(b, (e - b) as usize).unwrap_or_default().as_chunks::<8>().0 {
                let player = u64::from_le_bytes(*element);
                if let Some(number) = number_of(player) {
                    *team_numbers.entry(number).or_default() += 1;
                    club_numbers.entry(number).or_default().insert(player);
                }
            }
            in_team += team_numbers.values().filter(|&&n| n > 1).count();
        }
        in_club += club_numbers.values().filter(|players| players.len() > 1).count();
    }
    println!(
        "squad numbers over {clubs_seen} clubs: {in_team} repeated within a team's list, {in_club} repeated \
         across a club's lists"
    );

    // Which team lists hold each player: the team the player is at, the contract's team, both, neither.
    let mut listed: std::collections::HashMap<u64, Vec<u64>> = std::collections::HashMap::new();
    for club in session.clubs()? {
        let teams_at = club.address + session.layout.club.teams;
        let (Ok(begin), Ok(end)) = (process.read_u64(teams_at), process.read_u64(teams_at + 8)) else { continue };
        if !is_user_pointer(begin) || end < begin || end - begin > 8 * 16 {
            continue;
        }
        for i in 0..(end - begin) / 8 {
            let Ok(team) = process.read_u64(begin + i * 8) else { continue };
            let (Ok(b), Ok(e)) = (process.read_u64(team + 0x38), process.read_u64(team + 0x40)) else { continue };
            if !is_user_pointer(b) || e <= b || e - b > 8 * 5000 {
                continue;
            }
            for element in process.read_bytes(b, (e - b) as usize).unwrap_or_default().as_chunks::<8>().0 {
                listed.entry(u64::from_le_bytes(*element)).or_default().push(team);
            }
        }
    }
    let (mut at_team, mut at_contract, mut both, mut neither, mut extra) = (0, 0, 0, 0, 0);
    let pl = &session.layout.player;
    for player in session.players()? {
        let team = process.read_u64(player.address + pl.team).unwrap_or(0);
        let contract = process.read_u64(player.address + pl.at(pl.contract, player.shift)).unwrap_or(0);
        let contract_team = if is_user_pointer(contract) {
            process.read_u64(contract + session.layout.contract.team).unwrap_or(0)
        } else {
            0
        };
        let lists = listed.get(&player.address).map(Vec::as_slice).unwrap_or_default();
        let (in_team, in_contract) = (lists.contains(&team), lists.contains(&contract_team));
        match (in_team, in_contract) {
            (true, true) => both += 1,
            (true, false) => at_team += 1,
            (false, true) => at_contract += 1,
            (false, false) => neither += 1,
        }
        if lists.iter().any(|t| *t != team && *t != contract_team) {
            extra += 1;
        }
    }
    println!(
        "team lists: {both} players listed at both their team and their contract's team, {at_team} only at \
         their team, {at_contract} only at their contract's team, {neither} at neither, {extra} also elsewhere"
    );

    // How players, their contracts and the two team pointers of a contract relate.
    let p = &session.layout.player;
    let (mut no_contract, mut same, mut loaned, mut split, mut no_team, mut sibling) = (0, 0, 0, 0, 0, 0);
    let club_of = |team: u64| process.read_u64(team + session.layout.team.club).unwrap_or(0);
    let mut examples: Vec<String> = Vec::new();
    for player in session.players()? {
        let team = process.read_u64(player.address + p.team).unwrap_or(0);
        let contract = process.read_u64(player.address + p.at(p.contract, player.shift)).unwrap_or(0);
        if !is_user_pointer(contract) {
            no_contract += 1;
            continue;
        }
        let first = process.read_u64(contract + session.layout.contract.team).unwrap_or(0);
        let second = process.read_u64(contract + session.layout.contract.team + 8).unwrap_or(0);
        if !is_user_pointer(team) {
            no_team += 1;
        } else if first != second {
            split += 1;
            if examples.len() < 5 {
                examples.push(format!("{} ({:?})", player.name, player.club));
            }
        } else if team == first {
            same += 1;
        } else if club_of(team) == club_of(first) {
            sibling += 1;
        } else {
            loaned += 1;
        }
    }
    println!(
        "players: {no_contract} without a contract, {no_team} with a contract but no team, {same} at their \
         contract's team, {sibling} at another team of the same club, {loaned} at another club (on loan?), \
         {split} whose contract names two teams"
    );
    if !examples.is_empty() {
        println!("  two teams: {}", examples.join(", "));
    }

    // GCD of the distances between lists of the same length on the same 64 KiB page.
    let mut by_length: std::collections::BTreeMap<u64, Vec<u64>> = std::collections::BTreeMap::new();
    for &(begin, len, _) in &lists {
        by_length.entry(len).or_default().push(begin);
    }
    fn gcd(a: u64, b: u64) -> u64 {
        if b == 0 { a } else { gcd(b, a % b) }
    }
    println!("length  lists  spacing (bytes, gcd on shared pages)  zeroed slack after the end (slots)");
    for (len, mut begins) in by_length {
        begins.sort_unstable();
        let mut g = 0;
        for pair in begins.windows(2) {
            if pair[1] - pair[0] < 0x10000 && pair[1] >> 16 == pair[0] >> 16 {
                g = gcd(g, pair[1] - pair[0]);
            }
        }
        // How many words after the end are zero, at most 8, for the first few lists.
        let slack: Vec<String> = begins
            .iter()
            .take(6)
            .map(|&b| {
                let after = process.read_bytes(b + len * 8, 64).unwrap_or_default();
                after.as_chunks::<8>().0.iter().take_while(|w| u64::from_le_bytes(**w) == 0).count().to_string()
            })
            .collect();
        println!(
            "{len:>6}  {:>5}  {:>6}  {}",
            begins.len(),
            if g == 0 { "-".to_owned() } else { g.to_string() },
            slack.join(" ")
        );
    }
    Ok(())
}

/// Counts the values of the field at `offset` (in the player, or in his contract) across all
/// players, optionally only those of clubs whose name contains `club`.
fn histogram(
    session: &Session,
    offset: u64,
    kind: FieldType,
    contract: bool,
    club: Option<&str>,
    top: usize,
) -> Result<()> {
    let process = &session.process;
    let p = &session.layout.player;
    let wanted = club.map(fmlibre_core::fold);
    /// What the players holding one value have in common.
    #[derive(Default)]
    struct Tally {
        players: usize,
        ages: u64,
        aged: usize,
        /// Current ability and name of each.
        names: Vec<(u16, String)>,
    }
    let mut seen: std::collections::BTreeMap<u64, Tally> = std::collections::BTreeMap::new();
    for player in session.players()? {
        if let Some(wanted) = &wanted
            && !player.club.as_deref().is_some_and(|name| fmlibre_core::fold(name).contains(wanted.as_str()))
        {
            continue;
        }
        let address = if contract {
            let record = process.read_u64(player.address + p.at(p.contract, player.shift)).unwrap_or(0);
            if !is_user_pointer(record) {
                continue;
            }
            record + offset
        } else {
            player.address + p.at(offset, player.shift)
        };
        let Ok(bytes) = process.read_bytes(address, kind.width()) else { continue };
        let tally = seen.entry(kind.decode(&bytes)).or_default();
        tally.players += 1;
        if let Some(age) = player.age {
            tally.ages += u64::from(age);
            tally.aged += 1;
        }
        tally.names.push((player.current_ability, player.name.clone()));
    }
    let mut rows: Vec<_> = seen.into_iter().collect();
    rows.sort_by(|a, b| b.1.players.cmp(&a.1.players).then(a.0.cmp(&b.0)));
    println!("{:>10}  {:>7}  {:>5}  best by current ability", "value", "players", "age");
    for (value, mut tally) in rows.into_iter().take(top) {
        tally.names.sort_by_key(|(ability, _)| std::cmp::Reverse(*ability));
        let names: Vec<String> = tally.names.into_iter().take(3).map(|(_, name)| name).collect();
        let age = if tally.aged > 0 { format!("{:.1}", tally.ages as f64 / tally.aged as f64) } else { "-".to_owned() };
        println!("{value:>10}  {:>7}  {age:>5}  {}", tally.players, names.join(", "));
    }
    Ok(())
}

/// The two 64-bit values on either side of `at`, to tell arrays and objects apart.
fn neighbours(process: &Process, at: u64) -> String {
    let word = |addr: u64| process.read_u64(addr).map_or_else(|_| "?".to_owned(), |v| format!("{v:#x}"));
    format!("[{} {} | {} {}]", word(at - 16), word(at - 8), word(at + 8), word(at + 16))
}

/// Prints the (begin, end) pointer arrays found inside the object at `addr`, with the
/// players, staff, clubs and contracts among their elements named.
fn lists(session: &Session, modules: &[Module], addr: u64, len: u64) -> Result<()> {
    let process = &session.process;
    let names = object_names(session)?;
    let bytes =
        process.read_bytes(addr, len as usize).with_context(|| format!("reading {len:#x} bytes at {addr:#x}"))?;
    let words: Vec<u64> = bytes.as_chunks::<8>().0.iter().map(|w| u64::from_le_bytes(*w)).collect();
    println!("{} ({len:#x} bytes)", describe_address(addr, modules));

    for (i, pair) in words.windows(3).enumerate() {
        let (begin, end) = (pair[0], pair[1]);
        if !is_user_pointer(begin) || end <= begin || !(end - begin).is_multiple_of(8) || end - begin > 8 * 5000 {
            continue;
        }
        let count = (end - begin) / 8;
        let Ok(elements) = process.read_bytes(begin, (count * 8) as usize) else {
            continue;
        };
        let named: Vec<&str> = elements
            .as_chunks::<8>()
            .0
            .iter()
            .filter_map(|e| names.get(&u64::from_le_bytes(*e)).map(String::as_str))
            .collect();
        let capacity = pair[2];
        let capacity = if capacity >= end && (capacity - begin).is_multiple_of(8) && capacity - begin <= 8 * 10000 {
            format!(", room for {}", (capacity - begin) / 8)
        } else {
            String::new()
        };
        let sample: Vec<&str> = named.iter().take(4).copied().collect();
        println!(
            "  +{:#05x}  {count:>5} at {begin:#x}{capacity}; {} named{}{}",
            i * 8,
            named.len(),
            if sample.is_empty() { "" } else { ": " },
            sample.join(", ")
        );
    }
    Ok(())
}

/// Names for the addresses of players, staff, their person blocks and contracts, and clubs.
fn object_names(session: &Session) -> Result<std::collections::HashMap<u64, String>> {
    let process = &session.process;
    let (p, s) = (&session.layout.player, &session.layout.staff);
    let mut names = std::collections::HashMap::new();
    for player in session.players()? {
        let block = player.address + p.person_block + player.shift;
        if let Ok(contract) = process.read_u64(player.address + p.at(p.contract, player.shift)) {
            names.insert(contract, format!("contract of {}", player.name));
        }
        names.insert(block, format!("person block of {}", player.name));
        names.insert(player.address, format!("player {}", player.name));
    }
    for member in session.staff()? {
        let block = member.address + s.person_block + member.shift;
        if let Ok(contract) = process.read_u64(member.address + s.at(s.contract, member.shift)) {
            names.insert(contract, format!("contract of staff {}", member.name));
        }
        names.insert(block, format!("person block of staff {}", member.name));
        names.insert(member.address, format!("staff {}", member.name));
    }
    for club in session.clubs()? {
        names.insert(club.address, format!("club {}", club.name));
    }
    names.remove(&0);
    Ok(names)
}

// ---------------------------------------------------------------------------
// find

fn find(
    process: &Process,
    modules: &[Module],
    pattern: &str,
    kind: PatternKind,
    module: Option<&str>,
    max: usize,
) -> Result<()> {
    let needles: Vec<(&str, Vec<u8>)> = match kind {
        PatternKind::Text => vec![
            ("utf-8", pattern.as_bytes().to_vec()),
            ("utf-16", pattern.encode_utf16().flat_map(u16::to_le_bytes).collect()),
        ],
        PatternKind::Hex => vec![("bytes", parse_bytes(pattern)?)],
        PatternKind::U16 => vec![("u16", u16::try_from(parse_number(pattern)?)?.to_le_bytes().to_vec())],
        PatternKind::U32 => vec![("u32", u32::try_from(parse_number(pattern)?)?.to_le_bytes().to_vec())],
    };
    ensure!(needles.iter().all(|(_, needle)| !needle.is_empty()), "the pattern is empty");
    let (start, end) = match module {
        Some(name) => {
            let m = find_module(modules, name).with_context(|| format!("module {name} is not loaded"))?;
            (m.base, m.end())
        }
        None => (0x1_0000, 0x7FFF_FFFF_0000),
    };

    const CHUNK: u64 = 8 << 20;
    let overlap = needles.iter().map(|(_, needle)| needle.len() as u64).max().unwrap_or(1) - 1;
    let finders: Vec<(&str, memchr::memmem::Finder)> =
        needles.iter().map(|(label, needle)| (*label, memchr::memmem::Finder::new(needle))).collect();
    let started = Instant::now();
    let (mut scanned, mut hits) = (0u64, 0usize);

    'regions: for region in regions(process, start, end).into_iter().filter(|r| r.is_readable()) {
        let mut offset = 0;
        while offset < region.size {
            let base = region.base + offset;
            let len = (region.size - offset).min(CHUNK + overlap);
            if let Ok(chunk) = process.read_bytes(base, len as usize) {
                for (label, finder) in &finders {
                    for pos in finder.find_iter(&chunk) {
                        // A match that starts in the overlap is reported with the next chunk.
                        if pos as u64 >= CHUNK {
                            continue;
                        }
                        let addr = base + pos as u64;
                        let context = if *label == "utf-16" { utf16_context(process, addr) } else { String::new() };
                        println!("{addr:#014x}  {label:<6} {:<34} {context}", describe_address(addr, modules));
                        hits += 1;
                        if hits >= max {
                            break 'regions;
                        }
                    }
                }
            }
            scanned += len.min(CHUNK);
            offset += CHUNK;
        }
    }
    println!(
        "{hits} hit(s){}; scanned {:.0} MiB in {:.1} s.",
        if hits >= max { " (stopped at --max)" } else { "" },
        scanned as f64 / 1_048_576.0,
        started.elapsed().as_secs_f64()
    );
    Ok(())
}

/// The UTF-16 text around a hit, with control characters shown as dots.
fn utf16_context(process: &Process, addr: u64) -> String {
    const AROUND: u64 = 48;
    let Ok(bytes) = process.read_bytes(addr.saturating_sub(AROUND), (2 * AROUND) as usize) else {
        return String::new();
    };
    let units: Vec<u16> = bytes.as_chunks::<2>().0.iter().map(|pair| u16::from_le_bytes(*pair)).collect();
    String::from_utf16_lossy(&units).chars().map(|c| if c.is_control() { '·' } else { c }).collect()
}

/// Parses "c7 80 ea 07" (spaces optional) into bytes.
fn parse_bytes(text: &str) -> Result<Vec<u8>> {
    let digits: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    ensure!(digits.len().is_multiple_of(2), "hex bytes need an even number of digits: {text}");
    (0..digits.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&digits[i..i + 2], 16).with_context(|| format!("not hex bytes: {text}")))
        .collect()
}

/// Parses a decimal number, or hex with a 0x prefix.
fn parse_number(text: &str) -> Result<u64> {
    let text = text.trim();
    match text.strip_prefix("0x").or_else(|| text.strip_prefix("0X")) {
        Some(hex) => u64::from_str_radix(hex, 16).with_context(|| format!("not a hex number: {text}")),
        None => text.parse().with_context(|| format!("not a number: {text}")),
    }
}

fn attach(pid: Option<u32>, elevated: bool, writes: bool) -> Result<Process> {
    let pid = find_game(pid).map_err(|err| match err {
        SessionError::SeveralRunning(_) => anyhow!("{err} with --pid"),
        err => anyhow!(err),
    })?;
    let opened = if writes { Process::open_read_write(pid) } else { Process::open_read(pid) };
    opened.map_err(|err| {
        if err.is_access_denied() && !elevated {
            anyhow!("{err}. Run the probe from an administrator terminal and try again.")
        } else {
            anyhow!(err)
        }
    })
}

fn inspect(process: &Process) -> Result<(GameInfo, Vec<Module>)> {
    let game = GameInfo::inspect(process).context("inspecting the game process")?;
    let modules = list_modules(process.pid()).context("listing modules")?;
    Ok((game, modules))
}

// ---------------------------------------------------------------------------
// calibrate / players

fn calibrate(session: &Session) -> Result<()> {
    let fingerprint = session.fingerprint;
    println!(
        "{GAME_PLUGIN} build: size of image {:#x}, link timestamp {:#010x}",
        fingerprint.size_of_image, fingerprint.link_timestamp
    );
    match &session.profile {
        Some(profile) => println!("Build profile: {}", profile.name),
        None => println!("Build profile: none for this build"),
    }
    println!("In-game date: {}", iso_date(session.game_date()));
    let source = if session.arrays.from_profile { "from the build profile, checked" } else { "found by scanning" };
    println!("Entity arrays ({source}):");
    let arrays = &session.arrays;
    for (label, array) in [("players", &arrays.players), ("staff", &arrays.staff), ("clubs", &arrays.clubs)] {
        match array {
            Some(a) => println!(
                "  {label:<8} {GAME_PLUGIN}+{:#x}  {:>7} elements  {:>3.0}% of samples decoded",
                a.pair_rva,
                a.count,
                a.confidence * 100.0
            ),
            None => println!("  {label:<8} not found"),
        }
    }
    Ok(())
}

fn players(session: &Session, text: Option<&str>, limit: usize, args: &PlayerFilterArgs) -> Result<()> {
    let (filter, order) = args.parse()?;
    let started = Instant::now();
    let index = PlayerIndex::new(session.players()?);
    let elapsed = started.elapsed();
    let mut hits = index.search(text.unwrap_or(""));
    hits.retain(|p| filter.matches(p));
    if let Some(order) = order {
        sort_players(&mut hits, order);
    }
    println!(
        "Read {} players in {:.1} s; {} shown of {} matching.",
        index.len(),
        elapsed.as_secs_f64(),
        hits.len().min(limit),
        hits.len()
    );
    println!();
    println!(
        "{:>10}  {:<26}  {:>3}  {:<12}  {:<14}  {:<22}  {:<10}  {:>3}  {:>4}",
        "UID", "Name", "Age", "Positions", "Nation", "Club", "Expires", "CA", "PA"
    );
    for p in hits.iter().take(limit) {
        let positions: Vec<String> = p.positions.iter().map(|key| key.to_uppercase()).collect();
        println!(
            "{:>10}  {:<26}  {:>3}  {:<12}  {:<14}  {:<22}  {:<10}  {:>3}  {:>4}",
            p.uid,
            clip(&p.name, 26),
            p.age.map_or_else(String::new, |age| age.to_string()),
            clip(&positions.join(" "), 12),
            clip(p.nation.as_deref().unwrap_or("-"), 14),
            clip(p.club.as_deref().unwrap_or("-"), 22),
            iso_date(p.contract_expires),
            p.current_ability,
            p.potential_ability
        );
    }
    Ok(())
}

/// Player filters and sorting for `players`.
#[derive(clap::Args)]
struct PlayerFilterArgs {
    /// Only players rated 15 or more at this position (gk, dc, wbl, mc, aml, st, ...).
    #[arg(long)]
    position: Option<String>,
    #[arg(long)]
    min_age: Option<u16>,
    #[arg(long)]
    max_age: Option<u16>,
    #[arg(long)]
    min_ca: Option<u16>,
    #[arg(long)]
    min_pa: Option<i16>,
    /// Part of the nation's name.
    #[arg(long)]
    nation: Option<String>,
    /// Part of the club's name.
    #[arg(long)]
    club: Option<String>,
    /// Only players without a club.
    #[arg(long)]
    free_agents: bool,
    /// Only contracts ending on or before this date (YYYY-MM-DD).
    #[arg(long)]
    expires_by: Option<String>,
    /// Sort by ca, pa, age, name, nation, club or expires (highest first unless --ascending).
    #[arg(long)]
    sort: Option<String>,
    #[arg(long)]
    ascending: bool,
}

impl PlayerFilterArgs {
    fn parse(&self) -> Result<(PlayerFilter, Option<PlayerOrder>)> {
        if let Some(position) = &self.position {
            ensure!(
                POSITIONS.contains(&position.as_str()),
                "unknown position {position}; use one of {}",
                POSITIONS.join(", ")
            );
        }
        let contract_expires_by = self.expires_by.as_deref().map(parse_iso_date).transpose()?;
        let filter = PlayerFilter {
            position: self.position.clone(),
            min_age: self.min_age,
            max_age: self.max_age,
            min_current_ability: self.min_ca,
            min_potential_ability: self.min_pa,
            nation: self.nation.clone(),
            club: self.club.clone(),
            free_agents: self.free_agents,
            contract_expires_by,
        };
        let by = match self.sort.as_deref() {
            None => return Ok((filter, None)),
            Some("ca") => PlayerSort::CurrentAbility,
            Some("pa") => PlayerSort::PotentialAbility,
            Some("age") => PlayerSort::Age,
            Some("name") => PlayerSort::Name,
            Some("nation") => PlayerSort::Nation,
            Some("club") => PlayerSort::Club,
            Some("expires") => PlayerSort::ContractExpires,
            Some(other) => bail!("unknown sort column {other}"),
        };
        Ok((filter, Some(PlayerOrder { by, ascending: self.ascending })))
    }
}

/// Parses "2027-06-30".
fn parse_iso_date(text: &str) -> Result<FmDate> {
    let parts: Vec<&str> = text.split('-').collect();
    ensure!(parts.len() == 3, "dates look like 2027-06-30, not {text}");
    let date = FmDate {
        year: parts[0].parse().with_context(|| format!("bad year in {text}"))?,
        month: parts[1].parse().with_context(|| format!("bad month in {text}"))?,
        day: parts[2].parse().with_context(|| format!("bad day in {text}"))?,
    };
    ensure!((1..=12).contains(&date.month) && (1..=31).contains(&date.day), "not a date: {text}");
    Ok(date)
}

fn player(session: &Session, uid: u32) -> Result<()> {
    let index = PlayerIndex::new(session.players()?);
    let summary = index.get(uid).with_context(|| format!("no player with UID {uid}"))?;
    let d = session.player_details(summary)?.context("the player's data changed while reading; try again")?;
    let date = |date: Option<FmDate>| {
        date.map_or_else(|| "-".to_owned(), |d| format!("{:04}-{:02}-{:02}", d.year, d.month, d.day))
    };

    println!("{} (UID {})", d.summary.name, d.summary.uid);
    if let Some(full) = &d.summary.full_name {
        println!("  full name      {full}");
    }
    match d.summary.age {
        Some(age) => println!("  born           {} (age {age})", date(d.summary.date_of_birth)),
        None => println!("  born           {}", date(d.summary.date_of_birth)),
    }
    println!("  nation         {}", d.summary.nation.as_deref().unwrap_or("-"));
    println!("  club           {}", d.summary.club.as_deref().unwrap_or("-"));
    println!("  CA / PA        {} / {}", d.summary.current_ability, d.summary.potential_ability);
    println!("  height         {} cm", d.height_cm);
    println!(
        "  reputation     home {}, current {}, world {}",
        d.reputation.home, d.reputation.current, d.reputation.world
    );
    let i = &d.international;
    println!("  international  {} caps, {} goals; U21 {} caps, {} goals", i.caps, i.goals, i.u21_caps, i.u21_goals);
    println!("  asking price   {}", d.asking_price.map_or_else(|| "not set".to_owned(), |p| format!("£{p}")));
    if summary.shift != 0 {
        println!("  layout         person block shifted by {:#x} (player-coach)", summary.shift);
    }
    let p = &session.layout.player;
    let pointer = |offset: u64| session.process.read_u64(summary.address + p.at(offset, summary.shift)).unwrap_or(0);
    println!(
        "  addresses      object {:#x}, person block {:#x}, team {:#x}, contract {:#x}",
        summary.address,
        summary.address + p.person_block + summary.shift,
        pointer(p.team),
        pointer(p.contract)
    );

    println!();
    for (group, keys) in ATTRIBUTE_GROUPS {
        let values: Vec<String> =
            keys.iter().filter_map(|key| d.attributes.get(*key).map(|a| format!("{key} {}", a.value))).collect();
        println!("  {group:<12} {}", values.join(", "));
    }
    let positions: Vec<String> =
        POSITIONS.iter().map(|key| format!("{} {}", key.to_uppercase(), d.position_ratings[key])).collect();
    println!("  {:<12} {}", "positions", positions.join(", "));
    let personality: Vec<String> = PERSONALITY.iter().map(|key| format!("{key} {}", d.personality[key])).collect();
    println!("  {:<12} {}", "personality", personality.join(", "));

    println!();
    match &d.contract {
        Some(c) => {
            println!("  contract       £{} per week, signed {}, expires {}", c.wage, date(c.signed), date(c.expires));
            println!(
                "                 joined {}, squad status {}, squad number {}",
                date(c.joined),
                c.squad_status,
                c.squad_number.map_or_else(|| "-".to_owned(), |n| n.to_string())
            );
            println!("                 transfer listed {}, loan listed {}", c.transfer_listed, c.loan_listed);
        }
        None => println!("  contract       none"),
    }
    Ok(())
}

fn staff(session: &Session, text: Option<&str>, limit: usize) -> Result<()> {
    let started = Instant::now();
    let index = StaffIndex::new(session.staff()?);
    let elapsed = started.elapsed();
    let hits = index.search(text.unwrap_or(""));
    println!(
        "Read {} staff in {:.1} s; {} shown of {} matching.",
        index.len(),
        elapsed.as_secs_f64(),
        hits.len().min(limit),
        hits.len()
    );
    println!();
    println!("{:>10}  {:<28}  {:>3}  {:<22}  {:<24}  {:>3}  {:>4}", "ID", "Name", "Age", "Job", "Club", "CA", "PA");
    for s in hits.iter().take(limit) {
        let job =
            s.job.map_or_else(String::new, |code| job_name(code).map_or_else(|| format!("job {code}"), str::to_owned));
        let name = if s.is_human { format!("{} (you)", s.name) } else { s.name.clone() };
        println!(
            "{:>10}  {:<28}  {:>3}  {:<22}  {:<24}  {:>3}  {:>4}",
            s.uid,
            clip(&name, 28),
            s.age.map_or_else(String::new, |age| age.to_string()),
            clip(&job, 22),
            clip(s.club.as_deref().unwrap_or("-"), 24),
            s.current_ability,
            s.potential_ability
        );
    }
    Ok(())
}

fn staff_member(session: &Session, uid: u32) -> Result<()> {
    let index = StaffIndex::new(session.staff()?);
    let member = index.get(uid).with_context(|| format!("no member of staff with id {uid}"))?;
    let d = session.staff_details(member)?.context("the staff member's data changed while reading; try again")?;
    let s = &d.summary;
    println!("{} (id {}){}", s.name, s.uid, if s.is_human { ", the human manager" } else { "" });
    if let Some(full) = &s.full_name {
        println!("  full name      {full}");
    }
    let age = s.age.map_or_else(String::new, |age| format!(" (age {age})"));
    println!("  born           {}{age}", iso_date(s.date_of_birth));
    println!("  nation         {}", s.nation.as_deref().unwrap_or("-"));
    println!("  club           {}", s.club.as_deref().unwrap_or("-"));
    println!("  CA / PA        {} / {}", s.current_ability, s.potential_ability);
    println!(
        "  reputation     home {}, current {}, world {}",
        d.reputation.home, d.reputation.current, d.reputation.world
    );
    if member.shift != 0 {
        println!("  layout         person block shifted by {:#x}", member.shift);
    }
    println!();
    for (group, keys) in STAFF_ATTRIBUTE_GROUPS {
        let values: Vec<String> =
            keys.iter().filter_map(|key| d.attributes.get(*key).map(|a| format!("{key} {}", a.value))).collect();
        println!("  {group:<12} {}", values.join(", "));
    }
    let personality: Vec<String> = PERSONALITY.iter().map(|key| format!("{key} {}", d.personality[key])).collect();
    println!("  {:<12} {}", "personality", personality.join(", "));
    println!();
    match &d.contract {
        Some(c) => println!(
            "  contract       {}, £{} per week, signed {}, expires {}, joined {}",
            job_name(c.job).map_or_else(|| format!("job {}", c.job), str::to_owned),
            c.wage,
            iso_date(c.signed),
            iso_date(c.expires),
            iso_date(c.joined)
        ),
        None => println!("  contract       none"),
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// graphics

fn graphics(root: Option<PathBuf>, clubs: &[u32]) -> Result<()> {
    let root = match root {
        Some(root) => root,
        None => {
            let home = std::env::var_os("USERPROFILE").context("USERPROFILE is not set; pass --root")?;
            GraphicsIndex::default_root(&PathBuf::from(home).join("Documents"), 27)
        }
    };
    let started = Instant::now();
    let index = GraphicsIndex::scan(&root);
    let c = index.counts();
    println!("Read {} in {:.1} s.", root.display(), started.elapsed().as_secs_f64());
    println!(
        "  club logos {}, faces {}, flags {}, competition logos {}",
        c.club_logos, c.faces, c.flags, c.competition_logos
    );
    for &uid in clubs {
        match index.file(Picture::ClubLogo, uid) {
            Some(file) => println!("  club {uid}: {}", file.display()),
            None => println!("  club {uid}: no logo"),
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// fields / get / set

/// Every player, member of staff or club, as edit targets with their names.
fn targets(session: &Session, entity: Entity) -> Result<Vec<(Target, String)>> {
    Ok(match entity {
        Entity::Player => session.players()?.into_iter().map(|p| (p.target(), p.name)).collect(),
        Entity::Staff => session.staff()?.into_iter().map(|s| (s.target(), s.name)).collect(),
        Entity::Club => session.clubs()?.into_iter().map(|c| (c.target(), c.name)).collect(),
    })
}

fn find_target(session: &Session, entity: Entity, uid: u32) -> Result<(Target, String)> {
    targets(session, entity)?
        .into_iter()
        .find(|(target, _)| target.uid == uid)
        .with_context(|| format!("no {entity} with id {uid}"))
}

/// A stored value as the probe prints it: dates as dates, attributes also as shown.
fn shown(field: &Field, stored: i64) -> String {
    if field.kind == Kind::Date {
        return FmDate::from_number(stored).map_or_else(|| "not set".to_owned(), |date| iso_date(Some(date)));
    }
    match field.scale {
        Scale::Plain => stored.to_string(),
        Scale::Attribute => format!("{stored} ({})", field.scale.shown(stored)),
    }
}

fn fields(session: &Session, entity: Entity, stats: bool) -> Result<()> {
    let fields = session.fields(entity);
    if !stats {
        println!("{:<34}  {:<4}  {:<9}  {:>11}  {:>11}", "Field", "Type", "Scale", "Min", "Max");
        for f in &fields {
            let scale = format!("{:?}", f.scale).to_lowercase();
            let kind = format!("{:?}", f.kind).to_lowercase();
            println!("{:<34}  {kind:<4}  {scale:<9}  {:>11}  {:>11}", f.key, shown(f, f.min), shown(f, f.max));
        }
        return Ok(());
    }

    let started = Instant::now();
    let targets = targets(session, entity)?;
    // Lowest and highest value found, how many are implausible, and how many lack the field's record.
    let mut seen: Vec<(i64, i64, usize, usize)> = vec![(i64::MAX, i64::MIN, 0, 0); fields.len()];
    let mut read = 0;
    for (target, _) in &targets {
        let Ok(values) = session.read_fields(target, &fields) else {
            continue;
        };
        read += 1;
        for ((low, high, odd, missing), (field, value)) in seen.iter_mut().zip(fields.iter().zip(values)) {
            match value {
                Some(value) => {
                    *low = (*low).min(value);
                    *high = (*high).max(value);
                    *odd += usize::from(!field.is_plausible(value));
                }
                None => *missing += 1,
            }
        }
    }
    println!("Read {read} of {} {entity} objects in {:.1} s.", targets.len(), started.elapsed().as_secs_f64());
    if entity == Entity::Club {
        match session.finance_class() {
            Some(class) => println!("Full finance record class: {class:#x}"),
            None => println!("Full finance record class: not found; finances are not writable"),
        }
    }
    println!();
    println!("{:<30}  {:>25}  {:>25}  {:>11}  {:>9}", "Field", "Writes", "Found", "Implausible", "No record");
    for (f, (low, high, odd, missing)) in fields.iter().zip(seen) {
        let found = if low > high { "-".to_owned() } else { format!("{}..{}", shown(f, low), shown(f, high)) };
        let writes = format!("{}..{}", shown(f, f.min), shown(f, f.max));
        println!("{:<30}  {writes:>25}  {found:>25}  {odd:>11}  {missing:>9}", f.key);
    }
    Ok(())
}

fn get(session: &Session, entity: Entity, uid: u32, keys: &[String]) -> Result<()> {
    let (target, name) = find_target(session, entity, uid)?;
    let fields: Vec<Field> = if keys.is_empty() {
        session.fields(entity)
    } else {
        keys.iter().map(|key| session.field(entity, key)).collect::<Result<_, _>>()?
    };
    let values = session.read_fields(&target, &fields)?;
    println!("{name} ({entity} {uid})");
    for (field, value) in fields.iter().zip(values) {
        match value {
            Some(value) => {
                let note = if field.is_plausible(value) { "" } else { "  (implausible: not writable)" };
                println!("  {:<34} {}{note}", field.key, shown(field, value));
            }
            None => println!("  {:<34} -  (no record: not writable)", field.key),
        }
    }
    Ok(())
}

fn set(
    session: &Session,
    entity: Entity,
    uid: u32,
    key: &str,
    value: &str,
    as_shown: bool,
    restore: bool,
) -> Result<()> {
    let (target, name) = find_target(session, entity, uid)?;
    let field = session.field(entity, key)?;
    let stored = if field.kind == Kind::Date {
        parse_iso_date(value)?.to_number()
    } else {
        let value: i64 = value.trim().parse().with_context(|| format!("not a number: {value}"))?;
        if as_shown { field.scale.stored(value) } else { value }
    };
    let change = session.write_field(&target, &field, stored)?;
    let read = session.read_field(&target, &field)?;
    println!("{name} ({entity} {uid})");
    println!(
        "  {key}: {} -> {}, reads back {}",
        shown(&field, change.old),
        shown(&field, change.new),
        shown(&field, read)
    );
    if restore {
        let back = session.revert(&target, &change)?;
        let read = session.read_field(&target, &field)?;
        ensure!(read == change.old, "{key} reads {read} after restoring {}", change.old);
        println!(
            "  restored: {} -> {}, reads back {}",
            shown(&field, back.old),
            shown(&field, back.new),
            shown(&field, read)
        );
    }
    Ok(())
}

fn move_player(session: &Session, uid: u32, club: u32, terms: MoveTerms, restore: bool, hold: u64) -> Result<()> {
    let players = PlayerIndex::new(session.players()?);
    let clubs = ClubIndex::new(session.clubs()?);
    let player = players.get(uid).with_context(|| format!("no player with UID {uid}"))?;
    let to = clubs.get(club).with_context(|| format!("no club with UID {club}"))?;
    let human: Vec<u32> = session.staff()?.iter().filter(|s| s.is_human).filter_map(|s| s.club_uid).collect();
    let plan = session.plan_club_move(player, to, terms, &human)?;
    let from = clubs.get(plan.from_club).map_or("?", |c| c.name.as_str());
    println!("{} (UID {uid}): {from} -> {}, {} writes", player.name, to.name, plan.writes());

    let done = session.apply_club_move(&plan)?;
    // Read him again as the lists would, from the team he now plays for.
    let club_now = |label: &str| -> Result<Option<u32>> {
        let now = session.players()?.into_iter().find(|p| p.uid == uid).context("the player is gone")?;
        println!("  {label} {}", now.club.as_deref().unwrap_or("-"));
        Ok(now.club_uid)
    };
    ensure!(club_now("now at")? == Some(club), "the player does not read as being at {}", to.name);
    if restore {
        if hold > 0 {
            println!("  moving him back in {hold} s");
            std::thread::sleep(std::time::Duration::from_secs(hold));
        }
        session.undo_club_move(&done)?;
        ensure!(club_now("moved back to")? == Some(plan.from_club), "the player is not back at {from}");
    }
    Ok(())
}

fn clubs(session: &Session, text: Option<&str>, limit: usize) -> Result<()> {
    let started = Instant::now();
    let index = ClubIndex::new(session.clubs()?);
    let elapsed = started.elapsed();
    let hits = index.search(text.unwrap_or(""));
    println!(
        "Read {} clubs in {:.1} s; {} shown of {} matching.",
        index.len(),
        elapsed.as_secs_f64(),
        hits.len().min(limit),
        hits.len()
    );
    println!();
    println!("{:>10}  {:<32}  {:<20}  {:>5}  {:>7}", "UID", "Name", "Short name", "Rep", "Founded");
    for c in hits.iter().take(limit) {
        let name = if c.women { format!("{} (women)", c.name) } else { c.name.clone() };
        println!(
            "{:>10}  {:<32}  {:<20}  {:>5}  {:>7}",
            c.uid,
            clip(&name, 32),
            clip(c.short_name.as_deref().unwrap_or("-"), 20),
            c.reputation.map_or_else(String::new, |r| r.to_string()),
            c.founded.map_or_else(String::new, |y| y.to_string())
        );
    }
    Ok(())
}

fn club(session: &Session, uid: u32) -> Result<()> {
    let index = ClubIndex::new(session.clubs()?);
    let summary = index.get(uid).with_context(|| format!("no club with UID {uid}"))?;
    let d = session.club_details(summary)?.context("the club's data changed while reading; try again")?;
    let c = &d.summary;
    println!("{} (UID {}){}", c.name, c.uid, if c.women { ", women's club" } else { "" });
    let teams = session.process.read_u64(summary.address + session.layout.club.teams).unwrap_or(0);
    println!("  addresses      object {:#x}, teams {teams:#x}", summary.address);
    println!("  short name     {}", c.short_name.as_deref().unwrap_or("-"));
    println!("  reputation     {}", c.reputation.map_or_else(|| "-".to_owned(), |r| r.to_string()));
    println!("  founded        {}", c.founded.map_or_else(|| "-".to_owned(), |y| y.to_string()));
    println!("  season tickets {}", d.season_tickets.map_or_else(|| "-".to_owned(), |n| n.to_string()));
    println!("  social media   {}", d.social_media.map_or_else(|| "-".to_owned(), |n| n.to_string()));
    let mix: Vec<String> =
        SUPPORTER_MIX.iter().filter_map(|k| d.supporter_mix.get(k).map(|v| format!("{k} {v}%"))).collect();
    println!("  supporters     {}", mix.join(", "));
    let traits: Vec<String> =
        SUPPORTER_TRAITS.iter().filter_map(|k| d.supporter_traits.get(k).map(|v| format!("{k} {v}"))).collect();
    println!("  traits         {}", traits.join(", "));
    let facilities: Vec<String> = d.facilities.iter().map(|(k, v)| format!("{k} {v}")).collect();
    println!("  facilities     {}", facilities.join(", "));
    match &d.finances {
        Some(f) => println!(
            "  finances       balance £{}, transfer budget £{}, wage budget £{} p/w (total £{}), ticket £{:.0}",
            f.balance, f.transfer_budget, f.wage_budget, f.total_wage_budget, f.ticket_price
        ),
        None => println!("  finances       not kept for this club"),
    }
    Ok(())
}

/// "2026-07-18", or "-" when the date is unknown.
fn iso_date(date: Option<FmDate>) -> String {
    date.map_or_else(|| "-".to_owned(), |d| format!("{:04}-{:02}-{:02}", d.year, d.month, d.day))
}

/// Shortens `text` to at most `width` characters.
fn clip(text: &str, width: usize) -> String {
    if text.chars().count() <= width {
        return text.to_owned();
    }
    let mut out: String = text.chars().take(width - 1).collect();
    out.push('…');
    out
}

// ---------------------------------------------------------------------------
// info

#[derive(Serialize)]
struct InfoReport<'a> {
    elevated: bool,
    game: &'a GameInfo,
    modules: Vec<ModuleReport>,
    plugin: Option<PluginReport>,
}

#[derive(Serialize)]
struct ModuleReport {
    name: String,
    base: String,
    size: String,
    path: PathBuf,
}

#[derive(Serialize)]
struct PluginReport {
    link_timestamp: String,
    size_of_image: String,
    sections: Vec<SectionReport>,
    export_count: usize,
    build_stamp: Option<String>,
    writable_regions: usize,
    writable_bytes: u64,
}

#[derive(Serialize)]
struct SectionReport {
    name: String,
    rva: String,
    size: String,
    flags: String,
}

fn info(process: &Process, game: &GameInfo, modules: &[Module], elevated: bool, json: Option<&Path>) -> Result<()> {
    println!("FMLibreEditor probe {} (read-only)", env!("CARGO_PKG_VERSION"));
    println!("Running as administrator: {}", if elevated { "yes" } else { "no" });
    println!();
    println!("Game process");
    println!("  pid          {}", game.pid);
    println!("  exe          {}", game.exe_path.display());
    println!("  storefront   {}", game.storefront.label());
    println!("  edition      {}", game.edition.map_or_else(|| "unknown".to_owned(), |e| format!("FM{e}")));
    if let Some(name) = &game.package_full_name {
        println!("  package      {name}");
    }
    if let Some(version) = &game.package_version {
        println!("  version      {version}");
    }

    println!();
    println!("Key modules");
    let mut module_reports = Vec::new();
    for name in KEY_MODULES {
        match find_module(modules, name) {
            Some(m) => {
                println!("  {:<18} base {:#014x}  size {:#010x}", m.name, m.base, m.size);
                module_reports.push(ModuleReport {
                    name: m.name.clone(),
                    base: format!("{:#x}", m.base),
                    size: format!("{:#x}", m.size),
                    path: m.path.clone(),
                });
            }
            None => println!("  {name:<18} not loaded"),
        }
    }

    let plugin = match find_module(modules, GAME_PLUGIN) {
        Some(module) => Some(plugin_report(process, module)?),
        None => {
            println!();
            println!("{GAME_PLUGIN} is not loaded yet; wait for the main menu and run the probe again.");
            None
        }
    };

    if let Some(path) = json {
        write_json(path, &InfoReport { elevated, game, modules: module_reports, plugin })?;
    }
    Ok(())
}

fn plugin_report(process: &Process, module: &Module) -> Result<PluginReport> {
    let pe = PeImage::read(process, module.base).with_context(|| format!("reading {GAME_PLUGIN} headers"))?;
    println!();
    println!("{GAME_PLUGIN} (headers read from memory)");
    println!("  link timestamp   {:#010x}", pe.timestamp);
    println!("  size of image    {:#x}", pe.size_of_image);
    println!("  sections");
    for s in &pe.sections {
        println!("    {:<9} rva {:#010x}  size {:#010x}  {}", s.name, s.rva, s.virtual_size, s.flags());
    }

    let exports = pe.exports(process).unwrap_or_default();
    println!("  exports          {}", exports.len());
    let build_stamp = exports
        .iter()
        .find(|e| e.name == "game_plugin_plugin_build_timestamp")
        .map(|e| describe_symbol(process, &pe, e.rva));
    if let Some(stamp) = &build_stamp {
        println!("  build stamp      {stamp}");
    }

    let writable: Vec<_> =
        regions(process, module.base, module.end()).into_iter().filter(|r| r.is_writable()).collect();
    let writable_bytes: u64 = writable.iter().map(|r| r.size).sum();
    println!("  writable memory  {} regions, {:.1} MiB", writable.len(), writable_bytes as f64 / 1_048_576.0);

    Ok(PluginReport {
        link_timestamp: format!("{:#010x}", pe.timestamp),
        size_of_image: format!("{:#x}", pe.size_of_image),
        sections: pe
            .sections
            .iter()
            .map(|s| SectionReport {
                name: s.name.clone(),
                rva: format!("{:#x}", s.rva),
                size: format!("{:#x}", s.virtual_size),
                flags: s.flags(),
            })
            .collect(),
        export_count: exports.len(),
        build_stamp,
        writable_regions: writable.len(),
        writable_bytes,
    })
}

/// Best-effort description of an exported symbol: a string, a pointer to a string, or raw bytes.
fn describe_symbol(process: &Process, pe: &PeImage, rva: u32) -> String {
    let location = match pe.section_for_rva(rva.into()) {
        Some(s) => format!("rva {rva:#x} in {} [{}]", s.name, s.flags()),
        None => format!("rva {rva:#x}"),
    };
    let Ok(bytes) = process.read_bytes(pe.base + u64::from(rva), 64) else {
        return format!("{location}, unreadable");
    };
    if let Some(text) = ascii_prefix(&bytes) {
        return format!("\"{text}\" ({location})");
    }
    let value = u64::from_le_bytes(bytes[..8].try_into().expect("8 bytes"));
    if let Some(text) = process.read_bytes(value, 64).ok().as_deref().and_then(ascii_prefix) {
        return format!("-> \"{text}\" ({location})");
    }
    let hex: Vec<String> = bytes[..16].iter().map(|b| format!("{b:02x}")).collect();
    format!("{} ({location})", hex.join(" "))
}

/// The printable ASCII text at the start of `bytes`, if it is at least 4 characters long.
fn ascii_prefix(bytes: &[u8]) -> Option<String> {
    let len = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    let text = &bytes[..len];
    (len >= 4 && text.iter().all(|&b| b == b' ' || b.is_ascii_graphic()))
        .then(|| String::from_utf8_lossy(text).into_owned())
}

// ---------------------------------------------------------------------------
// scan

#[derive(Serialize)]
struct ScanReport<'a> {
    game: &'a GameInfo,
    plugin_base: String,
    min_count: u64,
    max_count: u64,
    arrays: &'a [ArrayCandidate],
}

fn scan(
    process: &Process,
    game: &GameInfo,
    modules: &[Module],
    opts: &ScanOptions,
    top: usize,
    json: Option<&Path>,
) -> Result<()> {
    let module = find_module(modules, GAME_PLUGIN)
        .with_context(|| format!("{GAME_PLUGIN} is not loaded yet; wait for the main menu"))?;
    let pe = PeImage::read(process, module.base).ok();
    let section = |rva: u64| {
        pe.as_ref().and_then(|pe| pe.section_for_rva(rva)).map_or_else(|| "?".to_owned(), |s| s.name.clone())
    };

    println!(
        "Scanning writable memory of {GAME_PLUGIN} for object arrays ({}..={} elements)...",
        opts.min_count, opts.max_count
    );
    let started = Instant::now();
    let arrays = scan_object_arrays(process, module, opts);
    println!("Found {} arrays in {:.1} s.", arrays.len(), started.elapsed().as_secs_f64());
    if arrays.is_empty() {
        println!("No arrays found. Load a save (not just the main menu) and scan again.");
    } else {
        println!();
        println!("{:>9}  {:<26}  top vtables: rva (section) x count", "elements", "pair rva (section)");
        for array in arrays.iter().take(top) {
            let pairs: Vec<String> =
                array.pair_rvas.iter().map(|&rva| format!("{rva:#x} ({})", section(rva))).collect();
            let vtables: Vec<String> = array
                .vtables
                .iter()
                .take(4)
                .map(|v| format!("{:#x} ({}) x{}", v.rva, section(v.rva), v.count))
                .collect();
            println!("{:>9}  {:<26}  {}", array.count, pairs.join(", "), vtables.join(", "));
        }
        if arrays.len() > top {
            println!("... {} more (use --top to show them)", arrays.len() - top);
        }
    }

    if let Some(path) = json {
        let report = ScanReport {
            game,
            plugin_base: format!("{:#x}", module.base),
            min_count: opts.min_count,
            max_count: opts.max_count,
            arrays: &arrays,
        };
        write_json(path, &report)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// dump / element

fn dump(process: &Process, modules: &[Module], addr: u64, len: u64) -> Result<()> {
    let bytes =
        process.read_bytes(addr, len as usize).with_context(|| format!("reading {len:#x} bytes at {addr:#x}"))?;
    println!("{} ({len:#x} bytes)", describe_address(addr, modules));
    println!();
    for (i, line) in bytes.chunks(16).enumerate() {
        let hex: Vec<String> = line.iter().map(|b| format!("{b:02x}")).collect();
        let ascii: String =
            line.iter().map(|&b| if b == b' ' || b.is_ascii_graphic() { b as char } else { '.' }).collect();
        println!("{:#014x}  {:<47}  {ascii}", addr + (i * 16) as u64, hex.join(" "));
    }
    println!();
    println!("As 64-bit values:");
    for (i, chunk) in bytes.as_chunks::<8>().0.iter().enumerate() {
        let value = u64::from_le_bytes(*chunk);
        let (lo, hi) = (value as u32, (value >> 32) as u32);
        println!("  +{:#06x}  {value:#018x}  lo={lo:<10} hi={hi:<10} {}", i * 8, pointer_hint(value, modules));
    }
    Ok(())
}

fn element(process: &Process, modules: &[Module], pair: u64, index: u64, len: u64) -> Result<()> {
    let (begin, count) = read_pair(process, pair)?;
    ensure!(index < count, "index {index} is out of range; the array has {count} elements");
    let object = process.read_u64(begin + index * 8)?;
    println!("Array at {} has {count} elements; element {index} is {object:#x}.", describe_address(pair, modules));
    dump(process, modules, object, len)
}

fn column(
    process: &Process,
    modules: &[Module],
    pair: u64,
    offset: u64,
    kind: FieldType,
    first: u64,
    find: Option<u64>,
) -> Result<()> {
    let (begin, count) = read_pair(process, pair)?;
    let limit = if find.is_some() { count } else { first.min(count) };
    let pointers = process.read_bytes(begin, (limit * 8) as usize)?;
    println!("Array at {} has {count} elements; field +{offset:#x}:", describe_address(pair, modules));

    let mut matches = 0;
    for (index, chunk) in pointers.as_chunks::<8>().0.iter().enumerate() {
        let object = u64::from_le_bytes(*chunk);
        let Ok(bytes) = process.read_bytes(object + offset, kind.width()) else {
            println!("{index:>8}  {object:#014x}  unreadable");
            continue;
        };
        let value = kind.decode(&bytes);
        if find.is_some_and(|wanted| wanted != value) {
            continue;
        }
        matches += 1;
        println!("{index:>8}  {object:#014x}  {value}");
    }
    if let Some(wanted) = find {
        println!("{matches} element(s) have {wanted} at +{offset:#x}.");
    }
    Ok(())
}

/// Reads the (begin, end) pointer pair stored at `pair`; returns `begin` and the element count.
fn read_pair(process: &Process, pair: u64) -> Result<(u64, u64)> {
    let begin = process.read_u64(pair)?;
    let end = process.read_u64(pair + 8)?;
    ensure!(
        end > begin && (end - begin).is_multiple_of(8),
        "{pair:#x} does not hold a (begin, end) pointer pair ({begin:#x}, {end:#x})"
    );
    Ok((begin, (end - begin) / 8))
}

/// "module+0x..." for module addresses, plain hex otherwise.
fn describe_address(addr: u64, modules: &[Module]) -> String {
    match modules.iter().find(|m| m.contains(addr)) {
        Some(m) => format!("{}+{:#x}", m.name, addr - m.base),
        None => format!("{addr:#x}"),
    }
}

fn pointer_hint(value: u64, modules: &[Module]) -> String {
    if let Some(m) = modules.iter().find(|m| m.contains(value)) {
        format!("-> {}+{:#x}", m.name, value - m.base)
    } else if is_user_pointer(value) && value >= 0x100_0000 {
        "-> heap?".to_owned()
    } else {
        String::new()
    }
}

// ---------------------------------------------------------------------------
// helpers

fn find_module<'a>(modules: &'a [Module], name: &str) -> Option<&'a Module> {
    modules.iter().find(|m| m.name.eq_ignore_ascii_case(name))
}

/// Resolves "0x1234" or "module.dll+0x1234" to an absolute address.
fn resolve(expr: &str, modules: &[Module]) -> Result<u64> {
    match expr.split_once('+') {
        Some((name, offset)) => {
            let module = find_module(modules, name.trim()).with_context(|| format!("module {name} is not loaded"))?;
            Ok(module.base + parse_hex(offset)?)
        }
        None => parse_hex(expr),
    }
}

fn parse_hex(text: &str) -> Result<u64> {
    let text = text.trim();
    let digits = text.strip_prefix("0x").or_else(|| text.strip_prefix("0X")).unwrap_or(text);
    u64::from_str_radix(digits, 16).with_context(|| format!("not a hexadecimal number: {text}"))
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let text = serde_json::to_string_pretty(value)?;
    std::fs::write(path, text).with_context(|| format!("writing {}", path.display()))?;
    println!();
    println!("JSON report written to {}", path.display());
    Ok(())
}
