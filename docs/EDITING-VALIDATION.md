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
