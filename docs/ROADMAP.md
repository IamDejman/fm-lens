# FM Lens feature status and roadmap

Baseline: 4 November 2026; support summaries reconciled 8 November 2026 against
dated evidence through Windows installer checks (#153). This records the
requested FM Live Editor-style scope.
It is not a claim that all features are implemented or achievable without
further data-layout and game-behavior research.

## Status meanings

- **Available**: present for use. Live verification is narrower than complete
  coverage. See PERSONAL-SCOUT.md and EDITING-VALIDATION.md.
- **Enabled, unverified**: the control is on for a known build. That particular feature has not passed in-game
  write, save, quit and reload checks on a disposable career.
- **Partial**: only some requested fields, entities or interactions are supported.
- **Foundation only**: inherited code exists, but writes are disabled and editing
  has not been verified on this user's career.
- **Missing / research**: needs implementation and, where relevant, mapping and
  simulation-behavior investigation.

## Platform evidence

Windows ships from 0.6.2. The Windows reads, game actions and bounded app
edit/undo checks are recorded in EDITING-VALIDATION.md and
[the Windows handoff](internal/WINDOWS-PARITY-HANDOFF.md). Those checks used
Windows Server 2022 and did not save the edited career. Windows 10/11 execution
and edited-save quit/reload remain unverified. Unless a row names another
platform, its in-game persistence evidence is from macOS ARM64; mapped Windows
fields do not inherit that evidence. Promises remain unavailable on Windows.

Intel action parity on `feat/intel-parity`: mapped, not yet tested live under Rosetta. All 24 ARM64 call keys, the injury and database statics, the editor tables and the STARTING_LOAN defaults now have Intel values, and the Intel bridge passes an indirect result place the System V way. An Intel helper rebuilt from this branch is required. The new actions switch on through profile and helper capability discovery, with no new Intel live or persistence evidence. See [the mapping and Rosetta handoff](recon/fm27-steam-26340721-macos-x86_64.md#intel-action-parity-mapping-8-november-2026).

## Feature matrix

| Requested feature | Current status and remaining scope |
| --- | --- |
| Live player, staff and club search | Available; all eight searchable lists use 200-row pages with Previous/Next and a range. Search/filter/sort changes return to page one. Backend page boundaries, fixture preview and native sample-data paging/profile retention checked; live player/staff/club paging, profile retention, search/sort/filter resets and a partial final player page checked on 7 November; large-career performance benchmarks remain open |
| Advanced player search | Available: age, CA/PA, position, nationality, club, attributes, contract expiry, free agents, transfer/loan listing; extend against mapped fields |
| Staff and club filters | Available for decoded values: staff job, unemployment, human managers only, age, nation, club, CA/PA and attributes; club gender, reputation and founded year |
| Nations, stadiums, competitions, awards and officials search | Available: searchable nations represented by players, staff and competitions, with a continent filter where the build reads nation details; senior stadiums, one row per ground with every club that plays there, filtered by capacity and men's or women's clubs; match officials (name/UID; Steam build 26340721, macOS arm64 and Intel, from a static in its build profile) filtered by age, CA/PA and nation; and Competitions and Awards sections (#21) read through the game's own database tables: 8,084 competitions and 3,902 awards, about 0.1 s each, checked on macOS arm64. Competitions filter by men's or women's, nation, continent and reputation; awards by men's or women's, nation, recipient and prestige. A complete nation list still needs the nation table's address |
| Player attributes, CA/PA, positions, traits, personality | Available to view; Saka's visible values checked against FM, hidden values not independently verified with a second editor |
| Club finances, facilities, stadiums, relations | Partial: mapped balances, budgets, facilities and capacities; broader relations and financial/stadium records absent |
| Contract, wage, clause and transfer-status viewing | Partial; every contract clause and bonus is not covered |
| Pending edits, applied history, conditional undo | Available; one finishing edit, history and undo exercised natively. Pending amber/applied green marking, expected-value comparison and build/career guards. The Changes list survives Reload and FM restarts (#44): changes to a game FM has since closed or loaded a save into stay listed as "Earlier game", without Undo; observed in the native app on 7 November. This is in-memory retention while FM Lens stays open, not persistence across companion quits. Broader native conflict scenarios remain open |
| Human-manager special actions | Partial: the human manager can be edited where staff fields exist. Unsackable (bit 1 of the manager's flags) is implemented; apply/undo, stale-value refusal and save/reload persistence tested, on FM27 Steam build 26340721 ARM64; the Intel half reads the same flags in a running game under Rosetta (6 November), writes not tried there (see recon/fm27-human-manager.md). Squad registration at any time (bit 8, traced to the game's own `squad_registration_anytime` action) is implemented; apply/undo, stale-value refusal, FM accepting a registration change outside the window, the flag surviving save/reload and FM keeping such a change through save/quit/reload tested on the same build. Your likes and dislikes are shown and edited as a member of staff's (see Staff fields); your favourite club pointed at another club showed in FM at once and survived save and reload (7 November). Change club (macOS and Windows) has the game sign the human manager as a club's manager, as its own editor does (`sign_free_agent` with a Manager job): it ends his job and dismisses the club's manager, and nothing undoes it. Tried in FM on 6 November: FM showed the new job at once (see EDITING-VALIDATION.md). On 8 November it held for a day and through a save and load, with a new contract, caretaker and news; FM's Job History gained no row for the new club and the replaced manager's history row stayed open. National-team moves and leaving a job remain research (recon/fm27-manager-moves.md); not feasible as raw writes |
| Player field editing | Partial validation: finishing 15 -> 16 survived save, full quit/relaunch and reload in FM. Enabled for mapped attributes, ability, positions, traits, personality, reputation, nationality, caps, happiness and selected contract values |
| Player registration, work permits, career plans, languages, favourite/disliked clubs and people | Partial. Work permits: shown (#20), granted and revoked through the game's own calls (#22, #23, #39), on arm64 and Intel (#41); grant, revoke and undo checked in FM, which on 0.5.8 shows a grant or revoke at once, and only for your own club's players. Undoing a revoke gives an ESC slot back with its first date (#42). Secondary nationalities and homegrown ties can be changed, added and removed; cancelling a planned retirement ("Keep playing") swaps "Will retire at top" for "Will play football as long as possible": both enabled, unverified. Languages (name and level in FM's words, checked against FM on six players) are shown, mapped on macOS and Windows; a level (1 to 10) can be changed and a language removed, logged and undoable: enabled, unverified. Favoured/disliked people and clubs are shown, mapped on macOS and Windows; a strength (1 to 100) can be changed, an entry removed, or pointed at another club or person (Replace), logged and undoable: all three checked in FM (6 and 7 November; a replaced entry keeps FM's old Reason). Registration, other career plans, adding a language and adding likes remain missing / research |
| Player attribute freeze | Enabled. Held over a 31-day holiday (8 November): two frozen players lost nothing while 59 of 127 unfrozen players aged 35+ lost points. A club money freeze held the balance over the same holiday and a Reload, but not the transfer budget (see EDITING-VALIDATION.md) |
| Staff fields and roles | Partial. Checked in FM: contract wage and a Tactical change survived save, quit and reload. Unverified: other attributes, CA/PA, personality, reputation and contract expiry. A job change and a club move held through two loads and a 23-day holiday (8 November); a full staff list is refused. The coaching licence is editable (#17), its levels named as FM's Coaching tab names them (#35); an edit not yet checked in FM. His preferred formations in and out of possession, the two FM's profile shows, are shown and editable, mapped on macOS and Windows, offered as ids the game uses for each; Seven IDs now use names checked in FM; the others retain explicit Formation N labels (FM's 4, 7 and 29 are 4-3-3 DM Wide, 4-4-2 Diamond Narrow and 4-2-3-1 DM AM Wide). Both checked in FM: on 0.5.8 an edit and its undo show on FM's profile at once (a day later before). Likes and dislikes (staff +0x140, the player relation format) and languages are shown, with the same edits as for players, Replace included, mapped on macOS and Windows; language edits unverified |
| Staff freeze, coaching licences, knowledge, tendencies, preferred formations, relations | Attribute freeze implemented; toggle exercised. Remembered with the save's other freezes: held over a 31-day holiday and back on after FM restarted (8 November). Coaching licence editable (see above). Preferred formations editable (see above). Knowledge, tendencies and relations remain research |
| Club budgets, facilities and stadium capacity editing | Enabled. Checked in FM: transfer budget and youth recruitment survived save, quit and reload. Unverified: other balances, budgets, facilities and capacities |
| Club income, kits, relations, affiliations, ownership, benefactor, staff allowances, vision, supporters, tactical values | Partial / research: supporter values; rivals (club +0x48, strongest first) and affiliated clubs (club +0x118) shown read-only, mapped on macOS and Windows, probe-checked on Arsenal and Man City. Kits, ownership, vision and allowances not found (recon/fm27-club-extras.md) |
| Youth-intake preview and editing | Missing / research: pre-intake visibility, CA/PA, height, feet and record lifecycle |
| Player promises | Partial, macOS layout only; unavailable on Windows. The profile lists the promises made to a player that FM's Promises page lists, by a verified name for playing time (ID 1), or an explicit Promise N fallback for unmapped IDs, with when each was made and is due or ended. An open one can be closed: it ends today without being held against him, FM shows it succeeded at once on 0.5.8 (the next day before), and drops it 31 days later; undone from Changes. Checked against FM on 6 November (see EDITING-VALIDATION.md). Making, editing and naming promises remain research |
| Injuries and bans | Add an injury through the game's own call (#22, #23): checked in FM, whose Medical screen showed it at once; undone by healing it, after which FM showed no injury. Lifting bans: checked in FM, which showed the ban gone at once. An injury's length (1 to 730 days from when it began, at the most; the soonest return comes forward with it) can be changed, and one injury taken out while the others stay, logged and undoable: enabled, unverified. Changing an injury's kind is not offered: heal it and add another |
| Nations and national teams | Partial, mapped on macOS and Windows. Read: code, continent, capital, population, dual nationality, years to naturalise, languages with share, FIFA ranking and points, founding, FIFA and confederation years, rivals, and the men's and women's national teams (senior and youth: reputation, manager, captain, vice-captain, squad) and youth ratings (#16). Probe-checked on England, Argentina, Italy, France; England's years and both reputations matched FM. Editing, guarded, one nation at a time: the men's and women's senior reputations, youth ratings, game importance (0 to 4) and attendance (0 to 16), men's FIFA points (0.00 to 3,000.00; FM ranks by them at its next ranking date), population, dual nationality and years to naturalise (1 to 99, or never), and the twelve style ratings of each side (0 to 20: depth, directness, flamboyancy, flexibility, free roles, marking, offside, pressing, sitting back, tempo, use of playmaker, width; named from FM's codes, not yet compared with FM's screens). Apply, undo and save/quit/reload persistence tested on England for the men's reputation, population and both rules, with population and reputation shown by FM after the reload (docs/EDITING-VALIDATION.md); the women's reputation, youth ratings, FIFA points, game importance and attendance not yet checked in FM. Behind a nations health check covering both sides. Other FA settings, kits, tactics and transfer preferences remain research (recon/fm27-nations.md) |
| Competitions | Partial, read-only (#21): name, short name, nation, continent, reputation and women's tag; the Premier League checked against FM. The profile shows the rules FM's loaded rule data holds as plain numbers or yes/no (level, squad sizes, foreign players, substitutions, stoppage time, medals, stadium and pitch rules), mapped on macOS and Windows, not yet compared with FM's screens; FM may copy them into each season's stages, so they need not be what a running season uses. Editing rules, level, substitutes, VAR and goal-line technology, and season-instantiated/cached behavior, remain missing / research |
| Awards and officials | Partial. Awards read-only (#21, #34): competition, nation, continent, prestige, period, given to, goalkeepers only, age limit and women's tag; the World Golden Ball checked against FM. Rules and eligibility editing undecoded. Officials list and profile (name, nation, born, CA/PA, reputation; Steam build 26340721, macOS arm64/Intel and Windows), with CA/PA, reputation and birth date editable one official at a time (#29); an edit read back after Continue, but FM's search has no officials to compare with. Referee attributes (8 bytes at +0x40) unlabelled |
| Complete contracts | Partial. Checked in FM: a player's expiry date and a staff wage survived save, quit and reload. A player's wage change survived reload; FM's weekly GBP formatter rounds £310,000 to £300K (see validation notes). Payroll deductions remain unverified. Unverified: other dates, squad number, loyalty bonus and listing flags. Every clause kind is named as FM's contract screen names it (#18, #38). A clause's amount and condition can be changed, a clause removed, and a release clause added where the contract's list has room: each checked in FM and held through two loads and a 23-day holiday (8 November). Adding other clauses, and bonuses beyond the loyalty bonus, are not covered. FM shows a contract's clauses and bonuses only for players it has scouted |
| Player transfers, swaps, releases and staff moves | Partial, through the game's own calls where the build has them. A Move is a transfer with its fee and a Swap is two transfers without one (macOS arm64 and Windows); a Release is the editor's release (macOS arm64 and Windows, checked on Windows 8 November: a free agent, no Undo). None can be undone. Checked in FM on 8 November: both clubs' Transfer History lists show each transfer and its fee, and a released player is a Free Agent with no Transfers Out row, as after the editor's release. Elsewhere, and for staff moves, FM Lens writes the move, restricted: a written move with a fee, a swap, a release and a staff move held through two loads and a 23-day holiday (8 November) and the fee moved between balances, but left no transfer row or fee in any history, and registration sorted itself out during the holiday. Training and contract consistency unverified |
| Loans, free-agent signing, future-transfer cancellation, instalments and buy-backs | Partial, through the game's own calls: start a loan from the Transfer dialog (#24), end a loan early (#26), sign a free agent now (#25) or on a later day (#28); a loan's wage share and end date are editable (#19). Checked in FM: loan terms against Squad > Loans, a started loan and its undo, a signing with terms, a scheduled signing taking effect and a cancelled one leaving no badge, End loan without a future fee and its undo (#33). End loan is refused on a loan with a future fee (#30), since the game would complete the transfer. FM's transfer history keeps a line for each loan started, even after undo. A player's profile lists every move FM agreed for a later day (club to club, a signing or a loan), and Cancel transfer has the game cancel them as its own editor does, with no undo. On 7 November, cancelling Martínez’s club deal removed FM’s arranged-transfer badge and stayed cancelled after save/reload; the same check retained Piñeiro’s replacement signing and the observed budget changes. No news item appeared. This does not prove every deal type or budget/accounting effect; a scheduled loan was not available to test (see the Live check: UI smoke pass and future transfers entry in EDITING-VALIDATION.md). Instalments and buy-backs remain research (recon/fm27-future-transfers.md) |
| Instant squad actions | Heal all, Lift bans, Inspire all, Refresh all and Max attributes checked in FM on Arsenal: each showed at once, without Continue, and Inspire all and Max attributes undid exactly (docs/EDITING-VALIDATION.md, 7 November). Setting all of one player's attributes to a value from 1 to 20 (injury proneness and dirtiness get 21 minus it) is enabled, unverified |
| Cohesion and tactical familiarity | Partial: Max cohesion raises each player's existing familiarity with his club to 100 (never adds an entry), logged with batch undo, mapped on macOS and Windows. On Windows (8 November) FM's Team Cohesion went from Average to an extremely strong bond. Checked in FM: Arsenal's Team Cohesion went from Very Good to Excellent at once on 0.5.8 (after one Continue before), and back with undo, and all three teams' values survived save, quit and reload. FM lowers them again as days pass, and an undo after that is refused. Max tactics (#32) has the game's own editor action raise a team's tactical familiarity, logged with batch undo that writes the old entries back exactly. Checked in FM on Tottenham and Arsenal: Arsenal's values survived save, quit and reload, and FM's Tactical Effectiveness pies were full (tactic 1 only after the reload). For a human manager's team FM also updates what the manager knows of his players, which undo leaves. Single familiarity entries (player +0xF8) are not editable by value |
| Bulk edit preview/apply/undo | Available; template path exercised with one target/one change and undo. A Clubs Mass edit over 12 clubs and its undo showed in FM at once. A template on three players held its attributes through two loads and a 23-day holiday (8 November), but the game put back most of each player's own positions beside the copied ones |
| Clone a player profile onto other players | Implemented with selectable groups, filtered targets, optional UID restriction and preview. Live capture of 142 fields exercised; multi-target clone persistence unverified |
| Reusable player templates | Available: versioned JSON, local library, import/export, destination validation, preview/apply/undo. One-field native batch and invalid-field rejection exercised; cross-save/build testing open |
| Fast field interaction / dragging | Enabled, unverified for mapped fields. A displayed mapped value opens its focused input on click or Enter/Space, then uses the usual review/apply/undo path; mouse/keyboard activation, focus, pending guard, apply and undo exercised natively |
| Remembered navigation, searches and profile selection | Available; later-page selection survives language/currency reloads, and unopened sections retain state through consecutive reloads. Fixture regressions and bounded native macOS checks recorded on 8 November; broader career/restart cases remain open |
| Light/dark appearance | Available: System, Light and Dark selector with local persistence; native light/dark check performed. FM-inspired refinement (see FM-LENS-INTERFACE.md) has native light/dark checks at 125/150% zoom, including native confirmation of the filter overflow fix |
| Currency selector | Available; broader locale checks remain |
| Dedicated UI zoom selector | Implemented: 80, 90, 100, 110, 125 and 150 percent. Player-column priorities follow measured zoom-adjusted width; native macOS readability checked at 100/125/150%, including an open profile and light/dark appearance (8 November). Wider window/platform coverage remains open |
| Keyboard navigation | Available: ⌘1-⌘9 sections, ⌘F search, arrow keys in lists, Enter/Space opens, Escape closes, ⌘S applies edits (see DESIGN-STANDARDS.md) |
| Guided first-run tour | Delivered: skippable introduction to navigation, search, settings and the editing boundary, then, once the game can be edited, a guided first edit (open, Edit, change, Apply, Changes) that follows what the user does |

## Automatic refresh after Apply and Undo (6 November 2026)

Implemented on Steam build 26340721, macOS ARM64, through FM’s own
entity-change notifier and active-view refresh on its main thread after every
queued successful edit or undo. A copied-career test on the 0.5.5 source
baseline showed Saka’s Finishing 16 → 17 → 16 in the already-open FM Overview
after Apply and Undo, with no Continue or navigation. A subsequent copied-career
test showed the contract expiry header updating immediately 30 June → 29 June
→ 30 June 2032 after Apply/Undo, still at 16:30. These tests predate the
generalized active-view refresh and cover only those observed fields. Other
fields/screens remain unverified. On 7 November, on 0.5.8 with the general
refresh, every edit checked showed in FM without Continue: Lift bans, Heal all,
Refresh all, Inspire all, Max attributes, Max cohesion, Max tactics, a club's
transfer budget, a Clubs Mass edit, closing a promise, a staff formation and a work permit revoke and grant, with their undos. On Intel
both refresh calls are mapped (recon/fm27-intel-refresh.md); an attribute and a contract end, with their undos, showed at once under Rosetta.
See the latest entry in EDITING-VALIDATION.md.

## Delivery order

1. **Read-only foundation**: the read path is delivered. The probe remains
   read-only. Connecting needs a loaded career: the app names its human manager
   and club, and refuses at FM's main menu. The save file's name is not read.
   Remaining read checks include advancement, switching saves, disconnect
   recovery and bridge removal.
2. **One validated edit**: finishing passed the copied-career write/readback,
   undo, save, full quit/relaunch and FM reload-inspection sequence. Extend to
   staff, club, contracts and relevant simulation boundaries; see EDITING-VALIDATION.md.
3. **Selected field editor and history**: expand player, staff, club and contract
   fields as their checks pass. Keep unsupported builds disabled.
4. **Bulk workflows**: preview/apply/undo, freezing, cloning, portable templates
   and selected instant squad actions.
5. **Complex systems**: investigate transfers/loans, manager actions, nations,
   competitions, awards, officials, promises and intake as separate workstreams.
   Prioritize with the user and available evidence.
6. **Broader delivery**: verify more platform/storefront/build combinations
   and benchmark larger saves. A new build is checked with
   `scripts/check-build.sh` and the steps in PATCH-VALIDATION.md.

## Validation gates

- Editing evidence includes UI behavior, identity/value checks, readback,
  in-game inspection and persistence after save/reload on a disposable copy.
- Pointer/list changes do not prove a transfer behaves like an in-game move.
  Registration, history, finances and other linked systems must remain correct.
- A rule may display a new value while an instantiated competition still uses a
  cached rule. Test behavior at the relevant match, day or season boundary.
- Memory writes are not an atomic game transaction. Report partial outcomes and
  refuse unsafe undo after intervening changes.

## Performance, compatibility and product claims

| Requested claim | Current evidence / policy |
| --- | --- |
| Launch in 1 second | Not benchmarked |
| Load 550,000 players in under 3 seconds | Not benchmarked; current live evidence covers a 30,314-player career |
| Every Windows and Mac edition | Not established; native Apple Silicon, FM27 Steam build 26340721 is the verified target. Its Intel half was checked under Rosetta on 6 and 7 November: reads, officials, the human manager's flags, work permits and refresh after edits. Its Windows build was checked on 7 November on a test career: reads, the game's own actions through the Windows bridge, and the app's direct edits (attributes, contract, mass edit, clone and templates, freeze money, squad actions, your manager), each undone. FM Lens 0.6.2 is the first Windows download: on 7 November its installer, one copy at a time and a self-update from 0.6.1 to 0.6.2 were checked on Windows Server 2022. Not yet on Windows: promises, refreshing an official's screens after an edit, Game Pass, a save-and-reload test, and Windows 10 and 11 themselves; see docs/internal/WINDOWS-PARITY-HANDOFF.md |
| Updates within hours of patches | Maintenance aspiration, not a guarantee |
| Offline companion | Verified with network denied against an already-running game; fresh Steam Offline Mode startup untested |
| Updating FM Lens while FM stays open | Implemented: use the running helper's capabilities, retain the earlier call protocol, and skip only explicitly unsupported optional refresh calls. Native Mach IPC regression tests pass; a live copied-career update remains unverified. New helper functions become available after the next normal FM launch |
| Free scouting / trials / paid editing | Personal build has no licensing service or paywall; broader pricing/trial policy undecided |

Do not mark a row Available just because upstream contains it or compilation passes.
