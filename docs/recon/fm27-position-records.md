# FM27: the records behind a player's positions

Notes behind position edits that stay. Read on Steam build 26577676: the Windows half in
a running game on the test machine (a copy of the career, 3 to 30 June 2027) with the
read-only probe, and both Mac halves from the game binary on disk. Nothing on the Mac was
checked in a running game.

## What went wrong

FM Lens wrote a player's 15 position ratings (`positions`, `+0x150` on Windows, `+0x148`
on macOS) and nothing else. For some players the game later put the old rating back
(`docs/EDITING-VALIDATION.md`, "Template on three players").

Reproduced on Windows with four Arsenal players, one edit each on 3 June 2027:

| Player | Edit | After the holiday |
| --- | --- | --- |
| Riccardo Calafiori (43424738) | DL 20 to 1, AMR 1 to 20 | both kept |
| Theo Julienne (2000407522) | DM 20 to 1, ST 1 to 20 | DM back at 20, ST kept |
| Josh Ogunnaike (2000407536) | DL 20 to 1, DC 16 to 1, WBL 16 to 1, AMC 1 to 18, AMR 1 to 20 | DL back at 20, DC at 16, the rest kept |
| Khari Ranson (2000407546) | GK 20 to 1, ST 1 to 20 | GK back at 20, ST kept |

The ratings were back by 9 June. Written again on 9 June, they read as written on 10 and
11 June and were back on 12 June, a Saturday: the game runs the pass every few days, not
daily. Ratings the same players had no record of (below) never came back.

## The list

A player holds a pointer to a `(begin, end, capacity)` list of 0x18-byte records:

| Half | Pointer at | How it was read |
| --- | --- | --- |
| Windows | player `+0x1A8` | the game's position setter, and live memory |
| macOS ARM64 | player `+0x1A0` | the game's position setter |
| macOS Intel | player `+0x1A0` | the game's position setter |

The pointer is null for a player with no record (Calafiori). The three youth players had
one or two records each: Julienne DM 20 and DR 17, Ogunnaike DL 20 and DC 16, Ranson
GK 20. Not every rating has one: Julienne's MC 20 and WBR 14 and Ogunnaike's WBL 16 had
none, and Ogunnaike's WBL stayed at 1.

| Offset | Field | Ogunnaike's two records |
| --- | --- | --- |
| `+0x00` | a date (`u16` day and flags, `u16` year) | 2026 |
| `+0x04` | a second date | 2027 |
| `+0x08` | `u16`: the place on the pitch in its low six bits, signed | `0x1937` (-9), `0x1D75` (-11) |
| `+0x0A` | five more `u16`, not understood | |
| `+0x14` | `u8`: the rating the game writes back | 20, 16 |
| `+0x15` | two more ratings and a byte, not understood | `14 14 00`, `0e 14 01` |

The record's rating matched the rating that came back each time: Ogunnaike DL 20 and
DC 16, Ranson GK 20, Julienne DM 20. The records themselves did not change while the
ratings were written and put back.

## Which position a record is for

The setter turns a record's place into a mask through a table of 27 `u32` (index
place + 15) and compares it with the mask of the position being set. Read from the
Windows table and from the ARM64 jump table, which agree:

| Place | -15 | -13 | -11 | -9 | -8 | -6 | -4 | -3 | -1 | 1 | 2 | 4 | 6 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Position | GK | DR | DC | DL | WBR | DM | WBL | MR | MC | ML | AMR | AMC | AML | ST |

The other places match no one position: they are the left or right of a pair, with a
flag bit set, or map to nothing. No place is a sweeper's.

## The game's own setter

`(player, index, value)`: index 0 to 14 is a position, clamped to 1..20; a higher index
is an attribute, 1..100.

| Half | Function | Stores the rating at |
| --- | --- | --- |
| Windows | `game_plugin.dll+0x161DE10` | `+0x161DF9F`, `[player + index + 0x150]` |
| macOS ARM64 | `0xD1CD8C` | `0xD1D010`, `[player + index + 0x148]` |
| macOS Intel | around `0xDC8D50` (start not pinned) | `0xDC8F8B`, `[player + index + 0x148]` |

For a position, when the list pointer is not null and a gate object answers yes, it finds
the first record whose place is that position, moves the later records down over it, and
takes 0x18 off the list's end. Then it stores the rating.

The gate is looked up by the tag `iIGE` in a registry (Windows `+0x5821EA0` to
`+0x5821EA8`; the default object at `+0x581BFF8`, asked through slot `+0x30` of its
vtable; ARM64 registry `0x576F8F8`, default `0x57723F8`, slot `+0x38`). On the test
machine the registry had no `iIGE` entry and the default object's slot is
`xor eax, eax; ret`: the gate says no, so the setter stores the rating and leaves the
record. It reads as the switch for the paid in-game editor, which that machine does not
have.

So running the game's setter through the bridge would not fix this for anyone without
the in-game editor. FM Lens does what the setter does when the gate says yes.

## What FM Lens writes

`position_records` in the layout places the list; position fields are offered only where
a layout has it. A position edit that changes a rating (`Session::write` in `edit.rs`,
the one path single edits, mass edits and templates share):

1. reads the player's list and refuses the edit unless it reads as one: a user pointer,
   `begin <= end <= capacity`, a whole number of records, at most 64, each with a place
   from -15 to 11 and ratings up to 20 (`position_records.rs`);
2. takes out the first record of that position, as the game does: later records move up,
   the end drops 0x18, the freed slot is cleared, each write over the bytes it expects;
3. writes the rating and reads it back; if that fails the record goes back.

Undo writes the rating back, then the record, and only if the list still holds exactly
what the edit left; otherwise the rating is written again and the undo is refused. The
bytes are kept with the change, for the game they were written in.

The positions health check reads every sampled player's list too, so a build where the
offset is wrong locks position edits instead of writing.

On Windows the edits stayed: ratings written this way on 17 June 2027 read as written on
27 and 30 June and after two rounds of save, quit and reload, while a rating written the
old way on the same day, its record left in, was back at 20 by 27 June
(`docs/EDITING-VALIDATION.md`, "Position edits that stay"). A list with its last record
taken out keeps its pointer with `begin == end`; after a reload its header reads as
zeros, which is read as no records. After the second reload the health check read the
lists of 2000 of 2000 sampled players, 1972 records, each at the player's own rating.

## Not established

- Nothing was run on macOS. The ARM64 and Intel offsets come from each half's own code
  and are 8 bytes before the Windows one, like the ratings themselves.
- The Intel setter's first instruction.
- What the records are for (the dates and the other ratings), and what in the game adds
  one.
- Game Pass builds share the Windows layout; the health check is what guards them.
