# Scouting: what needs the running game (13 November 2026)

What the scouting work needed from a running FM27, and what came of it.

## In-game scout card

The request: hover a player's (i) button in FM and an FM Lens card appears over
the game; hold Shift for his potential.

What it needs, in order:

1. **Which person FM's hover is on.** FM shows its own player card when the
   pointer rests on an (i) button, so the UI holds the person it is about to
   show. That person, or the widget that holds it, has to be found: trace the
   tooltip or info-button handler in `game_plugin` from the GAME_UI object
   (`N11game_plugin7GAME_UIE` on macOS, `.?AVGAME_UI@game_plugin@@` on Windows,
   see `crates/fmlens-core/src/refresh.rs`), and confirm by reading the person's
   UID while hovering several players on different screens. A read of plain
   memory is enough once the path is known; no game call should be needed.
2. **Polling it.** Read that slot a few times a second while FM is in front,
   and stop when FM Lens is closed or FM loses focus.
3. **The card window.** A second Tauri window: borderless, transparent, always
   on top, ignoring the mouse, placed near the pointer, inside the screen. It
   reuses the list row data (`player_row`) and `scout_report`.
4. **Shift.** A global key-state read (no keyboard hook): on macOS
   `CGEventSourceFlagsState`, on Windows `GetAsyncKeyState(VK_SHIFT)`. Neither
   needs new permissions; a hook or a key logger must not be used.

Checks before shipping: macOS ARM64, Intel under Rosetta and Windows; full
screen and windowed FM; the card never steals focus or a click from FM; it
hides at FM's main menu and when another save loads.

## Top players by division

Built for Windows; established in the running game on Steam build 26577676
(27.0.1), on a career copy at 30 June 2027, after the 2026/27 season ended.
Read-only throughout.

A team (`db::TEAM`, 0xB8 bytes) points at competitions (`db::COMP`):

| Offset | Holds |
| --- | --- |
| `0x50` | The division it plays in this season |
| `0x60` | Last season's division: differs only for a promoted or relegated club |
| `0x98` | Its continental competition, null for none |

How it was established: the senior teams of over 30 clubs were read with the probe
and each pointer followed to a competition's UID and name.

- Unchanged clubs hold the same division at both offsets: Arsenal, Everton,
  Brentford, Leeds and Coventry the Premier League (UID 11); Wolves, Burnley,
  Southampton, Sheffield United and Norwich the Championship (12); Luton
  League One (13); Barnet League Two (14).
- Promoted clubs hold the new division at `0x50` and the old at `0x60`:
  Middlesbrough and Birmingham 11 and 12, Leicester 12 and 13. FM's own club
  page for Middlesbrough names the Premier League as its current league.
- Relegated clubs the same: Sunderland, Fulham and Ipswich 12 and 11, West
  Bromwich Albion 13 and 12.
- Other countries: Real Madrid the Spanish First Division (67), Leganés the
  Spanish Second Division (68), Bayern the Bundesliga (22).
- Women's clubs: Sunderland and Ipswich the Women's Super League at `0x50`
  and WSL 2 at `0x60`; Southampton, Leicester and Burnley WSL 2.
- Continental: Arsenal, Real Madrid and Bayern the UEFA Champions League.

FM Lens reads `0x50` of the senior team of each player's club and accepts it
only when it is one of the competitions in the game's table; anything else is
no division. The offset is in the Windows layout only. macOS is not mapped,
so the division choice does not show there.

Not checked: a club with no league this season, a country whose leagues are
not loaded, and the offset on macOS (ARM64 and Intel) and Game Pass.

## Community-wide development records

The Scout tab shows how a player developed in the user's own careers. Pooling
those records across users would need FM Lens's relay to accept and store
them. That is a privacy and product decision for the owner, not built.
