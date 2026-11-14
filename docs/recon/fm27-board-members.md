# FM27 board members: owners, chairpersons and directors (Steam 26577676, Windows)

Scope: how the game ties an owner, chairperson, president, managing director or director to a
club, what else points at such a person, and what a change of board member would have to write.
Method: read-only probe readings (`club`, `staff`, `lists`, `refs`, `holders`, `dump`, `find`,
`types`) on a copy of a career, game date 28 January 2028. Seven clubs were read: Manchester
United, Inter Miami, Arsenal, Chelsea, Barcelona, Newcastle United and Wrexham. The readings
wrote nothing. One guarded swap was then tried on the same career copy (section 7). Addresses
are RVAs (game_plugin.dll+0x...). macOS was not read.

Offsets are from the staff object start unless another record is named.

## Summary

| Item | Status | Confidence |
|---|---|---|
| 1. Where a club keeps its board | found | high (seven clubs) |
| 2. Board contract record | found | high for layout, low for `+0x24` |
| 3. Staff record on Windows | found | high |
| 4. Everything else that points at a board member | found | medium |
| 5. People without a club | found | medium |
| 6. The game's own board classes | names only | low |
| 7. Changing who holds a seat | one swap tried, shows in FM after save and load | medium |
| 8. Removing or adding a seat | not safe yet | - |
| 9. A player as a board member | not possible | high |

## 1. Where a club keeps its board

Status: found.

Where:
- Club object `+0x110` is a pointer to a 0x20-byte block: `+0x00` first entry, `+0x08` end,
  `+0x10` end of room, `+0x18` zero. Each entry is a pointer to a staff object start.
- The list held every board member and nobody else at all seven clubs: Manchester United 15,
  Chelsea 7, Newcastle United 7, Wrexham 9, Arsenal 3, Inter Miami 2, Barcelona 1.
- Jobs seen in the lists: 4 chairperson, 6 director, 8 managing director, 66 owner,
  70 president. This matches `BOARD_JOBS` in `crates/fmlens-core/src/best.rs`.
- Entries are in ascending uid order at all seven clubs, not by job. The owner was first at
  Manchester United, a director first at Newcastle.
- Count equals room at every club, so the list is always full.
- FM shows the board on the club's Staff page (First Team, Staff, All Staff) with the jobs
  Owner, Chairperson and Director. FM's search does not find board members.
- The medical, coaching and scouting lists at club `+0x60`, `+0x78` and `+0x90` hold no board
  member. Nothing in the team records points at one.
- Club uid is at club `+0x0C`. Club records are 0x170 apart.

Guard: the club's uid matches, `+0x110` is not zero, the block's `+0x18` is zero, count is 1 to
60 and no more than room, and every entry is a staff object whose contract names this club's
senior team with a board job.

## 2. Board contract record

Status: found. The meaning of `+0x24` is a guess.

Where:
- 0x28 bytes, vtable `+0x4C05078`. Records of different clubs sit back to back in one block.
- `+0x08` person block of the holder (staff object `+0x100`).
- `+0x10` team and `+0x18` senior team. Both were the club's senior team for all 44 board
  members read.
- `+0x20` wage per week, u32. Zero for most directors.
- `+0x24` u16: 157 for the owner, 38 for directors, 1 for chairpersons and presidents, 2 for
  managing directors, 0 for people the game made during the career. A goalkeeping coach had 0
  and a physio 10. It looks like the database's job title number. It belongs to the seat.
- `+0x26` job, u8. `+0x27` zero.
- The only pointer to a board contract is its holder's staff object `+0x1A8`.
- Coaches and medical staff use a longer record with dates, vtable `+0x4C04B08`. The class
  names `GAME_CONTRACT` and `GAME_FULL_CONTRACT` exist. Which vtable is which was not confirmed.

Guard: vtable is `+0x4C05078`, `+0x08` is the holder's person block, team equals senior team,
job is one of the five board jobs, `+0x27` is zero.

## 3. Staff record on Windows

Status: found.

Where:
- Staff objects are 0x240 apart. `+0x00` vtable `+0x4E90848`, `+0x08` vtable `+0x4DB6758`,
  attributes from `+0x10`.
- `+0xB8` u32 copy of the wage, 0xFFFFFFFF when there is none.
- `+0xBC` u32 copy of the club uid, 0xFFFFFFFF when there is none. Both copies matched the
  contract for 43 of the 44 board members. A chairperson the game made during the career had
  no club copy, and one person without a club still held an old club and wage, so the copies
  are not proof of a current job.
- `+0xC8` date joined (u16 day of year, u16 year; day 1 of 1900 means unset). The Manchester
  United owner read day 152 of 2005.
- `+0x100` person block, vtable `+0x4E908B8`. `+0x108` row number, `+0x10C` and `+0x110` uid.
- `+0x1A8` contract pointer, zero without a job.

Note: the macOS ARM64 build read in `fm27-staff-extras.md` has the person block at `+0xF8` and
the contract pointer at `+0x170`. The Windows offsets here are not the macOS ones.

## 4. Everything else that points at a board member

Status: found for one owner. Not repeated for a second person.

Where, for the Manchester United owner:
- Staff object: the club's board list and one game-wide sorted list of staff. Nothing else.
- Person block: two game-wide sorted lists of people, his contract, and three 16-byte entries
  in small lists. Each entry is a pointer followed by eight bytes of kind and strength. The
  entries beside them point at other people, a club and a team, so these are relationship
  lists. They follow the person, not the seat.

## 5. People without a club

Status: found.

Where: three staff without a job had a zero contract pointer and sat in no club list. Two had
0xFFFFFFFF in the club copy at `+0xBC`. One still held an old club uid and wage.

## 6. The game's own board classes

Status: names only.

Class names present: `BOARD_TAKEOVER_MANAGER`, `CONTRACT_MANAGER`, `GAME_CONTRACT`,
`GAME_FULL_CONTRACT`, `db::ACTUAL_NON_PLAYER`, `db::ACTUAL_PLAYER_AND_NON_PLAYER`,
`db::HUMAN_NON_PLAYER`. No class name holds OWNER or CHAIRMAN beyond news items. What the
takeover manager holds, and whether it names people, was not read.

## 7. Changing who holds a seat

Status: one swap tried on a career copy, see Trial below. Not enabled in the app. The seat
(contract record and list slot) stays where it is and only the person in it changes, so nothing
is allocated or freed.

Swap two board members, A at one club and B at another:
- A's club board list: the slot holding A now holds B. B's club list: the slot holding B now
  holds A.
- A's contract `+0x08` becomes B's person block, and B's contract `+0x08` becomes A's.
- A's staff `+0x1A8` becomes B's old contract, and B's becomes A's old contract.
- The wage and club copies at `+0xB8` and `+0xBC` are exchanged.

Seat a person without a club in place of A:
- The list slot and A's contract `+0x08` take the new person.
- The new person's `+0x1A8` takes the contract and their copies take the seat's wage and club.
- A's `+0x1A8` becomes zero. A is then shaped like the game's own staff without a club.

Guard, on top of sections 1 and 2:
- Both people are staff objects (vtable `+0x4E90848`) with a person block whose uid is repeated
  at `+0x10C` and `+0x110`. Neither is a player or the human manager.
- The person leaving is in the board list once and in none of the club's other staff lists.
- The person arriving has a board contract at another club, or a zero contract pointer and no
  place in any club list.
- Every value is compared with what was read before it is written, then read back.

Trial (14 November 2026, career copy, game date 28 January 2028): the Manchester United owner
and an Inter Miami director were swapped with the eight writes above. Each value was compared
with the reading first and read back after.
- Before: FM's Staff page listed the owner at Manchester United with the job Owner and the
  director at Inter Miami with the job Director.
- Straight after the writes the probe read the new holders in both seats. FM's Staff page still
  showed the old holders, also after leaving the page and coming back.
- After saving under a new name and loading that save, FM's Staff page showed the former
  director at Manchester United with the job Owner, and the former owner at Inter Miami with
  the job Director. The former owner was no longer in Manchester United's list.
- The probe after the load read the same: the owner seat (wage 10000, `+0x24` 157, job 66) with
  its new holder first in Manchester United's list, and both copies at `+0xB8` and `+0xBC`
  matching the seats.
- Both lists stayed in uid order because each new uid fell in the old one's place. A swap that
  breaks the order was not tried, so the write must keep the list sorted or refuse.
- Date joined at `+0xC8` was left with the person. A click on a board member's row selected the
  row and opened no profile.
- The career was then played on by holiday for seven days, from 28 January to 4 February 2028,
  through a league match, the close of the transfer window and the month end. FM kept
  responding. Both Staff pages and the probe still showed the swapped holders, and both lists
  read as before. Manchester United's Club Info page opened as usual.

Still to prove in FM on a career copy before any of this is enabled:
- FM shows the change without a save and load (FM Lens refreshes FM's panels after its own
  edits; that was not tried here).
- Quit FM and load again, then play on through a season end. One month end has passed.
- A swap that changes the uid order of a list.
- What FM writes to the copies at `+0xB8` and `+0xBC`, and to date joined at `+0xC8`, when a
  director leaves or joins by himself.
- A takeover in progress, and a takeover after the change.
- Whether the ownership kind at club-info `+0x129` (`fm27-nations-clubs-2.md`) needs to agree.
- The same layout on macOS ARM64 and Intel.

## 8. Removing or adding a seat

Status: not safe yet.

- Removing a seat would leave its contract record in the shared block with a person and a team
  still named in it. Who walks that block is not known.
- Adding a seat needs room in a list that is always full, and a new contract record. Both need
  the game's allocator.

## 9. A player as a board member

Status: not possible.

A board seat names a staff object. A player has none unless the game has made him a
player and non-player (`db::ACTUAL_PLAYER_AND_NON_PLAYER`). A player who is still playing
cannot be seated without building a new record.
