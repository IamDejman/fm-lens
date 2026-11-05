# FM27 nations and clubs, second pass

Build 26340721, native ARM64. Method: FM's own getters and setters keyed by 4-character property codes, plus live reads. All reads were read-only. Career date 11 Dec 2027, Arsenal is club 602.

Getter RVAs (game_plugin+RVA): NATION 0x13b1d14, NATIONAL_TEAM_CONTAINER 0x13ec530 (body 0x13ec58c, delegates to the nation through container+0x170 first), NATIONAL_TEAM 0x13d746c, CLUB 0xe476c4, CLUB_FINANCE 0xe7dfb8 (setter 0xe7e538).

## 1. Women's national teams

Status: found.

Where:
- The women's container pool is 251 contiguous records of 0x8A0 bytes, array triple at game_plugin+0x56D2ED8. The men's pool is the same shape at +0x56D2EC0.
- From a nation: nation+0x110 is the men's container, nation+0x118 the women's. FM's codes agree: 'Nmtc' returns +0x110, 'Nftc' returns +0x118. Container+0x170 points back to the nation.
- Team list is at container+0x18 as (begin, end, cap) pointers, up to 8 teams. Team object is 0xB8 bytes: +0x0C id, +0x28 kind, +0x30 container, +0x38 players, +0x80 manager, +0x88 captain, +0x90 vice, +0xA8 reputation (i16).
- Women's kinds: 0 senior (251 teams), 259 (169), 265 to 268, 274, 289 (229 each). Men's has the same kinds plus 2 teams of kind 9 (Great Britain), and only 250 senior teams.
- Women's senior team ids are 2000xxxxxx values, not the nation UID. England women senior is id 2000169621.
- Reputation: women's senior ranges 1 to 9950, median 1850. England women read 9950, England men 6000 (edited earlier by the user, was 9238).
- Staffing: only 13 women's senior teams have a manager, 4 a captain, 62 a non-empty squad. Men's: 218, 147, 191.

Evidence, values to check in FM: Nations, England, Women. Senior team reputation should read the top star band (9950 of 10000). Open the England women page, the manager and captain should be empty.

Editing: reputation is an i16 at team+0xA8, same guard as men's (0 to 10000). Raw write is as safe as the men's path. Manager and captain are pointers, so do not raw write them.

## 2. Nation FA settings (container fields)

Status: found for the container block; kits and transfer preferences not found.

Where: all on the men's or women's container, offsets from the container getter. Reach them as above.
- +0x86C Nfay, i16 year: England 1905 (FIFA affiliation). +0x86E Nfdy, i16: England 1954 (continental body). +0x870 Nafy, i16: England 1863 (association formed). Women's England: 1972, 1972, 1863. 0 means unset.
- +0x874 NYRt, i16: youth rating, England men 135, women 161, range 0 to 165.
- +0x885 Ngim, i8: game importance, 0 to 4 (England 1). Men's most common is 1, women's is 4.
- +0x886 Numa, u8 flag 0 or 1 (60 men, 14 women). +0x887 Nffm, u8 flag 0 or 1.
- +0x88B Nfap 0 to 20. +0x88C Nmya 17 to 21, likely an age limit. +0x88D Nfpa 0 to 20. +0x88E Nfml 1 to 20.
- +0x891 Natt: attendance, 0 to 16 (England men 15, women 10).
- Style bytes, i8, 0 to 20, typical default 10: +0x892 Ndep, +0x893 Ndir, +0x894 Nflm, +0x895 Nflx, +0x896 Nfrl, +0x897 Nmar, +0x898 Noff, +0x899 Nprs, +0x89A Nstb, +0x89B Ntpo, +0x89C Nupm, +0x89D Nwid. These look like national style and facility ratings. Names are not confirmed. 17 nations have zeros in all of them (non-playing entries).
- The nation's own reputation: the container answers 'Nrep' from the senior team (+0xA8), so it is not a separate field.
- Nation object codes: Nndn no dual nationality (+0x1F0 bit 9), Nygn years to gain (+0x1F5 i8), Ngct continuous or accumulative (+0x1F3), Npop population (+0x1EC), Ncac capital, Ncni continent, Ncur currency, Nrgi region, Nnsi national stadium, Ntxr tax rules, N3ln three-letter name.
- Not found: kits, national team tactics, transfer preferences (codes exist under 'Neu1' to 'Neu9', 'Ne10', 'Ne11', 'NHP*', 'NHR*', 'NME*' but they call computed helpers, not a field).

Evidence: England FA page, "Year association formed 1863". Youth rating on the nation editor should show 135. Check attendance and game importance on the same page.

Editing: all are plain integers, writing within the ranges seen is safe. Treat the style bytes as unlabelled until a screen check confirms the names.

## 3. Nations health check (2 failures)

Status: found.

The two failing sampled nations are Madagascar (UID 29) and Liberia (UID 27). Years to gain nationality is 99 on both. check_nations accepts only 60 or less, or 255. The sample (2000 indices over 30,300 players) reaches 137 distinct nations, and only these two fail. Palestine (UID 1662) also has 99 but was not sampled. Dual byte values across all 251 nations are 0 or 2 only, so dual is not a cause. Great Britain (UID 145174) has no kind-0 senior team but no player points at it.

Fix: 99 is data, treat it as "effectively never". Change the rule to `years <= 99 || years == 255`. Years distribution over 251 nations: 5 is most common (112), then 10 (41), 7 (20), 255 (12), 99 (3).

## 4. Dual nationality and naturalisation in FM

Status: found.

- Nation method RVA 0x13b9190 (this = target nation, x1 = person) returns a reason code. It returns 8 (cannot gain) when years is 255, when the person's current nation has dual bit set (+0x1F0 bit 9), or for hard-coded nations (UIDs 791, 799, 800 with age or CA conditions). Special pairs 779 and 791, 110 and 111 skip the dual block.
- Progress is computed at 0x13b84b4 using +0x1F3 (continuous or accumulative) and residence dates (1900 is unset). Months needed come from 0x13b7e24: years x 12, and 32767 (never) when the signed years is below 1. So years 0 also means never. Special cases for nation UIDs 0x2F5, 0x306, 0x308, 0x314, 0x31C use 24 or 48 months, or CA 120.
- The switch action is near 0x2628040 to 0x2628700. It re-checks the dual bit and years, sets the person's nation, and decrements the old container counter at +0x1EC.
- UI strings: KEY-636879 "[n]/[n] days", KEY-283596 "Needs to reside in [nation]", KEY-312865/312866 "Continuous"/"Accumulative", KEY-339714 "Has only played N matches out of a required M".

Test in FM: England now has years 7 and dual not allowed. Open a foreign-born player at an English club, Overview, Nationalities card. Expect a days gone over days to gain figure against 7 years (2555 days). Named case: any player at Arsenal on a non-English passport after 11 Dec 2027. For "never", use a player of Madagascar, Liberia or Palestine as the target nation. I could not name a specific player without the screen.

Editing: set years and dual through the nation fields. Changing the dual bit does not strip existing second nationalities.

## 5. Clubs

Status: partial.

Confirmed existing offsets. Info record (club+0x100): founded 0xD8 (Arsenal 1886), season tickets 0xC0 (42,084), training 0x120 (19), youth facilities 0x12B (16), youth coaching 0x12C (20), youth recruitment 0x12D (16). Finance (club+0x150): balance 0x0C, transfer budget 0x7C4, total wage budget 0x808, wage budget 0x814. Codes: Cwwb returns 0x808, Cnsb and Ctfc return 0x7C4. Stadium fields are as in the profile.

Newly mapped info bytes: Cown 0x129 (owner kind, Arsenal 1), Cmle 0x121 (4), Chti 0x12A (1), Cyim 0x126 (15), CScP 0x127, Cels 0x12F. Meanings of Cmle, Chti, Cyim, CScP, Cels are not confirmed.
Kits: codes '1sbc', '1scl', '2sbc', '2scl', '3sbc', '3scl' and the 't' versions (kit 1 to 3 shirt, shorts, background colours) go through a virtual call at vtable slot 0x140, so colours are held in a kit object, not a plain club field. Not traced further.
Vision: the codes CAVC and similar have no direct field. Not found.
Staff allowances: not found. Staff lists are club+0x60, +0x78, +0x90.
Income and expenses: the finance record has a table of money values between +0x27C and +0x6A4 (i32, many named per month). Arsenal samples: +0x548 427,492,585; +0x54C 67,946,659; +0x55C 154,937,307; +0x560 158,669,426; +0x678 155,000,000. Labels for sponsorship, TV and merchandising are unmapped. Do not guess.
Stadium capacity: stays at the profile offsets.

Values to check in FM, Arsenal (602): Info: founded 1886, season tickets 42,084. Facilities: training 19, youth facilities 16, youth coaching 20, youth recruitment 16 (on the 1 to 20 scale). Finance: balance about 190,968,032, transfer budget at +0x7C4 shows 11,048,517 in memory, wage budget 5,416,587 at +0x814. Check which line on the Finance screen matches 427,492,585 and 155,000,000 to label income rows.

Editing: finance values are plain i32. Only the known fields are safe. Do not write income rows until labelled.

## 6. Language levels

Status: partial.

- Level getter is a vtable slot (0x120) on the language relation and returns 0 to 10.
- Thresholds at 0x123E5C0: Fluent at level 7 or more, Good 5 or more, Basic 2 or more, Does Not Speak below 2. A level above 9 falls to a default case, probably native.
- String keys: Fluent 374065, Good 374080, Basic 374005, Does Not Speak 562457 (editor filter). Person screen uses "[language] (Fluent)" KEY-385744, "(Good)" KEY-385745, "(Basic)" KEY-313200.
- "Competent", "Accomplished", "Natural" (KEY-248634 to 248636) are position-rating words, not language words.
- Translations: example.ltf in game_plugin.bundle/Contents/Resources/data/game_simulation/templates/user_folder/languages holds all English strings. languages.fmf is compressed. Per-language data is in shared/data/database/db/2700/2700_fm/lang_db.dat and lang_db_general.dat.

Test in FM: open a player who speaks French at level 5, 7 and 2 and check the word beside the language.
