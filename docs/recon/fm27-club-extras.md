# FM27 club and team extras (read-only recon)

Scope: where team cohesion, tactical familiarity, player morale, club links and
contract/loan details live in FM27 memory. Everything here was found read-only
(probe `club`, `clubs`, `teams`, `player`, `staff-member`, `lists`, `dump`,
`column --find`, `refs`, `clauses`, `types`, plus objdump of the arm64 slice).
Nothing was written to the game. Guesses are marked "guess".

## Build and method

- Build: Steam 26340721, macOS arm64. Layout files: `profiles/fm27/layout-macos.toml`
  and `steam-26340721-macos-arm64.toml`. Entity arrays on macOS: players
  `game_plugin+0x56d2e18`, staff `+0x56d2e60`, clubs `+0x56d2fd0`. The Windows rva
  `+0x5705988` is wrong here.
- Objects follow the Itanium ABI: vtable at word 0, RTTI mangled names, so class
  names resolve from the vtable (`N2db4CLUBE`). FM strings are a u32 length then
  UTF-8. Dates are a u16 day-of-year (low 9 bits, flags above) plus a u16 year;
  1 Jan 1900 means unset.
- Method for the three priority-1 items: trace the game's own editor actions
  `maximise_team_cohesion`, `maximise_tactical_understanding`, `change_morale`
  (strings at 0x5155ce3, 0x5155cfa, 0x5155cd5). The UI handler in vtable slot 7
  (a check for message id 0x2c) calls the real logic: 0x2391a30 (cohesion),
  0x2392540 (tactical understanding), 0x2391400..0x2391a30 (team morale). Then
  verify fields against live Arsenal memory.

## 1. Player morale (confirmed)

| Field | Where | Encoding |
|---|---|---|
| Morale | player+0x264 | u8, clamped 1..20 by the game (`cmp #0x14`) |
| National-team morale (guess) | [player+0x118 INTERNATIONAL_PLAYER_DATA]+0xBA | u8, also clamped 1..20 |

- The game's own morale action reads and writes `[player+0x264]`, then sets bit
  0x40 in the u16 at `[vbase2]+0x102` (dirty flag) and calls the notifier
  (vtable +0xA0). A direct byte write works for display; the dirty bit is what
  the game sets for persistence.
- Check in FM (Arsenal): Rice 10, Saka 7, Pacho 1, Calafiori 12. Squad range is 1..12.
- Confidence: high for offset and range. The "max" value is 20. Scale labels
  (which number is "Superb") not checked against the UI.

## 2. Team cohesion (action traced, semantics partly guess)

The game's `TEAM_IMPROVE_TEAM_COHESION_ACTION` does not set a team scalar. For
each player in `team+0x38..0x40` it edits the person's relations record
(`player+0x2C0`), whose second list at `+0x18` (begin, end, cap) holds 8-byte
entries:

| Entry offset | Meaning |
|---|---|
| +0 u32 | internal id of a club (`club+0x08`) or nation (`nation+0x08`) |
| +4 u8 | kind: 1 club, 2 nation |
| +5 u8 | familiarity 0..100 |
| +6 u8 | flag, 0 or 1. The action only touches entries with +6 == 0 and kind 1 or 2 |
| +7 u8 | unknown |

- The action sets `+5 = 100` on the entry matching the team's club
  (`team+0x30`, `club+0x08`), or appends `{club id, kind 1, 100}` when missing,
  then calls the changed notifier (vtable +0xA0). No dirty bit.
- Verified live: every Arsenal player has a kind-1 entry with id 331 (Arsenal
  internal id; UID 602). Nation ids: England 139, Georgia 144, Greece 146, Brazil 189.
- Values to compare with FM's player screens (club familiarity, Arsenal):
  Rice 100 (England 94), Saka 100 (England 68), Gabriel 100 (England 100, Brazil 53),
  Konsa 48, Pacho 50, Raya 100, White 75 (and West Ham 100, id 462).
- Guess: what FM27 calls team cohesion is derived from these per-player club
  familiarities. No team-level scalar was found.
- Safe edit rule: only change existing entries (set +5 to 100). Appending needs
  vector growth and is not safe from outside the process.
- Separate system, not located: FM27 chemistry/buy-in (classes
  `chemistry::PLAYER_BUYIN_CHANGE_*`, `PLAYER_BUYIN_MANAGER`,
  `TEAM_CHEMISTRY_UPDATE_NEWS`, "Devotee" status).

## 3. Tactical familiarity / understanding (partial)

`TEAM_MAXIMISE_TACTICAL_UNDERSTANDING_ACTION` works on per-player records at
`[player+0xF8]`:

- Eight 32-byte blocks at `record+0x20*i`. Each is a vector (begin, end, cap) of
  4-byte entries; the block kind byte is at `+0x18`. Kinds 6 and 7 live in a hash
  at `record+0xC0`.
- Entry: low 14 bits = value 0..10000 (9972 and 8222 seen), bits 14..19 = signed
  6-bit key.
- The action raises each value to 10000 via function 0x47FE7E8 (record, 58-byte
  formation-slot entry, 10000), sets byte `record+0xDC = 1` and bit 0x80 in the
  u16 at `[vbase2]+0x102` (dirty flags).
- Observed: Rice and Saka about 9972; new signings (Gyokeres, Konsa) about 1800 to
  6600; youth player Mora about 3193.
- Unknown: what each key means (guess: formation slot or role). Do not edit
  without a proper trace of 0x47FE7E8.
- The function tail also writes a 100 byte at +8 of per-person records in the
  human manager's FOG_OF_WAR record (global singleton `game_plugin+0x56A8430`,
  array at +0x18 indexed by the manager's u32 at +0x3E4). Guess: knowledge
  percent. Low confidence.

## 4. Club object

Club (`N2db4CLUBE`) known offsets: uid 0x0C, teams 0x18, relations 0x48, name
0xC0, info 0x100, links 0x118 and 0x120, finance 0x150, staff lists 0x60, 0x78, 0x90.

### Relations list, club+0x48 (read)

16-byte entries: `+0` target pointer, `+8` u8, `+9` u8, `+0x0A` target kind
(1 club, 3 person, 4 team), `+0x0B` relation code, `+0x0C` value, `+0x0D` byte.
Club to club uses code 5, value 0..100. Guess: rivalry strength.
Check: Arsenal to Tottenham 100, Man City to Man United 100, Man City to
Liverpool 45. Arsenal has 33 entries.

### Links and affiliations, club+0x118 (read, strong lead)

List of pointers to link records:

| Offset | Meaning |
|---|---|
| +0x00 | owner club |
| +0x08 | other club |
| +0x10 u32 | amount-like (Arsenal to Boreham Wood 100000) |
| +0x14 u32 | type flags: 0x0001, 0x0209, 0x0401, 0xC209, 0x0108, 0x0041, 0x0501, 0x0801, 0x0F |
| +0x1C u32 | unknown |
| +0x20.. | dates (+0x20 start; others often 1900 or 2027 renewal) |

- Man City (UID 679): Al-Jazira, Right To Dream Academy, Melbourne City, Yokohama
  F. Marinos, New York City FC, Girona, Montevideo City Torque, Atletico Venezuela,
  Nordsjaelland, Shenzhen Peng City, Anderlecht, Lommel, ESTAC Troyes, Club
  Bolivar, Palermo, Basaksehir (City Football Group), plus a self entry.
- Chelsea: RC Strasbourg (0x0209). Arsenal: Boreham Wood. Barcelona: Barcelona B,
  Barcelona C, Olot, Lago, Be Sport Academy, Sant Cugat (0x0801), FCB Escola,
  Barca Residency USA, Qairat Almaty.
- Unknown: which type bits mean parent versus feeder versus partnership.
  `club+0x120` is a second similar list. Barcelona's `club+0x30` list holds a TEAM
  pointer (guess: affiliate or B team).

### Info record, club+0x100 (0x180 bytes)

- Supporters: traits at +0x100 and +0x114, mix at +0x106 and +0x11A. The two
  copies differ slightly (patience 12 vs 11, hardcore 6 vs 7); which is current
  is unknown. Existing layout reads mix 0x106, traits 0x114.
- Arsenal: season tickets 42084 at +0xC0, founded 1886 at +0xD8, mix
  6/27/22/19/4/22, traits 16/9/11/17/15/15.
- Dates at +0x88/+0xA0/+0x8C/+0xA4/+0x90/+0xA8 are identical across clubs (guess:
  season windows). +0xBC is a per-club date near today (Liverpool 2027-12-08,
  Arsenal 12-04; guess: last update). +0xB8 set only for Arsenal (2027-06-08),
  meaning unknown.

### Finance record, club+0x150 (db::CLUB_FINANCE, 2304 bytes)

Arsenal at 0x7b8a8008b0: balance +0x0C 190,893,144; transfer budget +0x7C4
1,048,517; wage budget +0x814 5,406,587; total wage budget +0x808 6,503,366.
Many i32 figures at 0x27C..0x6A4 (+0x548 427,492,585; +0x4CC 375,345,509;
+0x55C 154,937,307; +0x560 158,669,426; +0x678 155,000,000; +0x7FC 792,400,000;
+0x7CC 38,175,000; +0x7D4 152,700,000). Income streams are not mapped; the
FM finance screen values are needed to label them.

### Human manager details

`CLUB_HUMAN_MANAGER_DETAILS` (0x7b8418f900) is reached from team +0xA0
(fixture/info record) then +0xC8; probably only for the human-managed club
(guess). Holds a team pointer (+0x40), SUPPORT_STAFF pointers (+0x48, +0x50,
+0xA8), two 20-byte arrays of values 0x20..0x43 (+0xD8), a 5-entry list at +0x118
(player pointer, date). Meaning unknown; candidate for board confidence.

### Team object (db::TEAM, 0xB8)

+0x30 club, +0x38 players, +0x78 STADIUM, +0x80 human manager, +0x88 captain, +0x90
vice, +0xA0 fixture/info record, +0x50 and +0x60 COMP pointers, +0xA8 reputation.

## 5. Contracts and loans

Contract: owner 0x08, team 0x10, senior team 0x18, wage 0x20, signed 0x44,
expires 0x48, joined 0x4C, clauses 0x68. Clause entry (clauses.rs): u32 amount
(0xFFFFFFFF none), u16 condition (0xFFFF none), u16 kind. No contract has spare
clause room (0 of 28639), so adding clauses is not possible in place.

Kinds seen in this save (contract counts) versus what the app names:

| Kinds | Count | Status |
|---|---|---|
| 0 release, 1 relegation release | 5817, 246 | named |
| 3 yearly wage rise (condition percent) | 4932 | named |
| 10 seasonal landmark goals | 959 | named |
| 15 relegation wage drop | 2942 | named |
| 19, 22 (optional extension, years), 27 | 104, 10616, 68 | named |
| 32 appearance, 33 goal, 34 clean sheet | 22872, 4146, 10767 | named |
| 38 unused sub, 39 assist, 40 landmark assist | 22749, 5048, 1101 | named |
| 2 | 36 | unnamed, amount only |
| 4, 5, 6, 8, 9, 11, 12 | 6901, 2202, 102, 432, 3, 958, 80 | unnamed, no amount. Kind 8 condition matches kind 3 in examples (Nico Paz 10, Kvaratskhelia 5): guess, a wage rise variant |
| 13 | 5707 | unnamed, amount with condition 20/25/40; guess: landmark appearances bonus |
| 14, 16, 17, 18, 20, 25, 26, 28, 30, 31, 37 | 2726, 245, 59, 397, 7, 7, 135, 37, 138, 41, 129 | unnamed |
| 41, 54, 55, 58, 63 | 469, 8, 19, 2, 36 | unnamed |

688 contracts also carry competition bonuses. Example scan results (condition is a raw u16, 0xFFFF none):

- 2: amount only (Liameed 2,148,330, Ljubicic 859,031), appears next to a release clause; guess: a fee-type clause.
- 4, 5: no amount, condition 20, 35, 45, 50, 100 (percent-like), often together with 3; guess: wage-rise or bonus percent variants.
- 6, 12: no amount, no condition (flag clauses; 12 sits beside 16).
- 9: amount ~2.1M with condition 7 (Sylla).
- 11: no amount, condition 15 or 20 (percent-like); 14: condition 25 (percent-like, with 15).
- 16, 17: large amounts (24.6M Sarr, 36.2M Krejci), no condition; guess: fee or sell-on style clauses.
- 8: condition 5 (Yeremay), matches kind 3 style.
None of these were checked against FM's contract screen, so treat the labels as guesses and compare named players before labelling.

### Loans

- The loaned player's contract keeps `team` (+0x10) and `senior team` (+0x18) as
  the parent club. The player's team pointer (+0x128) is the borrowing club.
- Contract +0x50 holds a date only for loaned-out players (White 2027-07-08,
  Merino 2026-07-13). Guess: loan start.
- FULL_CONTRACT objects (about 0x160 bytes) embed a second FULL_CONTRACT at +0xC8
  (+0xD0 owner, +0xD8 team, +0xE0 senior team, +0xE8 wage, +0x10C.. dates). For
  loaned players the embedded team is the borrowing club (White to West Ham,
  embedded wage 153,664; Merino embedded wage 77,000). Rice's embedded contract
  is England (wage 684).
- Unconfirmed: loan end, fee, wage split. Loan clauses (recall, option to buy,
  buy-back, wage contribution) are not in the clause list; classes
  `LOAN_OFFER*`, `OWN_PLAYER_LOAN_HAS_RECALL_CLAUSE`,
  `BUY_BACK_LOAN_CLAUSE_RESPONSE_OBJECT` exist elsewhere.
- Arsenal loanees to check: White (West Ham), Merino (Real Hispalis), Mosquera
  (Blu-neri Milano), Harriman-Annous (Huddersfield).

## 6. Not found

Kits and colours (RGB_COLOUR and MATCH_TEAM_KIT_SYSTEM classes exist; no field in
the club or team subtrees, guess: stored outside), ownership and benefactor,
extra staff allowed, board vision and expectations (classes
`CLUB_VISION_EDIT_SESSION`, `GAME_CLUB_VISION_OBJECTIVE`,
`SEASON_EXPECTATION_RESPONSE_OBJECT`; `instances` timed out, so no object
located), tactical style, youth intake rating and pending intake, per-team
cohesion scalar.

## Reliability summary

| Item | Read | Edit | Confidence |
|---|---|---|---|
| Player morale, player+0x264 u8 1..20 | yes | yes (set dirty bit 0x40 at [vbase2]+0x102 as the game does) | high |
| Club familiarity entry in player+0x2C0 list +0x18 | yes | existing entries only, +5 to 100 | medium-high |
| Club links, club+0x118 | yes | no | medium (types unknown) |
| Club rivals, club+0x48 | yes | no | medium |
| Supporter mix/traits, club+0x100 | yes | no (two copies) | medium |
| Loaned contract embedded record, +0xC8 | yes | no | medium |
| Clause kind inventory | yes | no | medium |
| Tactical understanding, [player+0xF8] | partial | no | low |
| Finance streams, club+0x150 | partial | no | low |

## Open questions

- Which link type bits mean parent, feeder or partner.
- Meaning of tactical-understanding keys and the exact persistence rules.
- Income stream to field mapping (needs FM finance screen values).
- Loan end, fee, and wage split fields.
- Kits, ownership, board vision, intake, staff allowance, chemistry/buy-in storage.
- Which supporter copy (+0x100 or +0x114 block) is authoritative.
