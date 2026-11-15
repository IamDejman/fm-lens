//! Club names that last. Whenever a save is loaded, the game names each club from its own database by the club's UID,
//! so a name written only to memory is gone on the next load. Name change files (`.lnc`) in the game's database folder
//! change those names when the game starts, for every save. FM Lens keeps one such file of its own, with the names it
//! gave each club.
//!
//! A line of the file is a command, the club's UID, the name and the language it is for, apart by tabs, each but the
//! UID in quotes; an empty language is every language. The file is UTF-8, starting with a byte order mark. Lines
//! starting with `#` are not read by the game: in them FM Lens notes the names the game gives a club without the file,
//! so a club can be given them back.

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

/// The file FM Lens keeps, in the game's folder of name change files for every language.
const FILE_NAME: &str = "fm lens club names.lnc";

const LONG: &str = "CLUB_LONG_NAME_CHANGE";
const SHORT: &str = "CLUB_SHORT_NAME_CHANGE";
const WAS_LONG: &str = "CLUB_LONG_NAME_WAS";
const WAS_SHORT: &str = "CLUB_SHORT_NAME_WAS";

const BOM: char = '\u{feff}';

/// The names the file gives a club, where it gives one, and the names the game gives it without the file, where they
/// are known.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct KeptNames {
    pub name: Option<String>,
    pub short_name: Option<String>,
    pub was_name: Option<String>,
    pub was_short_name: Option<String>,
}

/// FM Lens's file of club names, in the folder the game reads name change files from.
#[derive(Debug, Clone)]
pub struct NameFile {
    path: PathBuf,
}

impl NameFile {
    /// The file for the game whose executable is `exe_path`, where its folder of name change files is found: on macOS,
    /// in the database the game plug-in holds, in the folder of the newest database there.
    pub fn find(exe_path: &Path) -> Option<Self> {
        let app = exe_path.ancestors().find(|dir| dir.file_name().is_some_and(|name| name == "fm.app"))?;
        let databases = app.join("Contents/PlugIns/game_plugin.bundle/Contents/Resources/shared/data/database/db");
        let folder = newest_database(&databases)?.join("lnc/all");
        folder.is_dir().then(|| Self { path: folder.join(FILE_NAME) })
    }

    /// The names the file gives the club `uid`.
    pub fn kept(&self, uid: u32) -> io::Result<Option<KeptNames>> {
        Ok(self.read()?.remove(&uid))
    }

    /// Has the file give the club `uid` the names `names`, or none when there are none.
    pub fn keep(&self, uid: u32, names: Option<&KeptNames>) -> io::Result<()> {
        let mut clubs = self.read()?;
        match names.filter(|names| names.name.is_some() || names.short_name.is_some()) {
            Some(names) => clubs.insert(uid, names.clone()),
            None => clubs.remove(&uid),
        };
        if clubs.is_empty() {
            return match std::fs::remove_file(&self.path) {
                Err(err) if err.kind() != io::ErrorKind::NotFound => Err(err),
                _ => Ok(()),
            };
        }
        // Written beside it and moved over it, so the game never reads half a file.
        let mut part = self.path.clone().into_os_string();
        part.push(".part");
        std::fs::write(&part, render(&clubs))?;
        std::fs::rename(&part, &self.path)
    }

    fn read(&self) -> io::Result<BTreeMap<u32, KeptNames>> {
        match std::fs::read_to_string(&self.path) {
            Ok(text) => Ok(parse(&text)),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(err) => Err(err),
        }
    }
}

/// The folder of the newest database in `databases`: the highest numbered one with a game database in it, such as
/// `2700`, which holds `2700_fm`.
fn newest_database(databases: &Path) -> Option<PathBuf> {
    std::fs::read_dir(databases)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name();
            let version: u32 = name.to_str()?.parse().ok()?;
            entry.path().join(format!("{version}_fm")).is_dir().then(|| (version, entry.path()))
        })
        .max_by_key(|&(version, _)| version)
        .map(|(_, path)| path)
}

/// The names the file's text gives each club. Lines that are not FM Lens's are left out.
fn parse(text: &str) -> BTreeMap<u32, KeptNames> {
    let mut clubs: BTreeMap<u32, KeptNames> = BTreeMap::new();
    for line in text.trim_start_matches(BOM).lines() {
        let line = line.strip_prefix("# ").unwrap_or(line);
        let mut fields = line.split('\t').map(|field| field.trim().trim_matches('"'));
        let (Some(command), Some(uid), Some(name)) = (fields.next(), fields.next(), fields.next()) else {
            continue;
        };
        let Ok(uid) = uid.parse() else {
            continue;
        };
        let names = clubs.entry(uid).or_default();
        match command {
            LONG => names.name = Some(name.to_owned()),
            SHORT => names.short_name = Some(name.to_owned()),
            WAS_LONG => names.was_name = Some(name.to_owned()),
            WAS_SHORT => names.was_short_name = Some(name.to_owned()),
            _ => {}
        }
    }
    clubs.retain(|_, names| names.name.is_some() || names.short_name.is_some());
    clubs
}

/// The file's text for `clubs`.
fn render(clubs: &BTreeMap<u32, KeptNames>) -> String {
    let mut text = format!("{BOM}# Club names from FM Lens. To take a club out, use its original names in FM Lens.\n");
    for (uid, names) in clubs {
        for (command, name) in [(LONG, &names.name), (SHORT, &names.short_name)] {
            if let Some(name) = name {
                text.push_str(&format!("\"{command}\"\t{uid}\t\"{name}\"\t\"\"\n"));
            }
        }
        for (command, name, kept) in
            [(WAS_LONG, &names.was_name, &names.name), (WAS_SHORT, &names.was_short_name, &names.short_name)]
        {
            if let (Some(name), Some(_)) = (name, kept) {
                text.push_str(&format!("# \"{command}\"\t{uid}\t\"{name}\"\n"));
            }
        }
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(name: Option<&str>, short_name: Option<&str>) -> KeptNames {
        KeptNames { name: name.map(str::to_owned), short_name: short_name.map(str::to_owned), ..KeptNames::default() }
    }

    #[test]
    fn the_file_is_written_as_the_game_reads_name_changes() {
        let clubs =
            BTreeMap::from([(5103819, names(Some("Methil Rovers"), Some("Methil"))), (7, names(None, Some("Köln")))]);
        let text = render(&clubs);
        assert!(text.starts_with('\u{feff}'));
        let lines: Vec<&str> = text.lines().skip(1).collect();
        assert_eq!(
            lines,
            [
                "\"CLUB_SHORT_NAME_CHANGE\"\t7\t\"Köln\"\t\"\"",
                "\"CLUB_LONG_NAME_CHANGE\"\t5103819\t\"Methil Rovers\"\t\"\"",
                "\"CLUB_SHORT_NAME_CHANGE\"\t5103819\t\"Methil\"\t\"\"",
            ]
        );
        assert_eq!(parse(&text), clubs);
    }

    #[test]
    fn the_names_the_game_gives_are_noted_where_the_game_does_not_read_them() {
        let kept = KeptNames { was_name: Some("Ipswich Wanderers".into()), ..names(Some("Leven Athletic"), None) };
        let text = render(&BTreeMap::from([(5103819, kept.clone())]));
        assert_eq!(
            text.lines().skip(1).collect::<Vec<_>>(),
            [
                "\"CLUB_LONG_NAME_CHANGE\"\t5103819\t\"Leven Athletic\"\t\"\"",
                "# \"CLUB_LONG_NAME_WAS\"\t5103819\t\"Ipswich Wanderers\"",
            ]
        );
        assert_eq!(parse(&text), BTreeMap::from([(5103819, kept)]));
    }

    #[test]
    fn other_lines_are_left_out() {
        let text = "\u{feff}# a comment\n\n\"COMP_LONG_NAME_CHANGE\"\t12\t\"Cup\"\t\"\"\n\"CLUB_LONG_NAME_CHANGE\"\tx\t\"A\"\n\
                    \"CLUB_SHORT_NAME_CHANGE\"\t9\t\"Nine\"\n";
        assert_eq!(parse(text), BTreeMap::from([(9, names(None, Some("Nine")))]));
    }

    #[test]
    fn the_file_is_kept_up_to_date_and_gone_when_empty() {
        let dir = std::env::temp_dir().join(format!("fmlens-name-file-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = NameFile { path: dir.join(FILE_NAME) };
        assert_eq!(file.kept(1).unwrap(), None);
        file.keep(1, Some(&names(Some("One"), None))).unwrap();
        file.keep(2, Some(&names(None, Some("Two")))).unwrap();
        assert_eq!(file.kept(1).unwrap(), Some(names(Some("One"), None)));
        file.keep(1, None).unwrap();
        assert_eq!(file.kept(1).unwrap(), None);
        assert_eq!(file.kept(2).unwrap(), Some(names(None, Some("Two"))));
        file.keep(2, Some(&KeptNames::default())).unwrap();
        assert!(!file.path.exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_folder_is_in_the_newest_database() {
        let root = std::env::temp_dir().join(format!("fmlens-name-folder-{}", std::process::id()));
        let app = root.join("Football Manager 27/fm.app");
        let databases = app.join("Contents/PlugIns/game_plugin.bundle/Contents/Resources/shared/data/database/db");
        for folder in ["2600/2600_fm/x", "2700/2700_fm", "2700/lnc/all", "2800/other"] {
            std::fs::create_dir_all(databases.join(folder)).unwrap();
        }
        let exe = app.join("Contents/MacOS/Football Manager 27");
        let file = NameFile::find(&exe).unwrap();
        assert_eq!(file.path, databases.join("2700/lnc/all").join(FILE_NAME));
        assert!(NameFile::find(&root.join("fm.exe")).is_none());
        std::fs::remove_dir_all(&root).unwrap();
    }
}
