//! The bridge library that Football Manager loads on macOS so the app can reach its memory
//! (see `fmlens_core::bridge_setup`). Windows needs no setup: there `status` is always `None`,
//! and the app only puts the library it carries where the game can load it for the game's own actions.

use serde::Serialize;

use crate::Failure;

/// How far the bridge is set up.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeInfo {
    /// Whether starting the game from Steam loads the bridge.
    ready: bool,
    installed: bool,
    /// The launch option that loads the bridge, to set in Steam by hand.
    launch_option: String,
    steam_running: bool,
    /// FM27's launch options in each Steam account on this Mac.
    accounts: Vec<BridgeAccount>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeAccount {
    /// The number of the account's folder in Steam's user data.
    id: String,
    launch_options: Option<String>,
    loads_bridge: bool,
}

#[cfg(target_os = "macos")]
mod imp {
    use std::path::PathBuf;

    use fmlens_core::bridge_setup::{self, BRIDGE_FILE, BridgeStatus, LAUNCHER_FILE, Places};
    use tauri::{AppHandle, Manager};

    use super::{BridgeAccount, BridgeInfo};
    use crate::Failure;

    impl From<BridgeStatus> for BridgeInfo {
        fn from(status: BridgeStatus) -> Self {
            let accounts = status
                .accounts
                .iter()
                .map(|account| BridgeAccount {
                    // userdata/<id>/config/localconfig.vdf
                    id: account
                        .config
                        .ancestors()
                        .nth(2)
                        .and_then(|dir| dir.file_name())
                        .map(|id| id.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                    launch_options: account.launch_options.clone(),
                    loads_bridge: account.loads_bridge,
                })
                .collect();
            BridgeInfo {
                ready: status.ready(),
                installed: status.installed,
                launch_option: status.launch_option,
                steam_running: status.steam_running,
                accounts,
            }
        }
    }

    pub fn places(app: &AppHandle) -> Result<Places, Failure> {
        let home = app.path().home_dir().map_err(|err| Failure::new("app.internal", err.to_string()))?;
        Ok(Places::of(&home))
    }

    /// The folder with the bridge and its launcher that came with the app: its resources once
    /// bundled, the executable's folder while developing.
    fn files(app: &AppHandle) -> PathBuf {
        let bundled = app.path().resource_dir().ok();
        let beside = std::env::current_exe().ok().and_then(|exe| Some(exe.parent()?.to_owned()));
        let complete = |dir: &PathBuf| dir.join(BRIDGE_FILE).is_file() && dir.join(LAUNCHER_FILE).is_file();
        [bundled.clone(), beside].into_iter().flatten().find(complete).or(bundled).unwrap_or_default()
    }

    pub fn status(app: &AppHandle) -> Option<BridgeInfo> {
        places(app).ok().map(|places| bridge_setup::status(&places).into())
    }

    pub fn set_up(app: &AppHandle) -> Result<BridgeInfo, Failure> {
        let places = places(app)?;
        bridge_setup::set_up(&places, &files(app)).map(Into::into).map_err(|err| Failure::coded(&err))
    }

    pub fn remove(app: &AppHandle) -> Result<BridgeInfo, Failure> {
        let places = places(app)?;
        bridge_setup::remove(&places).map(Into::into).map_err(|err| Failure::coded(&err))
    }

    /// The installed bridge and launcher become the ones in the app's bundle, where they differ (see
    /// `bridge_setup::refresh`). Only for the app run from its bundle: a development build leaves the installed ones
    /// alone. Failing only means the old ones stay, until the bridge is set up again.
    pub fn refresh(app: &AppHandle) {
        let exe = std::env::current_exe().ok();
        if cfg!(debug_assertions) || exe.as_deref().and_then(crate::app_bundle).is_none() {
            return;
        }
        if let (Ok(places), Ok(bundled)) = (places(app), app.path().resource_dir()) {
            let _ = bridge_setup::refresh(&places, &bundled);
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use tauri::AppHandle;

    use super::BridgeInfo;
    use crate::Failure;

    pub fn status(_: &AppHandle) -> Option<BridgeInfo> {
        None
    }

    pub fn set_up(_: &AppHandle) -> Result<BridgeInfo, Failure> {
        Err(Failure::new("bridge.notNeeded", "Only macOS needs the bridge"))
    }

    pub fn remove(app: &AppHandle) -> Result<BridgeInfo, Failure> {
        set_up(app)
    }

    /// Windows: puts the bridge library the app carries in the app's local data folder, where the game can load it
    /// for each of its own actions, and has the editor use it. Without one the editor looks beside its executable,
    /// as while developing.
    #[cfg(windows)]
    pub fn refresh(app: &AppHandle) {
        #[cfg(fmlens_bridge)]
        {
            use tauri::Manager;

            const LIBRARY: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/fmlens_bridge.dll"));
            let placed = app.path().app_local_data_dir().ok().and_then(|folder| place(&folder.join("bridge"), LIBRARY));
            if let Some(path) = placed {
                fmlens_mem::bridge::set_library(path);
            }
        }
        #[cfg(not(fmlens_bridge))]
        let _ = app;
    }

    #[cfg(not(windows))]
    pub fn refresh(_: &AppHandle) {}

    /// The library `bytes` in `folder`, under a name of its own content, written there unless it already is. The
    /// libraries earlier versions of the app left there go (see `tidy`).
    #[cfg(all(windows, fmlens_bridge))]
    fn place(folder: &std::path::Path, bytes: &[u8]) -> Option<std::path::PathBuf> {
        use std::hash::{DefaultHasher, Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        bytes.hash(&mut hasher);
        let path = folder.join(format!("fmlens_bridge-{:016x}.dll", hasher.finish()));
        if !std::fs::read(&path).is_ok_and(|on_disk| on_disk == bytes) {
            std::fs::create_dir_all(folder).ok()?;
            let partial = folder.join(format!("fmlens_bridge-{}.partial", std::process::id()));
            std::fs::write(&partial, bytes).ok()?;
            std::fs::rename(&partial, &path).ok()?;
        }
        tidy(folder, &path);
        Some(path)
    }

    /// Removes every other bridge library, or part-written one, in `folder` but `keep`. One the game still has loaded
    /// cannot be removed, and stays until a later start.
    #[cfg(all(windows, fmlens_bridge))]
    fn tidy(folder: &std::path::Path, keep: &std::path::Path) {
        let Ok(entries) = std::fs::read_dir(folder) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path != keep && entry.file_name().to_string_lossy().starts_with("fmlens_bridge-") {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}

/// The bridge's state on macOS; `None` elsewhere, where the app needs no bridge.
pub fn status(app: &tauri::AppHandle) -> Option<BridgeInfo> {
    imp::status(app)
}

/// macOS: after an update of the app, puts the bridge it came with in place of the one installed, which the game then
/// loads the next time it starts. Nothing elsewhere, or while the bridge is not set up.
pub fn refresh(app: &tauri::AppHandle) {
    imp::refresh(app);
}

/// The bridge's state on macOS, read again, e.g. after setting it up failed halfway.
#[tauri::command]
pub async fn bridge_status(app: tauri::AppHandle) -> Option<BridgeInfo> {
    status(&app)
}

/// Installs the bridge and adds it to FM27's Steam launch options. Steam must not be running.
#[tauri::command]
pub async fn set_up_bridge(app: tauri::AppHandle) -> Result<BridgeInfo, Failure> {
    tauri::async_runtime::spawn_blocking(move || imp::set_up(&app)).await?
}

/// Takes the bridge out of FM27's Steam launch options and removes it. Steam must not be running.
#[tauri::command]
pub async fn remove_bridge(app: tauri::AppHandle) -> Result<BridgeInfo, Failure> {
    tauri::async_runtime::spawn_blocking(move || imp::remove(&app)).await?
}
