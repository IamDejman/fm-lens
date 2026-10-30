//! `fmlibre-probe`: a read-only look inside a running Football Manager process.
//!
//! It never writes to the game. Use it to check that FMLibreEditor can attach to
//! a given build (Steam, Epic, Game Pass) and to map where the game keeps its data.

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Instant;

use anyhow::{Context, Result, anyhow, ensure};
use clap::{Parser, Subcommand, ValueEnum};
use fmlibre_core::{
    ArrayCandidate, ArraySource, GAME_EXE, GAME_PLUGIN, GameInfo, PlayerIndex, ScanOptions, Session, SessionError,
    find_game, scan_object_arrays,
};
use fmlibre_mem::{Module, PeImage, Process, is_current_process_elevated, is_user_pointer, list_modules, regions};
use serde::Serialize;

const KEY_MODULES: [&str; 4] = [GAME_EXE, "UnityPlayer.dll", "GameAssembly.dll", GAME_PLUGIN];

#[derive(Parser)]
#[command(
    name = "fmlibre-probe",
    version,
    about = "Read-only probe for a running Football Manager 27 process.",
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
    /// List players, best first, optionally only those matching TEXT.
    Players {
        /// Words to look for in player names (accents and case are ignored), or a UID.
        text: Option<String>,
        /// How many players to print.
        #[arg(long, default_value_t = 25)]
        limit: usize,
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
    let elevated = is_current_process_elevated();
    let process = attach(cli.pid, elevated)?;
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
        Command::Players { text, limit } => {
            players(&Session::connect(process, ArraySource::ProfileFirst)?, text.as_deref(), limit)
        }
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
    }
}

fn attach(pid: Option<u32>, elevated: bool) -> Result<Process> {
    let pid = find_game(pid).map_err(|err| match err {
        SessionError::SeveralRunning(_) => anyhow!("{err} with --pid"),
        err => anyhow!(err),
    })?;
    Process::open_read(pid).map_err(|err| {
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

fn players(session: &Session, text: Option<&str>, limit: usize) -> Result<()> {
    let started = Instant::now();
    let index = PlayerIndex::new(session.players()?);
    let elapsed = started.elapsed();
    let hits = index.search(text.unwrap_or(""));
    println!(
        "Read {} players in {:.1} s; {} shown of {} matching.",
        index.len(),
        elapsed.as_secs_f64(),
        hits.len().min(limit),
        hits.len()
    );
    println!();
    println!(
        "{:>10}  {:<28}  {:<10}  {:<16}  {:<24}  {:>3}  {:>4}",
        "UID", "Name", "Born", "Nation", "Club", "CA", "PA"
    );
    for p in hits.iter().take(limit) {
        let born = p.date_of_birth.map_or_else(String::new, |d| format!("{:04}-{:02}-{:02}", d.year, d.month, d.day));
        println!(
            "{:>10}  {:<28}  {:<10}  {:<16}  {:<24}  {:>3}  {:>4}",
            p.uid,
            clip(&p.name, 28),
            born,
            clip(p.nation.as_deref().unwrap_or("-"), 16),
            clip(p.club.as_deref().unwrap_or("-"), 24),
            p.current_ability,
            p.potential_ability
        );
    }
    Ok(())
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
    for (i, chunk) in bytes.chunks_exact(8).enumerate() {
        let value = u64::from_le_bytes(chunk.try_into().expect("8 bytes"));
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
    for (index, chunk) in pointers.chunks_exact(8).enumerate() {
        let object = u64::from_le_bytes(chunk.try_into().expect("8 bytes"));
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
        end > begin && (end - begin) % 8 == 0,
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
