# FM Lens

Personal macOS scouting milestone, derived from FMLibreEditor commit
`5fdb1e3`. Upstream remains at https://github.com/tozmoz/FMLibreEditor.
The project retains its GPL-3.0-or-later license and upstream attribution.

## Scope

Browse players, staff and clubs from a running FM27 Steam career. The desktop
opens the process read-only. The memory crate defaults to its `read-only`
feature, rejects read/write process opens and refuses every memory write even
if a caller marks a process writable. There is no UI option to enable editing.
Upstream update installation is disabled so it cannot replace the scouting build.

The bridge still supplies a full task port to same-user clients. Read-only is
enforced by this application's memory layer, not a restricted OS task port.
Bridge client identity hardening remains a separate engineering task.

## Build

Requirements: Xcode command-line tools, Rust stable, Node.js and npm.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --locked -p fmlibre-probe -p fmlibre-bridge
cd app
npm ci
npm run tauri -- build --debug --bundles app --config src-tauri/tauri.scout.conf.json
```

The Apple Silicon app is `target/debug/bundle/macos/FM Lens.app`.
This is a local development build, signed ad hoc, not a notarized release.
It is intended for the native Apple Silicon game; the bundled bridge is not universal.

## Connect

The game must start with the bridge loaded. Attaching it to an already running
career is not supported.

1. Save your current career in FM. Quit FM, then quit Steam.
2. Open FM Lens and select **Set up the bridge**, or run:

   ```sh
   target/debug/fmlibre-probe bridge setup --from target/debug
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

The convenience launcher only accepts read queries. The underlying probe also
contains upstream edit commands, but this build's memory layer rejects writes.
Player exports and reports write local files, not game data.

## Remove the bridge

Save and quit FM, then quit Steam. Use **Remove the bridge** in the companion or:

```sh
target/debug/fmlibre-probe bridge remove
```

This removes the launch option before removing files, so FM remains launchable.

## Acceptance criteria

- The exact running module fingerprint matches a bundled profile.
- Game date, your club, squad membership and multiple visible player fields
  match the game, including after advancing and reloading data.
- Unsupported builds and failed decodes are visibly reported.
- A closed game or switched save cannot leave apparently current stale data.
- Every game-memory write remains blocked.

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
- No game-memory edits were performed. Gameplay advancement, switching saves,
  disconnect recovery and bridge removal remain separate validation work.

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

## Brand and desktop verification

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
