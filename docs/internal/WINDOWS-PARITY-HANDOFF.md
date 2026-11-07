# Handoff: Windows parity

For the next agent. The goal, in the user's words: "all that is on mac is what windows should have too. No disparity."
Read this, then `AGENTS.md` and `CLAUDE.md`, then the Windows sections of `docs/EDITING-VALIDATION.md` ("Windows
reads", "Windows game actions", "Windows edits").

## 1. Where things stand (7 November 2026)

FM Lens runs on Windows against FM27 Steam build 26340721 and does what the Mac app does, except for the gaps in
section 3. It has been checked only on the test box (section 2), never shipped to anyone.

| PR | What it brought to Windows |
| --- | --- |
| #130 | The reads that were macOS-only: officials, competitions and rules, awards, kinds of injury, nations, club relations, staff likes, licence and formations, loans, work permits, future transfers, languages, cohesion |
| #135 | The game's own actions through a Windows bridge DLL: injuries, work permits, loans, free agents, transfers, future transfers, max tactics, manager moves, refresh |
| #143 | The new FM Lens icon on the exe and taskbar |

Checked in the running game on Windows, each undone, the save never written: every read above, every game action
above, and the app's direct edits (attributes and CA/PA, contract, mass edit, clone and templates, freeze money,
Heal, Refresh fitness, Max morale, Max cohesion, your manager's unsackable flag and wage). Not checked on Windows:
Remove unhappiness, Lift bans (nobody to use them on in the test save), and a save, quit and reload of an edited copy.

## 2. The Windows test box

- AWS `i-0b8af2b9b13815f9f`, g4dn.xlarge, `eu-central-1`, profile `footballadder`. About $0.84 an hour while
  running; stop it whenever work pauses, with the user's OK. No Elastic IP, so the address changes on every start:
  `aws ec2 describe-instances --profile footballadder --region eu-central-1 --instance-ids i-0b8af2b9b13815f9f
  --query 'Reservations[0].Instances[0].PublicIpAddress'`. Ask before creating anything else that bills.
- SSH as `Administrator` with `~/.ssh/fm-lens-windows`. The RDP file and password are in
  `~/Documents/FM Lens Windows/` on the user's Mac. In the Windows App on a Mac, Ctrl+V pastes.
- Steam and FM27 are installed. The user signs in to Steam themselves over RDP: never enter, ask for or handle the
  Steam password. FM27 has Denuvo, 5 machine activations a day, and a stop and start can count as a new machine, so
  avoid needless restarts of the instance.
- `C:\Setup` holds the helpers. `build_app.ps1` unpacks `C:\Setup\wtbridge.zip` (a `git archive` of the branch to
  build, copied over with `scp`) into `C:\src\wtapp`, runs `npm ci` and `npm run release`, and copies
  `FM Lens.exe` to the desktop. `runin.ps1 -Name <unique>` starts a GUI program inside the RDP session (anything
  started straight from SSH has no desktop). `winshot.ps1` and `shot.ps1` take screenshots, `click.ps1` and
  `type.ps1` drive the mouse and keyboard, `hash.ps1` prints the save's SHA-256 and whether FM responds.
- The test save is `Documents\Sports Interactive\Football Manager 27\games\Ayo Elu - Arsenal.fm`, SHA-256
  `AF20CBAC52DE4D850B20029437F92675EEC7AEA83BC65C0611105E6E2CB747E5`. Check it is unchanged after every test. Never
  press Continue (Space in FM) or save during a test.
- Clicks sent to FM or FM Lens over SSH sometimes drop, mostly the first after a pause: take a screenshot after
  each one and retry.

## 3. What Windows still lacks next to macOS

In the order worth doing. Each item says where the Mac version lives and what done looks like.

### 3.1 Ship it: a Windows download and updates

1. **Build an installer.** `npm run release` uses `--no-bundle`, so Windows gets a bare exe. Add a Windows release
   script (the counterpart of `scripts/release-mac.sh`) that builds the NSIS installer with the bridge DLL embedded,
   on Windows: the Windows runner in CI or the test box.
2. **Updater artifacts.** `createUpdaterArtifacts` is on only in `tauri.bridge.conf.json` (the Mac release config).
   The Windows build needs signed updater files, and `latest.json` needs a `windows-x86_64` entry next to the
   macOS ones. Sign with the same updater key (`docs/DEVELOPING.md`, "Releasing"), or no installed copy accepts the
   update.
3. **Updates inside the app.** `can_self_update` (`app/src-tauri/src/lib.rs`, around line 2160) is macOS-only, and
   `app/src/update.ts` only knows the `.dmg`. On Windows the NSIS installer quits the app as it installs, so install
   only when the user presses Relaunch, not in the background as on macOS.
4. **Check for Updates.** On macOS it sits in the app menu (`app/src/appMenu.ts`, called from `App.tsx`). Windows
   has no app menu: put it in Settings, About.
5. **Code signing.** The Mac app is signed ad hoc, not notarized, so an unsigned Windows installer with clear
   SmartScreen guidance ("More info", "Run anyway") is the like-for-like choice. Buying an Authenticode certificate is
   the user's decision; ask, do not buy.
6. **Release repo and site.** `IamDejman/fm-lens-releases` describes itself as a macOS companion. `site/release.js`
   finds only the `.dmg`; `site/index.html`, `site/download` and `README.md` ("There is no Windows version") are
   Mac-only. Update them in the same release that first ships the Windows download, not before.

Done when: a tagged release carries the Windows installer and `latest.json` entry, a Windows copy of the previous
version updates itself to it, and the site offers it.

### 3.2 Features that read nothing on Windows

1. **Promises.** `profiles/fm27/layout.toml` has no `[promise]` section (the Mac one is in `layout-macos.toml`,
   around line 346), so `Session::promises` returns none and the profile says "No promises" even when there are some.
   Trace the Windows offsets on a save with an open promise. Until then show that promises are not available on
   this platform instead of an empty list (`app/src/` PromisesGroup).
2. **Refreshing an official.** `crates/fmlens-core/src/refresh.rs` (around line 102) returns false for officials on
   Windows: MSVC vtables keep no offset to the identity block, and it has not been traced for officials as it was for
   players and staff (`identity` in the layout).

### 3.3 Small app gaps

1. **System version.** `system_version` in `lib.rs` labels x86_64 as "Intel", so a Windows report reads "windows,
   Intel". The report field is also named `macos` in `relay/index.js`, `app/src/report.ts` and
   `.github/ISSUE_TEMPLATE/bug_report.yml`. Rename it to `system` across all three, keeping the relay accepting the
   old name for older copies.
2. **Old bridge DLLs.** The app writes its embedded bridge DLL to its data folder (`app/src-tauri/src/bridge.rs`,
   around line 155) and never removes older versions.
3. **Export to a blocked folder.** macOS explains a folder it may not write to; Windows (Controlled Folder Access)
   gets the raw error (`lib.rs`, the export command, and the `export` strings in `app/src/i18n/en.ts`).

### 3.4 Checks and build

1. **CI.** `.github/workflows/validate.yml` runs on `macos-latest` only. Add a `windows-latest` job with the same
   fmt, clippy and test steps and a release build of the app with the bridge.
2. **Pinned profile tests.** `crates/fmlens-core/src/profile.rs` pins the Mac profiles' fingerprints and statics in
   tests; add the same for `steam-26340721.toml` on Windows.
3. **Development build.** There is no `tauri.windows.conf.json`, so `npm run tauri dev` on Windows runs without the
   bridge DLL. `scripts/check-build.sh` assumes a Mac module UUID and no `.exe`; `scripts/scout` is zsh only.
4. **Game Pass.** The Game Pass profile is minimal and untested.

### 3.5 Docs

`docs/DEVELOPING.md` ("Releasing") says releases are macOS-only and mentions a notarize workflow that does not exist.
`AGENTS.md` describes a Mac-only product in its scope, evidence and build sections. Update both with 3.1.

## 4. How to work

- Never edit, stage or switch branches in the user's checkout at `/Users/ayodejieluwande/fm27`; other sessions share
  it. Use a worktree off `origin/main` and a PR; commits as `type(scope): Subject`, no AI attribution lines.
- Pass `--repo IamDejman/fm-lens` to `gh`.
- Verify every installer's signature or published checksum before running it on the box.
- Test writes on a copy of the career, fail closed, undo everything, and check the save's hash afterward.
- Record what you checked in `docs/EDITING-VALIDATION.md` and update the roadmap row "Every Windows and Mac edition".
- Release notes: see `AGENTS.md`. Detailed and exciting, every change since the last release.
