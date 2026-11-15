# FM27: which save is loaded (built for Windows Steam)

Build: FM27 Steam 26340721, ARM64 macOS. Read-only probe work on 2026-11-05 with the
disposable copy `FM Lens PBJ Registration Kepa 2026-11-04.fm` loaded. The main
career's hash was checked before and after.

## Goal

Show the loaded save's file name when FM Lens connects. Today the app names the
career by its human manager and club (`Career` in `app/src-tauri/src/lib.rs`).

## What was found on macOS (5 November 2026)

- FM does not keep the `.fm` file open after loading and does not log its name.
- `fmlens-probe find "Registration Kepa 2026-11-04"` hits:
  - nine Unity (IL2CPP) `System.String` objects in UTF-16, with and without `.fm`,
    one of them the full path under `.../Football Manager 27/games/`;
  - seven UTF-8 copies. They sit in short-lived buffers that repeat the
    same string, or in a raw folder listing (`getdirentries` records with `.`
    and `..`). None of them is a stable record.
- `refs` on the strings finds one managed object that holds the `.fm` name
  (+0x18), the full path (+0x20) and a .NET `DateTime` (+0x28, last write time).
  Objects of the same class follow it every 0x40 bytes, one per save in the
  `games` folder. This is the Load Game list, not the loaded game.
- `refs` on the loaded save's list entry finds the same holders as on any other
  entry: three sorted copies of the list and UI label objects. Nothing marks
  the entry as the loaded one.

## Found on Windows (15 November 2026)

Build: FM27 27.0.1, Steam 26577676, Windows. Read-only probe work with a
disposable career copy loaded. The main career's hash was the same afterwards.

- FM keeps the name in its one `SAVE_SYSTEM` object (MSVC type name
  `.?AVSAVE_SYSTEM@@`; vtables at `game_plugin.dll+0x4DBFCF0` and `+0x4DBFD08`).
- The static pointer to that object is at `game_plugin.dll+0x580EC08`, 0x1B0
  after the transfer manager's (`transfer_manager = 0x580EA58`).
- `SAVE_SYSTEM + 0x28` is an FM string pointer (a `u32` length, then UTF-8):
  the save's name with no folder and no `.fm`.

How it was found: `find` gave eleven UTF-8 copies of the name, six of them live
ref-counted strings. An FM string pointer points at the length, 4 bytes before
the text, so `refs` on the text finds nothing; `refs` on the 0x14 bytes that
end at the length (`--span 0x14`) finds the holders. One holder is the object
the static points to. The macOS search above looked for pointers to the text,
which is why it found only Unity's Load Game list.

Checked in FM, reading static, object and string each time:

| Step in FM | Name read |
|---|---|
| `FM-Lens-BoardApp-2026-11-15` loaded | `FM-Lens-BoardApp-2026-11-15` |
| Save Game As `FM-Lens-SaveName-2026-11-15`, no load | `FM-Lens-SaveName-2026-11-15` |
| Load Game open, another save selected, Load not pressed | unchanged |
| Load of `FM-Lens-BoardApp-2026-11-15`, at 25% of the loading bar | `FM-Lens-BoardApp-2026-11-15` |
| The same load, finished | `FM-Lens-BoardApp-2026-11-15` |

So the name follows a Save As at once, and a load from its start: during a
load it names the save being loaded, before the new career's data is in place.

## Not established

- A new career that has never been saved (the pointer is expected to be null
  or the string empty), and whether an autosave changes the name.
- An FM restart. The static is at a fixed place in the module, as the build
  profiles' other statics are; it was not read again after a restart.
- Game Pass, and macOS on ARM64 and Intel. The class keeps its type name on
  macOS too, so `fmlens-probe instances SAVE_SYSTEM` should find the object
  there; the static and the name's offset have to be read on each.
- The rest of the object. `+0x70` held a day and year pair (day 200 of 2028
  beside 1 January 1900, with the game at 18 July 2028); it is not named.

## Built (15 November 2026)

- The Windows Steam profile places the static (`save_system`) and the Windows
  layout holds the name's offset (`[save_system] name`). Profiles without
  them show no name.
- `Session::save_name` (`crates/fmlens-core/src/save_system.rs`) reads the
  object the static points at, checks its class, then reads the string. It
  gives no name when the class is not `SAVE_SYSTEM`, or the text is empty or
  could not be a file's name.
- The string pointer is not on an eight-byte boundary (the game's strings sit
  four bytes into their blocks), so the read does not ask for an aligned
  pointer.
- `fmlens-probe save-name` prints it. The app shows it beside the manager and
  club, and follows Save As and Load on its own.

Checked in the packaged app on Windows, FM27 27.0.1 Steam 26577676:

| Step in FM | App header and `save-name` |
|---|---|
| `FM-Lens-NameCheck-2026-11-15` loaded, app connects | `FM-Lens-NameCheck-2026-11-15` |
| Save Game As a new name | the new name, with no reload |
| Load of `FM-Lens-SaveName-2026-11-15`, probe read at 3% of the loading bar | `FM-Lens-SaveName-2026-11-15` |
| The same load finished, app left open | header shows `FM-Lens-SaveName-2026-11-15`, Changes cleared |
| Load of `FM-Lens-NameCheck-2026-11-15` again | `FM-Lens-NameCheck-2026-11-15` |

On macOS arm64 (15 November) the static is at `game_plugin+0x5740BC0`, 0x1C8
after the transfer manager's as on Windows, with the name at `+0x28`; the app's
header showed the loaded copy's name. The Intel twin (`0x5CD9AE0`) was run under
Rosetta the same day: the header showed the loaded copy's name, and the new
name after Save Game As with no reload.

Not run: Game Pass, a career never saved, an FM restart with the app left
open.
