# FM Lens

FM27 Steam companion for macOS and Windows, derived from the upstream editor
the README credits, at commit `5fdb1e3`.
The project retains its GPL-3.0-or-later license and upstream attribution.

## Scope

Browse and edit mapped player, staff and club records in a running FM27 Steam
career. The desktop app opens a known build for writing. Unknown builds stay
read-only. The probe is compiled with the memory crate's `read-only` feature, so
`scripts/scout` cannot write game memory. The desktop app is compiled without
that feature. There is no separate switch that turns editing on: connecting to
a known build enables the mapped fields.

The nation list covers nations represented by loaded players, staff and
competitions; the stadium list covers senior stadiums with every club that plays
at each. Where the build profile places the game's nation and stadium tables,
the lists add every other nation and stadium from them; that has unit tests and
a sample-data preview, not yet a read from a running game.
Mapped nation fields and official fields can be edited where the build supports
them; stadium browsing is read-only. On ARM64, England's population, men's
reputation and nationality rules passed the bounded save/quit/reload checks in
[the validation record](EDITING-VALIDATION.md#nation-editing-5-november-2026).
Other nation fields and official edits have narrower evidence; see the roadmap.
Staff and club filters cover additional decoded values.

## Platforms and evidence

FM Lens ships a universal Mac app and, from 0.6.2, a Windows installer. The
verified game build is FM27 27.0.1, Steam build 26577676, checked on 12
November on Apple Silicon, under Rosetta and on Windows. Most of the evidence
is from 27.0.0, Steam build 26340721. ARM64 has the broadest local
validation; Intel checks used Rosetta and cover selected reads/actions.
Windows app edits and undo were exercised on Windows Server 2022, including
attributes, contracts, mass edits, templates, squad actions and manager fields.
Windows installer and self-update checks are recorded separately. On Windows an
edited copy was saved, FM quit and the copy loaded again twice (8 and 10
November): a player's attributes, contract wages, a staff attribute, a club
balance, Max tactics and a free-agent signing held. Other Windows edits have no
save and reload, and Windows 10/11 execution remains unverified. See the dated Windows entries in
[EDITING-VALIDATION.md](EDITING-VALIDATION.md#windows-edits-7-november-2026),
"Windows: every feature on main" and "FM27 27.0.1".
Availability on a platform does not certify every mapped field.

Upstream update installation is disabled so it cannot replace this build.

The bridge still supplies a full task port to same-user clients. The probe
refuses writes because it is compiled with `read-only`. The desktop app is not,
so a known build can be edited. Neither one is an OS-enforced read-only port.
Bridge client identity hardening remains a separate engineering task.

## Local Apple Silicon build

Requirements: Xcode command-line tools, Rust stable, Node.js and npm.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --locked -p fmlens-probe -p fmlens-bridge
cd app
npm ci
npm run tauri -- build --debug --bundles app --config src-tauri/tauri.scout.conf.json
```

The Apple Silicon app is `target/debug/bundle/macos/FM Lens.app`.
This is a local development build, signed ad hoc, not a notarized release.
This debug build targets the native Apple Silicon game; release builds package
both Mac architectures. Windows builds and release packaging are described in
[DEVELOPING.md](DEVELOPING.md#releasing).

## Connect on macOS

On macOS, FM must start with the helper loaded; adding it to an already-running
game is not supported. Windows needs no Steam launch-option setup: install the
app, start FM, load a career copy and Connect.

1. Save your current career in FM. Quit FM, then quit Steam.
2. Open FM Lens and select **Set up the bridge**, or run:

   ```sh
   target/debug/fmlens-probe bridge setup --from target/debug
   ```

3. Start Steam, start FM27 from Steam, and load the career.
4. Select **Connect** in the companion.

The launcher and bridge are stored in
`~/Library/Application Support/FM27Scout/`. Setup preserves existing FM launch
options and keeps a backup of the Steam configuration it changes. Do not delete
the launcher while Steam launch options still reference it.

## Read-only diagnostics

```sh
scripts/scout bridge
scripts/scout info
scripts/scout calibrate
scripts/scout health
scripts/scout players "player name"
scripts/scout clubs "club name"
scripts/scout player PLAYER_UID
scripts/scout club CLUB_UID
```

The convenience launcher only accepts read queries. The probe binary is compiled
read-only, so its edit commands are rejected before they write. Player exports
and reports write local files, not game data.

## Remove the bridge

Save and quit FM, then quit Steam. Use **Remove the bridge** in the companion or:

```sh
target/debug/fmlens-probe bridge remove
```

This removes the launch option before removing files, so FM remains launchable.

## Acceptance criteria

- The exact running module fingerprint matches a bundled profile.
- Game date, your club, squad membership and multiple visible player fields
  match the game, including after advancing and reloading data.
- Unsupported builds and failed decodes are visibly reported.
- A closed game or switched save cannot leave apparently current stale data.
- The read-only probe refuses game-memory writes. The desktop app can write
  mapped fields on a known build. One finishing edit passed save, full quit and
  reload inspection on a disposable career; other fields need their own checks.

Build/test results and live-game validation are recorded below. A successful
compile alone does not establish that live data is correct.

## Verified on 4 November 2026

- Built and ad-hoc signed the Apple Silicon app, probe, bridge and launcher.
- Workspace tests and strict Clippy checks passed. The read-only regression test
  confirms that a writable flag cannot bypass the build's write refusal.
- Installed the bridge after the user confirmed saving and closing FM and Steam.
  Steam launch options were configured with backups; SIP was left unchanged.
- Connected to native ARM64 FM27 Steam build 26340721, module UUID
  `F4540355-2186-39CB-9119-C706A6A35346`.
- The loaded career reports 8 December 2027, matching the game. Calibration
  found 30,314 player entries, 20,219 staff entries and 21,679 club entries, with
  100% of calibration samples decoded. These are array counts, not a claim that
  every field on every entity was checked.
- All ten live health checks passed. Arsenal's senior squad contains 29 players,
  matching the game's squad overview.
- Compared Bukayo Saka's visible technical, mental and physical attributes, age,
  nationality, squad number, caps/goals, wage and contract expiry with FM. They
  matched, including finishing 15, technique 18, acceleration 17, wage £300,000
  per week and expiry 30 June 2031. CA/PA and hidden fields were read but have not
  been independently cross-checked with a second editor.
- No game-memory edits were performed during the read checks. On the same day the
  desktop app was changed to open a known build for writing. The probe stays
  read-only. Subsequent copied-career editing checks are documented in
  [EDITING-VALIDATION.md](EDITING-VALIDATION.md). They establish one finishing
  edit through full quit/reload and bounded template apply/undo, not complete
  editing coverage. Switching saves, disconnect recovery and bridge removal
  remain separate validation work.

## Editor controls

The Changes tab exposes applied history and conditional undo. Single edits carry
the value observed when editing began; bulk edits carry their previewed values.
Unknown fingerprints and changed career storage refuse mutations, including undo.
Reload creates a fresh Session and clears previews. While FM Lens remains
running, Changes retains its log through Reload and FM restarts. Changes from
a closed game or a loaded save are listed as Earlier game with Undo disabled;
history retention does not authorize reuse of old targets. A companion quit is
not covered by this in-memory history. See the 7 November refresh checks in
[EDITING-VALIDATION.md](EDITING-VALIDATION.md#edits-show-without-continue-7-november-2026).

Clone & templates can capture selected ability, attribute, personality, position
and trait groups. Templates use versioned JSON, a local library and destination
field validation, then preview/apply/undo through the bulk editor. Identity and
contract fields are excluded. Player, staff and money freezes are remembered for
the save and hold only while FM Lens is connected.
Settings provide System/Light/Dark appearance and 80–150% zoom.

While a profile is edited, a number can be dragged sideways instead of typed:
right for more, left for less. It still waits for Apply. FM Lens opens where it
was left: the section, each list's search, filters, page and open profile, and
the profile tab. That is kept for one career; another career starts its lists
afresh.

See [EDITOR-FIELDS.md](EDITOR-FIELDS.md) for the 169 player, 43 staff and 14 club
field definitions and [EDITING-VALIDATION.md](EDITING-VALIDATION.md) for actual
behavioral evidence and outstanding checks.

## Offline use

FM Lens has no runtime account, license server or internet dependency. It reads
FM through a local Mach connection; fonts, build profiles and graphics are local.
The app does not load the upstream update-check module or register its updater.
On 4 November 2026 all ten live health checks passed while the probe ran under
`sandbox-exec` with `(deny network*)`, reading the already running game.

Steam's own offline-mode login cache, game activation and update requirements
remain Steam/FM requirements. Starting Steam and FM from a fully offline state
has not yet been tested in this session. Launch FM through Steam as usual so
the configured bridge is loaded.

The existing `FM27Scout` bridge folder is retained as a stable internal path
after the rename, avoiding another game restart just for branding.

### Updating while FM is open

FM Lens keeps using the helper already loaded in FM. Updates stage the bundled
helper for the next normal FM launch; they do not require restarting FM to keep
using supported features. Helpers with capability discovery advertise their
function allowlist, so newly added actions they cannot perform stay unavailable.
Earlier helpers continue using the existing request/call protocol and safely
refuse unsupported actions individually. An unsupported automatic screen refresh
is skipped; FM may show the previous value until its own next refresh. Timeouts,
build mismatches and career guards remain errors. Native IPC regression tests
cover this compatibility path; a live update during a copied-career editing
session remains unverified (see EDITING-VALIDATION.md).

## Brand and desktop verification (4 November 2026)

The chosen product name is **FM Lens**. Original transparent PNG logo masters
and generated macOS icons are in the repository; see `docs/brand/FM-LENS.md`
for the built-in imagegen prompts and asset locations. Upstream authorship and
the GPL license remain attributed.

The native app connected to the live career, searched for Bukayo Saka and
loaded his complete player profile with editing controls disabled. The player
browser indexes 30,314 players, 20,217 staff and 21,675 clubs on this save;
these are the searchable counts, which are slightly below the raw array counts.

The renamed desktop application itself was then launched with all network
operations denied using `sandbox-exec`. It connected, searched for Bukayo Saka
and displayed his full profile with the new logo. This verifies the companion's
network-independent operation against a running game; it does not establish a
fresh Steam Offline Mode launch. The verified app was copied to
`~/Applications/FM Lens.app`.
