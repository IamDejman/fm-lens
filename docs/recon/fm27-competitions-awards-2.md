# FM27 competitions, awards and officials, round 2 (macOS ARM64)

Read-only. No game memory was written and the FM UI was not touched. Follow-up to
`fm27-competitions-awards-officials.md`. Build 26340721, game_plugin base in this process
0x15f3f4000 (it changes per launch). All RVAs are `game_plugin+RVA`. Heap addresses are examples.
Scratch files: `reports/batch/scratch/competitions/`.

## Summary

| Item | Status |
|---|---|
| 1. Fast root for db::COMP and db::AWARD | found, high confidence |
| 2. Competition rules (subs, VAR, foreign, squad) | partial: the rule schema is decoded, the live values for one comp are not mapped to the UI, goal-line technology has no rule key |
| 2b. Which copy the match engine reads | not determined |
| 3. Awards: name, links, eligibility | found. Holder and history: located, not decoded |
| 4. Referee attribute labels | not found. The 8 getters are identified |

## 1. Roots for competitions and awards

Status: found.

FM keeps every db class in a `db::DATABASE_TABLE<T>` object. The tables are listed in a static
block of pointers, 8 bytes apart, starting at `game_plugin+0x56d2d18`.

Chain (3 reads, no scan):

1. `table = *(game_plugin + slot)`
2. `vec = *(table + 0x88)` is the address of a (begin, end, cap) triple.
3. Elements are 8-byte pointers to the objects. `count = (end - begin) / 8`.

| Slot RVA | Table class | Elements | Element class |
|---|---|---|---|
| 0x56d2d18 | DATABASE_TABLE<AWARD> | 3902 | db::AWARD, 0xa0 each |
| 0x56d2d20 | CITY | 58475 | |
| 0x56d2d28 | CLUB | 26365 | |
| 0x56d2d30 | **COMP** | 8238 | db::COMP, 0x1b0 each |
| 0x56d2d38 | CONTINENT | 7 | |
| 0x56d2d40 | NATION | 251 | db::NATION, 0x208 each |
| 0x56d2d48 | CURRENCY_RECORD | 173 | |
| 0x56d2d50 | FIXTURE_NAME | 5156 | |
| 0x56d2d58 | INJURY | 136 | |
| 0x56d2d60 | MEDIA_SOURCE | 331 | |
| 0x56d2d68 | LANGUAGE | 126 | |
| 0x56d2d70 | LOCAL_REGION | 2532 | |
| 0x56d2d78 | NATIONAL_TEAM_CONTAINER | 502 | |
| 0x56d2d80 | PERSON | 82853 | |
| 0x56d2d88 | PLAYER_TYPE | 924 | |
| 0x56d2d90 | REGION | 28 | |
| 0x56d2d98 | STADIUM | 21923 | |
| 0x56d2da0 | STADIUM_CHANGE | 175 | |
| 0x56d2da8 | STAGE_NAME | 288 | |
| 0x56d2db0 | TEAM_BASE | 55769 | |
| 0x56d2db8 | WEATHER | 398 | |
| 0x56d2dc0 | REMOVED_RECORD | 74525 | |
| 0x56d2dc8 | DERBY | 1681 | |
| 0x56d2dd0 | AGREEMENT | 6 | |

Notes:

- The COMP vector has 8238 entries. Entry 8237 is a placeholder (index 8237, UID 2000590694,
  name pointers null). Treat 8237 comps as real. Check `*(obj+8) == index` and the vtable
  (`game_plugin+0x559ed88` for COMP, `+0x559b4a0` for AWARD) for every element.
- Verified live: entry 7 = UID 11 "Premier League" (England, Europe, rep 190); entry 637 = UID
  1301394 "UEFA Champions League"; award entry 6 = UID 102412.
- The pointers lead to inline pool objects, so pool_base + index * stride also works once any
  one object is known.
- Officials stay as before: (begin, end) pair at `+0x56d2e90`, 1166 elements, stride 0x148.
  Michael Oliver is element 10 at 0x7aee264cd0.
- String pointers inside these objects point at an FM string: `u32 length` then UTF-8 bytes.
  The refcount sits at ptr - 4. Nation and continent names are at `obj+0x18`; a comp's
  nation and continent pointers (`+0x60`, `+0x58`) lead to objects with the same layout.
- Other statics found by their constructors: AWARD_MANAGER pointer at `+0x56a6218`,
  GAME_AWARD at `+0x56d2c90`, GAME_RULE_GROUP_MANAGER at `+0x56a4b90` and `+0x56d57d0`.

Editing and guards: reading is safe. For any later write, re-resolve the object by this chain,
re-check vtable, index and UID, and only then touch it.

## 2. Competition rules

Status: partial.

### Where the rules are not

Not in db::COMP's fixed fields (checked again). The old guess that tag `mgqm` is about
substitutes is wrong. It is `minimum_games_to_qualify_for_medal` (EPL 5, UCL 0).

### Where they are

Rules are a typed key/value tree. Each key is a 4-character code (FourCC, big-endian ASCII in
the low 32 bits of a u64). The loader at RVA 0x11215e4 (one big function to 0x112c0e4)
registers every name with its code. 1377 names were decoded from it with a script that follows
the `mov w2 / movk w2` pairs. The full table is
`reports/batch/scratch/competitions/fourcc-dictionary.txt` (name, code). The slot column in
`fcc.txt` is not reliable, ignore it.

Rule codes that matter here:

| Meaning | Name | Code |
|---|---|---|
| Subs rule set (enum of names like `five_from_nine`) | subs_rules | subr |
| Subs allowed (number) | subs_allowed | SBal |
| Max named subs (number) | max_subs | SBmx |
| Subs rule by division level | subs_rule_for_division_level | srdl |
| Subs allowed lowered if not met | subs_allowed_lowered_if_not_met | lsal |
| Previous unused subs count | previous_matches_unused_subs_count | pmus |
| Extended injury time | extended_injury_time | Ueit |
| VAR rules (list) | var_rules | VRrl |
| Do not use db VAR rules | dont_use_db_var_rules | DBVR |
| VAR from a named comp or above | var_specified_comp_or_above | VscA |
| Min foreign players | min_foreign_players | MiFp |
| Max foreign players | max_foreign_players | MxFp |
| Foreign per player check | foreign_per_player_check | IfPc |
| Foreign signing fees | multiple_foreign_player_signings_transfer_fees | FfPf |
| New foreigner fee | new_foreigner_fee | NFfe |
| Foreign trialists may play | foreign_trialists_can_play_in_competitive_fixtures | ftcp |
| Max squad size | max_squad_size | mxss |
| Max preliminary squad size | max_prelim_squad_size | mxps |
| Recommended squad size | recommended_squad_size | rcss |
| Min squad size | min_squad_size | miss |
| Squad selection rules (holds SBal, SBmx) | squad_selection_rules | sqsr |
| Squad selection eligibility | squad_selection_eligibility / _new / _scoped | sseg / SSEG / SSE2 |
| Squad selection deadline date | squad_selection_deadline_date | sddt |
| Squad number registration periods | squad_number_registration_periods | snrp |
| Rules apply to fixture rules | league_registrations_apply_to_these_fixture_rules | Lraf |
| Work permit rules | work_permit_rules | wkpm |
| Wage cap, wage rules | wage_cap, wage_rules | wgcp, WaRu |
| Match fixture rules, squad fixture rules | match_fixture_rules, squad_fixture_rules | mtfr, sqfr |
| Fixture rules index of a comp | fixture_rules_index | fxri |
| Rule group links | rule_group, rule_groups, continent_rule_group, international_rule_group | rlgr, RGps, ctrl, inrl |
| Min stadium capacity, seating | minimum_stadium_capacity, _seating_capacity | mnsc, mstc (confirmed: EPL 5000) |
| Loan rules | loan_rules | lnrl |
| Daylight offside rule | daylight_offside_rule | DaOr |

Goal-line technology: no rule key and no string exists in the plugin. Status: not found. It is
probably not a competition rule in FM27, or it is folded into the VAR block.

Subs rule set names (strings at RVA 0x5293600..0x52939a0): three_from_three, three_from_five,
three_from_seven, three_and_gk_from_five, ..., five_from_eight, five_from_nine, five_from_ten,
all_from_all, five_from_seven, ..., seven_from_twelve_max_three_stoppages, use_lowest_division_rules,
use_highest_division_rules. The match code also knows `additional_under_21_national_subs` and
`additional_under_22_national_subs`. "Five from nine" is the Premier League style of 5 changes
and 9 named. The numeric enum value for each name was not mapped.

### Live objects

ACTUAL_COMP (vtable `+0x566c2b8`, comp `+0xB0`) holds a vector of 16-byte entries at `+0x50`
(begin, end, cap). Entry: u64 key (FourCC in the low 32 bits), pointer to a value node. A value
node is `[type pointer][payload]`. Type pointers are heap descriptors, stable within a process:
in this run 0x7afa2bb048 int (u32 at +8), 0x...038 bool (low byte at +8), 0x...0a8 string,
0x...0c8 list (payload is a pointer to an object holding (begin, end, cap) vectors of node
pointers), 0x...058 and 0x...0d8 other (key and struct nodes). The three non-trivial types
were not fully decoded. The `tags.py` and `stream.py` scripts in the scratch dir print them.

Premier League (comp index 7) tags, all labelled from the schema (52 tags, file
`tags-epl-ucl.txt`):

| Tag | Name | Value |
|---|---|---|
| comp | competition | 11 |
| type | type | 1 (league) |
| levl | level | 0 |
| year, bsyr, ygap | year, base_year, year_interval | 2000, 2000, 1 |
| fxri | fixture_rules_index | 6 |
| mnsc, mstc | minimum stadium capacity, seating capacity | 5000, 5000 |
| mdct | max_days_for_checking_tv_dates | 14 |
| yctf, fycl, ycfm | yellow card match fine threshold, fine, multiplier | 6, struct, 1 |
| edhm | end dates with no home matches | 1 |
| mgqm | minimum games to qualify for medal | 5 |
| rquh, rqgp, cita, Ueit | undersoil heating, grass pitch, terracing allowed, extended injury time | true, true, false, true |
| stgs, itvm, MtTv, typz, prcm, fxds, ... | stages, TV money, prize and parachute money, fixture dates | lists |
| VRrl | var_rules | list, see below |
| lgfx, hlps, MtAc, DOmf, SpDs, AfxD, FxPr, tfxt | league fixtures, helpers, ban accumulation matches, date lists | lists |
| file, EdBr, EdDt | data set name ("eng_prem"), provenance | strings |

The Champions League (index 637, 48 tags) has `type` 21, `fxri` 1, `wkpm` work permit rules,
`hstn` host nations, `CRps` continental ranking points, `NoMd` 40 medals, `strl` stadium rules 10.

EPL `VRrl` holds entries that each contain comp UIDs plus a `date` node. The UIDs found are
1301426 English FA Cup, 1301427 Carabao Cup, 1301394 UEFA Champions League, 1301396 UEFA
Europa League. The date node reads (3, 30, 1, 2001). Meaning of the fields: not decoded. The
name `var_rules` is certain, the reading "these comps use VAR from this date" is a guess.

The static rule data (the data the game was loaded from, provenance "fm27-dev-rulegroups")
also sits in the heap as typed nodes. `SBal` and `SBmx` appear in 16 places in clusters near
0x7af36a4000 and 0x7af3a07000, inside `sqsr` (squad_selection_rules) lists. Values seen:
`SBal` 5, 5, 4, 4, 3 and `SBmx` 9, 8, 7, 9, 8, 7. These look like successive rule periods
(for example 3, 4, 5 changes and 7, 8, 9 named). Which cluster is England was not proven.

### Season copies and what the engine reads

Status: not determined. Evidence only:

- The ACTUAL_COMP tree is a loaded copy of the data, kept per comp. It has a `year` and
  `year_interval` and a `stages` list, so season stages are built from it at set-up.
- The plugin has runtime classes sicomps::LEAGUE_STAGE (vtable `+0x56759f8`), CUP_STAGE,
  GROUP_STAGE and the strings `FIXTURE::get_subs_rules_string` and `get_subs_rules_string`.
  Substitution rules are therefore carried by the fixture and the stage, not read live from
  db::COMP. GAME_COMP has no instances.
- So editing the tag in ACTUAL_COMP or the static tree probably does not change a season that
  is already set up. This is not proven.

Checked live (vtable scan of sicomps::LEAGUE_STAGE, 413 s, 375 objects, stride about 0x1d0):

- A stage object has `+0x70` = pointer to its db::COMP (the first object points at the
  Premier League, 0x726682cbd0) and `+0xf0` = pointer to a `sicomps::LEAGUE_SETTINGS` object
  (vtable `+0x5675f28`). The stage is the season-instantiated copy per comp.
- The Premier League settings object (0x7afeeca0a8) holds the byte pairs (1, 5) at
  `+0xc9..+0xca` and (1, 9) at `+0xd1..+0xd2`. This looks like "subs allowed 5" and
  "subs named 9", flag then value. Other stages show (1, 5) at the same place and a different
  second pair (0, 0 or 0, 0x13), so `+0xca` = 5 is common and `+0xd2` = 9 is specific to this
  stage. This is a guess from one stage and is NOT verified.
- If it holds, the engine reads per-stage native settings, not the ACTUAL_COMP tree or the
  db::COMP rules, and editing the tree alone would not change a running season.

Plan to settle it (reads only): follow `fxri` (EPL 6) into the match fixture rules list in the
rule data, find the entry that holds `subr` or `SBal`, then dump a real FIXTURE of the
Arsenal v Spurs match (the FIXTURE class has no vtable; find it from the fixture list of a
club, see how the existing `ties`/`teams` code reaches fixtures) and compare. If the fixture
holds the numbers, the engine reads the fixture copy and edits must be made before fixtures
are generated, or to each fixture.

## 3. Awards

Status: found for definition. Holder and history: located, not decoded.

db::AWARD layout is as in the first note, re-read live:

| Offset | Field | Live check |
|---|---|---|
| +0x08 / +0x0C | index, UID | |
| +0x30 / +0x38 | name, short name (FM strings) | |
| +0x48 | (u16 day, u16 year), 1 / 1900 means unset | World Golden Ball reads 299 / 2026 |
| +0x50 / +0x58 / +0x60 | continent, comp, nation pointers | |
| +0x7C | goalkeeper only | Golden Glove 1 |
| +0x80 | prestige 0-20 | |
| +0x85 | criterion code | |
| +0x86 | period: 1 weekly, 2 monthly, 3 seasonal, 4+ other, 6 world | |
| +0x8D | recipient kind: 1 player, 2 manager | |
| +0x93 / +0x94 | max age / min age | Young Player award 22 |

A comp's name sits at comp `+0x40`, a nation's or continent's name at `+0x18`. Eligibility is
these byte fields only (age, goalkeeper, kind, links). The criterion code at `+0x85` is not
decoded.

Current holder and history: found where it lives, not decoded.

- `AWARD_MANAGER` (vtable `+0x55f5008`, pointer at `+0x56a6218`). `+0x10` is a year (2024).
  `+0x18` begins a vector (begin, end, cap) of 223 `YEAR_AWARD_DATA` objects (vtable
  `+0x55d4d60`). `+0x30` begins a vector of 123 pointers to db::AWARD, `+0x48` a vector of 42.
- One YEAR_AWARD_DATA: `+0x08` pointer to its db::AWARD, `+0x10` a u32 id (83) and 0xFFFFFFFF,
  `+0x18` onward packed dates (u16 day, u16 year), for example day 226 of 2027, day 127 and 315
  of 2028. These are the live, season-instantiated award records. Winners (person lists) were
  not found in the first 0x60 bytes.
- Related classes for a decode: AWARD_DATA, PERSON_AWARD_DATA, TEAM_AWARD_DATA,
  GOAL_AWARD_DATA, db::STARTING_AWARD_HISTORY, GAME_AWARD (object at `+0x56d2c90`).

Editing: do not edit db::AWARD eligibility bytes while a season is running. The live
YEAR_AWARD_DATA objects may have copied the values.

## 4. Officials

Status: root known, attribute labels not found.

Layout of db::OFFICIAL (stride 0x148), confirmed on Michael Oliver (element 10, UID 103994):

| Offset | Field | Oliver |
|---|---|---|
| +0x20 / +0x28 / +0x30 | first, last, common name entries | |
| +0x38 | db::NATION pointer | England |
| +0x40..+0x47 | 8 attribute bytes, signed byte getters | 19, 12, 11, 12, 11, 9, 12, 1 |
| +0x58 | date of birth (u16 day, u16 year) | 20 Feb 1985 |
| +0x114 / +0x116 | current / potential ability | 180 / 180 |
| +0x118 | reputation, u16, 0-10000 | 8388 |
| +0x11A..+0x120 | 7 u8 values | 15, 10, 15, 14, 16, 9, 5 |
| +0x121..+0x123 | 3 u8 flags | 1, 1, 1 |
| +0x134 / +0x138 | UID twice | 103994 |

The 8 attribute getters are virtual slots 72 to 79 of the db::OFFICIAL vtable (`+0x55b6838`,
virtual offsets 0x240..0x278): RVAs 0xcf6154 (+0x40), 0xcf6174 (+0x41), 0xcf61b4 (+0x42),
slot 75 (+0x43), 0xcf61f4 (+0x44), 0xcf6214 (+0x45), 0xcf6234 (+0x46), 0xcf6194 (+0x47). Each is
`ldrsb w0, [x0, #off]; ret`. The attributes are therefore signed bytes, range 1-20 in the data.

The labels could not be derived. Calls through those slots appear in many unrelated classes
(the same virtual offsets), and no caller specific to officials was isolated. Next step for
whoever has the screen: open referee Michael Oliver in FM, read his attribute list, and match
the nine values above in order. Then verify with a second referee (Marciniak or Turpin, see the
first note) that the order holds. Observed spreads: byte 0 ranges 7-20, bytes 1 to 5 cluster at
9-12, byte 6 ranges 10-20, byte 7 ranges 1-8.

What an officials editor needs:

- Fields: name, nation, date of birth, CA/PA (+0x114/+0x116, 1-200), reputation (+0x118,
  0-10000), the 8 attribute bytes (1-20), the 7 bytes at +0x11A (1-20, unlabelled).
- Guards: vtable at +0 equals `+0x55b6838`; UID at +0x134 equals +0x138; element lies in the
  (begin, end) array at `+0x56d2e90`; CA <= PA for established referees is the usual pattern
  (young ones have PA above CA); never write a value outside 1-20 for attributes.
- Writes: all plain integer fields, no derived data was found. A raw write is safe for these.
  The GAME_OFFICIAL manager singleton (vtable `+0x55e1830`) may cache match assignments;
  check after a write by opening a fixture.

## Values to check in FM

Game date 11 Dec 2027, career "FM Lens Nation 2026-11-05".

| Entity | FM screen | Expected |
|---|---|---|
| Premier League | Competition > Overview | name "Premier League", England, Europe, reputation 190 (second value 189, unverified in UI), 38 games per team, league rank 1 |
| Premier League | Competition > Rules (or Info) | substitutes: five from nine named if FM shows it; this is the value the rule tree should map to. Record what FM shows, plus VAR yes or no, and the foreign player limit |
| UEFA Champions League | Competition > Overview | name "UEFA Champions League", reputation 200, no nation, Europe |
| UEFA Champions League | Competition > Rules | work permit rules present, 40 medals |
| World Golden Ball | Awards | no continent, comp or nation link, prestige 20 |
| Premier League Players' Player of the Year | Awards | England, Premier League, seasonal |
| Premier League Players' Young Player of the Year | Awards | players aged 22 or under |
| Premier League Golden Glove | Awards | goalkeepers only |
| Michael Oliver | Referee profile | England, born 20 Feb 1985, age 42, ability 180 (CA/PA 180/180), reputation 8388 as a star or rating, attributes in order 19, 12, 11, 12, 11, 9, 12, 1 |
| Szymon Marciniak | Referee profile | Poland, born 7 Jan 1981, CA/PA 190, rep 9013 |

The award "Ballon d'Or style" is the World Golden Ball (index 0, UID 102406); if FM shows a
different name for the world player award, search the awards list for period 6.

## Open items

1. Numeric enum for subs rule names, and which static cluster is England.
2. Stage objects of a running comp: do they hold copies of the subs and foreign values.
3. VRrl entry layout (comp list, date nodes) and any VAR on/off flag.
4. Goal-line technology: no key found.
5. Referee attribute labels (needs the screen).
6. YEAR_AWARD_DATA winner lists and history.
