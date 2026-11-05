# FM27: nations and national teams (read-only recon)

Build: FM27 Steam 26340721, ARM64 macOS (pid 41018), `game_plugin` UUID
`F4540355-2186-39CB-9119-C706A6A35346`. Read-only probe work on 2026-11-05 with a
disposable career loaded; in-game date 2027-12-08. Nothing was written to the game.
Everything below is for this build and for macOS; the Windows layout of these records
was not looked at (the macOS profile says nations are laid out as on Windows, but the
container and the national teams were not compared).

## Result in one paragraph

Every nation is reachable from a static array of `db::NATIONAL_TEAM_CONTAINER` objects
(251 of them, one per nation). A container holds the nation's FIFA ranking, its
national teams (senior and youth), its rivals, and a pointer to the `db::NATION`
object that players already point at. The nation has its own name, codes, languages,
capital, continent, population, dual nationality rule and years to gain nationality.
A second static array holds the women's containers, linked from each nation.

## Method

1. `types NATION` lists `db::NATION`, `db::NATIONAL_TEAM_CONTAINER`, `db::NATION_TRANSLATABLE`
   and `GAME_NATIONAL_TEAM*` (the last three are UI side, not used here).
   `types TRANSLATABLE` shows the neighbouring name classes.
2. `instances db::NATION` finds 251 objects in 116 s (vtable `game_plugin+0x55b5c40`). The first,
   UID 5, is Algeria. `instances` is far too slow for the app and it only gives objects,
   not an array.
3. `find --as hex` on the first three object addresses, in a row, hits one pointer array
   (251 entries). `holders` on its first slot shows it hangs off a heap table of arrays
   (the same object holds the city and club arrays). That heap address moves between runs,
   so it is not a way in.
4. The static pairs next to the players/staff/clubs pairs (`game_plugin+0x56D2D00..`) were
   scanned for `(begin, end, capacity)` triples. Two hold exactly 251 elements:
   `game_plugin+0x56D2EC0` and `+0x56D2ED8`. Element 0 of the first reads
   vtable `game_plugin+0x55B5E98`, whose type info names `N2db23NATIONAL_TEAM_CONTAINERE`.
   Its UID (`+0x0C`) is 5, the same as Algeria's, and `+0x170` points at the Algeria nation.
5. Everything else was read by dumping objects and following pointers (the squads and
   captains by name, the managers by name), then compared across 251 nations and against the
   real world (FIFA rankings, residence rules, FA founding years, languages).

Scratch data (pickles, helper scripts) is under
`/private/tmp/claude-501/-Users-ayodejieluwande-fm27/751e4ad3-10d0-4f2a-b46c-a53f94caa0bd/scratchpad/re-nations/`.

## How to enumerate every nation

| What | Where | Confidence |
| --- | --- | --- |
| Men's containers | triple `(begin, end, capacity)` at `game_plugin+0x56D2EC0`; 8-byte pointers, 251 elements | high |
| Women's containers | triple at `game_plugin+0x56D2ED8`; 251 elements, order is not the nation order | high |
| Nation of a container | container `+0x170`, pointer to `db::NATION` | high (251 of 251 round-trip) |
| Container of a nation | nation `+0x110` men's, `+0x118` women's | high (251 of 251) |
| Same object as players use | `ACTUAL_PLAYER` nation pointer equals the array's `db::NATION` pointer | high (England and Nigeria squads) |

Offsets from the players pair: the containers sit 0xA8 after players (`0x56D2E18`), 0x60 after staff
(`0x56D2E60`) and 0x110 before clubs (`0x56D2FD0`). The build profile can name the pair the same
way it names the others. A reader should check that element 0's vtable resolves to
`N2db23NATIONAL_TEAM_CONTAINERE` (`rtti::class_of`) and that `+0x170` leads to a `N2db6NATIONE`.

Counts: 251 nations. UIDs are unique. Continent split: Africa 57, Europe 57, Asia 47, North America 43,
Oceania 15, South America 10, and 22 with no continent. Those 22 are historical or pseudo nations
(Soviet Union, East Germany, West Germany, Czechoslovakia, Yugoslavia, Zaire, Burma, Upper Volta,
United Arab Republic, Netherlands Antilles, Monaco, Pays Basque, United Kingdom, Tamil Indian, Singh
Indian, SEA Chinese, Borneo Malay, West Malay, South Vietnam, South Yemen, Ireland (Pre-1922),
Commonwealth of Soviet States). They have one team only. Great Britain is a real entry with a continent.
40 nations have FIFA position 0 (unranked). FM Lens's Nations tab today lists only nations that people
point at; this array is the full list.

## The nation: `db::NATION`

Vtable `game_plugin+0x55B5C40`. Objects are 0x208 bytes apart in the pool. Strings are FM strings
(`u32` length then UTF-8) unless said.

| Offset | Field | Confidence | Checked against |
| --- | --- | --- | --- |
| `+0x08` | `u32` index in the array | high | 0..250 |
| `+0x0C` | `u32` UID (also at `+0x10`) | high | England 765, Argentina 1649, Brazil 1651 |
| `+0x18` | pointer, name | high | "England" |
| `+0x20` | pointer, short name | high | "Central African Rep." |
| `+0x28` | pointer, three-letter code | high | ENG, ALG |
| `+0x30` | pointer, nationality adjective | high | English, Algerian |
| `+0x38` | pointer, second code (FM's own, "DAN" for Denmark, "CZE") | medium | ENG, DAN |
| `+0x48` | list `(begin, end, cap)` of 16-byte entries: language pointer, `u8` percent at `+0x08` | high | below |
| `+0xF0` | pointer to `db::CITY`, the capital; its name is a string pointer at `+0x18` | high | London |
| `+0xF8` | pointer to `db::CONTINENT`; name `+0x18`, code `+0x20`, adjective `+0x28`, confederation `+0x30` | high | Europe, UEFA's long name |
| `+0x100` | pointer to `db::REGION` | name offset not read | |
| `+0x108` | pointer to `db::CURRENCY_RECORD`; name `+0x18`, short `+0x20`, symbol `+0x30` | high | "United Kingdom Pound" |
| `+0x110` | men's container | high | |
| `+0x118` | women's container | high | |
| `+0x120` | pointer to national `db::STADIUM` (name `+0x40`, capacity `+0x7C`), often null | medium | England: Wembley 90,000; Nigeria: Moshood Abiola National Stadium 60,491; Brazil, Germany, Spain null |
| `+0x130` | list of nation pointers | unknown meaning | England 12 European nations, most others 1 or 2 (Italy or England). Not the rivals, see the container |
| `+0x1EC` | `u32` population | high | Brazil 211,998,573; Nigeria 232,679,478; England 57,690,300; Tuvalu 9,646 |
| `+0x1F1` | `u8` dual nationality: 0 allowed, 2 not allowed | medium-high | the 12 with 2: China, India, Indonesia, Japan, Kazakhstan, Ukraine, Latvia, Malawi, Cuba, Haiti, Suriname, Micronesia. Real law fits for most |
| `+0x1F5` | `u8` years of residence to gain nationality; FM reads it signed and takes below 1 (0, 255) as never (`0x13B7E94`) | high | Argentina 2, Brazil 4, England 5, Germany 5, Spain 10, Italy 10, Switzerland 10, Nigeria 15, San Marino 30. 113 nations read 5, 16 read 0, 12 read 255 |
| `+0x1F2` `+0x1F3` `+0x1F4` | `u8` categories | unknown | `+0x1F2` is 1 for 59 nations (England, Germany, Spain, Brazil... not Nigeria). `+0x1F3` is 2 for 123 nations, most of Africa and Asia. `+0x1F4` is 1 to 3, high in Africa. Could be professionalism or development tiers |
| `+0x1F8..+0x203` | 12 x `u8`, mostly percentages | unknown | looks like a population mix by group |
| `+0x1C8..+0x1DC` | `f32`, geographic box | guess | England 49.2..55.8 lat, -5.5..1.75 lon |

Languages (`+0x48`, percent): England English 100; Brazil Portuguese 100; Germany German 100, English 50;
Spain Spanish 100, English 10; Nigeria English 53, Yoruba 21, Hausa 21, Igbo 18, Arabic 1; Belgium Dutch 57,
French 42, English 40, German 9; Switzerland German 62, French 22, Italian 8, English 8. The high byte of a
Scotland entry holds noise (`0xAA64`), so read only the low byte. A language object has name `+0x18`, short
name `+0x20` and its home nation at `+0x28`.

## The container: `db::NATIONAL_TEAM_CONTAINER`

Vtable `game_plugin+0x55B5E98`, 0x8A0 bytes dumped. The men's one, for a nation.

| Offset | Field | Confidence | Checked against |
| --- | --- | --- | --- |
| `+0x08` | `u32` index | high | |
| `+0x0C` | `u32` UID: the nation's UID (women's: ids near 2,000,169,5xx to 2,000,169,8xx) | high | |
| `+0x18` | list of `db::NATIONAL_TEAM` pointers, senior team first (see below) | high | 169 nations 8 teams, 58 have 7, 1 has 7 (England, with Great Britain's team), 1 has 6, 22 have 1 |
| `+0x48` | list of 16-byte relation entries, rivals (see below) | high | |
| `+0x60` | list of 5 `ACTUAL_NON_PLAYER` (England) | unknown meaning | national set-up staff? not read by name |
| `+0x78` | list of 13 `ACTUAL_NON_PLAYER` (England) | unknown meaning | |
| `+0x90` | list of 1 `ACTUAL_NON_PLAYER` (England) | unknown meaning | |
| `+0xC0` | list of 116 words: nation, null, `db::COMP` | unknown | likely qualification or competition history |
| `+0xF0` | list of 16-byte entries: 8 bytes of flags, then a container pointer | unknown | England: Australia, Germany, Northern Ireland; Brazil: Argentina, England, Haiti, Italy, Ukraine. Maybe friendly opponent preferences |
| `+0x168` | pointer to `db::LEAGUE_BODY_CLUB` (id 2,000,777,912 for England; its `+0xD8` points back at the nation) | medium | likely the FA record; fields not mapped |
| `+0x170` | pointer to the nation | high | |
| `+0x1C8` | list of `db::CLUB` pointers (240 for England) | medium | probably the nation's clubs in the save, count not checked |
| `+0x1E0..+0x274` | `u16`/`u32` counters | unknown | England 5,539, Spain 6,367, Germany 4,789, Brazil 271. Database tallies, not editable settings |
| `+0x1EA` | `u16`, 0..10000 | medium (meaning guessed) | Spain 9,506, England 9,400, Germany 9,382, France 9,353, Portugal 8,763, Italy 8,738, USA 8,571, Turkiye 8,473, Saudi Arabia 7,741, Brazil 7,718. Reads as the domestic league's reputation, not the national team's |
| `+0x274..+0x2A2` | rank history: `u16` count 17 at `+0x280`, 17 `u16` from `+0x282` | medium | England 4 throughout, Spain 1 |
| `+0x374` | `u16` count 17 | | |
| `+0x378` | `f32` FIFA points now (`+0x37C` is a copy) | high | below |
| `+0x380..+0x3BC` | 16 more `f32` points history | medium | order not settled |
| `+0x56E` | `u16` bit flags | unknown | values 8, 40, 48, 104, 296, 304, 360 |
| `+0x570` | `u16` FIFA world ranking position, 0 when unranked | high | below |
| `+0x572` | `u16`, 0..200 | unknown meaning | England 190, Italy 181, Spain 180, Germany 178, France 173, Brazil 158, Nigeria 85, Tuvalu 12. Tracks league strength. Candidate for "nation reputation" |
| `+0x576` | `u16`, 1..20 | unknown meaning | England 17, Germany 18, Spain 16, Brazil 16, Nigeria 16, Saudi Arabia 20, San Marino 3, Guam 1. Candidate for youth rating |
| `+0x86C` | `u16` year the FA joined FIFA | high | England 1905, Germany 1904, Spain 1914, Argentina 1912, Brazil 1923, Nigeria 1960, San Marino 1988 |
| `+0x86E` | `u16` year it joined its confederation | high | UEFA nations 1954, CONMEBOL 1916, Nigeria 1960 |
| `+0x870` | `u16` year the FA was founded | high | England 1863, Germany 1900, Spain 1913, Brazil 1914, Scotland 1873, Argentina 1893 |

FIFA points are valid for the ranked nations: Spain 1995.88 (position 1), Argentina 1970.37 (2), France
1948.97 (3), England 1922.83 (4), Brazil 1804.92 (6), Germany 1726.22 (8), Nigeria 1585.02 (27). Points and
position do not always agree (Morocco is 5th on 1803.99, Brazil 6th on 1804.92; 98 of 211 ranked nations are
out of order against points), so the position is the published one and the points are live.

Rivals (`+0x48`), a relation entry in the same shape as a person's relations (see
`fm27-nationality.md`): `+0x00` container pointer of the rival, `+0x0A` target kind 2, `+0x0B`
relation 6, `+0x0C` `u8` strength 0..100, `+0x0D` 1 or 0, `+0x0F` `0xFF`. Entries whose target is a person or
a team (kinds 3 and 4, other relations) share the list and must be skipped by checking the target is a
container. England: Scotland 100, Germany 100, Argentina 90, France 75, Republic of Ireland 60,
Wales 55, Northern Ireland 50. Brazil: Argentina 100, Uruguay 95, Paraguay 80, Italy, France, Portugal and
Colombia 60. Germany: Netherlands 100, England 100, Italy 90, Austria 80, Spain 75, France 65, Argentina 65,
Switzerland 60.

## National teams: `db::NATIONAL_TEAM`

Vtable `game_plugin+0x55B5D50`. It is laid out like a club's team (`[team]` in the layout
profile): the same kind, age limit, owner, player list, stadium, captain and reputation slots.

| Offset | Field | Confidence |
| --- | --- | --- |
| `+0x0C` | `u32` id. The senior men's team's id equals the nation's UID (251 of 251); others use 2,000,80x,xxx | high |
| `+0x28` | `u32` kind (below) | high |
| `+0x2C` | `u8` age limit: 100 senior, 23, 21, 20, 19, 18; 255 for teams with none | high |
| `+0x30` | pointer to the container (the `club` slot of a club team) | high |
| `+0x38` | player list `(begin, end, cap)`, pointers to player objects | high |
| `+0x50` | pointer to a `db::COMP` | unknown which competition |
| `+0x78` | pointer to a `db::STADIUM`, null for many | medium |
| `+0x80` | pointer to the manager, a `db::ACTUAL_NON_PLAYER` | high |
| `+0x88` | captain: pointer to the player's identity block, which is the player object plus 0x388 | high |
| `+0x90` | vice-captain, same encoding | high |
| `+0xA8` | `u16` reputation 0..10000 (same slot as a club team) | high |
| `+0xB0` | `u8` 0 senior, 0x80 youth with players, 1 dormant | medium |

Kinds seen. The low byte matches a club team's kind, and 0x100 marks a national team.

| Kind | Meaning | Confidence | Count (men's) |
| --- | --- | --- | --- |
| 0 | senior | high | 250 |
| 265 (0x109) | under 23, age limit 23 | high | 227 |
| 266 (0x10A) | under 21, age limit 21 | high | 229 |
| 267 (0x10B) | under 19 | high | 229 |
| 268 (0x10C) | under 18 | high | 229 |
| 274 (0x112) | under 20 | high | 229 |
| 289 (0x121) | unknown; never has players or managers; reputation about 0.75 of the senior | unknown | 229 |
| 259 (0x103) | unknown; never has players or managers; 169 nations | unknown | 169 |
| 9 | Great Britain's senior team (id 145,174); also sits in England's list as the 7th entry | high | 2 |

Only teams in the senior and youth kinds have squads. Squads are 23 player pointers. England's senior
squad resolves to English players by name (Pickford, James, Guehi, Konsa, O'Reilly, Rice, Anderson,
Saka, Bellingham, Foden, Kane, Henderson, Trafford, Watkins, Palmer, Scott, Hall, Wharton, Lewis-Skelly,
Spence, Chalobah, Quansah, Colwill); Nigeria's to Nigerians. This is the selected squad,
not every eligible player.

## The women's side

Each nation's `+0x118` points into the second array (`game_plugin+0x56D2ED8`). A women's container
has the same layout, its `+0x170` leads to the same nation, and its teams have the same kinds. Ranking
position and points read like the women's FIFA list (England 3 on 2027.1, Spain 2 on 2105.4, USA 1, Brazil
4, Germany 5, Nigeria 36), so this is the women's ranking and not a copy.

The women's squads are not usable in this save. Of 251 senior women's teams, 62 hold 1 or 2 players, 13 have a
manager and 4 a captain. Reputations are set (England 9,950, Brazil 9,625, Germany 9,700, Spain 9,850,
Nigeria 6,150).

## Values to compare in FM's nation screens

Men's, from this save (1 on the FIFA list means Spain is first).

| | England | Brazil | Germany | Spain | Nigeria |
| --- | --- | --- | --- | --- | --- |
| UID | 765 | 1651 | 771 | 796 | 38 |
| Code, adjective | ENG, English | BRA, Brazilian | GER, German | ESP, Spanish | NGA, Nigerian |
| Continent, capital | Europe, London | South America, Brasília (DF) | Europe, Berlin | Europe, Madrid | Africa, Abuja |
| Senior team reputation | 9,238 | 8,721 | 8,682 | 9,447 | 6,423 |
| League-like reputation (`+0x1EA`) | 9,400 | 7,718 | 9,382 | 9,506 | 4,500 |
| `+0x572` / `+0x576` | 190 / 17 | 158 / 16 | 178 / 18 | 180 / 16 | 85 / 16 |
| FIFA position, points | 4, 1922.83 | 6, 1804.92 | 8, 1726.22 | 1, 1995.88 | 27, 1585.02 |
| Years to gain nationality | 5 | 4 | 5 | 10 | 15 |
| Dual nationality | allowed | allowed | allowed | allowed | allowed |
| Population | 57,690,300 | 211,998,573 | 83,516,593 | 49,570,725 | 232,679,478 |
| FA founded / joined FIFA / confederation | 1863 / 1905 / 1954 | 1914 / 1923 / 1916 | 1900 / 1904 / 1954 | 1913 / 1914 / 1954 | 1945 / 1960 / 1960 |
| Languages | English 100 | Portuguese 100 | German 100, English 50 | Spanish 100, English 10 | English 53, Yoruba 21, Hausa 21, Igbo 18, Arabic 1 |
| Rivals (strength) | Scotland 100, Germany 100, Argentina 90, France 75, Rep. of Ireland 60, Wales 55, N. Ireland 50 | Argentina 100, Uruguay 95, Paraguay 80, Italy 60, France 60, Portugal 60, Colombia 60 | Netherlands 100, England 100, Italy 90, Austria 80, Spain 75, France 65, Argentina 65, Switzerland 60 | France 90, Argentina 70, Italy 60, Germany 60, Portugal 50, England 50 | Ghana 80, Cameroon 70, Ivory Coast 70, South Africa 50, Argentina 50, Algeria 50, Benin 40 |
| Manager (senior) | Thomas Tuchel | Carlo Ancelotti | Jürgen Klopp | Luis De la Fuente | Éric Chelle |
| Captain, vice | Harry Kane, Declan Rice | Marquinhos, Casemiro | Joshua Kimmich, David Raum | Rodri, Mikel Oyarzabal | Wilfred Ndidi, Victor Osimhen |
| Squad size | 23 | 23 | 23 | 23 | 23 |
| National stadium | Wembley, 90,000 | none | none | none | Moshood Abiola National Stadium, 60,491 |
| Team reputations: senior, U23, 289, U21, U20, U19, U18 | 9,238, none, 7,200, 6,720, 5,637, 4,697, 3,805 | 8,721, 7,360, 6,900, 6,440, 5,520, 4,600, 3,680 | 8,682, 7,000, 6,562, 6,125, 5,250, 4,375, 3,500 | 9,447, 7,800, 7,312, 6,825, 5,850, 4,723, 3,836 | 6,423, 5,160, 4,837, 4,515, 3,870, 3,225, 2,580 (259: 4,515) |
| Women's FIFA position, points, senior reputation | 3, 2027.1, 9,950 | 4, 1976.7, 9,625 | 5, 2029.0, 9,700 | 2, 2105.4, 9,850 | 36, 1601.6, 6,150 |

Tuvalu for the low end: UID 23,088,616, senior reputation 50, unranked, population 9,646, 7 years to gain
nationality. San Marino: UID 792, reputation 611, position 211, 30 years.

Two checks that need FM's own screens: the senior team reputation in stars or number, and whether the
rival list matches the "Rivals" shown for England (Scotland, Germany, Argentina first).

## Confidence by wanted field

| Field | Where | Confidence |
| --- | --- | --- |
| UID, name, short name, code, adjective | nation `+0x0C`, `+0x18`, `+0x20`, `+0x28`, `+0x30` | high |
| Continent | nation `+0xF8`, name `+0x18`; null for 22 historical nations | high |
| National team reputation | team `+0xA8` | high |
| FIFA points, position | container `+0x378`, `+0x570`; history in the same container | high |
| Youth rating | candidate container `+0x576` (1..20) | guess |
| Attendance | not found; only the national stadium's capacity | not found |
| Languages | nation `+0x48` | high |
| Rival nations | container `+0x48` relation 6 | high |
| Years to gain nationality | nation `+0x1F5` | high |
| Dual nationality allowed | nation `+0x1F1` (2 means not allowed) | medium-high |
| FA settings | FA founding, FIFA and confederation years found; the FA record is `+0x168` but not mapped | partial |
| Kits | not found; kit art lives in graphics packs, kit data was not looked for | not found |
| Tactics and transfer preferences | not found; container `+0xF0` and `+0x130` may hold preferences | not found |
| Men's national team, manager, squad, captain | container `+0x18`, team `+0x80`, `+0x38`, `+0x88` | high |
| Women's teams | nation `+0x118`, second container array | high for ranking and reputation; squads nearly empty |
| Nation reputation | team `+0xA8`, or `+0x1EA` or `+0x572` of the container | guess which of the three FM's screen shows |

## Open questions

- Which of the three reputations (`+0xA8`, `+0x1EA`, `+0x572`) FM's nation screen shows as "reputation", and
  what `+0x576` is. A single comparison in FM's UI settles it.
- Kinds 259 and 289: possibly an Olympic team and a women's-style B team; both are always empty.
- The meaning of the lists at nation `+0x130`, container `+0xF0`, `+0x60`, `+0x78`, `+0x90`, `+0xC0` and
  `+0x7C8`/`+0x810`, and of the unnamed `u8` fields at nation `+0x1F2..+0x1F4` and `+0x1F8..+0x203`.
- Which of the container's two sets of FIFA numbers is the one FM prints (`+0x378` or the rank history),
  and whether `+0x380..+0x3BC` runs oldest first.
- Whether changing any of these is safe: nothing was written. Reputation and rival edits would touch records
  the game also uses for the ranking and draws; test on a disposable save first.
- Any other build or platform; the second container array and the `+0x118` link were seen on this build only.
