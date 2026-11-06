# FM27 promises: listing, removal, status and undo (static recon)

Build 26340721, macOS ARM64 slice (UUID F4540355-2186-39CB-9119-C706A6A35346). All addresses are RVAs
(game_plugin+0xRVA). Static analysis only; nothing was run, attached to or written. No pointer authentication, so
every function is a plain AAPCS64 address. Every mutator must run on the main queue.

## Summary

| Item | Status | Final signature | Confidence |
| --- | --- | --- | --- |
| Promise manager PM | found | PM = [game_plugin+0x56a5688] (plain pointer in a global) | high |
| List ALL promises | found | vector of record* at PM+0xf8 (begin) / PM+0x100 (end) / PM+0x108 (cap), 8-byte refcounted ptrs, sorted insert | high |
| List ONE person's promises | found | V = [P+0x278+0xa8] = [P+0x320]; null or {begin,end,cap} of record*; no pool scan needed | medium-high |
| Remove by person + promise id | found | 0x2769208(PM, identity block P+0x388, w2 = promise id (rec+0x4e)) | medium-high |
| Remove all of a person's promises at his current club | found | 0x2769014(PM, identity block P+0x388) | medium-high |
| Remove exactly one record | found, 2 steps | 0x133aef8(rec) then 0x27683ec(PM+0xf8, &vec[i]) | high (semantics), medium (as a bridge sequence) |
| End a promise but keep it as history (game's own "break") | found | 0x2473a20(rec+0x20, rec, w2 status, w3 reason, subject, w5 notify) | medium |
| Undo of a removal | NO generic function | see section 4 | n/a |
| Type and status names | partial | field map below; no name table exists in the binary | low (names), high (offsets) |

Conventions as in fm27-call-shapes.md: P = player object, P+0x278 person block, P+0x388 identity block
(vtable 0x558a780). ACTUAL_PLAYER vtable 0x5588ee8 has vbase offsets [-0x20] = 0x278 and [-0x18] = 0x388
(read from the vtable data), which is what the game's `add x1, x19, [vptr-0x18]` call sites compute.

## Correction to fm27-player-extras.md "Promises"

- +0x44 is NOT the promise type. It is the subject parameter (default -1 = none), resolved with
  0x133bbf4(type, param): for some types it indexes the global object registry [0x56d2d80]+0x68 (team, person or
  competition), see 0x133bc84..0x133bcf4. Values 0, 27, 1, 122, 5, 28, 33 are subject ids.
- The type fields are +0x4e (u16 "promise_id", the specific promise) and +0x55 (u8 "promise_type", the category).
- +0x50 is a third FmDate (unset = 0x076c0001), not status bytes (set at 0x2459328/0x245932c).
- Status is the byte at +0x56.

Evidence for the names: the analytics emitter 0x133afa0 (string "Promise added or had status changed" at
0x11d977c). It prints, from the record: status = [+0x56] (0x133b6f8, key "status" 0x133b6e8), topic_id = s16 [+0x4c]
(0x133b768, key 0x133b758), promise_type = u8 [+0x55] (0x133b7d8, key 0x133b7c8), promise_id = s16 [+0x4e]
(0x133b3f4), failed_reason = u8 [+0x5a] (0x133b5fc), condition_value = u8 [+0x58] (0x133b66c). For records that have a
target object ([+0x10] non-null): promise_id = [t+0x12], target_difficulty = [t+0x14], target_current_total = [t+0x13],
target_tracked_events = [t+0x10], failed_reason = [t+0x15] (0x133b0b0..0x133b280).

## Record layout (INTERACTION_PROMISE, 0x60 bytes, pool at 0x56a65d8, accessor 0x194b70)

Constructor 0x1339064(x0 = refcounted ptr or 0) -> rec (refcount 0): pool pop from freelist 0x56a6600, then
+0 = 0, +8 = x0 (refcounted), +0x10..+0x30 = 0, +0x38 = FmDate pair constant, +0x40 = 0xFFFFFFFFFFFFFFFF
(so +0x44 = -1), +0x48..+0x57 = 0 (0x133910c..0x1339114). Destructor 0x13391e0 releases +0x10 (via 0x4aee714) and
+0x8 (via 0xcfa424). Pool free/return is the inline freelist push seen in every release site (e.g. 0x27685e0).

| Off | Size | Meaning | Evidence |
| --- | --- | --- | --- |
| +0x00 | u32 | intrusive refcount. Each holder owns one: PM vector, promised person's list, maker's list, subject's list. Doc value 3 fits | `ldaddal w,[x]` / `cmp w8,#1` release pattern, 0x27685a8 |
| +0x08 | ptr | refcounted aux object | 0x1339064 |
| +0x10 | ptr | refcounted target/progress object (null for target-less promises) | 0x133b004, 0x24bfc80 |
| +0x18 | ptr | maker (manager) | 0x133af08, 0x2483ccc (set to 0x175e508(team) + vbase[-0x20]) |
| +0x20 | ptr | promised person | 0x133af28, 0x2483d1c (stored raw, see live check 3) |
| +0x28 | ptr | team (kind byte [t+0x2f]==0 means club; club = [t+0x30]; [t+0x2e] bit0 gates audit emission) | 0x2769074..0x2769094, 0x275ff54 |
| +0x38 | FmDate | made date. Creator stores today | 0x2483d9c |
| +0x3c | FmDate | deadline while active. Every closing path overwrites it with today (so it is the end date once closed) | 0x275ff4c, 0x2473a7c, creator computes it with 0x245c63c at 0x2483dec |
| +0x40 | u32 | -1 | 0x1339108 |
| +0x44 | s32 | subject param (-1 none) | 0x133af4c |
| +0x4c | u16 | topic_id (seen 1998, 6000..6005, 6999) | 0x133b768, 0x275fe44, 0x2483d6c |
| +0x4e | u16 | promise_id, the specific promise. Seen 3, 5, 7, 9, 10, 11, 0x10, 0x43, 0x55, 0xed, 0xf2, 0xf3, 0xf7 | creators below |
| +0x50 | FmDate | third date, unset 0x076c0001 | 0x2459328 |
| +0x53 | u8 | closed flag (bit 0). Set by every close with +0x3c = today | 0x275ff3c, 0x2473a6c |
| +0x54 | u8 | bit 0 flag (skips the daily check when set) | 0x273927c |
| +0x55 | u8 | promise_type category (1..3 raise news and reactions in 0x2473a20, 5 special) | 0x2473ad0 |
| +0x56 | u8 | status | below |
| +0x57 | u8 | kind/flags (14, 15 and bits 14, 15, 29 tested by the daily step; creators write 2) | 0x2738570, 0x27385ec |
| +0x58 | u8 | condition_value | 0x133b66c |
| +0x59 | u8 | set to 2 by one creator | 0x2459314 |
| +0x5a | u8 | failed_reason | 0x133b5fc |

FmDate: u16 at +0 (low 9 bits = day of year, 1-based) and u16 at +2 (year). Unset = 0x076c0001 (year 0x76c = 1900,
day 1). Current date global at game_plugin+0x56b1db8 (same layout). Evidence 0x2767ae8..0x2767afc, 0x2738454.

### Status byte (+0x56): partial

Setter: 0x2473a20 (section 2). Facts from code, not names:
- 0 = open. 6 = no audit emission and no close flag; the daily step purges status-6 records 6 or more days after
  the +0x38 date (0x2738440..0x2738528, then 0x133aef8 + erase).
- Closing statuses (set +0x53 = 1 and +0x3c = today): mask 0xd9e = {1, 2, 3, 4, 7, 8, 10, 11} (0x2473a60).
- The game's own call sites use status 1 with reasons like 3, 4, 7, 8, 9, 12 (person left, situation changed,
  see table at the end) and status 4 with reasons 21, 30, 52, 59, 90, 115, 123. Reading from the call-site
  context (0x2779628 is the "type 0xed subject left" path), 1 behaves as "ended, not held against the player" and
  4 as "failed/broken". 2 is written together with +0x53 at 0x23efb88, 0x247c980, 0x247effc (most likely
  "fulfilled"). 3 and 0xb are written by 0x245f3e0 (3 for records with a target, 0xb without). Names are inferred,
  not read from a table.
- Any closed record is purged by the daily step once +0x3c is 31 or more days old (0x2739918..0x27399cc).

### Promise id (+0x4e) per creator (these are the only places a code is written)

| Creator | RVA | +0x4e |
| --- | --- | --- |
| Generic copy from template (templ+0x78 = +0x4c, +0x7c = +0x4e, +0x80 = +0x57) | 0x23b15cc, 0x23f03a0, 0x23f2a80 | from template |
| 0x2482f70 | 0x2483138 | 3 |
| 0x2483c40 (args: person x0, team x1, int8* level x2; level clamped to -2..2) | 0x2483d6c | 7 (+0x4c = 0x7ce) |
| 0x2483fcc | 0x2484168 | 9 |
| 0x245fc38 | 0x245fd54 | 0x10 |
| 0x276ed9c | 0x277102c | 0x43 |
| 0x247ed20 (clone of another record) | 0x247f228 | 0x55 |
| 0x24589c0 | 0x2459e3c | computed |

The daily step switch (0x273868x..) and PLAYER_HAS_ACTIVE_PLAYING_TIME_PROMISE (0x24bfc18, ids 5, 0xf2, 0xf3) give
semantic hints only. No string table maps these numbers. The "xxx promise not offered" strings
(0x51530e8..0x5153c49) belong to a contract-offer evaluation dump (0x1f1eb98, switch on a different byte
[offer+0x1fc]), so they cannot be used as the +0x4e names.

## 1. Listing

### 1a. All promises

PM = [game_plugin+0x56a5688]. Evidence: `adrp x8,0x56a5000; ldr x0,[x8,#0x688]` at every call site (0x2d4ad48,
0x2ce0794, 0x279b844, 0x27a0538, 0x2483df8). PM+0xf8/+0x100/+0x108 is a std::vector of 8-byte refcounted record
pointers, inserted sorted by comparator 0x2788c20 through 0x2767ac4 (so order is by the comparator, not by pool
index). Every walker (daily step 0x27383a8, 0x2759218, 0x275fdf8, 0x277962c, 0x2769224) reads
`ldp begin,end,[PM,#0xf8]`. Expect about 682 entries, matching the pool header count. Only live records are in
the vector (the pool also holds freed slots), which is a better scan than the raw pool.

### 1b. One person's promises (no scan)

    V = *(P + 0x278 + 0xa8)       ; = [P+0x320]; may be null
    if V: for q = V[0]; q < V[1]; q += 8: rec = *q

Evidence: identity vtable slot 0x6d8 is 0xca4a58 = `x0 + [[x0]-0x6e8]`; the vbase value at 0x558a780-0x6e8 is
-0x110, so slot 0x6d8 of the identity block returns identity - 0x110 = P+0x278 (the person block). 0xcdb148 then
does `ldr x19,[x0,#0xa8]` and treats it as the vector (0xcdb164). PLAYER_HAS_ACTIVE_PLAYING_TIME_PROMISE reads the
same thing: `[obj + vbase(-0x20) + 0xa8]` then `ldp begin,end` (0x24bfc5c..0x24bfc6c). The maker (manager) has the
same list on his own block. The record is also in a third list owned by the subject object (0x133bbf4(type, +0x44)).
Pool scan with rec+0x20 == person is the fallback and is what Lens already does.

Filter by the promised person: rec+0x20 equals the person pointer (identity block, see live check 3). Records
where [rec+0x20]+0xc == -1 are unresolved handles (index at +8 into [0x56d2d80]+0x68), the game resolves them at
0x2769260..0x27692e0.

## 2. Removal: the game's own functions

None of these is an in-game-editor action. The IGE action strings (0x5155b6e onward) are cancel_future_transfer,
add/remove_work_permit, remove_ban, remove_injuries, remove_unhappiness, terminate_contract, change_morale and so on;
there is no promise action. The removal code below is called from the mover (0x2d49334 at 0x2d4ad54/0x2d4ad60), from
0x2dae160 (0x2db120c), from 0x2a97170, 0x2c4660c, and from the daily step. All are plain pointer/int calls.

### 2a. Unlink + erase primitives (what every removal is built from)

    void 0x133aef8(rec x0)
    void 0x27683ec(vec* x0 = PM+0xf8, iterator x1 = pointer to the slot in the vector)

- 0x133aef8 (0x133aef8..0x133af9c): for rec+0x18 and rec+0x20 it calls the slot 0x6d8 owner then
  0xcdb148(container, rec); then 0x133bbf4(+0x4e, +0x44) gives the subject object and, if its slot 0x40 returns 1,
  0xcdb148(its container, rec). It does not touch PM and does not free.
- 0xcdb148(container, rec): `[container+0xa8]` vector, linear find of rec, erase by shifting down, release the last
  slot (0xcdb164..0xce1450). Inverse: 0xcdacd8(container, rec).
- 0x27683ec: erase one element (0x27683ec..0x2768594): shifts down, releases removed refs, refcount 0 returns the
  element to the pool freelist (0x27685e0 push, with the destructor part 0x2768464..0x2768484).
- The exact game sequence (identical at 0x2739990, 0x27593d8, 0x275ff78, 0x2769164, 0x2769280):
  `0x133aef8(rec); it = find(PM+0xf8 vector, rec); if it != end: 0x27683ec(PM+0xf8, it)`.
  No locks, only atomic refcounts. Main queue only.

### 2b. Remove all of one person's promises with one promise id (best single call)

    void 0x2769208(PM x0, identity block x1, w2 = promise id)

Start verified: preceded by `ret` at 0x2769204, prologue `stp x26,x25,[sp,#-0x50]!` at 0x2769208. Behavior: walks PM+0xf8
backwards; for each record whose [rec+0x20] equals x1 (after handle resolution) and whose u16 [rec+0x4e] equals
w2 & 0xffff: 0x133aef8(rec), erase (0x2769280, 0x2769310). No news, no status change, no unhappiness. Returns nothing.
Game call site: 0x2cd4228 with x1 = x19 + [[x19]-0x18] (= P+0x388 for a player), w2 = 9 or 10.
Preconditions: PM non-null, x1 is the identity block that is stored in rec+0x20 (live check 3). A person can hold
two records with the same id, so this removes both. Confidence medium-high.

### 2c. Remove all of a person's promises tied to his current club

    void 0x2769014(PM x0, identity block x1)

Start verified: preceded by `bl 0x25064` (EH landing pad) at 0x2769010, prologue `stp x26,x25,[sp,#-0x50]!` at
0x2769014. x1 vtable slot 0x240 (0x1489900) = the person's club. Backward walk; a record qualifies when
[rec+0x28] is a club team ([team+0x2f] == 0, [team+0x30] non-null), the person is rec+0x20 or rec+0x18, and
[team+0x30] equals that club (0x2769074..0x2769160); then 0x133aef8 + erase (0x2769164, 0x27691c4). This is what the
mover runs when a person leaves (0x2d4ad54, with the pre-contract session cancel 0x2605010 before it). No filter by
id, so it is "clear all". Returns nothing.

### 2d. Remove exactly one record (bridge sequence)

    s1: 0x133aef8(rec)
    s2: 0x27683ec(PM+0xf8, &vec[i])      ; &vec[i] = begin + 8*i, i = index of rec in the PM vector

The bridge cannot search the vector, so FM Lens must read the PM vector just before and pass the computed slot
address as a value. If the vector changes in between (promise created or purged by the game), the slot points at
another record. Mitigation: run only when the game is idle and re-verify `[begin+8*i] == rec` in the same
dispatch (not possible inside the bridge), or use 2b when the (person, id) pair is unique. Confidence high for the
semantics (it is the game's own pair), medium as a bridge sequence.

### 2e. End a promise but keep it as history ("break/close")

    void 0x2473a20(x0 = promised person ptr (= [rec+0x20]), x1 = rec, w2 = status, w3 = reason,
                   x4 = subject object or 0, w5 = notify 0/1)

Evidence: 45 call sites; model call 0x2779728 passes x0 = [rec+0x20], x1 = rec, w2 = 1, w3 = 3, x4 = subject, w5 = 1.
Body: if +0x53 bit 0 is clear and w2 in mask 0xd9e then +0x53 = 1 and +0x3c = today; always +0x56 = w2 (0x2473a80);
w2 not in {0, 6} and [team+0x2e] bit 0 then 0x133afa0 (audit); then if +0x55 in 1..3 and w5 != 0 it builds news and
reactions through a jump table on w3 - 3 (valid 3..0x7c, else returns, 0x2473b60..0x2473b98); +0x55 == 5 has its own
branch (0x2473c4c). With w5 = 0 and +0x55 not 5, it only changes status, dates and the audit line. The record stays in
all lists and is purged by the daily step 31 days after +0x3c. Reversible by restoring +0x3c, +0x53, +0x56 (3 raw
fields). Confidence medium: status meaning and the effect of the status on happiness/targets elsewhere is not traced.

Other close helpers: 0x275fde0(PM, identity block): closes and removes the first record for that person whose
u16 [+0x4c] is 6000..6005 or 6999 (sets +0x53, +0x3c, +0x56 = 1, 0x275f854 message, 0x133aef8, erase); called from
0x2ce07a8. 0x2779628(PM, subject): closes id 0xed records with 0x2473a20(status 1, reason 3).

### Recommendation for FM Lens

"Remove" = 2b when the target is identified by (person, +0x4e), 2d when it must be one exact record. Do not write the
vector or pool raw. "Cancel but keep" = 2e with w5 = 0.

## 3. Names for codes and dates

- +0x38 = made date, +0x3c = deadline (becomes the end date once +0x53 = 1). Evidence above. Doc values "both in
  2027" fit.
- No table of names for +0x4e, +0x55 or +0x56 exists in the binary strings (checked "promise" strings, news dumper,
  rule classes). The in-game text is in external localisation files. Names have to come from the screen: open a
  player with a known promise (Interaction, Promises) and match +0x4e, +0x55, +0x56, +0x44 against what the UI shows.
- Known id semantics from code only: 7 is created with a signed level -2..2 for a team (0x2483c40), 5, 0xf2, 0xf3
  are tested by the playing time rule, 0xed is about a subject person leaving (0x2779628), 0xf7 is tested at 0x245f4dc.
- News classes that exist: PLAYER_PROMISE_FAILED, PLAYER_PROMISE_EXTENDED, PROMISE_CONTRADICTED,
  PROMISE_ENDING_WARNING, PRESS_PROMISE_CREATED, PLAYER_PRE_CONTRACT_PROMISE_SUCCESSFUL.

## 4. Undo

There is no generic "re-create a promise from fields" function. The creators are per promise id (table above) and take
domain arguments (team, level, template), not raw fields. After a removal the record is freed (all refs dropped), so
an undo has two options:

1. Prefer a reversible action: 2e (close with w5 = 0) and, to undo, write back +0x3c, +0x53, +0x56 (saved before).
   No allocation, no list work. Works until the 31-day purge.
2. After a real removal (2b, 2c, 2d), re-creation needs: alloc `rec = 0x1339064(0)` (refcount 0), write the saved
   0x60 bytes (+0x00 refcount must end consistent, +0x8/+0x10 must be re-created or zero), link
   `0xcdacd8(owner container, rec)` for the promised person, the maker and the subject (the exact inverse of
   0x133aef8), then `0x2767ac4(PM, &rec)` (sorted insert into PM+0xf8; it also fixes an unset +0x3c). The refcount
   handling (creators hold a local handle with `ldadd` +1) cannot be expressed in the bridge, and +0x8/+0x10 are
   owned sub-objects. A cheaper variant needs a raw refcount pin (+1 on +0 before removing, release after the
   undo), then undo = three 0xcdacd8 calls + 0x2767ac4. That requires a raw write and live verification, so it is a
   follow-up, not part of this recon.

## Needs checking in the running game (read-only first)

1. PM: [gp+0x56a5688] non-null; (end-begin)/8 at PM+0xf8/+0x100 is close to the pool live count (about 682).
2. Person list: for a player with a known promise, [P+0x320] non-null, and its entries are records whose +0x20
   equals the player. Count it against the UI (1 per promise).
3. rec+0x20: is it P+0x388 (identity block, vtable 0x558a780) or P+0x278 or P? The static evidence says P+0x388
   for 0x2769208 (and the mover passes the identity block to 0x2769014). If it is not, pass the pointer that
   equals [rec+0x20], because the compare is a raw pointer compare (0x276926c).
4. Field meanings: dump +0x38/+0x3c (made, deadline), +0x44, +0x4c, +0x4e, +0x53, +0x55, +0x56 for 5 promises with
   different UI types and statuses, and fill the names.
5. On a throwaway save, with the game idle: run 0x2769208 on one (person, id); check PM count -1, person list
   count -1, maker list count -1, refcount of the record before (expect 3 or 4), no crash, UI refreshes (it may need
   a screen change). Then 2e on another record and confirm the UI shows it ended and the three fields restore it.
6. Thread: both removal functions only use atomics (no mutex), but the daily step iterates the same vector. Run the
   bridge only when the game is not processing days (no GAME_PROCESSING active); not verifiable statically.
7. A removal does not reverse any unhappiness or morale the promise created. Check the player's happiness list after
   a removal.

## Evidence index

- Pool init, 209 inline copies, string "INTERACTION_PROMISE" 0x504f8c5 (e.g. 0x2738fd4, 0x13391e0 pool accessor
  0x194b70).
- Daily step: message handler 0x2737cac (descriptor name string at 0x56ba170 via 0x2738304; matches "/GAME/INTERACTION/
  PROCESSING_INTERACTION_PROMISES" 0x515ba52). It iterates PM+0xf8 (0x27383a8) and purges at 0x2738528 and 0x2739990.
- Edit session: PERSON_PROMISES_EDIT_SESSION vtable 0x55e5ca0, slot at 0x229d2dc runs against a different manager
  ([game_plugin+0x56a64c8], vector at +0x90 of pre-contract session entries {+0x10 person, +0x18 team, +0x24 id}).
  Its cancel path is 0x2605010(mgr, person, team, 0) and its commit path is 0x2606210. These are pre-contract
  negotiation promises, not the INTERACTION_PROMISE pool.
- Insert: 0x2767ac4. Constructor: 0x1339064. Container add: 0xcdacd8. Subject lookup: 0x133bbf4.
