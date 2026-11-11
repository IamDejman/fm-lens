# Handoff: Windows parity

For the next agent. The goal, in the user's words: "all that is on mac is what windows should have too. No disparity."
Read this, then `AGENTS.md` and `CLAUDE.md`, then the Windows sections of `docs/EDITING-VALIDATION.md` ("Windows
reads", "Windows game actions", "Windows edits", "Windows: every feature on main" and "FM27 27.0.1").

## 1. Where things stand (7 November 2026)

FM Lens runs on Windows against FM27 Steam build 26340721 and does what the Mac app does, except for the gaps in
section 3 that are marked left. FM Lens 0.6.2 is the first release with a Windows installer, and installed copies
update themselves from it. Everything here was checked on the test box (section 2), Windows Server 2022, not on
Windows 10 or 11 themselves.

| PR | What it brought to Windows |
| --- | --- |
| #130 | The reads that were macOS-only: officials, competitions and rules, awards, kinds of injury, nations, club relations, staff likes, licence and formations, loans, work permits, future transfers, languages, cohesion |
| #135 | The game's own actions through a Windows bridge DLL: injuries, work permits, loans, free agents, transfers, future transfers, max tactics, manager moves, refresh |
| #143 | The new FM Lens icon on the exe and taskbar |
| #146 | The NSIS installer built in CI, signed updates in `latest.json`, self-update with Relaunch, Check for Updates in Settings, About, and the small gaps in section 3.3 |
| #147 | One FM Lens at a time, on macOS and Windows |
| #150 | Release 0.6.2: the site and README offer the Windows download |
| #153 | The FM Lens icon and wordmark in the installer |

Checked in the running game on Windows, each undone, the save never written: every read above, every game action
above, and the app's direct edits (attributes and CA/PA, contract, mass edit, clone and templates, freeze money,
Heal, Refresh fitness, Max morale, Max cohesion, your manager's unsackable flag and wage). Not checked on Windows by
7 November: Remove unhappiness, Lift bans (nobody to use them on in the test save), and a save, quit and reload of an
edited copy.

Since then, on the same box:

- **8 November, build 26340721.** FM Lens 0.6.2 from `feat/windows-parity` ran every feature on main in a copy of the
  test career ("Windows: every feature on main"). Remove unhappiness passed, with its undo. A second copy,
  `FM Lens Persist Check`, was saved with Save As, FM quit and relaunched through Steam, and that copy loaded: two
  player attributes, a contract wage and a club balance held, and both freezes came back on.
- **10 November, FM27 27.0.1 (Steam build 26385295).** The build has a Windows profile and passed the
  `docs/PATCH-VALIDATION.md` run ("FM27 27.0.1"): `fmlens-probe health` 12 of 12, a bounded set of edits and game
  actions, then a Save As to `FM-Lens-27.0.1-Windows`, an FM quit and restart and a reload. A player and a staff
  attribute, a wage, a club balance, a signing, a work permit and Max tactics held.
- **Still not checked on Windows:** Lift bans (nobody is banned in the test saves), persistence of the other mapped
  fields, Windows 10 and 11 themselves, and Game Pass (section 3.4).

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
  press Continue (Space in FM) or save in it: the persistence runs of 8 and 10 November worked in copies made with
  FM's Save As and saved only those.
- Clicks sent to FM or FM Lens over SSH sometimes drop, mostly the first after a pause: take a screenshot after
  each one and retry.

## 3. What Windows still lacks next to macOS

Status after the "Ship FM Lens for Windows" PR. Each item says what was done, or why it is left.

### 3.1 Ship it: a Windows download and updates

1. **Installer: done.** `npm run release:windows` builds the NSIS installer (current user, no administrator) with
   the bridge DLL embedded. The `windows-checks` job in `.github/workflows/validate.yml` builds it on every run and
   keeps it as the `fm-lens-windows-installer` artifact for 30 days. It shows the FM Lens icon, and the wordmark
   `scripts/nsis/sidebar.py` draws on its first and last pages.
2. **Updater files: done.** `scripts/release.sh` (was `release-mac.sh`) takes the installer from the passing Validate
   run of the commit it releases, signs it on the Mac with the same updater key (`tauri signer sign`; the key never
   goes to GitHub) and adds `windows-x86_64` to `latest.json`.
3. **Updates inside the app: done.** `can_self_update` is true on Windows when `uninstall.exe` sits beside the exe,
   so only an installed copy updates itself. `app/src/update.ts` downloads in the background and runs the installer
   only on Relaunch, as the installer closes the app. Checked from 0.6.1 to the published 0.6.2. The installer
   remembers the language picked when it was run by hand, so an update asks nothing and the new version opens about
   2 s after Relaunch; a copy installed silently (`/S`) has none, and its first update asks for one.
4. **Check for Updates: done.** Settings, About, on Windows only (macOS keeps it in the app menu).
5. **Code signing: unsigned, with SmartScreen guidance** ("More info", "Run anyway"), like the ad hoc Mac app.
   Buying an Authenticode certificate is the user's decision.
6. **Release repo and site: done** in 0.6.2 (#150): the site offers both downloads, and `IamDejman/fm-lens-releases`
   describes FM Lens for macOS and Windows.

### 3.2 Features that read nothing on Windows

Release through the game's call is mapped on Windows (`withdraw_offers` 0xB17790, `leave_team` 0xB11110) and passed on
the box. Evidence is in docs/EDITING-VALIDATION.md, "Windows: every feature on main".

1. **Promises: done (8 November).** The record is laid out as on the Mac; only the person block's list pointer
   differs (`list = 0xD8`, player + 0x360). Traced on Jurriën Timber's preferred position promise on a copy career;
   the Mood tab matched FM's Promises page, and Close and Undo were checked in FM.
2. **Refreshing an official: done (8 November).** The layout's `[official] identity = 0x138` gives the identity block
   that MSVC vtables keep no offset to, and `refresh_entity` uses it. A reputation edit applied and read back on the box.

### 3.3 Small app gaps: done

1. **System version.** Reports read, for example, "Windows 11 Pro 24H2 (26100), x64" (`windows_version` in `lib.rs`,
   from the registry). The relay and issue form label the field System. The field keeps its wire name `macos`, so
   copies of every version and the deployed relay keep working in any order; renaming it would need both deployed
   together for no gain to anyone. The relay's new label shows once `relay/deploy.sh` runs (live AWS, ask first).
2. **Old bridge DLLs.** The app removes older `fmlens_bridge-*` files when it writes its own (`bridge.rs`, `tidy`).
3. **Export to a blocked folder.** Windows explains Controlled Folder Access and how to allow FM Lens
   (`export.blocked`).

### 3.4 Checks and build

1. **CI: done.** `windows-checks` runs clippy, the workspace tests, the memory guard tests, the app's clippy and the
   installer build. fmt and the relay tests stay on the Mac job: they do not depend on the platform.
2. **Pinned profile test: done.** `steam_27_0_0_on_windows_finds_what_was_traced` in `profile.rs`, and
   `steam_27_0_1_on_windows_carries_27_0_0_across` for 27.0.1.
3. **Development build: done.** `tauri.windows.conf.json` builds the bridge before `npm run tauri dev`.
   `scripts/check-build.sh` and `scripts/scout` stay Mac tools: they inspect the Mac game build and Mac app bundle,
   and the Windows equivalents are `fmlens-probe health` and the profile test above.
4. **Game Pass: left.** The test box has only the Steam copy, so nothing can be traced or tested. The Game Pass
   profile stays minimal and untested.

### 3.5 Docs: done

`docs/DEVELOPING.md` covers the Windows installer, `scripts/release.sh` and Windows updates. `AGENTS.md` names the
Windows bridge and CI job; its scope says Windows is shipped once the release is out.

## 4. How to work

- Never edit, stage or switch branches in the user's checkout at `/Users/ayodejieluwande/fm27`; other sessions share
  it. Use a worktree off `origin/main` and a PR; commits as `type(scope): Subject`, no AI attribution lines.
- Pass `--repo IamDejman/fm-lens` to `gh`.
- Verify every installer's signature or published checksum before running it on the box.
- Test writes on a copy of the career, fail closed, undo everything, and check the save's hash afterward.
- Record what you checked in `docs/EDITING-VALIDATION.md` and update the roadmap row "Every Windows and Mac edition".
- Release notes: see `AGENTS.md`. Detailed and exciting, every change since the last release.
