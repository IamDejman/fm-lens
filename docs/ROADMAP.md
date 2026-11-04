# FM Lens feature status and roadmap

Baseline: 4 November 2026. This records the requested FM Live Editor-style scope.
It is not a claim that all features are implemented or achievable without
further data-layout and game-behavior research.

## Status meanings

- **Available**: present in the read-only app; live verification is narrower than
  complete coverage. See PERSONAL-SCOUT.md.
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
| Staff and club filters | Available for fields already on the list rows: staff job, unemployment, attributes, age, nation, club and CA/PA; clubs by men's or women's teams, reputation and founded year |
| Nations, stadiums, competitions, awards and officials search | Partial: a nations list (people in the save) and a stadium list (each club's senior team, same fields as the club profile). Competitions, awards and officials are still unmapped |
| Player attributes, CA/PA, positions, traits, personality | Available to view; Saka's visible values checked against FM, hidden values not independently verified with a second editor |
| Club finances, facilities, stadiums, relations | Partial: mapped balances, budgets, facilities and capacities; broader relations and financial/stadium records absent |
| Contract, wage, clause and transfer-status viewing | Partial; every contract clause and bonus is not covered |
| Pending edits, applied history, conditional undo | Foundation only; restore workflow and validate conflicts, partial failure and save/reload persistence |
| Human-manager special actions | Missing / research: unsackable status, unrestricted registration, relations, club/national-team moves |
| Player field editing | Foundation only: mapped attributes, ability, positions, traits, personality, reputation, nationality, caps and selected contract/live values |
| Player registration, work permits, career plans, languages, favourite/disliked clubs and people | Missing / research: fields and dependent records need mapping |
| Player attribute freeze | Foundation only; repeated writes, session lifecycle, save identity and patch behavior need validation |
| Staff fields and roles | Foundation only: selected attributes, CA/PA, personality, reputation, contracts, job changes and moves |
| Staff freeze, coaching licences, knowledge, tendencies, preferred formations, relations | Missing / research |
| Club budgets, facilities and stadium capacity editing | Foundation only; selected fields need persistence testing |
| Club income, kits, relations, affiliations, ownership, benefactor, staff allowances, vision, supporters, tactical values | Partial / research: some supporter values can be read; full requested editing coverage absent |
| Youth-intake preview and editing | Missing / research: pre-intake visibility, CA/PA, height, feet and record lifecycle |
| Player promises | Missing / research: viewing, deadlines and removal with related-state checks |
| Injuries and bans | Foundation only for healing/removal; adding and modifying records needs more work |
| Nations and national teams | Missing / research: nationality rules, dual nationality, reputation, ranking, FA settings, youth rating, attendance, languages, rivalries, kits, tactics, transfer preferences, squad actions and caps consistency, including men's/women's teams |
| Competitions | Missing / research: rules, level, substitutes, VAR, goal-line technology and season-instantiated/cached behavior |
| Awards and officials | Missing / research: award rules, eligibility and referee details |
| Complete contracts | Missing / research beyond partial support: release, landmark, award, wage-rise, sell-on, loyalty, seasonal and loan clauses/bonuses |
| Player transfers, swaps, releases and staff moves | Foundation only, restricted; no proof of complete history, career, registration, training, finance or contract consistency |
| Loans, free-agent signing, future-transfer cancellation, instalments and buy-backs | Missing / research |
| Instant squad actions | Foundation only: heal, lift bans, inspire/morale, fitness/sharpness refresh and max attributes |
| Cohesion and tactical familiarity | Missing / research |
| Bulk edit preview/apply/undo | Foundation only; verify bounded batches, skipped fields, conflicts, interruption and save identity |
| Clone a player profile onto other players | Missing: attributes, CA/PA, personality, hidden attributes, positions and traits with explicit selection and preview |
| Reusable player templates | Missing: versioned, portable and validated across saves/builds |
| Fast field interaction / dragging | Partial: read-only values exist; editing interaction needs restoration and verification |
| Remembered navigation, searches and profile selection | Available foundation; exercise tab/reload scenarios |
| Light/dark appearance | Available: system, light or dark, remembered on this computer |
| Currency selector | Available; broader locale checks remain |
| Dedicated UI zoom selector | Available: 80% to 150%, separate from the window, remembered on this computer |
| Guided first-run tour | Partial: a short introduction to the read-only screens, shown once. An editing introduction waits until one edit has been validated on a disposable career |

## Delivery order

1. **Read-only foundation**: delivered locally. Retain write refusal and exact
   build evidence. Remaining checks include advancement, switching saves,
   disconnect recovery and bridge removal.
2. **One validated edit**: use a separate career copy, whitelist one field, show
   before/after, check current state, apply, read back, conditional undo, inspect
   in FM, then save/quit/reload and inspect again.
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
