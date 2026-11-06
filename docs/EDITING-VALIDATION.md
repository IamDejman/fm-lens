# FM Lens editing validation

Date: 4 November 2026. Target: FM27 Steam build 26340721, native ARM64,
module UUID `F4540355-2186-39CB-9119-C706A6A35346`.

This is a bounded test record, not certification of every mapped field or the
full requested editor. Source definitions are listed in [EDITOR-FIELDS.md](EDITOR-FIELDS.md).
Unimplemented and unverified features remain in [ROADMAP.md](ROADMAP.md).

## Copied-career edit and persistence

1. Copied the existing career to a separately named validation file. Kept the
   original file's SHA-256 locally under ignored `reports/`.
2. Loaded the validation copy in FM. Connected the native FM Lens desktop app;
   the browser indexed 30,314 players, 20,217 staff and 21,675 clubs.
3. Selected Bukayo Saka, UID 28122642. Baseline finishing was 15 in FM and 73 on
   FM's stored attribute scale. Other visible profile values matched FM.
4. Changed finishing to 16. The native input showed its pending red border;
   Apply reported one applied change. The separately compiled read-only probe
   read finishing 80, displayed as 16.
5. Used FM's Save Game As to create a new edited validation file with that value.
   Save completed successfully. The main career was not overwritten.
6. Opened Changes in FM Lens and undid the edit. History marked the change
   undone; the undo restored the original stored value. This undo was deliberately
   **not saved**, so the edited validation file retained finishing 16.
7. Quit FM completely and confirmed the process exited. Relaunched through
   Steam, opened Load Game and explicitly selected the edited validation file.
8. FM's reloaded Saka profile displayed **Finishing 16**. This establishes saved
   persistence of that one mapped attribute through a full process restart.
9. Advanced the copied career from 11:00 to 17:30 on 8 December 2027. Further
   multi-day, training, match and season-boundary checks remain open. The
   read-only probe still reported finishing 16 after advancement; a second
   post-advancement inspection in FM was not completed.

FM cached its profile display before the restart; simply navigating away and
back did not immediately reflect the live write. Do not infer a bad layout from
a cached display, or claim correctness from memory readback alone.

## Clone and portable templates

Exercised in the native app on the reloaded validation copy:

- Searched by UID, selected Saka and captured all five groups: 142 portable
  fields across CA/PA, attributes, personality, positions and traits.
- Saved the template in the local library.
- Imported a version-1 JSON template containing only finishing 73. Preview
  showed one player and one change, **16 -> 15**, with zero skipped fields.
- Applied the preview; the app reported one applied change. Undo batch reported
  one undone change, restoring 16. No main-career mutation was involved.
- Attempted to import `contract.wage`; the backend rejected it as an unsupported
  template field. Core tests also reject identity, nationality, unknown fields,
  invalid ranges, unsupported versions and empty templates.

This exercises a one-player batch. Multiple-target cloning, transfer between
different careers/builds, file-picker import and a full-squad persistence test
remain unverified. Templates are revalidated against each destination layout.

## Other checks and limits

- Staff attribute freeze could be enabled and disabled for Pep Guardiola in the
  native profile. It was left disabled. This verifies the control and command;
  natural attribute decline, long-term holding and restart behavior were not
  tested. Staff freezes are connection-local.
- Light and dark appearance rendered in the native app. A 125% zoom check found
  viewport/anchor scaling errors; layout coordinates and viewport heights were
  corrected. The rebuilt app was checked again at 125%: the footer stayed
  visible and Settings was anchored correctly within the window. Restored
  System appearance and 100% afterward.
- Full read-only field scans covered all searchable player, staff and club
  records. Eighteen players had sharpness below the inherited 35% lower bound;
  the mapped percentage now allows 0–100%. Some clubs use 255 in youth facility
  fields; its meaning remains unverified and those values remain guarded.
- The retirement class lookup incorporates upstream fix `b7a7cc5` for large Mac
  saves. Retirement mutations themselves have not been tested in FM.
- Known-build and career-storage checks apply to ordinary writes and undo.
  Single edits, bulk edits and undo compare expected/current values. They are
  not atomic game transactions. A career reload creates a fresh Session and
  discards unsafe cached history/previews.
- Repeated a bounded edit on the final build after advancement: finishing
  16 -> 17, one change applied, green readback border visible, Changes undo
  marked it undone, and the read-only probe confirmed finishing 16 again.
- The main career SHA-256 matched its baseline after the tests.
- No claim was made here for complete transfers, full contract clauses,
  promises, youth intake, nations, competitions, awards, officials or special
  manager actions. Later sections record read-only nation profiles and
  officials, squad registration at any time and Max cohesion; the rest still
  need Mac layouts and linked simulation checks.

## Reproducing checks

Use the commands in [AGENTS.md](../AGENTS.md). The frontend build, Rust formatting,
workspace tests, strict workspace/app Clippy checks and separate writable-memory
tests were run during implementation. The native bundle was built through Tauri
and signed ad hoc. Local logs and private diagnostic outputs stay in ignored
`reports/`; game saves and memory reports are not repository artifacts.

For isolated editor state, launch the development bundle with `FMLIBRE_DATA`
and `FMLIBRE_EXPORTS` pointing to local directories under `reports/`. This keeps
test freezes and exports separate from ordinary app state.

Next validation priorities: stale-draft/undo conflict in the native app, career
switch while connected, multi-target templates, payroll after a player wage edit,
structural operations, and a fresh Steam Offline Mode launch.

## Integrated roadmap PR

Integrated the work from repository PR #1, preserving its commits. Kept the
validated appearance/zoom implementation, corrected the tour's obsolete
read-only claim, restored the missing Rust SearchIndex import, and deferred
hidden-list reads so stadium indexing does not delay the first player search.

Native checks on the same validation career demonstrated:

- First-run introduction displayed the editing boundary; Next and Skip worked.
- Nations: 227 represented nations; searching England returned UID 765 and its
  read-only profile. This is not nation-rule or national-team editing.
- Stadiums: 19,234 entries per club. Arsenal search returned 12 entries; a
  60,000 minimum-capacity filter reduced it to the two Emirates Stadium entries,
  each showing 60,704 capacity. Shared stadiums are repeated by club.
- Staff: employer Arsenal returned 90 staff; combining it with minimum CA 160
  reduced the result to 3. Club reputation/founded filters compiled and have
  core coverage, but were not separately exercised in the native UI.

The integrated code passed the frontend production build, formatting, strict
workspace/app Clippy checks, all workspace tests (61 core tests), separate
writable-memory tests, the diagnostic/bridge build and the Tauri app build.
Small copy issues remain in new list summaries (for example “1 nations”); broad
translation and zoom checks across all new screens remain open. The underlying
editing/save/reload evidence above remains narrower than complete field coverage.

## Favoured and disliked people and clubs (read-only)

`scripts/scout preferences [UID]` reads these from the same relation list as
secondary nationalities and homegrown ties: to a person, relation 1 is favoured
and 2 disliked; to a club, 3 is favoured and 4 disliked. Byte `0x0C` holds a
signed strength. Nothing is written and the app does not show them yet.

On the validation career (known Mac build) a scan of every loaded player found
20,805 favoured and 5,298 disliked people, 13,574 favoured and 1,454 disliked
clubs. Every target resolved to a loaded player, staff member or club. Strengths
ran 1 to 100 except one entry: Diego Valoyes (UID 76042820) favours Talleres at
-35 and dislikes it at 35; only that favoured entry has `0x02` in byte `0x08`.
Examples matched real-world ties (Jere Uronen favours Hrádecký and Pukki; Diego
Reyes favours Raúl Jiménez), but no player's lists were compared with FM's own
screens. Do that before showing them in the app, and establish what the
negative strength and byte `0x08` mean before any editing.

## Human manager: unsackable flag (experimental, persistence tested)

Implemented `manager.unsackable` from a static trace of the ARM64 plugin of FM27
Steam build 26340721 (see recon/fm27-human-manager.md): bit 1 of the `u32` at
`+0x3FC` in a `db::HUMAN_NON_PLAYER` whose person block is shifted `0x340`. The
record resolves only with that exact build profile, the attached career's
storage, that shift and the object's live RTTI class; the usual UID, health,
expected-value, readback and conditional-undo checks apply. It is a single-person
field, excluded from mass edits and templates. The human manager's profile shows
it as "Unsackable (experimental)" in its own Manager group, with or without a
club contract, and the staff list has a
"Human managers only" filter (also passed to mass edits).

Builder checks only: unit tests cover bit encode/decode preserving the other
seven bits, the unshifted record placement, single-only and health-check
mapping, eligibility against a missing capability, wrong class, wrong or zero
shift and a non-staff target, the profile capability on this fingerprint only,
and the human-only filter against an AI manager (job 16), an unemployed human and
other filters. The frontend build, Rust format/Clippy/tests, the writable-memory
tests, the probe/bridge build and the Tauri debug app build ran; see the change's
report for their output.

Judge native verification on 4 November 2026 used the explicitly selected
`FM Lens PBJ Manager 2026-11-04.fm` disposable career, human manager UID
2002071958. The main career SHA-256 was recorded before testing and remained
unchanged. The running module UUID was rechecked after restart against the known
ARM64 fingerprint.

- Baseline flag 0; pending flag change left memory at 0. Apply changed it to 1.
  A surrounding-byte comparison showed only bit 1 at +0x3FC changed; conditional
  undo restored the original bytes exactly.
- After a later flag change, undo of an older entry refused the stale value.
  Undo of the latest change succeeded. This was an intervening editor change,
  not an independently triggered game change.
- Manager Determination changed from displayed 5 (stored 25) to 20 (stored 100).
  After Continue, FM displayed Elite rather than Reasonable. The copy advanced
  from 8 December 2027 21:45 to 23:45, then was saved through FM's menu.
- FM fully exited (the original process was confirmed absent), restarted, and
  the named copy was explicitly selected in Load Game. A fresh probe read
  flag 1 and Determination stored 100/displayed 20; FM's My Profile again
  displayed Elite and personality Determined.

This establishes bounded apply/undo and save/reload persistence on this copy.
Protection from dismissal remains unverified: no dismissal scenario was run.
Unrestricted registration, manager relations editing and club/national-team
moves remain research work. No freeze was enabled in this test.

## FM-inspired interface and direct value editing

The desktop UI was refined toward FM27's familiar layout (see
FM-LENS-INTERFACE.md): dark plum masthead with underlined tabs, violet primary
actions, striped tables and stat rows, raised profile header and thin group
dividers, in both light and dark. Values, ranges and storage are unchanged.

A mapped, non-pointer scalar that the game has a value for can be clicked (or
focused and activated with Enter/Space) from its displayed value while a profile
is read. That runs the same Edit start as the Edit button, which always reads the
field table and values afresh; the values read beforehand to decide which values
are clickable are never the expected-value baseline. Once the inputs show, the
clicked field's input takes focus inside that profile, with number/text contents
selected. Nothing is written on click, Enter, blur or typing: the existing
review, Apply, readback and conditional undo path is unchanged. The human
manager's unsackable flag now shows in its own group without needing a contract.

Builder checks: frontend build (tsc and Vite), `cargo fmt --all --check`,
`cargo clippy --locked -p fmlibre-app --all-targets -- -D warnings`, the Tauri
debug app build, the Impeccable detector over the changed UI files and
`git diff --check`. Pending native checks: direct activation by mouse and
keyboard, focus and selection, pending/apply/undo after activation, switching
profiles with unsaved edits, the human manager's group with and without a
contract, light/dark and 125/150% zoom.

Judge verification independently reran the frontend build, Rust format,
workspace Clippy and tests, writable-memory tests, app-only Clippy, probe/bridge
build, and separate Tauri debug app build. All passed. The UI detector reported
three pre-existing CSS border warnings outside the changed rules.

Native checks on the rebuilt desktop app passed mouse activation of Determination,
focus and text selection, replacing the selected text, pending navigation refusal,
Keep editing, Review, Apply (20 -> 19), and history Undo (back to 20). A separate
read-only probe confirmed the pending value had not reached game memory. Tab to
Current ability followed by Return opened its input with 48 selected. The Manager
group showed the experimental flag independently of Contract; an unemployed human
was covered by filtering unit tests, not by a native career test.

Light appearance at 125% and dark at 150% were inspected. The first 150% pass
found staff filters overflowing the footer; the judge added list-pane scrolling,
a minimum table viewport and masthead wrapping. After rebuilding, the native 150% dark check confirmed the masthead wrapped
within the window, filters stayed above the footer, and scrolling the left pane
reached Nation, Club, Add attribute and the staff table. Reports and diagnostics remain local under ignored
`reports/pbj-human-manager/`; no careers or raw dumps are tracked.

## Human manager: squad registration at any time

`manager.registration_anytime` is bit 8 of the human manager's flags word,
traced to FM's own `squad_registration_anytime` action (see
recon/fm27-human-manager.md). It uses the same guards as unsackable and appears
in the manager's Manager group. Unit tests cover the byte and bit, keeping the
other bits, single-person use and the staff field count. The frontend build,
Rust format, strict workspace and app Clippy, workspace tests (66 core),
writable-memory tests, probe/bridge build and Tauri debug app build passed.

A read-only probe of the loaded validation career read `registration no`
through the guarded field path; the raw flags word was `0x2`.

Native verification on 4 November 2026 used the disposable
`FM Lens PBJ Manager 2026-11-04.fm` career (named in FM's Save Game As dialog),
human manager UID 2002071958, module UUID F4540355-2186-39CB-9119-C706A6A35346.
The main career SHA-256 was recorded before testing and matched afterwards.

- Before: FM's Premier League Squad Registration screen showed "Registration
  Closed, Reopens in 24 days". Clicking Kepa Arrizabalaga's toggle did nothing
  and Undo stayed disabled.
- FM Lens showed the flag as No. Review listed one change, No -> Yes. Apply read
  back Yes. The raw flags word went from `0x2` to `0x102`: only bit 8 changed.
- After: on the same screen, still labelled closed, Kepa's toggle turned off,
  the squad count went 22/25 -> 21/25 and FM's Undo became active. FM's Confirm
  stayed disabled. Kepa was not among the matchday substitutes afterwards, but
  FM marks him unavailable, so that is not evidence of the registration change.
- Stale undo: a second Apply (Yes -> No) returned the word to exactly `0x2`.
  Undoing the older No -> Yes entry was refused ("is now 0, not 1"), leaving
  memory unchanged. Undoing the latest entry succeeded and restored `0x102`.
- Saved through FM's menu as `FM Lens PBJ Registration 2026-11-04.fm`, quit
  through Quit Game and Exit (process confirmed gone), relaunched through Steam
  (same module UUID) and explicitly loaded that copy. A fresh probe read
  registration yes and unsackable yes. Squad Registration still read closed.
  Its "Hide players: Unavailable" filter was on, which hid Kepa; with the filter
  off he was listed and registered, at 24/25. Illan Meslier's toggle turned off
  and back on, so the flag still applies after reload.

- Second save: on that reloaded copy, with the filter off, Kepa's toggle turned
  off (24/25 -> 23/25). FM's Confirm stayed disabled and FM's Undo was not used.
  Saved as `FM Lens PBJ Registration Kepa 2026-11-04.fm`, quit (process
  confirmed gone), relaunched through Steam and loaded that copy. The probe read
  registration yes and unsackable yes. With "Hide players: Unavailable" unticked
  again (FM restored it on reload), Kepa was listed unregistered at 23/25.

This establishes apply/readback, stale-undo refusal, FM accepting registration
changes while the window is closed, persistence of the flag across save/reload,
and FM keeping a registration change made outside the window through
save/quit/reload, on this copy. Kepa's first change (before the first save) did
not survive that reload; why is not established. Not established: the
registration window reopening or closing with the flag set, and FM's own "squad
numbers any time" bit.

## Max cohesion (5 November 2026)

On the disposable `FM Lens PBJ Registration Kepa 2026-11-04.fm` copy (FM showed
Kepa unregistered and the probe read the PBJ manager flags, so not the main
career), game date 8 Dec 2027, Arsenal (UID 602). The main career's hash was
checked before and after.

- Before: FM's Squad > Dynamics showed Team Cohesion "Very Good", ring about 85%
  full. `fmlibre-probe cohesion 602`: 37 to raise, 11 at 100, 6 skipped.
- FM Lens, Squad tab, first team, Max cohesion: "18 changes made", one mass edit
  in Changes (for example Eze 38 -> 100, Meslier 1 -> 100, Merino 4 -> 100). The 18
  include three players out on loan, which the probe's list leaves out.
- Readback: the probe found 15 more of the club's players at 100 (26 in all).
- FM's screen did not change until Continue. After one Continue (to 9 Dec), Team
  Cohesion read "Excellent" with the ring full, and the probe still read 26 at
  100.

Not established: the values through save and reload, and the U18 team.

Since this check, raising and undoing no longer write to an address saved
earlier on its own say-so. Each finds the player's entry for the club again,
refuses under an unknown build or another career (`Lock::CareerChanged`), and
writes only over the byte it expects: a raise only where and what the plan
found, an undo wherever the list keeps the entry now, provided it still holds
100. Unit tests cover a moved list, a changed value and a missing entry.

Checked live with that build on the same copy (game date 9 Dec 2027): the probe
read 22 to raise, 26 at 100 and 6 skipped. FM Lens, Squad tab, U21, Max
cohesion: "22 changes made", with the same 6 players reported as having no
familiarity with the club. The probe then read all 22 at 100 (for example
Setford 1 -> 100, Hamill 42 -> 100, Ibrahim 78 -> 100). Undo reported "Undid 22
changes", and the probe's output matched the first reading line for line. The
main career's hash matched its baseline afterwards. Not established: FM's own
display of the U21 change, and stale-undo refusal in the app.

### U18, a day later and stale undo (5 November 2026)

Same copy and build, game date 9 Dec 2027.

- U18 (one player, Angelinou Pedro, 78): Max cohesion raised him, and the probe
  read 100. A second press reported "No changes made".
- U21 raised again: "22 changes made". The probe then read all 48 club entries
  at 100 (6 skipped, as before).
- One Continue, to 10 Dec. FM itself then lowered every entry: the first team's
  to 99 (Eze, Meslier and Kepa to 98), the U21's and U18's to 98. That included
  players FM had at 100 before any edit. Max cohesion's 100 is a starting point
  the game moves from, not a value it keeps.
- Undo of the U21 batch in Changes: "Nothing was undone", every entry refused
  because the game had changed the value. The probe's output was the same before
  and after the undo, so nothing was written.

That refusal showed a raw memory address and said to reload, which cannot help
when the game changed the value itself. An undo refused this way now says what
the familiarity is, in `cohesion.changed` (English, Spanish, Turkish).

### Save and reload (5 November 2026)

Same copy, the build with `cohesion.changed`, game date 10 Dec 2027. The first
team, U21 and U18 were raised again, and the probe read all 48 club entries at
100 (6 skipped).

- Saved as `FM Lens Cohesion 2026-11-05.fm`, the probe's output unchanged.
- Quit Game and Exit, FM's process gone, relaunched through Steam (same build
  fingerprint), and that copy loaded.
- The probe's output after the reload matched the reading at save time line for
  line: all 48 at 100. FM's Squad > Dynamics showed Team Cohesion "Excellent",
  ring full.
- FM Lens reported "FM closed or restarted. Load a save and connect again."
  After Connect, Changes listed no changes, so batches from before the restart
  cannot be undone into the reloaded game.

The main career's hash matched its baseline afterwards. Not established: the
`cohesion.changed` message on screen (the stale undo above ran on the build
before it).

## Staff, club and contract persistence (5 November 2026)

On a disposable copy (the cohesion copy above, game date 10 Dec 2027), edited in
FM Lens and saved as `FM Lens Staff Club Contract 2026-11-05.fm`. The main
career's hash was checked before and after.

| Edit | FM after Continue | After save, quit and reload |
|---|---|---|
| Nicolas Jover (staff 48030808) wage £15,000 -> £16,000 | Profile header and club staff list show £16K p/w | Probe 16000 |
| Jover Tactical 7 -> 8 | "Competent" band, which does not show the step | Probe 40 (8) |
| Arsenal (club 602) transfer budget £1,048,517 -> £11,048,517 | Portal "£11.04M", Club overview "£11M" | Probe 11048517 |
| Arsenal youth recruitment 15 -> 16 | "Good" band, which does not show the step | Probe 16 |
| Bukayo Saka (player 28122642) expiry 30/6/2031 -> 30/6/2032 | Header "30/6/2032", Contract page "4 years, 203 days" | Probe 2032-06-30 |
| Saka wage £300,000 -> £310,000 | Still "£300K p/w" on the header and Contract page | Probe 310000, FM still £300K |

The reload was a full Quit Game and Exit, FM's process gone, a Steam relaunch
(same build fingerprint) and that copy loaded. The probe's readings at save time
and after the reload matched line for line.

The initial conclusion that the player wage edit was not working was incorrect.
A read-only investigation on the same build traced the Contract page's weekly
wage property (`Pcww`) to the same contract +0x20 field used by FM Lens. FM then
rounds that value for display. With GBP weekly formatting, £310,000 rounds to
£300,000 in £25,000 steps. This explains the unchanged £300K label after reload
and advancement; searching memory for a second stored £300,000 was unnecessary.
The saved contract value is £310,000. Payroll deductions have not been tested.

### Wage display investigation (5 November 2026)

Rechecked the running process with the read-only probe: module UUID
`F4540355-2186-39CB-9119-C706A6A35346`, Saka UID 28122642, wage 310000,
expiry 2032-06-30. Inspected FM on 11 Dec 2027: header £300K p/w.
Preferences showed GBP and Weekly. No game-memory writes or career saves were
made during this investigation.

Reproduction from the matching ARM64 game_plugin slice (addresses are RVAs):

- Contract UI handler `0x188040` calls wage helper `0x1886e8`.
  At `0x188744`, it dispatches contract vtable +0x48. The loaded contract's
  getter is `0xd8c3c0`: `ldr w0, [x0, #0x20]; ret`.
- Wage wrapper `0xffba88` feeds the typed wage formatter. Formatter `0x18a9f54`
  uses cash-format flag 8 for ordinary weekly wages.
- Cash formatter `0x42c9e10` calls rounding-step selector `0x42ca868`.
  Its flag-8 branch at `0x42cab74` selects step 25000 for GBP amounts above
  250000 through 1000000 (`0x42caaac` / `0x42cad44`).
- Positive amounts round as `((amount + step / 2) / step) * step`, using integer
  division (`0x42c9f54`). Thus 300000 and 310000 both display as 300000;
  325000 displays as 325000. These are formatter calculations, not additional
  live wage-edit tests.

Bounded disassembly and read-only diagnostics are local under
`reports/wage-fix/`. No offset or memory-write change is justified by this
finding. A rounded FM label alone must not be used to reject an edit; check the
exact contract value as well. Payroll and all other contract fields retain their
existing validation limits.

Not established: other staff attributes, CA/PA, reputation, job and club moves,
other club balances, facilities and capacities, squad number, loyalty bonus,
listing flags and release-clause amounts.

## Nation editing (5 November 2026)

On the disposable `FM Lens Staff Club Contract 2026-11-05.fm` copy (FM's Save As
dialog named it, and the probe read Saka's edited £310,000 wage), game date 11
Dec 2027, with FM Lens built from `feat/nation-editing`. The main career's hash
was checked before and after.

- The probe's nations check read 141 of 144 sampled nations fit, and `fields
  nation --stats` read 216 of 216 nation objects, each with a senior team.
- FM Lens, Nations, England (UID 765): four changes in one Apply, "4 changes
  applied". The probe then read exactly these four changes, nothing else in
  England's reading differed.
- FM's screens did not change before the reload, and Continue was not pressed
  (the Spurs match was that day).
- Saved as `FM Lens Nation 2026-11-05.fm`, the probe's reading unchanged. Quit
  Game and Exit, FM's process gone, relaunched through Steam (health checks pass
  on the same build), and that copy loaded. The probe's reading after the reload
  matched the reading at save time line for line, England at a new address.

| Edit | FM after save, quit and reload | Probe after reload |
|---|---|---|
| Population 57,690,300 -> 63,000,000 | Nation overview "63M" (was "57M") | 63000000 |
| Senior team reputation 9,238 -> 6,000 | Men's national team "Continental" (was "Worldwide") | 6000 |
| Dual nationality allowed -> not allowed | Not on the nation screens checked | not allowed |
| Years to naturalise 5 -> 7 | Not on the nation screens checked | 7 |

After the reload, FM Lens reported that FM had restarted. After Connect, it
showed the reloaded values. Years to naturalise 7 -> 9 applied (probe 9), and
Undo in Changes reported "Undone" with the probe's reading back to the reload
reading line for line.

Not established: FM acting on the dual nationality and naturalisation rules
(eligibility, nationality gained) and stale-value refusal for a nation.

The two nations that missed the nations check were Madagascar (UID 29) and
Liberia (UID 27), which ask for 99 years (so does Palestine, UID 1662). The
check now takes up to 99 years and passes 143 of 143 on the same copy. FM's own
calculator (`0x13B7E94`) reads the byte as signed and takes any value below 1
as never, so the editor now takes 1 to 99 years, or never.

## Call bridge, loans, signings and officials (5 November 2026)

On the disposable `FM Lens Batch 2026-11-05.fm` copy (game date 11 Dec 2027),
FM Lens 0.x universal build from `main` at 4b194ba, the new bridge installed in
`FM27Scout` with Steam closed and FM relaunched from Steam. The main career's
hash was checked before the session. Every write went through FM Lens; the
probe only read.

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| Add injury, Declan Rice (28106491) | Logged, then Undone | Injury, then none | Medical shows the injury at once |
| Grant work permit, Holger Quintero (2000521121) | Not granted -> Granted | Permit granted 2027-12-11 | Pending recheck after Continue |
| Sign free agent, no terms, Yannik Keitel (91179656) | -> 1. FSV Mainz 05, then Undone | Mainz, FM's contract; then no club, no contract | Mainz, #6, to 30/6/2030 |
| Sign with terms: Keitel, £5,000, end 30/06/2029 | -> 1. FSV Mainz 05 | £5,000, signed 2027-12-11, expires 2029-06-30 | Mainz; contract page still 30/6/2030 (page viewed before, recheck after Continue) |
| Loans (#19): White, Merino, Mosquera, Harriman-Annous | - | Clubs, starts, 2028-06-29, £55,000 / £98,000 / £30,000 / £2,304 | Squad > Loans: same clubs and dates, wage contribution £55K / £98K / £30K / £2.3K |
| Loan start, Ethan Nwaneri (2000283271) to Brentford until 30/06/2028 | Arsenal -> Brentford | Loan 2027-12-11 to 2028-06-30, borrower pays £0 | Profile "On loan at Brentford", parent Arsenal |
| Future transfer, Patrick Berg (53099570) to Rosenborg BK on 18/12/2027 | Joins 18 Dec 2027, then Undone | Still a free agent | "Transfer arranged, joining Rosenborg on 18/12/2027"; after Undo the badge still shows (recheck after Continue) |
| Future transfer, Hugo González (67295025) to Getafe on 13/12/2027 | Joins 13 Dec 2027 | Still a free agent | Pending: Continue past 13 Dec |
| Officials: Michael Oliver (103994) CA 180 -> 170, reputation 8,388 -> 8,600 | "2 changes applied" | CA/PA 170/180, rep 8600 | Pending recheck after Continue |
| End loan, Mikel Merino (67211760), Arsenal loan at Real Hispalis with a £22.5M mandatory future fee | "FM didn't make the change", nothing logged | Real Hispalis, own contract £77,000 to 2030-06-30, no loan | News: Real Hispalis sign Merino for £22,500,000. **Failed**: fixed in #30 |
| Undo of the loan FM Lens started, Nwaneri | Undone | Arsenal, his own contract, no loan, at once | Pending recheck after Continue |

Findings so far:

- The Sign and Loan dialog buttons and the Officials Apply button did not
  respond to synthetic mouse clicks or to Return and Space on the focused
  button; Tab then Return worked for Sign and Loan, and Cmd+S worked for Apply.
  Not yet known whether a real click has the same problem.
- End loan on a loan with a mandatory future fee has the game complete the
  transfer: `end_contract` runs the loan's fee, as the daily loan expiry does.
  The loan contract keeps the fee at +0xC0 (0xFFFFFFFF for none): White
  58,000,000 (his option to buy), another Arsenal loan 50,747,118,
  Harriman-Annous none. Which bit marks a fee mandatory is not mapped, so
  FM Lens now refuses End loan on every loan with a future fee and shows the
  fee in the Loan group (#30). End loan on a loan without one is still to test.
- FM's Go on holiday button did not respond to single, double or slow clicks,
  so the session stopped at 11 Dec 2027 without pressing Continue. Nothing was
  saved after the edits.

Still to check in FM, after Continue past 13 Dec 2027: Rice has no injury;
Quintero's permit shows, then revoke it; Keitel's contract reads 30/06/2029
and £5,000; Berg's arranged-transfer badge is gone; González joined Getafe
with FM's contract; Oliver's official screen; Nwaneri back at Arsenal. Then
End loan on a loan without a future fee, work permits (#20), competitions and
awards (#21) and the earlier items in `HANDOFF.md` section 4.

### Rechecks and the rest of section 4 (5 November 2026, evening)

Same copy, FM Lens built from each branch with `npm run release` (the
unbundled binary, which leaves the installed bridge alone; its hash was
unchanged throughout). The copy was saved once (22:11), FM restarted from
Steam and the copy reloaded, then FM went on holiday from 11 to 14 Dec 2027
(Arsenal 2-1 Tottenham was played on the way).

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| Max tactics (#32), Tottenham (AI) | "44 changes made", then Undone | Every entry for Spurs' tactic 10000; after Undo byte-identical to before | - |
| Max tactics (#32), Arsenal (human) | "28 changes made", Undone, pressed again | Same; Undo byte-identical; after save, quit and reload still 10000 | Tactical Effectiveness: tactic 1's eight pies full only after reload; tactics 2 and 3 full at once |
| Rice's injury, after Continue | - | No injury | Fitness Excellent, no injury |
| Keitel's signing with terms | - | £5,000 to 2029-06-30 | Mainz 05, contract to 30/6/2029 (wage shown as a scouting range, £2.7K-£5K) |
| Berg's cancelled future transfer | - | Free agent | Free agent, no arranged-transfer badge |
| González's future transfer, 13 Dec | - | Getafe | Getafe, FM's contract to 30/6/2031 |
| Nwaneri's started loan, undone | - | Arsenal, no loan | Arsenal, no loan |
| Quintero's work permit, then Revoke | Granted -> Not granted | Not granted | After the revoke FM still showed an ESC slot until 10/12/2028; after a one-day holiday it shows "Active work permit, Until 30/6/2032". **Open**: FM keeps a permit the revoke does not clear |
| Work permits (#20), Sichenje and Rijks | Granted 3 Feb 2027 / 28 Jan 2027 | Same | FM shows permits only for your own club's players |
| End loan, no future fee, Harriman-Annous | Logged | Back at his parent club, no loan | Back at his parent club |
| Undo of End loan, Rafael Pinto Pedrosa (first build) | Undone | Loan back, but from today, borrower pays £0, and loan listed true | Fixed in #33 |
| Undo of End loan, #33 build: Yang Min-Hyeok and Pedrosa | Undone | Probe output identical to before End loan, including loan start, £17,280 / £17,242 and loan listed false | - |
| Competitions (#21), Premier League | Overview | - | Matches |
| Awards (#21), World Golden Ball | Two identical rows | Period 6, women flag +0x8A 1 on one | FM: "Next Award Period: 26/10/2027 - 25/10/2028"; women's awards in green. Fixed in #34 (Women tag, period names) |
| Officials, Michael Oliver | 170 / 180, rep 8,600 | Same | Not reachable: FM's search has no officials |
| Staff licence labels (#17) | Labels 1-8 | Byte +0x204 | FM's Coaching tab: 1 Continental Pro, 2 Continental A, 3 Continental B, 4 Continental C, 5 National A, 7 National C, 0 and 8 none; 6 (National B) by the ladder, no sample; a negative value is the level held while studying for the next. Fixed in #35 |
| Squad status labels | 1-5 named, 4 "Rotation player" | Codes from contract +0x54 | Contract page header for a holder of each code: 4 Squad Player, 7 Fringe Player, 9 and 21 Emergency Backup, 10 Breakthrough Prospect, 11 Future Prospect, 13 Youngster, 15 First-Choice Goalkeeper, 16 Cup Goalkeeper, 17 Domestic Cup Goalkeeper, 20 Backup, 22 Surplus to Requirements; 14 needs scouting for every holder. Fixed in #36 |
| Language levels (#15) | 10 "Native" | Gyokeres: Hungarian 5, English 10, Norwegian 8, Danish 8, Portuguese 1 | Personal > Overview: English, Norwegian, Danish Fluent, Hungarian Good, no Portuguese; 7-10 Fluent, 5 Good, 3-4 Basic, 1 left out (six players). Fixed in #37 |
| Clause names (#18) | FMRTE's names | `clauses UID` for 16 players | Contract page: most match; FM names 8 Sell On Fee Percentage, 13 Wage After Reaching Club League Games, 41 Seasonal Landmark Combined Goal and Assist Bonus, 55 Active Relegation Release Clause; FM does not list 63. Fixed in #38 |
| Wage budget, club finance +0x814 | Wage budget (spending) | Arsenal £5,376,891 p/w, total (+0x808) £6,503,366 | Finances > Wage Budget: "Spending Wage Budget £5,376,891 p/w", Total Wage Budget £6.5M; "Current wage total (incl. bonuses) / Budget" £5,376,891 / £6,503,366 |
| England (#16) | Association founded 1863, joined FIFA 1905, women joined FIFA 1972 | Same; reputation 6,000 men, 9,950 women | "FA Founded 1863" on both pages; "About England" says founded in 1905 (men) and 1972 (women), the FIFA years; reputation Continental and Worldwide |
| Tour (#12), Intel (#13) | - | - | Not run: the tour needs the desktop app's local storage cleared; Intel needs FM under Rosetta, not tried. Both run on 6 November (below) |

Findings:

- The Sign, Loan and Apply buttons and Go on holiday were never ignoring
  clicks: the click helper's mouse-up was sometimes lost, leaving the button
  held. A second release when the button still reads down fixed every case.
- FM caches its panels: an edited contract expiry, a tactic's pies or an
  arranged-transfer badge shows after a reload or the next day, not at once.
  FM Lens' own header date also stays at the connect date until Reload.
- Revoking a work permit clears FM Lens' and the probe's permit, but FM keeps
  showing a permit (the ESC slot, then an active permit to 30/6/2032 after a
  day). FM reads it from somewhere the revoke does not reach. Fixed in #39,
  checked on 6 November (below).
- FM's end of a loan can put the player on his parent club's loan list (it did
  for Pedrosa, not for Yang). #33 restores the flag with the loan.
- Award byte +0x8A is 1 for every women's award (3,902 awards read). Period
  codes: 4 at the end of the competition (884 awards), 5 each calendar year
  (216), 6 each year (23, World Golden Ball: 26 Oct to 25 Oct), 7 each round
  (31, "of the Round" awards), 9 (34: managers of the year, cup final players,
  club policy awards; not shown in FM's search, left unnamed).
- FM's transfer history keeps a line for each loan the game was asked to
  start, even after Undo: Nwaneri to Brentford (11 Dec), and the loans #33's
  Undo of End loan restarted (Pedrosa, Yang, 14 Dec).
- Harriman-Annous is on loan at Huddersfield again from 14 Dec 2027 with the
  borrower paying £0, the state the first build's Undo of End loan leaves
  (fixed in #33). The copy keeps it.
- FM shows a squad status, a contract's clauses and its bonuses only for
  players it has scouted; your own club's are always shown.

## Work permits, tour and Intel (6 November 2026)

Same `FM Lens Batch 2026-11-05.fm` copy, reloaded at 11 Dec 2027. FM Lens built
from `main` at b8937bf (#30 to #39 merged) and installed in `~/Applications`.
Nothing was saved; FM was quit without saving after each part. The main
career's hash was checked before and after (OK both times).

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| Tour (#12), local storage keys `fmlibre.tour` and `fmlibre.tour.exercise` cleared | Exercise starts at 1 of 5 on connect; open a row, Edit, change a value, Apply, Changes reach 5 of 5; Discard goes back to 3 of 5; the card sits bottom-left, clear of Apply; Done stores `fmlibre.tour.exercise` | Quintero's crossing 5 -> 6 | - |
| Revoke (#39), Holger Quintero (2000521121), ESC slot since 11 Dec 2027 | ESC slot -> None | No permit record | Contract > Work Permit: "No Work Permit", re-apply immediately |
| The same, after Continue to 12 Dec (Arsenal 3-0 Tottenham, instant result) | - | Still no record: FM did not make a new one | Still "No Work Permit"; profile badge ESC -> Wp |
| Grant, Quintero | None -> Active | England: active | Same day: badge still Wp (cached). After Continue to 13 Dec: badge gone, Contract page "Work Permit: Active, until 30/6/2032" |
| Undo of a Grant, Quintero (earlier the same session) | Undone | No permit record | - |
| Revoke then Undo, Collins Sichenje (12092701), ESC slot since 3 Feb 2027 | Revoked, then "Undone" | No record, then ESC slot since 13 Dec 2027 | - |
| Intel (#13): FM under Rosetta with the bridge | Connects; Officials: Michael Oliver, 42, England, 8,600, 170 / 180, ID 103994 | Build profile "FM27 Steam build 26340721 (27.0.0, macOS, Intel)", game_plugin UUID `0981AB31-AC3B-3D93-944F-47FE4B59CD9E`; health 12 of 12 pass | Loads and plays the copy |
| Intel reads against arm64 | - | 1,166 officials, Oliver the same; `nation 765` identical apart from its address (4th, 1922.83 points, founded 1863, FIFA 1905); the human manager unsackable and registered at any time, person block shifted by 0x340, as on arm64; 445 planned retirements (arm64, two days later: 438) | - |
| Work permits on Intel | No Work permit tab | No permit line | - |

How FM ran under Rosetta, with Steam running and the arm64 FM quit:

```bash
arch -x86_64 -e DYLD_INSERT_LIBRARIES="$HOME/Library/Application Support/FM27Scout/libfmlibre_bridge.dylib" -e SteamAppId=4530370 -e SteamGameId=4530370 "$HOME/Library/Application Support/Steam/steamapps/common/Football Manager 27/fm.app/Contents/MacOS/Football Manager 27"
```

`vmmap` showed the Rosetta runtime and the bridge's translated x86_64 slice.
Steam's own launch (`fmlibre-launch`) still starts the arm64 half, and its
launch options were not changed.

Findings:

- Revoke now clears FM's permit (fixed in #39): FM's own page and badge follow
  after a day, and FM does not make the record again.
- Undo of a revoked ESC slot gives the slot back dated the day of the undo, not
  its first date (Sichenje: 3 Feb 2027 -> 13 Dec 2027). The game's call dates
  a new slot today.
- The Changes view writes a revoked ESC slot as "Active -> None": the change
  text knows only whether a permit exists.
- Reload, or connecting to a restarted FM, clears the session's Changes list,
  so its Undo buttons are gone.
- The Intel profile has no `transfer_manager` and no permit calls, so FM Lens
  reads no work permits on Intel and hides the tab. Writes were not tried on
  Intel.
- Ronaldo's and Benzema's planned retirements (30 June 2027) are not on this
  copy on either architecture: its date is past them.

## ESC slot wording and Undo (#42, 6 November 2026)

Same `FM Lens Batch 2026-11-05.fm` copy at 11 Dec 2027, FM arm64 started
directly with the bridge from `main` at 3751ccb (#40 to #42 merged). FM Lens
from the same commit (`tauri build --no-bundle`). Nothing was saved; FM was
quit without saving. The main career's hash was checked before and after (OK
both times).

| Check | FM Lens | Probe |
|---|---|---|
| Revoke, Collins Sichenje (12092701), ESC slot since 3 Feb 2027 | Work permit: None. Changes: "ESC slot since 3 Feb 2027 -> None" | No permit record |
| Undo of that Revoke | "Undone" | ESC slot since 2027-02-03 |
| Revoke, Gabriel (19242094), a work permit | Changes: "Active -> None" | No permit record |
| Undo of that Revoke | "Undone" | England: active |

Both findings of the morning session about ESC slots are fixed: Changes names
the slot and its date, and Undo gives the slot back with its first date.
