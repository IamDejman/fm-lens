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
  tested. Staff freezes were connection-local then; they are now remembered
  with the save (see "Freezes held over a long holiday" below).
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

## Human manager: unsackable flag (persistence tested)

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

Verified live on 8 November 2026 (see "Live check: update and relaunch with FM
open" below): an actual 0.6.1 to 0.6.2 update and relaunch with FM kept open,
then reads and one bounded Apply/Undo through the helper FM had already loaded,
which answers discovery, on ARM64. Still unverified live: a copied-career
Apply/Undo using an older helper, an unavailable optional refresh (the loaded
helper supports refresh, so that path could not be reached; the native tests
above cover it), and discovery on Intel. Do not restart the user's main career
to test compatibility.

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

## Live check: update and relaunch with FM open (8 November 2026)

FM27 Steam build 26340721 ARM64 (27.0.0, Apple silicon), game plugin UUID
`F4540355-2186-39CB-9119-C706A6A35346`. FM ran as PID 2559 (started 7 November
22:23:49) for the whole check and was never restarted. Copy: `FM Lens Live
2026-11-07` (Arsenal, 11 Dec 2027 16:30), SHA-256 `e313122f…`, unchanged
afterwards. The main career's hash (`3adeb4fd…`) matched before and after.
Continue was never pressed.

FM had loaded the helper installed at 21:50 on 7 November: SHA-256 `1f3cf31c…`,
the release build made at 14:37 from the 0.6.0 preparation merge (`94812b9`), so
it answers discovery.

Update path: a copy of the installed FM Lens 0.6.1 bundle, run with its own data
and exports folders (`FMLENS_DATA` and `FMLENS_EXPORTS` set with `launchctl
setenv`, because the relaunch goes through `open -n` and keeps only launchd's
environment). Its own updater found 0.6.2 on the release feed, installed it in
the background and showed Relaunch to update. Pressing it started 0.6.2 at
04:24:30 on the same data.

Each launch refreshed the installed helper by writing a new file and renaming
it: 0.6.1 replaced `1f3cf31c…` with its `977a6398…` at 04:17:45, and 0.6.2
replaced that with `1f9dec63…` (launcher `4d301473…`) at 04:24:32. FM kept
mapping its original file (inode 639157841) to the end.

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| 0.6.1 connects to the running FM | Connected | - | - |
| Update, then Relaunch to update | 0.6.2 opens on the same data and shows its What's new | - | PID 2559 unchanged |
| Reads after the relaunch | Connected: Ayodeji Eluwande, Arsenal, 11 Dec 2027, 30,300 players; Saka (28122642) Finishing 16 | 80 (16) | - |
| Apply Finishing 16 -> 17 | "1 change applied.", no refresh warning; Changes 1 | 85 (17) | 17 with the improvement arrow, without Continue |
| Save Game As `FM Lens Update 2026-11-08` | - | - | Saved (`f7c6040f…`) |
| Undo | Undone at 04:29:43, no warning | 80 (16) | 16 at once |
| Load `FM Lens Update 2026-11-08` in FM, without quitting | Reload: connected, 11 Dec 2027; Finishing 17 | Health passes; 85 (17) | Finishing 17 |

Findings:

- An update with FM open works: the relaunched companion connects to the helper
  FM already loaded, then reads, applies and undoes without restarting FM. The
  optional refresh after Apply and Undo ran (FM showed 17, then 16, without
  Continue).
- An unavailable optional refresh could not be reached live, because this
  helper supports refresh. In code, core skips a refresh an older helper refuses
  (`older_helpers_skip_only_the_refused_refresh_and_keep_other_calls_working`),
  and `refresh_game_ui` reports any other refresh failure apart from the write
  ("Changes applied, but FM's screen could not refresh"), so neither invites
  applying the change again.
- FM does not count FM Lens edits as unsaved: loading another save after the
  Undo gave no prompt to save, though the game had changed since the save.
- Debug and release builds share the bundle id `local.fm.lens`, so they share
  WebKit storage; `FMLENS_DATA` does not separate it (for example, the What's
  new seen version).

Hashes and timings are local under `reports/update-live-2026-11-08/`.

## Disposable-career persistence: moves, clauses, templates and freezes (8 November 2026)

FM27 Steam build 26340721, native ARM64, FM PID 2559 for the whole run (FM was
never quit). FM Lens 0.6.2 ran as an isolated copy with its own data folder
under ignored `reports/persistence-2026-11-08/`, where the probe readings for
every stage also stay. The copy `FM Lens Persistence 2026-11-08.fm` was saved
from the main career at 11 Dec 2027, Arsenal. The main career's hash
(`3adeb4fd…`) matched before and after.

Order: baseline probes; edits in FM Lens; freezes on; Save Game As; that save
loaded in FM and FM Lens Reload; a 23-day holiday to Mon 3 Jan 2028; save and a
second load; the human manager's Change club; one day; save and a third load.
Every load was FM's own Load Game in the running process, not a quit and Steam
relaunch. A successful game call or probe readback was not taken as
consistency: each subject's linked records (club lists, history, registration,
finances, staff lists, news) were checked on FM's screens as well.

### Structural moves

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| Jaidon Anthony (player 28112512) Brentford -> Everton, £12M fee | Applied | Everton, contract re-signed 2027-12-11, wage and expiry kept. Brentford balance -£21,631,777 -> -£9,631,777; Everton balance and transfer budget each -£12M | In Everton's squad as "Unr" (unregistered); #19 and registered after the holiday. Not in Everton's Transfers In. No 2027/28 Brentford row in his history and no fee anywhere (FM shows AI finances only as a band, "Rich") |
| Rico Henry (29129073) and Kenny Tete (37039829), Brentford/Fulham swap | Applied | Each at the other club, contracts re-signed 2027-12-11, wages and expiries kept | Fulham lists 32 players, Henry in and Tete out. Henry's only 2027/28 row says Fulham, with his 15 Brentford apps; no transfer row or fee. After the holiday Henry #20, Tete #42 |
| Fábio Carvalho (28122195) released by Brentford | Applied | No club, no contract | Free agent. His 2027/28 Brentford row (15 apps) is gone from his career history |
| Mehmet Ali (staff 28111724) Brentford -> Bournemouth | Refused: Bournemouth's coaching list is full | Unchanged | - |
| Mehmet Ali Brentford -> Everton | Applied | Everton coach, signed and joined 2027-12-11 | Everton Senior Squad coach, gone from Brentford's staff |
| Kevin O'Connor (staff 5101541) Coach -> Scout | Refused: Brentford's scouting list is full (16) | Unchanged | - |
| O'Connor Coach -> Performance Analyst | Applied | Performance Analyst | Brentford's staff list shows Performance Analyst |

Every moved record read the same after the first load, the holiday and the
second load, apart from live values (energy, reputation drift) and the game's
own later changes: new squad numbers, and Tete made a player-coach during the
holiday (his person block moved 0xf8).

Findings:

- A move, swap or release changes the pointers and contract; it is not FM's
  transfer. FM keeps no transfer row, no Transfers In entry and no fee in any
  history, though the fee does move between the balances. This season's
  appearances follow the player to his new club's row (Henry) or vanish with a
  release (Carvalho). History and statistics consistency is not provided.
- Registration sorts itself out: Anthony stayed unregistered at Everton until the
  game gave him #19 during the holiday.
- Full staff lists are refused before anything is written.

### Clauses

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| Cristhian Mosquera (2000030816) wage rise after 40 league games, £78,000 -> £80,000 (kind 13) | Applied | 80000, condition 40 | "£80K p/w after 40 league games" |
| Gilberto Mora (2000496104) wage rise after 25 games (£105,203, kind 13) removed | Applied | Gone, his other four unchanged | Gone |
| Mora £150M release clause added (kind 0) | Applied (Jack Porter's list had no free slot) | Kind 0, 150000000 | £150M release clause beside his other clauses |

All three read the same after the first load, the holiday and the second load.

### Template on three players

A template captured from Ethan Nwaneri (2000283271) was applied in one batch to
three Arsenal youth players: Theo Julienne (2000407522), Josh Ogunnaike
(2000407536) and Khari Ranson (2000407546, a goalkeeper).

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| Apply to three players | One batch applied | All three read Nwaneri's CA/PA 140/160, every attribute, feet, personality and positions | Ranson matches Nwaneri on every attribute; his potential stars lag (3 against Nwaneri's 4.5 at the same PA) |
| First load | - | Same | - |
| 23-day holiday and second load | - | Copied attributes kept, plus normal growth. Each player's own positions came back beside the copied ones: Julienne DM 20, WBR 15; Ogunnaike DL 20, DC 14, WBL 16; Ranson GK 20 | Ranson is a goalkeeper again, with the copied keeper attributes of 1 to 4 |

Finding: positions written by a template do not stay as written. Within the
holiday the game put back most of each player's old positions (all of
Ogunnaike's and Ranson's; Julienne's DM, and WBR one lower, but not DR), so each
now has two sets. The game seems to keep natural positions somewhere FM Lens does
not write. Attributes, feet and personality held.

### Freezes over 23 days

Frozen: Lionel Messi's attributes (player 7458500), Steve Wigley's attributes
(staff 2005929) and Arsenal's money (club 602). Unfrozen controls: Junior
Messias, Ross Barkley, Huw Jennings, Brentford and Fulham.

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| Arsenal money, 23 days | Still ticked: "The balance can't go down while FM Lens is connected." | £212,329,659 -> £181,632,461 (-£30,697,198) | - |
| Messi's attributes, 23 days | Still on | No attribute changed | - |
| Wigley's attributes | Gone after the first FM Lens Reload, with no note | No attribute changed | - |

The money freeze failed. What was established:

- `hold_money` ignores every write error, so a refused hold leaves no trace.
  Which guard refused it during the holiday (the career lock, the target check,
  or a value conflict while FM was working out a day) is not established.
- FM Lens reloads only when its window gets focus, so it stayed on stale data
  for the whole holiday.
- On focus, Reload compares the players' targets (UID, address, layout shift)
  with the ones it had. Tete's person block had moved 0xf8 when he became a
  player-coach, so Reload decided it was another game: it showed "Freezes from
  last time are back on", froze Arsenal again at £181.6M and dropped undo for
  all 215 changes in the log.

The Messi result is inconclusive: no control lost an attribute in the 23 days
either (Barkley's CA fell 133 -> 132 with the same attributes). The staff
freeze is held in memory only, so any Reload drops it.

Clubs' finances over the holiday, for reference: Brentford -£9,631,777 ->
-£5,446,930, Fulham -£94,362,632 -> -£53,557,712, Everton £287,795,251 ->
£277,998,905, Bournemouth £56,924,424 -> £52,420,817.

### Human manager: Change club

On Mon 3 Jan 2028, after the holiday, FM Lens's Change club moved Ayodeji
Eluwande (staff 2002071958) from Arsenal to Brentford. FM needed a tactic
(Brentford had "No Tactic Set"), introductions and captains before Continue,
as for any new job.

| Check | FM Lens | Probe | FM |
|---|---|---|---|
| Change club Arsenal -> Brentford | Preview "Arsenal -> Brentford / Keith Andrews loses his job / It can't be undone."; header then shows Brentford | Brentford, new contract £144,282 p/w, 2028-01-03 to 2030-06-30 (was £281,250 p/w at Arsenal). Reputation home 2881 -> 3000, current 7872 -> 7172, world 2486 -> 2687 | "Eluwande takes charge at Brentford"; the career now runs at Brentford. Wage budget £245K p/w over |
| Keith Andrews (staff 103353) | "loses his job" | No club, no contract | Free agent; news "Andrews eyes Arsenal job". His staff history row "25- BRE Manager" stays open, with no end year |
| Arsenal | - | No change from the move | Caretaker David Horseman. Kepa left the first-team list for the U21 list at once (28 -> 27 and 28 -> 29). Players' morale moved |
| Brentford | - | - | U21 captain Callum Wilson -> Beau Redknapp |
| One day later | - | Only Arsenal's balance moved. The U21 managers (James Marwood, Sam Saunders) unchanged | Job History lists only Arsenal 2027/28 and 2026/27; the biography says he moved on to Brentford |
| Save and third load | Reload shows Brentford | Staff and clubs identical to the day before; both teams have the same players and captains, only live energy, sharpness and morale differ | Job History still has no Brentford row |

Findings: the move holds and FM treats it as a real appointment (contract,
reputation, caretaker, news, onboarding). Two history records are not
consistent: the manager's Job History gains no Brentford row in a day or after
a load, and Andrews' Brentford row stays open although he is a free agent.
Whether FM adds the row later (at season end, say) was not checked.

### Nits

- After a refused job change (Scout, list full), the error stays under the field
  when another job is picked, until Apply.
- The staff freeze shows no note like the player and money freezes do, and is
  not remembered across a Reload.
- FM does not count FM Lens edits as unsaved: loading another save gives no
  prompt, so unsaved edits are lost without a warning.
- FM Lens shows stale values until its window gets focus.
- "Freezes from last time are back on" stays after both freezes are turned off.

After the run both freezes were turned off (the app's frozen list is empty) and
the main career's hash still matched.

## Freezes held over a long holiday (8 November 2026)

Branch `fix/freeze-hold`, debug bundle with its own data folder (`FMLENS_DATA`
under ignored `reports/`). FM27 Steam build 26340721, ARM64, PID 2559, copy
`FM Lens Persistence 2026-11-08` (Brentford, 4 January 2028). The main career's
hash was checked unchanged.

Frozen before the holiday: Brentford's money (balance -£5,446,930, wages about
£1.89M a week), Virgil van Dijk (36, CA 159) and N'Golo Kanté (36, CA 144), and
the staff member Florentino Pérez. FM's Go On Holiday ran to 4 February 2028
(31 days, all offers rejected). FM autosaved to the copy twice on the way.

| Check | Result |
|---|---|
| Brentford balance after 31 days | -£5,051,283 in FM Lens; FM's Finances: Overall Balance (£5.05M). Never below the floor |
| Transfer budget | £641 -> £0. Not held: a money freeze holds the balance only |
| van Dijk, Kanté, 47 attributes | No drops. van Dijk free kicks 12 -> 13 |
| Unfrozen players aged 35+ with CA 120+ (127) | 59 lost at least one point, 117 points in all (Schär 18, Alaba 9, Koke 5) |
| Pérez | Still frozen, listed in `frozen.json` with the players and the club |
| App log | No refused writes, no re-read of the game |
| Reload after the holiday | Freeze money still on, balance unchanged |

Exports before and after are in the ignored `reports/freeze-hold-2026-11-08/`.

### Same check on Intel FM with an older helper (8 November 2026)

FM restarted under Rosetta (`arch -x86_64`, PID 1201) with the v0.5.9 x86_64
helper, which predates helper discovery. Same debug bundle and data folder, same
copy, loaded at 4 February 2028.

| Check | Result |
|---|---|
| Connect | Intel build profile matched; banner listed van Dijk, Kanté, Pérez and Brentford's money as back on |
| Brentford balance over 7 days (Go On Holiday to 11 February) | -£5,051,283 -> -£5,040,452. Never below the floor |
| App log | Two `read the game again ... (same game: true)` lines during the holiday; freezes kept |
| Refused hold logged | One line when the ARM64 FM was quit earlier: club 617 balance record missing |
| Edit with the old helper | Training facilities 13 -> 14, Apply, then Undo: both applied, no error, FM and FM Lens stayed up |

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

## Windows: every feature on main (8 November 2026)

FM27 Steam build 26340721 on the Windows test box (Windows Server 2022, g4dn.xlarge),
FM Lens 0.6.2 built from `feat/windows-parity`, driven over RDP. Save: a copy of the
Arsenal career at 13 July 2026, written with FM's Save As as
`FM Lens Windows 2026-11-08`; the test save `Ayo Elu - Arsenal` kept its SHA-256
`AF20CBAC…B747E5` before and after. A second Save As, `FM Lens Persist Check`, was used for the relaunch test. Each action was made in the app, then checked in
the app's Changes list and, where FM shows it, in FM.

| Feature | Result | Undo |
|---|---|---|
| Release through the game's call (Mariona Caldentey, Arsenal) | Pass. The dialog said it can't be undone; she became a free agent and Changes shows Arsenal to Free agent with no Undo | None, by design |
| Max cohesion | Pass. 18 familiarity changes; FM's Squad > Dynamics > Team Cohesion went from Average to "an extremely strong" bond | Undo restored all 18 |
| Unsackable | Applied, read back Yes. No sacking situation was set up, so the effect in FM is not observed | Undone |
| Register squad any time | Applied, read back Yes. July is inside a registration window, so the effect in FM is not observed | Undone |
| Official edit, then refresh (Abdel Al-Rahman Salameh, reputation 985 to 1,000) | Pass. Applied and read back 1,000 through the new `identity = 0x138` refresh; no error | Undone |
| Players, Staff, Clubs and Officials lists, 200-row pages (#158) | Pass. 25,027 players, 19,308 clubs and 1,061 officials load in 200-row pages | None needed |
| Manager contract tab, freeze controls present (#161) | Pass. Tickboxes present, and the freeze holds across a day and a relaunch (see the freeze row) | None needed |
| Promises (Jurriën Timber, play him in his preferred position and role, made 1 Aug 2026, due 28 Jan 2027) | Pass. The promise was made in FM on a copy career, then the new `[promise]` layout traced from it. The Mood tab listed it as FM's Promises page did. Close: FM showed it Succeeded at once; memory read due 1 Aug 2026, closed 1, status 1 | Undo restored every field; FM showed it open again, 181 days left, Too Early To Judge |
| List filters (#157) | Pass. Players "Free agents only" went 25,027 to 2,990; Clubs reputation 9,000 or more went 19,308 to 6 | None needed |
| Contract edit (Declan Rice wage, squad number, transfer listed) | Pass. Wage read back £275,000 and survived the Save As and relaunch (typed 260,000, landed 275,000, cause not found). FM's Contract screen does not show squad number or listed status, so those are checked in the app only | Not undone: later replaced by the move |
| Contract clauses (appearance fee, release clause) | Pass. FM's Contract screen showed $88K appearance fee and a $67M release clause. The dialog only offered a release clause when a slot was free; no sell-on option appeared | Not undone |
| Move: Transfer (Rice, Arsenal to Man City, no fee) | Pass. FM shows Man City and squad number 14 | None, permanent |
| Move: Loan, then End loan (Rice, Man City to Barcelona) | Pass. FM showed Man City with a loan icon plus Barcelona, then the Barcelona line went after End loan | None, permanent |
| Move: Swap (Rice with Lamine Yamal) | Pass. FM shows Rice at Barcelona. The Yamal side was not opened in FM | None, permanent |
| Move: future-dated Sign, then Cancel transfer (Caldentey, Arsenal, joins 20 Jul 2027) | Pass. FM showed the "Trn" badge and the app a Future transfer block; Cancel transfer returned her to free agent in FM | None, permanent |
| Freeze attributes (Saka) and Freeze money (Arsenal) (#161) | Pass. Continue pressed once in the copy (13 to 14 Jul). Saka's Corners 5 and Finishing 20 and Arsenal's balance £329,887,681 held. Pre-season has no wage run on that day, so no natural drop was seen to block | Untick restores normal play |
| Squad actions: Add injury, then Heal (Saka); Heal (3 injured players) | Pass. FM showed "Inj" and an abdominal strain, then healthy; Con hearts green after Heal | None needed |
| Remove unhappiness | Pass. 4 changes made, then the button disabled. FM shows only "Average" in Dynamics, so not seen in FM | Undo restored all 4 |
| Lift bans | Not run. The button is disabled: nobody is banned in this save | None |
| Player attribute edit (Saka Corners 18 to 5, Finishing 14 to 20) | Pass. FM showed Corners 5 and Finishing 20; both survived the save and relaunch | Not undone |
| Max attributes (24 players, 1,271 changes) | Pass. FM showed Saka at 20 across the board | Undo restored Saka's edited values in FM |
| Max morale (23 changes) | Pass. Read back 20 of 20. FM shows morale as icons, so not checked in FM | Undo restored |
| Max tactics (24 changes) | Pass in the app only. The copy has no tactic set up, so FM shows nothing to compare | Undo restored |
| Staff attribute edit (manager Ayo Elu Attacking 5 to 17) | Pass. FM shows "Very Good" | Not undone |
| Save As a new name, quit FM, relaunch through Steam, load the copy | Pass. Saved as `FM Lens Persist Check`. Steam started FM with no sign-in. After loading: Saka's Corners 5 and Finishing 20, Arsenal's balance £329,887,681 and Rice's £275,000 wage all held, and both freezes came back on | None needed |

Notes. The NVIDIA "Control Panel is not found" toast sits over FM Lens's Apply button
at the box's screen size; dragging the FM Lens window left clears it. The release
call shapes come from the editor's release branch at 0x29CE8BC (see
`docs/recon/fm27-call-shapes.md`).

## Four native audit fixes (8 November 2026)

Baseline `eb1d33b`; branch `codex/native-audit-fixes`. The window snapshot now
includes a validated page offset tied to the search/filter/sort arguments and
carries forward unopened sections' saved state. Invalid inputs count as dirty
drafts for navigation, Close and Done, while Apply stays disabled. The player
table measures its zoom-adjusted width, drops secondary columns and reserves
useful room for names instead of relying solely on WebKit container queries.

Native verification used the ad-hoc-signed debug Tauri app with production Vite
output, connected to the running Steam ARM64 career: PID 13579, build 26340721,
module UUID F4540355-2186-39CB-9119-C706A6A35346. FM showed 8 December 2027,
11:00; FM Lens named Ayodeji Eluwande / Arsenal.

| Reproduction | Result |
|---|---|
| Players page two, Reijnders UID 37071126 open; English → Spanish → English | Range stayed 201–400 of 30,314 and the same profile stayed open |
| GBP → EUR → GBP from that page/profile | Page and profile stayed open; GBP restored |
| Staff search Arteta (3 results), return to Players, English → Spanish → English without reopening Staff | Returning to Staff retained Arteta and its 3 results |
| Haaland UID 29179241, baseline CA 195, draft 1000; section shortcut, Close and Done | Each asked Discard 1 change?; Keep editing preserved 1000; Apply stayed disabled. Draft explicitly discarded without applying |
| Player list at 150%, light; at 150%, dark with Haaland open; at 125%, dark; return to 100% System | Names remained readable; secondary columns yielded first; the open-profile list retained readable names and CA/PA. English, GBP, System and 100% restored |
| Changes after the checks | No changes yet |

All 23 baseline career hashes stayed unchanged. No Apply, Undo, freeze,
transfer/release action, Continue or game save was used.

Checks passed: clean npm install (zero reported vulnerabilities), TypeScript,
14 fixture interaction tests plus 2 shortcut tests, production frontend build,
debug Tauri packaging, targeted Impeccable detector (no findings), and diff
whitespace checks. Regression coverage includes later and partial final pages,
invalid/legacy offsets, query/filter resets, consecutive reloads with an unopened
section, invalid-only drafts for navigation/Close/Done, and zoom changes without
a window resize. Native evidence is macOS only; Windows interaction and an
exhaustive window-size matrix were not exercised locally. Rust/domain code was
unchanged by these fixes.


### Cancellation retires the original signing Undo (8 November 2026)

After a deferred free-agent signing was cancelled through Cancel transfer, the
original Sign history row still offered Undo; the backend safely refused it
because the offer no longer existed. Logging a confirmed cancellation now also
marks the matching live signing history entry permanent. Matching uses the
player UID and exact offer ID, excludes earlier careers and already-undone
entries, and leaves the history intact. Both the UI and backend use the existing
permanent-change guard, so stale clients also cannot execute its Undo. No domain
call, transfer cancellation behavior, or game-memory write was changed.

The preview command adapter mirrors this behavior using exact offer IDs. A Rust
regression verifies the serialized permanent flag and preserves different offers,
players, earlier careers, undone entries and normal field edits. An integration
test signs two fixture free agents, cancels one, refreshes Changes, verifies that
only the unrelated signing still offers Undo, and checks that the cancelled
Sign's Undo is refused by the permanent guard.

Local validation: frontend tests (17 checks), production frontend build, Rust
formatting, desktop library tests and writable desktop Clippy passed. No new
native FM signing/cancellation or save/reload test was performed for this
history-only change. Native Intel and Windows interaction remain unverified.

### Exact wage entry (8 November 2026)

Removed the frontend adjustment that replaced a typed wage with a formatter step,
including a direction-dependent adjustment based on the old wage. Typing £260,000
now previews and submits 260000 GBP whether the old wage is £250,000, £275,000 or
£300,000. Leaving the input does not rewrite it. Explicit arrow-key stepping remains.
A localized notice gives an estimated FM weekly display when it differs; the
formatter estimate comes from the ARM64 investigation above, not new Windows evidence.
Existing whole-pound currency conversion and edit guards are unchanged.

Frontend regression tests cover exact request values, unchanged/invalid entries,
and typing followed by blur with an accessible display notice. No game writes or
new native macOS/Windows persistence checks were performed for this change.

Frontend verification: all 23 checks passed (21 Vitest cases and two keyboard
tests). Two integration cases use the real profile editor hook, type 260000,
click Apply, assert the `apply_edits` payload retains 260000, and verify the reread
path. They run with MacIntel and Win32 navigator settings against a command stub;
they are not native Intel or Windows tests. Production frontend and native ARM64
Tauri compilation and bundle builds passed.

### Native exact-wage Apply check (8 November 2026)

Access became available and the updated debug macOS bundle was exercised through
its native UI. The running Steam ARM64 game was PID 43238, game_plugin UUID
F4540355-2186-39CB-9119-C706A6A35346, game date 8 Dec 2027. Before connecting,
FM's Save Game As created `FM Lens Exact Wage 2026-11-08.fm` from the loaded
`FM Lens Transfers 2026-11-08` career. No Continue was used.

Bukayo Saka (28122642): opened Contract > Wage per week, baseline 300000; typed
260000 and tabbed out. The input retained 260000 and the visible notice estimated
FM's display as £250,000 p/w. Review showed £300,000 → £260,000. Clicked Apply;
the app reported one change applied. Reopened the wage editor, which freshly
reads the game: value 260000, No changes. Exited edit mode without further edits.
Independent read-only probe `get player 28122642 contract.wage` returned 260000.

SHA-256 of both the main `Ayodeji Eluwande - Arsenal.fm` and source
`FM Lens Transfers 2026-11-08.fm` stayed
3adeb4fdef1c5928a5f396e719c9216842282665af21e9e8a3b8e803bd956000.
The disposable copy stayed
57aa585fcaf39cb89c1e896e07326d305fa351d7c73be2d90cbdc3fc8170d8fe:
the wage change remains in the running test career and was not saved to disk.
This confirms exact native macOS Apply/readback, not save/reload persistence or
native Windows behavior. FM's own displayed wage was not inspected in this check.

### Permit request feedback (8 November 2026)

Reproduced the reported native UI behavior for Kai Havertz (91151081), at R. Madrid
in the running `FM Lens Exact Wage 2026-11-08` test career, game date 8 Dec 2027.
Same supported Steam ARM64 process 43238 and UUID
F4540355-2186-39CB-9119-C706A6A35346. The old UI offered Grant with no permit
record; clicking it returned “FM didn't make the change.”

The backend intentionally invokes FM's unforced permit function, which may make
no record under its rules. A club and an empty permit list do not prove a player
needs one. No traced per-player eligibility query is exposed, so the frontend now
labels the action Request permit rather than promising a grant. On the structured
`call.declined` result from a request, it refreshes the profile and reports that FM
did not issue a permit and the player may not need one. This is a no-change
status, not success or an assertion that the player is exempt. Other failures,
including failed revocation, remain errors. No backend force flag was changed.

Rebuilt, signed and relaunched the native debug app. Havertz's Request permit
showed the new status after the live call; no Revoke button or successful Changes
entry appeared. The screenshot was inspected at the native window size. No
Continue or save was used. Main and test save SHA-256 hashes stayed unchanged. Existing unsaved changes in
the running test copy were preserved. Native Intel and Windows were not exercised.

The isolated permit branch passed 19 frontend checks (17 Vitest and two keyboard
cases), including three new permit UI cases covering declined requests, successful request/reread, stale
feedback on player change, failed revoke, connection failure and read-only or
unavailable actions. Production frontend and native ARM64 bundle builds passed.

## More formation and concern names (8 November 2026)

Display names only; nothing was edited in FM.

Formations: FM27 on the Windows test machine, in the unsaved copy career
(Arsenal, 1 Aug 2026). Each name is read from the holder's Head Coach tab,
Coaching Info, Preferred Formations (up arrow in possession, down arrow out of
possession). The formation dropdowns offer only named IDs now.

| Value | Holder | FM shows |
|---|---|---|
| Formation 3 | Tim Waskett | 4-4-2 |
| Formation 32 | Tim Waskett | 4-1-4-1 DM |
| Formation 27 | Beverly Priestman | 4-3-2-1 DM AM Narrow |
| Formation 33 | Beverly Priestman | 4-4-1-1 2DM |
| Formation 35 | Antonio Conte | 5-2-3 DM Wide |
| Formation 30 | Antonio Conte | 5-3-2 DM WB, as already named |
| Formation 64 | Matty Moore | 5-2-1-2 DM AM |
| Formation 62 | Daniel Hodges | 4-2-2-2 DM AM Narrow |
| Formation 65 | Leah Grant | 3-2-5 DM 2AM Wide |

Formation 35 is 5-2-3 DM Wide, not 5-2-2-1 DM AM as the flawed second-formation
check in "Six features" read it.

Unhappiness reasons: native macOS FM, process 43238, the running test career
at 8 Dec 2027 (Arsenal). Not saved; Continue was not pressed.

| Value | Holder | FM shows | FM Lens now |
|---|---|---|---|
| Reason 652 | Willian Pacho, his only open record | Discuss Concerns lists only "Wants to start more games"; Mood shows "(Minor Issue) Wants to start more games" | Wants to start more games |
| Reason 811 | Declan Rice and William Saliba, their only open record | Negative on Mood: "Thinks Bukayo Saka is right in asserting that the poor dressing room atmosphere needs to be addressed". No Discuss Concerns entry for Rice | Thinks a teammate is right that the poor dressing room atmosphere needs to be addressed |

Saka holds 570 (the dressing room atmosphere); 811 is the teammates backing him.
FM names the teammate; FM Lens says "a teammate", as for 808 and 926. The
Spanish and Turkish names are translations, not FM's own strings. Promises 2 and
3 stay unnamed: no holder is at your club, and FM shows only your club's promises.

## Not needed work permits (9 November 2026)

FM Lens now asks FM's own rules whether a player needs a permit for his club's
country, the same check FM makes before it gives one. Where FM says no, the
Work permit section shows "Not needed" and offers no Request permit button.
Where FM Lens cannot ask (an unsupported build, a national team, player-coaches
and players with no club team), the section behaves as before.

Packaged release builds of `fix/permit-eligibility` (a28881f), driven through
the accessibility API. Test copies only, never saved; Continue was not pressed.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Kai Havertz, Germany | Pass. At R. Madrid: "Not needed", no button | Pass. Same | Pass. At Arsenal: "Not needed", no button |
| Riccardo Calafiori, Arsenal: Revoke | Pass. Request permit appears | Pass. Same | Pass, with Merino at Arsenal |
| Then Request permit | Pass. England, Active; both rows in Changes offer Undo | Pass. Same | Pass |
| Guillaume Trani, free agent: Sign for R. Madrid joining 20 Dec 2027, then Cancel transfer | Pass. Changes shows the Club row and the Future transfer row, both "-" with no Undo | Pass. Same | Pass, with Mariona Caldentey signing for Arsenal, joining 15 Aug 2026 |

Mac: FM process 5862 (native) and 7858 (`arch -x86_64`), each with the bridge
injected at launch, test copy `FM Lens Permit 2026-11-09` (Arsenal, 8 Dec 2027).
Windows: FM27 on the test machine, unsaved Arsenal career at 1 Aug 2026, with the
Windows build of the same commit.

The last row is the live check for "Cancellation retires the original signing
Undo" above, which had only been tested against fixtures.

Scans (a throwaway example binary calling the same check, not committed):

| Where | Players | Needs | Not needed | Couldn't ask |
|---|---|---|---|---|
| Windows: Arsenal, Chelsea, Man City, Liverpool, Tottenham, Brentford, Fulham, Everton, plus Havertz | 701 | 169 | 530 | 2 |
| Apple Silicon: Arsenal | 55 | 17 | 38 | 0 |
| Apple Silicon: whole database | 30,314 | 868 | 25,318 | 4,128 player-coaches |

In the Windows and Arsenal scans, every player FM said needs a permit already
held one. Many foreign players at
English clubs come back not needed (Havertz and Frimpong at Arsenal on Windows,
Saliba on the Mac), which matches FM giving them none when asked.

Found on the way: in this Mac save Mikel Merino is on loan from Arsenal at
Real Hispalis and holds an England permit. Revoke was offered but failed safely
with "FM didn't make the change", because FM Lens looked for a permit for his
current club's country (Spain). Nothing was written or logged. Fixed in the
next section.

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5
on Windows. The released 0.7.0 bridge was restored on the Mac afterwards.

## Revoke for loaned-out players (9 November 2026)

FM keeps one permit per player per country. For a player on loan, the Work
permit section can show a permit for the country of the club he is on loan
from, but Revoke looked only for one for his current club's country, found
nothing and failed with "FM didn't make the change". Revoke now falls back to
the permit for his parent club's country when there is none for his current
club's, and Undo gives that permit back to the same country.

Packaged release builds of `fix/permit-revoke-loan` (0fbfa96), driven through
the accessibility API. Test copies only, never saved; Continue was not pressed.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Player | Mikel Merino, at Real Hispalis from Arsenal | Same | Pape Matar Sarr, at Juventus from Tottenham |
| Before | England, Active, Revoke offered | Same | Same |
| Revoke | Pass. Section shows "Not needed"; Changes: Work permit, Active → None, with Undo | Pass. Same | Pass. Same |
| Undo | Pass. "Undone"; England, Active, Revoke offered again | Pass. Same | Pass. Same; a memory scan also shows the England permit back |

"Not needed" after Revoke is FM's own answer for the loan club's country (a
Spanish player in Spain, a Senegalese player under Italy's rules), from the
check added in the section above.

Mac: FM process 18309 (native) and 22026 (`arch -x86_64`, X86-64 translated),
each with the bridge injected at launch, and FM Lens 21044 (native) and 22545
(`arch -x86_64`), test copy `FM Lens Permit 2026-11-09` (Arsenal, 8 Dec 2027).
Windows: FM27 on the test machine, unsaved Arsenal career, with the Windows
build of the same commit.

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5
on Windows. The released 0.7.0 bridge was restored on the Mac afterwards.

## Team actions named in Changes (9 November 2026)

A squad action showed in Changes as a mass edit: Lift bans read "Bans",
"Player", "Mass edit" with "Undo mass edit". The log now keeps the action and
the team, so the row is named after the action, tagged with the club (and the
team when it is not the first team), and its button is "Undo all". Mass edits
from the Mass edit dialog are unchanged.

Packaged release builds of `fix/team-action-label` (849c20d), driven through
the accessibility API. Test copies only, never saved; Continue was not pressed.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Action | Lift bans, Arsenal first team (Hincapié, Saliba, Gabriel) | Same | Heal, Arsenal first team (Bruno Guimarães) |
| Changes row | Pass. "Lift bans", ARSENAL, "3 changes · 3 not undone", Undo all | Pass. Same | Pass. "Heal", ARSENAL, "1 change · 1 not undone", Undo all |
| Rows under it | Each player, Bans, "Lifted 1 ban", Undo | Pass. Same | Injuries, "Healed 1 injury", Undo |
| Undo all | Pass. All undone; squad shows "Lift bans 3 banned" again | Pass. Same | Pass. All undone |
| Other team | Pass. Refresh fitness on U21: "Refresh fitness", ARSENAL, U21 (69 changes), undone | - | - |

Nobody in the Windows test career is banned (1 Aug 2026, preseason), so Heal
took the place of Lift bans there; both go through the same team action and
the same Changes row.

Mac: FM process 27073 (native) and 28356 (`arch -x86_64`, X86-64 translated),
each with the bridge injected at launch, and FM Lens 27903 (native) and 28655
(`arch -x86_64`), test copy `FM Lens Permit 2026-11-09` (Arsenal, 8 Dec 2027).
Windows: FM27 on the test machine, unsaved Arsenal career, with the Windows
build of the same commit.

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5
on Windows. The released 0.7.0 bridge was restored on the Mac afterwards.

## Failed connections counted (9 November 2026)

When Connect fails, FM Lens now sends `fm_connect_failed` to PostHog with the
failure's code only. Checked that the event arrives with the code and that a
normal connect still works.

Packaged release builds of `feat/connect-failed-event` (30388b8), driven
through the accessibility API. Test copies only, never saved; Continue was not
pressed.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Connect at FM's main menu, no save loaded | Pass. "No save is loaded in FM. Load one, then connect."; `fm_connect_failed` with code `session.playersNotFound` (07:51 UTC) | Pass. Same message; the same event and code (10:17 UTC) | Pass. Same message; the same event and code (10:48 UTC) |
| Connect with a save loaded | Pass. Connected, 30,314 players; `fm_connected` (08:09 UTC) | Pass. Same; `fm_connected` (10:27 UTC) | Pass. Connected; `app_opened` and `fm_connected` (07:31-07:32 UTC) |

The event carries the code alone, never the message or its parameters. Connect
is disabled while FM is not running or was started without the
helper, so those states never reach the connect call and send no event.

Mac: FM process 52920 (native) and 3611 (`arch -x86_64`, X86-64 translated),
each with the bridge injected at launch, and FM Lens 50559 (native) and 2800
(`arch -x86_64`), test copy `FM Lens Permit 2026-11-09` (Arsenal, 8 Dec 2027).
Launching FM through `nohup` drops `DYLD_INSERT_LIBRARIES` (SIP strips it for
system binaries), so FM started without the bridge; `arch -e` keeps it.
Windows: FM27 on the test machine (FM process 7016) with the Windows build of
the same commit. Connected first in an unsaved Arsenal career; then FM's Quit to
Start Screen, answering No to saving, and FM Lens restarted (6248) before
pressing Connect.

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5
on Windows. The released 0.7.0 bridge was restored on the Mac afterwards.

## Max attributes raises CA and PA (9 November 2026)

Max attributes set every attribute to 20 but left current and potential
ability where they were, so FM showed the old CA and PA and could fit the
attributes back down to them. Max attributes for a team, and the profile's
Set all attributes to 20, now also set CA and PA to 200 in the same batch, so
one undo puts them back. Set all attributes to any other value leaves CA and
PA alone.

Packaged release builds of `fix/max-attributes-ability` (b24e895), driven
through the accessibility API (UI Automation on Windows). Test copies only,
never saved; Continue was not pressed.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Max attributes, Arsenal first team | Pass. 1,594 changes; all 29 players CA 200, PA 200 (Saka was 186/188) | Pass. 1,594 changes; all 29 at 200/200 | Pass. 1,374 changes; all 25 at 200/200 (Rice was 182/184) |
| Changes row | Pass. "Max attributes", ARSENAL, Undo all; rows include Current ability 137 → 200 and Potential ability 160 → 200 (Gilberto Mora) | Pass. Same row | Pass. "1,374 changes made" with Undo |
| Undo | Pass. Undo all; every player's CA and PA back to the values before | Pass. Same | Pass. "Undid 1,374 changes"; every CA and PA back |
| Profile, Set all attributes to 20 | Pass. Saka: "55 changes made. Injury proneness and dirtiness set to 1, CA and PA to 200."; header 200/200; Undo back to 186/188 | - | - |

Mac: FM Lens and FM native, then both under `arch -x86_64` (translated), each
FM with the bridge injected at launch, test copy `FM Lens Permit 2026-11-09`
(Arsenal, 8 Dec 2027). Windows: FM27 on the test machine was at its main
menu, so the test loaded `Lens Test` (a copy of the main save, Arsenal, 13 Jul
2026) with the Windows build of the same commit.

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5
on Windows (`Lens Test` too). The released 0.7.0 bridge was restored on the
Mac afterwards.

## Free-agent player-coaches signed (9 November 2026)

Sign was offered for free agents who can also coach (their person block sits
0xF8 further into the object), then failed. FM Lens now reads and patches them
at the shifted offsets, and the signing's terms carry a player's job. Without
that job the game gave them a staff job: the first attempt made Pedro (a
free-agent player-coach) Arsenal's Assistant Manager, and FM Lens reported that
FM didn't make the change. Players who hold a coaching job at a club (job code
odd and above 1) no longer show Transfer or Release, since the game moves them
as staff. Players with the same object layout but a player's contract keep
Transfer and Release.

Packaged release builds of `fix/player-coach-sign` (2b0168d), driven through
the accessibility API (UI Automation on Windows). Test copies only, never
saved; Continue was not pressed.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Sign a free-agent player-coach | Pass. Alan Browne (52064763) to Arsenal; contract to 30 Jun 2028, £44,934 a week, staff list job "Player" | Pass. Alan Browne (52064763) to Arsenal; contract to 30 Jun 2028, £44,934 a week, staff list job "Player" | Pass. Simon Mignolet (8167246) to Arsenal; club Arsenal, contract to 30 Jun 2027, staff list job "Player" |
| Undo | Pass. "Undone at 15:46:51"; free agent, no contract, no staff job | Pass. "Undone at 15:58:06"; free agent, no contract, no staff job | Pass. "Undone at 15:17:40"; free agent, no contract, no staff job |
| Sign later | Pass. Joins 28 Dec 2027; Contract tab shows Future transfer, Arsenal, 28 Dec 2027 | Pass. Joins 28 Dec 2027; Contract tab shows Future transfer, Arsenal, 28 Dec 2027; Changes row "Joins 28 Dec 2027" | Pass. Joins 20 Aug 2026; Contract tab shows Future transfer, Arsenal, 20 Aug 2026; Changes row "Joins 20 Aug 2026" |
| Cancel transfer | Pass. Future transfer gone, Sign back, still a free agent | Pass. Future transfer gone, Sign back, still a free agent | Pass. Future transfer gone, Sign back, still a free agent |
| Club player-coach | Pass. Nicky Clark (61005136, Queen Of The South manager): no Transfer, no Release | Pass. Nicky Clark (61005136, Queen Of The South manager): no Transfer, no Release | Pass. Jay Spearing (28000443, Liverpool coach): no Transfer, no Release |
| Same layout, player's contract: Transfer, Release | Pass. Paul Ifill (109160) Greytown AFC to Arsenal, contract to 30 Jun 2028; then Release, free agent, no contract | Pass. Paul Ifill (109160) Greytown AFC to Arsenal, contract to 30 Jun 2028; then Release, free agent, no contract | Pass. Paul Ifill (109160) Greytown AFC to Arsenal, contract to 30 Jun 2028; then Release, free agent, no contract |

Mac: FM27 native on Apple Silicon (FM process 21066) and under Rosetta (FM
process 27871, code type X86-64 translated), each with the branch bridge
injected and the test FM Lens build run the same way. Test copy `FM Lens
Permit 2026-11-09` (Arsenal, 8 Dec 2027), opened through Load Game and quit
without saving between runs.

Windows: FM27 on the test machine (FM process 7016) with the Windows build of
the same commit, in `Lens Test` (a copy of the main save, Arsenal, 13 Jul
2026). The probe's `player` command reported "person block shifted by 0xf8
(player-coach)" for each player above.

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5
on Windows. The released 0.7.0 bridge was restored on the Mac afterwards.

## Young signings join the senior squad (9 November 2026)

A 20-year-old signed through Sign went to the U21s. The game's own signing
makes the contract with the senior team (contract team and senior team both
the first team) but lists the player in the U21 list and has him play for the
U21. Seen on Windows with Malick Diop (2000399932): Arsenal's U21 list went from
23 to 24 and the senior list stayed at 25. Passing the team id (`Ttea`) does
not change this: it only replaces the destination team, which is already the
senior team. After Sign and Transfer, FM Lens now moves the player to the
senior team: off every youth list of the club that holds him, onto the senior
list, and his team set to the senior team. The move is best effort: when the
lists are not as expected the signing stands and he stays where the game put
him. Sign later is unchanged: the game makes that signing on its day.

The first build of this fix still left Eloi Tost in the U21s under Rosetta.
After a load most squad lists are exactly full (capacity equal to length), and
there the bytes past Arsenal's senior list were not zero, so FM Lens found no
spare slot and stopped. The game itself had just doubled the U21 list's block
to take him (28 to 56 slots). Now, when the senior list is full, the two lists
exchange blocks: the senior list takes the U21 block with the new player added,
and the U21 list takes the old senior block, which still fits it. Both blocks
stay the game's own and keep their capacities. FM Lens first empties the U21
list, then writes both blocks and headers, so neither list ever holds a player
twice or a slot the other list owns. When the senior list is full and the youth
list has not grown enough to take it, the player stays in the U21s as before.

Packaged release builds of `fix/sign-senior-squad` (bbbd117), driven through
the accessibility API (UI Automation on Windows). Test copies only, never
saved; Continue was not pressed.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Sign a young free agent | Pass. Eloi Tost (2000498391, 20) to Arsenal: plays for the first team, senior list 29 to 30, U21 list stays 28; contract to 30 Jun 2029 | Pass. Eloi Tost (2000498391, 20) to Arsenal: plays for the first team, senior list 29 to 30, U21 list stays 28; contract to 30 Jun 2029 | Pass. Malick Diop (2000399932, 20) to Arsenal: plays for the first team, senior list 26 to 27, U21 list stays 23 |
| Sign with the senior list full | Pass. Gellert and Bili filled the senior block (32 of 32). Abo El Nay then plays for the first team: the senior list took the block the game had grown for the U21s (33 of 56) and the U21 list took the old senior block (28 of 32); FM kept running | Pass. Fabian Gellert (2000419798, 19) and Bili (2000328858, 20) filled the senior block (32 of 32). Rayan Abo El Nay (2000386337, 20) then plays for the first team: the senior list took the block the game had grown for the U21s (33 of 56) and the U21 list took the old senior block (28 of 32); FM kept running | Not reached: Arsenal's senior list had room (26 of 37) |
| Undo | Pass. All four undone, newest first ("Undone at 20:02:27" to "20:02:39"); free agents again, no contract; lists back to 29 and 28 | Pass. All four undone, newest first ("Undone at 19:34:50" to "19:35:19"); free agents again, no contract; lists back to 29 and 28 | Pass. "Undone at 19:22:57"; free agent, no contract; lists back to 26, 23 and 8 |
| Transfer a young player | Pass. Jesse Middleton (2000378586, 19) Brighton to Arsenal: plays for the first team, senior list 29 to 30, U21 list stays 28; Brighton U21 list 36 to 35, no Brighton list holds him | Pass. Jesse Middleton (2000378586, 19) Brighton to Arsenal: plays for the first team, senior list 29 to 30, U21 list stays 28; no Brighton list holds him (35, 35 and 19) | Pass. Jesse Middleton (2000378586, 18) Brighton to Arsenal: plays for the first team, senior list 26 to 27, U21 list stays 23; Brighton U21 list 37 to 36, no Brighton list holds him |
| Sign an older free agent | Pass. Patrick Berg (53099570, 30) to the first team, senior list 30 to 31; Undo ("Undone at 20:04:03") returned him to free agent, list back to 30 | Pass. Patrick Berg (53099570, 30) to the first team, senior list 30 to 31; Undo ("Undone at 19:37:36") returned him to free agent, list back to 30 | Pass. Solly March (29090530, 31) to the first team, senior list 27 to 28; Undo ("Undone at 19:28:18") returned him to free agent, list back to 27 |

Mac: FM27 native on Apple Silicon (FM process 57334, code type ARM64) and under Rosetta (FM
process 52451, code type X86-64 translated), each with the branch bridge
injected and the test FM Lens build run the same way. Test copy `FM Lens
Permit 2026-11-09` (Arsenal, 8 Dec 2027), opened through Load Game and quit
without saving between runs. Arsenal's lists on load: senior 29 and U21 28, both exactly full.
Team lists read with the probe's `teams 602`, list headers at team + 0x38.

Windows: FM27 on the test machine (FM process 7016) with the Windows build of
the same commit, in `Lens Test` (a copy of the main save, Arsenal, 13 Jul
2026).

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5 on Windows.
The released 0.7.0 bridge was restored on the Mac afterwards.

## Typed dates read right in the Mac app (9 November 2026)

Typing `20072028` into Joins in Sign gave 28/12/2027 on the Mac. The Mac app
runs in WebKit, whose date input never moves on from the day to the month
after two digits, so every digit landed in the day and the rest of the date
came from what was there before. The Windows app runs in Chromium, which moves
on by itself. The native control cannot be changed, so every date in FM Lens
(Sign, Transfer, Loan, the contract filter, the date fields in Edit and Mass
edit) is now a text field typed in the order of the app's language
(`dd/mm/yyyy`, `dd.mm.yyyy` in Turkish): digits fill day, month and year and
the separators write themselves. The click that enters the field selects the
whole date, so typing replaces it. The browser's calendar stays behind a button
in the field.

The first build left the calendar open on the Mac after a day was picked or
another field was clicked: WebKit closes its calendar only when the date input
loses focus, and the hidden input never had it. The hidden input now takes
focus before the calendar opens, and a digit typed while it has focus moves to
the text field.

Packaged release builds of `fix/sign-joins-date` (57feaa6), driven through the
accessibility API and clicks (UI Automation and clicks on Windows). Test copies
only, never saved; Continue was not pressed.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Click Joins and type `20072028` | Pass. Reads 20/07/2028 | Pass. Reads 20/07/2028 | Pass. Reads 20/07/2028 |
| Calendar button | Pass. Opens on July 2028 with 20 marked; picking 21 writes 21/07/2028 | Pass. Opens on July 2028 with 20 marked; picking 21 writes 21/07/2028 | Pass. Opens on July 2028 with 20 selected; picking 21 writes 21/07/2028 and closes it |
| Calendar closes on leaving | Pass. Clicking back into the field closes it | Pass. Clicking back into the field closes it | Pass. Clicking back into the field closes it |
| Type `20072028` with the calendar open | Pass. The field reads 20/07/2028 and the calendar closes | Pass. The field reads 20/07/2028 and the calendar closes | Not the same: Chromium's calendar holds the keyboard, so the digits change nothing; a click in the field closes it and typing works |
| Sign with Joins and Contract end typed | Pass. Patrick Berg (53099570, 30), Joins `08122027`, Contract end `30062029`: Arsenal, "Contract to 30 Jun 2029" | Pass. Patrick Berg (53099570, 30), Joins `08122027`, Contract end `30062029`: Arsenal, "Contract to 30 Jun 2029" | Pass. Solly March (29090530, 31), Joins `13072026`, Contract end `30062029`: Arsenal, "Contract to 30 Jun 2029" |
| Undo | Pass. "Undone at 22:02:03"; free agent again | Pass. "Undone at 22:09:30"; free agent again | Pass. "Undone at 22:20:45"; free agent again |

Mac: FM27 native on Apple Silicon (FM process 71253, code type ARM64) and under
Rosetta (FM process 75525, code type X86-64 translated), each with the branch
bridge injected and the test FM Lens build run the same way. Test copy `FM Lens
Permit 2026-11-09` (Arsenal, 8 Dec 2027), opened through Load Game and quit
without saving between runs.

Windows: FM27 on the test machine (FM process 7016) with the Windows build of
the same commit, in `Lens Test` (a copy of the main save, Arsenal, 13 Jul
2026). The build of the first commit (0ec9f54) passed the same typing, calendar,
Sign and Undo checks there before the rebuild.

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5 on Windows.
The released 0.7.0 bridge was restored on the Mac afterwards.

## Calendar follows the game date (10 November 2026)

The calendar of a date field was the browser's own, and it had three faults.
An empty field, such as "Contract ends by" in Filters, opened on the
real-world day instead of the game date. On Windows, Chromium's calendar kept
every key, so a date typed while it was open went nowhere. On the Mac it needed
a hidden input to hold focus while it was open, and screen readers could not
see that input.

FM Lens now draws the calendar itself. It opens on the field's date, or else
on the game date, with the game day ringed. Arrow keys and Page Up/Down move
through it, Escape closes it without closing the dialog behind it, and a digit
sends focus to the text field so the typed date lands there. Every day and
step is a labelled button. A press on the month, a weekday or a day out of
range first moved focus out of the calendar, so the keys stopped working and
Escape closed the dialog; any press inside now leaves focus on the day.

Packaged release builds, driven through the accessibility API and clicks (UI
Automation and clicks on Windows). Windows ran `fix/date-calendar` (1db332b).
The Mac ran 9acce12, the next branch on top of it, which leaves the calendar
files as they are. Test copies only, never saved; Continue was not pressed.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Empty "Contract ends by" opens on the game date | Pass. December 2027 (game date 8 Dec 2027) | Pass. December 2027 (game date 8 Dec 2027) | Pass. July 2026 with 13 ringed (game date 13 Jul 2026) |
| Type `30062029` with the calendar open | Pass. The field reads 30/06/2029 and the calendar closes; 18,500 players | Pass. The field reads 30/06/2029 and the calendar closes; 18,500 players | Pass, after a press on the month label. "Contract ends by: 30 Jun 2029"; 19,409 players |
| Reopen | Pass. Opens on June 2029 | Pass. Opens on June 2029 | Pass. Opens on June 2029 |
| Arrow keys | Pass. Right then Return writes 01/07/2029 | Pass. Right then Return writes 01/07/2029 | Not run |
| Escape | Pass. Closes only the calendar; filter cleared, 30,314 players | Pass. Closes only the calendar; filter cleared, 30,314 players | Pass, after a press on the month label, in Filters and in Sign: the calendar closes and the dialog stays |
| Sign dialog | Pass. Joins starts on 08/12/2027 | Pass. Joins starts on 08/12/2027 | Pass. Solly March (29090530, 31) to Arsenal: Joins opens on July 2026; 14 writes 14/07/2026, 13 writes it back; `30062029` typed into Contract end with its calendar open; "Contract to 30 Jun 2029"; Undo ("Undone at 23:19:54"), free agent again |
| Screen readers | Pass. A group named Calendar, each day a named control | Pass. A group named Calendar, each day a named control | Pass. A window named Calendar with labelled buttons |

Mac: FM27 native on Apple Silicon (FM process 38718, code type ARM64) and under
Rosetta (FM process 83781, code type X86-64 translated), each with the branch
bridge injected and the test FM Lens build run the same way. Test copy `FM Lens
Permit 2026-11-09` (Arsenal, 8 Dec 2027), opened through Load Game and quit
without saving between runs. The build of the first commit (e9c1653) also
passed on Apple Silicon a Sign with both dates typed (Patrick Berg, "Contract
to 30 Jun 2029", Undo at 22:48:47) and Date of birth in Edit opening on the
player's month.

Windows: FM27 on the test machine (FM process 7016) with the Windows build of
1db332b, in `Lens Test` (a copy of the main save, Arsenal, 13 Jul 2026).

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5 on Windows.
The released 0.7.0 bridge was restored on the Mac afterwards.

## Ten list, profile and dialog fixes (10 November 2026)

1. Finances: a club's Finances section was hidden when its transfer budget was
   negative, because any negative budget read as "not set". FM makes the
   budget negative when a club overspends. Only FM's -1 now reads as not set,
   and a negative budget shows in red.
2. Staff: the manager of a national team with no club job read "Unemployed".
   He is now a Manager at that team in the list, the profile and the job
   filters.
3. Club pickers listed women's clubs first. They now list the clubs of the
   person's side of the game first.
4. More stayed open after Export, Mass edit and Clone & templates. It now
   closes once the dialog an action opened is gone, and focus goes back to
   More.
5. Templates: Save removed the Undo of a clone. Save now keeps the preview,
   the result and its Undo.
6. Templates: the picker reset after a template was loaded. It now shows the
   template in use.
7. Templates: the first Save gave no confirmation. Save and Delete now confirm
   under their buttons.
8. Squad: a click on a row did nothing. A click on a row, or on the name, now
   opens the player in the player list with the filters cleared.
9. Changes: the count included entries from an earlier game, which can no
   longer be undone. It now leaves them out.
10. Profile header: a long name or summary wrapped and pushed the tabs down.
    The name stays on one line, the summary is always two lines and the status
    chips scroll, so the tabs no longer move between people or when editing.

Packaged release builds of `fix/ui-ten` (9acce12), driven through the
accessibility API and clicks (UI Automation and clicks on Windows). Test copies
only, never saved; Continue was not pressed.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| 1. Finances with a negative transfer budget | Pass. Arsenal: Finances shown, transfer budget -£2,097,590 in red | Pass. Arsenal after a Release of Patrick Berg: -£92,646 in red; in the second copy -£2,097,590, where FM shows "(£2.09M)" | Pass. Brighton: budget set to £0, then Carlos Baleba released; after Reload the transfer budget reads -£527,069 in red and Finances is shown |
| 2. National-team managers | Pass. Thomas Tuchel, 54: Manager, England. Carlo Ancelotti, 68: Manager, Brazil | Pass. Thomas Tuchel, 54: Manager, England | Pass. Thomas Tuchel: Manager, England. Carlo Ancelotti: Manager, Brazil |
| 3. Club picker order | Pass. Men's clubs first (Blu-neri Milano, R. Madrid, Barcelona, Arsenal 9,019); no women's club in the first 8 | Pass. Men's clubs first (Blu-neri Milano, R. Madrid, Barcelona, Arsenal 9,019) | Pass. Arsenal 8,950 first, no women's club in the first 8; Brighton & Hove Albion 7,050 before its women's club 6,750 |
| 4. More closes | Pass. Closed after Export, Mass edit and Clone & templates | Pass. Closed after Export, Mass edit and Clone & templates | Pass. Closed after Export, Mass edit and Clone & templates |
| 5. Save keeps the clone's Undo | Pass. "67 changes applied." and Undo still there after Save; Undo: "Undid 67 changes." | Pass. "67 changes applied." and Undo still there after Save; Undo: "Undid 67 changes." | Pass. "61 changes applied." and Undo still there after Save; Undo: "Undid 61 changes." |
| 6. Picker keeps the template | Pass. Still on the saved template after reopening | Pass. Still on the saved template after reopening | Pass. Shows the saved template, and stays on it when chosen in a reopened dialog |
| 7. Save and Delete confirm | Pass. "Template saved."; "Template deleted." | Pass. "Template saved."; "Template deleted." | Pass. "Template saved."; "Template deleted." |
| 8. Squad row opens the player | Pass. Bukayo Saka by name, Nico Paz by row; each opened in Players | Pass. Declan Rice by name, Nico Paz by row; each opened in Players | Pass. Declan Rice by row, Bukayo Saka by name; each opened in Players |
| 9. Changes count without earlier games | Pass. "Changes 1" before; after FM loaded another game: "Changes" with no count, entries read "Earlier game" ("68 changes · 67 undone") | Pass. "Changes 4" before; after: "Changes" with no count, entries read "Earlier game" ("71 changes · 67 undone") | Pass. "Changes 3" before; after: "Changes" with no count, entries read "Earlier game" ("64 changes · 61 undone") |
| 10. Profile header | Pass. Alex Oxlade-Chamberlain: name on one line, tabs at the same height in view and edit | Pass. Alex Oxlade-Chamberlain: name on one line, tabs at the same height in view and edit | Pass. Alex Oxlade-Chamberlain: name on one line, tabs at the same height (Y 338) in view and edit |

How the two rare states were reached. Negative budget: FM Lens never writes a
budget below zero, FM does, so the budget was set to £0 and a contracted player
released through FM Lens; the Mac copy `FM Lens Exact Wage 2026-11-08` already
has Arsenal at -£2,097,590. Earlier game: FM Lens stayed open while FM loaded
another game without saving, then Reload.

Mac: FM27 native on Apple Silicon (FM processes 38718 then 39658, code type
ARM64) and under Rosetta (FM processes 83781 then 38386, code type X86-64
translated), each with the branch bridge injected and the test FM Lens build
run the same way. Test copy `FM Lens Permit 2026-11-09` (Arsenal, 8 Dec 2027),
then `FM Lens Exact Wage 2026-11-08` for checks 1 and 9, both opened through
Load Game and quit without saving.

Windows: FM27 on the test machine (FM process 7016) with the Windows build of
the same commit, in `Lens Test` (a copy of the main save, Arsenal, 13 Jul
2026), loaded again through Load Game without saving for check 9.

The bridge is the same as in 1db332b. Main career SHA-256 stayed
3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5 on Windows. The released
0.7.0 bridge was restored on the Mac afterwards.

## Edit reads Done while editing (10 November 2026)

In edit mode the toggle in a profile's header still read "Edit". It now reads
"Done" and ends the editing, like Done in the footer. Both labels are always
laid out, one of them unseen, so the button keeps its width and nothing beside
it moves.

Packaged release builds of `fix/edit-done` (74ef806), driven through the
accessibility API (UI Automation on Windows). Test copies only, never saved;
Continue was not pressed. Nothing was applied.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Edit reads Done while editing | Pass. Declan Rice: "Edit", then "Done" with Discard, Apply and Done in the footer | Pass. Declan Rice: "Edit", then "Done" with Discard, Apply and Done in the footer | Pass. Kylian Mbappé: "Edit", then "Done" with Discard, Apply and Done in the footer |
| Done ends the editing | Pass. Reads "Edit" again, footer gone | Pass. Reads "Edit" again, footer gone | Pass. Reads "Edit" again, footer gone |
| Nothing moves | Pass. Button, Compare and the tabs in the same place in both states | Pass. Button, Compare and the tabs in the same place in both states | Pass. Button at 1087, 218 in both states; Compare at 999, tabs at Y 338 |

Mac: FM27 native on Apple Silicon (FM process 58420, code type ARM64) and under
Rosetta (FM process 56808, code type X86-64 translated), each with the branch
bridge injected and the test FM Lens build run the same way. Test copy `FM Lens
Permit 2026-11-09` (Arsenal, 8 Dec 2027), opened through Load Game and quit
without saving.

Windows: FM27 on the test machine (FM process 7016) with the Windows build of
the same commit, in `Lens Test` (a copy of the main save, Arsenal, 13 Jul
2026).

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5
on Windows. The released 0.7.0 bridge was restored on the Mac afterwards.

## FM27 27.0.1 (10 November 2026)

FM27 27.0.1 (Steam build 26385295) moved every address FM Lens uses. The three
new profiles are in `profiles/fm27/`; how they were made is in
[recon/fm27-steam-26385295.md](recon/fm27-steam-26385295.md). This is the run
of [PATCH-VALIDATION.md](PATCH-VALIDATION.md) on that build.

Packaged FM Lens 0.7.2 built from `feat/fm27-27.0.1-profiles` (0cfebf8), driven
through the accessibility API (UI Automation on Windows). Every edit was read
back with `fmlens-probe` of the same commit. Test copies only.

Read checks (`scripts/check-build.sh`): 15 of 15 on Apple Silicon
(`reports/build-check/2A2D0ED6-324E-3D0D-A27D-10AEDBD0E270-20261110-181122`) and
15 of 15 under Rosetta
(`reports/build-check/94CDDC80-8474-327A-85E0-E4FF95DC6893-20261110-184925`).
On Windows `fmlens-probe health` named the build "FM27 Steam build 26385295
(27.0.1)" and passed 12 of 12; `info` gave game_plugin.dll size `0x17cb9000`,
timestamp `0x6ae8b5a4`.

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Profile matched, data loaded | Pass. UUID 2A2D0ED6, Arsenal, 8 Dec 2027 | Pass. UUID 94CDDC80, Arsenal, 8 Dec 2027 | Pass. 25,025 players, Ayo Elu, Arsenal, 28 Jul 2026 |
| Player attribute | Pass. Bukayo Saka Heading 9 to 12 (stored 46 to 60) | Pass. Saka Heading 12 to 14 (stored 70) | Pass. Saka Heading 9 to 12 (stored 45 to 60) |
| Contract wage | Pass. Saka 300,000 to 310,000 | Pass. Saka 310,000 to 320,000 | Pass. Saka 300,000 to 310,000 |
| Add injury, then Heal | Pass. Abdominal strain from 8 Dec 2027, back 26 to 30 Dec; Heal: none | Pass. Injury added; Heal: none | Pass. Abdominal strain from 28 Jul 2026, back 16 to 21 Aug; Heal: none |
| Work permit Revoke, then Request | Pass. Gabriel: none, then "England: active" | Pass. Gabriel: none, then "England: active" | Pass. Gabriel: none, then "England: active" |
| Loan, then End loan | Pass. Ethan Nwaneri to Barcelona, 8 Dec 2027 to 30 Jun 2028; back at Arsenal | Pass. Nwaneri to Barcelona; back at Arsenal | Pass. Saka to Barcelona, 28 Jul 2026 to 30 Jun 2027; back at Arsenal |
| Transfer club to club | Pass. Paul Ifill, Greytown AFC to Arsenal, 1,000 a week to 30 Jun 2028 | Pass. Ifill, Arsenal to Barcelona | Pass. Ifill, Greytown AFC to Arsenal, 1,000 a week to 30 Jun 2028 |
| Release | Pass. Ifill a free agent, no contract | Pass. Ifill a free agent | Pass. Ifill a free agent, no contract |
| Sign later, then Cancel transfer | Pass. Arsenal on 20 Dec 2027 (offer 366); cancelled | Pass. Arsenal on 20 Dec 2027 (offer 366); cancelled | Pass. Arsenal on 10 Aug 2026 (offer 1388, 44 to 45 future transfers); cancelled, 44 again |
| Sign now | Pass. Ifill at Arsenal | Pass. Ifill at Arsenal | Pass. Ifill at Arsenal, 1,000 a week to 30 Jun 2028 |
| Club balance | Pass. Arsenal 190,798,094 to 200,000,000 | Pass. Arsenal 199,934,557 to 210,000,000 | Pass. Arsenal 334,756,885 to 340,000,000 |
| Max tactics | Pass. First team, 30 changes | Pass. U21 (team 28112), 28 changes, values at 10000 | Pass. First team (team 459), 25 changes, values at 10000 |
| Lift bans, Heal, Refresh fitness, Remove unhappiness | Pass. Bans 3 to 0; 17 unhappy cleared | Pass. Neilor Oldoni's ban lifted; Heal 1 change | Pass. Heal 1 change, Refresh fitness 54, Remove unhappiness 4; no Arsenal ban to lift |
| Staff attribute | Pass. Nicolas Jover Fitness 3 to 6 (stored 15 to 30) | Pass. Jover Fitness 6 to 8 (stored 40) | Pass. Jover Fitness 3 to 6 (stored 15 to 30) |
| Nation field | Pass. England youth rating 135 to 140 | Pass. England youth rating 135 to 140 | Pass. England youth rating 135 to 140 |
| Undo in Changes | Pass. Youth rating back to 135, "135 changes · 1 undone" | Pass. Back to 135, "179 changes · 1 undone" | Pass. Back to 135, "42 changes · 1 undone" |
| FM shows it | Pass. Heading 12 on Saka's profile at once; news "Paul Ifill deal falls through"; 30-man squad with Nwaneri back | Pass. Heading 14 and £325K p/w on Saka's profile | Pass. Inbox: "Paul Ifill deal falls through", "Gabriel granted work permit" |
| FM kept running | Pass | Pass | Pass. `fm` responding after every action |
| Saved under a new name, reloaded | Pass. Saved as `FM-Lens-27.0.1-2026-11-10` | Pass. That save loaded: Heading 12, wage 310,000, Jover Fitness 6, balance 200,000,000, youth rating 135, Ifill at Arsenal | Pass. Saved as `FM-Lens-27.0.1-Windows`, FM quit and started again (process 7140), that save loaded: Heading 12, wage 310,000, Jover Fitness 6, balance 340,000,000, youth rating 135, Ifill at Arsenal, Gabriel's permit active, tactics at 10000, 44 future transfers |

On Windows seven of the 26 functions FM Lens has the game run are protected, so
their place in the file could not be compared with 27.0.0 (see the recon note).
Each ran here in the game: `add_injury` (Add injury), `remove_work_permit`
(Revoke), `withdraw_offers` (Release, Transfer), `start_loan` (Loan),
`date_value` and `map_insert` (Sign later), `maximise_tactics` (Max tactics).

Notes:

- Max tactics reports only the players it changed. On the Rosetta run Arsenal's
  first team was already at the maximum in the loaded save and read "No changes
  made", so the check used the U21 team.
- FM rounds the wage in a profile's header: 310,000 shows as £300K p/w and
  320,000 as £325K p/w. The stored wage is the one set.
- `fmlens-probe injuries 602` stops at Gabriel on this build as it did on
  27.0.0. FM Lens itself lists and heals injuries.

Mac: FM27 27.0.1 native on Apple Silicon (FM process 98125, FM Lens 98521) in
the test copy `FM Lens Permit 2026-11-09` (Arsenal, 8 Dec 2027), saved only as
the new file `FM-Lens-27.0.1-2026-11-10`. Then under Rosetta (FM process 1006,
started with `arch -x86_64` and the packaged universal bridge) in that new
save, quit without saving.

Windows: FM27 27.0.1 on the test machine (FM process 5016, FM Lens 4168) with
the installer CI built from the same commit, in `FM Lens Persist Check` (a copy
of the main save, Arsenal, 28 Jul 2026), saved only as the new file
`FM-Lens-27.0.1-Windows`. No other save changed.

Main career SHA-256 stayed 3ADEB4FD...BD956000 on Mac and AF20CBAC...2CB747E5
on Windows. The installed bridge was restored on the Mac afterwards.

### The published 0.7.3

The same checks in short, with the files users download: FM Lens 0.7.3 from
`fm-lens-releases` (tag `v0.7.3`, 3b77b0b), which differs from the build above
only in its version, notes and translations.

| | Apple Silicon | Rosetta | Windows |
|---|---|---|---|
| Build | `FM-Lens-0.7.3-macos-universal.zip`, bridge SHA-256 D1CD89AD...72D3B2DB | The same app, started with `arch -x86_64` | `FM-Lens-0.7.3-windows-x64-setup.exe` |
| Processes | FM 15956, FM Lens 16283 | FM 16659 and FM Lens 17919, both translated | FM 7140, FM Lens 4576 |
| Connects | Pass. 30,314 players, 8 Dec 2027, no read-only notice | Pass. The same | Pass. 28 Jul 2026, no read-only notice |
| Attribute edit | Pass. Jover Fitness 6 to 9, probe read 45 (9) | Pass. Jover Fitness 6 to 9, probe read 45 (9) | Pass. Saka Heading to 13, shown after Reload |
| Game action | Pass. Saka: abdominal strain added (back 26 to 30 Dec 2027), then healed | Pass. The same | Pass. Saka: abdominal strain added (back 16 to 21 Aug 2026), then healed |
| FM afterwards | Running, quit without saving | Running, quit without saving | Running, not saved |

Mac: both runs loaded `FM-Lens-27.0.1-2026-11-10` and saved nothing. That file
kept its size and date, every career kept its SHA-256, and the installed bridge
was not changed. Windows: the session that loaded `FM-Lens-27.0.1-Windows`.

Game Pass on 27.0.1 has no profile yet, so FM Lens is read-only there.

## Base transfer valuation (10 November 2026)

FM Lens previously read only the asking price, not a player's transfer valuation.
The Contract tab now has a read-only Base transfer value alongside Asking price.
It reads the stored base value in pounds, not the manager-specific scouting range.
A missing mapping, negative value or FM's 300,000,000 marker returns unavailable;
a player without a team has a zero valuation, matching the game's getter.
The field is not added to the editor or template whitelist.

Static evidence on Steam 26385295 (27.0.1): ARM64's range getter at `0xD55D2C`
reads `player+0x22C` at `0xD55DBC`, after checking the team at `+0x128`.
Its caller at `0x2D3ED98` publishes the results as `min_player_value` and
`max_player_value`. The Intel counterpart reads `+0x22C` at `0xE04909`, also
after checking the team at `+0x128`. Windows' valuation consumer at `0xBA2150`
reads `+0x234` at `0xBA2197`, after checking `+0x130`, and handles 300,000,000
separately. The two platform layouts now map those fields. The optional offset
keeps external layouts without a mapping compatible and unavailable.

Read-only live checks: FM process 26049, ARM64 UUID
`2A2D0ED6-324E-3D0D-A27D-10AEDBD0E270`, started through Steam with the installed
bridge. Explicitly selected `FM-Lens-27.0.1-2026-11-10` in Load Game, Arsenal,
8 December 2027. Saka (28122642) reads 137,779,209, asking price unset; FM's
profile shows a £100M to £138M range. Messi (7458500) reads 2,585,359, asking
price unset. The base value is not presented as an exact reproduction of that
FM range. No edits, Continue or saves were performed.

The main career SHA-256 before the check was
`3ADEB4FDEF1C5928A5F396E719C9216842282665AF21E9E8A3B8E803BD956000`.
Local diagnostics and binary scratch are ignored under `reports/transfer-value/`.

Packaged-app check on Apple Silicon (debug bundle, same FM process and copy,
8 December 2027): Saka's Contract tab shows Base transfer value £137,779,209
beside Asking price Not set. His share card's Value reads £137.8m. In the same
app, Copy image put a 1080x1350 PNG on the clipboard and Copy caption copied
the caption. Read only: no edits, Continue or saves.

Windows (installer `FM Lens_0.7.3_x64-setup.exe` from PR 202's CI, FM27 27.0.1,
`FM-Lens-27.0.1-Windows`, 28 July 2026): Saka's Contract tab shows Base transfer
value £121,323,339 and his share card's Value reads £121.3m. Copy image put a
1080x1350 PNG on the clipboard, and Save PNG wrote
`bukayo-saka-post-2026-07-28.png` (148,168 bytes) to `Documents\FM Lens\Exports`.
Read only.

Intel (Rosetta: FM started with `arch -x86_64` and the bridge, the debug bundle
also under `arch -x86_64`, the same `FM-Lens-27.0.1-2026-11-10` copy): profile
"FM27 Steam build 26385295 (27.0.1, macOS, Intel)". Saka's Base transfer value
reads £137,779,209, as on Apple Silicon. Copy image put a 1080x1350 PNG on the
clipboard, byte for byte the Apple Silicon card; Save PNG wrote
`bukayo-saka-post-2027-12-08.png` to `~/Documents/FM Lens/Exports` (removed
afterwards); Copy caption copied the caption.

## Birth years in long careers (10 November 2026)

The players and staff checks took a birth year after 2020 as a misread, so a long
career, whose youth players are born later, would have turned players' details
and staff read-only. The limit is now the in-game year when the date is read,
and 2020 when it is not. Problem reports now list the checks that did not pass,
with their counts and notes, in a "Checks that did not pass" section.

Read-only check on Apple Silicon (FM process 26049, Steam 26385295, the
`FM-Lens-27.0.1-2026-11-10` copy, 8 December 2027): `fmlens-probe health` with
this change passes all 12 checks, players 2,000 of 2,000 and staff 2,000 of
2,000. No edits, Continue or saves. On Windows (the session above) the packaged
app connected with no read-only banner. Intel (the Rosetta session above):
`fmlens-probe health` passes all 12 checks, players and staff 2,000 of 2,000,
and the app connected with no read-only banner.

The editor wrote birth dates up to 2020-12-31 only. It now writes them up to the
game's date when that is later, for players and officials. `fmlens-probe fields`
on the same copy shows `date_of_birth` from 1940-01-01 to 2027-12-08, the
in-game date.

Packaged-app writes on Saka (born 2001-09-05), in each test copy:

- Apple Silicon (debug bundle, 8 December 2027): 15/06/2028 is marked invalid.
  15/06/2025 applies, the probe reads 2025-06-15 back, and health passes all 12
  checks with it. Undo in Changes restores 2001-09-05.
- Windows (installer above, 28 July 2026): 15/06/2028 is marked invalid.
  15/06/2025 applies ("1 change applied.", age 1), and a reload shows no warning
  banner. Undo in Changes restores age 24.
- Intel (Rosetta session above, 8 December 2027): 15/06/2028 is marked invalid.
  15/06/2025 applies ("1 change applied.", age 2), the probe reads 2025-06-15
  back, health passes all 12 checks with it, and a reload shows no warning
  banner. Undo in Changes restores 2001-09-05.

No test copy was saved, and the main careers' SHA-256 did not change.

## Email before first use (10 November 2026)

FM Lens asks for an email address once on each computer before it opens, and
sends it to the Kit form the website uses (`app/src/EmailGate.tsx`).

- Apple Silicon (debug bundle): the screen shows at first start. Kit refuses
  `fmlens-check@localhost`; the screen says "That did not work. Check the
  address and try again." and stays.
- Windows (installer above, on an AWS address): Kit quarantined the same address
  and answered with its reCAPTCHA page. The app opened that page in the browser
  and went on to Connect. Kit holds a quarantined address until the page is
  completed; it was not completed here. To show the screen again, the stored
  flag was removed from WebView2's storage.
- Intel (Rosetta session above): with the stored flag removed, the screen shows
  at start. Kit refuses `fmlens-check@localhost`, as on Apple Silicon, and the
  screen stays. The flag was left removed, as it was before the checks.

## Email through FM Lens's relay (11 November 2026)

The email screen now posts the address to the relay's `POST /subscribe`, which
adds it to Kit form 10172074 with Kit's API (`relay/index.js`). The app no
longer talks to Kit, so Kit's reCAPTCHA page never comes up.

- Windows (installer from this branch's CI run, on an AWS address, where Kit
  quarantined the old form post): with the stored flag removed from WebView2's
  storage, the screen shows at start. The user's own address went through and
  the app went straight to Connect, with no browser page. Kit lists the address
  as inactive, added to form 10172074 at 23:17 UTC, so Kit's confirmation email
  goes out as before.
- Apple Silicon (debug bundle from this branch): with the stored flag removed,
  the screen shows at start. `fmlens-check@localhost` is refused by the relay;
  the screen says "That did not work. Check the address and try again." and
  stays. The same address as on Windows then went straight to Connect.
- Intel (the same bundle under `arch -x86_64`, translated): with the flag
  removed again, the screen shows at start, and the same address went straight
  to Connect.

After all three, Kit still holds one record for the address, inactive and
created at 23:17 UTC: sending an address Kit already has adds no duplicate.

Confirmation: a second new address, sent from the Apple Silicon app at 23:32
UTC, got Kit's "Confirm your email for FM Lens" email within a minute. After its
link was clicked, Kit lists it as active. Sending it again from the Intel app
went straight to Connect and left it active, still one record on the form.

The Mac flag was removed afterwards, as it was before the checks.

## Signups confirmed without an email (11 November 2026)

The relay now adds each address to Kit as active, and the form's "Send
confirmation email" (Kit, Newsletter site, Sign Up Form) is off, so Kit
auto-confirms signups. Deployed to `fm-lens-report-relay` at 00:27 UTC.

- A new address sent to the deployed relay's `POST /subscribe` answered
  `{ "subscribed": true }`. Kit lists it as Confirmed, with no email sent.
- An address Kit already held as unconfirmed, sent again, turned Confirmed: the
  signups waiting on the old confirmation email were confirmed this way.

## The published 0.7.4 (11 November 2026)

FM Lens 0.7.4 from `fm-lens-releases` (tag `v0.7.4`, db0d43f), checked with the
files users get. `latest.json` names 0.7.4 for `darwin-aarch64`,
`darwin-x86_64` and `windows-x86_64`.

| | Apple Silicon | Rosetta | Windows |
|---|---|---|---|
| Build | The installed 0.7.3, updated through `latest.json` | The same app, started with `arch -x86_64`, X86-64 (translated) | The installed 0.7.3, updated through `latest.json` |
| Update | Pass. Updated itself to 0.7.4 | - | Pass. Found 0.7.4, Relaunch to update installed it |
| Email screen | Shown, as the stored flag was removed after the relay checks. The user's address went on to What's new | Not shown. Straight to Connect | Not shown. The address was already saved |
| What's new | Pass. 0.7.4 | - | Pass. All six lines, in English |
| Connects | Not run, FM was not open | Not run | Pass. 25,025 players, no read-only notice |

`FM-Lens-0.7.4-macos-universal.zip` from the release holds an app with x86_64
and arm64, reports 0.7.4, includes `libfmlens_bridge.dylib` and is signed ad hoc.

Windows: FM was running the test career from earlier checks. On connect FM Lens
put back a freeze left from an earlier session ("Freezes from last time are back
on: Money: Arsenal"). No edits were made and the career was not saved.

## Site signup through the relay (11 November 2026)

The download page's form now posts the address to the relay's `POST /subscribe`
(`site/signup.js`) instead of Kit's form, so visitors no longer reach Kit's
reCAPTCHA page.

Checked on a local copy of `site/` with analytics turned off, against the live
relay: an address the relay refuses shows the error and starts no download, and
a real address goes through. Kit still holds one active record for it. On
getfmlens.com after the deploy, `signup.js` no longer names `app.kit.com`, and
the relay answers the page's preflight with 204.

## Unhappiness that came back after Continue (11 November 2026)

Report: Remove unhappiness and Max morale on Arsenal, then Continue, and FM's
"Squad unhappy with club situation" came again the next day, with the same
players unhappy and their morale down. Two causes, both in how the game keeps
this state, read from `game_plugin` (macOS arm64, Steam build 26385295; the
record offsets are the same in the Windows `game_plugin.dll`).

**Reasons were deleted, not ended.** A contract's record of reasons to be
unhappy (`[contract+0x30]`) is a `u8` count, a ring of ten pointer slots from
+8, and at +0x58 the slot of the oldest. An entry is 28 bytes: the date it began
at +0, the date it ended at +4 (1 January 1900 while it lasts), the reason at
+0x16 and its kind at +0x18. Entries sit 28 bytes apart, so one may be aligned
to four bytes only. The game's own Remove unhappiness writes today's date, as
the game holds it with its flags, over the ended date of each entry that lasts,
and leaves the entry listed. An ended entry is what stops the game from raising
the same reason again: it waits 10 days after the last one of its kind ended,
or 30, 90 or 120 by reason. FM Lens set the count to 0, which left nothing to
wait on.

**The atmosphere score is reused for seven days.** A team's dynamics record
(`[[team+0xA0]+0xC8]`, with the team back at +0x40) keeps the dressing room
atmosphere at +0xCB with the date it was worked out at +0xA8, and the support
for the manager at +0xCE with its date at +0xAC. FM's Dynamics screen works the
score out afresh; the game's own logic reuses it until it is seven days old.
Under -40 the squad complains (reasons 570 and 571). Arsenal on 10 December
2027 held -62, worked out on 7 December, so the complaint kept coming whatever
the players' morale now was.

The fix:

- Remove unhappiness, on a player's Mood tab and as a team action, ends each
  lasting reason with today's date as the game does. Undo has them last again.
- A write to morale, happiness, playing time happiness or unhappiness resets
  the two dates of every team of the player's club, so the game works the
  scores out again from how the players feel now. A record that does not point
  back at its team, or whose date is not a day of this year or the last, is
  left alone.
- Reasons are read through the ring, so a list that has wrapped reads in order.

Checked without writing, on the running career (native macOS FM, 10 December
2027): `fmlens-probe concerns UID` reports what the plan would end and the
dates of the squad's scores.

| Player | Entries | Plan | Arsenal first team |
|---|---|---|---|
| Bukayo Saka | 1, since 10 Dec 2027, reason 570 | Ends 1 | Atmosphere and support both worked out 7 Dec 2027 |
| David Raya | 1, since 10 Dec 2027, reason 811 | Ends 1 | The same |
| Declan Rice | 1, since 10 Dec 2027, reason 811 | Ends 1 | The same |
| Martin Ødegaard | 1, since 10 Dec 2027, reason 811 | Ends 1 | The same |
| Tommy Setford | No record | Nothing to end | The same |

Saka's and Raya's entries are at addresses aligned to four bytes; the first
build of the plan skipped them and the check caught it.

In the browser preview's sample data: Remove unhappiness on Northbridge FC's
first team made 18 changes and Undo brought all 18 back; on Søren Yılmaz's Mood
tab it logged "Reasons to be unhappy 2 → 0" and the list read "Nothing makes
him unhappy".

### Happiness that went back after Continue

The game does not keep a contract's happiness as written. It puts it inside a
band, set by the worst reason to be unhappy that lasts, or by morale when no
reason counts (macOS arm64 build 26385295, the function at 0x2028BFC):

| What holds it | Happiness |
|---|---|
| Worst lasting reason of kind 1 | -40 to -20 |
| Kind 2 | -60 to -40 |
| Kind 3 or 4 | -80 to -60 |
| Kind 5 | -100 to -80 |
| Kind 6, 99 or 100 | -100 |
| Any other kind | Left where it is |
| No reason that counts, morale 18 to 20 | 80 to 100 |
| Morale 15 to 17 | 60 to 80 |
| Morale 13 or 14 | 40 to 60 |
| Morale 11 or 12 | 20 to 40 |
| Morale 10 or less | -20 to 20 |

A reason being talked over with the manager (status 19 or 20) does not count,
nor do the motives 0, 900 to 930, 1100, 1104 and 1106.

An edit of happiness now takes with it what the game would use to put it back.
Lasting reasons that hold it in another band end, as Remove unhappiness ends
them, and morale moves to the nearest value whose band takes the new happiness,
unless the same edit sets morale. Each shows as a change of its own in Changes
and can be undone. A mass edit of happiness does the same per player, inside its
batch. A happiness under -20 stays only while a reason holds it there.

Remove unhappiness now also ends the reasons on a loan contract, as the game's
own action does.

Checked without writing, on the running career (10 December 2027): of 49 Arsenal
players read, every one at the club with no reason that counts sits inside his
morale's band. Morale 20 reads 80 to 100, Merino at 15 reads 80, Gabriel at 14
reads 40, Rice at 11 reads 20 (his reason is at status 19), and morale 10 or less
reads 5 to 20. Ben White, out on loan, does not fit (morale 17, happiness 40).
Unit tests cover the bands, the reasons left out and the morale chosen.

### Other edits that can look reversed

- Manager support: the game reused its score for seven days, like the
  atmosphere. A mood edit now resets both dates.
- Cohesion: written values hold. On 5 November the 26 raised to 100 still read
  100 after Continue. On the running career 22 players read 99 and 4 read 98,
  none 100: the game takes a point off now and then, and nothing went back to
  what it was before.
- Tactics: written values hold. On the running career 551 entries read exactly
  9944, which fits 10000 from Max tactics lowered by 56 since. The low entries
  beside them (544, 600, 656) are new: the game starts one when a tactic's
  settings change. Max tactics raises those when pressed again.

### Write, Continue and a week on (Apple Silicon, 11 November 2026)

The packaged universal build of this branch (0.7.6), native arm64 FM, on a copy
of the career saved as `FMLensMoodTest` (10 December 2027). The main career's
hash matched its baseline before and after.

Edits, all through the app: Remove unhappiness on Arsenal's first team (10
changes), happiness 100 for Raya (morale 11 to 18 came with it) and 60 for Rice
(morale 11 to 13), Max cohesion (29) and Max tactics (29). As a control, Saliba
got happiness 100 with morale 12 set in the same edit, which the band does not
allow. Dael Fry at Birmingham got happiness 100: his reasons ended and his
morale went from 8 to 18.

Morale / happiness, read with the probe:

| Player | Before | Edited | First Continue | Next day | A week on |
|---|---|---|---|---|---|
| Raya | 11 / 20 | 18 / 100 | 18 / 100 | 15 / 100 | 13 / 60 |
| Rice | 11 / 20 | 13 / 60 | 13 / 45 | 10 / 45 | 15 / 70 |
| Saliba (control) | 11 / 20 | 12 / 100 | 12 / 40 | 9 / 40 | 13 / 60 |
| Saka | 20 / 80 | 20 / 80 | 20 / 83 | 17 / 83 | 16 / 100 |
| Gabriel | 14 / 40 | 14 / 40 | 14 / 50 | 11 / 50 | 13 / 80 |
| Timber | 11 / 20 | 11 / 20 | 11 / 24 | 9 / 24 | 13 / 60 |

- Remove unhappiness held. A week on (18 December) all ten reasons were still
  ended and no player had a new complaint about the atmosphere. FM's Dynamics
  read Managerial Support "Very good", Team Cohesion "Excellent" and Club
  Atmosphere "Good", with one issue: Pacho wanted to start more games (a new
  reason from 15 December).
- The scores were worked out again: both dates read unset after the edit,
  10 December by the end of that day and 15 December a week on.
- Happiness stayed where the band allows it and went back where it does not:
  Raya kept 100, Rice moved inside 40 to 60, and the control Saliba fell to 40.
- Happiness is not a value the game leaves alone after that. It applies the
  band when it next changes a player's happiness, not daily, and training,
  selection and matches change it for every player. After the Spurs match the
  unedited Pacho went from 65 to -40, Meslier from 80 to 35 and Merino from 80
  to 40. So an edited happiness is where the player starts, as with morale.
- Cohesion read 100 through the match day and 99 a week on (98 for a few).
  Tactics entries read 10000, then 9944 for all but the first of each group
  after the match, and 9916 and 9776 a week on: the game takes multiples of 28
  off.

The same save loaded again with nothing edited, as a baseline:

- After one Continue Saka's happiness fell from 80 to -40, held there by his
  reason, and a day on his morale was 8, down from 20. All ten reasons were
  still open and both scores still dated 7 December.
- Morale fell overnight without any edit, from 17.1 to 14.2 on average over the
  first team (17.3 to 14.7 in the edited run). The fall is the game's own.
- Remove unhappiness (10 changes) and Max morale (28) on that baseline, then
  one Continue: FM's Dynamics read Club Atmosphere "Excellent", "no unhappy
  players at the club" and no issues, and every morale still read 20.
- An edit pressed before Reload, with FM Lens still holding the other save, was
  refused for every player ("FM has moved its data since FM Lens read it. Press
  Reload, then try again.") and wrote nothing.

The band above is one of two. A byte the game keeps at 0x5770988 (this build)
picks the other when it reads 1 to 3: morale 15 to 17 then allows 60 to 100,
11 to 14 allows 40 to 100, 6 to 10 allows 20 to 80, 4 or 5 allows -20 to 60 and
less allows -20 to 40. This save uses the table above, which the control
confirms, and edits are worked out for it. What sets the byte is not known.

### Write, Continue and a day on (Windows, 11 November 2026)

The packaged Windows build of this branch, FM 27.0.1, on the same unedited
`FMLensMoodTest` save (10 December 2027).

Edits, all through the app: Remove unhappiness on Arsenal's first team (10
changes), happiness 90 for Rice (morale 11 to 18 came with it), Max tactics
(29) and Max cohesion (29).

| Player | Before | Edited | First Continue | Next day |
|---|---|---|---|---|
| Rice | 11 / 20 | 18 / 90 | 18 / 80 | 15 / 80 |
| Raya | 11 / 20 | 11 / 20 | 11 / 23 | 10 / 23 |
| Saka | 20 / 80 | 20 / 80 | 20 / 83 | 17 / 83 |
| Gabriel | 14 / 40 | 14 / 40 | 14 / 45 | 12 / 45 |
| Timber | 11 / 20 | 11 / 20 | 11 / 24 | 8 / 24 |

- Remove unhappiness held. All ten reasons read ended on 10 December and none
  was open or new a day on. FM's Dynamics on 11 December read Head Coach
  Support "Very good", Team Cohesion "Excellent" and Club Atmosphere "Good",
  with "no unhappy players at the club", no issues and 0 unhappy players.
- The scores were worked out again: both dates read unset after the edit, the
  atmosphere 10 December after the first Continue and the support score
  10 December a day on. The `[dynamics]` offsets in the Windows layout are
  right.
- Rice's happiness moved from 90 to 80, the top of what morale 18 allows, and
  stayed there. Morale fell overnight from 17.2 to 14.6 on average, the game's
  own fall seen on the Mac.
- Cohesion read 100 for all 48 pairs a day on. Tactics entries read 10000,
  then 9972 a day on.

Not yet run: Max morale past the first Continue, the packaged app under
Rosetta, and Windows past the first day.

## Freeze all in Mass edit (11 November 2026)

Mass edit's freeze box, applied with the edit (#235). Packaged builds: the
universal Mac app with native arm64 FM on a copy of the career (17 December
2027), and a Windows release build with FM 27.0.1 on the test career
(11 December 2027). The list was a search for "Saka": 18 players.

| Step | Apple Silicon | Windows |
|---|---|---|
| Tick the box, no field filled in | "18 to freeze", Apply on with no preview | The same |
| Apply | "18 frozen"; `frozen.json` held the 18 under the save; Bukayo Saka's profile box was ticked | "18 frozen"; `frozen.json` held the 18 |
| Undo this mass edit | Not run here | "18 unfrozen"; the list in `frozen.json` was empty |
| Open again, untick, Apply | The box opened ticked; "18 to unfreeze", then "18 unfrozen"; the list was empty | Not run |
| Undo of that unfreeze | "18 frozen"; `frozen.json` held the 18 again | Not run |
| Tick the box and set Current ability to 150, Preview | "18 changes for 18 of 18 players · 18 to freeze"; Apply stays off until the preview | The same |
| Apply | "18 changes applied", "18 frozen"; the list read 150 and Changes counted 18 | The same |
| Undo this mass edit | "Undid 18 changes", "18 unfrozen"; Saka read 186 again; `frozen.json` was empty | The same; the list read its old values |

After Apply or Undo the dialog shows what was done and takes no further edit
until it is opened again, as it did before the freeze box. Nothing was left
frozen and no edit was left standing; neither career was saved.

Not run: the packaged app under Rosetta; staff and clubs in the packaged app
(both were run in the browser preview); a Continue with a mass freeze on. The
hold itself is the profiles' freeze, followed over a holiday on 8 November.

## A freeze holds current ability too (12 November 2026)

Feedback on 0.7.7: "the freeze does not work for all". A frozen player kept
every attribute, but his current ability still fell, so FM showed him
declining. The freeze now holds current ability with the attributes
(`held_fields` in `app/src-tauri/src/lib.rs`).

Windows only, on a holiday from 28 July 2026, with a release build of this
branch as `FM Lens Ability.exe`. Players were frozen with Mass edit's freeze
box, the list exported before and after each holiday, and the 47 visible
attributes and CA compared by player.

| Run | Build | Holiday | Frozen | Not frozen |
|---|---|---|---|---|
| 1 | 0.7.7 | 28 Jul to 27 Aug 2026, aged 34+ | 1,004: no attribute point lost; CA down for 690 (mean -0.83, worst -3) | 731: 308 lost 695 points; CA down for 615 |
| 2 | This fix | 27 Aug to 26 Sep 2026, aged 34+ | 1,011: no point lost; CA down for none, up for 2 | 766: 498 lost 1,011 points; CA down for 644 (mean -0.87) |
| 3 | This fix | 26 Sep 2026 to 14 Apr 2027 (200 days), aged 32+ | 1,861: no point lost; CA down for none, up for 47 (+1 or +2) | 1,072: 1,055 lost 7,286 points; CA down for 1,022 (mean -4.91, worst -10) |

In run 3 the unfrozen players lost pace (831 of them), stamina (848), agility
(800), strength (786) and acceleration (750). A frozen player's attributes
still rise: a gain is kept as the new held value.

Not held, as before: position ratings (a few fell, `rating_dm` for 7 frozen
players), reputation and the hidden values.

After run 3, Mass edit unfroze the 1,872 frozen players still in the list
("1,872 unfrozen"). `frozen.json` kept 73 players who had left the players'
list by then (retired): the list cannot reach them, so they stay in the file.

Not run: the Mac, either architecture; a full season. The career was moved on
by the holiday's own autosaves and is a test career.

## Sorting, more filters and every attribute (12 November 2026)

Read-only work, from an audit of the search and viewing features. No game was
running: this was written and checked on a Linux machine, so nothing here is
live evidence. The native checks at the end are still owed.

What changed:

- Every list sorts by its column headers, not only the players'. Without a
  click a search still answers best first.
- Player filter: upper bounds on CA and PA, ranges on height, weekly wage and
  the stored base value, bounds on the eight personality ratings (in the
  attribute rows) and one trait. The list rows now keep these values. They are
  read from the same offsets, and in the same reads, as the profile's: no new
  mapping. A row follows an edit to wage, height, personality or a trait, and
  reads its contract and value again after a transfer, swap, signing, release
  or the undo of one. What FM changes itself shows after Reload, as before.
- Staff and officials: CA and PA ranges; officials also a reputation range.
- Clubs: a Nation column, filter and sort, from the club's own nation pointer.
  First written against `club.nation`, which is the nation whose league the
  club plays in; corrected for 0.7.8 to `club.plays_in` (see "0.7.8 on the
  Mac" below).
- Stadiums: the owner, shown when the stadium's owner field (`stadium.owner`,
  +0x90 in both layouts, never read before) points at a club FM Lens read. A
  club's profile shows it only when it is another club. Anything else, a
  council's ground included, shows no owner.
- A player's profile shows every attribute: the group of his own kind first and
  the other kind's under Physical, so an outfielder's goalkeeping attributes
  and a keeper's outfield ones can be seen and edited one at a time.

Checks that ran:

- `cargo fmt --all --check`.
- `cargo clippy --locked --target x86_64-pc-windows-gnu --workspace
  --all-targets -- -D warnings`, and the same for `-p fmlens-core -p
  fmlens-probe` with `--target aarch64-apple-darwin`. Type checks only: nothing
  was linked for macOS.
- `cargo test --locked --target x86_64-pc-windows-gnu -p fmlens-core -p
  fmlens-probe` under Wine: 112 core tests, with new ones for the ranges, the
  personality and trait filters, every list's sort, the club nation filter, the
  owner lookup and the row following edits. `-p fmlens-mem
  --no-default-features`: 6 tests.
- `npm test` in `app/`: 75 tests in 15 files, 7 of them new
  (`tests/list-filters.test.tsx`), and `npm run build`.
- The browser preview on sample data in Chromium, at 1440x900 light and
  820x700 dark: the player filters, a profile, all eight lists sorted by a
  header, a club's and a stadium's profile. No console errors. Sample data is
  not live proof.

Not run: the desktop app crate's own tests (they do not link with a Linux
cross toolchain; CI runs them), the macOS build, and anything against FM.

Still to check natively, on a career copy, on macOS and Windows:

- A club's Nation against FM for a few clubs, one based abroad among them
  (Monaco, Swansea), since the layout also has `plays_in`.
- A stadium's Owner against FM for a ground a club owns, one it rents and a
  shared one.
- The wage, value, height, personality and trait filters against the profiles
  of the players they list. Loading the player list makes no more reads of the
  game than before (the values come from the bytes each row already read), and
  the club list a few per nation; confirm neither is slower on a large career.
- A row's wage after a transfer and after its undo.

Gaps from the same audit that need mapping against a running game, so were
not attempted: a complete nation list and a complete stadium list (their
tables' addresses), club income, spending, debt, sponsorship and ownership,
bids, interest, instalments and buy-backs, FM's own value range, a release
clause's condition, clause kinds outside the named table, and a second
editor's check of hidden values.

## List columns, saved filters and search speed (13 November 2026)

Read-only work on the lists, on top of Sorting, more filters and every
attribute above. Nothing here was run against a game: it was written in a
Linux container with no FM, so every check is on code and on the browser
preview's sample data.

What changed:

- Players filter by several positions at once and by a current-reputation
  range.
- The player list shows Value and Wage. Columns, under More, chooses the
  columns and up to eight attribute columns; Value, Wage, Reputation and an
  attribute column sort the list. A value or wage that is not known sorts last
  either way.
- Staff, clubs, nations, stadiums, competitions, awards and officials keep
  saved filters, as the player list did. A player filter saved with one
  position still reads as that position.
- The search index works its best-first order out once, and again after an
  edit, in place of sorting every hit on every request. A filter's nation, club
  or continent text is folded once per request, and a column sort compares
  each text by its place among the others.

The row's value, wage and reputation are the bytes the list already read, at
the offsets the profile uses; the reputation is `player.current_reputation`.

Checks run:

| Check | Result |
|---|---|
| `cargo fmt --all --check` | Pass |
| `cargo test -p fmlens-core -p fmlens-mem -p fmlens-probe`, built for `x86_64-pc-windows-gnu` and run under Wine | Pass. 121 core tests, 5 memory tests |
| `cargo clippy --all-targets -- -D warnings`, `x86_64-pc-windows-gnu`: core, mem, probe and app | Pass |
| `cargo clippy --all-targets -- -D warnings`, `aarch64-apple-darwin`: core, mem and probe | Pass |
| `npm test` | Pass. 95 tests, 5 of them new in `tests/list-columns.test.tsx` |
| `npm run build` | Pass |
| Browser preview, sample data, 1280 x 860: two positions with a reputation range, Columns with two attribute columns sorted by one, and a club filter saved and shown as the one in effect | Looked right in screenshots |

Not run: the app crate's own Rust tests, which do not link in that container;
any macOS build of the app crate; the Tauri bundle; and every native check.
Still to do on a career copy, on each platform: compare Value, Wage and a
reputation filter with FM's screens for a few players, sort the player list by
Value, Wage and an attribute column, and save, reload and apply a filter on
each list.

Speed, on made-up players, with the repository's `SearchIndex` built for
release in the same container. It leaves out reading the game on Connect.

| | 30,314 players, before | after | 550,000 players, before | after |
|---|---|---|---|---|
| Page with no search or filter | 6 ms | under 0.1 ms | 220 ms | 0.3 ms |
| Name search | 1 ms | 0.7 ms | 15 ms | 12 ms |
| Age, CA, position and two attribute filters | 6 ms | 0.2 ms | 237 ms | 6 ms |
| Nation filter | 16 ms | 1.3 ms | 476 ms | 53 ms |
| Sorted by name | 27 ms | 17 ms | 989 ms | 480 ms |
| First search after Connect or an edit | - | 7 ms | - | 186 ms |

## Staff birth date (12 November 2026)

A member of staff's birth date is editable, the human manager's too. No game
was run for this change: it is enabled, unverified.

Why the layout is taken as mapped: the staff record's `date_of_birth` is the
date the staff list already reads ages from and the staff health check already
tests, and it sits at the same place in the person record as a player's, 0x58
into it on macOS and 0x88 on Windows (a unit test holds both layouts to that).
A player's birth date at that place is an edit already in use. The human
manager's is 0x340 further, like his other person fields.

The editor writes 1 January 1920 to 31 December 2020, or to the game's date
once that is later: as for players, but from 1920, since chairmen and owners
are staff. A member of staff with no birth date is left as he is.

| Check | Result |
|---|---|
| `cargo clippy --all-targets -- -D warnings` on `fmlens-core`, for a Windows and an Apple Silicon target, from Linux | Pass. This type-checks the new test; it does not run it |
| `cargo fmt --all --check` | Pass |
| `npm run build` and `npm test` | Pass (7 and 66 tests) |
| Browser preview on sample data (`?writable`), a scout born 20 October 1965 | Career tab: the date is an input in Edit. 01/01/1919 read "1 invalid" with Apply off. 08/03/1938 applied: the profile read 8 Mar 1938, the header's age went from 60 to 88, and Changes listed "Date of birth 20 Oct 1965 → 8 Mar 1938" with Undo |

The unit tests and the app crate's checks need macOS or Windows, so the
Validate workflow was run on the branch at 6f75d25 (run 43177012159): both
`macos-checks` and `windows-checks` passed, the workspace tests and the
Windows installer build among them.

Not run: anything in FM on any platform: the date on FM's staff profile, an
undo, a stale-value refusal, a Continue, and a save, quit and reload on a
career copy; the human manager's own date; a member of staff born before 1940.

## FM27 Steam build 26577676 (12 November 2026)

Steam updated FM27 on 12 November to build 26577676, still 27.0.1. game_plugin
was rebuilt on every platform, so FM Lens opened the build read-only. Every
function and static FM Lens uses stayed where build 26385295 has it; on macOS
the two constants it reads from the game's code moved by 0x30. The three new
profiles are in `profiles/fm27/`; how they were made is in
[recon/fm27-steam-26577676.md](recon/fm27-steam-26577676.md). This is the run
of [PATCH-VALIDATION.md](PATCH-VALIDATION.md) on that build.

Packaged FM Lens 0.7.7 built from `Iamdejman/steam-26577676` (3687c08), driven
through the accessibility API (UI Automation on Windows). Every edit was read
back with `fmlens-probe` of the same commit. Test copies only.

What the run found: the first build of the branch (1ad76c0) carried build
26385295's addresses for the two constants. Windows does not read them from
there and passed in full. On Apple Silicon a loan (Bukayo Saka to Barcelona)
read back with a future fee of 33,619,968 and End loan refused it; that game
was closed without saving. e449def moved the two addresses in both Mac
profiles, and 907a095 has FM Lens read both constants back before it uses
them, so a stale address refuses the action. The Mac columns below are the
build with the fix; on Windows the loan and the work permit ran again on it.

Read checks (`scripts/check-build.sh`): 15 of 15 on Apple Silicon
(`reports/build-check/A8550B47-FDE0-3D0D-A6CB-1B63DEE8DA19-20261112-123753`) and
15 of 15 under Rosetta
(`reports/build-check/DD0EE157-4C9C-31A7-81DD-0D1122E62FC7-20261112-152640`).
On Windows `fmlens-probe health` named the build "FM27 Steam build 26577676
(27.0.1)" and passed 12 of 12; `info` gave game_plugin.dll size `0x185fa000`,
timestamp `0x6af38e5c`; the script's 14 steps, run through PowerShell, passed,
and the arrays sit where the profile says (players `+0x5820810` 25,025, staff
`+0x5820858` 14,178, clubs `+0x58209c8` 19,311).

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Profile matched, data loaded | Pass. UUID A8550B47, Arsenal, 10 Dec 2027 | Pass. UUID DD0EE157, "FM27 Steam build 26577676 (27.0.1, macOS, Intel)", 30,308 players, Arsenal, 10 Dec 2027 | Pass. 25,025 players, Ayo Elu, Arsenal, 28 Jul 2026 |
| Player attribute | Pass. Bukayo Saka Heading 9 to 12 (stored 60); after the reload 12 to 13 | Pass. Saka Heading 12 to 13 | Pass. Saka Heading 12 to 13 (stored 60 to 65) |
| Contract wage | Pass. Saka 300,000 to 310,000; after the reload 310,000 to 320,000 | Pass. Saka 310,000 to 320,000 | Pass. Saka 310,000 to 320,000 |
| Add injury, then Heal | Pass. Abdominal strain from 10 Dec 2027, back 27 to 31 Dec; Heal: none | Pass. Injury added; Heal: none | Pass. Abdominal strain from 28 Jul 2026, back 16 to 21 Aug; Heal: none |
| Work permit Revoke, then Request | Pass. Gabriel: none, then "England: active"; Saka reads "Not needed" | Pass. Gabriel: none, then "England: active"; Saka reads "Not needed" | Pass. Gabriel: none, then "England: active"; the same again on 3687c08 |
| Loan, then End loan | Pass. Saka to Barcelona, 10 Dec 2027 to 30 Jun 2028, borrower pays 0, no future fee; back at Arsenal | Pass. Saka to Barcelona, 10 Dec 2027 to 30 Jun 2028, borrower pays 0, no future fee; back at Arsenal | Pass. Saka to Barcelona, 28 Jul 2026 to 30 Jun 2027; back at Arsenal; the same again on 3687c08, borrower pays 0, no future fee |
| Transfer club to club | Pass. Paul Ifill, Greytown AFC to Barcelona, 1,000 a week to 30 Jun 2029 | Pass. Ifill to Barcelona, 1,000 a week to 30 Jun 2029 | Pass. Paul Ifill, Arsenal to Barcelona, 1,000 a week to 30 Jun 2028 |
| Release | Pass. Ifill a free agent, no contract | Pass. Ifill a free agent, no contract | Pass. Ifill a free agent, no contract |
| Sign later, then Cancel transfer | Pass. Arsenal on 24 Dec 2027 (offer 381, 58 to 59 future transfers); cancelled, 58 again | Pass. Arsenal on 24 Dec 2027 (offer 381, 58 to 59); cancelled, 58 again | Pass. Arsenal on 10 Aug 2026 (offer 1388, 44 to 45 future transfers); cancelled, 44 again |
| Sign now | Pass. Ifill at Arsenal, 23,520 a week to 30 Jun 2029 | Pass. Ifill at Arsenal, 23,520 a week to 30 Jun 2029 | Pass. Ifill at Arsenal, 20,665 a week to 30 Jun 2027 |
| Club balance | Pass. Arsenal 190,873,135 to 200,000,000 | Pass. Arsenal 190,873,135 to 200,000,000 | Pass. Arsenal 340,000,000 to 350,000,000 |
| Max tactics | Pass. First team, 30 changes, values at 10000; Undo all put every value back | Pass. First team, 30 changes; Undo all put every value back | Pass. U21 (team 25631), 23 changes, values at 10000 |
| Lift bans, Heal, Refresh fitness, Remove unhappiness | Pass. First team (30 players): injured 5 to 0, banned 3 to 0, below full energy 22 to 0, below full sharpness 18 to 0, jaded 12 to 0; Remove unhappiness 10 changes | Pass. First team: injured 5 to 0, banned 3 to 0, energy, sharpness and jaded counts to 0; Remove unhappiness 10 changes | Pass. U21: Refresh fitness 63 changes, Remove unhappiness 1, Heal 1; no ban to lift |
| Staff attribute | Pass. Nicolas Jover Fitness 3 to 6 (stored 30); after the reload 6 to 7 | Pass. Jover Fitness 6 to 7 | Pass. Jover Fitness 6 to 7 (stored 30 to 35) |
| Nation field | Pass. England reputation 9,238 to 9,300; after the reload 9,300 to 9,310 | Pass. England reputation 9,300 to 9,310 | Pass. England youth rating 135 to 140 |
| Undo in Changes | Pass. Arsenal's balance back to 190,873,135 | Pass. Arsenal's balance back to 190,873,135 | Pass. Youth rating back to 135, "104 changes · 1 undone" |
| FM shows it | Pass. News on the Portal: "Paul Ifill deal falls through" | Pass. News on the Portal: "Paul Ifill deal falls through" | Pass. News on the Portal: "Paul Ifill deal falls through" |
| FM kept running | Pass | Pass. Still responding 22 minutes in, no error in its log | Pass. `fm` responding after the last edit and after the save |
| Saved under a new name, reloaded | Pass. Saved as `FM-Lens-26577676-2026-11-12`, FM quit and started again, that save loaded: Heading 12, wage 310,000, Jover Fitness 6, reputation 9,300, balance 190,893,135 | Pass. That save loaded: Heading 12, wage 310,000, Jover Fitness 6, reputation 9,300 | Pass. Saved as `FM-Lens-26577676-Windows`, FM quit and started again (process 5008), that save loaded: Heading 13, wage 320,000, Jover Fitness 7, balance 350,000,000, youth rating 135, Ifill at Arsenal on 20,665 a week, Gabriel's permit active, U21 tactics at 10000, 44 future transfers |

Notes:

- Max tactics reports only the players it changed. On Windows Arsenal's first
  team was at the maximum already in the loaded save and read "No changes
  made", so the check used the U21 team.
- On Windows FM Lens loads its bridge into the running game, so FM did not need
  a restart to take edits. After the restart FM Lens connected to the new
  process and one more edit applied (Saka Heading 13 to 14, not saved).
- On the Mac FM loads the bridge when Steam starts it. The first values in the
  Apple Silicon column (Heading 9 to 12, wage, Jover, reputation) were set
  while FM still held the bridge of the released 0.7.7, which does not know the
  build: they applied with the notice that FM's screen could not refresh, and
  they are what the new save holds. Everything else ran after FM was started
  again with the new bridge.
- Under Rosetta FM was started with `arch -x86_64` and the packaged universal
  bridge while Steam was running, and FM Lens with `arch -x86_64`.

Mac: FM27 build 26577676 native on Apple Silicon (FM process 14092, FM Lens
14441). The test copy `FMLensTacticsTest-2026-11-11` (Arsenal, 10 Dec 2027) was
saved only as the new file `FM-Lens-26577676-2026-11-12`; the run on 3687c08
was in that file and quit without saving. Then under Rosetta (FM process 50412,
FM Lens 52027) in the same file, quit without saving.

Windows: FM27 build 26577676 on the test machine (FM process 5528, then 5008;
FM Lens 7696, then 6032) with the installer built there from the branch, in
`FM-Lens-27.0.1-Windows` (Arsenal, 28 Jul 2026), saved only as the new file
`FM-Lens-26577676-Windows`. The loan and the work permit on 3687c08 were not
saved. No other save changed.

Main career SHA-256 stayed 23472DA3...6192BEF4 on Mac and AF20CBAC...2CB747E5
on Windows.

## 0.7.8 on the Mac (12 November 2026)

The FM checks owed by PR 244 (sorting, filters, club Nation, stadium owner,
every attribute), PR 246 (staff birth date) and PR 239 (applied marks), run
before the 0.7.8 release. Packaged FM Lens 0.7.8 built from
`Iamdejman/release-v0.7.8`, first at 6d53fb0, then at e4cd6d4 once the Nation
column was fixed (below), driven through the accessibility API. Every edit was
read back with `fmlens-probe` of the same commit. FM27 Steam build 26577676,
test copy `FM-Lens-26577676-2026-11-12` (Arsenal, 10 Dec 2027), never saved.

What the run found: on 6d53fb0 the clubs' Nation column showed the nation
whose league a club plays in, not its own. Swansea City read England where FM
shows Wales; Cardiff City and Wrexham read England, FC Vaduz Switzerland and
Derry City Republic of Ireland. The column read `club.nation` (+0xD8). The
club's own nation is `club.plays_in` (+0xE8), set for every club sampled.
e4cd6d4 has the column, its filter and its sort read `plays_in`, falling back
to `nation` where it is not a pointer. The local-language mark on a person's
languages uses the same order. Work permits keep reading `nation`, since the
league's nation is the one that issues them.

| Pointer | Offset | Cardiff City | Read by |
|---|---|---|---|
| `club.plays_in` | +0xE8 | Wales | Nation column, filter and sort; local languages |
| `club.nation` | +0xD8 | England | Work permits; the fallback for the above |

| Check | Apple Silicon | Intel (Rosetta) | Windows |
|---|---|---|---|
| Profile matched, data loaded | Pass | Pass. "macOS, Intel", 12 of 12 health checks | Not run |
| Staff birth date (PR 246) | Pass. Nicolas Jover (staff 48030808) 5 Aug 1981 to 5 Aug 1979: FM Lens age 48, probe 1979-08-05. FM's staff profile read "48 years old (5/8/1979)" and his biography "born 5 August 1979". Undo: FM read "46 years old (5/8/1981)" | Pass. The same edit: FM Lens age 48, probe 1979-08-05; Undo: probe 1981-08-05 (age 46) | Not run |
| Sort by header (PR 244) | Pass. CA: the first click puts CA 1 players first, the second Haaland 195, Mbappé 192, Yamal 187 | Pass. The same | Not run |
| Player filters (PR 244) | Pass. Height 200 and over: 132 players. With wage 50,000 and over: 5, Courtois (200 cm, 56,455 a week by the probe), Milinković-Savić 202, Lucca 201, Burn 201, Jaouen | Pass. The same 132, then 5 | Not run |
| Club Nation (PR 244) | Fail on 6d53fb0 (above). Pass on e4cd6d4: Cardiff City, Swansea City and Wrexham Wales, FC Vaduz Liechtenstein, Derry City Northern Ireland, Monaco France, Arsenal England. FM's own screen: Swansea WAL, Monaco FRA | Pass on e4cd6d4. The same values; filter Wales: 229 clubs; sort: Afghanistan first, Zimbabwe first reversed | Not run |
| Stadium owner (PR 244) | Pass. Arsenal Women's profile: Emirates Stadium, owner Arsenal; the Stadiums list the same | Not run | Not run |
| Goalkeeping attribute on an outfielder (PR 244) | Pass. Bukayo Saka Handling 1 to 15, read back 15 | Pass. Saka Handling 15 and Reflexes 14, read back | Not run |
| Applied marks (PR 239) | Pass. Handling and Reflexes both marked after two Applies, and still after closing and reopening the profile. Undo of Handling cleared only its mark (Reflexes 14 stayed marked); Undo of Reflexes: probe Handling 1, Reflexes 2 | Pass. Both marked after reopening; Undo put Handling back to 1 (Reflexes 14), then Reflexes to 2 | Not run |

Notes:

- The first click on a numeric header such as CA sorts lowest first, so the
  list opens on CA 1 players; the second click puts the best first. Left as
  it is for 0.7.8.
- Berwick Rangers, in the Scottish league, reads England on e4cd6d4; not
  looked at in FM. FM's own screen was looked at for Swansea and Monaco only.
- Not run: a stadium a club rents or shares, the wage, value, personality and
  trait filters against profiles, a row's wage after a transfer, the human
  manager's birth date, and Windows. The 0.7.8 release went ahead on the Mac
  checks alone.

Mac: Apple Silicon FM process 76714, then 81062 (FM Lens 76638, then 81027);
Rosetta FM 82569 started with `arch -x86_64` and the packaged universal
bridge, FM Lens 82602 with `arch -x86_64`. Every game was quit without saving.
The test copy stayed 89,343,966 bytes from 14:31, and the main career SHA-256
stayed 23472DA3...6192BEF4.

## Suggested current ability (12 November 2026)

While a player is edited, the profile shows the current ability that fits the
attributes and positions as typed ("Suggested CA 170"), and a click fills it
in. It is worked out in the app (`app/src/abilityEstimate.ts`) and makes no
call to the game; the write is the ordinary current ability edit.

The weights were fitted to a read-only export of the 30,282 players of a
career on build 26577676 (`fmlens-probe players --export`, stored 0-100
attributes). Against that export the app's function is off by 2.15 points
RMS, by 4 or less for 19 players in 20 and by 29 at worst. A player whose
ability is within 6 of the estimate keeps that difference, so an unedited
player is suggested the ability he has and the button stays hidden.

Checks run, none of them against a running game:

- `npm test` (82 tests) and `npm run build` on the branch, rebased on c93585a.
- The app's function against all 30,282 exported players: 2.154 RMS.
- The browser preview on sample data (`?writable`): an edited attribute moved
  the suggestion (Decisions to 5 read 170, Marking to 1 read 197); a click
  filled Current ability and the button went; the header kept its height
  with and without the button; no console errors.

Not run: the packaged app on Apple Silicon, under Rosetta or on Windows; an
Apply of a suggested ability in FM; any other game build or database, where
the weights may fit worse; a goalkeeper or a player with no rated position
in the preview (both are in the tests).

## Traits: FM27's names and groups (12 November 2026)

The profile's trait list offered 62 traits by bit, named as FMRTE names them,
and showed "Unknown trait" for bits 62 and 63. Each of the last five bits was
set alone on Bukayo Saka and David Raya (Arsenal, 14 April 2027) on Windows,
and the player's trait list read in FM after each Apply.

| Bit | FM27 shows | FM Lens before | FM Lens now |
|---|---|---|---|
| 59 | Crosses Early | Crosses early | The same |
| 60 | Brings Ball Out of Defense | Brings ball out of defence | The same |
| 61 | Nothing, on either player | Plays ball with feet | Not offered |
| 62 | Nothing | Unknown trait | Not offered, not listed |
| 63 | Plays Ball With Feet | Unknown trait | Plays ball with feet |

Bits 8, 11, 51 and 58 read as FM names them on Saka's own traits. Both
players were set back to their own traits.

The edit list is now grouped as FM groups traits under Development, Training,
Start New Trait Training: Movement, Passing, Finishing, Discipline, Defending
and Technique, each in the game's order (by bit). The groups were read from
that menu for Saka, Gabriel, Bruno Guimarães and Raya; 42 of the 62 traits
were seen in a group. Placed by their kind, not seen: bits 1, 4, 18, 39, 54,
58 (Movement), 22, 30, 59 (Passing), 38 (Defending), 11, 32, 53, 55, 63
(Technique) and the three of Discipline, which FM offered to none of the four.
"Will retire at top" and "Will play football as long as possible" are in no
FM group and stand under Career. Three English names now follow FM27's
wording: "Hits free kick with power", "Likes to beat opponent repeatedly" and
"Likes to switch ball to wide areas".

Not run: the packaged app with these changes on any platform (the list and
the tags were checked in the browser preview); the Spanish and Turkish names
against FM in those languages.

## Women's FIFA points (12 November 2026)

Branch `claude/confident-darwin-ktyc9o`, from main at e47d8a8 (0.7.7).

A nation's profile shows the women's world ranking and points, and
`women.points` can be edited, 0.00 to 3,000.00, one nation at a time, behind
the nations health check. Both are read from the women's container at the
offsets the men's uses in its own (`ranking` and `points` in `[national]`).
`fmlens-probe nation UID` prints them on a `women ranking` line.
EDITOR-FIELDS.md lists the new field: 37 nation fields.

What the mapping rests on: the read-only probe work of 5 November on ARM64
build 26340721 (recon/fm27-nations.md), where the women's container read
England 3rd on 2,027.1 and Spain 2nd on 2,105.4. The women's container was not
read for these on Intel or Windows.

Checks, all in a Linux container with no game:

- `npm --prefix app run build` and `npm --prefix app test`: pass (7 node tests,
  66 vitest tests).
- `cargo fmt --all --check`: pass.
- `cargo test --locked -p fmlens-mem -p fmlens-core -p fmlens-probe`, built for
  `x86_64-pc-windows-gnu` and run under Wine: 108 core and 5 mem tests pass,
  `nations_take_their_own_rules_one_at_a_time` among them.
- `cargo clippy --locked --all-targets -- -D warnings` on those three crates,
  same target: clean.
- The fields the code defines on each layout, listed and compared with
  EDITOR-FIELDS.md key by key: 169 player, 42 staff, 14 club, 37 nation and
  4 official on both, none missing and none extra.
- Browser preview with sample data: Germany's women's ranking and points show;
  3000.5 is refused, 2,042.00 -> 2,100.25 applies, Changes names it "Women's
  FIFA points", Undo puts 2,042.00 back, and the men's points do not move.

Not run: a macOS build, the app crate, the Tauri bundle, and anything against
a running game. No read, edit, FM inspection or save and reload.

To check on a disposable copy: `fmlens-probe nation 765` against FM's women's
world ranking; edit `women.points` in the app, read it back and undo; hold the
edit to FM's next women's ranking date; then save, quit and reload. Repeat the
read under Rosetta and on Windows.

## Inspire on a player's profile (13 November 2026)

The Mood tab's Morale and happiness heading has an Inspire button: morale to 20
and the player's lasting reasons to be unhappy ended, in one press. It is the
old squad button Inspire all for one player. That button was split on 7
November into Max morale and Remove unhappiness, so the 7 November entry's
"Inspire all" row is evidence for both of those as they were then.

Inspire uses what is already there. Morale goes through `apply_edits` over the
value the profile read; the reasons end through `remove_unhappiness`, the call
Remove all uses (see "Unhappiness that came back after Continue" above). So the
build and career guards, stale-value refusal, the Changes rows and Undo are the
ones those two have. Only what is short is done: no morale edit at 20, no call
for a player with nothing lasting. One the game refuses does not hold the other
back. No Rust changed.

Not checked in FM. No game was available: this ran in a Linux container.

| Check | Result |
|---|---|
| `npm --prefix app run build` | Pass |
| `npm --prefix app test` | Pass, 97 tests; `tests/inspire.test.tsx` covers what is sent, when the button waits and a refused write |
| Browser preview, sample data (`?writable`), Kerem Yılmaz | Morale 8 to 20 and his one lasting reason gone, the button dimmed and focus on the heading. Changes: "Morale 8 → 20" and "Reasons to be unhappy 1 → 0", each with Undo |
| Undo of both rows, same preview | Morale back to 8, the reason listed again and Inspire on again |
| Rust checks | Not run. `fmlens-core` builds for macOS and Windows only, so its tests do not run on Linux |

Still to do on a career copy, on each platform: press Inspire on an unhappy
player, look at FM's Happiness panel and Dynamics, Continue a day, undo both
rows from Changes, then save, quit and reload.

## Dragging numbers, scroll position and reopening (12 November 2026)

Three changes to the interface, none to what is written to the game or how:
a number's input can be dragged sideways (`app/src/dragValue.ts`,
`draggedText` in `app/src/editDraft.ts`), lists and profiles keep their scroll
position, and what the window held comes back when FM Lens is opened again
(`app/src/restore.ts`). A drag only fills the input; Apply, the guards and Undo
are untouched. No Rust changed.

Checked in the browser preview (`npm --prefix app run dev`, `?writable`, sample
data, headless Chromium, 1440 by 900). This is not the native app and not a
live game.

- Scroll: the player list at 900 px stayed at 900 after going to Staff and
  back, with and without a search, with a profile open, and after an Apply.
  Before the change each of these went back to 0. A new search starts at the
  top. An open profile at 250 px was at 250 after the same round trip.
- Dragging: 78 of a player's 141 inputs drag (numbers only). Eccentricity 18
  went to 14 over 40 px left, to 20 over 64 px right, and stopped at 20 and at 1
  however far the pointer went. A click without movement changed nothing and
  focused the input. Current ability 180 went to 173 over 30 px, showed as one
  pending change, read "Current ability 180 → 173" in Review and applied. A
  club's balance went 17,551,479 → 18,000,000 → 19,000,000 → 20,000,000. At
  150% zoom in the dark theme, 36 px moved an attribute three steps.
- Reopening: with a club open on its Squad tab, a player selected on the second
  page at 1,200 px on the Contract tab, and "nov" in the Staff search, the
  window was closed and a new one opened on the same storage. It came back on
  Clubs with that club and tab, Players had the same row, page, scroll position
  and tab, and Staff had its search. Settings did not open by itself.
- A language or currency reload still brings the window back as before, with
  Settings open.

`npm --prefix app run build` and `npm --prefix app test` passed: 8 node tests
and 104 in vitest, 14 of them new (`app/tests/drag-value.test.tsx`,
`app/tests/navigation-memory.test.tsx`), covering the steps of a drag, a finger
and a date left alone, rows kept while a list reads again, another career
starting afresh and a list that left the screen before the app closed.

The numbers above are from the run on top of 0.7.10. There, current ability
follows a changed attribute by itself, whether it was typed or dragged.

Not run: the native macOS and Windows apps (WebKit and WebView2), a real FM
restart or a second career, and the Rust checks.
