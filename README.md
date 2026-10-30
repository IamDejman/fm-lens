# FMLibreEditor

A free, open-source real-time editor for **Football Manager 27**, built Game Pass first.

> **Status: pre-alpha, Phase 3.** Nothing here edits the game yet. The app lists and
> searches every player, member of staff and club of a running FM27 (Game Pass
> build) and shows their profiles (attributes, positions, personality, contracts,
> facilities, supporters, finances), read-only.

## Goals

- Attach to a running FM27 and edit players, staff and clubs live, in the spirit of
  FMRTE and FM Live Editor, but free and open source.
- First-class support for the **Game Pass / Microsoft Store** build, then Steam and Epic.
- A modern interface that feels like FM: attribute colours, a pitch position map,
  faces and logos from your installed graphics packs, mass editing with a preview,
  and an undo history.
- Survive game patches: find the game's data again automatically, and fall back to
  read-only whenever something does not check out.

## How it works

FM27's interface is Unity (IL2CPP), but the game itself, its database and
simulation, lives in a native, anti-tamper protected module: `game_plugin.dll`.
FMLibreEditor runs as a separate process and reads that module's heap data with
`ReadProcessMemory` (writing comes later). It never injects code and never patches
the game's code.

## Repository layout

| Path | Contents |
|---|---|
| `crates/fmlibre-mem` | Windows process access: processes, modules, memory regions, PE headers |
| `crates/fmlibre-core` | Football Manager logic: game detection, calibration, decoders, players |
| `crates/fmlibre-probe` | Read-only command-line probe |
| `profiles/` | Object layouts per edition and addresses per game build |
| `app/` | Tauri 2 desktop app (React + TypeScript) |
| `docs/` | Roadmap and reverse-engineering notes |

## Building

Requirements: Windows 10/11, Rust stable (via [rustup](https://rustup.rs)),
Visual Studio Build Tools with the C++ workload, and Node.js 20+ for the app.

```powershell
cargo build --release -p fmlibre-probe
cd app; npm install; npm run tauri dev     # run the desktop app
```

`npm run dev` in `app/` serves the interface in a plain browser with made-up sample
players, for working on the UI without the game.

## Using the probe

Start FM27, load a save, then run:

```powershell
fmlibre-probe info                                   # process, storefront, modules, game_plugin.dll layout
fmlibre-probe calibrate                              # identify the build and locate players, staff, clubs
fmlibre-probe players "arda guler"                   # search players (accents ignored), best first
fmlibre-probe players --position st --max-age 20 --min-pa 170 --sort pa   # wonderkid strikers
fmlibre-probe player 7458500                         # everything read for one player
fmlibre-probe staff arteta                           # search staff; staff-member <id> for details
fmlibre-probe clubs tottenham                        # search clubs; club <uid> for details
fmlibre-probe scan                                   # find arrays of game objects in game_plugin.dll
fmlibre-probe dump game_plugin.dll+0x1000 --len 0x100
fmlibre-probe element game_plugin.dll+0x5681dc0 0    # follow an array and dump element 0
fmlibre-probe column game_plugin.dll+0x5681dc0 0x294 --find 7458500   # find a player by UID
fmlibre-probe find "18 Temmuz 2026"                  # search memory for text (UTF-8 and UTF-16)
fmlibre-probe find "c7 80 ea 07" --as hex --module game_plugin.dll
```

Addresses and lengths are hexadecimal. Add `--json report.json` to `info` or `scan`
to save the results. `calibrate --scan` ignores the build profile and finds the
arrays the way it would on an unknown build. The probe only reads memory. If
Windows denies access, run it from an administrator terminal.

## Safety

Use FMLibreEditor only with offline, single-player saves, and back up your saves
before editing. FMLibreEditor is not affiliated with or endorsed by Sports
Interactive or SEGA.

## Acknowledgements

FM27 memory-layout leads come from two GPL-3.0 projects:
[fm-editor](https://github.com/barak14/fm-editor) by barak14 and
[FM27€0](https://sortitoutsi.net/content/78059/fm27eur0-v100-live-editor-for-fm27)
by Anze Alexander.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
