# FM27: which save is loaded (in progress)

Build: FM27 Steam 26340721, ARM64 macOS. Read-only probe work on 2026-11-05 with the
disposable copy `FM Lens PBJ Registration Kepa 2026-11-04.fm` loaded. The main
career's hash was checked before and after.

## Goal

Show the loaded save's file name when FM Lens connects. Today the app names the
career by its human manager and club (`Career` in `app/src-tauri/src/lib.rs`).

## What was found

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

## Not established

- Where FM keeps the loaded save's name or path, if it keeps it at all after
  loading. FM's Save overwrites the loaded file, so it is expected somewhere.

## Next

Load a second disposable save with a different name in the same FM session and
diff: search for the new name, and find the holder whose string changed while
the list entries did not. Then confirm the holder across an FM restart, and add
a read-only probe subcommand that prints the name.
