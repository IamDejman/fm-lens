# FM27 club ownership, income, kits, staff allowances and vision (read-only recon)

Scope: package 3 of [fm27-remaining-editor-plan.md](fm27-remaining-editor-plan.md).
Windows, Steam build 26577676, a copied career on 18 July 2028. Everything was
found read-only (probe `club`, `clubs`, `owners`, `dump`, `refs`, `types`,
`instances`, plus disassembly of the game's plugin). Nothing was written to the
game. Guesses are marked "guess".

Ownership, income and kit colours are read by the app on Windows. Staff
allowances were not found. Club vision records were found but not labelled, so
no reader is built.

## 1. Ownership (read)

Club +0x100 is the info record; the u8 at +0x129 is the ownership type. FM's
pregame editor offers eight types, and the byte takes eight values plus 0.
Census of the career (probe `owners`):

| Code | Clubs | Examples | Label |
|---|---|---|---|
| 0 | 13,393 | most lower-league clubs | not set, nothing shown |
| 1 | 2,110 | Arsenal, Man City, Bayern, Liverpool, Roma | Private company |
| 2 | 475 | A. Madrid, Juventus, Villarreal, Dortmund, Man Utd, Sevilla, Lyon, Ajax | Public company |
| 3 | 4,331 | Barcelona, R. Madrid, Benfica, Porto, Bilbao, Flamengo, Galatasaray, Fenerbahçe | Member-owned, elections |
| 4 | 790 | Pumas, Al-Sadd, Fortuna Düsseldorf, Eibar, Union Berlin, Heidenheim, Hearts, AFC Wimbledon, Exeter | Member-owned, no elections |
| 5 | 205 | Chelsea, both Milan clubs, NWSL clubs, Newcastle, Tottenham, Atalanta | Consortium, private |
| 6 | 69 | Ipswich, Brøndby, Standard, Portuguese SADs, Al-Nassr | Consortium, public |
| 7 | 240 | Dinamo Zagreb, Vitória SC, Al Shabab, Al Taawoun, Arouca, Tondela, Kolding IF | Member-owned public company, elections |
| 8 | 62 | Djurgården, Croatian clubs, Radnički | Member-owned public company, no elections |

Codes 1 to 6 rest on the clubs that hold them. Codes 7 and 8 rest on
elimination against the editor's eight types and on the order of the other
six; no club was checked against an outside source for them. FM's Club Info
page shows "Owner Status" (how the owner feels about the club), not the type,
so there is no label in the running game to compare with.

Not traced: the benefactor (ongoing funding, starting-finance flags), the
setter, and whether FM reads the byte anywhere after a takeover.

## 2. Income by source (read)

The finance record (club +0x150, `db::CLUB_FINANCE`) holds four period blocks
0x118 apart:

| Period | Block | Gate receipts |
|---|---|---|
| This month | 0x278 | 0x314 |
| Last month | 0x390 | 0x42C |
| This season | 0x4A8 | 0x544 |
| Last season | 0x5C0 | 0x65C |

Income starts 0x9C into a block, i32 pounds, one slot per source:

| Slot | Source |
|---|---|
| 0 | Gate receipts |
| 1 | Other |
| 2 | Season tickets |
| 3 | Interest |
| 5 | Merchandising |
| 6 | Players sold |
| 7 | Sponsorship |
| 8 | Match day income |
| 9 | Fundraising |
| 11 | Grants |
| 13 | Prize money |
| 14 | TV revenue |
| 15 | Corporate facilities income |
| 17 | Loan income |

Slots 4, 10, 12 and 16 are free in this career. FM's Income page also lists
investments, affiliate club and solidarity payments, all $0 for Arsenal, so
they are not placed (guess: three of the four free slots).

Every row of FM's Income page for Arsenal matched its slot for This Month and
Last Season. FM shows dollars at 1.3476 to the pound (the balance, £299,904,337,
shows as $404,156,800). The fourteen slots sum to FM's own totals: this season
£493.4M against "$664M", last season £1,192M against "$1.6B".

Spending sits earlier in the same block (+0x10 player salaries, +0x14 staff
salaries, +0x20 loyalty bonuses, +0x7C non-soccer costs matched FM for one
period). The other spending rows are not labelled and nothing reads them.

Not traced: sponsorship and TV agreements, projections, the schedule of
payments. These are totals of what has been booked, not what will be.

## 3. Kit colours (read)

Club +0xB0 points at the club's kit set. The set holds a vector (begin +0x78,
end +0x80) of pointers to 0x28-byte records, one per part of a kit:

| Offset | Size | Meaning |
|---|---|---|
| +0x00 | 5 x u32 | five colours, bytes blue, green, red, alpha; colour 0 is the trim, colour 1 the main colour |
| +0x14 | u32 | style id (not decoded) |
| +0x18, +0x1C | dates | -1 in every record read |
| +0x20 | u16 | year, 0 in every record read |
| +0x22 | u8 | kit: 0 home, 1 away, 2 third |
| +0x23 | u8 | part in the low nibble: 1 shirt, 4 shorts, 5 socks; 2 and 3 unknown; 0x21 on some shirts |
| +0x24 | u8 | order; the lowest of a kit and part is the one in use (guess, it held for every club below) |
| +0x25 | u8 | 1 outfield, 0 goalkeeper |

Read against FM's Club Profile page ("Uniforms"), main colour then trim:

| Club | Home shirt | Away shirt | Third shirt | FM |
|---|---|---|---|---|
| Arsenal | #C00020, #F8F8F8 | #182028, #E8C038 | #A89868, #202830 | red and white, dark with gold, gold |
| Chelsea | #2040C0, #F0D050 | #002020, #E0C020 | #F8F8F8, #202060 | blue, near black with yellow, white with navy |
| Real Madrid | #F8F8F8, #E85888 | not compared | not compared | not compared |
| Barcelona | #183068, #B81850 | not compared | not compared | not compared |

The reader keeps outfield records of the three kits, the shirt, shorts and
socks of each, and gives up on a club where a colour's alpha is not 0xFF.

Not decoded: the style id, colours 2 to 4, parts 2 and 3, goalkeeper kits,
season-dated kits, national teams. The macOS code follows the same chain
(club +0xB0, set +0x78) but the record was not read on a Mac, so the Mac
layout omits it. Kit pictures the app already shows come from the game's
files and from packs, not from these records.

## 4. Staff allowances (not found)

No stored per-club limit by job was located. Leads, as offsets into
`game_plugin.dll` of this build:

- `STAFF_NUMBERS_CHANGED_NEWS_ITEM` is created at +0x28f1812, inside a large
  function (+0x28f1600 to +0x28f2be0) that probably applies a board request.
- `TRANSFER_BLOCKED_DUE_TO_STAFF_LIMITS_NEWS` is created at +0xb4b555; the
  helper at +0xb4c910 may compare a count with a limit.
- `GAME_STAFF_NUMBERS` and `db::STAFF_NUMBERS` have no live per-club objects.
- A rule flag `use_limited_staff_numbers` is set at +0xa2cbf4 and +0xa3100a.
- A pool of 16-byte `CLUB_STAFF_JOB_STATUS_INFO` records sits at +0x5821cb8.

Guess: the limit is derived when asked (from reputation, finances and the
rule flag) and only board-granted changes are stored. Next step is to read
the helper at +0xb4c910.

## 5. Club vision (records found, not labelled)

Two classes hold objectives: `db::CLUB_VISION_OBJECTIVE` (vtable +0x4c125e8,
0x48 bytes) and `db::CLUB_COMPETITION_VISION_OBJECTIVE` (vtable +0x4ece5f8).
A per-club structure owns them:

| Offset | Meaning |
|---|---|
| +0x00 | vector of objective pointers |
| +0x18 | a second, smaller vector |
| +0x30 | the club |
| +0x38 | a date |

It was found only in reverse, through `refs <club>`; an owner object (vtable
+0x4ebf6a8) points at it at +0x78, and no chain forward from the club is
known. Objective fields: +0x08 u16 subject or competition id, +0x0B kind,
+0x20 and +0x24 dates, +0x28 a parameter or target, +0x2C type id, +0x30 a
date, +0x38 flags. Arsenal holds 33 (20 and 13), Chelsea 28, Real Madrid 31,
Man City 25.

Missing before a reader: the forward chain, the names of the type ids
(FM's Club Vision page gives the wording to match), priority and progress.
