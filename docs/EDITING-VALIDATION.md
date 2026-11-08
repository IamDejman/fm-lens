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

For isolated editor state, launch the development bundle with `FMLENS_DATA`
and `FMLENS_EXPORTS` pointing to local directories under `reports/`. This keeps
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

## Favoured and disliked people and clubs (strength and removal)

`scripts/scout preferences [UID]` reads these from the same relation list as
secondary nationalities and homegrown ties: to a person, relation 1 is favoured
and 2 disliked; to a club, 3 is favoured and 4 disliked. Byte `0x0C` holds a
signed strength. Player and staff profiles list them (staff at `+0x140`, the same
format), and a Change dialog writes a new strength or removes an entry.

On the validation career (known Mac build) a scan of every loaded player found
20,805 favoured and 5,298 disliked people, 13,574 favoured and 1,454 disliked
clubs. Every target resolved to a loaded player, staff member or club. Strengths
ran 1 to 100 except one entry: Diego Valoyes (UID 76042820) favours Talleres at
-35 and dislikes it at 35; only that favoured entry has `0x02` in byte `0x08`.
Examples matched real-world ties (Jere Uronen favours Hrádecký and Pukki; Diego
Reyes favours Raúl Jiménez), but no player's lists were compared with FM's own
screens.

Editing is limited to what the read already establishes: a strength from 1 to
100 written over byte `0x0C` with its expected value, removal as for a tie (the
entries after it move up, the list end moves back and the freed entry is
cleared), and Replace, which writes only the 8-byte target pointer. A club
target is the club's address; a person target is the person's identity block,
which holds the UID at `+0x0C` as a club does. Replace keeps a club a club and a
person a person, and refuses a target already in the list and the person
himself. All three are logged in Changes and undone there. Strength and removal
were checked in FM on 6 November (see Round 1 below), Replace on 7 November (see
"Replace a like or dislike" below). FM's Reason column is stored with the entry,
not worked out from the target: a replaced entry keeps its old reason. Adding an
entry waits until bytes `0x08` and `0x0D` are understood.

## Languages (level and removal)

A person's languages (player `+0x338`, staff `+0x1B8`, the human manager's
shifted `0x340`) are a list of pointers to 16-byte links, each a pointer to the
language and a `u64` level from 0 to 10 (see recon/fm27-person-extras.md; levels
1 to 10 were seen). Player and staff profiles have a Change dialog that writes a
level from 1 to 10 over the link's, with its expected value, or removes a
language as a tie is removed: the pointers after it move up, the list's end
moves back and the freed slot is cleared. The link is left where it is, so an
undo can point at it again. Both are logged in Changes and undone there. Adding
a language needs a new link, which the editor does not allocate.

FM's Personal page showed a removal after a day (Round 1 below). FM raises a
lowered level in a main language of the country the person's club is in back up
on its own, within days (Round 2 below); other languages keep the level set. The
profile marks each language as `local` where it is one of the languages the
largest share of that country speaks (all of them on a tie). The country is the
game's own lookup for most clubs (`0xe015c4` on Steam 26340721 arm64): the
nation a club based abroad plays in (club `+0xE8`), else its own (`+0xD8`); the
lookup names a few clubs by UID instead, which the editor does not follow. Not
yet checked: a save and reload.

## Future transfers (listing and cancel)

A player's profile lists the moves FM agreed for him on a later day: each dated
record of the transfer manager (`+0x50`) that names him, as his identity block or
as a stand-in FM has not looked up yet, whose offer still waits for its day
(status `0x13`). It shows the club he joins (the offer's `+0x40` team) and the
day (the record's `+0x08`). Cancel transfer, beside Transfer, has the game cancel
all of them as its own editor does: for each offer, `cancel_offer` for the team
he joins (kind 2), else the one he leaves (kind 0), then `drop_dated_transfer`.
The game drops the first dated record of his, not the offer's, so all go
together. The read-back checks that none of the offers waits any more and no
record of them is left. Each cancel is logged in Changes; nothing undoes it.
See recon/fm27-future-transfers.md.

Checked in FM for a free agent (Round 1 below), a club-to-club deal (Round 2
below), and the selling club's budget, FM's news, a second deal for the same
player and a save and reload (Live check below). A player has at most one
pending deal: signing him for a later day replaces the one he has. Not yet
checked: a loan agreed for a later day. None was pending in the copy, and FM
Lens loans start at once.

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
`cargo clippy --locked -p fmlens-app --all-targets -- -D warnings`, the Tauri
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
  full. `fmlens-probe cohesion 602`: 37 to raise, 11 at 100, 6 skipped.
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
| Grant work permit, Holger Quintero (2000521121) | Not granted -> Granted | Permit granted 2027-12-11 | Revoked later; FM kept a permit (Rechecks below) |
| Sign free agent, no terms, Yannik Keitel (91179656) | -> 1. FSV Mainz 05, then Undone | Mainz, FM's contract; then no club, no contract | Mainz, #6, to 30/6/2030 |
| Sign with terms: Keitel, £5,000, end 30/06/2029 | -> 1. FSV Mainz 05 | £5,000, signed 2027-12-11, expires 2029-06-30 | Mainz; contract page still 30/6/2030 (page viewed before); 30/6/2029 after Continue (Rechecks below) |
| Loans (#19): White, Merino, Mosquera, Harriman-Annous | - | Clubs, starts, 2028-06-29, £55,000 / £98,000 / £30,000 / £2,304 | Squad > Loans: same clubs and dates, wage contribution £55K / £98K / £30K / £2.3K |
| Loan start, Ethan Nwaneri (2000283271) to Brentford until 30/06/2028 | Arsenal -> Brentford | Loan 2027-12-11 to 2028-06-30, borrower pays £0 | Profile "On loan at Brentford", parent Arsenal |
| Future transfer, Patrick Berg (53099570) to Rosenborg BK on 18/12/2027 | Joins 18 Dec 2027, then Undone | Still a free agent | "Transfer arranged, joining Rosenborg on 18/12/2027"; after Undo the badge still shows; gone after Continue (Rechecks below) |
| Future transfer, Hugo González (67295025) to Getafe on 13/12/2027 | Joins 13 Dec 2027 | Still a free agent | Getafe on 13 Dec, FM's contract to 30/6/2031 (Rechecks below) |
| Officials: Michael Oliver (103994) CA 180 -> 170, reputation 8,388 -> 8,600 | "2 changes applied" | CA/PA 170/180, rep 8600 | Still 170 / 180 after Continue; FM's search has no officials (Rechecks below) |
| End loan, Mikel Merino (67211760), Arsenal loan at Real Hispalis with a £22.5M mandatory future fee | "FM didn't make the change", nothing logged | Real Hispalis, own contract £77,000 to 2030-06-30, no loan | News: Real Hispalis sign Merino for £22,500,000. **Failed**: fixed in #30 |
| Undo of the loan FM Lens started, Nwaneri | Undone | Arsenal, his own contract, no loan, at once | Arsenal, no loan after Continue (Rechecks below) |

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
awards (#21) and the earlier items in `docs/internal/HANDOFF.md` section 4.

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
| Tour (#12), local storage keys `fmlens.tour` and `fmlens.tour.exercise` cleared | Exercise starts at 1 of 5 on connect; open a row, Edit, change a value, Apply, Changes reach 5 of 5; Discard goes back to 3 of 5; the card sits bottom-left, clear of Apply; Done stores `fmlens.tour.exercise` | Quintero's crossing 5 -> 6 | - |
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
arch -x86_64 -e DYLD_INSERT_LIBRARIES="$HOME/Library/Application Support/FM27Scout/libfmlens_bridge.dylib" -e SteamAppId=4530370 -e SteamGameId=4530370 "$HOME/Library/Application Support/Steam/steamapps/common/Football Manager 27/fm.app/Contents/MacOS/Football Manager 27"
```

`vmmap` showed the Rosetta runtime and the bridge's translated x86_64 slice.
Steam's own launch (`fmlens-launch`) still starts the arm64 half, and its
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
  so its Undo buttons are gone. Fixed in #44, not yet checked in FM.
- The Intel profile has no `transfer_manager` and no permit calls, so FM Lens
  reads no work permits on Intel and hides the tab. Writes were not tried on
  Intel. Fixed in #41: grant, revoke and both undos checked under Rosetta.
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

## Round 1: nations, likes, languages, future transfers (6 November 2026)

Same `FM Lens Batch 2026-11-05.fm` copy, from 11 to 15 Dec 2027 (two holidays
of 3 and 1 days, the assistant playing Spurs and Liverpool). FM Lens built from
`feat/cancel-future-transfer` (#46 to #49 and #51 stacked). Nothing was saved;
FM was quit without saving. The main career's hash was checked before and after
(OK both times) and the copy's file time is unchanged.

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| England FIFA points 1,922.83 -> 1,950.50 | Applied; Undo "Undone" | 1950.50 after the holidays; 1922.83 after Undo | Ranking 4th on both pages; FM does not show points |
| England game importance 1 -> 3, attendance 15 -> 12 | Applied; attendance 18 refused (most 16); Undo "Undone" | Not printed | Not shown by FM |
| Saka, Timber 10 -> 45 -> 70 | Saved; Undo of both "Undone" | 45, 70, then 10 | Favoured Personnel lists only the strongest: manager (98) and Konsa (60) at 45; at 70 Timber appears between them after a day |
| Saka, remove Gilberto Mora (18) | Removed; Undo "Undone" | 6 entries, then 7 with Mora 18 | Mora (18) was never in FM's short list |
| Human manager, Arsenal 100 -> 80 | Saved; Undo "Undone" | 1 entry | Favourite club Arsenal |
| Saliba, remove Arabic (6) | Removed; Undo "Undone" | English 10, then Arabic 6, English 10 | Personal: "French (Fluent), English (Fluent)" after a day, no Arabic |
| Human manager, English 10 -> 7 | Saved | 7, then 10 after the holiday | "English (Fluent)" (7 and 10 both read Fluent) |
| Berg (53099570), free agent, signed for Arsenal joining 28 Dec 2027 | Future transfer: Arsenal, 28 Dec 2027; Cancel transfer button | Still a free agent | "Transfer arranged, joining Arsenal on 28/12/2027" |
| Cancel transfer on Berg | Section and button gone; Changes row with "-" | Free agent, no contract | Same day: badge still shown (cached). News "Patrick Berg deal falls through", Move Cancelled. After the holiday: Trn badge gone |
| Undo of Berg's signing after the cancel | "The transfer is no longer waiting for its day: FM has made it or cancelled it" | - | - |
| Reload after the holidays (#44) | Date 14 Dec 2027; all 10 changes and their Undo buttons kept | - | - |

Findings:

- FM sets the human manager's English back to 10 within three days. It looks
  like a nation's own language is kept at 10 (Saliba's French is not in his
  list at all, yet FM shows it). Undo then refused with "The game has changed
  the memory at 0x... since; reload and try again", although the value already
  equals the undo target. Undo should accept that, and the message should not
  show an address.
- The 5 November badge question is settled: FM's profile keeps the badge until
  the next day, then drops it.

Not checked: a club-to-club or loan deal agreed for a later day, both clubs'
budgets, a save and reload, the women's nation fields, and FIFA points changing
FM's ranking at its next ranking date.

## Round 2: Undo of restored values, club deal cancel, languages (6 November 2026)

Same `FM Lens Batch 2026-11-05.fm` copy, from 11 to 18 Dec 2027 (holidays of 3
and 4 days, offers rejected). FM Lens built from `main` at 875a101 (#46 to #53)
and installed as the universal release app. Nothing was saved; FM was quit
without saving. The main career's hash was checked before and after (OK both
times) and the copy's file time is unchanged.

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| #52 Min/Max hints in the installed app | Saliba in edit mode: "Min: 1 Max: 20" over the attributes, "Min: 1 Max: 200" under CA and PA, "Min: 140 Max: 220" under height; "Min: 1 Max: 10" in the Languages dialog | - | - |
| Saliba (Arsenal, France), English 10 -> 7 | Saved | 7; 10 after 3 days | - |
| Akanji (Inter, Switzerland), French 5 -> 3, Italian 10 -> 7, English 10 -> 7 | Saved | 3, 7, 7 after 3 days; 3, 10, 7 after 7 days | - |
| Human manager (Arsenal, Nigeria), English 10 -> 7 | Saved | 7 after 7 days | - |
| #53 Undo of Saliba's English and Akanji's Italian, already 10 again | "Undone" for both | Unchanged at 10 | - |
| Undo of Akanji's French and English and the manager's English | "Undone" | 5, 10 and 10 | - |
| #51 Iñaki Peña (67221484), Panathinaikos -> Barcelona on 2 Jan 2028 | Future transfer: Barcelona, 2 Jan 2028; Cancel transfer | 54 deals listed (`future-transfers`), then 53 without his | After 3 days: contracted to Panathinaikos, no offers, transfer status not set |
| Barcelona's money around the cancel | - | Transfer budget 87,411,534 -> 92,222,112 at once; balance 98.0M -> 94.8M over 3 days (wages) | - |
| Local language marks (after the fix, a fresh load) | - | Saliba English, Akanji Italian (not French), Trossard and Ndidi Turkish, Doku English, the manager English; Toronto FC: English, not French; AS Monaco: French; Dinamo Zagreb: Serbian and Bosnian, not English (55%) | - |

Findings:

- FM raises a lowered main language of the country a person's club is in
  back to 10: Saliba's English within 3 days, Akanji's Italian within 7. The
  languages of his nation but not of his club's country (Akanji's French) and
  others (Akanji's English in Italy) keep the level set. The manager's English
  stayed at 7 for 7 days, though in Round 1 it went back within 3, so FM does
  this on its own schedule, not on a set day. FM Lens now marks such a language
  in the Languages dialog.
- Undo of a change FM has already put back reports "Undone" without writing.
- Cancelling a club-to-club deal through the game leaves the player at his club
  on his contract; the buying club's transfer budget rose by 4.8M at once.

## Six features: injuries, formations, style, rules, promises, manager move (6 November 2026)

Same `FM Lens Batch 2026-11-05.fm` copy, from 11 to 12 Dec 2027 (a holiday of 1
day, the assistant beating Spurs 2-0). FM Lens built from a local branch merging
#70, #73, #74, #76, #77 and #78 on `main`, rebuilt once with the #77 fix. Nothing
was saved; FM's process was ended without saving. The main career's hash was
checked before and after (OK both times) and the copy's file time is unchanged.

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| #70 Gyökeres, injury days -> 14 | Saved; Undo "Undone"; saved again | Back 21 Dec 2027 | 11 Dec: "Expected to return in 12 days" (cached). 12 Dec: "in 10 days" |
| #70 João Pedro, remove his injury | Removed | No injury | 11 Dec: still "Inj" (cached). 12 Dec: no badge, fitness "Fair" |
| #70 Calafiori, not edited | Longest 2 days | - | "1 - 2 days" |
| #73 Preferred formation of 3 managers | 29, 28, 63 | Same | 4-2-3-1 DM AM Wide, 4-2-4 DM Wide, 5-2-2-1 DM AM |
| #73 Second formation of the same | 4, 64, 35 | Same | 4 and 64 both 4-4-2 2DM; 64 also 5-3-2 DM WB; 35 5-2-2-1 DM AM |
| #73 Glasner 63 / 35 -> 29 / 28 | Saved | 29 / 28 | 12 Dec: "4-2-3-1 DM AM Wide" and "5-2-2-1 DM AM" |
| #74 England style ratings | Depth 7, directness 14, flamboyancy 5, flexibility 6, free roles 6, marking 6, offside 15, pressing 18, sitting back 10, tempo 17, playmaker 7, width 15 | Same | Not shown by FM |
| #74 England depth 7 -> 12 | Saved | 12 | Not shown by FM |
| #76 Premier League, yellow cards for a fine | 6 | - | "£25,000 fine if 6 or more yellow cards received in one match" |
| #76 Premier League, other rules | Extended stoppage Yes, medal games 5, stadium 5,000 / 5,000, grass Yes, undersoil heating Yes | - | Not on FM's rules page. FM's 5 subs, 9 named and squad of 25 are not in FM Lens |
| #77 Promises, as opened | Gyökeres: promise 7, due 31 Jan 2028. Nico Paz: none | Nico Paz's list: 3 records | Promises page: only Nico Paz, playing time, 44 days |
| #77 After the fix (9ec665e) | Nico Paz: promise 1, made 24 Nov 2027, due 23 Jan 2028. Gyökeres: none | - | Same promise |
| #77 Close Nico Paz's promise | "Ended 11 Dec 2027" | Closed, status 1, ends 11 Dec | 11 Dec: "44 days" (cached). 12 Dec: "Completed", "Succeeded" |
| #77 Undo of the close | "Undone" | Open, status 0, due 23 Jan 2028 | - |
| #78 Human manager, Arsenal -> Nottingham Forest | Dialog: "Oliver Glasner loses his job". Header and profile: Nottingham Forest | Manager of Nottingham Forest; Glasner no job | At once: "Eluwande takes charge at Nott'm Forest", "Welcome to Nott'm Forest!", Forest's portal |

Findings:

- #77: a player's promise list also holds promises he made, which point at
  someone else (category 0, id 16, the manager as the person promised). One such
  record made the reader drop his whole list. The 17 promise 7 records of 4 Aug
  2027 (topic 1998, category 0) are a squad-wide set FM's Promises page does not
  list. The reader now keeps only records that point back at him and have a
  category, which matched FM's page for Arsenal. A close counts as kept in FM.
- #73: the preferred byte is right: FM took 29 after a day. The second byte is
  not FM's second formation: 28 did not show, and FM listed his old preferred
  (63) second. FM Lens also shows formation ids, not names.
- FM's "in N days" counts the day itself: 21 Dec from 12 Dec reads 10 days, and
  23 Jan from 11 Dec reads 44.
- `fmlens-probe injuries 602` stops at Gabriel with an invalid address;
  `heal UID` reads each player.

Not checked: a day after the manager move, a save and reload, moving the human
manager to a women's team (the club picker lists them), and FM's own view of a
nation's style ratings.

## Formations in and out of possession (#73 reworked, 6 November 2026)

Same `FM Lens Batch 2026-11-05.fm` copy, from 11 to 12 Dec 2027 (a holiday of 1
day). FM Lens built from `feat/staff-formations` (f44977e), which edits +0xDF and
+0xE3 instead of +0xDF and +0xE0. Nothing was saved; FM's process was ended
without saving. The hashes of the main career and the copy were checked before
and after (OK both times).

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| Out of possession of 4 managers | - | Arteta 22, Simeone 22, Glasner 63, Gasperini 30 | Down-arrow line on 11 Dec (run above): 4-4-2 2DM, 4-4-2 2DM, 5-2-2-1 DM AM, 5-3-2 DM WB |
| Choices for Glasner's out of possession | 4, 7, 22, 27, 30, 32, 33, 35, 63, 64 | - | - |
| Glasner out of possession 63 -> 22 | Applied: "It shows in FM after you press Continue" | 63 / 22, same after the day | 12 Dec: up arrow "5-2-2-1 DM AM", down arrow "4-4-2 2DM" |

Findings:

- +0xE3 is the formation FM's profile shows without the ball, and an edit shows
  a day later with the in-possession line unchanged.
- 22 is 4-4-2 2DM and 30 is 5-3-2 DM WB.


## Automatic refresh without Continue (6 November 2026)

Implementation worktree: `codex/automatic-refresh`, based on main `97ca87a`
(version 0.5.5). The installed `/Applications/FM Lens.app` (0.5.4) was left
untouched. Earlier testing used an older development bundle; the observations
below are from the new 0.5.5 development bundle. Debug builds now refuse
self-update so an update cannot replace the binary under test.

Target: FM27 Steam 26340721, native ARM64, module UUID
`F4540355-2186-39CB-9119-C706A6A35346`. The game fingerprint and health checks
were reinspected. The disposable `FM Lens Refresh 2026-11-06.fm` was copied
from `FM Lens Batch 2026-11-05.fm` and explicitly loaded in FM. Initial game
time was 11 Dec 2027, 16:30. Saka UID 28122642, Finishing 16 (stored 80),
contract expiry 30 June 2032. Local diagnostics: `reports/automatic-refresh/`.

| Action | FM Lens / readback | FM, with Overview kept open |
|---|---|---|
| Apply Finishing 16 → 17 | Applied | Immediately 17 |
| Undo Finishing | Undone | Immediately 16 |
| Apply expiry 30 June → 2 July 2032 | Applied; probe confirmed 2 July | Header still 30/6/2032 |
| Undo expiry | Undone | Header 30/6/2032, baseline restored |

No Continue, day advancement, navigation, save or reload was used between
Apply/Undo and inspecting those results. The game stayed at 16:30 throughout.
This establishes an attribute-panel refresh, not persistence or universal
refresh coverage. The contract-header cache was unresolved in this first test;
the follow-up below resolves the tested expiry header. No new
save/reload persistence claim is made by this test. Both edits were undone.

Mechanism: successful mutations queue entity/UID pairs; the shared frontend
edit callback flushes them through a separate command, deduplicated per
entity. It resolves the current target and uses the existing known-build,
current-career and main-thread call guards. A refresh error is reported
separately from mutation success so the user is not invited to repeat an
already-applied action. The notifier is mapped only for the ARM64 profile;
unmapped profiles skip it. No simulation or Continue call is made.

Static trace: `GAME_UI` singleton at RVA `0x56D48B8`, vtable slot `+0xA0`,
function RVA `0x30B50`. The notifier consumes a DB IDENTITY, constructs
entity references via `0x6585E4`, then issues `rfui` through `0x2FB64` /
`0x2FC20` / `0x77DB60` to active views. Runtime RTTI and the notifier slot
are checked. Player/staff identity offsets use the mapped layout, including
shifts; club/nation use direct IDENTITY inheritance, officials their virtual
base. The contract object itself is not an IDENTITY and is never passed as one.

Checks passed: frontend production build; cargo fmt; workspace Clippy with
warnings denied; workspace tests; separate no-default-features memory tests;
separate app Clippy with warnings denied; native debug Tauri app build.
Native Apply/Undo interaction was exercised on the copied career as above.

Cleanup: FM exited through its Quit dialog without saving or advancing. The
development app was closed; the installed 0.5.4 app was left running. The main
career SHA-256 matched its recorded baseline afterward; the disposable career
was also byte-identical to its source copy. Installed bridge and
launcher files, including compatibility filenames, were restored atomically
from the installed app resources. Debug bundles now also skip automatic
replacement of installed helpers. Steam configuration was not changed.


## Contract-header refresh without Continue (6 November 2026)

Follow-up on `codex/automatic-refresh` (0.5.5 source baseline `97ca87a`).
The earlier entity-only notifier refreshed attributes but left the contract
header cached. This is resolved for the tested expiry header by additionally
requesting an unfiltered refresh of active views after contract field changes
and successful Undo. The normal entity notification remains in place.

Static trace: `GAME_UI` slot +0x1B8 / RVA `0x33788`, called after FM's
transfer editor action at `0x238C95C`, forwards to `0x77DCFC`. It sends
`rfui` with an empty entity-reference vector at `0x56D6318`. The existing
active-view dispatcher `0x2FC20` calls the same serializer `0x77DB60` with
the same default options at `0x56D6300`, obtaining and releasing the current
view references itself. FM Lens now calls this dispatcher with a synchronous
zeroed scratch vector (begin/end/capacity), null panel list and zero panel
count. Its vector representation was checked against constructor `0x43FE850`
and serializer `0x43FC8F4`. This avoids retaining an editor-dialog context or
simulating navigation. The new call is allowlisted only in the known ARM64
profile and passes the existing main-thread, writable-build and current-career
guards. A batch requests this full-view refresh only once when contract fields
changed. Refresh failure remains separate from mutation success.

Live target reinspected: PID 57696, FM27 Steam 26340721, ARM64, module UUID
`F4540355-2186-39CB-9119-C706A6A35346`. Health checks passed, including
contracts, teams, staff, clubs, nations and officials. The new bridge was
loaded using the local launcher while Steam was running; Steam configuration
and installed helpers were not changed. The native 0.5.5 test bundle was
selected by its full path.

Explicitly loaded `FM Lens Refresh 2026-11-06.fm` through FM's Load Game
dialog. Initial game time: 11 Dec 2027, 16:30. Opened Bukayo Saka's Overview
and left it there throughout the experiment. UID 28122642; probe baseline
expiry 2032-06-30, wage 310000/week, Finishing 16.

| Action in FM Lens | FM's already-open profile header | Game time |
|---|---|---|
| Baseline | 30/6/2032 | 11 Dec 2027, 16:30 |
| Apply expiry 30 June → 29 June 2032 | Immediately 29/6/2032 | Unchanged |
| Changes → Undo | Immediately 30/6/2032 | Unchanged |

Apply was reported at 23:19:38, Undo at 23:19:53 in FM Lens. No Continue,
FM navigation, save or reload occurred between these observations. The page
stayed on Saka, and no unrelated news or navigation was observed. His wage
header stayed £300K p/w (FM's rounded display of the unchanged 310000).
This verifies the expiry-header refresh on this build; it does not establish
all contract fields, staff headers, Intel behavior, or new persistence results.
The sole test change was undone, and FM exited through its Quit dialog without
saving. The test bundle was closed; the installed app remained running.

Local evidence and checks: `reports/automatic-refresh/contract-*`. The main
and disposable career hashes were recorded before the test and compared after
FM exited. Both were unchanged. Installed bridge resources also matched the
installed app after the test. Frontend build, native debug bundle, formatting,
workspace Clippy/tests and separate app Clippy are recorded in those logs.

## Refresh every successful update (follow-up to 0.5.7)

The common refresh command now asks FM to refresh active views once after any
queued successful edit or undo, in addition to notifying each changed entity.
This covers single edits, logged game actions, mass edits, template apply/undo
and Changes undo, which all feed the same queue. There is no Continue or
simulation call. The broad active-view call remains mapped only for the known
ARM64 build; on profiles without that mapping, the refresh API reports it as
unsupported and skips it.

The copied-career checks above establish immediate refresh for one player
attribute and one contract expiry header on ARM64. They were run before this
follow-up, and do not prove every view or game action refreshes correctly. This
follow-up passed the frontend production build, `cargo fmt --all --check`,
`cargo test --locked -p fmlens-core` (94 tests), the bridge build and a native
Tauri debug bundle build. A new copied-career interaction check could not be
run: Football Manager was closed and Steam's native UI was not exposed to the
computer-use session. No save or Steam setting was changed.

## Edits show without Continue (7 November 2026)

FM Lens 0.5.8 (installed app), FM27 Steam build 26340721, macOS ARM64. Two
copies: `Fm Lens Checks 2026-11-07` (Arsenal, 11 Dec 2027 16:30) and the
reloaded `FM Lens Validation 2026-11-04` (8 Dec 2027 11:00). Each check: apply
in FM Lens, switch to FM and look at the screen already open or one opened
after, with no Continue. The clock never moved. Nothing was saved after the
edits.

| Action | FM before | FM after Apply | After Undo |
|---|---|---|---|
| Lift bans (3) | Hincapié Sus | BPR, ban gone | Not undoable here (see below) |
| Heal all (3) | Gyökeres Inj | Injury flag gone | Same |
| Refresh all (61) | Hincapié Match fit, Kvaratskhelia Rst | Fully fit, Rst gone | Same |
| Inspire all (45) | Atmosphere Poor, support Average, 3 issues, Hincapié Content | Excellent, Very good, no issues, Delighted | Poor, Average, 3 issues, Slightly Happy |
| Max attributes (1,483) | Hincapié's attributes, personality Driven | All 20, Born Leader, CA stars up | Original values and Driven |
| Max cohesion (18) | Team Cohesion Very Good | Excellent | Very Good |
| Max tactics (29) | Effectiveness bars mixed, some amber | Bars further right, green | Back near the start; FM keeps some manager knowledge, as noted in the roadmap |
| Transfer budget, Arsenal | £1.04M (portal tile) | £5M | £1.04M |
| Work permit revoke, Gilberto Mora | Active work permit | No Work Permit, re-apply immediately | - |
| Work permit grant, Mora | No Work Permit | Active work permit, until 30/6/2032 | - |
| Clubs Mass edit, transfer budget (Arsenal of 12 clubs) | £1.04M | £7M | £1.04M (Undo this mass edit) |
| Close promise, Nico Paz (playing time, due 23 Jan 2028) | Squad > Dynamics > Promises: 47 days, Acceptable | Pending Outcome, Succeeded | 47 days, Acceptable |
| Staff formation in possession, Albert Stuivenberg | 4-2-3-1 DM AM Wide (29) | 4-4-2 Diamond Narrow (7) | 4-2-3-1 DM AM Wide |

Max cohesion and permit grant needed a Continue before 0.5.8; with the refresh
after every update both now show at once. Max tactics and Max cohesion gave
"No changes made" on the first copy, which earlier tests had already maxed.

Changes from before a save was loaded are listed as "Earlier game" with no
Undo, for the group and for each row. The refusal inside the editor after a
career change (#95) is covered by its unit test; there is no way to reach it
from the interface.

The formation check also names three of FM's ids: 4 is 4-3-3 DM Wide, 7 is
4-4-2 Diamond Narrow and 29 is 4-2-3-1 DM AM Wide. In the 11 other clubs of
that mass edit FM Lens left the transfer budget alone, saying FM's record for
it is missing or looks wrong.

## Refresh on Intel under Rosetta (#107, 7 November 2026)

FM27 Steam build 26340721 run as x86_64 under Rosetta, with the release bridge
and FM Lens built from #107. Copy: `FM Lens Batch 2026-11-05` (Arsenal, 11 Dec
2027 16:30). Declan Rice's profile stayed open in FM; each check was read from
it with no Continue, and the clock never moved.

| Action | FM before | FM after Apply | After Undo |
|---|---|---|---|
| Finishing, Declan Rice | 11 | 15, with the change arrow | 11 |
| Contract end, Rice | £350K p/w 30/6/2030 | 30/6/2031 | 30/6/2030 |

FM was quit without saving. The main career and the copy's hashes were checked
before and after (OK). `FM Lens Validation 2026-11-04` was loaded once by
mistake on the way, not edited or saved; its hash is unchanged.


## Replace a like or dislike (7 November 2026)

FM27 Steam build 26340721 ARM64, with the bridge and FM Lens built from
`feat/preference-target`. Copy: `FM Lens Pref 2026-11-07` (a copy of `FM Lens
Batch 2026-11-05`; Arsenal, 11 Dec 2027 16:30). Continue was never pressed.

| Action | FM Lens | FM |
|---|---|---|
| Your favourite club, Arsenal -> Chelsea | Saved, in Changes | My Profile: "Favourite Club Chelsea" at once |
| Saka, Ezri Konsa (60) -> Declan Rice | Saved | Favoured Personnel: Declan Rice, Reason "Team-mates" |
| Saka, Ayodeji Eluwande (98) -> Albert Stuivenberg | Saved | Stuivenberg, Reason "Manager", the old entry's reason |
| Undo of the Stuivenberg change | "Undone" | Ayodeji Eluwande back, Reason "Manager" |
| Save in FM, quit, relaunch, load the copy | Probe: Saka favours Declan Rice (60) and Ayodeji Eluwande (98); no Konsa or Stuivenberg | Your profile: "Favourite Club Chelsea" |

FM keeps the Reason with the entry: Replace changes who a like points at, not
why. The copy was saved once on purpose for the reload; FM was then quit without
saving. The main career and `FM Lens Batch 2026-11-05` hashes were checked
before and after (OK).

## Helper compatibility across FM Lens updates (7 November 2026)

Local branch: `codex/helper-update-compatibility`, based on `9bda48c` (0.5.10).
This changes connection compatibility and optional refresh behavior, not field
layouts or the game-memory write guard. No game process was running during
validation. The installed FM Lens app, installed helper, Steam configuration
and careers were left alone.

The task-port request and game-call wire formats are unchanged. A new read-only
capability request reports the helper's loaded game-plugin UUID, allowed
functions, program limits and indirect-result support. The app caches successful
discovery for that opened process and intersects it with its own build profile;
it does not expand either allowlist. Game-action availability uses that
intersection, and the complete program is checked again before dispatch. Errors
during discovery are reported or leave game actions unavailable, and can be
retried; they are not treated as an earlier helper.

Earlier helpers drop the unknown request, producing the kernel's send-once
notice. FM Lens then retains their original call protocol and their own
allowlist checks. An explicitly unsupported call with zero executed steps gets
a separate error instead of a blanket restart instruction. Only automatic
screen refresh treats that error as an optional operation: it skips and remembers
the refused function for that Session, independently of the other refresh
function. Timeouts, wrong-build replies, partial execution, malformed replies,
missing helpers, read-only handles and career/value guards are not swallowed.
An old helper may leave FM's displayed value cached until FM refreshes it.
Actions requiring functions absent from an old helper remain unsupported; for
helpers predating discovery, that is established by their refusal when asked.
The staged helper loads on the next normal FM launch.

Native Mach IPC regression tests exercise an earlier helper dropping discovery,
then accepting a call, refusing another and accepting the next, without restart
or replay. Other tests cover discovery without any CALL message, function and
UUID mismatches, program limits, malformed replies, optional refresh caching,
preserved refresh errors, preflight before sending, and read-only refusal.
The new helper also refuses discovery by another user and advertises no calls
without a known game plugin.

Checks: frontend production build (the existing large-chunk warning remains),
formatting, workspace Clippy with warnings denied, workspace tests, separate
no-default-features memory tests, separate app Clippy with warnings denied,
probe/bridge build, Intel bridge compile check and native Tauri debug app bundle.
Logs are local under `reports/helper-update-*.log`; the bundle is
`target/debug/bundle/macos/FM Lens.app`, signed ad hoc, not installed or released.

Still unverified: an actual companion update/relaunch with FM kept open, a
copied-career Apply/Undo using an older helper, and live discovery with a new
helper on ARM64 or Intel. For that follow-up, record the game fingerprint and
copy's baseline, keep FM's PID unchanged while relaunching the updated companion,
check normal reads and one bounded edit/undo, confirm an unavailable optional
refresh does not invite repeating the edit, and complete the usual copied-career
FM inspection/save/reload procedure. Do not restart the user's main career to
test compatibility.

Release integration for 0.6.0 incorporates main through `ac0441e`. It removes
0.5.11's file-timestamp-based restart lock from Session, connection responses,
compatibility notices, reports and sample data; helper discovery replaces that
blanket lock. Unknown-build, health and current-career guards remain in force.

## Live check: UI smoke pass and future transfers (7 November 2026)

FM27 Steam build 26340721 ARM64. FM Lens 0.6.0 built from
`fix/squad-unhappy-count` (#136), on `main` at 0ea16e7 (#127 to #134). Copy:
`FM Lens Live 2026-11-07` (Arsenal, 11 Dec 2027 16:30). Continue was never
pressed. The copy was saved once on purpose, for the save and reload; FM was
then quit without saving. The main career's hash was checked before and after
(OK).

UI smoke pass:

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| What's new, Connect, Reload | 0.6.0 notes once; Connect; Reload reconnects after FM loads a save | - | - |
| Players: list, Saka's tabs, Edit | All render; Edit shows the Min/Max hints | - | - |
| Staff: list, Arteta's profile | Render; four jobs show as "Job 8", "Job 10", "Job 38" and "Job 66" | - | - |
| Clubs: Arsenal's overview and squad | Render; a fourth squad tab is "Team 4"; Jaded. shows raw values, some negative (-14, -48) | - | - |
| Lists: competitions, nations, officials; Changes | Render | - | - |
| Saka's Mood | Unhappiness "Reason 570, Internal, since 7 Dec 2027": the reason has no name | - | - |
| Squad Remove unhappiness, before #136 | Off with no count, though Saka has a concern | - | - |
| The same with #136 | 12 players; pressing it made 17 changes and turned it off | - | - |

Future transfers:

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| A loan agreed for a later day | - | 54 dated deals, all `FULL_TRANSFER_OFFER`; no loan to test | - |
| Emiliano Martínez (14020367), Chelsea -> Galatasaray on 31 Dec 2027, offer 134: cancel | Cancel transfer, confirmed; the button goes | 53 deals, not his | Profile: the transfer-arranged badge gone, transfer listed left |
| Chelsea's money around the cancel | - | Transfer budget 68,095,855 -> 60,146,760 at once; balance 219,763,571 unchanged | - |
| FM's news of the cancel | - | - | No news item or message |
| Rodrigo Piñeiro (78085122), free agent, to ATG on 5 Jan 2028 (offer 246): Sign for Danubio, joins 20 Jan 2028 | Signed; one Cancel transfer | One deal: Danubio, 20 Jan 2028, offer 381; ATG's gone | - |
| Save in FM, load the copy again | Reload: connected, 11 Dec 2027; Piñeiro still has Cancel transfer | 53 deals; no Martínez; Piñeiro to Danubio only; Chelsea 60,146,760 | Martínez: transfer listed only |

Findings:

- Remove unhappiness on the squad screen never turned on: the squad rows left
  out the unhappy flag. Fixed in #136 and checked above.
- Still shown raw: staff jobs 8, 10, 38 and 66, unhappiness reason 570, the
  fourth squad tab and jadedness. Named in the next section.
- The selling club's transfer budget fell by 7,949,095 when the deal was
  cancelled; in Round 2 the buying club's rose. FM seems to move transfer
  budgets when it agrees a deal, and the cancel reverses that. The fee was not
  read, so this is not confirmed.
- FM gives no news of a cancelled club deal.
- Signing a player for a later day replaces his pending deal with no warning in
  the Sign dialog. Now warned; see "Sign dialog: a pending deal".
- The Sign dialog's empty Contract end shows today's real date, not the game's,
  as its placeholder. Now blank; same section.

## Windows reads (7 November 2026)

FM27 Steam build 26340721 on Windows Server 2022 (an AWS g4dn.xlarge), with
`fmlens-probe` built from `feat/windows-offsets`. Save: a new Arsenal career at
2 November 2026. Reads only; nothing was written to the game.

| Read | Result |
|---|---|
| Officials | 1,061; Hyun-Chul Moon first, CA/PA 200/200 |
| Competitions, awards, kinds of injury | 8,084 (721 women's), 3,902 and 136 |
| Competition rules | The Premier League's 52 rules, from both copies |
| Nation | England: ENG, London, FIFA ranking 4 (1,922.83 points), Thomas Tuchel |
| Club relations, links, league, nation | Arsenal: Tottenham 100, Man Utd 90; Boreham Wood; England |
| Staff likes, licence, formations | Arteta 12 and Guardiola 22 likes, both Continental Pro |
| Team manager | Arsenal's senior team points at your manager |
| Work permits, future transfers, loans | Gabriel's England permit active; 34 future transfers; 1,343 loans |
| Languages | Odegaard and Arteta as on macOS; Gabriel French and Croatian |
| Cohesion | Arsenal's players: Gabriel and Saka 100, Rice 62 |

Future transfers and work permits first read none: MSVC vtables keep no offset
to the player's identity block, so Windows now takes it from the layout. Still
off on Windows: promises (none in this save to read), tactics, the human
manager's flags, the game's own actions and the editor. These need the Windows
bridge and its call RVAs. See the next section for the game's own actions.

## Windows game actions (7 November 2026)

Same machine and build, with the Windows bridge from `feat/windows-bridge`. Save:
the Arsenal career at 13 July 2026, run by a test harness that calls the same
`Session` methods as the app. Every action was undone or reversed in the same run,
and the career was never saved: the save file's SHA-256 stayed
`AF20CBAC…2CB747E5` throughout. FM kept responding and showed no error after each.

| Action | Result |
|---|---|
| Refresh views and one player | Both ran |
| Injury | An injury added to Gabriel, then healed |
| Work permit | Gabriel's England permit revoked, then restored |
| Loan | Gabriel loaned to Brentford for 60 days, then the loan ended early |
| Free agent | A free agent signed for Brentford to 30 June 2030, then released |
| Future transfer | Agreed and listed; cancelled one, then all |
| Transfer | Dwayne Mason, Brentford to Fulham and back |
| Tactics | Arsenal's 25 players raised from 50 to 100, then undone |
| Manager move | Your manager to Brentford and back |

The first free-agent signing stopped the game with an access violation in the
signing function: on Windows its second argument is the player's
`ACTUAL_PERSON`, 0x28 into the person block, not the block's start as on macOS.
The layout now names that offset (`actual_person`) for players and staff.
Moving your manager back leaves the manager it displaced without a job, as in
the game.

## Raw values named (7 November 2026)

FM27 Steam build 26340721 ARM64. FM Lens 0.6.0 built from
`fix/raw-value-labels`, on `main` at 4bd8f95 (#137). Same copy as above
(Arsenal, 11 Dec 2027). Continue was never pressed and the copy was not saved.

Each name is FM's own, read from the staff or player screen of a holder:

| Value | Holder in the probe | FM shows | FM Lens now |
|---|---|---|---|
| Job 8 | David Hopkinson (Newcastle), Billy Hogan (Liverpool) | Managing Director | Managing Director |
| Job 10 | Ross Wilson (Newcastle), Julian Ward (Liverpool) | Director of Football | Director of Football |
| Job 20 | Albert Stuivenberg, Raúl Valbuena (Arsenal) | Assistant Manager, on the Club overview's staff list | Assistant Manager, was Assistant Coach |
| Job 24 | Maria Begoña Santiago Ramos (Estoril Praia), 3 holders | General Manager | General Manager |
| Job 38 | Adem Hallard (Newcastle) | Chief Doctor | Chief Doctor |
| Job 46 | Max Thompson (Liverpool) | Doctor | Doctor |
| Job 62 | Thomas Coffield (Newcastle) | Head Performance Analyst | Head Performance Analyst |
| Job 66 | John Henry (Liverpool) | Owner | Owner |
| Unhappiness reason 570 | Saka, his only concern | Worried about the poor dressing room atmosphere | The same, Internal, since 7 Dec 2027 |
| Team kind 22 | Arsenal's fourth team, no players | Youth Candidates | Youth Candidates tab |

Kind 22 is the only one of its kind among the teams of the top 400 clubs, at
the human club; FM has no other extra team view.

Jadedness (`+0x252`, -500 fully rested). FM's Fitness card:

| Player | Stored | Energy | FM shows |
|---|---|---|---|
| Piero Hincapié | 302 | - | Match fit |
| Kylian Mbappé | 397 | - | Tired after last match |
| Kalvin André | 400 | - | Match fit |
| Khvicha Kvaratskhelia | 401 | 8,994 | A little jaded and could do with a rest (Rst) |
| Bukayo Saka | 404 | 9,007 | Match fit but starting to get jaded |

So a player is jaded above 400. FM's wording past that line seems to depend on
energy too, so FM Lens shows only "Jaded" or "-", with the stored value on
hover.

| Check | FM Lens |
|---|---|
| Staff list | The seven jobs show their names; no "Job N" left |
| Arsenal's squad tabs | First team, U21, U18, Youth Candidates |
| Arsenal's Jaded. column | Saka, Rice and Kvaratskhelia "Jaded", the rest "-" |
| Saka's Mood | "Worried about the poor dressing room atmosphere, Internal, since 7 Dec 2027" |
| Saka's Medical | Jadedness "Jaded"; Edit shows 404 with Min -500, Max 1,000 |

Unknown jobs, reasons and team kinds still show their number.

## Sign dialog: a pending deal (7 November 2026)

FM27 Steam build 26340721 ARM64. FM Lens 0.6.0 built from
`feat/sign-replace-warning`, on `main` at a1364ef (#130). Same copy as the live
check (Arsenal, 11 Dec 2027). Continue was never pressed and the copy was not
saved.

| Check | FM Lens | Probe |
|---|---|---|
| Jonathan Silva (14026625), free agent, to Negeri Sembilan on 26 Dec 2027: Sign for Danubio, joining today | Signed; Danubio, contract to 31 Dec 2028 | 54 -> 53 deals; his is gone |
| Hugo González (67295025), free agent, to Getafe on 13 Dec 2027: open Sign, pick Danubio | "Replaces his move to Getafe on 13 Dec 2027" above the plan | - |
| The same dialog's empty Contract end | Blank (before: 07/11/2026, the real date). Focused, WebKit shows its date fields and picker | - |

Signing replaces a pending deal whether he joins today or on a later day, so
the line shows for any signing of a player who has one.

## Windows edits (7 November 2026)

FM27 Steam build 26340721 on Windows Server 2022 (the AWS g4dn.xlarge). FM Lens
0.6.0 built on the box from `fix/windows-icon` (#143, on `main` at 4a91fb7), the
app itself, not a test harness. Save: the Arsenal career in `Ayo Elu - Arsenal.fm`, at 13 July
2026. Continue was never pressed and the career was never saved: the save
file's SHA-256 stayed `AF20CBAC…2CB747E5`, and FM kept responding after every
step.

| Edit | Result | Undo |
|---|---|---|
| Attributes and ability, Gabriel (19242094) | Finishing 8 -> 15, CA 174 -> 180, PA 176 -> 185; FM's profile showed Finishing 15 | Changes |
| Contract, Gabriel | Wage £190,000 -> £250,000 p/w, expiry 30 Jun 2029 -> 2031; FM's header showed both | Changes |
| Mass edit, two players named Timber | CA set to 150: 2 changes | "Undo this mass edit" |
| Clone & templates | Saka copied onto Quinten Timber (37060952): 65 changes. Saka saved as a template (142 fields) | Changes |
| Freeze money, Arsenal (602) | `frozen.json` held club 602; off cleared it. Holding the balance needs time to pass, so it was not watched | Turned off |
| Squad: Heal | 3 changes | Changes |
| Squad: Refresh fitness | 54 changes; energy and sharpness 100% | Changes |
| Squad: Max morale | 24 changes; 20/20 | Changes |
| Squad: Max cohesion (experimental) | 18 changes. Four new signings skipped: "FM hasn't set his familiarity with this club yet" | Changes |
| Your manager, Ayo Elu (2002071616) | Unsackable No -> Yes; wage £281,250 -> £300,000 | Changes |

Changes then read "173 changes · 173 undone", and Gabriel's list row showed CA
174, PA 176 again.

Not run: Remove unhappiness and Lift bans (no Arsenal player was unhappy or
banned, so both were off), and saving, quitting and reloading an edited copy.
Max tactics is a game action, checked in "Windows game actions" above. What
Windows still lacks next to macOS is in `docs/internal/WINDOWS-PARITY-HANDOFF.md`.

## Windows installer, one copy at a time and self-update (7 November 2026)

Windows Server 2022 on the AWS g4dn.xlarge, signed in over RDP. FM was not running: none of this touches the game.

The installer was the `fm-lens-windows-installer` artifact of #147's Validate run (42413779944), FM Lens 0.6.1 with
the Windows updater (#146) and the one-copy guard (#147). Its zip matched the digest GitHub publishes for the
artifact (`sha256:05226e32…2b607cd8`), and `FM Lens_0.6.1_x64-setup.exe` had the same SHA-256 on the Mac and on the
box (`F85704E3…F1728ED4`). The update came from the published FM Lens 0.6.2 release.

| Check | Result |
|---|---|
| Silent install, `/S`, over SSH as Administrator | Exit 0. `FM Lens.exe` and `uninstall.exe` in `%LOCALAPPDATA%\FM Lens`, a Start menu entry, and FM Lens 0.6.1 in the user's installed apps. No administrator prompt |
| First run | The window opened on the connect screen with What's new for 0.6.1. `latest.json` (0.6.1) had no Windows entry yet, and the app showed no update notice or error |
| One copy at a time | With the window minimized, a second `FM Lens.exe` exited in 0.05 s with code 0. One FM Lens process remained, and its window was restored and in front |
| Update to the published 0.6.2 | With 0.6.2 published (#150), Settings, About, Check for Updates in the open 0.6.1 window downloaded it, and the colophon showed Relaunch to update. Relaunch closed FM Lens and started the installer the updater runs (`/P /R /UPDATE`) |
| Installer language on that update | The installer first asked for a language: the silent 0.6.1 install had stored none. After OK, FM Lens 0.6.2 opened 2 s later with What's new for 0.6.2. `FM Lens.exe` was 0.6.2, FM Lens 0.6.2 was the one entry in installed apps, one FM Lens process ran, and the desktop and Start menu shortcuts still opened it |
| Install by hand | After uninstalling and clearing the stored language, the published `FM-Lens-0.6.2-windows-x64-setup.exe` (SHA-256 `C2ACAC91…84927495`, the release's digest) asked for a language, then showed the welcome page, the folder (`%LOCALAPPDATA%\FM Lens`) and Finish with Run FM Lens and a desktop shortcut ticked. It stored the language |
| Update after an install by hand | The same installer run as the updater runs it asked nothing, and FM Lens reopened 2 s later |
| Installer art (#153) | The installer from #153's CI build (SHA-256 `D58A6409…FE813073`) showed the FM Lens icon in its title bar, page header and taskbar, and the FM Lens wordmark on its welcome and finish pages. FM Lens opened from Finish, with one entry in installed apps and one process |


## Frontend interaction CI (8 November 2026)

Branch `codex/frontend-interaction-ci`, based on main at `86c64b3`. Main already has a Windows runner with workspace Clippy/tests, writable-graph checks and an installer build. This follow-up adds `npm test` before the frontend build in both platform jobs. The test command type-checks its sources then runs Vitest/jsdom with React Testing Library and the preview's fixture command adapter; it never connects to FM.

Four interaction tests cover: every section shortcut isolated behind a modal plus Tab wrapping and Escape; an earlier search resolving after the latest search without replacing its rows; Keep editing and explicit Discard when navigation encounters pending values; and Settings saving an open snapshot, then reopening from it in a fresh module load. The modal test first failed for keys 7–9 on main, so this branch includes the shared shortcut definition already implemented and natively verified in `codex/modal-shortcut-isolation` (#149). This is the same narrow fix, not a new modal implementation.

Checks: all four tests and the production frontend build passed locally on macOS; the existing Vite chunk warning remains. Windows execution of the new tests requires the CI run and has not been claimed as a local Windows pass. No FM data was read or edited and no native UI was changed beyond that already verified shortcut fix. jsdom geometry/media shims are explicit in tests/setup.ts; these tests do not establish native rendering, performance, Windows bridge behaviour or edited-save persistence.


## Modal navigation shortcuts (7 November 2026)

Branch `codex/modal-shortcut-isolation`, based on main at `06963d9`. Section navigation and modal shortcut interception now share the same nine section keys, so shortcuts 7, 8 and 9 are intercepted along with 1 through 6. Added frontend regression checks for all nine keys on Mac and Windows modifier conventions, including modified/composing input and preservation of ordinary editing shortcuts; CI runs them with `npm test`.

Checks: both frontend shortcut tests, production frontend build and `git diff --check` passed. The existing large-chunk warning remains. Native verification then passed in the ad-hoc-signed Tauri debug app: connect sample data, open Lukas Kowalski, open Settings with Cmd+comma, press Cmd+1 through Cmd+9, observing Settings and its focus after each key. Escape returned to the same player profile; Cmd+9 then opened Changes normally. For this check only, the API adapter used the existing sample-data backend inside the native WKWebView; that temporary change was restored before committing. No FM process, career, game-memory write or installed app was involved. This verifies native keyboard/modal handling, not live-game editing or pending-edit consequences.


## Search result pagination (7 November 2026)

Branch `codex/list-pagination`, based on main at `198d4e2`. All eight list search commands accept an optional offset (omitting it retains page one), filter and sort before slicing, and cap responses at 200 rows. SearchIndex resolves equal rank and name with UID; player column sorts retain this stable base order. The frontend uses Previous/Next and the existing translated range labels; it resets for search/filter/order changes, retains an open profile, keeps old rows on request failure, and permits retrying that page. A refresh beyond the shortened list clamps to the last page.

Checks: production frontend build; app backend regression covering 451 equal-ranked/equal-named entries across three pages without gaps/duplicates, filtered reverse order, a short last page, out-of-range offsets and the response cap; preview interaction from 1–200 to 201–400 of 400 (200 rows each, no overlap), narrowed search and sort reset. No console errors/warnings in the exercised preview flows. The existing Vite chunk warning remains. All core/app library tests passed (99 core, 2 app), along with strict app Clippy with warnings denied and formatting/diff checks. Native interaction passed in an ad-hoc-signed Tauri debug bundle with the existing sample-data backend temporarily selected: Next showed 201–400 of 400, Previous restored 1–200 of 400, and Lukas Kowalski’s profile remained open on both pages. The pager was visually inspected beside the profile. The API adapter was restored afterward; no sample-mode change is included in source. Live-career paging, request-failure recovery and pending-edit consequences were not exercised natively. No FM connection or career edit was made.


### Live-career paging follow-up (7 November 2026)

Normal live-data native debug bundle from `codex/list-pagination`, FM27 Steam build 26340721 ARM64, module UUID F4540355-2186-39CB-9119-C706A6A35346, PID 2559. Loaded career: Ayodeji Eluwande / Arsenal, 11 December 2027, 16:30, matching FM's Portal. The read-only probe's 12 health checks passed. This was browsing only: no Apply, Undo, Continue, save or game restart. All 18 baseline career file hashes remained unchanged.

- Players: 30,300 results. Next showed 201–400; page-one leader Erling Haaland was replaced in the list by page-two leader Pau Navarro, while Haaland's open profile remained.
- Sorting by name from page two returned to 1–200 of 30,300.
- Search from page two: Silva returned 92 matches, with no pager. Alex returned 531; Next twice showed 401–531 of 531 with Next disabled, preserving Haaland's profile.
- Minimum age 20 applied from that last page returned to 1–200 of 426.
- Staff: 1–200 to 201–400 of 20,215. Clubs: 1–200 to 201–400 of 21,675; native club-page layout visually inspected.

The remaining five entity lists were not exercised live in this follow-up; they use the same paging helper and frontend. Request-failure recovery and pending edits were not exercised live.


## Search loading feedback (7 November 2026)

Branch `codex/search-loading-feedback`, stacked on pagination `2826943` (#151). A result is current only when its command, query, filters/order, offset, data version and retry generation match the active request. Pending requests hide cached rows, counts and ranges, show Searching in the table area, and disable page controls; the selected profile is retained. Empty states appear only after a matching successful response. Failures are scoped to their request, expose Retry and do not restore stale rows. English, Spanish and Turkish include the feedback strings. The count announces completion; the table has a direct accessible label so WebKit preserves its name.

Native verification used the real running Arsenal career (11 December 2027, 16:30), FM27 Steam 26340721 ARM64, module UUID F4540355-2186-39CB-9119-C706A6A35346, PID 2559. Temporary API instrumentation delayed Alex searches by 20 seconds and failed the first __retry_check__ query; these changes were removed before the final build/commit. Confirmed pending Alex has only table headers, Searching feedback and disabled page controls (where present), without old rows/count/range; feedback also remains visible without a pager. Haaland's open profile survives search changes. A newer Silva search returns 92 players and stays current after the delayed Alex request finishes. An injected failure has no stale rows, labels the grid Search failed and offers Retry; Retry completes with 0 players and the matching empty message. Visual inspection covered the loading screen. No game-data edit, Continue or save was used.

Checks: frontend production build, native Tauri debug bundle, source detector (no findings) and diff checks passed. All 18 baseline career hashes remained unchanged. The existing Vite chunk-size warning remains. No Rust/domain code changed in this follow-up; earlier pagination Rust test evidence is recorded above.


## Verified promise and formation names (8 November 2026)

Branch `codex/promise-formation-labels`. Display-only mappings: promise 1 is Playing time, from the corrected Nico Paz check in "Six features" above (promise 7 was a different, category-0 record and is not named). Formation IDs 4, 7 and 29 use the 7 November native edit/undo observations; 22, 28, 30 and 63 use the FM screen comparisons in docs/recon/fm27-staff-extras.md. The same formation mapper supplies profile display, editable choices and Changes through choiceLabel. Unmapped promises retain Promise N; unmapped formations now say Formation N, localized in all three dictionaries. Zero still means none. Formation notation keeps the observed English FM spelling; localized promise/fallback wording is a translation, not a separately verified foreign-language FM string. No new IDs were inferred from language-resource strings or tentative disassembly.

Checks: production frontend build, native ad-hoc-signed Tauri debug bundle, source detector and diff checks passed (the existing Vite chunk warning remains). Native live-career display check on the known ARM64 build, Arsenal / Ayodeji Eluwande, 11 December 2027: Nico Paz’s Mood shows Playing time, made 24 November and due 23 January; Arteta’s Attributes shows 4-2-3-1 DM AM Wide in possession and 4-4-2 2DM out of possession. No Edit/Apply, promise closure, Continue or save was used; all 18 baseline career hashes are unchanged. Other mapped formation labels and localized wording were not newly compared in FM during this pass. Additional IDs remain unmapped.

## Runtime assets and deferred browsers (8 November 2026)

Compared main `86c64b3` with the runtime-logo/deferred-browser change on this
Apple Silicon Mac. Both used production Vite output embedded in an ad-hoc signed
debug Tauri app. The original transparent logo master is unchanged; the runtime
mark is a 120×120 PNG displayed at the existing 40×40 CSS-pixel size.

| Build payload | Before | After |
|---|---:|---:|
| Runtime symbol PNG | 800.43 kB, 1254×1254 | 12.56 kB, 120×120 |
| Main JavaScript entry | 683.91 kB | 430.32 kB |
| Eager JavaScript, including module-preloaded shared code | 683.91 kB | 635.45 kB |
| Secondary browsers loaded on first visit | None | Seven chunks, about 53.9 kB combined |

The shared editing chunk is eagerly preloaded and included in the total above;
the smaller entry alone is not the startup payload reduction. Players remains
eager. Staff, clubs, nations, competitions, awards, stadiums and officials load
on first visit and remain mounted afterward. The loading fallback is a busy
status labelled for its section, translated in English, Spanish and Turkish.

Temporary instrumentation posted timing samples only to a loopback collector.
It measured webview navigation start to the connect panel's double-animation-frame
paint, Connect click to the first player count's double-frame paint, and Staff
click to the next double-frame paint. Samples used freshly launched companion
processes against an already-running game, with ordinary OS/WebKit caches;
these are not machine-reboot cold-cache or release-build benchmarks. Webview
readiness excludes native process bootstrap. Staff paint can include the loading
fallback, so it does not measure completion of every section's data retrieval
or establish INP. Two comparable instrumented runs per version gave:

| Native timing | Before, samples | After, samples |
|---|---|---|
| Webview ready | 631, 543 ms | 996, 357 ms |
| Connect to player results | 9438, 3480 ms | 3483, 2540 ms |
| First Staff click to paint | 221, 500 ms | 171, 94 ms |

The samples are too few and variable to establish a reliable launch, connection
or interaction speed improvement. The established improvement is payload size:
98.4% less runtime-logo data and 7.1% less eager JavaScript. No backend connection
or search behavior was changed. Local timing instrumentation, its temporary CSP
override and loopback collector are not part of the shipped source.

Native interaction used the running Steam ARM64 game, PID 2559, module UUID
F4540355-2186-39CB-9119-C706A6A35346, build 26340721. FM showed Arsenal,
11 December 2027, 16:30; FM Lens identified Ayodeji Eluwande. Players (30,300),
staff (20,215), clubs (21,675), nations (227), competitions (8,084), awards
(3,902), stadiums (19,234) and officials (1,166) rendered. Searching staff for
Arteta, opening Mikel Arteta, switching to Clubs and returning retained both
the query and profile. Changes showed No changes yet. The masthead mark was
visually checked in the native app. No Apply, Undo, freeze or save was used;
all 18 pre-recorded career-file hashes stayed unchanged.

Checks: clean npm install (zero reported vulnerabilities), TypeScript/Vite
build, debug Tauri app packaging, Impeccable detector on App.tsx, and diff
whitespace checks passed. This is local macOS UI evidence; Windows native
execution and release-build performance were not measured.

## Transfers, swaps and releases through the game (8 November 2026)

FM27 Steam build 26340721, macOS arm64, with a helper built from this branch.
Save: a disposable copy of the Arsenal career at 8 December 2027, never saved
over another; the main career's SHA-256 stayed `3ADEB4FD…BD956000`. Each action
was made in a debug build of FM Lens, then checked in FM's own screens.

| Action in FM Lens | FM shows |
|---|---|
| Move: Alex Iwobi, Fulham to Everton, £10M | Everton's Transfers In: Iwobi from Fulham, £10M. Fulham's Transfers Out: Iwobi to Everton, £10M. His contract to 30 June 2029 kept |
| Swap: Iwobi (Everton) and Calvin Bassey (Fulham) | Everton: In Bassey £0, Out Iwobi £0. Fulham: In Iwobi £0, Out Bassey £0. Both contracts kept |
| Release: Bassey from Everton | Free Agent, value £0. No Transfers Out row at Everton |

The dialog said who pays whom and that it can't be undone; Changes listed all
four with no Undo. Career history keeps no row for a club the player left this
season: Iwobi's shows Fulham 2027/28 and no Everton row, and Bassey's ends at
2026/27. An earlier release through the probe (Ermedin Demirović, Fulham) showed
the same, as FM's editor does. In an earlier probe transfer the selling club's
balance rose by about 84% of the fee; that split was not traced.
