# Scouting: what needs the running game (13 November 2026)

Two requested parts of the scouting work need mapping in a running FM27 and
were not built. Nothing here was checked in the game.

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

The lists of top players cover the world, a continent and a country. A
division needs the league each club plays in this season.

The competitions table is read (`crates/fmlens-core/src/competitions.rs`), and
its rule data names a competition's level, but no link from a club or team to
its league is mapped. Candidates to trace: the team's current competitions
(fixtures or table entries) and the league's list of teams for the season.
Confirm on clubs of several levels in two countries, after a promotion and
relegation, before offering a division list.

## Community-wide development records

The Scout tab shows how a player developed in the user's own careers. Pooling
those records across users would need FM Lens's relay to accept and store
them. That is a privacy and product decision for the owner, not built.
