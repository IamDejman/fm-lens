# FMLibreEditor

A free, open-source real-time editor for **Football Manager 27**, built Game Pass first.

> **Status: pre-alpha, Phase 0 (reconnaissance).** Nothing here edits the game yet.
> The only working tool is a read-only probe.

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
| `crates/fmlibre-core` | Football Manager logic: game detection, object-array scanner |
| `crates/fmlibre-probe` | Read-only command-line probe |
| `app/` | Tauri 2 desktop app (React + TypeScript) |
| `docs/` | Roadmap and reverse-engineering notes |

## Building

Requirements: Windows 10/11, Rust stable (via [rustup](https://rustup.rs)),
Visual Studio Build Tools with the C++ workload, and Node.js 20+ for the app.

```powershell
cargo build --release -p fmlibre-probe
```

## Using the probe

Start FM27, load a save, then run:

```powershell
fmlibre-probe info                                   # process, storefront, modules, game_plugin.dll layout
fmlibre-probe scan                                   # find arrays of game objects (players, staff, clubs...)
fmlibre-probe dump game_plugin.dll+0x1000 --len 0x100
fmlibre-probe element game_plugin.dll+0x57037d0 0    # follow an array and dump element 0
```

Addresses and lengths are hexadecimal. Add `--json report.json` to `info` or `scan`
to save the results. The probe only reads memory. If Windows denies access, run it
from an administrator terminal.

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
