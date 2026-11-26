# FM27 recon: signing staff through the game

Build: Steam 26797085 (27.1.1), Windows. Method: the calls were run against a
running game on 26 November 2026 on the test career `FM-Lens-Max-2026-11-25`,
in-game date 20 July 2028, with `fmlens-probe staff-sign`. macOS was not run.

## 1. Why the game has to do it

FM Lens moves an employed member of staff by rewriting his contract and the
two clubs' staff lists (`staff_move.rs`, `plan_staff_move` and
`plan_staff_job`). That route cannot do two things.

- A club's staff lists are vectors the game sized. After a load every list
  read had its end at its capacity (Arsenal's scouting list 16 of 16), so
  there is no slot to write a new member into, and writing past the end would
  be writing into memory the game has not given the list. The route refuses
  with `DepartmentFull`.
- A member of staff without a club has no contract object to rewrite. The
  route refuses with `Unemployed`.

## 2. The call

The game's own signing routine, the one FM Lens already calls to sign a free
agent player and to move the human manager (`sign_free_agent` in the build
profile), takes a member of staff too:

```
sign(transfer_manager, person_block, senior_team, terms_map, references, 0)
```

- `person_block` is the member's person block: staff object plus the layout's
  `actual_person` offset.
- `senior_team` is the club's senior team.
- `terms_map` is a map with one entry, key `'Pcjo'`, an integer Value holding
  the contract job code (2 Coach, 14 Scout, 12 Physio, 10 Director of
  Football and so on; the codes are those of `STAFF_JOBS`).
- The map and the references list are made and dropped with the game's own
  `map_new`, `map_insert`, `map_drop` and `refs_drop`.

In code: `Session::run_staff_signing` in `game_calls.rs`; planned and applied
by `plan_staff_signing` and `sign_staff` in `staff_move.rs`.

## 3. What the game does

| Case | Seen |
|---|---|
| Employed, into a full list: Mark Gower (2004253), Scout at Liverpool, to Arsenal as Scout | His old contract ended and a new one made on Arsenal's teams. Arsenal's scouting list grew from 16 of 16 to 17 of 24: the game allocated the room itself. Liverpool's list one shorter |
| Unemployed: Antonio Conte (8088) to Arsenal as Coach | A contract made where there was none, and he joined the coaching list |
| Unemployed, Director of Football where there is one: Thomas Tuchel (35015767) to Liverpool, job 10 | Liverpool's director pointer (club + 0x148) on Tuchel. Markus Krösche (6000747), who held the job, released: no contract |
| Same club, another department: Gower, Arsenal Scout to Physio | Out of the scouting list and into the medical list |

The game writes the contract's wage and dates itself. For an employed member
FM Lens writes his old wage and expiry back afterwards (and, for a job change
at the same club, the signed and joined dates); an unemployed member keeps
what FM gave him.

## 4. Undo

None. The game frees the old contract object and may release another member
of staff, and there is no record FM Lens could write back that would rebuild
either. The change is logged as permanent and the dialog says so before it is
made.

## 5. Staff retirement

The retirement manager's lists hold staff as well as players, keyed by person
id (24-byte entries, person id at +0, date at +0x0C). A member of staff's
person id sits at the same distance from his identity block as a player's
(`retirement.player_person` minus the player's identity offset, added to the
staff identity offset): read that way, every staff entry on the test career
resolved to a name. The save had 465 planned retirements, 233 of them staff;
5 of those were employed.

`plan_keep_working` in `retirement.rs` removes a member's entry the way
`plan_keep_playing` removes a player's. Staff have no trait to swap.

## 6. Open

- macOS: the same call, not yet run with a member of staff.
- Whether the game plans a member of staff's retirement again after the
  entry is removed. Two days of Continue past the dates planned nothing new
  for the two members tried; a longer run has not been made.
- An employed member of staff with a planned retirement: not tried.
