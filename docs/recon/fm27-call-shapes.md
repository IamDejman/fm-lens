# FM27 exact call shapes (work permits, mover, loan start)

Build 26340721, macOS ARM64 slice. All addresses are RVAs (game_plugin+0xRVA). Static analysis, plus read-only
probe dumps for the object conventions. Nothing here was run as a call in the game. No pointer
authentication, so every function is callable as a plain AAPCS64 address. Every mutator must run on the main
queue (dispatch_async_f). Scratch helpers live in reports/batch/scratch/transfers/.

## Summary

| Item | Status | Final signature | Confidence |
| --- | --- | --- | --- |
| 1 Work permit grant/revoke | found | 0x2d85294(TM, P+0x388, team, w3 force, w4 grant), void | high |
| 1 Record lookup | found | 0x2ddd12c(TM, P+0x388, team) -> int32 index or -1 | high |
| 1 Record remove | found | 0x2dc0210(TM, P+0x388, record*) | medium-high |
| 2 Low-level mover | found, NOT a signer | 0x2d49334(TM, idBlock, team or 0, w3..w7, stack u8, stack u64) -> bool | medium |
| 2 Free agent signing | partial | 0x2dfedac(TM, personBlock, destTeam, termsMap*, outVec*, w5=0) -> bool | medium-low |
| 3 Loan start | found | 0x2e0a324(TM, STARTING_LOAN*, w2=1) | medium-high |
| 3 Loan builder | found | 0x238d860(IGE, personBlock, team, map*) | medium-high |
| 4 Loan recall / early end | not found | none | n/a |

Conventions: TM = [game_plugin+0x56a49f8]. P = player object start (vtable 0x5588ee8). P+0x278 = person block,
P+0x388 = identity block (vtable 0x558a780, id u32 at +0x8, UID at +0xc, flags byte at +0x18). Team of a
contracted player = [P+0x128] = [[P+0x2f0]+0x18].

## Correction to fm27-transfer-actions.md

For 0x2dfedac and its IGE caller 0x238c860 the argument order is x1 = person block, x2 = destination team
(not team then person). Evidence: the callee reads the vbase through [x1]-0x18 and `ldrb [x2+0x2f]` is the team
kind byte. At 0x238c908: `ldr x0,[x8,#0x9f8]; mov x4,sp; mov x1,x22; mov x2,x21; mov x3,x20; mov w5,#0; bl 0x2dfedac`.

## 1. Work permits

### IGE handler (true start 0x238f110)

0x238f2b8 and 0x238f3d8 are only the analytics string loads ("add_work_permit", "remove_work_permit"). The handler
reads key 'dref' (player ref) and key 'tick' (bool). The player x19 comes from identity vtable slot 0x6e0 (player
object start). The manager x20 = [game_plugin+0x56a49f8].

- tick true: 0x2ddd12c lookup, then 0x2dc0210(TM, idBlock, record). Logs "remove_work_permit".
- tick false: grant call, logs "add_work_permit".

Grant call at 0x238f470:

    add x1, x19, x23     ; x23 = vbase [-0x18] = 0x388, x1 = P+0x388
    mov x0, x20          ; TM
    mov w3, #0           ; force = 0
    mov w4, #0           ; grant = 0 (!)
    bl  0x2d85294        ; x2 = team (below)

The editor itself passes w3=0, w4=0. With grant 0 this revokes or records an ungranted entry, so do not copy
the editor's w3/w4 for a grant.

Team (x2): if the contract P+0x2f0 is non-null and its vtable slot 0x90 returns 0 (FULL contract), x2 =
[contract+0x18]. Otherwise x2 = identity vtable slot 0x230 = [P+0x128]. For a contracted player both are the same
club team (verified live on Haaland: contract+0x18 = his club team). It is the CLUB team, not a nation team. The
nation is derived inside (0xe015c4(club) for kind 0, team+0x30 then +0x170 otherwise).

### 0x2d85294 (start confirmed)

    void 0x2d85294(TM x0, identity block x1, team x2, w3 force, w4 grant)

- x1 is obj+0x388, NOT the player start.
- x2 must be non-null when a record already exists (unguarded `ldrb [x2+0x2f]`); the create path returns early
  on null.
- w3 force: with 0 it proceeds only if global byte [0x56d499a] == 1 and predicate 0x4224df4 then 0x1c32b9c is true;
  otherwise it silently does nothing. force = 1 bypasses that.
- w4 grant: 1 grants, 0 revokes.
- Existing record (0x2ddd12c >= 0): fixes the nation if it differs, zeroes accumulators, sets or clears flag bit 0.
  Grant sets the flag, stamps today's date and adds to the +0x780 list if the date was unset. Revoke clears the
  flag, resets the date to 0x076c0001 and removes it from +0x780.
- No record: creates one with 0x2d8427c(TM, id, team, 1, grant); frees it if the nation has no [+0xf8]. Creation
  sets identity flag bit 2 (+0x18) and inserts into the +0x720 vector via 0x2ddcd90.
- Possible skip in the same-club / loan case (slot 0x3a0 object, local w23 guard). Medium confidence.
- Side effect: fires a slot 0x3c0 object notification (clears bit 33, calls vt+0x198 with 0x3b).
- Ownership: the manager owns records (pool alloc 0x4aee72c). Caller passes only plain pointers and ints.
- Return: none used. Main thread only.
- Other callers: (force 1, grant 0) 0x2d83064; (0, status==0xf) 0x2daca68, 0x2dada44, 0x2db48d8; (0, 1) 0x2e18ddc.

Recommended calls:

- Grant: 0x2d85294(TM, P+0x388, [P+0x128], 1, 1)
- Revoke flag: 0x2d85294(TM, P+0x388, [P+0x128], 1, 0)
- Delete record: i = 0x2ddd12c(TM, P+0x388, team); if i >= 0, 0x2dc0210(TM, P+0x388, record) (frees it)

### 0x2ddd12c

    int32 0x2ddd12c(TM, identity block, team or 0)

Returns -1 if identity flag bit 2 ([id+0x18]) is clear. Otherwise an index into the +0x720 vector (0x18-byte
records, equal_range on person id then nation match), or -1. Pure, no ownership.

### 0x2d8427c and 0x2dc0210

- 0x2d8427c(TM, id block, team, w3 insert-sorted, w4 grant): create. Returns early on null team.
- 0x2dc0210(TM, id block, record*): removes from both vectors and frees the record.

Record layout: +0 nation*, +8 u32 person id, +0xc u16 a, +0xe u16 b, +0x10 u16 year, +0x12 FmDate granted
(0x076c0001 = unset), +0x16 u8 flags (bit 0 = granted).

Live check: Sichenje (UID 12092701) has +0x3a0 byte 0x04 (bit 2 set); Haaland 0x00. Contract +0x8 = P+0x388.

## 2. Low-level mover 0x2d49334

True start is 0x2d49334 (0x2d49300 is the tail of the previous function). Prologue `stp x28,x27,[sp,#-0x60]!`,
`sub sp,sp,#0x8e0`.

    bool 0x2d49334(TM x0, identity block x1, team x2 or 0, w3 kind, w4, w5, w6, w7,
                   stack u8 [x29+0x10], stack u64 [x29+0x18])

- x1 is the IDENTITY BLOCK (P+0x388), not the player start. Confirmed by the clean caller 0x2c3d574, which passes
  the same register it called slot 0x230 on.
- x2: destination team. 0 means leave the current club (derives the first team of the current club's [+0x18] vector).
- w3: move kind / reason. Seen: 0, 1, 3, 4, 5, 6, 8, 9, 0xb..0xf, 0x10, 0x13. 0 may be rewritten to 0xc when slot 0x380
  is non-null and 0xff35bc != 0.
- w4: bool, 1 in most callers (nonzero builds an event/log record). w5: int, -1 = unspecified. w6, w7: bool flags.
- stack u8 = 1 and stack u64 = 0 in the editor and staff paths (read at 0x2d49810 and 0x2d4ad64).
- Returns bool success (0 on early exit).

### Free agents

x20 = identity vtable slot 0x3d8 (current club, 0xcb8cf8) is null for a free agent. With a kind-0 destination, w3 not
in {6, 8} and x20 null, the function reaches 0x2d494e0/0x2d494e4 and returns 0 with NO change. Kinds 6 and 8 set x20
to the destination club, but their three callers (0x2c2f4b0, 0x2c5f214, 0x2c5f274) pass x2 = 0. Conclusion: the mover
creates no contract and does not sign free agents. It moves already-affiliated persons. Confidence medium-high.

### Staff path 0x238cac8

(IGE obj, person block, destination team, terms map). It first builds, in order:

1. FULL_CONTRACT via pool alloc 0x4358000, init 0x18889c.
2. Contract factory call: global [0x56d2c88] object, vt[0x38](obj, contract, person, club=[team+0x30], w4=1,
   x5=&{byte job, byte 0, qword team}, w6=0, w7=-1, plus a stack struct).
3. CONTRACT_OFFER (pool 0x56a64d0, 0x48 bytes, refcounted): [+0x10] = contract, [+0x3e] = 2, [+0x41] = 1.
4. 0xcb7108(person, &offer), then 0xcb7738(person, &offer2).
5. Only then 0x2d49334 at 0x238d02c: x1 = x0 + [[x0]-0x20], x2 = team, w3=0, w4=1, w5=0, w6=0, w7=0, stack u8 1,
   stack u64 0. Taken only when job code (w19 & 0xfe) == 0x14.

This builds refcounted objects, so it is not a plain pointer/integer sequence.

### Signing a free agent: 0x2dfedac (what the editor really calls)

    bool 0x2dfedac(TM x0, person block x1, dest team x2, terms map* x3, out vector* x4, w5)

- x4: three zeroed qwords, destroyed afterwards with 0x4400a5c. w5 = 0 from the editor (immediate execute),
  1 from the offer path.
- Player path (job 'Pcjo' < 2): allocates FULL_TRANSFER_OFFER (pool 0x56b4e18) with 0x1831a2c, then
  0x1831b5c(offer, identity, team, fee, 0, 0x52efdf0, 1) with fee from key 'TrFe'. Date from 'TrDt', else today.
  Allocates FULL_CONTRACT (0x12853fc plus the factory call at 0x2dffe50 with w4 = 0x40, w7 = -1, args
  {byte Pcjo, 0, team}), sets contract+0x28 |= 1<<45, builds a CONTRACT_OFFER (0x2dbbb48), registers via
  0x26004ac([0x56a64c8], person, &offer), then executes with 0x2d1ac58(TM, &offerRef, 0) (immediate),
  0x2d91b20 (w5 != 0) or 0x2d91328 (future dated).
- Keys read: 'TrFe', 'TrDt', 'ArFR', 'Ttea', 'Pcjo', 'dref', 'tick'. 'Pcjo' falls back to 0xcb915c(person, 2).
- Non-player (staff job, 'Pcjo' >= 2) branch contains the two 0x2d49334 calls at 0x2dffb58 and 0x2dffc60.

Minimal sequence: there is no plain-integers route. Build a terms map (an empty map is structurally valid, since a
missing key falls back to the default holder at game_plugin+0x56d63c0, giving fee 0 and date today), call 0x2dfedac
with the free agent's person block and the destination club team. UNPROVEN: needs a live test on one free agent.
Terms map construction is described in section 3 (Value helpers).

## 3. Loan start

### 0x2e0a324

    void 0x2e0a324(TM x0, STARTING_LOAN* x1, w2 bool)

IGE passes w2 = 1 (stored at [x29-0x59]). Callers: 0x238d95c (IGE) and 0x2e09df4. Return value not used by the
IGE (not proven absent). Early outs, checked first: [x1+0x54] bit 4 set; player ([x1+0x18]) null; the player's
person (vt 0x6e0) null; loan club ([x1+0x20]) null or not a club (kind byte [+0x2f] != 0); club's parent null;
borrower and lender same; dates before today or window closed (global 0x56d4974 and 0x56b3390, clamps year to 2026).
So O+0x18 (player) and O+0x20 (loan club) are mandatory, and the loan window must be valid. Internally it calls
0x2e0c240, 0x2e0cc78, 0x2d4b9dc, 0x2d4f79c, 0x2dbbb48 (offer and contract creation). Not traced in full.

### Builder 0x238d860 (true start)

    0x238d860(IGE obj x0, person block x1, team x2, map* x3)

x1 and x2 are used only for telemetry via 0x238da74(.., w3=3). The builder makes a STARTING_LOAN object O in its
own stack frame (sp+0x10..sp+0x80, 0x70 bytes). There is NO constructor call and NO destructor: fields are
initialised inline and the object owns nothing.

| Offset | Init | Meaning |
| --- | --- | --- |
| +0x00 | vtable 0x55be9d8 | setter at slot +0x10 |
| +0x08, +0x0c | u32 -1, -1 | ids |
| +0x10 | u32 0 | |
| +0x18 | 0 | player (required) |
| +0x20 | 0 | loan club team (required) |
| +0x28 | 0 | parent team ('PLFl') |
| +0x30 | qword from [0x52dd8e8] | start date (+0x30), end date (+0x34) |
| +0x38 | u32 0x076c0001 | 'PcrE' date, unset |
| +0x3c | -1 | competition id |
| +0x40 | int | 'PLAS' |
| +0x41..0x48 | -1 bytes | |
| +0x50 | qword 0 | flags |
| +0x54 | (inside flags) | bit 4 aborts 0x2e0a324 |
| +0x58 | 16 bytes from [0x5390410] | |
| +0x5c, +0x60, +0x64 | u32 | money: 'PLmf', 'PLbf', 'Pfbb' |
| +0x68 | qword 0xff00000000000000 | |
| +0x6c | u16 | 'PLwc' |
| +0x6e, +0x6f | u8 | 'PLsn' squad number, 'PLNG' |

The builder loops over the map entries (16 bytes: u32 big-endian FourCC key, Value* cell) and calls the setter
vt[0x10](O, key, valueCell) (0x16f92d4). If O+0x18 or O+0x20 is still null afterwards it skips 0x2e0a324. So the
required keys are 'plyr' and 'PLcl'. Then it calls 0x2e0a324(TM, O, 1).

### Key decode (setter 0x16f92d4)

| Key | Effect | Value encoding |
| --- | --- | --- |
| 'plyr' | 0x11b5140(O+0x18, V) | person-ref Value built by 0x11b5034(identity block, &V), composite key 'Pers' = [id+0xc],[id+0x10] |
| 'PLcl' | O+0x20 team ptr | team-ref Value from 0x11b44e4(team, &V), composite key 'Ttea'; resolved by id via table 0x10b2328; sanity error if club flag mismatches |
| 'PLFl' | O+0x28 team ptr | same as 'PLcl' |
| 'PLsd' | O+0x30 start date | date Value (type code 0x1b, FmDate u32: year<<16, day of year in low 9 bits; default 0x076c0001) |
| 'PLed' | O+0x34 end date | date Value, same |
| 'PcrE' | O+0x38 | date Value |
| 'PLAS' | O+0x40 int | int Value (0x11b4874(v, 0)) |
| 'PLAC' | O+0x3c competition id | composite with sub-key 'comp' (0x636f6d70) looked up in table [0x56d2d30]; -1 if missing |
| 'PLAT' | O+0x48 byte | byte via TypeObj slot 0x48 |
| 'PLmf' | O+0x5c u32 | monthly fee, int Value, 0 if no value |
| 'PLbf' | O+0x60 u32 | 0 if no value |
| 'Pfbb' | O+0x64 u32 | 0 if no value |
| 'PLwc' | O+0x6c u16 | 0xffff if no value |
| 'PLsn' | O+0x6e u8 | squad number |
| 'PLNG' | O+0x6f u8 | 0xff if no value |
| 'PLfl' | O+0x50 \|= u64 (slot 0x58) | after clearing mask 0xFFFFFFFFBFFFF9FF |
| 'PLoc' bit0, 'PLic' bit1, 'PLbr' bit2, 'PLct' bit12, 'PLcr' bit13, 'PLob' bit15, 'PLmc' bit16, 'PLcm' bit20 | set/clear bit in O+0x50 | bool Value (TypeObj slot 0x38) |

### Value and map construction (IGE handler 0x25cf00..0x25d41c)

- Map: a vector object whose first two qwords are (begin, end) over 16-byte entries (u32 key, Value* at +8).
  Init with 0x43f6b78(map); destroy afterwards (IGE does at 0x25d9f4). A missing key reads the default holder at
  game_plugin+0x56d63c0, so an empty map is valid.
- Value: 16 bytes {TypeObj* from 0x4403cd4(), payload}. Init null with 0x4403b80, destroy with 0x4403bb0. Setters:
  0x4403e8c(V, byte) bool, 0x4403ec0(V, int32) int, 0x4403ef4(V, u32) uint/enum, 0x42f05b8 date Value from the date
  global at 0x56b1db8, 0x42f038c default Value.
- Insert: 0x43f72e4(map, key, &V) copies a plain Value; 0x43f9288(map, key, &V) inserts a composite (refs). The map
  owns copies, so destroy each temp Value afterwards.
- IGE order: 'PLcl' via 0x11b44e4 + 0x43f9288; 'PLsd' (today) via 0x42f05b8; 'PLed' another date, default
  today + 365 days via 0x42e9b44; bools via 0x4403e8c; ints via 0x4403ec0; 'PLAC' composite; 'plyr' via
  0x11b5034(identity) at 0x25d3e4 and 0x43f9288; then 0x238d860(IGE, person, team, &map).

Recommendation for FM Lens: either replicate the map recipe and call 0x238d860 (needs the IGE object), or fill the
0x70-byte O directly and call 0x2e0a324(TM, O, 1). The second avoids the Value machinery for everything except
the player and team pointers, which can be written straight into O+0x18 (player object, vt 0x5588ee8 per 0x11b5140;
write the pointer the helper would store) and O+0x20 (team). Writing the player pointer directly is UNPROVEN.

## 4. Loan recall / early end

Not found. No function ending a loan before the end date was located; only UI validators (0x342150) appeared. The
daily loan-expiry step and RECALL_FROM_LOAN processing were not traced. Status: not found.

## Open questions

- Identity vtable slots 0x3a0 and 0x3f8 semantics (loan/transfer-ish record).
- The w23 skip guard in 0x2d85294.
- w4..w7 beyond observed values for 0x2d49334.
- Whether an empty terms map signs a free agent through 0x2dfedac (live test needed).
- 0x2e0a324 return value and its tail (0x2e0c240 onward).
