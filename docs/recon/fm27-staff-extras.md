# FM27 staff and manager extras (Steam 26340721, macOS ARM64)

Scope: coaching licences, staff formations and tendencies, knowledge, a check of the staff
offsets FM Lens uses, staff job and club changes, human manager relations, tactical familiarity.
Method: FM's property codes in the disassembly (setter 0xC9694C and getter 0xC9A0A8 of
`ACTUAL_NON_PLAYER`, person getter 0xCD6194, person setter 0xCCDB18), RTTI, and read-only probe
readings. Nothing was written to the game. Addresses are RVAs (game_plugin+0x...).

Offsets are from the staff object start unless "person block" is named. The person block is at
`+0xF8` for staff and `+0x340` further for the human manager.

## Summary

| Item | Status | Confidence |
|---|---|---|
| 1. Coaching licence | found (byte and encoding), labels need the screen | high for the byte, low for labels |
| 2. Formations, tendencies | partial | medium for bytes, low for names |
| 3. Nation and region knowledge | not found | - |
| 4. Staff offsets against FM getters | found, with two gaps | high |
| 5. Job and club change | found (existing FM Lens plan is sound) | medium-high |
| 6. Human manager relations | partial (format known, labels not) | medium |
| 7. Tactical familiarity | partial (record decoded, key meaning narrowed) | medium for layout, low for names |

## 1. Coaching licences

Status: found.

Where:
- One signed byte in the person block at `+0x10C`, so staff object `+0x204`. The human manager
  uses `+0x204 + 0x340`.
- FM reads it through property code `Pcbr` (0x50636272), handler 0xCD68C8
  (`ldrsb w19,[x23,#0x10c]`). Code `Pcqu` (handler 0xCD6F8C) turns it into a level.
- Decoding (from 0xCD6F8C): 1..8 gives the level as is. 0xFF..0xF9 (signed -1..-7) gives
  `1 - byte`, so 0xFF is 2 and 0xF9 is 8. Any other value gives 0, meaning no licence.
- Spread over all 20,217 staff: 0 none 5171, 1 3980, 2 2149, 3 1552, 4 867, 5 1104, 6 2083,
  7 2825, 8 66, 0xFF 249, 0xFE 120, 0xFD 17, 0xFC 14, 0xFB 14, 0xFA 14 (approx, last three
  grouped from the histogram).
- The older guess at `+0x1B0` is wrong. That field is a pointer-like id, not a licence.
- FM text labels (Continental Pro, A, B...) were not found as a table. A whole-memory text
  search found only Unity UI strings. The level to label ladder needs the screen.

Evidence: probe read Nicolas Jover (staff 48030808, object `0x726C315318`): byte `+0x204` = 2.

Values to check in FM:
- Nicolas Jover, staff profile, coaching licence line: the label for level 2.
- Pick one staff member at each of 1, 3, 6, 7 and read their label to build the ladder. Level 7
  is the most common at top clubs (2825 holders), which suggests a high licence.
- Human manager: read `+0x204 + 0x340` of the manager object and compare with the Manager
  profile.

Editing: raw write of one byte is safe for values 0..8 (use the positive form). Nothing else
caches it that was found. Guard: do not write bytes outside 0..8 or 0xF9..0xFF. A related
rule object `PERSON_COACHING_BADGE_FILTER_RULE` (vtable 0x55A5870, evaluate at 0x121D9B0) reads
it for search filters only.

## 2. Formations, tendencies

Status: partial.

Staff formation and set-piece option bytes (from setter 0xC9694C, code to offset):

| Code | Offset | Meaning (guess) | Jover |
|---|---|---|---|
| `Nppf` | +0xDF | preferred formation, slot 1 | 4 |
| `Npsf` | +0xE0 | preferred formation, slot 2 | 7 |
| `Npdf` | +0xE1 | defensive formation | 4 |
| `Npaf` | +0xE2 | attacking formation | 28 |
| `oopF` | +0xE3 | out of possession formation | 32 |
| `oopS` | +0xE4 | out of possession style | 7 |
| `Opdf` | +0xE5 | opposition defensive formation | 32 |
| `Opaf` | +0xE6 | opposition attacking formation | 22 |

Each byte is a formation id. Commonest ids: 29, 4, 28, 3, 35, 64, 30, 7, 63, 22, 33, 32. Id 0 is
unset (81 staff, the same 81 that have 3 in the option bytes below). The id to name table was
not found. Names need the screen: read the formation a known staff member shows and match the id.

Set-piece option bytes: `SPdt` +0xEE, `SPpd` +0xEF, `SPaf` +0xF0, `SPDm` +0xF1, `SPan` +0xF2,
`SPdn` +0xF3, `Spdl` +0xF4. Values 0 to 2 (3 for the 81 unset). Meaning of each value is unknown.
Jover reads `0407041c2007201600` at +0xDF.. .

Other setter-mapped bytes: `NpGw` +0xEA, `Npcs` +0xE9, `Pbdt` +0xEC, `Phes` +0xED, and a mode
byte +0xEB that the attribute setters read. Meaning not confirmed.

Tendencies: the setter has about 70 `NTnn` codes (NT01..NT99) plus `N100`. They store into a
record the staff object points at via `+0xA8`. Keys are 1..100, default 10. The record has a
small vector of pairs. The class that fills it is `NON_PLAYER_TENDENCY_TEMPLATE`; its instances
were not read (the `types` scan was not repeated, and `instances` needs the `db::` prefix).
Names for NT codes are not known. Needs the screen: open a staff profile, Tendencies, and compare
to the NT readings of that staff member (probe `dump` of the `+0xA8` target).

Editing: formation bytes are plain bytes, safe to write within the commonest ids above. Tendency
edits are not advised until the NT labels are known.

## 3. Knowledge (nation and region)

Status: not found.

- FM has pool allocators `KNOWLEDGE` (40-byte elements) and `KNOWLEDGE_ARRAY` (24-byte), and the
  human manager's FOG_OF_WAR singleton (`game_plugin+0x56A8430`, array at `+0x18` indexed by the
  manager's u32 at `+0x3E4`) holds a 100 at `+8` of per-person records. This is only a lead.
- No staff-object pointer to a KNOWLEDGE array was identified. No getter code for nation
  knowledge was matched in `ACTUAL_NON_PLAYER` or `ACTUAL_PERSON`.
- Needs the screen: a scout's knowledge of a nation, plus a scan of the scout's object pointers
  for a 24-byte-element array. Not done here.

## 4. Staff offsets checked against FM's own setter

Status: found. Every attribute offset FM Lens uses matches the setter code map at 0xC9694C.

| Code | Field | Offset | In profile |
|---|---|---|---|
| `Ncha` | attacking | 0x32 | yes |
| `Nchd` | defending | 0x33 | yes |
| `Nchf` | fitness | 0x34 | yes |
| `Nchm` | possession | 0x35 | yes |
| `Ncte` | technical | 0x36 | yes |
| `Ncta` | tactical | 0x37 | yes |
| `Ncsp` | set pieces | 0x43 | yes |
| `Npgs` | goalkeeping | 0x2B | yes |
| `Npmm` | people management | 0x2E | yes |
| `Npmo` | motivating | 0x2F | yes |
| `Npja` | judging ability | 0x2C | yes |
| `Npjp` | judging potential | 0x2D | yes |
| `Npjs` | judging staff | 0x42 | yes |
| `Nneg` | negotiating | 0x41 | yes |
| `Nptk` | tactical knowledge | 0x31 | yes |
| `Npjd` | data analysis | 0x3C | yes |
| `Npph` | physiotherapy | 0x30 | yes |
| `NpIM` | sports science | 0x3F | yes |
| `Pdet` | determination | 0x1D | yes |
| `Npwy` | working with youngsters | 0x1C | yes |
| `Npld` | authority | 0x14 | yes |
| `Ncra` | current ability | 0xDA u16 | yes |
| `Npta` | potential ability | 0xDC u16 | yes |
| `Nhmr` | home reputation | 0xD4 u16 | yes |
| `Ncrr` | current reputation | 0xD6 u16 | yes |
| `Nwrr` | world reputation | 0xD8 u16 | yes |

Reputation and ability setters go through a pointer (`ldr x0,[...,#0]` then `strh`), so the
fields live in the object the person block points at, as FM Lens already reads. All attribute
setters also read byte `+0xEB` first; it is a mode flag and was not changed by the probe.

Gaps: the setter writes bytes FM Lens does not name: `Ndal` +0x38, `Necc` +0x40, `Npvr` +0x3B,
`Natt` +0x10, `Nbus` +0x11, `Ndir` +0x13, `Nint` +0x16, `Nmig` +0x1F, `Npat` +0x19, `Npre`
+0x1A, `Nres` +0x1B, `Ndep` +0x23, `Nflx` +0x25, `Nhat` +0x26, `Nrot` +0x27, `Ntem` +0x28, `Nwid`
+0x29, `Nbpl` +0x1E, `Npgs` aside. These look like player-style hidden and personality bytes
shared with the player layer. The staff personality block at `+0x138` was not confirmed against a
getter (no `Pcpn`-style code matched). FM Lens reads it as eight ratings and the readings are
sensible.

Values to check in FM, Nicolas Jover (staff 48030808, Arsenal, Set Piece Coach):
- Staff profile attributes: attacking 14, defending 12, fitness 3, goalkeeping 5, possession 8,
  set pieces 20, tactical 8, technical 19, working with youngsters 17 (FM shows rating 1..20;
  raw byte is `(rating*5)-2` style, see layout).
- Mental: authority 10, determination 18, motivating 17, people management 17.
- Knowledge: data analysis 14, judging ability 11, judging potential 11, judging staff 9,
  negotiating 6, tactical knowledge 11. Medical: physiotherapy 3, sports science 4.
- CA 166, PA 175 (shown as stars). Reputation home 8166, current 8120, world 6035.
- Personality: adaptability 11, ambition 10, loyalty 14, pressure 12, professionalism 15,
  sportsmanship 11, temperament 13, controversy 3.
- Contract: Set Piece Coach, 16000 per week, expires 2032-06-30, joined 2021-07-05.
- Coaching licence: level 2 (byte +0x204).

Values to check in FM, human manager Ayodeji Eluwande (UID 2002071958):
- Attacking 3, defending 3, fitness 1, goalkeeping 1, possession 1, set pieces 1, tactical 1,
  technical 3, working with youngsters 7. Authority 4, determination 20, motivating 6, people
  management 3. Knowledge 10/12/10/10/10/11. Medical 10/10.
- CA 48, PA 200. Reputation home 2881, current 7872, world 2486.
- Personality: adaptability 1, ambition 10, loyalty 10, pressure 10, professionalism 9,
  sportsmanship 10, temperament 10, controversy 7.
- Contract: Manager, 281250 per week, to 2029-06-30.

## 5. Staff job changes and club moves

Status: found. The contract record and the club lists are what FM Lens's `staff_move.rs` already
handles; no new field was found.

Where (existing profile): the contract pointer is at `staff+0x170`. Contract: owner `+0x08`
(points at staff identity), team `+0x10`, senior team `+0x18`, wage `+0x20`, job `+0x26`.
Club lists of pointers to staff objects: medical, coaching and scouting (club `+0x60`, `+0x78`,
`+0x90`). Job codes are in `staff.rs::job_name`. Player-coach is coach code plus 1.

A consistent change must touch:
1. Job change: contract job byte `+0x26`, and the department list membership (leave the lists of
   other departments, join the right one). Fitness coach may sit in two lists.
2. Club move: contract team `+0x10` and senior team `+0x18` to the new club's senior team,
   signed and joined dates to today, plus removal from the old club's lists and addition to the
   new club's lists.
3. The team and club must not hold the staff object directly (manager, director roles).
   `check_unheld` in the existing code covers it.
4. Staff object `+0x60` team and `+0x1D0` club fields were noted as links in earlier notes.
   Not re-checked in this pass.

Guard: only edit when the contract owner equals the staff identity, the team's club equals the
senior team's club, the staff is in exactly one department list per department and the target
list has room. Raw write is only safe under those guards; adding to a list with no room needs
FM's own allocation and is not safe. Not tested here (read only).

## 6. Human manager relations

Status: partial.

Where: the relations pointer is the first field of the record at staff `+0x140` (human manager
`+0x140 + 0x340`). It is shared with the player layout.

Entry (16 bytes): `+0` target pointer, `+8` u16, `+0x0A` target kind (0 none, 1 club, 3 person,
4 team, 7 competition, 8 nation), `+0x0B` relation code, `+0x0C` value, `+0x0D` second value,
`+0x0F` is 0xFF.

Codes seen so far: 5 club rivalry (value 0..100), 9 secondary nationality, 70 trained in nation,
72 trained at club. FM's own labels for the other codes were not found in strings; they need the
screen.

Safe edit rule: change an existing entry in place (target pointer, code, value) after checking
the kind byte matches the target. Do not add or remove entries unless the list block has room:
growth needs an allocation. Removal means shifting later entries and shrinking the end pointer;
see `relations.rs` for the existing guard. Raw write to value bytes is safe; pointer writes are
safe only if the target object's kind matches `+0x0A`.

## 7. Tactical familiarity

Status: partial.

Where: `[player+0xF8]` points at a record. Eight 32-byte blocks at `record+0x20*i`: a vector
(begin, end, cap) of 4-byte entries and a kind byte at `+0x18`. Kinds 0..5 are vectors. Kinds
6 and 7 are hashes at `record+0xC0`.

Entry (3 bytes used of 4): bits 0..13 value 0..10000, bits 14..19 signed 6-bit key. Writer is
0x47FD400(vector, key, value): it looks for an entry with the same key and overwrites the value;
else it appends when the key is at most 20 and the vector has fewer than 20 entries (0x50
bytes).

What the key is (new, from helper 0x48461B0 and the caller 0x47FE7E8):
- The caller walks kinds 0..7 for one formation slot entry (58 bytes, argument x1).
- For kinds 0..5 it reads a byte from the slot entry at `+0x34 + kind` (helper 0x48461B0 is a
  switch from kind to `+0x34..+0x39`). That byte is the key. Keys therefore run 0..20, like a
  1..20 tactic setting.
- Familiarity of a setting is the best of: base (1000 for kinds below 6, else 0) and any stored
  entry value minus 1000 per step of key distance. So a player's value for a setting also warms
  neighbouring values.
- Kinds 6 and 7 are keyed by hashing slot-entry fields (`+0x30`/`+0x32` and `+0x18`).
  These probably cover the formation and the role. Not confirmed.
- Tactical understanding "maximise" sets each to 10000 using this same function.

Evidence: Saka (28122642): kind 0 keys 19 and 17 values 9916 and 2498; kind 1 key 20 value 8568;
kind 2 key 10 value 9916; kind 3 keys 8 and 3 values 4255 and 413; kind 4 key 20 value 9373;
kind 5 keys 12 and 7 values 5144 and 413. All keys are 0..20.

Not solved: which tactic slider each of kinds 0..5 is (mentality, tempo, width and so on). It
needs the Tactics, Familiarity screen: read Saka's familiarity per option and match the values.

Editing: changing an existing entry's low 14 bits is safe (0..10000). Adding a key needs a
vector with room; the vector is almost always full of one or two entries and growing is not
safe from outside. FM's `TEAM_MAXIMISE_TACTICAL_UNDERSTANDING_ACTION` also sets byte
`record+0xDC = 1` and bit 0x80 in the u16 at `[vbase2]+0x102` as dirty flags; set them after an
edit. Not tested (read only).

### The game's maximise action (traced 5 November 2026, Steam 26340721 arm64)

- Handler: `0x2392540(args)`, `TEAM_MAXIMISE_TACTICAL_UNDERSTANDING_ACTION`. `args` is the action's map, a vector of
  16-byte entries {u32 key, Value*}. It reads 'dref', resolves it with `0x11b8ea0` and `0x111344c` to an entity and
  goes on only for a team (entity kind 0x18) and when the byte at `0x56d34e0` is 1 (likely the in-game editor being
  on). The 'dref' Value is itself a struct whose own map holds 'dref' (an integer Value: the packed reference, type
  in the top byte, id in the low 23 bits) and 'cdtn'. Building that from outside needs the struct and integer Value
  constructors, not yet found.
- For the team it asks `0x2ce4aec(team, 1)` (result through x8) for a vector of 58-byte slot entries, one per
  position of the tactic. For each player of the team (list at team +0x38, each resolved through the identity
  vtable's slot 0x6e0) it takes the record `[player+0xF8]` (or `0xd47b38(player, 0)` when `0x1780318(team)` is set),
  fills each entry's +0x30 and +0x32 for that player (`0xd1d114(player, entry, 0)` and the same on entry +0x18 when
  the team has no record in the tactics table at `[0x56d2d78]+0x88`; another path otherwise), then calls
  `0x47FE7E8(record, entry, 10000)` per entry and sets `record+0xDC = 1`. With a manager's record (`0x2cabfb8`) it
  also calls `0x48488ec` and `0x486d814` per entry.
- So kinds 0..5 are keyed per position by the tactic's own settings and kinds 6 and 7 by per-player values the
  handler works out; reproducing it in a bridge program (no loops, 12 steps) is not practical. Calling the handler
  itself is, once the 'dref' Value can be built.
- Live check (read only, 11 Dec 2027): Saka's record still has kinds 0..5 as tight vectors of 1 or 2 entries
  (capacity equal to length) and the block at +0xC0.

## Needs the screen

- Coaching licence labels per level, for Jover (level 2) and the manager.
- Formation names for ids 3, 4, 7, 22, 28, 29, 30, 32, 33, 35.
- Tendency names for the NT codes.
- Which tactic setting each familiarity kind 0..5 is.
- Staff nation knowledge percentages.
