use std::path::{Path, PathBuf};

use fmlibre_mem::Process;
use serde::Serialize;

/// Executable name of Football Manager on Windows (Steam, Epic and Game Pass alike).
pub const GAME_EXE: &str = "fm.exe";

/// Native module that holds the game database and simulation.
pub const GAME_PLUGIN: &str = "game_plugin.dll";

/// Where the running copy of the game was installed from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Storefront {
    GamePass,
    Steam,
    Epic,
    Unknown,
}

impl Storefront {
    /// Guesses the storefront from the package identity and the install path.
    pub fn detect(exe_path: &Path, package_full_name: Option<&str>) -> Self {
        let path = exe_path.to_string_lossy().to_ascii_lowercase();
        let gdk_config = exe_path.parent().is_some_and(|dir| dir.join("MicrosoftGame.config").exists());

        if package_full_name.is_some() || gdk_config || path.contains(r"\windowsapps\") || path.contains(r"\xboxgames\")
        {
            Storefront::GamePass
        } else if path.contains(r"\steamapps\") {
            Storefront::Steam
        } else if path.contains(r"\epic games\") {
            Storefront::Epic
        } else {
            Storefront::Unknown
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Storefront::GamePass => "Game Pass / Microsoft Store",
            Storefront::Steam => "Steam",
            Storefront::Epic => "Epic Games Store",
            Storefront::Unknown => "unknown",
        }
    }
}

/// What can be told about a running game process before touching its data.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameInfo {
    pub pid: u32,
    pub exe_path: PathBuf,
    pub storefront: Storefront,
    /// Football Manager edition, e.g. 27, when the package name or path reveals it.
    pub edition: Option<u32>,
    pub package_full_name: Option<String>,
    /// Package version of a Game Pass install, e.g. "0.9.2355.0".
    pub package_version: Option<String>,
}

impl GameInfo {
    pub fn inspect(process: &Process) -> fmlibre_mem::Result<Self> {
        let exe_path = process.image_path()?;
        let package_full_name = process.package_full_name()?;
        let storefront = Storefront::detect(&exe_path, package_full_name.as_deref());

        // Package full names look like "Name_Version_Arch_ResourceId_PublisherId".
        let package_version = package_full_name.as_deref().and_then(|name| name.split('_').nth(1)).map(str::to_owned);
        let edition = package_full_name
            .as_deref()
            .and_then(|name| number_after(name, "FootballManager"))
            .or_else(|| number_after(&exe_path.to_string_lossy(), "Football Manager "));

        Ok(Self { pid: process.pid(), exe_path, storefront, edition, package_full_name, package_version })
    }
}

/// The number right after `marker`, e.g. 27 in "SportsInteractive.FootballManager27_...".
fn number_after(text: &str, marker: &str) -> Option<u32> {
    let start = text.find(marker)? + marker.len();
    let digits: String = text[start..].chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edition_from_package_and_path() {
        let package = "SportsInteractive.FootballManager27_0.9.2355.0_x64__5w3tn6tb6stnm";
        assert_eq!(number_after(package, "FootballManager"), Some(27));
        let steam = r"C:\Steam\steamapps\common\Football Manager 27\fm.exe";
        assert_eq!(number_after(steam, "Football Manager "), Some(27));
        assert_eq!(number_after("fm.exe", "Football Manager "), None);
    }

    #[test]
    fn storefront_from_path() {
        let steam = Path::new(r"C:\Steam\steamapps\common\Football Manager 27\fm.exe");
        assert_eq!(Storefront::detect(steam, None), Storefront::Steam);
        let epic = Path::new(r"D:\Epic Games\FootballManager27\fm.exe");
        assert_eq!(Storefront::detect(epic, None), Storefront::Epic);
        let store = Path::new(
            r"C:\Program Files\WindowsApps\SportsInteractive.FootballManager27_0.9.2355.0_x64__5w3tn6tb6stnm\fm.exe",
        );
        assert_eq!(Storefront::detect(store, None), Storefront::GamePass);
    }
}
