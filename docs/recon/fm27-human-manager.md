# FM27: the human manager's unsackable flag

Status: implemented for one build only. Apply, undo, stale-value refusal and
save/reload are tested (gates 1 to 7 below). A real dismissal scenario has not been
run, so this is not evidence that a manager is protected from being sacked.

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
`[human_manager]`. The Intel half of the same build has the same values, traced
statically ([Intel notes](fm27-steam-26340721-macos-x86_64.md)). So does its
Windows build (`steam-26340721.toml`), except that MSVC puts the vtable naming
`.?AVHUMAN_NON_PLAYER@db@@` at the person block, `+0x440`, which the profile gives
as `class_at`. The Launch Preview and the other Windows builds leave the field
unavailable.

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

Build the probe (`cargo build --locked -p fmlens-probe -p fmlens-bridge`), load
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
../EDITING-VALIDATION.md for the exact scope. On 8 November the main build set both
flags again on a copied career: with registration any time on, FM let you change a
registration while its screen said the window was closed, and locked it again once
the flag was off. Statically, FM also reads the unsackable bit as a cheat flag (it
feeds the unlockables check). The original gate list follows; only the dismissal
scenario (8) remains unverified:

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

## The game's own manager actions

The plugin keeps FM's own in-game editor actions as a table of names next to
`become_unsackable` (`0x5155B12`): `allow_licenced_kits`, `squad_numbers_anytime`,
`squad_registration_anytime`, `cancel_future_transfer`, `add_work_permit`,
`remove_work_permit`, `loan_to_my_team`, `loan_to_other_team`,
`staff_to_my_national_team`, `staff_to_other_national_team`, `staff_to_my_team`,
`staff_to_other_team`, `player_to_my_team`, `player_to_other_team`,
`freeze_attributes`, `remove_ban`, `remove_injuries`, `remove_unhappiness`,
`terminate_contract`, `change_morale`, `maximise_team_cohesion` and
`maximise_tactical_understanding`. Finding an address that loads one of them
(an `adrp`/`add` pair) leads to its handler.

### Squad registration at any time: bit 8

- `squad_registration_anytime` (`0x5155B4E`) is loaded at `0x238A8DC`/`0x238A8E0`.
  `0x238A8F8` sets `w1 = 0x100` and `0x238A8FC` calls the same `0x238A1FC` as
  `become_unsackable`, which sets or clears that mask in `[manager, #0x3fc]`.
- `squad_numbers_anytime` (`0x5155B38`) does the same with `0x200` (bit 9) at
  `0x238A860`. The editor does not expose it.
- The menu state reads byte `+0x3FD` at `0x194A45C` and takes bit 0
  (`0x194A468`); squad numbers takes bit 9 at `0x194A538`.
- Other reads of byte `+0x3FD` bit 0 are at `0x1F8AD4C`, `0x22B4B2C` and
  `0x22BA0E8`, the last next to `SQUAD_SELECTION_PLAYER_VALUES`. Which
  registration checks they gate has not been traced.

The editor field `manager.registration_anytime` is bit 0 of the byte at `+0x3FD`,
with the same guards as `manager.unsackable`. On the validation career the live
word read `0x2`: unsackable set, registration clear. Setting it through FM Lens changed the
word to `0x102`, and FM then allowed registration changes while its screen still
said the window was closed (see EDITING-VALIDATION.md).

Other bits written to the word, for reference only: 0, 3, 4, 11, 12 and 13.

### Club and national-team moves: not raw writes

The handler around `0x238DDBC`–`0x238DF40` picks `staff_to_my_team` or
`staff_to_other_team`, `player_to_my_team` or `player_to_other_team`,
`loan_to_my_team` or `loan_to_other_team`, and `staff_to_my_national_team` or
`staff_to_other_national_team`, by comparing the target team with the user's.
It then builds a named request and passes it to the game's action system. The
move itself (contracts, job, the club's or nation's staff list, history) is
done by FM's own processing, not by a field. FM Lens only reads and writes
memory and never runs game code, so it cannot trigger these safely. Rebuilding
their effects with raw writes would risk an inconsistent career.

A game-native route for a national job is to raise the manager's reputation
(already editable) and apply or wait for an offer in FM.

### Manager relations

A person's relations pointer is `+0x48` into the person block for players
(`0x2C0 - 0x278`) and for staff (`0xF8 + 0x48 = 0x140`, plus the `0x340` shift
for the human manager). A raw read of the human manager on the validation career
found one 16-byte entry in the player format: target Arsenal (UID 602), target
kind 1, relation 3 (favoured club), strength 100, byte `+0x08` = 1. The list was
full (`end == capacity`). Changing an existing entry in place would work like
the player tie edits; adding one needs room in the allocator block, which this
list lacks. What FM does with byte `+0x08` and byte `+0x0D` has not been traced.

FM Lens lists these on the manager's profile and edits them as a member of
staff's: strength, removal, and Replace, which points an entry at another club
or person and writes only the target pointer. On 7 November Arsenal -> Chelsea
showed in FM's My Profile ("Favourite Club Chelsea") at once and after a save
and reload (see EDITING-VALIDATION.md, "Replace a like or dislike").
