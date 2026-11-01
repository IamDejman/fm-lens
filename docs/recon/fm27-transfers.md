# FM27: how the game records transfers

Notes towards a transfer with a fee that shows in the game's history. They were read from
the Mac Steam build, on a save in July 2026 ("Tyrone Demarcus - Arsenal"), with the probe
(`refs`, `find --as u32`, `holders`, `dump`, `column`). They are a start; nothing is written
yet.

## A person's internal ID

The identity block of a person, which contracts and captaincies point at (`object+0x388` on
macOS), holds after its class pointer:

| Offset | Field | Viktor Gyökeres |
| --- | --- | --- |
| `+0x08` | `u32` internal person ID | 23637 |
| `+0x0C` | `u32` UID | 93070271 |

Internal IDs are not indexes into the players array (index 23637 is someone else).

## The transfer history

The game keeps one list of transfers for the whole game: 48-byte records, laid out one after
another and sorted by the person's internal ID. A transfer made in this save sits among the
ones from the database. Anel Ahmedhodžić's move from Sheffield United to Burnley on
13 July 2026 is the record just before Gyökeres'.

| Offset | Field | Gyökeres, Sporting → Arsenal |
| --- | --- | --- |
| `+0x00` | buying club (club object) | Arsenal |
| `+0x08` | selling club (club object) | Sporting CP |
| `+0x10` | date | 2025-07-26, the contract's `joined` |
| `+0x14` | a second date, unset (1 January 1900) here | |
| `+0x18` | `u32`, an amount | 833,333 |
| `+0x1C` | `u32` internal person ID | 23637 |
| `+0x20` | `u32` flags | `0x250C` |
| `+0x24` | zero | |

- The amounts of neighbouring records are 107,378, 208,333, 833,333 and 2,083,333. The last
  three are 2.5, 10 and 25 million over 12, and every flags word ends in `0x0C`, which is 12.
  The record may keep a fee as 12 monthly instalments. To be checked against the fees the game
  shows.
- An array of pointers to the records, one per record, sits elsewhere (`0x7629dac3e0` on this
  save): the list is reached through it.

The player object also holds his previous club (`+0x350`: Sporting) and dates around it
(`+0x360` on: 26 July 2025).

## Still to find

- What the amount and the flags mean, against the fees the game shows for these transfers.
- Who owns the records and the pointer array, and their capacities. Adding a transfer means
  inserting a record in person order without allocating.
- Where agreed future transfers are kept.
