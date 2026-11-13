# FM27 Steam 26340721 (macOS arm64): future transfers, instalments, buy-backs

Static analysis only (gp-arm64 slice, UUID F4540355-2186-39CB-9119-C706A6A35346). RVA = file offset for text.
Conventions: TM = [game_plugin+0x56a49f8] (TRANSFER_MANAGER), P = player object, identity block = P + vbase (0x388),
"offer" = FULL_TRANSFER_OFFER object, "club" = object at [team+0x30].

## 0. Status and answers in one place

| Question | Answer | Confidence |
|---|---|---|
| Where is an agreed club-to-club future transfer stored? | Same two places as FM Lens' own free-agent signing: offer in TM+0x20 vector (status 0x13), dated record in TM+0x50 vector. Same registration function 0x2d91328 | high |
| Is FM's own cancel the pair FM Lens uses? | Yes. The server handler of PLAYER_CANCEL_FUTURE_TRANSFER runs 0x238bce0, whose loop is `cancel_offer` (0x2D180B4) then `drop_dated_transfer` (0x1827808) per pending offer, exactly as `cancel_signing` | high |
| Does FM Lens need new calls? | No new function. Needs reader fixes (person ref stub, lazy from-team) and a class check, see section 5 | high |
| Instalments | TM+0xd8 vector (TM+0xD0 on Windows) of 0x28-byte records, created on the completion day, paid on the 1st of each month | high: matched with FM on Windows (section 8) |
| Buy-back | PLAYER_BUY_BACK_INFO (0x28 bytes) in the BUYING club's list at [club+0xb0], created on completion | high for the fee and holder: matched with FM on Windows; window dates not compared (section 8) |
| Extra payments (EXTRA_TRANSFER_PAYMENT_INFO) | class and factory found, no creation site traced | low |

## 1. Storage of an agreed future transfer

### 1.1 Registration (shared by free agents, club-to-club, loans)

`0x2D91328(TM, &offerRef, &date)` (x0 TM, x1 pointer to the slot holding the offer, x2 pointer to the u32 FmDate; return
unused). At 0x2d9162c..0x2d91780 it
- allocates 0x10 bytes (0x4aee72c at 0x2d91630): `{+0 person ref = [offer+0x38], +8 u32 FmDate = [x2], +0xC u32 offer id = [offer+0x5c]}`
  (stores at 0x2d9163c, 0x2d91648, 0x2d9164c);
- sets the offer status to 0x13 with reason 5: `0x186ee30(offer, 0x13, 5)` at 0x2d91658;
- appends the record to the pointer vector TM+0x50 (begin), +0x58 (end), +0x60 (capacity) (0x2d9165c..0x2d91738) and sets
  byte TM+0x68 = 1 (0x2d91780).
TM+0x50 is the same vector as (TM+0x18)+0x38, which is why `drop_dated_transfer(TM+0x18, ...)` operates on it
(0x1827830 reads `[x0+0x38]`/`[x0+0x40]`).

Callers of 0x2d91328 (each in a different creator): 0x2c2da64 (fn 0x2c2b1e4), **0x2d8f9a8 (fn 0x2d8ed5c, the club-to-club path)**,
0x2dbb288 (0x2dbaeac), 0x2dd62a0 (0x2dd4ccc), 0x2ddec38 (0x2dde364), 0x2dffff8 (0x2dfedac, FM Lens' free-agent sign),
0x2e0704c/0x2e075ac/0x2e07c3c (0x2e06220, new-game STARTING_FUTURE_TRANSFER), 0x2e0bde0 (0x2e0a324, loan start),
0x3828ee8.

### 1.2 Why club-to-club deals use it

0x2d8ed5c(TM, x1 = person/identity, x2, x3 = offer ref, x4 = terms) is called from the offer handler 0x2d572f8
(0x2d57e8c and 0x2d580bc). It builds a completion date at 0x2d8f940 (`[0x56a67f0]->vt[0x58](.., 0)`, stored at [x29-0x80]),
compares it with today (year at 0x56b1dba, day of year 9 bits at 0x56b1db8; 0x2d8f988..0x2d8fa4c). If it is later: `0x2d91328`
(0x2d8f9a8). Otherwise it completes at once with `0x2d91b20` (0x2d8fa5c). The date is therefore the game's transfer
completion date (window opening or contract start), not a user term.

### 1.3 Records and offers: offsets

TM (all verified in code unless marked):
- +0x18: owner object whose +0x38/+0x40 is the dated vector (drop_dated_transfer first argument).
- +0x20 / +0x28: offers, vector of pointers; index = offer id (0x2e195d8..0x2e195f4 index `[TM+0x20]` with the record's id).
- +0x50 / +0x58 / +0x60: dated records (above). +0x68: byte, set to 1 on add.
- +0xd8 / +0xe0 / +0xe8: instalment records (section 3).
- +0x7e0: manager for kind 9 (contract) offers; 0x2d180b4 and 0x2d12154 and 0x2d1ac58 tail-call into it for kind 9 (and 8 in 0x2d1ac58).

Dated record (0x10 bytes): +0 person ref (identity block, or an unresolved stub, see below), +8 u32 FmDate (low 9 bits day of
year, high 16 bits year, as 0x2e195a8..0x2e195d4), +0xC u32 offer id.

Offer, FULL_TRANSFER_OFFER (vptr RVA 0x55C7FD8, constructor 0x1831a2c stores it at 0x1831aa8; object about 0xd0 bytes):
- +0x00 vptr, +0x08 u32 refcount (atomic; ldadd at 0x2d181e8)
- +0x30 u64 flags/extra (passed as x2 to 0x1869938; bit 0x22 tested at 0x2d183dc)
- +0x38 person ref (identity block pointer, or stub with `[+0xC] == -1` and index at `[+8]`, resolved lazily through the person
  table [0x56d2d80]: vector at +0x68, or the vector pointer at +0x88; see 0x2d91354..0x2d913d0, 0x2e19640..0x2e19700)
- +0x40 team the player joins (to-team); +0x50 team he leaves (from-team), valid when byte +0x8E is 1 or the pointer is non-null
- +0x58 s32 amount (virtual slot 0x90 returns it, 0x181e0ec); +0x5C u32 offer id
- +0x85 byte (1 = no from-team lookup), +0x86 byte, +0x8D byte status: **0x13 = agreed for a later day**, 0x10 = cancelled
  (set at 0x2d182c8 via 0x186ee30(offer, 0x10, reason)); +0x8E byte "from-team resolved"
- +0x90 / +0x98: vector of 0x18-byte components (slots 0x110/0x118 count and get)
- +0xA8 pointer to the extra-data object (virtual slot 0x240, 0x1833290), see section 3

Kind of an offer = virtual slot 0x78 (vptr + 0x78): FULL_TRANSFER_OFFER 2 (0x1834944), LOAN_OFFER 3 (vptr 0x55C83F0), TRIAL_OFFER 4
(0x55C9058), ENQUIRY_OFFER 7 (0x55C7BC0), B_CLUB_MOVE_OFFER 10 (0x55C7278), kind 9 = contract offer (other manager). Other creators of a
FULL_TRANSFER_OFFER (vptr stores): 0x2d8b540, 0x2d950a4, 0x2de7040.

### 1.4 Telling FM Lens' free-agent signing from a club-to-club deal

All three signals are readable without a call:
1. Class: vptr RVA 0x55C7FD8 (full transfer) vs 0x55C83F0 (loan). Both free-agent signings and club-to-club deals are FULL_TRANSFER_OFFER,
   so the class alone does not split them.
2. From-team: club-to-club has a from-team. Read `[offer+0x50]`; if it is 0 and byte `[offer+0x8E]` is 0 the game has not resolved it yet,
   and its fallback (0x1869938, default tail-call to `person.vt[0x3e8]()` at 0x1869afc) is the player's current team. So use
   `[P+0x128]` (player team) as the from-team. Free-agent signing: no team and no contract on P.
3. Contract state of the player: club-to-club and loans have P+0x128 and the contract set until the day; a free agent has neither.
Recommended rule: `free_agent = from-team empty (after the fallback)`, `club_to_club = from-team non-null and vptr == 0x55C7FD8`,
`loan = vptr == 0x55C83F0`.

## 2. Cancel

### 2.1 The client action and handler

- Client UI handler class `PLAYER_CANCEL_FUTURE_TRANSFER_ACTION_UI_HANDLER` vtable 0x54D5F88; **server handler**
  `..._SERVER` vtable 0x54DA068 (RTTI name 0x52ede7f). Its slot 7 is 0x346d1c.
- 0x346d1c(this, w1 = action id, x2 = action arguments map): `if (w1 == 0x2c && byte[0x56d499f]) 0x238bce0(x2)` (0x346d34..0x346d4c).
  The byte at 0x56d499f (0x56d4920+0x7f) is the editor/IGE-active flag, so the action exists only in editor mode.
  The sibling handlers PERSON_TERMINATE_CONTRACT (0x238e8f4/0x238e6ec/0x238e43c in slots at 0x346d90/0x346dd4/0x346e18) are gated alike.

### 2.2 The function: 0x238bce0

`void 0x238bce0(args)`: x0 points to the action's argument map (begin/end of 16-byte entries `{u32 key, Value* value}`); it looks up the key
'Pers' (0x50657273, 0x238bd0c..0x238bd38), resolves the player (0x4403cd4, 0x11b8ea0, 0x111344c; slot 0x40 must return 1; slot 0x6d8
gives the object), and:
1. TM = [0x56a49f8] (x20, 0x238bdb0); identity = P + [vptr-0x18] (0x238bdec..0x238bdf4).
2. `0x2d55f1c(TM, identity, &vec, 0x13, 0)` (0x238be04): fills vec (three qwords zeroed at 0x238bdb4) with the player's offers in status 0x13.
3. For each offer (reference taken with ldadd at 0x238be44, the pointer kept at [sp+0x18]):
   - team and kind: `[offer+0x40] != 0` gives team = it, kind 2 (0x238be48..0x238be54). Else team = `[offer+0x50]`, resolving it first
     with `0x1869938([offer+0x30], 0, ...)` when byte +0x8E is 0 and byte +0x85 is not 1 (0x238bfa4..0x238bfc8), kind 0 (0x238be70). With
     no team the offer is skipped (0x238beac).
   - `0x2D180B4(TM, &slot, team, kind, 0, 0, 0, 1, stack {0, 0})` (0x238be74..0x238be90: x2 team, w3 kind, x4 0, w5 0, w6 0, w7 1,
     `stp xzr, xzr, [sp]`).
   - `0x1827808(TM+0x18, offer, identity)` (0x238be94..0x238bea8).
   - releases its reference (0x238beb4..0x238becc), then logs "cancel_future_transfer" (0x4388ef8, 0x2393e60 at 0x238bee0..0x238bf00).
4. After the loop, if editor flags allow (0x238bf20..0x238bf7c), sets byte 0x56d49a0 = 1 and calls 0x254d4ac (editor change flag/refresh). FM Lens does
   not need this.

So the game runs, per offer, the same two calls FM Lens' `cancel_signing` runs, with the same arguments (team = to-team with kind 2, else
from-team with kind 0, flag 1, two zero stack words). **Same pair.** Only the reader side differs (section 5).

### 2.3 Signatures (final)

- `TRANSFER_MANAGER::cancel_offer`, RVA 0x2D180B4: `(x0 TM, x1 &slot holding offer ref (reference held by caller), x2 team, w3 kind (2 joining, 0 leaving; the callee
  compares it with 0x16, 0x24 and 0x45 for other reasons), x4 0, w5 0, w6 0, w7 1, stack[0] 0, stack[1] 0)`. Return not used by the editor.
  Kind-9 offers (virtual slot 0x78 == 9) are forwarded to `[TM+0x7e0]` (0x2d18110..0x2d1814c, tail call 0x2c3b114).
- `drop_dated_transfer`, RVA 0x1827808: `(x0 TM+0x18, x1 offer*, x2 identity block)`; void. Removes the **first** dated record whose
  person UID (`[ref+0xC]`, stubs resolved through the person table) equals `[identity+0xC]` (compare at 0x18279b4..0x18279bc, erase at 0x1827a8c..0x1827aec),
  and for kind-9 offers the one whose id equals `[offer+0x5c]` (0x1827878..0x1827888). It does not match the offer id for other kinds.
  Consequence: with two pending offers for one player the record removed may not be the cancelled offer's. FM Lens should
  cancel every pending offer of the player, or re-read TM+0x50 afterwards and check that no record of his remains.
- `0x2D55f1c(TM, identity, &vec{begin,end,cap}, w3 status 0x13, w4 0)`: lists a player's offers by status; vec holds one reference per entry. Not needed by FM Lens (it reads memory), useful as a cross-check.

### 2.4 What cancel_offer does (0x2d180b4; money and notices)

- Status pending (0x13) path (0x2d1818c..0x2d182b8): if the to-team is a club team (`[+0x2f]==0`) the callee calls
  `[club+0x150]->vt[0xe8](finance, club, -[offer+0x58])` (0x2d18498..0x2d184b0), and for the from-team
  `[club+0x150]->vt[0xe0](finance, club, -[offer+0x58])` (0x2d1846c..0x2d18490). That reverses an amount the offer had committed on each
  club's finance object; nothing has been paid yet, because payment and instalments start on completion (section 3). Medium-low: the
  matching "commit" call at registration was not located (0x2d92af0 and 0x2db89cc are called from 0x2d91328 and touch club+0x150).
- Sets status 0x10 (`0x186ee30(offer, 0x10, 7)`, reason 0 when kind == 0x45) at 0x2d182c8.
- Records the withdrawn offer for 9 days: today + 9 days (0x2d182e8..0x2d18364), `0x2d25f1c(TM, &offerRef, &date)` (0x2d18380).
- News and notices: `0x2d7bc18(TM, offer, 0)` (0x2d183b4); unless kind 7 (0x2d183c8) it raises response news for the human side
  (0x2d18618..0x2d19060, news to the club of `team`, so x2/w3 decide who is told).
- No refund of a fee, wage or instalment exists in this path, because none had been paid. Free-agent and club-to-club alike.
  Not examined: sell-on and buy-back terms inside the offer (they are not attached to clubs until completion).

## 3. Instalments (read-only)

Records live at TM+0xd8 (begin), +0xe0 (end), +0xe8 (capacity): a vector of pointers to 0x28-byte records. Created at three places:
completion in the transfer executor (0x2da8e5c: allocation 0x28 at 0x2da9d2c, constructor 0x3a45a48, push at 0x2da9d4c..0x2da9d6c), the new-game
STARTING_MONTHLY_INSTALLMENT initialiser (lambda 0x2e48d70, std::function vtable 0x55F9CD0: alloc 0x28 at 0x2e48da0, push at 0x2e48f14), and
0x2394838 (editor). Consumer: the daily transfer step, scope "TRANSFERRING_MONTHLY_INSTALLMENTS" (name object 0x56bcb68, used at 0x2e1b15c),
loop 0x2e1b19c..0x2e1b4f8; it runs only when the day-of-month word equals 1 (0x2e1b130..0x2e1b134).

Record layout (constructor 0x3a45a48, initialiser 0x2e48d70, consumer 0x2e1b19c agree):
- +0x00 payer club object (the buying club: `[[offer+0x40]+0x30]`, 0x3a45ad0..0x3a45aec)
- +0x08 receiving club object (the selling club: `[[offer+0x50]+0x30]`, 0x3a45aa0..0x3a45acc)
- +0x10 u32 FmDate creation day (0x3a45bd0..0x3a45bdc; the initialiser copies a date from the player there)
- +0x14 u32 FmDate first payment day (completion day plus months offset, 0x3a45af8; default 0x076C0001 = 1 Jan 1900, meaning due now); payments start when today >= this (0x2e1b244..0x2e1b270)
- +0x18 s32 amount per instalment (total / count, 0x3a45a7c..0x3a45a9c)
- +0x1C s32 person table index (= `[identity+8]`, 0x3a45bc8..0x3a45bcc; -1 when unknown); the consumer looks the player up in [0x56d2d80] +0x88 (0x2e1b1d8..0x2e1b21c, 0x2e1b364..0x2e1b378)
- +0x20 s8 period in months: 1, 6 or 12 (initialiser allows only bits of mask 0x1042, 0x2e48f00..0x2e48f0c; strings af_6m_instalments, af_12m_instalments)
- +0x21 s8 instalments remaining; decremented on each run (0x2e1b47c..0x2e1b488), record erased at 0 or less (0x2e1b4a4..0x2e1b4f8)
Payment: when period == 1 or remaining % period == 1, pays `[+0x18] * [+0x20]` with `0x2d11fa8(TM, amount, payer, receiver, player, 2, 0, last = (remaining == 1), ...)` (0x2e1b3b4..0x2e1b3bc); otherwise
`0x2d10d88(TM, player, payer's first team, receiver's first team, amount, 2, 0, 1)` (0x2e1b45c..0x2e1b478). A record whose club has no finance object (`[club+0xd8] == 0`) is dropped (0x2e1b1b4).

Source terms in the offer: the extra-data object at `[offer+0xA8]` (virtual slot 0x240) holds six vectors of 24-byte headers at +0x00, +0x18, +0x30, +0x48,
+0x60, +0x78 (accessors vt 0x190/0x170/0x178/0x180/0x188/0x198; counts vt 0x1a0..0x1c8). +0x00 is the instalment list, 8-byte entries
`{s32 total amount, s8 count at +4, s8 period at +5}` (read at 0x2da9ce0..0x2da9d04, constructor reads 0x3a45a68..0x3a45a8c). The other four vectors (+0x18..+0x60) were not mapped (add-ons, sell-on, bonuses by elimination).
Because records are made on completion, an agreed future transfer has none yet; to list them for an agreed deal read the offer's +0x00 vector instead.

## 4. Buy-back clauses and extra payments (read-only)

PLAYER_BUY_BACK_INFO (vptr RVA 0x55C3850) is built at completion in 0x2d1ac58 (loop 0x2d1c888..0x2d1cadc; vptr store 0x2d1ca50) from the offer's
buy-back vector (extra-data +0x78, vt 0x198, 16-byte entries: s32 value +0, u32 start date +6, u32 end date +0xA; entries with value < 1 are skipped, 0x2d1c8c4..0x2d1c8cc).
Record (0x28 bytes, pool 0x56b35c0): +0x00 vptr, +0x08 u32 FmDate start, +0x0C u32 FmDate end, +0x10 and +0x14 s32 ids copied from the player ref (+0xC, +0x10, used 0x2d1ca6c..0x2d1ca88),
+0x18 s32 value, +0x20 pointer to the SELLING club (the holder of the right, `[from-team+0x30]`, 0x2d1ca2c..0x2d1ca68). It is appended to the BUYING club's list:
`[[to-team+0x30]+0xb0]`, a pointer vector (begin +0, end +8, capacity +0x10; push 0x2d1ca90..0x2d1caac, slow path 0x17e441c). The same list takes other
TRANSFER_INFO-family items (the notes record RELEASED_PLAYER_WAGES there). Fields ac_buyback_start, ac_buyback_end and ac_buyback_value are the editor's names for +0x08, +0x0C, +0x18.
To show a player's buy-back: walk each club's [club+0xb0] list, keep items with vptr 0x55C3850 whose +0x10/+0x14 id matches the player. Medium confidence on the id pair.

EXTRA_TRANSFER_PAYMENT_INFO (vptr 0x55C5FF0) is only constructed in the TRANSFER_INFO factory 0x17fb938 (0x17fe2dc), selected by an item type id; no creation from a
deal was found, so its owner list and meaning are unconfirmed. Not recommended to show.

TRANSFER_INFO (db class N2db13TRANSFER_INFO, many subclasses, factory 0x17fb938 = `make by type id`) is the base of these list items; it is not a per-transfer record.

## 5. What FM Lens needs for club-to-club (no new RVAs)

`cancel_offer`, `drop_dated_transfer`, `ref_copy`, `ref_drop` stay as in the build profile. Reader changes in `game_calls.rs` and `[future_transfer]`:
1. Listing: walk TM+0x50..+0x58, for each record read the offer id at +0xC, find the offer at TM+0x20[id], keep status 0x13. Offer class by vptr (section 1.3/1.4); offer fields from the section 1.3 list (already in `[future_transfer]` except `+0x58` fee, `+0x38` stub rule and vptr).
2. Person match: `[offer+0x38]` may be a stub. Accept `ptr == identity` OR (`[ptr+0xC] == 0xFFFFFFFF` and `[ptr+8] == [identity+8]`). The existing equality test in `cancel_signing` and `names_him` would otherwise fail for deals whose reference the game has not resolved yet (it resolves them lazily at 0x2d91354..0x2d913d0, 0x2e19640..0x2e196b8 and in the cancel path).
3. Team choice for the cancel call, as the editor: `to = [offer+0x40]`; if non-null use (to, 2). Else `from = [offer+0x50]` (fallback `[P+0x128]` if 0 and `[offer+0x8E]` is 0); use (from, 0); if both are 0, do not call.
4. Cancel every pending offer of the player in one go (as 0x238bce0 does) or re-read after each call; do not assume the dated record dropped is the cancelled offer's (section 2.3).
5. Free agent vs club-to-club: section 1.4. Cancelling a club-to-club deal reverses the committed amount on both clubs (section 2.4); it does not undo anything paid, because nothing is paid before the day.

## 6. What must be checked in the running game (not done; static only)

1. A real club-to-club agreed transfer: confirm it appears in TM+0x50 and TM+0x20 (status 0x13), the vptr is 0x55C7FD8, `[offer+0x40]` and `[offer+0x50]` are set (or `+0x8E` is 0 until resolved), and `[offer+0x38]` is a stub or an identity block.
2. Cancel it with the existing pair and read back: record gone from TM+0x50, offer status 0x10, player still at his club with his contract, no news crash. Check both clubs' budgets before and after (the finance reversal of section 2.4 is the only money effect expected).
3. Whether the cancel hits a stale dated record when the player has two dated records (section 2.3).
4. Whether the daily check "CHECKING_FUTURE_TRANSFERS_FOR_CANCELLATIONS" (scope 0x56bcd18, 0x2e19520..) discards or keeps a dated record whose offer is no longer 0x13 (the loop at 0x2e19608..0x2e19738 skips it; erasing at 0x2e19a10 onward was not read).
5. Instalment record layout: done on Windows and matched with FM (section 8).
6. Buy-back ids at +0x10/+0x14: the player UID on Windows (section 8). Which club list holds it is not checked live.
7. That a flag at 0x56d499f (editor active) is not needed by `0x2d180b4` itself: the function has no such gate (the gate is only in the UI handler 0x346d1c), but a live call is the proof.

## 7. Unresolved

- Which creator (0x2c2b1e4, 0x2dbaeac, 0x2dd4ccc, 0x2dde364, 0x3828bd0) registers which deal type (AI-to-AI, B-club moves, pre-contracts); they all use the same two stores, so listing and cancel are unaffected.
- The four extra-data vectors at +0x18..+0x60 of the offer (sell-on, add-on terms).
- Where the amount committed by `[offer+0x58]` is added at registration.
- Return values of 0x2d180b4 and 0x1827808 (the editor ignores both).

## 8. Windows live results (13 November 2026)

Steam build 26577676 (27.0.1), Windows Server 2022, career copy at 30 June 2027 (Arsenal). Read-only probe
(`instances`, `dump`) and FM's own screens. Money: FM shows dollars at about 1.347 per stored pound.

Instalments: the transfer manager (vtables `game_plugin.dll+0x4d90898`, `+0x4d908a8`, `+0x4d908d8`) holds the vector at
TM+0xD0 on Windows (macOS static: +0xD8): 1,158 pointers to 0x28-byte records with the layout of section 3. Periods:
12 months 1,098, 6 months 58, 1 month 2. 26 records involve Arsenal. Two were compared with FM's Clauses page
(Recruitment, Transfers, Clauses):

| FM shows | Record |
| --- | --- |
| Ramsdale: $6.06M every 12 months to Arsenal, next August 2027, one more | payer Southampton (UID 713), receiver Arsenal, created 2024, 375,000 x 12 = 4.5M, remaining 3 |
| Bruno Guimaraes: $24.25M every 12 months to Newcastle, next July 2027, three more | payer Arsenal, receiver Newcastle (UID 688), created 2026, 1,500,000 x 12 = 18M, remaining 25 |

Both match: +0x00 is the payer and +0x08 the receiver; +0x18 is the monthly amount, and a payment of period x amount
falls when the remaining count modulo the period is 1, so "remaining" counts months, not payments. The static holder of
the transfer manager on Windows is not established (the probe found the object by its vtable).

Buy-backs: 71 `db::PLAYER_BUY_BACK_INFO` records (vtable `game_plugin.dll+0x4ec8ad8`, 0x28 bytes): +0x08 start date,
+0x0C end date (0x076C0001 none), +0x10 and +0x14 the player UID twice, +0x18 s32 fee, +0x20 the club that holds the
right (the seller). Examples agree with real clauses: Aaron Ramsey (Burnley) 25M held by Aston Villa; James McAtee
(Forest) 60M held by Man City; Jarell Quansah (Leverkusen) 51,541,912 held by Liverpool with dated windows in 2028 and
2029. The dates are FM dates (day of year and year): a player can have one record per window, each with its own fee, such as
Quansah's 1 to 15 June of 2027 (60,132,232), 2028 and 2029 (51,541,912 each); many windows run 1 June to 15 July.

Compared with FM on a Brighton career at 13 July 2026: Jamie Rushworth (at Coventry City) has a record of 35,000,000
held by Brighton with no window, and FM's contract page shows that Brighton can buy him back for $47M. FM shows a
buy-back only to the clubs in it: Arsenal has none, a scouted McAtee's contract page shows none, and FM's Clauses page
lists only the user's club's clauses. No dated window was on an FM screen, so the dates are not compared.
