# Remaining FM27 editor research and implementation plan

6 November 2026. Scope: the requested player, staff, club, nation, official, youth and transfer gaps.

## Evidence and limits

Directly inspected the installed Steam app manifest (build 26340721), game_plugin Mach-O UUIDs
(ARM64 F4540355-2186-39CB-9119-C706A6A35346; Intel 0981AB31-AC3B-3D93-944F-47FE4B59CD9E),
ARM64 disassembly and the installed example.ltf language resource. FM was closed: no new live
memory reads, UI comparisons, mutations, simulation or persistence checks were performed.
Prior local recon supplies leads, explicitly distinguished below from this pass's checks.
Diagnostics and extracted binary/resources are local under ignored reports/research-2026-11-06/.
No game files, launch options or saves were changed.

Fresh checks:

- Registration query RVA 0xD56498 gets team context through team+0x30, chooses an offset using
  team+0x2F, obtains a nation-related context and calls 0xD32054. This is a query chain, not a
  located registration setter. Do not treat a successful eligibility query as actual registration.
- Career-plan reference 0xE33DDC lies in pool setup: the allocator receives element size 0x10.
  It does not identify a person's owning list or a mutation API.
- National-job handler 0x33CCEC reads Ttea, Pnjo and dreL keys, constructs a 0x28-byte object
  through 0x22964C0, checks 0x2296E5C and calls 0x266B254 / 0x266B448. This supplies a concrete
  offer/interaction path to trace; it is not proof of a direct human-manager appointment API.
- Officials getters at 0xCF6154 onward read signed bytes at +0x40..+0x47. Names remain unproved.
- example.ltf contains explicitly commented staff-tendency labels (22 matched entries), career-plan
  descriptions, ownership labels and club-vision labels. Labels alone do not map an enum or field.
- Goal-line technology occurs in match-report language strings (for example KEY-457319).
  Earlier recon found no competition-rule key in the plugin. This pass does not establish a rule;
  it also does not justify claiming goal-line technology is absent from FM entirely.

## Work packages

| Order | Package | Investigation and implementation | Acceptance gate |
| --- | --- | --- | --- |
| 1 | Add favoured/disliked club or person | Trace the relation creator/setter and metadata defaults for codes 1–4. Reuse stable target resolution and guarded list operations, not nationality metadata. First support a list with proven spare capacity; fail closed on full/missing lists unless a game-owned insertion route is established. Include duplicate/conflicting-entry handling. | Player and staff cases; empty/full lists; add, undo, stale refusal; FM visibility after Continue; save/quit/reload. |
| 1 | Add a language | Trace creation/destruction of the 16-byte language link and the game's vector insertion. Enumerate valid language records. Use the game's allocator/main-thread operation; do not allocate using the companion's heap. Detect an already-spoken or derived native language and local-language normalization. | Empty/nonempty/full lists; duplicate refusal; player, staff and manager; add/undo; several days; save/quit/reload. |
| 1 | Staff tendency names | Follow NON_PLAYER_TENDENCY_TEMPLATE and the NT01..NT99/N100 accessors from staff+0xA8. Join keys to FM localization calls; validate with staff having contrasting tendencies. Do not infer names from vector order or attribute correlations. Show read-only named values first, then edit only mapped codes/defaults. | At least three contrasting staff profiles; template default 10 versus explicit entries; correct labels and threshold behavior; guarded edit/undo and persistence before enabling writes. |
| 1 | Referee attribute names | Trace consumers of the eight signed-byte getters and their localization/UI bindings. Separately investigate the seven bytes at +0x11A; do not combine them into an invented attribute list. Use match-official screens or the installed official editor if available. | Two or more officials with different values and independently matched labels; no labels based on distributions alone. Then edit/undo, match-day behavior and persistence. |
| 2 | Scouting knowledge | Locate the staff-owned KNOWLEDGE / KNOWLEDGE_ARRAY container by following country-knowledge UI getters. Distinguish personal country/region knowledge from club aggregates and player fog-of-war. Reader first, then setters with provenance/decay rules. | Two scouts with different known countries; employment and day advancement; establish whether knowledge is derived or stored, then edit and reload. |
| 2 | Career plans | Follow CAREER_PLAN allocation callers, person getter/rendering and serialization to find holder, target kinds, dates and lifecycle. Start with viewing and editing/removing existing plans. Add only after constructor and ownership are established. Keep retirement as a separate operation. | Club/nation/competition/job-target plans, positive/negative preferences; related agreement checks; expiry, simulation and persistence. |
| 2 | Player registration | Continue from 0xD32054 and 0x1F9CCEC; trace FM's actual registration submission handler and its player/team/competition/season record. Display each competition separately. Preserve homegrown/exemption/eligibility distinctions. Prefer the game submission path. | Domestic and continental competitions; in/out of window; exemption and squad limits; FM accepts a submitted squad and permits the player in a relevant match; season rollover and reload. |
| 3 | Club and nation kits | Follow kit property codes such as 1sbc/1scl through virtual slot 0x140 to kit records and setters. Establish season, team gender, home/away/third, component, style and colour encoding. Share the decoded kit model across clubs/nations. | Two clubs and men's/women's national teams; rendered kits after refresh/reload and a match; identify licensed/custom-art overrides separately. |
| 3 | Ownership and benefactor | Prior recon places Cown at club-info+0x129; confirm its getter/setter and enum against differently owned clubs. Trace benefactor separately, including ongoing funding and starting-finance flags. Ownership type is not an owner-person replacement. | Private/member-owned/public examples; enum labels; board/finance consistency; funding behavior over relevant periods and reload. |
| 3 | Staff allowances | Trace board-approved staff-limit UI and request handlers by role/team. Determine whether values are stored limits, derived recommendations or current staff counts. Reader first. | Coaches/scouts/medical staff; senior/youth teams; hiring above old limit; board changes and reload. |
| 3 | Club vision | Trace live board vision/expectation records, not only pregame-editor strings. Establish objectives, priority, deadlines, progress and board assessment. Start with existing objective edits, not synthetic insertion. | FM board screen, next assessment, deadline/season rollover and save/reload; no orphaned objectives. |
| 3 | Income | Separate historical accounting totals from recurring sponsorship/TV/commercial agreements and projections. Label finance getter rows against FM; trace agreement setters/payment scheduling for actual income edits. | Monthly/season totals reconcile; correct payer/payee and dates; a scheduled payment posts once, with matching balance and ledger after reload. |
| 4 | National tactics and transfer preferences | Map the container's Ndep..Nwid fields by getter/setter semantics and labels; distinguish national style preferences from a national manager's active tactic. Follow Neu*/NHP*/NHR*/NME* computed helpers to backing preference lists and defaults. | Two contrasting nations, both men's/women's containers; exact target/weight semantics; relevant AI selection or recruitment behavior over time, plus persistence. |
| 4 | Human manager to national team | Trace 0x33CCEC's offer object and the IGE national path 0x238CAC8 down to a shared appointment primitive. Establish separate club/nation contracts, human-control registration, displaced manager and job events. Do not fabricate an IGE object or write manager pointers. | Unemployed, club-employed and already national-employed human; club job retained where intended; national selection/control, next international window and reload. Treat return to former job as a new action, not exact undo. |
| 5 | Youth intake | Follow REGENERATION_MANAGER intake constructor, youth-trial contracts and report lifecycle immediately before/on/after intake. Establish whether candidates exist before intake; templates are not candidates. Expose an existing cohort read-only first, then mapped player edits after materialization. | Pre-intake, intake, unsigned trialist, signed and released states; CA/PA/height/feet map to actual candidates; report and roster agree; save/reload. If no pre-intake cohort exists, explicitly limit preview to generated players. |
| 5 | Instalments and buy-backs | Read existing transfer-manager instalment schedules and PLAYER_BUY_BACK_INFO first. Establish payer/payee, remaining count, period, dates and price. Trace pending-offer setters and execution; current immediate-transfer map cannot express instalments. Add existing-term edits before creation if a supported setter exists. | Completed and pending deals; payment dates, counts and both clubs' ledgers; buy-back active/expired and exercise behavior; no double payment; reload. |
| 6 | Undo Cancel transfer | Trace re-creation and acceptance of a pending offer with all contract, fee, clause, budget-commitment, dated-record and reference state. Capture a semantic snapshot before cancellation, never restore old pointers. Revalidate all parties/day/budgets and refuse if anything material changed. | Free-agent, club-to-club and loan agreements; identical terms and budget commitments; arrival on agreed day; save/reload. News/interaction side effects may prevent exact undo: if so, keep Cancel irreversible and provide a separate explicit Recreate deal action only where supported. |
| Deferred | Goal-line technology | No standalone control until an actual FM-owned editable setting is found. Search match/fixture/stadium technology consumers if continuing research; absence from the competition rule schema is not proof of absence everywhere. | A real backing setting, its consumer and an observable match effect. Otherwise record unsupported, with no placeholder toggle. |

## Delivery sequence and shared guardrails

1. Finish names and list creation: likes, languages, tendencies and referee attributes.
2. Establish readers and owners for knowledge, plans and registration; implement only proved mutations.
3. Build shared kits and club ownership/finance models, then allowances and vision.
4. Trace nation preferences and the human national-job appointment primitive.
5. Handle lifecycle systems: intake and financial transfer terms; cancellation reversal last.

These are evidence-gated work packages, not delivery-time estimates. Begin on ARM64 build 26340721;
map/test Intel independently before claiming editing support there. Each package produces a recon note,
reader/health checks, bounded implementation, native validation and updated roadmap/field catalog.
Use a named disposable career, baseline values and a before/after main-career hash. No main-career
experiments. Mutation and undo must retain build, career, entity and expected-value guards. Calls that
allocate or change structural records run through the guarded bridge on FM's main thread. Readback
alone is not acceptance: inspect FM, advance at the relevant boundary, save, quit, reload and inspect again.
Do not promise exact undo for actions with irreversible news, job or accounting side effects.

## Prior local leads used

- fm27-player-extras.md; fm27-person-extras.md; fm27-staff-extras.md
- fm27-nations-clubs-2.md; fm27-club-extras.md
- fm27-manager-moves.md; fm27-competitions-awards-2.md
- fm27-future-transfers.md; fm27-transfer-terms.md
- Current languages.rs, relations.rs and game_calls.rs implementations

Older recon contains tentative labels and assertions that a plain write is safe. Those statements
are leads, not acceptance evidence; the gates above take precedence.
