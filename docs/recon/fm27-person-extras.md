# FM27: languages and person relations (player, staff, human manager)

Status: read-only reverse engineering, nothing written to the game. Two things are solid enough
to show in the app: spoken languages and the full person relations list. Everything else asked for
(work permit, squad registration, promises, career plans, licences, formations, tendencies, scouting
knowledge) is unmapped; the leads are listed at the end and marked as guesses.

## Build and method

| | |
| --- | --- |
| Game | FM27 Steam build 26340721, native ARM64 (Apple silicon), disposable career, 2 to 5 November 2026 |
| `game_plugin` LC_UUID | `F4540355-2186-39CB-9119-C706A6A35346`, loaded at `0x160cc8000` |
| Entity arrays | players `0x56D2E18`, staff `0x56D2E60`, clubs `0x56D2FD0` (RVA of the begin/end pairs) |

Method: only the probe's read commands (`player`, `players`, `dump`) and Python wrappers around
`dump` for pointer chasing. Class names come from RTTI (vtable minus 8, typeinfo, name). Offsets are
from the start of the object. No write command was run and nothing in the repo besides this note
changed.

Samples: 1,500 players and 3,000 staff (languages), 1,200 players and 800 staff (relations), and a
scan of all 20,219 staff objects for uid to address (17,458 `ACTUAL_NON_PLAYER`, 2,758 the
player-and-staff class, 3 `HUMAN_NON_PLAYER`).

## Languages

| Who | Where | Confidence |
| --- | --- | --- |
| Player | object `+0x338` | high |
| Staff | object `+0x1B8` | high (sampled; 1,627 of 3,000 staff have at least one entry) |
| Human manager | object `+0x1B8 + 0x340` (the person block shift) | high (one object) |

Layout. The field is an inline vector `(begin, end, capacity)` of pointers to 16-byte link objects:

| Link offset | Field |
| --- | --- |
| `+0x00` | pointer to a `LANGUAGE` record |
| `+0x08` | u64 proficiency, 0 to 10 |

A `LANGUAGE` record (0x40 bytes, one table in the heap): `+0x10` id, `+0x18` pointer to the name as
an FM string (u32 length then UTF-8), `+0x28` pointer to the nation the language belongs to.
Proficiency reads as the raw 0 to 10 and was seen at 1, 2, 4, 5, 6, 8 and 10. The mapping of those
numbers to FM's words (for example fluent, native) is not confirmed; 10 reads as the top level.

Important: the native language of the person's own nation is usually not in the list. Klopp
(German) has no German entry, Guardiola (Spanish) lists Spanish 10 but several natives are missing
entirely, Saka reads an empty list. The app should treat the list as "additional languages" and not
claim it is complete. Whether the game derives the native language from the nation is likely but
unchecked.

Values to compare with FM's Personal page (read on 5 November 2026):

| Person | UID | Languages read (name, level) |
| --- | --- | --- |
| Martin Odegaard | 53095137 | English 10, Spanish 5, Swedish 10, Danish 10, Dutch 4 |
| Erling Haaland | 29179241 | Norwegian 10, English 10, German 5, Swedish 10, Danish 10 |
| Kylian Mbappe | 85139014 | Spanish 10, English 5, Arabic 6 |
| Kenan Yildiz | 2000138835 | English 10, Italian 10, Turkish 5 |
| Lionel Messi | 7458500 | English 8, French 1 |
| Bukayo Saka | 28122642 | none |
| Pep Guardiola | 1120 | English 10, Italian 10, German 5, Catalan 10, Spanish 10, Portuguese 6 |
| Jurgen Klopp | 9318 | English 10, French 2 |
| Mikel Arteta | 6701089 | French 10, English 10, Catalan 10, Basque 5, Portuguese 2, Italian 2 |
| Antonio Conte | 8088 | English 5, Turkish 5 |
| Luis Enrique | 1123 | Italian 10, English 2, French 10 |
| Giuseppe Marotta | 705257 | English 2 |
| Florentino Perez | 810186 | none |
| Ricard Pruna | 67065354 | Catalan 10, Spanish 10, English 10 |
| Rafel Pol | 43081230 | French 10, English 2 |
| Javier Mallo | 67245073 | English 10 |
| Rodolfo Borrell | 67046405 | English 10, Catalan 10, Spanish 10 |
| Txiki Begiristain | 7449788 | English 10, French 4 |
| Ayodeji Eluwande (human manager, UID 2002071958) | | English 10 |

If any of these differ from the screen (the Conte and Pol values look surprising), the offsets are
right but the proficiency scale or the order may need a second look. Not yet compared with the UI.

Writing: changing a proficiency byte in place is structurally simple (the link object is separate and
its number is a plain u64), but a link object is shared by nothing that was seen, adding a language
needs a new pool object, so only edits of existing entries are plausible. Untested.

## Person relations list

Format (already in `layout-macos.toml`, now confirmed for staff and the human manager): the person's
relations record starts with a vector of 16-byte entries.

| Who | Pointer to the record |
| --- | --- |
| Player | object `+0x2C0` (person block `+0x48`) |
| Staff | object `+0x140` (person block `+0xF8 + 0x48`) |
| Human manager | object `+0x140 + 0x340` (read: one entry, Arsenal, kind 1, code 3, value 100) |

| Entry offset | Field |
| --- | --- |
| `+0x00` | pointer to the target; for a person the pointer is to a secondary sub-object, not the primary (the vtable at `+0x20` of it leads to the primary), so resolve a person by UID from the identity block, not by class name |
| `+0x08` | u16 count used by some codes |
| `+0x0A` | target kind: 0 none, 1 club, 3 person, 4 team (a club's team), 7 competition, 8 nation |
| `+0x0B` | relation code |
| `+0x0C` | value (strength or rule) |
| `+0x0D` | second value |
| `+0x0F` | always `0xFF` |

Codes seen, with the target kind, as read on the live career:

| Kind | Code | Meaning | Confidence |
| --- | --- | --- | --- |
| 1 club | 3 | favoured club, value is strength 0 to 100 | high (matches the editor's tie fields) |
| 1 club | 4 | disliked club, value is strength | high |
| 3 person | 1 | favoured person, value is strength | high |
| 3 person | 2 | disliked person, value is strength | high |
| 8 nation | 9 | secondary nationality, value 100, byte `+0x0D` 80 | high (see fm27-nationality.md) |
| 8 nation | 70 | trained in nation | high |
| 1 club | 72 | trained at club | high |
| 1 club | 73 | seen on Florentino Perez targeting Real Madrid, value 0, second 255; probably an official or board link | guess |
| 4 team | 110, 120 | "team of Barcelona/Villarreal" for staff Luis Enrique, Pol and Mallo; the staff member's link to his team, or a former team | guess |
| 3 person | 47 | seen with values 6, 9, 54, 88 on Guardiola, Arteta, Txiki; a graded person link of a type not yet named | unknown |
| 3 person | 83 | one on Luis Enrique, value 2, second 255 | unknown |
| 0 none | 10 | one on Luis Enrique, value 100, second 255 | unknown |

For favoured and disliked people the byte `+0x0D` is 79 for most strong entries and 0 for weak
ones; for clubs 78 or 79. That field is probably how the game ranks or ages the preference (it is
not the target). Not decoded.

Examples to compare with FM's Relations or Favoured Personnel pages:

- Guardiola: favoured clubs Barcelona 100, Manchester City 95, Brescia 50; disliked Liverpool 70,
  Real Madrid 100.
- Klopp: favoured Liverpool 100, Mainz 90, Borussia Dortmund 75, RB Leipzig 60; disliked Schalke 50,
  Atletico Madrid 25.
- Arteta: nationality tie to Pays Basque 100 (code 9), favoured Arsenal 90, Barcelona 75, Real San
  Sebastian 90, Everton 75.
- Conte: nationality tie to Italy (code 9), favoured Lecce 95, Juventus 90, Chelsea 65; disliked
  Perugia 50, Tottenham 35.
- Txiki Begiristain: Pays Basque 100, favoured Real San Sebastian 100 and Barcelona 100.

The human manager's list is full (end equals capacity), as the existing note says, so only an
in-place change of the existing entry is safe.

## Not mapped

Time spent, so these are leads only, none of them confirmed:

- Work permit state, squad registration status, promises, career plans, preferred formations,
  scouting knowledge of nations or regions: no field found. Candidate containers are the small pool
  objects the person block points at (`CAREER_PLAN` 16 bytes, `EXTRA_CONTRACTS` 32 bytes,
  `PERSON_LANGUAGE_LINK` 16 bytes, `NON_PLAYER_TENDENCY_ARRAY` 24 bytes). Their class names exist in
  the plugin but no object in a sampled player was matched to a field.
- Coaching licences: on 12 staff, byte pair at `+0x1B0` reads as little-endian `u16` of 0x5C72,
  0x605C, 0x5F94 and so on with `0xFFFFFFFF` after. This looks like a pointer or id, not a licence
  level. The earlier guess of `+0x1B2` as the licence holds no evidence. Unknown.
- Tendencies (attacking or defensive, playing style): `NON_PLAYER_TENDENCY_ARRAY` exists. The
  field on the staff object that points at it was not identified. Unknown.
- Scouting knowledge: relations codes (8, 53) and (8, 14) were looked at as candidates and do not
  appear for the named staff; no scouting data is in the relations list as far as observed.
  The scouting nation knowledge for a staff member is therefore not in this list.
- Work permit and registration for a human manager: the manager-menu actions `add_work_permit`,
  `remove_work_permit` and `squad_registration_anytime` are covered in fm27-human-manager.md.
  Per-player permit state remains unknown.

## Open questions

1. The proficiency scale for languages: is 10 native and what words belong to 1 to 9? Needs the
   UI for the same person at known values.
2. Does the game derive the native language from the nation, or is it stored elsewhere?
3. What is relation code 47 (person to person, graded 0 to 100)? Candidates: mentor, friend or
   rival links. Compare with the Relations tab of Guardiola or Arteta.
4. What do byte `+0x0D` values 78, 79 and 80 mean?
5. Where the player, staff and manager permit, registration, promise, plan, licence and formation
   data live. Next step: trace a UI string such as the licence or promise label to its code, as
   done for `become_unsackable`, rather than searching memory.

## Show in the app now

- Languages, read-only: player `+0x338`, staff `+0x1B8`, human manager `+0x1B8 + 0x340`, each a
  vector of pointers to `{LANGUAGE*, u64 0..10}` links, name from `LANGUAGE +0x18`.
- Relations list, read-only (already partly shown): player `+0x2C0`, staff `+0x140`, human manager
  `+0x140 + 0x340`; show only the codes marked high above.
