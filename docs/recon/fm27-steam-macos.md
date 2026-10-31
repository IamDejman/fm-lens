# FM27 on macOS: the Steam build 26227640

Observed on 2026-10-31 on an Apple silicon Mac with macOS 27.0.1 and System Integrity
Protection on, from the Steam install under
`~/Library/Application Support/Steam/steamapps/common/Football Manager 27/` (app 4530370,
build 26227640, depot 4530373). Steam gives the Mac build the same build id as the Windows
one. The game had not been started on this Mac before; the layout below was then measured on
a new save (Tyrone Demarcus at Arsenal, 14 July 2026), with the game started by Steam through
the bridge's launcher.

## The app

`fm.app` is a Unity 6000.3.18f1 player, universal (arm64 and x86_64):

| | |
|---|---|
| Bundle id | `com.SportsInteractive.FootballManager27`, version 27.0.0.2486716 |
| Executable | `fm.app/Contents/MacOS/Football Manager 27`, the process name too |
| Game plugin | `fm.app/Contents/PlugIns/game_plugin.bundle/Contents/MacOS/game_plugin`, a Mach-O bundle |
| Other modules | `UnityPlayer.dylib` and `GameAssembly.dylib` in `Contents/Frameworks` |

`game_plugin` has a `LC_UUID` per architecture, which identifies the build as the PE header
does on Windows:

| | arm64 | x86_64 |
|---|---|---|
| `LC_UUID` | `9E8E47DE-F704-314C-917D-C32D12637678` | `22CFE5C3-B5CF-3C00-8043-1EA190A69B89` |

The arm64 image is `0x58F4000` bytes: `__TEXT` `0x54B0000`, `__DATA_CONST` `0x1F4000`,
`__DATA` `0x9C000` (with `__common` at `0x56D10D0` and `__bss` at `0x5721BA0`) and
`__LINKEDIT`. The `(begin, end)` pairs of the entity arrays are globals, so they should be in
`__DATA`; `calibrate --scan` scans the writable segments as it scans `.data` on Windows.

## Why macOS keeps the editor out

The app and `game_plugin` are signed by SEGA's Developer ID (`3JJX9QL35J`), notarized, and
built with the **hardened runtime**. Their entitlements:

```text
com.apple.security.cs.allow-dyld-environment-variables   true
com.apple.security.cs.disable-library-validation         true
com.apple.security.device.camera                         true
com.apple.security.personal-information.photos-library   true
```

There is no `com.apple.security.get-task-allow`, so macOS hands the game's task port, the
handle to its memory, to no debugger. A test process signed the same way confirmed it:
`task_for_pid` from the same user fails with `KERN_FAILURE` (5) while SIP is on. That is why
earlier Mac editors asked players to turn SIP off.

The first two entitlements are the way in. With them, dyld loads the libraries named in
`DYLD_INSERT_LIBRARIES`, signed by anyone; Steam relies on them for its overlay. FMRTE 27 for
Mac no longer needs SIP off either: its notes speak of a plug-in, set up through the
launchers' settings, that only loads after Steam has been quit.

## The bridge

`crates/fmlibre-bridge` builds `libfmlibre_bridge.dylib`. Loaded, it checks that the process
is Football Manager, checks in the Mach service `io.github.tozmoz.fmlibreeditor.bridge.<pid>`
and waits on it in a thread of its own. A request from a process of the same user, by the
audit token the kernel attaches, gets `mach_task_self()` back as a port descriptor; anyone
else gets an empty answer. The editor checks with `pid_for_task` that the port it got is the
game's. It hooks nothing and reads nothing of the game.

What the test process showed on macOS 27:

- `bootstrap_check_in` of a name launchd has never heard of works for a process of the GUI
  session, as Chromium uses it, and `bootstrap_look_up` finds it from another one.
- `mach_task_self()` of a third-party app may be sent to another process, which Chromium and
  Electron apps rely on. The **read** port, `TASK_READ_PORT`, may not: sending it killed the
  process with `EXC_GUARD` (`ILLEGAL_MOVE`). The bridge never sends it.
  `task_get_special_port(TASK_KERNEL_PORT)` is refused (`KERN_DENIED`).
- With the port, `mach_vm_read_overwrite`, `mach_vm_write`, `mach_vm_region_recurse` and
  `task_info(TASK_DYLD_INFO)` work as for a debugger. An 8-byte read takes about 0.9 µs, the
  list of 84 modules 3 ms.
- dyld stops the game before it starts when an inserted library is missing or has no slice
  for the game's architecture (`terminating because inserted dylib ... could not be loaded`).
  So the bridge is universal, it is replaced with a new file rather than overwritten, and
  removing it takes the launch option out first.
- SIP strips the `DYLD_*` variables from the environment of protected programs, and so
  from what they start: `DYLD_INSERT_LIBRARIES=... arch -x86_64 game` loses it on the way,
  `arch -x86_64 -e DYLD_INSERT_LIBRARIES=... game` does not.

## Heap-only writes

`mach_vm_region_recurse` reports a module's `__DATA` page that the process has written to as
private memory that no file backs: the copy-on-write copy is the process's own. So the write
guard also refuses any range that overlaps a module, as dyld lists them (read again after
30 seconds). `proc_regionfilename` was tried first: it names the module for such a page and
fails with `EINVAL` for heap memory. Under Rosetta, though, it names
`/usr/libexec/rosetta/runtime` for every region of the game, heap included, which would
refuse every write.

The game's objects live in memory it gets from macOS's allocator: the players' pool in
`MALLOC_LARGE` regions (tag 3); the teams' lists, under Rosetta, in a `MALLOC_MEDIUM` one
(tag 12), and natively in `MALLOC_SMALL` ones (tag 2) of 4 MiB. The lists themselves come
from the game's own allocator (see [below](#the-games-allocator)).

## Steam's launch options

Steam on macOS starts a game's app bundle (`'…/fm.app'` in its logs). It runs **no shell** for
a launch option: it replaces `%command%` with the bundle's path, in single quotes, splits the
option into words and starts the first word as a program. The first launch option of the
bridge, `DYLD_INSERT_LIBRARIES="…" %command%`, which a shell would take, made it fail:

```text
Failed running GameID 4530370: "DYLD_INSERT_LIBRARIES="…/libfmlibre_bridge.dylib" '…/fm.app'" (OS Error 260)
```

Error 260 is Cocoa's "no such file": the variable was taken for the program. So the launch
option is `'…/fmlibre-launch' %command%`, quoted the way Steam quotes the game. The launcher
is a small program of `fmlibre-bridge`: it finds the bundle's executable from its
`Info.plist`, puts the bridge in front of the libraries `DYLD_INSERT_LIBRARIES` already names,
and `exec`s the game, which keeps the process id Steam follows. Without the bridge beside it,
it starts the game as it is. Started that way, FM27 (pid 14183) loaded the bridge next to the
two libraries Steam names, `steamloader.dylib` and `gameoverlayrenderer.dylib`, and the probe
attached to it with SIP on.

Steam starts the launch option's program as **Intel code**: FM27, started through a launcher
that simply `exec`'d it, ran under Rosetta, with the Intel half of `game_plugin` (UUID
`22CFE5C3-…`), though Steam itself and the game are universal. The launcher now becomes the
game with `posix_spawn`, `POSIX_SPAWN_SETEXEC` and the Mac's own architecture first: started
as Intel code itself, it brought a stand-in for the game up natively, with the bridge and the
other inserted library.

Each Steam account keeps them in
`~/Library/Application Support/Steam/userdata/<account>/config/localconfig.vdf`, under
`UserLocalConfigStore/Software/Valve/Steam/apps/4530370/LaunchOptions`. Steam reads the file
when it starts and writes it back when it quits, so the editor changes it only while Steam is
closed, keeps a `.fmlibre-backup` of the first version it changed, and edits the one value in
place. Set up and taken out again on a copy of a real file, it came back byte for byte.

## The object layout

`calibrate` found the arrays where Windows has them relative to each other: players at
`game_plugin+0x5C891C8` (38,007, the same as the Windows Steam test save), staff `0x48` and
clubs `0x1B8` after them. With the Windows layout no name decoded, as clang lays classes with
virtual bases out by the Itanium C++ ABI, not MSVC's. `profiles/fm27/layout-macos.toml` holds
the Mac offsets:

| | Windows | macOS |
|---|---|---|
| Player's own fields (positions, attributes, CA/PA, condition, morale, team, injuries) | | 8 bytes earlier: no vbptr |
| Person (names, nation, personality, birth date, contract, caps) | after the identity block, `+0x2B0` | first, `+0x278`; its fields 0x40 earlier |
| Identity block (UID; what contracts and captaincies point at) | `+0x288`, before the person | `+0x388`, after it |
| Player-coach shift | `0xF8` | `0xF8` (Paul Ifill's UID at `+0x48C`) |
| Staff's own fields (attributes, reputation, CA/PA) | | the same |
| Staff person / identity block | `+0x128` / `+0x100` | `+0xF8` / `+0x208` |
| Human manager shift | `0x340` | `0x340` (the save's own manager) |
| In-game date | `+0x848` from the players pair | a variable of its own (below) |

Contracts, clubs, club info, club finances, teams, nations and injuries are laid out as on
Windows. Witnesses on the running game:

- Lionel Messi: born 24 June 1987, 207 caps and 125 goals, 18 and 14 for the U21s, his
  positions and attributes, a contract that ends on 31 December 2028 with squad number 10.
- Tottenham Hotspur: 50,000 season tickets, founded 1882, supporter traits 18/14/7/14/7/14,
  £65 tickets, corporate facilities 20, reputation 7650; captain Micky van de Ven and
  vice-captain Pedro Porro, whose captaincies point at their identity blocks.
- Injuries: David Wotherspoon's moderate calf muscle strain, among others.

With the build profile of the Intel half, `calibrate` decoded 100% of the sampled players,
staff and clubs. The probe then wrote, read back and restored right away: Messi's finishing,
his ambition and his squad number; Pedro Porro as Tottenham's captain (the two captains
swap); Mikel Arteta's tactical attribute; Tottenham's balance; and a swap of Ben Davies with
Tom Heaton (14 writes).

## Natively, on Apple silicon

Started again from Steam through the native-first launcher, FM27 (pid 17731) ran natively,
with the arm64 half of `game_plugin` (UUID `9E8E47DE-F704-314C-917D-C32D12637678`). With no
profile yet, `calibrate` found its arrays by scanning, at `0x56D2E18`, `0x56D2E60` and
`0x56D2FD0`, 100% decoded with the same layout, which clang lays out alike for both
architectures. The reads and the restored writes above passed again (the swap took 10
writes this time).

The in-game date is not with the arrays, though. At `+0x908` from the players pair the arm64
half held an unset date (1 January 1900) right after the save was loaded; the Intel half had
read 14 July 2026 there in a new game. The date itself is a variable of its own: 14 July 2026
at `0x56B1DB8` on arm64, the only such value in `__DATA` besides the database's timestamp. The
Intel half had the same value at `0x5C69700`, at about the same place among the globals. The
build profiles name these (`current_date`); without a profile the reader falls back to the
cluster's field. When the game moved on a day, the variable read 15 July 2026, and the
cluster's field stayed unset.

## The game's allocator

Before it was measured, the Mac layout let no list grow past its capacity, and moves to
most clubs were refused: moving Ben Davies to Juventus, Manchester United and five other
clubs failed. Natively, the 4,096 team lists with a buffer sat in 21 `MALLOC_SMALL` regions,
but not in malloc's blocks: lists of one pointer sit 8 bytes apart, while malloc's blocks are
16-byte aligned and at least 16 bytes long. The game carves the chunks it gets from malloc
into blocks of its own size classes, the same as on Windows. `squads` groups the lists by
capacity, which decides the block:

- **Spacing:** buffers of one capacity are spaced by their class on shared pages. That is
  144 bytes for 17 and 18 pointers, 160 for 19 and 20, 192 for 21 to 24, and so on up to 512.
- **Zeroed blocks:** after the capacity, the rest of the class's block is zero. This held
  for 837 of the 853 lists from 145 to 512 bytes.
- **Old data:** the other 16 had grown past their length (13 players with room for 26, 25
  with room for 50, …). They held old data after their capacity, at their class's spacing.
  The editor leaves such a block at the list's capacity.

So `layout-macos.toml` takes Windows' `heap.block_sizes`. Moves then worked, each undone
right away:

- **Juventus:** Ben Davies joined their 34 players, whose list sits in a 288-byte block.
- **FC Bayern München:** 22 players in a 192-byte block. During the move the list read 23 of
  23, with him in the slot after the old capacity.
- **After the undo:** both blocks were byte for byte as before.
- **Manchester United:** the 28 pointers fill their 224-byte block, so a move there is still
  refused.

These sizes were measured on the arm64 half only. The Intel half, which Intel Macs and Rosetta run, was not measured.
