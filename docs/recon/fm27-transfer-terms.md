# FM27 transfer terms: keys, call, and recorded clauses (static)

Status: static only (macOS arm64 slice, Steam 26340721). Nothing was run against the game. All addresses are RVA = file offset for text. Conventions as in `fm27-call-shapes.md`: TM = [game_plugin+0x56a49f8], P = player, P+0x278 = person block, P+0x388 = identity block (UID +0xc, second id +0x10), P+0x2F0 main contract, P+0x2F8 loan slot. No pointer auth, so plain AAPCS64 calls. Run on the main queue via the bridge.

## 1. The call

`bool 0x2DFEDAC(TM, P+0x278, destTeam, &map, &outVec, w5=0)`

- x1 is the person block (loan slot read at [x1+0x80]), x2 is the destination team (kind byte at +0x2f read at 0x2dfee..). `outVec` is three zeroed qwords. w5 != 0 routes to 0x2d91b20 (not for us).
- Returns 1 unconditionally on the player path (0x2e00154). Returns 0 only on a staff-path failure (0x2e001d0). So success must be checked by reading [P+0x128] (team) or the contract team afterwards.
- Contracted players use the same path. Source club is derived from the player's current club by 0x1869938. If the player is on loan, the preamble first ends the loan: `0x2d4b9dc(TM, P, loanContract, 0,0,1,0,0, stack 0,0)` at 0x2dfee3c. The editor only adds TrFe/TrDt/clauses when [P+0x128] != 0 (0x25cf4c-0x25cf58); the free-agent branch (0x25d7a0) sends only Pcjo/Ttea.
- Chain from the editor: handler 0x25cd08 (gate byte [0x56d4920+0x7f]==1) -> 0x25d9e4 -> 0x25e8c0 -> 0x238c1ec (0x238d7d8 if same club) -> 0x238c860 -> 0x2dfedac.

Inside 0x2dfedac:
1. Offer alloc + init 0x1831a2c.
2. `0x1831b5c` (thunk to 0x1869b10) at 0x2dff048: (offer, person, destTeam, fee, sourceTeam=0, &date 0x52efdf0, 1).
3. FULL_CONTRACT via factory vt[0x38] (0x2dffdf0-0x2dffe50), job from Pcjo. CONTRACT_OFFER 0x2dbbb48 (0x2dfff94), registered 0x26004ac.
4. Offer registered by 0x2d12154 (0x2dffd18).
5. Date today/earlier: `0x2d1ac58(TM, &offerRef, 0)` at 0x2e0008c executes immediately. Later date: 0x2d91328 at 0x2dffff8 (pending).

The editor supplies no wage or contract end. The factory picks the contract, so FM Lens overwrites wage and end afterwards (as for free agents).

## 2. Terms map

Map = vector of 16-byte entries {u32 key @0, ptr @8 to Value}. Missing key reads the default Value at game_plugin+0x56d63c0. Builders: int 0x4403EC0(Value*, i32); bool/byte 0x4403E8C(Value*, u8); enum/u32 0x4403EF4(Value*, u32); date 0x42F038C then 0x42F05B8. Insert 0x43F72E4(map, key, &Value). Drop value 0x4403BB0. Map ctor 0x43F6B78, dtor 0x43F6C38. Reader vslots on Value: 0x48 int, 0x38 bool, 0x58 u8.

| Key | FourCC | Value | Effect | Read at |
|---|---|---|---|---|
| TrFe | 0x54724665 | int32 | fee, arg 3 of 0x1869b10 | 0x2dfefc0-0x2dff020 |
| TrDt | 0x54724474 | date | transfer date; default today ([0x56b1db8]); later means pending | 0x2dff068-0x2dff150, cmp 0x2dfffc8 |
| ArFR | 0x41724652 | bool | 0x187070c(offer,v) sets shared+0xc6; nation checks apply. Purpose unconfirmed | 0x2dff150-0x2dff208 |
| BuBP | 0x42754250 | int | buy-back price. Appends 16-byte record {i32 price @0, u8 0xff @4, u32 start @6, u32 end @0xa} to vector at shared+0x78; start/end both 0x076c0001 (unset) | 0x2dff20c-0x2dff35c |
| StWC | 0x53745743 | int percent | wage contribution: pct stored at shared+0xc0 (vslot 0x298), gated by offer flag bits. Not a sell-on | 0x2dff36c-0x2dff500 |
| PpNs | 0x50704e73 | int, clamp 0..50 | sell-on % of profit, shared+0xc5 (vslot 0x290) | 0x2dff50c-0x2dff648 |
| PoNs | 0x506f4e73 | int, clamp 0..50 | sell-on % of fee, shared+0xc4 (vslot 0x288) | 0x2dff64c-0x2dff7a4 |
| Ttea | 0x54746561 | team ref | overrides destination; not needed when x2 passed | 0x2dff948-0x2dff9f0 |
| Pcjo | 0x50636a6f | u8 | contract job code (1 = player; 2+ goes to the staff path 0x2d49334). NOT a bool as the older note says | 0x2dffa0c-0x2dffab4 |

Mode byte at game_plugin+0x56d4950: values 1-3 make PoNs ignored if nonzero, force buy-back dates unset, skip some clause adds. Probably 0 on the desktop game, unverified.

Editor form side (handler 0x25d64c-0x25d79c, x19 object): fee +0xb8, BuBP +0xbc, date +0xb0, ArFR +0xd4, StWC +0xcd, PpNs +0xce, PoNs +0xcf, Pcjo +0xcc, present flags +0xdd..+0xe0.

Not in the map: instalments, buy-back expiry/start dates, wage, contract end, loan options. None of these is read by 0x2dfedac. Loan terms go through the separate loan path, not this call.

## 3. Instalments

No key. Clauses live in OFFER_SHARED_DATA (offer+0xa8, 200 bytes, no vptr, created lazily by offer vslot 0x248 = 0x1831ea0; getter vslot 0x240 = 0x1833290). Instalment vector at shared+0x0, 8-byte records {i32 amount @0, i8 @4, u8 type @5}, type 6 = 6-month, 12 = 12-month (analytics 'af_6m_instalments', 'af_12m_instalments', vslot 0x190, loop 0x2d35e78). Adders: vslot 0x1f0 (0x1837f28) instalments; 0x1d0 (+0x18), 0x1e0 (+0x48), 0x1e8 (+0x60) other fee clauses; buy-back vslot 0x1f8 (0x1837f94) and helper 0x18708e8(offer, price, start, end), which can set dates.

The offer is built and executed inside 0x2dfedac, so the bridge cannot add these. Only route: pending (future-dated) offer, apply setters, then execute. Unproven, not simple. Recommendation: defer instalments.

## 4. What the game records (executor 0x2d1ac58, creation around 0x2d1c6d0-0x2d1cd30)

Both are pushed onto the vector {begin, end @+8, cap @+0x10} at [buyerClub+0xb0] (buyerClub = [offer+0x40 team +0x30]).

Buy-back PLAYER_BUY_BACK_INFO (vtable 0x55c3850, pool 0x56b35c0, 0x28 bytes), created 0x2d1ca4c, pushed 0x2d1ca8c-0x2d1cad8, only if price >= 1 (0x2d1c710, 0x2d1c8c4):
- +0x08 start date, +0x0c end date, +0x10/+0x14 player id pair ([identity+0xc], [+0x10], first if zero), +0x18 i32 price, +0x20 seller club ptr ([sourceTeam+0x30]).

Sell-on NEXT_SALE_PERCENTAGE_INFO (vtable 0x55c3a90, pool 0x56b3168, 0x28 bytes), created if vslot 0x288 > 0 or 0x290 >= 1 (0x2d1c72c-0x2d1c758), built 0x2d1cc2c, pushed 0x2d1cc6c:
- +0x08/+0x0c player id pair, +0x10 seller club ptr, +0x18 i32 baseline (fee when profit-% form used, else 0), +0x1c 0, +0x20 u8 0xff, +0x22 u8 percent (PpNs if >= 1 else PoNs). Profit variant takes precedence.

Standalone sell-on adder (no transfer needed): `0x2DBE500(identity=P+0x388, owingClub, beneficiaryClub, w3=percent, w4=baseline)`. Pushes the same info onto [owingClub+0xb0]. Only caller 0x2a635c8 (in 0x2a634c0, starting-data loader). Sibling `0x2DBE6fc(identity, club, club, w3=i16, w4=i32)` builds a different clause record (vtable 0x55c3b50, +0x10 club, +0x18 i32, +0x1c i16, +0x20 u8 4) on the same list; meaning not identified (a different clause type, not buy-back or sell-on).

No standalone buy-back creator exists; only 0x2d1ca4c and save load. Pending offers create the infos only at execution.

Undo (read back and revert): read the two vectors at [club+0xb0], match by id pair. Reverting means removing the pointer from the vector and freeing via the object's vslot 0x8 (destructor). No game-side undo function found. A completed transfer has no undo function found.

## 5. Can the game call replace FM Lens' memory-write move?

For a club-to-club move with a fee: statics say 0x2dfedac with TrFe is the editor's own path, so it produces history, contract, news and clauses, which the Patch-based move in `crates/fmlibre-core/src/transfer.rs` and `move_player` does not. Not proven: fee debit/credit (0xeb5410 is only a transfer-value history accumulator, 0.75 x fee, kind 5; the balance posting was not located), window/budget/work-permit refusals in 0x2d1ac58, behaviour for human-managed clubs. Recommend: add as an opt-in path, keep the memory-write move as fallback, and keep the FeePlan payment only if the live check shows the game does not post the fee.

## 6. Confidence

- Key list, types, call shape, return semantics, record layouts: high.
- Contracted-player coverage: medium-high.
- Instalments absent from the map: high. Pending-offer route: low.
- Fee money posting, ArFR meaning, mode byte, unset buy-back end meaning, instalment i8 meaning: unknown.

## 7. Live checks (read-only first)

1. Read byte at game_plugin+0x56d4950 (expect 0).
2. Read [club+0xb0] vectors for a few clubs; confirm element vtables 0x55c3850 / 0x55c3a90 and layouts.
3. One throwaway transfer with TrFe, PoNs, PpNs, BuBP: watch balances of both clubs and transfer budgets, history row, new [club+0xb0] records, [P+0x128] after the call.
4. Contracted player: work permit, window closed, human club, player on loan.
5. Buy-back unset end date: does it expire or never?
6. Pending offer plus 0x1837f28 / 0x18708e8 setters, then execute, for instalments and dated buy-back.
