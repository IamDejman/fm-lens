# FM27: where the game keeps bans

Notes behind lifting a player's bans. They were read from the Mac Steam build, on the
July 2026 save ("Tyrone Demarcus - Arsenal", game date 26 July 2026), with the probe and a
few reads of the game binary.

## Finding them

The game binary keeps C++ type names. From an object's class pointer, the word before the
vtable leads to the type info, and the type info names the class: the player object is
`db::ACTUAL_PLAYER`. The names that mention bans include `sicomps::DISCIPLINE`,
`GAME_DISCIPLINE`, `RED_CARD_BAN_NEWS`, `PLAYER_REMOVE_ALL_BANS_ACTION` (the game's own
editor action) and `BAN_SCOPE` (a ban's reach: a competition, continent, nation or nation
type).

Four `RED_CARD_BAN_NEWS` items were in memory. Two named Regan Charles-Cook (Motherwell),
sent off on 23 July 2026; the maintainer confirmed that the game shows him banned for one
match.

## The list of absences

A player's `injuries` pointer (`+0xF0` on macOS) leads to a record with two lists, each
`(begin, end, capacity)`:

| Offset | List |
| --- | --- |
| `+0x00` | his current injuries (see `medical.rs`) |
| `+0x18` | his current absences: bans, and others such as a call-up |

The absences are 32-byte entries:

| Offset | Field | Charles-Cook's ban |
| --- | --- | --- |
| `+0x00` | `u32` id, then a byte and a kind byte: the ban's reach | 2, kind 15 |
| `+0x08` | a pointer, often null | |
| `+0x10` | date the ban began | 23 July 2026 |
| `+0x14` | `u16`: the discipline rules it falls under (`GAME_DISCIPLINE`) | 65 |
| `+0x16` | `u16`: `0xFFFF` for a ban, 0 for other absences | `0xFFFF` |
| `+0x18` | four bytes, not yet understood | `01 00 06 03` |
| `+0x1C` | `u8`: matches still to miss | 1 |

On the save, 652 players had absences listed, mostly World Cup squad players with an entry
from 1 June 2026; 24 entries were bans, of 23 players. They agree with what is known:
- the bans dated 13 July, the save's first day, are the database's: Alex Oxlade-Chamberlain
  (Celtic) 3 matches, Hiram Boateng (York City) 7, Tomáš Chorý (Slavia Praha) 6;
- rules 72 were the South American clubs' (Peñarol, Palmeiras, Universidad de Chile);
- rule 65 holds Motherwell's and Ararat-Armenia's players: European club competitions.

One list held a World Cup entry and a ban (Gustavo Gómez, Palmeiras).

## Lifting

A served ban leaves the list: Gonzalo Montiel (River Plate) has a red card on his booking
count and no ban left. The editor does the same: the bans leave the list, the other absences
move to the front, and the list ends after them. The entries stay in their block, unlisted,
and an undo lists them again. Checked with `bans <uid> --lift --restore` on Charles-Cook,
Elliot Watt (two bans) and Gustavo Gómez: his World Cup entry stayed listed.

On the Windows Steam build (26227640, a save of 13 July 2026), the same offsets read 17 banned
players, Elliot Watt's two bans among them; his lift was restored with the probe and undone
in the app, and so was a team's (Fulham's). The injury record is laid out alike on both
systems. The Game Pass build (0.9.2355.0, a save of 27 July 2026) reads 48 banned players with
the same offsets, Watt among them, and the same lifts were restored and undone.

Not yet checked: a game day passing after a ban is lifted.

## Also seen

- `player+0x08`: a list of `sicomps::PLAYER_BOOKING_COUNT`, a player's cards per discipline
  rules (439 players). The `u32` after the class pointer holds the rules' id in its low byte,
  and in its top two bytes what look like the yellow and the red cards.
- `GAME_DISCIPLINE`, one object: a list of 281 records of 0xA0 bytes, one per set of
  discipline rules. Record 65's rules id sits at `+0x3C`.
