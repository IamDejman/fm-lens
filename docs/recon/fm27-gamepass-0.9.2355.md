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

To be filled in by `fmlibre-probe info` and `fmlibre-probe scan` on a loaded save.
