# FM Lens feature status and roadmap

Baseline: 4 November 2026, updated 6 November 2026 to PR #44. This records the
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

## Feature matrix

| Requested feature | Current status and remaining scope |
| --- | --- |
| Live player, staff and club search | Available; broaden behavioral and scale checks |
| Advanced player search | Available: age, CA/PA, position, nationality, club, attributes, contract expiry, free agents, transfer/loan listing; extend against mapped fields |
| Staff and club filters | Available for decoded values: staff job, unemployment, human managers only, age, nation, club, CA/PA and attributes; club gender, reputation and founded year |
| Nations, stadiums, competitions, awards and officials search | Available: searchable nations represented by players/staff, senior stadiums per club with capacity filters, match officials (name/UID; Steam build 26340721, macOS arm64 and Intel, from a static in its build profile), and Competitions and Awards sections (#21) read through the game's own database tables: 8,084 competitions and 3,902 awards, about 0.1 s each, checked on macOS arm64 |
| Player attributes, CA/PA, positions, traits, personality | Available to view; Saka's visible values checked against FM, hidden values not independently verified with a second editor |
| Club finances, facilities, stadiums, relations | Partial: mapped balances, budgets, facilities and capacities; broader relations and financial/stadium records absent |
| Contract, wage, clause and transfer-status viewing | Partial; every contract clause and bonus is not covered |
| Pending edits, applied history, conditional undo | Available; one finishing edit, history and undo exercised natively. Pending red/applied green marking, expected-value comparison and build/career guards. The Changes list survives Reload and FM restarts (#44): changes to a game FM has since closed or loaded a save into stay listed as "Earlier game", without Undo; not yet checked in FM. Native conflict scenarios remain open |
| Human-manager special actions | Partial: the human manager can be edited where staff fields exist. Unsackable (bit 1 of the manager's flags) is implemented, experimental; apply/undo, stale-value refusal and save/reload persistence tested, on FM27 Steam build 26340721 ARM64; the Intel half reads the same flags in a running game under Rosetta (6 November), writes not tried there (see recon/fm27-human-manager.md). Squad registration at any time (bit 8, traced to the game's own `squad_registration_anytime` action) is implemented, experimental; apply/undo, stale-value refusal, FM accepting a registration change outside the window, the flag surviving save/reload and FM keeping such a change through save/quit/reload tested on the same build. Manager relations share the player relation format (checked with a raw read); no reader or editor yet. Club and national-team moves exist only as the game's own action handlers; not feasible as raw writes |
| Player field editing | Partial validation: finishing 15 -> 16 survived save, full quit/relaunch and reload in FM. Enabled for mapped attributes, ability, positions, traits, personality, reputation, nationality, caps, happiness and selected contract values |
| Player registration, work permits, career plans, languages, favourite/disliked clubs and people | Partial. Work permits: shown (#20), granted and revoked through the game's own calls (#22, #23, #39), on arm64 and Intel (#41); grant, revoke and undo checked in FM, which shows the change after a day, and only for your own club's players. Undoing a revoke gives an ESC slot back with its first date (#42). Secondary nationalities and homegrown ties can be changed, added and removed; cancelling a planned retirement ("Keep playing") swaps "Will retire at top" for "Will play football as long as possible": both enabled, unverified. Languages (name and level in FM's words, checked against FM on six players) are shown, macOS layout only; a level (1 to 10) can be changed and a language removed, logged and undoable: enabled, unverified. Favoured/disliked people and clubs (not yet compared with FM's screens) are shown, macOS layout only; a strength (1 to 100) can be changed and an entry removed, logged and undoable: enabled, unverified. Registration, other career plans, adding a language and adding or re-pointing likes remain missing / research |
| Player attribute freeze | Enabled, unverified |
| Staff fields and roles | Partial. Checked in FM: contract wage and a Tactical change survived save, quit and reload. Unverified: other attributes, CA/PA, personality, reputation, contract expiry, job changes and club moves. The coaching licence is editable (#17), its levels named as FM's Coaching tab names them (#35); an edit not yet checked in FM. Preferred formations are not mapped. Likes and dislikes (staff +0x140, the player relation format) and languages are shown, with the same strength, level and removal edits as for players (unverified), macOS layout only |
| Staff freeze, coaching licences, knowledge, tendencies, preferred formations, relations | Attribute freeze implemented for the current connection; toggle exercised. Long-term holding unverified. Coaching licence editable (see above). Knowledge, tendencies, preferred formations and relations remain research |
| Club budgets, facilities and stadium capacity editing | Enabled. Checked in FM: transfer budget and youth recruitment survived save, quit and reload. Unverified: other balances, budgets, facilities and capacities |
| Club income, kits, relations, affiliations, ownership, benefactor, staff allowances, vision, supporters, tactical values | Partial / research: supporter values; rivals (club +0x48, strongest first) and affiliated clubs (club +0x118) shown read-only, macOS layout only, probe-checked on Arsenal and Man City. Kits, ownership, vision and allowances not found (recon/fm27-club-extras.md) |
| Youth-intake preview and editing | Missing / research: pre-intake visibility, CA/PA, height, feet and record lifecycle |
| Player promises | Partial, macOS layout only, unverified. The profile lists the promises made to a player, by FM's number for each (its names are in FM's language files), with when each was made and is due or ended. An open one can be closed: it ends today without being held against him, and FM drops it 31 days later; undone from Changes. Not yet compared with FM's screens. Making, editing and naming promises remain research |
| Injuries and bans | Add an injury through the game's own call (#22, #23): checked in FM, whose Medical screen showed it at once; undone by healing it, after which FM showed no injury. Lifting bans is enabled, unverified. Changing an existing record (length, kind) is not mapped |
| Nations and national teams | Partial, macOS layout only. Read: code, continent, capital, population, dual nationality, years to naturalise, languages with share, FIFA ranking and points, founding, FIFA and confederation years, rivals, and the men's and women's national teams (senior and youth: reputation, manager, captain, vice-captain, squad) and youth ratings (#16). Probe-checked on England, Argentina, Italy, France; England's years and both reputations matched FM. Editing, guarded, one nation at a time: the men's and women's senior reputations, youth ratings, game importance (0 to 4) and attendance (0 to 16), men's FIFA points (0.00 to 3,000.00; FM ranks by them at its next ranking date), population, dual nationality and years to naturalise (1 to 99, or never). Apply, undo and save/quit/reload persistence tested on England for the men's reputation, population and both rules, with population and reputation shown by FM after the reload (docs/EDITING-VALIDATION.md); the women's reputation, youth ratings, FIFA points, game importance and attendance not yet checked in FM. Behind a nations health check covering both sides. FA settings, national style ratings, kits, tactics and transfer preferences remain research (recon/fm27-nations.md) |
| Competitions | Partial, read-only (#21): name, short name, nation, continent, reputation and women's tag; the Premier League checked against FM. Editing rules, level, substitutes, VAR and goal-line technology, and season-instantiated/cached behavior, remain missing / research |
| Awards and officials | Partial. Awards read-only (#21, #34): competition, nation, continent, prestige, period, given to, goalkeepers only, age limit and women's tag; the World Golden Ball checked against FM. Rules and eligibility editing undecoded. Officials list and profile (name, nation, born, CA/PA, reputation; Steam build 26340721, macOS arm64 and Intel), with CA/PA, reputation and birth date editable one official at a time (#29); an edit read back after Continue, but FM's search has no officials to compare with. Referee attributes (8 bytes at +0x40) unlabelled |
| Complete contracts | Partial. Checked in FM: a player's expiry date and a staff wage survived save, quit and reload. A player's wage change survived reload; FM's weekly GBP formatter rounds £310,000 to £300K (see validation notes). Payroll deductions remain unverified. Unverified: other dates, squad number, loyalty bonus and listing flags. Every clause kind is named as FM's contract screen names it (#18, #38). A clause's amount and condition can be changed, a clause removed, and a release clause added where the contract's list has room: enabled, unverified. Adding other clauses, and bonuses beyond the loyalty bonus, are not covered. FM shows a contract's clauses and bonuses only for players it has scouted |
| Player transfers, swaps, releases and staff moves | Enabled in the editor, restricted and unverified. No proof of complete history, career, registration, training, finance or contract consistency |
| Loans, free-agent signing, future-transfer cancellation, instalments and buy-backs | Partial, through the game's own calls: start a loan from the Transfer dialog (#24), end a loan early (#26), sign a free agent now (#25) or on a later day (#28); a loan's wage share and end date are editable (#19). Checked in FM: loan terms against Squad > Loans, a started loan and its undo, a signing with terms, a scheduled signing taking effect and a cancelled one leaving no badge, End loan without a future fee and its undo (#33). End loan is refused on a loan with a future fee (#30), since the game would complete the transfer. FM's transfer history keeps a line for each loan started, even after undo. A player's profile lists every move FM agreed for a later day (club to club, a signing or a loan), and Cancel transfer has the game cancel them as its own editor does, with no undo; unverified in FM (docs/EDITING-VALIDATION.md). Instalments and buy-backs remain research (recon/fm27-future-transfers.md) |
| Instant squad actions | Heal, lift bans, inspire, fitness/sharpness refresh, max attributes and setting all of one player's attributes to a value from 1 to 20 (injury proneness and dirtiness get 21 minus it) are enabled, unverified |
| Cohesion and tactical familiarity | Partial, experimental: Max cohesion raises each player's existing familiarity with his club to 100 (never adds an entry), logged with batch undo, macOS layout only. Checked in FM: Arsenal's Team Cohesion went from Very Good to Excellent after one Continue, and all three teams' values survived save, quit and reload. FM lowers them again as days pass, and an undo after that is refused. Max tactics (#32) has the game's own editor action raise a team's tactical familiarity, logged with batch undo that writes the old entries back exactly. Checked in FM on Tottenham and Arsenal: Arsenal's values survived save, quit and reload, and FM's Tactical Effectiveness pies were full (tactic 1 only after the reload). For a human manager's team FM also updates what the manager knows of his players, which undo leaves. Single familiarity entries (player +0xF8) are not editable by value |
| Bulk edit preview/apply/undo | Available; template path exercised with one target/one change and undo. Multi-target persistence still unverified |
| Clone a player profile onto other players | Implemented with selectable groups, filtered targets, optional UID restriction and preview. Live capture of 142 fields exercised; multi-target clone persistence unverified |
| Reusable player templates | Available: versioned JSON, local library, import/export, destination validation, preview/apply/undo. One-field native batch and invalid-field rejection exercised; cross-save/build testing open |
| Fast field interaction / dragging | Enabled, unverified for mapped fields. A displayed mapped value opens its focused input on click or Enter/Space, then uses the usual review/apply/undo path; mouse/keyboard activation, focus, pending guard, apply and undo exercised natively |
| Remembered navigation, searches and profile selection | Available foundation; exercise tab/reload scenarios |
| Light/dark appearance | Available: System, Light and Dark selector with local persistence; native light/dark check performed. FM-inspired refinement (see FM-LENS-INTERFACE.md) has native light/dark checks at 125/150% zoom, including native confirmation of the filter overflow fix |
| Currency selector | Available; broader locale checks remain |
| Dedicated UI zoom selector | Implemented: 80, 90, 100, 110, 125 and 150 percent; native scaling/viewport regression checks required |
| Keyboard navigation | Available: ⌘1-⌘9 sections, ⌘F search, arrow keys in lists, Enter/Space opens, Escape closes, ⌘S applies edits (see DESIGN-STANDARDS.md) |
| Guided first-run tour | Delivered: skippable introduction to navigation, search, settings and the editing boundary, then, once the game can be edited, a guided first edit (open, Edit, change, Apply, Changes) that follows what the user does |

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
| Every Windows and Mac edition | Not established; native Apple Silicon, FM27 Steam build 26340721 is the verified target. Its Intel half was checked under Rosetta on 6 November: reads, officials, the human manager's flags and work permits |
| Updates within hours of patches | Maintenance aspiration, not a guarantee |
| Offline companion | Verified with network denied against an already-running game; fresh Steam Offline Mode startup untested |
| Free scouting / trials / paid editing | Personal build has no licensing service or paywall; broader pricing/trial policy undecided |

Do not mark a row Available just because upstream contains it or compilation passes.
