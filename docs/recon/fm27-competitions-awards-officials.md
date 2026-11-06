# FM27 competitions, awards and match officials (macOS ARM64)

Read-only reverse engineering. No memory was written, the FM UI was not touched.

## Build

- FM27 Steam build 26340721, ARM64 macOS, disposable career loaded.
- `game_plugin` base in the probed process: 0x160cc8000. All RVAs below are `game_plugin+RVA`.
- Heap addresses are per-process and are examples only.

## Method

- `instances <class>` (vtable scan) and `scan` (global begin/end pointer arrays) from `fmlens-probe`.
- Bulk reads of each contiguous pool into files, then offline analysis (histograms per offset, comparison against well-known entries).
- Names use the text.rs convention: FM string = u32 length + UTF-8. "Name entry" = pointer to pointer to FM string.
- Dates: u16 day-of-year (1-based, low 9 bits) + u16 year. Checked: Michael Oliver 20 Feb 1985 = day 51, Marciniak = day 7 of 1981, Turpin = day 136 of 1982.

Vtable RVAs: db::COMP 0x559ed88, db::AWARD 0x559b4a0, db::NATION 0x55b5c40, db::OFFICIAL 0x55b6838, db::CONTINENT 0x55a06b0, sicomps::ACTUAL_COMP 0x566c2b8, GAME_OFFICIAL 0x55e1830 (1 instance, a manager singleton), GAME_COMP 0x55e0338 (0 found), GAME_AWARD 0x55df4e0.

## Enumeration

| Class | Count | Root | Stride |
|---|---|---|---|
| db::OFFICIAL | 1166 | global (begin,end) pointer array at RVA 0x56d2e90, elements contiguous | 0x148 |
| db::NATION | 251 | contiguous inline pool, no global root found | 0x208 |
| db::COMP | 8237 | contiguous inline pool, no global root found | 0x1b0 |
| db::AWARD | 3902 | contiguous inline pool, no global root found | 0xa0 |

Comps, awards and nations are inline arrays of objects (vtable at +0, index at +8). A reader can enumerate officials from the global array right away. For the others: find any one object (vtable scan, slow, minutes under load) then walk by stride validating the vtable. A static root for the three pools was not found (a heap search for the exact begin/end pair of the comp pool returned 0 hits). Index i of the pool sits at `pool_base + i*stride`. Example: Premier League is index 7 = pool_base + 7*0x1b0.

Other global arrays seen with `scan` (for reference): SUPPORT_STAFF x1991 0x56d2ea8, FIXTURE_NAME x5154 0x56d2f38, JOURNALIST x368 0x56d2e78, NATIONAL_TEAM_CONTAINER x251 0x56d2ec0/0x56d2ed8.

## db::NATION and db::CONTINENT (identity link targets)

| Offset | Field | Confidence |
|---|---|---|
| +0x08 | u32 index | high |
| +0x0C | u32 UID (Algeria idx 0 UID 5, England idx 139 UID 765) | high |
| +0x18 / +0x20 / +0x28 / +0x30 | FM strings: name, long name, 3-letter code, demonym | high |

Continent uses the same header: Europe index 2 UID 3, +0x18 "Europe", +0x20 "EUR", +0x28 "European", +0x30 federation name.

## db::COMP

| Offset | Field | Confidence |
|---|---|---|
| +0x08 | u32 pool index | high |
| +0x0C | u32 UID (also at +0x10) | high |
| +0x40 / +0x48 / +0x50 | FM string pointers: full name, short name, abbreviation | high |
| +0x58 | db::CONTINENT pointer | high |
| +0x60 | db::NATION pointer, null for international comps | high |
| +0x78 | db::FIXTURE_NAME pointer | medium |
| +0xA8 | pointer to 0x60-stride record whose +0 points back at the comp | medium |
| +0xB0 | sicomps::ACTUAL_COMP pointer (always set) | high |
| +0xF9 | u8 women's flag (738 of 8237) | high |
| +0xFA | u8 league fixtures per team, 0 when not applicable or unset | low-medium |
| +0x130..+0x13B | RGBA colours | medium |
| +0x148 / +0x14C | (u16 day, u16 year) season start / end | medium |
| +0x188 | u16 competition reputation 0-200 | high |
| +0x18A | u16 second reputation | medium |
| +0x18C / +0x18E | u16 league rank within nation, 0xFFFF for non-leagues | medium |
| +0x14, +0x30, +0x170, +0x178 | unknown | unknown |

153 comps had no decodable name. Women's flag: 512 of 514 comps with "Women"/"Frauen" in the name have it; 226 more flagged comps have no such word but sit in the women's block (index ~6400+) and look like women's leagues. Two UAE women's cups read 0, so the flag is not perfect or those are data quirks.

### Rules (substitutes, VAR, goal-line technology): NOT SOLVED

None of these are in db::COMP's fixed bytes, and the plugin has no strings for SUBSTITUTE, GOAL_LINE, TECHNOLOG or VIDEO_ASSISTANT. The rules appear to live in the data-driven FourCC property table of the ACTUAL_COMP object:

- ACTUAL_COMP (comp+0xB0) is a large object (0x3C0+ bytes), debug fill "XTUM" for the first 0x50 bytes, back pointer to the comp at +0x138.
- At +0x50 a (begin,end) vector of 16-byte entries: u64 whose low 32 bits are a big-endian ASCII FourCC, then a pointer to a value node `[type ptr][payload]`. EPL has 52 entries, Championship 47.
- Node types (low 12 bits of the type pointer): 0xc28 int (u32 at +8), 0xc18 bool, 0xc38 enum-like int, 0xc88 string (FM string, e.g. `file`), 0xca8 list (begin,end vector of child pointers), 0xcb8 tree/struct node (not decoded).
- Dumped for the first 600 comps. Tags that look relevant: `comp` (the comp UID), `levl` (pyramid level: EPL 0, Championship 1), `fxri`, `mstc`/`mnsc` (EPL 5000, Championship 2000, La Liga 15000: probably minimum stadium capacity, guess), `mdct` (14 for EPL and Bundesliga), `mgqm` (EPL 5, La Liga 1, Portuguese league 1; only 5 comps in 257 have a non-1 value, a guess that it is related to substitutions), `VRrl` (list; very likely VAR or referee rule groups, children undecoded), `file` (EPL "eng_prem", an asset or rule-set name), `hlps`, `stgs`, `SpDs`, `GtRc`, `MtAc`, `MtTv` (lists, meaning unknown).
- Also present: `EdBr` strings "fm27-dev-rulegroups"/"main"/"fmx-dev-extractions" (data provenance).
- Not found: any field that reads "5 substitutes of 9 named" for the EPL. `GAME_RULE_GROUP_MANAGER` has 1 instance (0x7b86266700) and sicomps::RULE_GROUP_MANAGER has 0; the rule groups probably resolve through the GAME_ manager and the tree nodes. A note in the roadmap warns that an instantiated competition may use a cached rule, so even once decoded, edits need care.

Confidence: tag names and the node type taxonomy are high. Any semantic label for a tag is a guess unless stated.

### Values to check in FM27 UI

| Comp | Index | UID | Reputation +0x188 | League rank +0x18C | Matches +0xFA | Notes |
|---|---|---|---|---|---|---|
| Premier League | 7 | 11 | 190 (+0x18A 189) | 1 | 38 | season 233/2026 to 150/2027 |
| Sky Bet Championship | 8 | 12 | 136 | 19 | 46 | |
| Bundesliga | 16 | 22 | 178 | 4 | 34 | |
| Ligue 1 McDonald's | 11 | 16 | 173 | 5 | 34 | |
| Italian Serie A | 22 | 32 | 181 | 2 | 0 | |
| Spanish First Division | 51 | 67 | 180 | 3 | 38 | |
| VriendenLoterij Eredivisie | 20 | 29 | 164 | 7 | 34 | |
| Portuguese Premier League | 45 | 60 | n/a | 6 | 0 | |
| UEFA Champions League | 637 | 1301394 | 200 | 0xFFFF | | |
| FIFA World Cup | 631 | 1301385 | 200 | 0xFFFF | | |
| Barclays Women's Super League | 6443 | 2000101095 | 175 | 1 (women's list) | | women's flag 1 |

## db::AWARD

| Offset | Field | Confidence |
|---|---|---|
| +0x08 | u32 index | high |
| +0x0C | u32 UID | high |
| +0x14.. | RGBA colours | medium |
| +0x30 / +0x38 | FM string pointers: name, short name | high |
| +0x48 | (u16 day, u16 year) next award date | medium |
| +0x50 | db::CONTINENT pointer | high |
| +0x58 | db::COMP pointer | high |
| +0x60 | db::NATION pointer | high |
| +0x7C | u8 goalkeeper-only (Golden Glove 42 of 42 = 1) | high |
| +0x80 | u8 prestige 0-20 | medium-high |
| +0x86 | u8 period: 1 weekly, 2 monthly, 3 seasonal, 4+ other | high for 1-3 |
| +0x8D | u8 recipient kind: 1 player, 2 manager (377 of 377 "Manager of" awards), 7 team of, 6/8 other | high |
| +0x93 | u8 maximum age | high |
| +0x94 | u8 minimum age | low-medium |
| +0x85 | u8 criterion code (37 most, 255 none, 4 Golden Boot, 44 Golden Glove, 3 manager, 15 goal of month) | low |
| +0x70, +0x4C, +0x95..+0x97 | unknown | unknown |

3610 awards have a competition link, 3260 have continent, competition and nation, 22 have no links. All 3902 names decode.

### Values to check

| Award | Index | UID | Check |
|---|---|---|---|
| World Golden Ball | 0 | 102406 | no links, prestige 20, period 6 |
| Premier League Players' Player of the Year | 6 | 102412 | EPL, England, prestige 17 |
| Premier League Players' Young Player of the Year | 7 | 102413 | max age 22 |
| Premier League Young Player of the Month | | | max age 23, period 2 |
| Premier League Golden Glove | 415 | 168515 | GK flag 1 |
| Championship, League One, League Two young player of the month | | | max age 21 |
| Serie A Young Player | | | max age 24 |

Name collision: index 217 (UID 129240) is named "Premier League Manager of the Season" but links to the Finnish Premier League. Do not match awards by name alone.

## db::OFFICIAL

| Offset | Field | Confidence |
|---|---|---|
| +0x00 | vtable | high |
| +0x20 / +0x28 / +0x30 | name entry pointers: first, last, common (0 for most) | high |
| +0x38 | db::NATION pointer | high |
| +0x40..+0x47 | 8 u8 attributes | medium that they are attributes, labels unknown |
| +0x50 / +0x68 | city pointers | low |
| +0x58 | (u16 day, u16 year) date of birth | high |
| +0x114 / +0x116 | u16 current / potential ability | medium-high |
| +0x118 | u16 reputation 0-10000 | medium |
| +0x11A..+0x120 | 7 u8 values 1-20 | unknown (maybe more attributes) |
| +0x121 / +0x122 | u8 flags, 1 for most elite Premier League referees | low |
| +0x128 | secondary vtable (identity block) | high |
| +0x134 | u32 UID (repeated at +0x138) | high |

1166 officials, all with name and nation, across 228 nations (England 197, France 106, Spain 93, Germany 72). First UIDs: 5352, 5357, 103812, 103879, 103896, 103902.

Attribute columns at +0x40..+0x47: [0] ranges 7-20, [1..5] cluster at 9-12, [6] ranges 10-20, [7] ranges 1-8. The mapping to FM's referee attributes (allowing the game to flow, discipline and so on) cannot be made without comparing against the UI. Officials have no separate "level" field identified (CA/PA may serve).

CA/PA: established referees have CA equal to PA, young ones PA above CA (Shaun Taylor 83/160). About 101 officials read exactly 200/200, probably filler.

### Values to check

| Name | UID | Nation | Born | CA/PA | Rep | Attrs +0x40.. |
|---|---|---|---|---|---|---|
| Michael Oliver | 103994 | England | 20 Feb 1985 | 180/180 | 8388 | 19,12,11,12,11,9,12,1 |
| Szymon Marciniak | 96009031 | Poland | 7 Jan 1981 | 190/190 | 9013 | |
| Clement Turpin | 34017557 | France | 16 May 1982 | 185/185 | 9123 | |
| Simon Hooper | 29039210 | England | | 170/170 | | flag +0x121 = 0 |

Oliver also: +0x5D..+0x60 = 0,11,1,5; +0x11A..+0x120 = 15,10,15,14,16,9,5; +0x121..+0x123 = 1,1,1. Top English by CA: Harley Hetherington 188, Harry Organ 186, then Oliver, Smith, Barrott at 180.

## Reliable enough to build now (read-only)

- Official list and profile: name, nation, age (DOB), CA/PA, reputation, UID. CA/PA, reputation and DOB are now
  editable in FM Lens (u16 each, the date as two u16s), checked by the UID at +0x134; whether FM keeps a written
  value or recomputes it is a live check.
- Competition list and profile: name, short name, abbreviation, continent, nation, UID, women's flag, reputation, league rank, season dates, colours.
- Award list and profile: name, links (competition, nation, continent), goalkeeper flag, max age, period, recipient kind, prestige.

## Open questions

1. Competition rules (substitutes allowed and named, VAR, goal-line technology) are undecoded. Next step: decode the 0xcb8 tree nodes behind `VRrl`, `hlps`, `stgs` and compare EPL against a comp whose rules differ in the UI; test `mgqm`.
2. Referee attribute labels, and whether +0x121/+0x122 is a VAR accreditation flag.
3. A static or cheap runtime root for the comp, award and nation pools (the vtable scan takes minutes).
4. Meaning of comp +0x14, +0x30, +0x170/+0x178, +0xFA zeros (Serie A and Portuguese league read 0), and award +0x85, +0x94..+0x97.
5. Whether reputation edits to +0x188 propagate to live fixtures or are cached in the ACTUAL_COMP rules.
