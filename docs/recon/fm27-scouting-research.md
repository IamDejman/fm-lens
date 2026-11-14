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

### What the live trace found (13 November 2026, Windows)

Steam build 26577676, read-only probe. FM's own hover card was raised for David
Raya (UID 29111433) and then for Illan Meslier (49040115) on Arsenal's squad
screen, and every word in memory pointing into each player's object was listed
before, during and after each hover (`refs --span 0x400`).

- Raya had 158 references with no card, 158 with his card up and 122 once the
  pointer moved to Meslier; Meslier went from 41 to 80. The references that
  switched follow the screen's row and card widgets, which are rebuilt on each
  hover, not one slot that is reused.
- The one fixed slot that followed the card, an entry at
  `game_plugin.dll+0x581ed40` (index 2 of 3,597), belongs to
  `PLAYER_ABILITY_CHANGE_ADVICE_SUGGESTION` (backroom advice on player
  development), not to the card.
- The card is drawn by the game's Unity layer, so the person it shows is most
  likely held in managed objects rather than in `game_plugin`'s native memory
  (not proven).

Result: no stable native read gives the hovered player.

### The managed path (13 November 2026, Windows)

Same build, FM27's IL2CPP layer (`GameAssembly.dll`, metadata version 0x27),
read only. The card's person is reachable from one static field:

| Step | Read |
|---|---|
| Static root | `SI.Bindable.Tooltip+Visuals.s_floatingElement` (static field +0x0): an `SI.UI.FloatingElement` |
| Card open | `FloatingElement` +0x68 (`m_target`): non-zero while a card shows, 0 once it closes |
| Card tree | `FloatingElement` +0x28 (`m_root`, "floating-element-root"); each `VisualElement` has its name at +0x38 and its children (`List`) at +0x290 |
| Player card | A `BindableVariableSizedGridElement` named `PlayerReportHeaderTooltip` (with `PlayerAttributesBlock`, `CoachScoutReportBlock`, `PlayerHappiness`, `PlayerPositionalTooltip`) |
| Bound person | The `SI.Bindable.BindingVariables` element "person-portrait": +0x2c8 core, core +0x10 value variables (`List`), the variable "personBind" +0x20 scope value, scope +0x28 an `SI.Bindable.DynamicReference` |
| UID | The reference is a dictionary keyed by four-letter codes (entries at +0x18, count at +0x20, 0x18 bytes each, value at +0x10): key `unid` holds a numeric value whose +0x18 is the person's UID |

Checked by hovering the icon by a player's name on Arsenal's squad screen:
Raya read 29111433 and Saliba 49039004, both as the probe gives them; with the
pointer moved off, `m_target` went to 0 and the tree emptied (4 elements). The
row under the pointer holds its own "personBind" for the same player, so the
card's tree, not the row, is the one to read.

Finding the class takes one scan of FM's memory: the class whose name is
`Visuals` and whose declaring type (+0x50) is `SI.Bindable.Tooltip`
(`Il2CppClass`: name +0x10, namespace +0x18, parent +0x58, self +0x78, fields
+0x80, static fields +0xb8). A test reader in C# took 10 to 20 seconds; it is
done once per game start.

The card is built on this path for Windows (`app/src-tauri/src/scout_card.rs`).
It finds the class once per game start, then every 120 ms reads `m_target`,
walks the tree to the player card and reads the UID. FM keeps the same root and
target when the pointer moves straight from one player's (i) to another's, so a
remembered path is used again only while each element still lists the next as
a child; otherwise the tree is searched again.

Checked on Windows on 13 November, FM27 Steam build 26577676, on a career copy
at 10 December 2027, with a release build of the branch:

- The card showed the hovered player, and the next one when the pointer moved
  straight between players, on the squad, player profile and scout report
  screens; nothing stale over an attribute's tooltip.
- Shift showed the peak view; letting go went back.
- A click on the card's place went to FM (the window under the point was FM's,
  and FM stayed in front); the card window never took focus.
- It went when the pointer left, when another window came to the front and at
  FM's main menu, and followed FM to another save and back.
- The Settings switch hid it and brought it back.
- FM full screen (1024 x 768, borderless) and in a window.
- Faces, club logos and flags from the game's install; initials for a player
  with no face.

Not checked: staff cards (the card shows players only), macOS (Apple Silicon
and Intel) and Game Pass.

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
