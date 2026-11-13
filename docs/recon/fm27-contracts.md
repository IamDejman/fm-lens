# FM27 contracts: clauses, fields, loans, payroll, staff

Build 26340721, macOS arm64. Read-only research on the "FM Lens Nation" career (11 Dec 2027, Arsenal, club UID 602).
Scratch work: `reports/batch/scratch/contracts/`.

Confidence key: High = seen in code and in live data. Medium = data statistics only. Low = guess.

## Corrections to earlier notes

- The claim in `fm27-club-extras.md` that a player has an embedded second contract at contract+0xC8 is wrong. Rice's "England contract" was heap adjacency. A loaned player's second contract is a separate `db::LOAN_CONTRACT` object (item 3).
- `finance.wage_budget` (club finance +0x814) is not a budget. It is recomputed by the game as the weekly wage bill (item 4).
- Squad status codes are not just 1 to 5. Observed: 1, 2, 3, 4, 7, 10, 11, 13, 15, 20.

## Common objects

- Contract class `db::FULL_CONTRACT`, vtable RVA 0x55abd68, size 0xC8. Player and staff contracts use the same class.
- Player contract pointer: player+0x2F0. Loan contract slot pointer: player+0x2F8 (null for players not on loan).
- Dates: u16 day-of-year (low 9 bits, 1-based) plus u16 year. Year 1900 day 1 (u32 124518401) means unset.
- Clause entry (8 bytes): u32 amount (0xFFFFFFFF none), u16 condition (0xFFFF none), u16 kind. List at contract+0x68 (begin, end, cap).

## 1. Clause kinds

Status: found (names and layout), partial (a few kinds, the u16 condition on release clauses).

Where: contract+0x68 list. Kind names come from the game's mask-to-name function near RVA 0x1f1f12c (bit index = kind + 8 for most kinds). Amount and condition shapes come from statistics over 28,634 contracts that have a list (`scratch/contracts/stats.py`). No contract has spare capacity in its list (0 of 28,634), so adding a clause needs the list to be reallocated by FM.

| Kind | Name | Amount | Condition | Example |
|---|---|---|---|---|
| 0 | Min fee release | money | u16 sometimes | |
| 1 | Relegation release | money | | |
| 2 | Non-promotion release | money | | |
| 3 | Yearly wage increase | none | percent 5, 10, 20 | Haaland 5 |
| 4 | Promotion wage increase | none | percent 25, 50, 100 | |
| 5 | Relegation wage decrease | none | percent | |
| 6 | Non-playing job offer release | | | |
| 7 | Release at any time | | | |
| 8 | Sell-on fee percent | none | percent 5, 10, 15 | Nico Paz 10, Kvaratskhelia 5 |
| 9 | Sell-on percent of profit | none | percent | |
| 10 | Goal bonus after landmark | money | goal count | |
| 11 | One year extension after league games | none | games | 5 to 25 |
| 12 | Match highest earner | none | | |
| 13 | Pay rise after league games landmark | small money (median ~2,091) | 15, 20, 25 | |
| 14 | Promotion wage increase (variant) | none | percent | |
| 15 | Relegation wage decrease (top division) | none | percent | Saka 25, Rice 25 |
| 16 | Min fee release, foreign clubs | money | u16 sometimes | Mostovoy 8.59M (Zenit), Al-Harbi 9.83M |
| 17 | Min fee release, higher division clubs | money | u16 sometimes | Krejci 36.2M (Wolves) |
| 18 | Min fee release, domestic clubs | money | u16 sometimes | |
| 19 | Pay rise after international caps | money | caps (5) | |
| 20 | Percent of wages paid by sponsor | none | 100 | Al Hilal players |
| 21 | Percent of gate receipts to player | none | percent | |
| 22 | Automatic extension by club | none | years 1 to 3 | |
| 23 | Waive compensation if offered manager job | flag | | |
| 24 | Percent compensation required to leave | none | percent | |
| 25 | One year extension if promoted | | | |
| 26 | One year extension if avoid relegation | | | |
| 27 | Min fee release, main continental competition | money | u16 sometimes | |
| 28 | MLS guaranteed contract | flag | | Messi |
| 29 | Automatic extension if promoted | | | |
| 30 | Injury release | | | |
| 31 | Min fee release, any continental competition | money | u16 sometimes | |
| 32 | Appearance bonus | money | none | Saka 50,000, Haaland 82,000, Rice 68,998 |
| 33 | Goal bonus | money | none | Saka 65,000, Haaland 85,000 |
| 34 | Clean sheet bonus | money | none | |
| 37 | International cap bonus | money | none | |
| 38 | Unused sub bonus | money | none | Saka 15,000, Rice 17,249, Haaland 23,625 |
| 39 | Assist bonus | money | none | Saka 45,000 |
| 40 | Bonus after landmark assists | money | assist count | |
| 41 | Bonus after landmark goals and assists | money | 10 to 50 | Wirtz has two |

Unidentified: 35, 36, 42, 43 (no contracts use them). 54 and 63 are flags (63 appears on Swansea and Cardiff players beside kinds 4 and 5). 55 has an amount of about 25 percent of the release clause (Spanish clubs, for example Blanco, Sivera). 58 has a large condition (1,262 and 1,433) and no amount.

The u16 condition on kinds 0, 16, 17, 18, 27 and 31 (values 700 to 2,400) is not a club id, not a club UID, and has no clear link to dates. Meaning unknown. FM Lens must preserve it on any rewrite.

Competition and award bonuses are not in the +0x68 list. They are in the +0x80 list, 32-byte entries. 687 contracts have them. Rice has one: words `076c0001 ffffffff 00000014 ffffffff 00000000 0000027d 000cfc1f 0000ffff`. +0x14 is the competition's place in the game's table of competitions, not its UID (Rice: 637, the UEFA Champions League, UID 1301394) and +0x18 its amount (850,975); FM Lens shows these two read-only (13 November). The rest is not decoded: +0x00 is an unset date, +0x08 (here 0x14, 20) may say what the bonus is paid for. On Windows FM's contract page shows Rice's as "Winning the UEFA Champions League", $1.1M (850,975 at about 1.35), so the 20 at +0x08 may mean winning it.

Award bonuses are a third list. Contract +0x98 is a pointer to a `(begin, end, capacity)` header whose entries are 16 bytes: a pointer to the `db::AWARD`, then a `u32` amount in pounds. Established on Windows, Steam 26577676, 13 November 2026 (copy save, 30 June 2027):

- Declan Rice (Barcelona): two entries, awards 102407 (World Footballer of the Year) and 102406 (World Golden Ball), 1,171,666 each. FM's contract page shows both at $1.6M, in the same order.
- Kai Havertz (Arsenal): 102407 at 439,614, 102408 (World Player of the Year) at 350,669, 102406 at 439,614. FM shows $600K and $475K for the first two.
- Census with `fmlens-probe clauses`: 303 contracts have the list, 548 entries, and all 548 point at an award in the game's table.

FM Lens shows them read-only after the competition bonuses and drops any entry whose pointer does not lead to a known award. Windows only: `award_bonuses` is not set in the macOS layout, where the +0x98 pointer was seen but not compared with FM.

Values to check in FM:
- Saka contract screen, Bonuses: appearance 50,000, goal 65,000, assist 45,000, unused sub 15,000. Relegation wage decrease 25 percent.
- Haaland: appearance 82,000, goal 85,000, unused sub 23,625, yearly wage rise 5 percent.
- Rice: appearance 68,998, unused sub 17,249, one competition bonus (check which competition and amount against words above).
- Krejci (Wolves): higher division release clause 36.2M. Mostovoy (Zenit): foreign clubs 8.59M.
- Nico Paz: sell-on 10 percent.

Editing: amounts and conditions of existing entries are safe to change in place (existing `clauses.rs` planning does this, limits 2,000,000,000 and 1,000). Add and remove need the list capacity, so use FM's own add function. Add `clause_name` entries for all kinds above to FM Lens (now only 0, 1, 3, 10, 15, 19, 22, 27, 32, 33, 34, 38, 39, 40).

### 1.1 FM's own add-clause routine (static, 13 November 2026)

Read-only disassembly of the macOS `game_plugin` of Steam build 26577676; nothing was run. There is no out-of-line
"add clause" function on ARM64: the game inlines the fast path (end below capacity) at each site, and every grow goes
through one shared slow path.

- ARM64 RVA `0x12a7618` (0x108 bytes): `entry* f(vec* x0, const u8* kind, const u32* amount, const u16* condition)`.
  `x0` is `contract+0x68` (the begin, end, capacity triple), not the contract. It always reallocates (new capacity
  max(2 x capacity, size + 1)), writes u32 amount at +0, u16 condition at +4, u8 kind at +6 and 0 at +7, frees the old
  buffer and returns the new end (the entry is at return - 8). It does not de-duplicate. 16 call sites in 11
  functions, including `GAME_FULL_CONTRACT` virtual methods and `TRANSFER_MANAGER` (0x2e00094).
- Allocator: alloc `0x436e62c`, free `0x436eafc`, both with the global allocator `[0x5740a90]` as the first argument;
  a size-class pool with a mutex per class. A list buffer must never come from or go to plain malloc or free.
- `0x1285ab0` adds a clause of a given kind with an amount the game computes and skips kinds already present;
  `0x100b018` adds one with the game's default amount from a builder object (layout unknown, one caller).
- Signature (ARM64, unique in the slice): `fa 67 bb a9 f8 5f 01 a9 f6 57 02 a9 f4 4f 03 a9 fd 7b 04 a9 fd 03 01 91 f5
  03 02 aa f6 03 01 aa 01 20 40 a9 02 01 01 cb 58 fc 43 93 08 07 00 91 09 fd 7d d3 ?? ?? ?? b5`; second anchor at
  +0x94: `ca 02 40 39 ab 02 40 b9 8c 02 40 79`.
- Intel slice: the slow path is at RVA `0x13a7470` (45 callers) and a wrapper `add(contract, kind, amount, condition)`
  at `0x1389c90` with no direct callers; found by shape only.
- Windows: not looked for.

Not established, so adding clauses stays off: any live call, which thread is safe (the old buffer is freed at once, so
a reader on another thread would see garbage; call only with FM paused or on its own thread), whether the contract
screen or wage totals need a refresh afterwards, a remove routine, and the Windows address. Calling it needs a new game
call per platform with the usual live, undo and save, quit and reload checks.

## 2. Contract fields FM Lens edits

Status: found for all fields below. Squad status label mapping partial.

| Field | Offset | Type | Check |
|---|---|---|---|
| Owner (person block) | +0x08 | ptr | |
| Team / senior team | +0x10 / +0x18 | ptr | parent club for loaned players |
| Wage (weekly) | +0x20 | u32 | getter slot 9. Saka 310,000, Rice 344,990, White 110,000 |
| Job | +0x26 | u16 | 1 for almost all players |
| Loyalty bonus | +0x38 | u32 | getter slot 25. Saka 33,562, Rice 35,750, White 17,908. 17,338 players have 0 |
| Signed | +0x44 | date | Saka 2026-02-17, Rice 2026-07-28, White 2024-03-14 |
| Expires | +0x48 | date | Saka 2032-06-30, Rice 2030-06-30, White 2028-06-30 |
| Joined | +0x4C | date | Saka 2009-07-01, Rice 2023-07-15, White 2021-07-30 |
| Other date | +0x50 | date | unset (1900) for 28,250 players. Set only for loaned-out players (White 2027-07-08) |
| Squad status | +0x54 | u8 | +0x55 and +0x56 also status bytes. Saka 2, White 4 |
| Listing flags | +0x57 | u8 | bit0 transfer, bit1 loan. Histogram: 0 (23,358), 64 (3,094), 128 (1,652), 1 (362), 96 (82), 2 (64), 8 (21), 129 (1). Bits 6, 7 and 3 unknown |
| Happiness | +0x5A | u8 | 20, 40, 60, 80, 100 |
| Playing time happiness | +0x5C | u8 | |
| Squad number | +0x5D | u8 | 255 = none (13,303 players). Saka 7, White 4 |

Slot 30 and 31 check bit 3 of byte +0x2B before returning the expiry, so an alternative expiry path exists. Not traced.

Extra amounts, unknown meaning: +0xA8, +0xAC, +0xB0 (u32), +0xB4 (date), +0xB8, +0xBC (year-like, 1900 or 2027 to 2029), +0xC0..+0xC4. Saka +0xA8 9,363,938. Rice +0xA8 7,293,021, +0xAC 858,175, +0xB0 643,632, +0xB4 2026-07-24. Do not call these signing-on or agent fee until checked in FM. +0xC4 is 255 for 28,476 players.

Values to check in FM:
- Saka: expires 30 Jun 2032, joined 1 Jul 2009, squad number 7, wage 310,000 a week, loyalty bonus (check about 33,562).
- Rice: expires 30 Jun 2030, joined 15 Jul 2023, loyalty bonus about 35,750.
- White (loaned out): listed for transfer, squad number 4, signed 14 Mar 2024.
- Open the squad status dropdown and note what labels exist for codes 7, 10, 11, 13, 15, 20.
- A player with listing flag 64 and one with 128: see what the squad screen shows (probably not for sale, or similar).
- Contract screen: find signing-on fee and agent fee for Rice and compare with +0xA8 to +0xB0.

Editing: wage, dates, number, flags and loyalty bonus are plain stores. A player whose wage changes alters the club wage bill at the next recompute (item 4). Squad status must be limited to codes the game knows. Squad numbers must stay unique per team.

## 3. Loans as data

Status: found for the structure, partial for the term fields.

Where:
- Parent club: the player's main contract keeps `team` (+0x10) as the parent club. The loaned player's current club is player+0x128 (the borrower).
- Loan terms: player+0x2F8 points to a pool slot P, and [P] is a `db::LOAN_CONTRACT` (vtable RVA 0x55b54e8, size 0x100). It shares the base getters: wage +0x20, signed +0x44, expires +0x48, joined +0x4C. Its team fields +0x10 and +0x18 are the borrower. Slot is null for non-loaned players (Rice, Saka).
- Loan end date: LOAN_CONTRACT +0x48. White: 2028-d181 (about 29 or 30 June 2028).
- Wage contribution: LOAN_CONTRACT +0x20 is the wage the borrower pays. White 55,000 against a parent wage of 110,000, so 50 percent.
- Optional future fee: +0xC0 (White 58,000,000, close to his asking price 57,999,999). +0xC4 is 0xFFFFFFFF when unused. Another loan has +0xC0 11,006,819.
- Other words, unknown: White +0xA0 3,248, +0xA8 3,212, +0xB0 4,354, +0xCC and +0xD0 75,000, +0xD4 55,000, +0xE4 4, +0xE8 4,096. These likely hold playing wage, monthly fee, unused wage and clause flags (the transfer offer descriptor has keys for playing monthly fee, unused monthly fee, wage contribution, recall, buy-back start, end and value, and mandatory, optional or conditional future fee), but the mapping is not proven.
- Related classes: `db::STARTING_LOAN`, `STARTING_MONTHLY_INSTALLMENT`, `STARTING_WEEKLY_WAGE_CONTRIBUTION`, `AGREEMENT`, `PLAYER_BUY_BACK_INFO`.
- Daily check: profiler tag `/GAME/CONTRACTS/CHECKING_CONTRACT_AND_LOAN_END_DATES` (function 0x260a884 to 0x2611eb8).

Arsenal loans out (all four verified through player+0x2F8):
- Ben White at West Ham, contract object 0x7aecb8cc00, wage share 55,000, ends June 2028.
- Merino at Real Hispalis (0x7aecb91200).
- Mosquera at Blu-neri Milano (0x7aecb96200).
- Harriman-Annous at Huddersfield Town (0x7aecba7000).
Loans in: none confirmed (not scanned in full).

Values to check in FM:
- White's loan details: borrower West Ham, end date June 2028, borrower pays 50 percent, an option to buy near 58M.
- Merino, Mosquera, Harriman-Annous: open each loan and read wage split, fee and clauses, then match to the fields above.

Editing: changing the end date means editing LOAN_CONTRACT +0x48 only. Ending or creating a loan must go through FM's loan functions (the transfer action code near 0x18bd338) because club squads, registration and finance change too. Raw writes of the wage share are safe but not of the team fields.

### 3.1 Loan terms on Windows, checked against FM (13 November 2026)

Steam build 26577676 (27.0.1), Windows Server 2022, career copy at 30 June 2027 (Arsenal). Read-only: the probe's
`instances db::LOAN_CONTRACT` (vtable `game_plugin.dll+0x4ecdcf8`, 1,365 objects of 0x100 bytes; reached from player
+0x338) and `dump`, compared with FM's contract page, Loan Club tab, for eight Arsenal loans in and out.

| Offset | Holds | Evidence |
| --- | --- | --- |
| `+0xC0` s32 | Future fee, -1 none (981 of 1,365 none) | Linder 778,930 = FM $1M optional; Baum 427,440 = $575K; Holmberg 1,776,000 = $2.4M; Rudd 1,067,446 = $1.4M |
| `+0xC4` s32 | Competition the fee depends on, -1 none | Rudd 6443, where FM shows the fee as due on winning the Barclays WSL; other values in the census 22, 11, 16, 7, 51. Id space not resolved (not the competition UID) |
| `+0xCC` s32 | Monthly playing fee | Nwaneri 171,806 = $230K; Linder 50,960 = $69K; Rudd 4,669 = $6.25K; Baum 7,725 = $10.5K; four loans with $0 hold 0 |
| `+0xD0` s32 | Monthly fee when unused | Baum 15,450 = $21K; equal to `+0xCC` in the other seven (893 of 1,365 equal) |
| `+0xD4` s32 | Copy of the wage share `+0x20` | equal in 1,356 of 1,365 |
| `+0xB0` bit `0x04` | Can be recalled | 6 set, 2 clear, all 8 match FM |
| `+0xB0` bit `0x02` | Can play in cup matches | set in all 8 and in every loan in the census: no negative seen |
| `+0xB0` bit `0x01` | Can play against his own (parent) club | Nwaneri only, FM shows it; not seen elsewhere among the 8 |
| `+0xB1` bit `0x10` | Loan cannot be terminated | 3 set, 5 clear, all match |
| `+0xB1` bit `0x01` | A preferred position is set | 4 set (Baum, Reid, Wellesley-Smith, Teer-Hutchins), 4 clear, all match |
| `+0xB4` bit `0x20` | Cannot play against the parent club in cup matches | Nwaneri set, 7 clear, all match; set in 636 loans |

FM money is shown in dollars at about 1.347 per stored pound. `+0xB8..+0xBC` repeats `+0xB0..+0xB4` without `+0xB1`
bit `0x20`. Flag bytes of the eight: Nwaneri `07 20 11 09 20`, Linder `06 30 11 09 00`, Rudd `02 30 11 09 00`, Baum
`06 31 11 09 00`, Holmberg `06 20 11 09 00`, Reid and Teer-Hutchins `06 21 11 09 00`, Wellesley-Smith `02 21 11 09 00`
(bytes `+0xB0` to `+0xB4`).

Not established: whether a future fee is optional, mandatory or conditional beyond Rudd's competition case (all three
others show "optional" in FM, and no flag difference stands out); the preferred position and role encoding (candidates
`+0xA0..` and `+0xF4..`); `+0xB0` bit `0x08` (73 loans), `+0xB1` bits `0x20` and `0x80`; `+0xD8`, `+0xDC`, `+0xE4`,
`+0xE8`, `+0x54`, `+0x56`, `+0x58`, `+0x60`, `+0x68` (pointer, 159 non-null), `+0x30` (pointer, 45 non-null), `+0x90`,
`+0x9C`. The macOS layout of these fields is not checked. Nothing here is written by FM Lens; showing them read-only
would be the next step, and editing the fee or flags needs a save, quit and reload check first.

## 4. Payroll

Status: partial.

Where: club+0x150 is `db::CLUB_FINANCE` (2,304 bytes). Arsenal's record is at 0x7af5d488b0.
- Function 0xe830e4 clears +0x810 and +0x814, then walks every player on every team of the club. It calls 0xcbfce8 (a person's wage cost to the club) and adds the sum of (wage minus other) to +0x810 and the sum of wage to +0x814. It also touches +0x828, +0x82C, +0x838, +0x83C, +0x844 and +0x848.
- Live Arsenal: +0x814 5,416,587, +0x810 4,530,121, +0x80C 701,552, +0x808 6,503,366, +0x828 344,990 (Rice, top earner), +0x82C 281,250 (the manager's wage), balance +0x0C 190,968,032.
- Natural experiment: Saka's wage went 300,000 to 310,000 and +0x814 moved by exactly +10,000. So +0x814 follows the sum of wages live.
- Exact reconciliation failed. Players (with 4 loanees) sum to 4,775,959. The 91 staff sum to 690,308. Total 5,466,267 against 5,416,587, a gap of 49,680. The loan shares and wage cost function (0xcbfce8) are the likely cause.
- Profiler tags: `/GAME/FINANCES/PROCESSING_WEEKLY_FINANCES` (function 0x268cd74 to 0x26979fc), monthly finances (0x268e3e0), monthly accounts (0x268d7e0), `/GAME/TRANSFERS/TRANSFERRING_WEEKLY_WAGES` (0x2e1b564, function 0x2e142f4 to 0x2e20380), `/GAME/TRANSFERS/TRANSFERRING_MONTHLY_INSTALLMENTS`.
- The exact deduction (balance and expense counter) was not located.

Expected check: before a weekly payday, read balance (+0x0C) and +0x814. After the day processes, balance should fall by about +0x814 plus any other weekly items, and the expense counters will rise. Do not assume the wage lands on a Monday: watch the date.

Values to check in FM:
- Finance screen, Arsenal: weekly wage bill. Compare with 5,416,587 (the wage budget FM Lens now shows is really this value). Also the "highest earner" and "manager wage" figures against +0x828 and +0x82C.
- Annual wage total on the Finances Summary after one advance.

Editing: do not write +0x814 or +0x810. The game overwrites them on recompute. Change wages on contracts instead. FM Lens should relabel the field "wage bill" and offer the real wage budget (+0x808 or the budget field the game uses) after the screen check.

## 5. Staff contracts

Status: found for fields, partial for clauses.

Where: staff use the same `db::FULL_CONTRACT`. Staff array at game_plugin+0x56d2e60, UID at +0x214. The human manager has his contract at element+0x4B0 and his UID at +0x554.
- Arteta (id 6701089, PSG): contract 0x726cc752c0. Wage 21,747 at +0x20, job 0x10 (Manager) at +0x26, signed and joined 2027-08-14, expires 2030-06-30, empty clause list.
- Human manager Ayodeji Eluwande: Manager, 281,250 a week, signed 2026-07-13, expires 2029-06-30.
- Arsenal has 91 staff contract lines (`ars-staff-wages.txt`), summing to 690,308 a week.
- Clauses: Arteta has none. Not checked across all staff.

Values to check in FM:
- Arsenal manager contract screen: wage 281,250 a week, expiry 30 Jun 2029.
- A named coach: wage and expiry match the +0x20 and +0x48 values (use `staff-member` to read).

Editing: wage, expiry and job are plain stores as for players. Job codes are the same table as `+0x26` (0x10 is Manager).

## Open items

- Competition bonus entry encoding (+0x80): what each bonus is paid for. Award bonuses (+0x98) on macOS.
- LOAN_CONTRACT term fields: fees and five flags mapped on Windows (3.1); preferred position, the fee kind and the
  remaining words are open.
- FM's add-clause routine is found statically on macOS (1.1) but never called; Windows not looked for.
- Meaning of contract +0xA8 to +0xBC and the +0xC4 byte.
- Where wages are deducted from balance.
- Staff clause census, loan-ins.
- Kinds 35, 36, 42, 43, 54, 55, 58, 63.
