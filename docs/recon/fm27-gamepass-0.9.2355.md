# FM27 Game Pass build 0.9.2355.0 (Launch Preview)

Observed on 2026-10-30 from the installed package
`SportsInteractive.FootballManager27_0.9.2355.0_x64__5w3tn6tb6stnm`
under `C:\Program Files\WindowsApps\`. The full release (2026-11-10) will be a
different build; re-check everything here against it.

## Install

- GDK (MSIXVC) package: `MicrosoftGame.config`, `gamelaunchhelper.exe`,
  `libHttpClient.GDK.dll`, `PlayFabMultiplayerGDK.dll`, `Party.dll`, `XCurl.dll`.
- Entry point `GameLaunchHelper.exe` (`runFullTrust`, not an AppContainer); the
  running process is `fm.exe`.
- `fm.exe` cannot be read from disk (ACL protected). Every other file can, which is
  all the editor needs.

## Engine

- Unity `6000.3.18f1-custom`, IL2CPP backend.
- `fm_Data/il2cpp_data/Metadata/global-metadata.dat`: not encrypted, metadata
  version 39 (`AF 1B B1 FA 27 00 00 00`). The original Il2CppDumper rejects v39; use
  Cpp2IL or a v39 fork.
- Managed names are not obfuscated (`SI.UI`, `SI.Bindable`, `FM.GamePlugin`,
  `SI.Interop`, `FM.Match`, ...).
- `GameAssembly.dll` exports 241 `il2cpp_*` API functions.
- `fm_Data/il2cpp_data/il2cpp.usym` (87 MB) ships too.

## Native game core: `fm_Data/Plugins/x86_64/game_plugin.dll`

- 423 MB on disk. Section names are rewritten and code sits outside `.text`
  (`.text` 4 KB, `.debug` 327 MB, `.trace` 78 MB, `.xpdata`, `.xtext`, `.xtls`,
  `.sdata`, `.sbss`, ...): anti-tamper protection. FM26 used Denuvo.
- The Steam build of the same module uses different section names (`.srdata`,
  `.arch`, `.sdata`, `.code` per fm-editor's notes), so it is a different binary.
- 282 exports. The UI talks to the core through an `IGamePlugin` interface
  (`Initialise`, `Tick`, `OpenChannels`, `PerformChannelActions`, `SendEvent`,
  `UpdateChannelData`, `Shutdown`) and receives data through `IPluginDataReceiver`
  callbacks (`SendDataResponse`, `SendEvent`), plus `get_*_layout_signature`
  exports for marshalling checks. The managed side only mirrors what the UI shows;
  the full database is on the native heap.
- Export `game_plugin_plugin_build_timestamp` may serve as a build fingerprint.

## Steam reference layout (from fm-editor)

From [fm-editor's FM27 notes](https://github.com/barak14/fm-editor/blob/main/docs/fm27/memory-layout.md)
(Steam build; GPL-3.0-or-later). Entities live in heap arrays referenced by
`(begin, end)` pointer pairs in a writable section of `game_plugin.dll`; objects are
told apart by vtable.

| What | Steam RVA |
|---|---|
| Players `(begin, end)` | `0x57037D0` |
| Staff `(begin, end)` | `0x5703818` |
| Clubs `(begin, end)` | `0x5703988` |
| Plain player vtable | `0x4D27228` |
| Player-coach vtable | `0x4F75A08` |
| Real club vtable | `0x4CDA1F8` |

Expected on Game Pass: different RVAs and vtables (different binary), probably the
same field offsets inside objects (same source). Field offsets such as the player
UID at `+0x294` and the person block at `+0x288` are the first things to verify.

## Game Pass findings

### Attaching (`fmlibre-probe info`)

- `OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ)` on the Game Pass
  `fm.exe` works **without administrator rights**.
- The running executable lives in the folder chosen in the Xbox app, here
  `D:\Games\Football Manager 27\Content\fm.exe`, not under `WindowsApps`. The
  package identity (`GetPackageFullName`) and `MicrosoftGame.config` next to the
  exe still identify the build as Game Pass.
- `fm.exe`, `UnityPlayer.dll` and `GameAssembly.dll` load at start-up;
  `game_plugin.dll` loads later, during start-up loading.

### `game_plugin.dll` as mapped

Size of image `0x19436000`. Section table read from memory:

| Section | RVA | Size | Access |
|---|---|---|---|
| `.trace` | `0x1000` | `0x4a96000` | R-X (code) |
| `.xpdata` | `0x4a97000` | `0xb50000` | R-- (vtables live here) |
| `.ecode` | `0x55e7000` | `0x100000` | RW- (entity array pairs live here) |
| `.xdata` | `0x56e7000` | `0x19b000` | R-- |
| `.sxdata` | `0x5884000` | `0xd000` | RW- |
| `.debug` | `0x58e7000` | `0x13812ea8` | RWX (protector) |

Plus small `.udata`, `.sdata`, `.bss`, `.rdata`, `.impdata`, `.xtext`, `.text`,
`.link`, `.tls`, `.xtls`, `.rsrc` and `.sbss` sections. Writable memory in the
module: 84 regions, 313 MiB.

The `game_plugin_plugin_build_timestamp` export points into `.debug` and starts
with `call`/`jmp`: it is code, so it cannot serve as a data fingerprint. Use the
package version instead.

### Entity arrays (`fmlibre-probe scan`)

The scan took 2.3 s (debug build) and found 20 arrays, all with their
`(begin, end)` pairs in `.ecode`. The cluster sits at the same relative offsets as
on Steam, shifted as a block by `-0x81A10`.

| Array | Steam RVA | Game Pass RVA | Elements | Vtables (Game Pass RVA × count) |
|---|---|---|---|---|
| People | — | `0x5681DA8` | 88,630 | `0x4cd47f8` ×59,130, `0x4d39378` ×29,324, `0x4f1f208` ×174, `0x4c6e218` ×2 |
| Players | `0x57037D0` | `0x5681DC0` | 59,304 | `0x4cd4318` ×59,130 (player), `0x4f1ed28` ×174 (player-coach) |
| Players (second list) | — | `0x5681DD8` | 59,304 | same as players |
| Staff | `0x5703818` | `0x5681E08` | 29,500 | `0x4d39358` ×29,324, `0x4f1ed0c` ×174, `0x4c6e1fc` ×2 |
| Clubs | `0x5703988` | `0x5681F78` | 31,233 | `0x4c87b68` ×31,227, `0x4f0e3f8` ×6 |

The people array points at the person sub-object at player `+0x2B0` (vtable
`0x4cd47f8`), the players array at the player object itself. Other arrays in the
cluster (teams, club subsets, about 3.7k objects of vtable `0x4ad55c8`) are not
identified yet. Element counts depend on the leagues loaded in the save.

### Player layout: same as Steam

Verified with `fmlibre-probe column game_plugin.dll+0x5681dc0 0x294 --find <UID>`:
Lionel Messi (UID 7458500) is element 360 and Erling Haaland (UID 29179241)
element 6975 of the players array, both at the Steam offset.

| Offset | Content |
|---|---|
| `+0x288` | person block vtable (`0x4cd4848`) |
| `+0x294` | UID (`u32`); `+0x298` holds the same value again |
| `+0x2B0` | person sub-object vtable (`0x4cd47f8`) |
| `+0x2C8` | full name: pointer to an FM string |
| `+0x2D8` / `+0x2E0` | first / last name: pointer to a name-table entry |
| `+0x2E8` | common name entry, null when there is none |

FM strings are a `u32` byte length followed by NUL-terminated UTF-8 text, packed in
a pool (pointers are only 4-byte aligned). Messi's full name reads
`Lionel Andrés Messi Cuccittini`. A name-table entry starts with a pointer to its
FM string, then a `u32` id; entries are 24 bytes apart.

More player fields, checked on Messi's object against the Steam offsets:

| Offset | Content | Messi |
|---|---|---|
| `+0x150..+0x15E` | 15 position ratings, 1–20 | AMR 20, AMC 19, ST 19, MR 12 |
| `+0x15F..+0x194` | attributes, raw 0–100, shown as `(raw + 2) / 5` | dribbling 97 → 19, left foot 100 → 20, work rate 28 → 6 |
| `+0x25E` / `+0x260` / `+0x262` | home / current / world reputation (`u16`) | 9838 / 8750 / 8750 |
| `+0x264` / `+0x266` | current / potential ability | 170 / 200 |
| `+0x2F8..+0x2FF` | personality, 1–20 | ambition 18, pressure 19 |
| `+0x310` | date of birth: `u16` day of year (1-based) + `u16` year | 175, 1987 → 24 June 1987 |

More fields, read with `fmlibre-probe player 7458500`:

| Offset | Content | Messi |
|---|---|---|
| `+0x22E` | height in cm (`u16`) | 171 |
| `+0x238` | asking price in pounds (`i32`), -1 when not set | -1 |
| `+0x3BC` / `+0x3BE` | international caps / goals (`u16`) | 207 / 125 |
| `+0x3C0` / `+0x3C1` | U21 caps / goals (`u8`) | 18 / 14, his real U20 record |
| `+0x330` | contract pointer | see below |

`+0x234` reads 300,000,000 for Messi, so it is not the market value fm-editor's
FM26 notes suggest; left unmapped.

Contract fields (from the contract pointer), checked on Messi:

| Offset | Content | Messi |
|---|---|---|
| `+0x08` | pointer back to the player's person block (`player+0x288`) | ✓ |
| `+0x20` | wage, pounds per week (`i32`) | 404,321 |
| `+0x44` | signed (date) | 1 Dec 2025 |
| `+0x48` | expires (date) | 31 Dec 2028 |
| `+0x4C` | joined the club (date) | 15 Jul 2023, his real Inter Miami signing date |
| `+0x54` | squad status (`u8`) | 1 (star player) |
| `+0x57` | listing flags: bit 0 transfer, bit 1 loan | 0 |
| `+0x5D` | squad number (`u8`, 255 = none) | 10 |

FM stores unset dates as zero or as days in 1900 (a rolling contract "expires"
1900-01-02); the decoder treats both as no date.

### Player-coaches

174 objects in the players array have their own vtable (`0x4f1ed28`). In them the
person block, everything from `+0x288` on, sits `0xF8` further: the UID is at
`+0x38C`, the full name at `+0x3C0`, and so on. Fields before `+0x288` (team,
positions, attributes, height, reputations, CA/PA) do not move. Verified with Paul
Ifill (UID 109160, born 20 October 1979, player-coach at Greytown AFC). The reader
works out the shift once per vtable by trying each candidate and keeping the one
under which the name decodes, so no build-specific vtable is needed.

### Staff and club layouts

`fmlibre-probe calibrate` decodes 100% of sampled staff (name-table entries at
`+0x150` / `+0x158`) and clubs (name at `+0xC0`), both with and without the build
profile (`--scan`). Clubs are reached from players through the team pointer at
`+0x130` and `team+0x30`; nations through `+0x2F0` with the name at `nation+0x18`.
Nation names come from the game's own translations, so they follow the game
language (e.g. `Arjantin` in a Turkish game).

`fmlibre-probe players` reads all 59,304 players in 0.5 s (debug build).
