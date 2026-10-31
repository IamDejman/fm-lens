# FMLibreEditor

A free, open-source real-time editor for **Football Manager 27** on Windows, for both the
Game Pass and the Steam build, and on macOS, for the Steam build.

## Download / İndir

### **[⬇ FMLibreEditor-Setup.exe](https://github.com/tozmoz/FMLibreEditor/releases/latest/download/FMLibreEditor-Setup.exe)**

Windows 10 or 11, with Football Manager 27 from Xbox / Game Pass or Steam. There is also a
[portable zip](https://github.com/tozmoz/FMLibreEditor/releases/latest/download/FMLibreEditor-portable.zip)
that needs no installation.

- **Step by step, with pictures:** [English](docs/INSTALL.md) · [Türkçe](docs/KURULUM.md)
- **Windows warning:** Windows may say "Windows protected your PC", because the program is
  not signed yet. Choose **More info**, then **Run anyway**.

> **Status: pre-alpha.** The app lists, searches, filters and sorts every player,
> member of staff and club of a running FM27 (Game Pass or Steam build), and shows
> their profiles: attributes, positions, personality, contracts, facilities,
> supporters and finances.
>
> Players, staff and clubs can be edited, from an Edit mode in their profiles:
> - **Players and staff:** abilities, attributes, positions, personality,
>   reputation, caps, and their contract's wage and end date.
> - **Players only:** squad number, squad status, transfer and loan listing,
>   energy, match sharpness and morale. Injuries can be healed.
> - **Clubs:** reputation, facilities and finances. The club's squad tab lists each
>   team's players with their fitness and morale. It sets the captain and
>   vice-captain, and heals, inspires or refreshes a whole team at once.
> - **How:** changes are reviewed before they are applied, and a Changes view
>   undoes them.
> - **Many at once:** a mass edit changes every player, member of staff or club the
>   list selects. It is previewed before it is applied and undone as one batch.
> - **Moving players:** a player can move to another club's senior team, on his
>   contract or new terms, or swap clubs with another player. Free agents, loans
>   and players at your own club are refused for now, and so is a club whose squad
>   list has no room left (see
>   [the notes](docs/recon/fm27-gamepass-0.9.2355.md#squad-lists-and-moving-players-between-clubs)).
>
> The game's screens show a change once the game moves on: press Continue in the
> game.
>
> The interface is in English and Turkish. Club logos, flags and faces come from the
> graphics packs installed in the game's graphics folder.
>
> **macOS (Steam build):** the app and the probe attach to the game through the bridge
> described below, without turning System Integrity Protection off, with the Mac build's
> own object layout. Reading and editing were checked on a Mac save; moving a player is
> refused there unless the new club's squad list has room already.

## Goals

- Attach to a running FM27 and edit players, staff and clubs live, in the spirit of
  FMRTE and FM Live Editor, but free and open source.
- First-class support for the **Game Pass / Microsoft Store** and **Steam** builds; Epic
  later. The **Steam build on macOS** too.
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
only into the game's heap. It never patches the game's code and never allocates
memory in the game. On Windows it puts no code of its own in the game either; on macOS
the game loads one small library of ours, the bridge (see [On macOS](#on-macos)).

Before every write it checks four things:
- the object still belongs to the same person;
- the new value is one the field can take;
- the current value looks like that field's (otherwise the layout does not fit);
- the value reads back as written.

If any check fails, nothing changes.

### On macOS

macOS lets no app read another app's memory unless the other app allows debugging, and
Football Manager does not: it is signed with Apple's hardened runtime. Unless System
Integrity Protection is turned off, macOS lets no other app attach to it. What the game
does allow is loading extra libraries named in `DYLD_INSERT_LIBRARIES` (Steam's overlay uses
the same door), so FMLibreEditor comes with a small one, the bridge (`crates/fmlibre-bridge`).

Steam on macOS runs a launch option as a program, with the game among its arguments, so the
launch option names a small launcher, `fmlibre-launch`, that comes with the bridge. The
launcher puts the bridge in `DYLD_INSERT_LIBRARIES` (in front of the libraries Steam names
there) and then turns into the game, so Steam keeps following the process it started. The
bridge hooks nothing, patches nothing and reads none of the game's data. It only answers the editor of the
same user with the game's task port, macOS's handle to a process's memory. From there the
editor works as it does on Windows: it reads with `mach_vm_read_overwrite`, writes with
`mach_vm_write` into the game's heap only, and makes the same four checks before every write.

The connect panel of the app sets the bridge up (**Set up the bridge**) or takes it out
again. Setting up copies the bridge and the launcher to
`~/Library/Application Support/FMLibreEditor/` and puts the launcher in front of FM27's
launch options in Steam, which only works while Steam is closed; Steam keeps the launch
options to itself while it runs. With Steam open, set the launch option yourself: right-click
Football Manager 27 in Steam, then **Properties › General › Launch Options**, and enter

```text
'/Users/<you>/Library/Application Support/FMLibreEditor/fmlibre-launch' %command%
```

The panel shows the line with your own folder in it. Launch options you already have stay,
behind the launcher; another tool's launcher among them is started in turn.

> **Before you delete these files by hand,** take the launch option out: Steam cannot start
> the game through a launcher that is not there. **Remove the bridge** in the app does both,
> in the right order. Without the bridge library, the launcher starts the game as it is.

## Repository layout

| Path | Contents |
|---|---|
| `crates/fmlibre-mem` | Process access on Windows and macOS: processes, modules, memory regions, PE and Mach-O headers, guarded writes |
| `crates/fmlibre-bridge` | macOS: the library the game loads to hand its memory to the editor, and the launcher Steam starts the game through |
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
needs the WebView2 runtime, which Windows 10 and 11 already have.

### Releasing

1. **Bump the version** in three places:
   - `version` in the root `Cargo.toml` (`[workspace.package]`);
   - `app/package.json`;
   - `app/src-tauri/tauri.conf.json`.

   Commit the bump.
2. **Tag it and push the tag:** `git tag v0.1.0` and `git push origin v0.1.0`.
3. **The `Release` workflow** (`.github/workflows/release.yml`) runs the checks and builds,
   on GitHub's Windows machines:
   - `FMLibreEditor-Setup.exe`, a per-user NSIS installer in English and Turkish;
   - `FMLibreEditor-portable.zip`.

   It opens a **draft** release with both files and `docs/release-notes.md` as its text.
4. **Write what is new in the draft and publish it.**

The download links above point at the latest published release. People outside the
repository can use them once it is public.

On macOS: Xcode's command line tools, Rust stable with the Intel target as well
(`rustup target add x86_64-apple-darwin`, for the bridge to load in Intel builds of the
game), and Node.js 20+.

```sh
cargo build --release -p fmlibre-probe -p fmlibre-bridge
cd app; npm install; npm run tauri dev     # run the desktop app
npm run release:mac                        # build FMLibreEditor.app, universal, with the bridge
```

`npm run release:mac` writes the app to
`target/universal-apple-darwin/release/bundle/macos/FMLibreEditor.app`. It is not signed
with a Developer ID, so macOS asks before opening it the first time (Control-click the app,
then **Open**).

`npm run dev` in `app/` serves the interface in a plain browser with made-up sample
players, for working on the UI without the game.

The app reads graphics packs from
`Documents\Sports Interactive\Football Manager 27\graphics` on Windows and from
`~/Library/Application Support/Sports Interactive/Football Manager 27/graphics` on macOS.
If FM keeps its user data somewhere else, set the environment variable `FMLIBRE_GRAPHICS`
to that graphics folder before starting the app.

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
fmlibre-probe swap 13200568 72048035 --restore       # two players swap clubs and back: this writes too
fmlibre-probe injuries 728                           # the current injuries of a club's players
fmlibre-probe heal 37055843 --heal --restore         # heal a player and list his injuries again: this writes too
fmlibre-probe teams 680                              # a club's teams: kinds, captains, players' fitness and morale
fmlibre-probe captain 680 43425040 --restore         # make a player captain (--vice: vice-captain) and back
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

Only `set`, `move`, `swap`, `heal --heal` and `captain` write to the game.
- `set` changes one field after the checks above. Values are as stored:
  attributes run 0–100, or 1–20 with `--shown`.
- `move` moves a player to a club's senior team.
- With `--restore`, each one puts the old values back straight away, to test
  without changing the save. `set`, `heal` and `captain` also take
  `--hold <seconds>` to wait first, so the change can be looked at in the game.

If Windows denies access, run the probe from an administrator terminal.

On macOS, `fmlibre-probe bridge` shows whether the game loads the bridge;
`fmlibre-probe bridge setup` installs the bridge and the launcher built next to the probe
and sets the launch option (quit Steam first), and `fmlibre-probe bridge remove` takes them
out again.
Then start FM27 from Steam: the other commands work as on Windows, with `game_plugin` in
place of `game_plugin.dll` in addresses.

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
