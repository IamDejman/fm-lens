//! Pictures from the graphics packs the user installed for the game: club logos, faces
//! and flags. A pack's folders hold `config.xml` files that map each picture file to
//! what it shows, e.g. `<record from="TCM1_728" to="graphics/pictures/club/728/logo"/>`
//! puts `TCM1_728.png` of that folder on the club with UID 728.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// What a picture shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Picture {
    /// A club's logo, by club UID.
    ClubLogo,
    /// A person's face, by player or staff UID.
    Face,
    /// A nation's flag, by nation UID.
    Flag,
    /// A competition's logo, by competition UID.
    CompetitionLogo,
}

impl Picture {
    /// The picture a mapping target like `graphics/pictures/club/728/logo` stands for, and its id.
    fn from_target(target: &str) -> Option<(Self, u32)> {
        let mut parts = target.trim_matches('/').split('/');
        if (parts.next()?, parts.next()?) != ("graphics", "pictures") {
            return None;
        }
        let (kind, id, what) = (parts.next()?, parts.next()?.parse().ok()?, parts.next()?);
        let picture = match (kind, what) {
            ("club", "logo") => Picture::ClubLogo,
            ("person", "portrait") => Picture::Face,
            ("nation", "flag") => Picture::Flag,
            ("comp", "logo") => Picture::CompetitionLogo,
            _ => return None,
        };
        Some((picture, id))
    }
}

/// Where the pictures of the installed graphics packs are.
#[derive(Debug, Default)]
pub struct GraphicsIndex {
    root: PathBuf,
    files: HashMap<(Picture, u32), PathBuf>,
}

/// How many pictures of each kind were found.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphicsCounts {
    pub club_logos: usize,
    pub faces: usize,
    pub flags: usize,
    pub competition_logos: usize,
}

/// The extensions picture files come with, in the order they are tried.
const EXTENSIONS: [&str; 3] = ["png", "jpg", "jpeg"];

impl GraphicsIndex {
    /// The graphics folder of Football Manager `edition` under the user's documents,
    /// e.g. `Documents\Sports Interactive\Football Manager 27\graphics`.
    pub fn default_root(documents: &Path, edition: u32) -> PathBuf {
        documents.join("Sports Interactive").join(format!("Football Manager {edition}")).join("graphics")
    }

    /// Reads every `config.xml` under `root`. A folder that cannot be read is skipped;
    /// a missing root gives an empty index.
    pub fn scan(root: &Path) -> Self {
        let mut index = Self { root: root.to_owned(), files: HashMap::new() };
        let mut folders = vec![root.to_owned()];
        while let Some(folder) = folders.pop() {
            let Ok(entries) = fs::read_dir(&folder) else {
                continue;
            };
            // The folder's files, by lower-case name: a mapping only counts when its file is here.
            let mut files: HashMap<String, String> = HashMap::new();
            for entry in entries.flatten() {
                if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                    folders.push(entry.path());
                } else if let Ok(name) = entry.file_name().into_string() {
                    files.insert(name.to_lowercase(), name);
                }
            }
            if let Some(config) = files.get("config.xml")
                && let Ok(text) = fs::read_to_string(folder.join(config))
            {
                index.add_config(&folder, &files, &text);
            }
        }
        index
    }

    /// Adds the mappings of the `config.xml` text of `folder`, whose files are `files`.
    fn add_config(&mut self, folder: &Path, files: &HashMap<String, String>, text: &str) {
        for (from, to) in records(text) {
            let Some(key) = Picture::from_target(to) else {
                continue;
            };
            let file = if from.contains(['/', '\\']) {
                // A file in a subfolder, e.g. `africa/alg`: look on disk.
                EXTENSIONS.iter().map(|ext| folder.join(format!("{from}.{ext}"))).find(|file| file.is_file())
            } else {
                let from = from.to_lowercase();
                EXTENSIONS.iter().find_map(|ext| files.get(&format!("{from}.{ext}"))).map(|name| folder.join(name))
            };
            if let Some(file) = file {
                // The first pack read wins, as a picture is usually in one pack only.
                self.files.entry(key).or_insert(file);
            }
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The file of a picture, if a pack has it.
    pub fn file(&self, picture: Picture, id: u32) -> Option<&Path> {
        self.files.get(&(picture, id)).map(PathBuf::as_path)
    }

    pub fn counts(&self) -> GraphicsCounts {
        let mut counts = GraphicsCounts::default();
        for (picture, _) in self.files.keys() {
            match picture {
                Picture::ClubLogo => counts.club_logos += 1,
                Picture::Face => counts.faces += 1,
                Picture::Flag => counts.flags += 1,
                Picture::CompetitionLogo => counts.competition_logos += 1,
            }
        }
        counts
    }
}

/// The `from` and `to` of every `<record from="…" to="…"/>` in a config file.
fn records(text: &str) -> impl Iterator<Item = (&str, &str)> {
    text.split("<record").skip(1).filter_map(|record| {
        let record = &record[..record.find('>')?];
        Some((attribute(record, "from")?, attribute(record, "to")?))
    })
}

/// The value of `name="…"` in the attributes of one tag.
fn attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let start = tag.find(&format!("{name}=\""))? + name.len() + 2;
    let end = start + tag[start..].find('"')?;
    Some(&tag[start..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG: &str = r#"<record>
        <boolean id="preload" value="false"/>
        <list id="maps">
            <!-- Generated by FM Graphics Configurator -->
            <record from="TCM1_728" to="graphics/pictures/club/728/logo"/>
            <record from="face_7458500" to="graphics/pictures/person/7458500/portrait"/>
            <record from="europe/tur" to="graphics/pictures/nation/765/flag"/>
            <record from="missing" to="graphics/pictures/club/1/logo"/>
            <record from="team" to="graphics/pictures/team/43457016/logo"/>
        </list>
    </record>"#;

    #[test]
    fn reads_records() {
        let found: Vec<(&str, &str)> = records(CONFIG).collect();
        assert_eq!(found[0], ("TCM1_728", "graphics/pictures/club/728/logo"));
        assert_eq!(found.len(), 5);
        assert_eq!(Picture::from_target("graphics/pictures/club/728/logo"), Some((Picture::ClubLogo, 728)));
        assert_eq!(Picture::from_target("graphics/pictures/person/7458500/portrait"), Some((Picture::Face, 7458500)));
        assert_eq!(Picture::from_target("graphics/pictures/team/43457016/logo"), None);
        assert_eq!(Picture::from_target("graphics/pictures/club/x/logo"), None);
    }

    #[test]
    fn scans_a_pack() {
        let root = std::env::temp_dir().join(format!("fmlibre-graphics-{}", std::process::id()));
        let pack = root.join("Some Pack").join("Clubs");
        fs::create_dir_all(&pack).expect("temp folder");
        fs::write(pack.join("config.xml"), CONFIG).expect("config");
        fs::create_dir_all(pack.join("europe")).expect("subfolder");
        for file in ["TCM1_728.png", "face_7458500.jpg", "europe/tur.png"] {
            fs::write(pack.join(file), b"picture").expect("picture");
        }
        let index = GraphicsIndex::scan(&root);
        assert_eq!(index.file(Picture::ClubLogo, 728), Some(pack.join("TCM1_728.png").as_path()));
        assert_eq!(index.file(Picture::Face, 7458500), Some(pack.join("face_7458500.jpg").as_path()));
        assert_eq!(
            index.file(Picture::Flag, 765),
            Some(pack.join("europe/tur.png").as_path()),
            "a file in a subfolder"
        );
        assert_eq!(index.file(Picture::ClubLogo, 1), None, "its file is missing");
        let counts = index.counts();
        assert_eq!((counts.club_logos, counts.faces, counts.flags), (1, 1, 1));
        fs::remove_dir_all(&root).expect("clean up");
        assert_eq!(GraphicsIndex::scan(&root).counts().club_logos, 0, "no folder, no pictures");
    }
}
