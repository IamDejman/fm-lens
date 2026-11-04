# FM27: the human manager's unsackable flag

Status: experimental. Implemented in the editor for one build only. The native
copied-career checks listed under "Remaining gates" have not been run, so this is
not evidence that a manager is protected from dismissal.

## Build and class

| | |
| --- | --- |
| Game | FM27 Steam build 26340721, native ARM64 (Apple silicon) |
| `game_plugin` LC_UUID | `F4540355-2186-39CB-9119-C706A6A35346` |
| Human manager class | `db::HUMAN_NON_PLAYER` (`N2db16HUMAN_NON_PLAYERE`), vtable `game_plugin+0x55AC480` |
| Person-block shift of that object | `0x340` |
| Flags word | `u32` at `+0x3FC` from the start of the object, not shifted again |
| Unsackable | bit 1 (mask `2`) of that word |

The profile `profiles/fm27/steam-26340721-macos-arm64.toml` carries these as
`[human_manager]`. No other profile has them; the Intel half of the same build,
the Launch Preview and every Windows build leave the field unavailable.

## Static trace (ARM64 slice of game_plugin)

RVAs are in the arm64 slice of the plugin, stable for this build only.

- The string `become_unsackable` is at `0x5155B12`. `adrp`/`add` at
  `0x238A17C`/`0x238A180` load it; `0x238A198` sets `w1 = 2` and the code calls
  `0x238A1FC`.
- `0x238A21C` calls `0x239448C`, which resolves the selected human manager
  through its game object and vtable slots `0x40` and `0x6F0`.
- `0x238A290`/`0x238A29C` read the `u32` at `[x21, #0x3fc]`, `bic`/`orr` it with
  `w22` (2), and `0x238A2A4` stores it: bit 1 is toggled and the other bits kept.
- `BECOME_UNSACKABLE_ACTION` (RTTI vtable `0x55CFB50`) overrides `0x1909998`:
  it checks the selection resolves to the current manager, loads
  `[x21, #0x3fc]` at `0x1909B24` and extracts bit 1 at `0x1909B30` for the
  checked state of the menu item.

A read-only probe of the running game confirmed the human manager's vtable is
`game_plugin+0x55AC480`, class `N2db16HUMAN_NON_PLAYERE`, and that the flags word
read 0 before any change.

## Not the same thing

`MANAGERS_UNSACKABLE` and `disable_human_managers_sackings` also exist in the
plugin. They are other paths (a game-wide preference and its setting) and are not
touched. The editor writes no preference, no global and no executable code: only
bit 1 of the one manager's flags word.

## How the editor guards it

`manager.unsackable` is a staff flag field, one manager at a time (never in mass
edits or templates). Its record resolves only when all of these hold:

- the session has the exact build profile with `[human_manager]`;
- the career's entity storage is still the one the session attached to;
- the member of staff's person block is shifted by exactly `0x340` (not 0);
- the object's own RTTI class is `N2db16HUMAN_NON_PLAYERE`, read live, not
  inferred from the list's "human" marker;
- the UID at the object still matches (the usual read/write check).

Otherwise the field reads as missing and every write or undo fails closed. Writes
go through the ordinary path: build and career guards, the staff health check,
expected-value comparison, readback, and conditional undo. The encode keeps the
other seven bits of the byte.

## Reproducible read-only probe commands

Build the probe (`cargo build --locked -p fmlibre-probe -p fmlibre-bridge`), load
a disposable copy of a career, then:

```sh
scripts/scout info                         # confirm the build profile and UUID
scripts/scout staff                        # the human manager is listed first
scripts/scout staff-member <staff id>      # prints "unsackable yes/no", or unsupported
scripts/scout get staff <staff id> manager.unsackable
```

Keep any output under the ignored `reports/` folder.

## Validation status and remaining gates

The judge completed bounded apply/readback/undo, surrounding-byte preservation,
intervening-editor-change refusal, advancement and full save/quit/reload persistence
on 4 November 2026. FM displayed the changed Determination after reload. See
../EDITING-VALIDATION.md for the exact scope. The following is the original gate
list; the FM menu flag display, game-originated conflict and dismissal scenario
remain unverified:

1. Compare the manager's existing stats in FM Lens with FM's own screens.
2. Apply the flag, read it back, and check FM's own manager menu shows it.
3. Edit the value in FM (or let it change) and confirm a stale expected value is refused.
4. Undo, and check undo refuses after an intervening change.
5. Confirm the other bits of the flags word are unchanged after apply and undo.
6. Inspect in FM, advance time, inspect again.
7. Save, fully quit FM, relaunch through Steam, reload the copy and reread the flags.
8. Run a dismissal scenario (poor results, board confidence) and record the outcome.

Registration and club or national-team moves for the human manager need their
own linked-record mappings; this flag does not cover them.
