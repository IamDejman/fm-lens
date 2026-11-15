# FM27 player extras: where the data lives

Method: FM's own code in the disassembly (RTTI, property codes, editor handlers, pools), plus read-only
probe reads of the running game (build 26340721, arm64, career "FM Lens Nation 2026-11-05", 11 Dec 2027).
RVAs are game_plugin+RVA. Nothing was written to the game.

## Summary

| Item | Status | Confidence |
| --- | --- | --- |
| Injuries (add, change, clear) | found | high for layout and clear, medium for add |
| Bans (add, change, clear) | partial | medium for layout, low for add |
| Work permits | found | high for storage, medium for the score fields |
| Promises | partial | medium for the record, low for the owner list |
| Youth intake | partial | low |
| Squad registration | found on Windows, league only (read) | high for the league entry, not found for cups |
| Career plans | found on Windows (read) | high for the target, low for the other bytes |
| Squad status | already mapped | high |

## Squad status

Already mapped: `contract.squad_status` at contract +0x54 in profiles/fm27/layout-macos.toml. Nothing to do.

## Injuries

Status: found.

Where. A player's `injuries` pointer (+0xF0) leads to a record with two vectors (see docs/recon/fm27-bans.md).
The vector at +0x00 holds injury objects. Each is allocated from pool "PLAYER_INJURY" (pool object at
game_plugin+0x56b3488, element size 0x38). Element layout, read live on player index 0 (record 0x7aece58000):

- +0x00 u32 id
- +0x08 pointer to the db INJURY type row
- +0x10 context pointer (usually 0)
- +0x18 team pointer
- +0x20 FmDate injury started
- +0x24 u32 0xFFFFFFFF
- +0x28 u16 longest days, +0x2A u16 shortest days
- +0x2E u8 (7 seen), +0x2F u8 kind
- +0x30 u16 init 0xFF00, +0x33 u8 0xFF

Evidence. profiles/fm27/layout-macos.toml `[injury]` already uses started 0x20, longest 0x28, shortest 0x2A,
team 0x18, kind 0x08. Live read matched (started day 343 of 2027, longest 0x10, shortest 9).

Values to check in FM: a player whose injury FM Lens lists. Open the player's medical tab and compare the
injury name, the return date and the expected duration.

Editing.
- Change a length or date: raw write of the u16s at +0x28/+0x2A is safe, FM re-reads them. Keep shortest <= longest.
- Clear: FM's own function 0x11eafa4 (called from the `remove_injuries` editor callback at 0x238a95c). It also
  resets condition (+0x254) and sharpness (+0x250) to 10000 and sets jadedness (+0x252). FM Lens already
  clears by emptying the list; a call is the cleaner path.
- Add: needs FM's function, because it takes a pool object and grows a vector. Add-injury is at RVA 0x27047d4.
  Args: x0 injury manager (global at game_plugin+0x56a5740), x1 player, w2 index into the db INJURY table
  (global at +0x56d2d58, negative means random through 0x2704234), w3 kind/cause, w4, x5, x6, w7, stack
  [sp+0] u8, [sp+8] pointer, [sp+0x10] u16. Returns early if the byte at +0x56d4952 is 1 or the player already
  has an injury of the same type. A typical caller (0x1a224f8) calls it only when the list is empty, with w3=3.
  Other callers: 0x26f7058, 0x26f9e80, 0x26fa598, 0x27009e8, 0x2701f00, 0x27041e0, 0x2715b88, 0x2716298.
  Plan: run it from FM's main thread at a known idle point, with w3=3 and a valid table index. Not live-tested
  because the probe cannot call functions. Guard: check the two early-return conditions first.

## Bans

Status: partial.

Where. Ban entries are 0x20 bytes from pool "PLAYER_BAN" (pool at game_plugin+0x56b3430, free head +0x56b3458).
They sit in the absence list of the injury record (+0x18 vector of 32-byte entries): +0x10 date, +0x14 u16 rules
id, +0x16 u16 scope (0xFFFF none), +0x18 u16 1, +0x1A u8 (2 or 6), +0x1B u8 3, +0x1C u8 matches left.
Creation code is at 0x1b0a8b4 inside the discipline handler starting near 0x1b09b34 (called from 0x1b09434 and
0x1b096d8). Its inputs are the player's booking container and a GAME_DISCIPLINE record (rules id at +0x3C).
The entry is registered in a sorted vector at [manager+0x38] through 0x3cc43ac. How entries then reach the
player's absence list was not traced. The `remove_ban` editor handler is at 0x238e4d8; its per-player
callback was not read.

Values to check in FM: a suspended player, Discipline screen: number of matches left.

Editing. Changing matches left (+0x1C) is a raw write that fits what FM Lens does today. Adding a ban has no
simple API; do not build it by hand. Clearing: FM's `remove_ban` callback is the safe route.

## Work permits

Status: found, live-verified.

Where. TRANSFER_MANAGER singleton: pointer in a global at game_plugin+0x56a49f8 (vtable 0x55f9988
"16TRANSFER_MANAGER"). At manager +0x720 is a vector (begin, end) of pointers to 0x18-byte permit records,
sorted by the u32 at record +8. 1045 records were present. A record means the player holds a work permit for
that nation: FM shows "Active work permit" until his contract ends. At manager +0x780 is a vector of the records
that are ESC slots (25 entries, equal to the count of records with flag 1).

Record layout:
- +0x00 pointer to the db NATION (nation id at +8, nation UID at +0x0C)
- +0x08 u32 person id (matches player +0x390 for 1006 of 1045)
- +0x0C u16 a, +0x0E u16 b (accumulators, meaning unknown, start 0; likely the British score inputs)
- +0x10 u16 year created
- +0x12 FmDate the day the ESC slot began (1/1/1900 unset)
- +0x16 u8 flag, bit 0 = ESC slot (Elite Significant Contribution: FM's one-year exception for an under-23)

Evidence. Flag-1 records seen for Collins Sichenje (Kenya, Charlton), Mees Rijks (Netherlands, Bristol Rovers),
Benony Breki Andresson (Iceland, Stockport).

Checked in FM on 15 Dec 2027: a flag-1 record shows as an ESC slot, a flag-0 record as "Active work permit,
Until <contract end>".

Editing. Use FM's functions, not raw flag writes, because the granted list at +0x780 must stay in step:
- give: 0x2d85294(manager, player, team, w3 force, w4 esc). It makes the record where there is none. w4=1 makes
  it an ESC slot dated today and adds it to +0x780; w4=0 clears the flag, resets the date and takes it off +0x780,
  so the record stays as a work permit. With w3=0 it acts only where the rules say he needs a permit (the gate at
  game_plugin+0x56d499a and the rules check); w3=1 skips the gate. FM's editor gives with (0, 0).
- create record: 0x2d8427c(manager, player, team, w3, w4 grant).
- lookup: 0x2ddd12c(manager, player, team) returns an index into the +0x720 vector or -1.
- remove record: 0x2dc0210(manager, player, record). Takes it off +0x780 and +0x720 and frees it. FM's editor
  removes a permit with the lookup, then this.
Editor handlers `add_work_permit` 0x238f2b8 and `remove_work_permit` 0x238f3d8 show the call shape and read the
manager from the global at +0x56a49f8. Daily steps: CALCULATING_BRITISH_WORK_PERMIT_SCORES and
PROCESSING_WORK_PERMIT_DECISION_DATES. Rules: work_permit_rules, work_permit_days_to_wait, work_permit_cost.
Guard: read-only display is safe now. A write must run on FM's main thread.

## Promises

Status: partial.

Where. Pool "INTERACTION_PROMISE": pool object at game_plugin+0x56a65d8, element size 0x60, 0x400 elements
per chunk, about 682 live per the pool header. Chunk read at 0x7ae1250000. Decoded from live bytes:
- +0x00 u32 kind-like value (3 for most records)
- +0x18 pointer to a db ACTUAL_NON_PLAYER (the manager or staff who made the promise)
- +0x20 pointer to the promised person, class ACTUAL_PLAYER for 662 of the first sample, others
  ACTUAL_NON_PLAYER or HUMAN_NON_PLAYER
- +0x28 and +0x30 pointers to a db TEAM
- +0x38 and +0x3C FmDate (made and due or similar, both seen in 2027)
- +0x40 u32 0xFFFFFFFF
- +0x44 u32 code (0, 27, 1, 122, 5, 28, 33 are the most common; likely the promise type)
- +0x50.. small bytes (status or progress flags; two recurring patterns, 00 00 00 00 02 and e8 7a ...)
Not decoded: the exact meaning of +0x00, +0x44 and the +0x50 bytes, the owner list that links a person to their
promises, and a removal function. The news dumper at 0x133b000 names the related fields: event_type, target,
promise_id, target_difficulty, target_current_total, target_tracked_events, failed_reason, condition_value,
status, topic_id, promise_type. Daily step: PROCESSING_INTERACTION_PROMISES. Classes PERSON_PROMISES_EDIT_SESSION
and PLAYER_HAS_ACTIVE_PLAYING_TIME_PROMISE exist.

Values to check in FM (needs the screen): open a player with a known promise (Interaction, Promises) and note
type, deadline and status; then match the record whose +0x20 points at that player and compare +0x44 and
the dates.

Editing. Reading by scanning the pool for +0x20 == player address works. Removing a promise by raw write is
not safe until the owner list is found. Prefer FM's PERSON_PROMISES_EDIT_SESSION path.

## Youth intake

Status: candidates found and edited on Windows (Steam 26577676, 15 November 2026); the intake itself is not mapped.

Where. REGENERATION_MANAGER object (vtable 0x55f7c28), pointer in a global at game_plugin+0x56a8428 (verified,
live object 0x7afb2a0e00). It holds a vector at +0xA8/+0xB0/+0xB8 of 754 pointers to NEWGEN_TEMPLATE
(pool at 0x56bb1d0, element 0x128, float distributions from +0x4C). Those are generation templates, not
candidates. Other vectors at +0xC0, +0xD8, +0xF0, +0x100 (counts 217, 213, 59, 300) were not identified.
The intake runs from 0x2a32464 (body 0x2a32480), called in a loop at 0x1bd4fa4 inside 0x1bd4ee8, and builds
REGENERATION_YOUTH_INTAKE_NEWS (vtable 0x564aaf8). db FUTURE_REGEN (vtable 0x55abfd0) belongs to the Fantasy
Draft pregen file, not to normal intake; no live instance was found.
Competition rules `newgen_intake_day` ('ngid' 0x6e676964) and `newgen_intake_variance` ('ngiv') are loaded near
0x1124ac8. Inputs are club info youth_recruitment +0x12D, youth_facilities +0x12B, youth_coaching +0x12C and the
nation youth rating, a signed i16 at nation +0x874 (from the accessor at 0x13e8ba8; this replaces the +0x576
guess in docs/recon/fm27-nations.md).
Before the intake FM shows only a preview: Youth Setup, Youth Candidates lists how many players of each position
are coming and a rating for each (16 for Arsenal in March 2028, "Average Intake"). No player objects exist for them
then. On the intake day the game creates the candidates as ordinary players: new UIDs in a run (Arsenal's 16 were
2002085017 to 2002085032), no contract, in the club's under-18s list (team kind 12) with their `team` pointer on it.
The game's youth candidates team (kind 22, which plays the YC matches) keeps an empty player list before and after
the intake, so the editor reads and edits candidates as under-18 players. In that save Arsenal's intake fell between
23 and 30 March 2028, not on the rule's day, which fits `newgen_intake_variance`.

Checked against FM on a copy: Traye Borders read CA 78, PA 158, DM and MC, 188 cm (FM: 6'2"), left foot 12 and
right foot 20; his aggression and left foot set to 18 and 16 showed in FM's profile at once (Strong for the left
foot) and held through Save As and a load (docs/EDITING-VALIDATION.md). Not checked: signed and released
candidates. Related: patch name REGENERATION_MANAGER_clear_newgen_intake_reports_fm27, YOUTH_TRIAL_CONTRACT
(`db::` class).

Values still to check in FM: the nation's youth rating screen against the i16 at nation +0x874.

## Squad registration

Status: found on Windows for the league (Steam 26577676, 15 November 2026). Read only.

A player's registration is one of his relations (the list behind his pointer at `+0x300`, moved with his person
block; 16-byte entries, see fm27-person-extras.md). Registered for his team's league is an entry whose target is his
team (`+0x130`), with target kind 4, code 0x19 and value 8. The game's own rule reads it the same way:
PLAYER_IS_REGISTERED_TO_PLAY (Windows vtable 0x4e178e8) evaluates at 0x3dd0a40 through 0x3784940 and 0x1664190 into
0x1637eb0, which walks the relations for kind 4, a code from 0x19 to 0x1d and the value asked for.

Checked against FM's Squad Registration page for Arsenal on 18 July 2028: the page reads 18 of 25, and the 18
players with the entry are the 18 it has switched on (Raya, Kepa, Gabriel, Saliba, Pacho, Calafiori and Hincapie
among them; Rui Silva and Mosquera off, with no entry). Kepa's object is laid out as a player-coach's, so his list
sits 0xF8 further. Of the 24 in the senior squad, 18 read registered and 6 not. Counts read elsewhere, not compared
with FM: Chelsea 25, Coventry 24, Real Madrid 24.

A team none of whose players holds the entry (a league that registers nobody, such as Julian Brandt's at Ajax in the test career,
or a youth team) says nothing about a player, so the editor shows no row there. FM's exemption for players aged 20
or younger is worked out, not stored: such a player reads as not registered when he is in the senior squad.

Other entries of kind 4 seen and not made sense of: code 0x19 with value 19 (every player of the club), 11 and 255
(national teams), 3 and 44; codes 0x38 and 0x43. Not found: registration for cups and continental competitions,
and what a player on loan holds. The info classes REGISTERED_PLAYERS_LIST_INFO,
PLAYERS_ALLOWED_TO_BE_REGISTERED_INFO and PLAYERS_NOT_ALLOWED_TO_BE_REREGISTERED_INFO are transient. Editing would
have to go through the game's own registration (the page's Confirm), which is not traced. The Macs and Game Pass
are not read.

## Career plans

Status: found on Windows (Steam 26577676, 15 November 2026). Read only.

The pointer at `+0x350` of the player (0xA0 into his ACTUAL_PERSON, moved with his person block) leads to the
(begin, end) of pointers to 16-byte CAREER_PLAN records:

| Offset | Holds |
| --- | --- |
| `+0x00` | pointer to what he aims for |
| `+0x08` | u8: 1, 2 or 7 seen; not made sense of |
| `+0x09` | u8: 1 or 2; the game's matcher counts only 1 |
| `+0x0A` | u8: always 1 |
| `+0x0B` | u8, the kind of target: 3 a club, 5 a continent, 9 a nation (its national team container), 25 a competition |
| `+0x0C` | u8: always 2 |
| `+0x0E` | u8: 0 to 8; not made sense of |

There are no dates. The four rules PLAYER_HAS_*_CAREER_PLAN_WITH_SENDER_CLUB_RULE (Windows vtables 0x4e1d408 club,
0x4e1d4d8 division, 0x4e1d568 nation, 0x4e1d5f8 continent) evaluate at 0x3ddd280, 0x3ddd380, 0x3ddd480 and
0x3ddd580 through one matcher, 0x195e1a0, which walks this list.

Read over the whole save: 7,951 of 31,003 players hold 8,809 plans (8,354 for a club, 212 for a nation, 192 for a
competition, 51 for a continent), every one of them named; 1,532 of those players are laid out as player-coaches.
Julian Brandt has four: Werder Bremen, then France, China PR and Saudi Arabia. Rafael Santos Borre has one, for
South America. FM has no screen for them (its pre-game editor does), so no plan was compared with FM. Staff and
the human manager are not read; nor are the Macs and Game Pass. Nothing is edited: three bytes of the record are
not understood.
