# FM Lens feature status and roadmap

Baseline: 4 November 2026. This records the requested FM Live Editor-style scope.
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
| Nations, stadiums, competitions, awards and officials search | Partial: searchable nations represented by players/staff, senior stadiums per club with capacity filters, and match officials (name/UID; macOS arm64 Steam build 26340721 only, from a static in its build profile). Competitions and awards have no fast root yet (finding their pools takes a vtable scan of minutes); see recon/fm27-competitions-awards-officials.md |
| Player attributes, CA/PA, positions, traits, personality | Available to view; Saka's visible values checked against FM, hidden values not independently verified with a second editor |
| Club finances, facilities, stadiums, relations | Partial: mapped balances, budgets, facilities and capacities; broader relations and financial/stadium records absent |
| Contract, wage, clause and transfer-status viewing | Partial; every contract clause and bonus is not covered |
| Pending edits, applied history, conditional undo | Available; one finishing edit, history and undo exercised natively. Pending red/applied green marking, expected-value comparison and build/career guards. Native conflict scenarios remain open |
| Human-manager special actions | Partial: the human manager can be edited where staff fields exist. Unsackable (bit 1 of the manager's flags) is implemented, experimental; apply/undo, stale-value refusal and save/reload persistence tested, on FM27 Steam build 26340721 ARM64 only (see recon/fm27-human-manager.md). Squad registration at any time (bit 8, traced to the game's own `squad_registration_anytime` action) is implemented, experimental; apply/undo, stale-value refusal, FM accepting a registration change outside the window, the flag surviving save/reload and FM keeping such a change through save/quit/reload tested on the same build. Manager relations share the player relation format (checked with a raw read); no reader or editor yet. Club and national-team moves exist only as the game's own action handlers; not feasible as raw writes |
| Player field editing | Partial validation: finishing 15 -> 16 survived save, full quit/relaunch and reload in FM. Enabled for mapped attributes, ability, positions, traits, personality, reputation, nationality, caps, happiness and selected contract values |
| Player registration, work permits, career plans, languages, favourite/disliked clubs and people | Partial: favoured/disliked people and clubs are shown read-only in the player profile ("Likes and dislikes") and by the probe (`scripts/scout preferences`); not yet compared with FM's own screens. Languages (name and level 0-10) are shown read-only for players and staff, macOS layout only. Editing, registration, work permits and career plans remain missing / research |
| Player attribute freeze | Enabled, unverified |
| Staff fields and roles | Partial, unverified: attributes, CA/PA, personality, reputation, contract wage and expiry, job changes and club moves. Coaching licences and preferred formations are not mapped. Likes and dislikes (staff +0x140, the player relation format) and languages are shown read-only, macOS layout only |
| Staff freeze, coaching licences, knowledge, tendencies, preferred formations, relations | Attribute freeze implemented for the current connection; toggle exercised. Long-term holding unverified. Other requested fields remain partial / research |
| Club budgets, facilities and stadium capacity editing | Enabled, unverified for mapped balances, budgets, facilities and capacities |
| Club income, kits, relations, affiliations, ownership, benefactor, staff allowances, vision, supporters, tactical values | Partial / research: supporter values; rivals (club +0x48, strongest first) and affiliated clubs (club +0x118) shown read-only, macOS layout only, probe-checked on Arsenal and Man City. Kits, ownership, vision and allowances not found (recon/fm27-club-extras.md) |
| Youth-intake preview and editing | Missing / research: pre-intake visibility, CA/PA, height, feet and record lifecycle |
| Player promises | Missing / research: viewing, deadlines and removal with related-state checks |
| Injuries and bans | Heal and lift bans are enabled, unverified. Adding and modifying records is not mapped |
| Nations and national teams | Partial, read-only, macOS layout only: code, continent, capital, population, dual nationality, years to naturalise, languages with share, FIFA ranking and points, founding and FIFA years, rivals, and the men's national teams (senior and youth: reputation, manager, captain, vice-captain, squad). Probe-checked on England, Argentina, Italy, France. Women's teams (a second container), FA settings, youth rating, attendance, kits, tactics, transfer preferences and editing remain research (recon/fm27-nations.md) |
| Competitions | Missing / research: rules, level, substitutes, VAR, goal-line technology and season-instantiated/cached behavior |
| Awards and officials | Partial: officials list and profile, read-only (name, nation, born, CA/PA, reputation; macOS arm64 Steam build 26340721). Referee attributes (8 bytes at +0x40) unlabelled. Awards need a pool root; rules and eligibility undecoded |
| Complete contracts | Partial, unverified: wage, dates, squad number, loyalty bonus, listing flags, and release-clause amount changes that the editor already supports. Landmark, award, wage-rise, sell-on, seasonal and loan clauses are not fully mapped |
| Player transfers, swaps, releases and staff moves | Enabled in the editor, restricted and unverified. No proof of complete history, career, registration, training, finance or contract consistency |
| Loans, free-agent signing, future-transfer cancellation, instalments and buy-backs | Missing / research |
| Instant squad actions | Heal, lift bans, inspire, fitness/sharpness refresh, max attributes and setting all of one player's attributes to a value from 1 to 20 (injury proneness and dirtiness get 21 minus it) are enabled, unverified |
| Cohesion and tactical familiarity | Partial, experimental: Max cohesion raises each player's existing familiarity with his club to 100 (never adds an entry), logged with batch undo, macOS layout only. Checked in FM: Arsenal's Team Cohesion went from Very Good to Excellent after one Continue, and all three teams' values survived save, quit and reload. FM lowers them again as days pass, and an undo after that is refused. Tactical familiarity (player +0xF8) has unknown keys; not editable |
| Bulk edit preview/apply/undo | Available; template path exercised with one target/one change and undo. Multi-target persistence still unverified |
| Clone a player profile onto other players | Implemented with selectable groups, filtered targets, optional UID restriction and preview. Live capture of 142 fields exercised; multi-target clone persistence unverified |
| Reusable player templates | Available: versioned JSON, local library, import/export, destination validation, preview/apply/undo. One-field native batch and invalid-field rejection exercised; cross-save/build testing open |
| Fast field interaction / dragging | Enabled, unverified for mapped fields. A displayed mapped value opens its focused input on click or Enter/Space, then uses the usual review/apply/undo path; mouse/keyboard activation, focus, pending guard, apply and undo exercised natively |
| Remembered navigation, searches and profile selection | Available foundation; exercise tab/reload scenarios |
| Light/dark appearance | Available: System, Light and Dark selector with local persistence; native light/dark check performed. FM-inspired refinement (see FM-LENS-INTERFACE.md) has native light/dark checks at 125/150% zoom, including native confirmation of the filter overflow fix |
| Currency selector | Available; broader locale checks remain |
| Dedicated UI zoom selector | Implemented: 80, 90, 100, 110, 125 and 150 percent; native scaling/viewport regression checks required |
| Keyboard navigation | Available: ⌘1-⌘7 sections, ⌘F search, arrow keys in lists, Enter/Space opens, Escape closes, ⌘S applies edits (see DESIGN-STANDARDS.md) |
| Guided first-run tour | Partial: skippable introduction to navigation, search, settings and the editing boundary; no guided editing exercise |

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
6. **Broader delivery**: verify more platform/storefront/build combinations,
   benchmark larger saves and establish a patch-validation process.

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
| Every Windows and Mac edition | Not established; native Apple Silicon, FM27 Steam build 26340721 is the verified target |
| Updates within hours of patches | Maintenance aspiration, not a guarantee |
| Offline companion | Verified with network denied against an already-running game; fresh Steam Offline Mode startup untested |
| Free scouting / trials / paid editing | Personal build has no licensing service or paywall; broader pricing/trial policy undecided |

Do not mark a row Available just because upstream contains it or compilation passes.
