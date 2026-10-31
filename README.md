# FMLibreEditor

A free, open-source real-time editor for **Football Manager 27**, built Game Pass first.

> **Status: pre-alpha.** The app lists, searches, filters and sorts every player,
> member of staff and club of a running FM27 (Game Pass build), and shows their
> profiles: attributes, positions, personality, contracts, facilities, supporters
> and finances.
>
> Players, staff and clubs can be edited, from an Edit mode in their profiles:
> - **Players and staff:** abilities, attributes, positions, personality,
>   reputation, caps, and their contract's wage and end date.
> - **Clubs:** reputation, facilities and finances.
> - **How:** changes are reviewed before they are applied, and a Changes view
>   undoes them.
> - **Many at once:** a mass edit changes every player, member of staff or club the
>   list selects. It is previewed before it is applied and undone as one batch.
> - **Moving players:** a player can move to another club's senior team, on his
>   contract or new terms. Free agents, loans and players at your own club are
>   refused for now, and so is a club whose squad list has no room left (see
>   [the notes](docs/recon/fm27-gamepass-0.9.2355.md#squad-lists-and-moving-players-between-clubs)).
>
> The interface is in English and Turkish. Club logos, flags and faces come from the
> graphics packs installed in the game's graphics folder.

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
`ReadProcessMemory`. To edit, it writes values back with `WriteProcessMemory`, and
only into the game's heap. It never injects code, never patches the game's code and
never allocates memory in the game.

Before every write it checks four things:
- the object still belongs to the same person;
- the new value is one the field can take;
- the current value looks like that field's (otherwise the layout does not fit);
- the value reads back as written.

If any check fails, nothing changes.

## Repository layout

| Path | Contents |
|---|---|
| `crates/fmlibre-mem` | Windows process access: processes, modules, memory regions, PE headers, guarded writes |
| `crates/fmlibre-core` | Football Manager logic: game detection, calibration, decoders, editable fields |
| `crates/fmlibre-probe` | Command-line probe |
| `profiles/` | Object layouts per edition and addresses per game build |
| `app/` | Tauri 2 desktop app (React + TypeScript) |
| `docs/` | Roadmap and reverse-engineering notes |

## Building

Requirements: Windows 10/11, Rust stable (via [rustup](https://rustup.rs)),
Visual Studio Build Tools with the C++ workload, and Node.js 20+ for the app.

```powershell
cargo build --release -p fmlibre-probe
cd app; npm install; npm run tauri dev     # run the desktop app
npm run release                            # build target\release\FMLibreEditor.exe
```

`npm run release` builds a stand-alone `FMLibreEditor.exe` without an installer. It
needs the WebView2 runtime, which Windows 10 and 11 already have. There are no
published builds yet.

`npm run dev` in `app/` serves the interface in a plain browser with made-up sample
players, for working on the UI without the game.

The app reads graphics packs from
`Documents\Sports Interactive\Football Manager 27\graphics`. If FM keeps its user
data somewhere else, set the environment variable `FMLIBRE_GRAPHICS` to that
graphics folder before starting the app.

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
fmlibre-probe fields player                          # what the editor can change (also: staff)
fmlibre-probe get player 7458500                     # those fields' values for one player
fmlibre-probe set player 7458500 attribute.finishing 18 --shown   # change one: this writes to the game
fmlibre-probe move 13200568 1139 --restore           # move a player to a club and back: this writes too
fmlibre-probe scan                                   # find arrays of game objects in game_plugin.dll
fmlibre-probe refs 0x1a5a5396990 --span 0x3c8        # every pointer into an object (holders, lists, squads too)
fmlibre-probe dump game_plugin.dll+0x1000 --len 0x100
fmlibre-probe element game_plugin.dll+0x5681dc0 0    # follow an array and dump element 0
fmlibre-probe column game_plugin.dll+0x5681dc0 0x294 --find 7458500   # find a player by UID
fmlibre-probe find "18 Temmuz 2026"                  # search memory for text (UTF-8 and UTF-16)
fmlibre-probe find "c7 80 ea 07" --as hex --module game_plugin.dll
```

Addresses and lengths are hexadecimal. Add `--json report.json` to `info` or `scan`
to save the results. `calibrate --scan` ignores the build profile and finds the
arrays the way it would on an unknown build.

Only `set` and `move` write to the game. `set` changes one field after the checks
above. Values are as stored: attributes run 0–100, or 1–20 with `--shown`. `move`
moves a player to a club's senior team. With `--restore`, either one puts the old
values back straight away, to test without changing the save. If Windows denies
access, run the probe from an administrator terminal.

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
