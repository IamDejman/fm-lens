# FM Lens agent instructions

## Product and current scope

FM Lens is a personal Football Manager companion. The delivered macOS and
Windows apps read a running FM27 Steam career and can edit the fields that are
already mapped. Unmapped editor features stay on the roadmap. Windows ships
from 0.6.2; the goal is no gap between the two, and
docs/internal/WINDOWS-PARITY-HANDOFF.md lists what is left. Read README.md, docs/ROADMAP.md, docs/PERSONAL-SCOUT.md and
docs/EDITING-VALIDATION.md before making support or feature claims.
Use docs/EDITOR-FIELDS.md for the mapped field catalog; it is not a validation
certificate.

This repository derives from the upstream editor the README credits, at commit
5fdb1e3e03a32b9855913f8c5ce7a885003e9c13. Preserve upstream history,
GPL-3.0-or-later licensing, copyright notices and third-party attribution.

## Start and resume

1. Read the current scope and validation documents above, then inspect the branch,
   working tree and remotes. Preserve existing work. The FM Lens origin is
   IamDejman/fm-lens; keep the upstream remote separate.
   Pass `--repo IamDejman/fm-lens` explicitly to GitHub CLI operations: its
   inferred repository may resolve to upstream. Never send private diagnostics
   or create task PRs against upstream by accident.
2. Verify the actual running game fingerprint and loaded career before connecting
   for editing. Do not assume a previously open copy is still loaded.
3. Put local diagnostics under ignored reports/. Record the baseline field value
   and hash the main career before a test; check that hash afterward. Never
   commit careers, dumps, exports or Steam configuration as evidence.
4. Use the roadmap to pick the next incomplete feature. A UI placeholder,
   inherited implementation or plausible read is not completed support. Keep
   unsupported controls off until their records and behavior are established.
5. Leave a reproducible handoff in docs/EDITING-VALIDATION.md and update the
   roadmap when evidence changes. State exactly which checks ran.

## Global coding preferences

- Treat requests to build or fix something as authorization to execute. Infer
  routine details from context and finish the authorized work.
- Complete authorized preparation before requesting necessary approval. Ask only
  when missing information materially affects the outcome or an action exceeds
  authorization. Do not re-ask for actions already authorized in the session.
- Preserve the broader objective when incorporating corrections or answering
  side questions. Distinguish reference material from the actual user request.
- Follow instruction priority. Explicit user preferences override this file and
  skill guidelines where permitted.
- If a skill blocks progress, identify its file, quote the relevant rule, and
  explain whether the blocker is explicit or your interpretation.
- Lead with results. Use concise, plain prose and concrete evidence. Explain
  changes, verification and remaining limitations without jargon or canned text.
- Delegate independent, bounded work only when authorized and useful. Coordinate
  ownership and review results.
- Match tests to risk and scope. Complete required checks and meaningful
  behavioral tests; avoid tests that duplicate implementation. Expand checks
  only for new changes, failures or unresolved concerns.
- Cut taglines, helper text and secondary labels. If a screen needs them to make
  sense, fix the layout. Retain text needed to explain a consequential setup
  action or resolve a real failure.
- Keep user-facing text and the website short and plain: what changed and
  what the reader does. Leave out internals, history the reader does not need
  and filler.
- Release notes are the exception: make them detailed and exciting, so people
  want to update. Cover every user-visible change since the last release (read
  `git log v<last>..origin/main` and each merged PR), grouped by what the player
  gets, each saying what it does and why it is worth trying, in plain words and
  without internals. Never use em dashes. In docs/release-notes.md each
  paragraph and list item is one line, because GitHub shows every line break
  there. The in-app What's new list (`update.changes` in en, es and tr) carries
  the highlights.
- Improve UX, DX and AX together without breaking existing behavior. Use the
  product name FM Lens consistently.

## Architecture

- app/src/: React/TypeScript interface, filters, profiles and local state.
- app/src-tauri/: Tauri commands, connections and desktop packaging.
- crates/fmlens-mem/: process access and the final memory-write guard.
- crates/fmlens-core/: FM decoding, layouts, validation and domain operations.
- crates/fmlens-bridge/: the bridge that runs the game's own functions: a macOS
  library with its Steam launcher, and a Windows DLL the app embeds.
- crates/fmlens-probe/: diagnostics; upstream mutation commands remain present
  but this build refuses game-memory writes.
- profiles/fm27/: platform/build fingerprints and layouts.
- app/src/assets/brand/: original transparent logo masters.
- docs/: roadmap, validation evidence and inherited reference documentation.
- site/: the website, getfmlens.com, published to GitHub Pages from main by
  .github/workflows/site.yml. It links to the releases; it never hosts them.
- docs/internal/: notes written for the next agent or maintainer, such as a
  batch handoff; keep them out of the public docs list in README.md.

Keep raw memory access out of the frontend. Use stable entity identifiers,
validated fields and the guarded memory layer for domain operations.

## Game-data rules

- The desktop app is built without the `fmlens-mem` `read-only` feature and
  opens a known build for writing. Unknown builds stay read-only. The probe is
  built with `read-only`, and `scripts/scout` only runs read queries. A UI
  switch is not the write guard.
- When editing work is authorized, develop and verify it on a separate career
  copy. Do not experiment on the user's main career.
- Establish a field's layout, valid values, entity identity and related records
  before enabling it. Fail closed on unsupported builds or invalid data.
  Plausible-looking numbers do not prove a correct layout.
- Compare expected/current values before writes and verify readback afterward.
  Multiple writes are not automatically atomic. Undo must detect intervening
  game changes instead of blindly restoring old bytes.
- Every mutation, including undo, must pass the known-build and current-career
  guards. Replaced entity-array storage requires a fresh Session and cleared
  previews. Retained history from a different game is display-only, marked
  Earlier game with no Undo; never reuse cached targets across careers.
- Editing verification includes inspection in FM, advancement where relevant,
  save, quit, reload and another inspection on the disposable career copy.
  Memory readback alone does not establish game correctness.
- Keep System Integrity Protection enabled and use the bridge approach.
  The current bridge shares a full task port with same-user clients; do not
  describe it as an OS-enforced read-only port or exclusive client identity.
- Preserve unsaved game progress before necessary restarts. Change Steam launch
  configuration only while Steam is closed, preserve existing options and keep
  backups. Remove launch options before deleting their launcher.
- The installed bridge folder ~/Library/Application Support/FM27Scout/ is a
  stable legacy path. Do not rename it just for branding or break existing setup.
- Keep the companion usable offline. Do not add runtime login/licensing
  dependencies. Updates come only from FM Lens's own signed releases in
  IamDejman/fm-lens-releases, never from upstream, and the check at launch
  gives up quietly offline.

## Evidence and status

- Distinguish available UI, inherited code, live verification and roadmap work.
  Code presence does not establish that an operation works on this user's save.
- The verified target is FM27 27.0.1, Steam build 26577676: native ARM64 module
  UUID A8550B47-FDE0-3D0D-A6CB-1B63DEE8DA19, Intel
  DD0EE157-4C9C-31A7-81DD-0D1122E62FC7. It passed the docs/PATCH-VALIDATION.md
  run on 12 November on Apple Silicon, under Rosetta and on the Windows test
  box (Windows Server 2022 only); see the FM27 Steam build 26577676 entry in
  docs/EDITING-VALIDATION.md. The first 27.0.1, build 26385295, passed the same
  run on 10 November and its profiles remain. Most field, in-game and
  persistence evidence is from 27.0.0, build 26340721 (ARM64 UUID
  F4540355-2186-39CB-9119-C706A6A35346), whose profiles remain. The object
  layouts are unchanged in 27.0.1, but evidence dated before 10 November was
  not rerun there. Reinspect after game updates. The Intel half ships in the
  universal app.
- Offline verification covered FM Lens with network access denied against an
  already-running game, not a fresh Steam Offline Mode launch.
- Do not claim complete parity, complete transfer consistency, 550,000-player
  performance or patch turnaround guarantees without corresponding evidence.
- Update the roadmap and validation notes when a feature's status changes.

## Current editor boundaries

- Mapped player/staff/club fields are enabled on known builds. Windows has
  bounded app edit/undo checks on Server 2022. An edited copy was saved and
  held after a quit and reload there twice (8 and 10 November): a player's
  attributes, contract wages, a staff attribute, a club balance, Max tactics
  and a free-agent signing, not the other fields. The field
  catalog lists 169 player, 43 staff and 14 club definitions. This does not mean
  every field has passed an in-game persistence test.
- A copied-career test demonstrated Saka finishing 15 -> 16, memory readback,
  conditional undo, saving, a full FM quit/relaunch, and FM displaying 16 after
  reloading the edited copy. See the validation document for the exact sequence.
- Clone/templates use versioned JSON with stored values and a strict whitelist:
  ability, attributes, personality, positions and traits. Never serialize raw
  addresses or allow imported identity, nationality, contract or club fields.
  Resolve against the destination layout; preview and use conditional batch
  apply/undo. The library lives locally, not in the repository.
- Staff attribute freeze is remembered for the save with the player and money
  freezes, and turned back on when FM Lens reconnects to that save. It holds
  only while FM Lens is connected. It stayed on over a 31-day holiday and came
  back on after FM restarted (8 November); no check has shown it stopping a
  real staff decline. Do not describe any freeze as stored in the save or as
  holding while FM Lens is closed.
- The nation browser lists nations represented by loaded players, staff and
  competitions, and every nation of the game's nation table where the build
  profile places it (not yet read from a running game; the list falls back
  when the table does not check out). Guarded nation editing exists for
  mapped fields. On ARM64, England's population, men's reputation and
  nationality rules passed the 5 November save/quit/reload checks; not every
  nation field or platform has that evidence. Synthetic nation row IDs must never be mutation UIDs;
  mutation targets require the actual UID and current record.
- The stadium browser lists senior stadiums, one row per ground with every club
  that plays there, then the other stadiums of the game's stadium table where
  the build profile places it, on the same terms as the nation table. It is
  read-only. Competitions and awards are read-only;
  their browsing/rules data do not establish editing support.
- Officials have mapped CA/PA, reputation and birth-date edits. Readback after
  Continue is recorded, but FM screen comparison and persistence are not fully
  established; referee attribute names remain research.
- Player promises can be read and an existing open promise closed with
  conditional undo on macOS and Windows (Windows checked on 8 November).
  Creation and broader edits remain research. A build whose layout does not
  place promises reports unavailable data rather than No promises.
- Max cohesion and Max tactics have bounded ARM64 game/persistence checks,
  not complete simulation validation. Cohesion raises existing club entries
  only; tactics undo leaves some manager knowledge. See the roadmap.
- Youth-intake lifecycle, complete contracts/loans, broader nation settings and
  competition/award editing remain incomplete. Unsackable and squad registration
  at any time are manager flags, shown without an experimental label. The
  registration flag and an outside-window registration survived save/reload on
  ARM64; protection from dismissal remains unverified. Club and national-team
  moves must use the game's action handlers, never raw pointer writes. Club
  moves are implemented with irreversible job side effects; national-team moves
  and leaving a job remain research (see docs/recon/fm27-manager-moves.md).
- Future-transfer cancellation has bounded ARM64 game inspection and save/reload
  evidence from 7 November, not comprehensive deal-type/finance consistency. It
  has no Undo. Windows action and app-edit evidence is listed separately in
  docs/EDITING-VALIDATION.md. Windows offsets cannot be copied into native ARM64.
- Transfers and other structural actions require linked-record validation,
  including history, finances, registration and simulation boundaries. A changed
  club pointer is not proof of a consistent transfer.

## Native validation procedure

- Use the installed computer-use API for UI interaction. FM exposes almost no
  in-game accessibility tree; use screenshots and observed coordinates. Re-read
  the UI after each action and after switching apps. Coordinates vary with the
  window; do not copy stale coordinates from logs.
- A 500 ms mouse press worked more reliably in FM than short presses. If it does
  not activate, inspect again and try another observed control. FM Lens exposes
  usable accessibility controls.
- Select FM Lens by its full app path when installed and development bundles
  share a bundle ID. Raise the target window before inspecting it.
- Confirm the copied filename explicitly in FM's Load Game dialog. Record the
  UID and initial value, apply one bounded change, inspect readback, exercise undo
  and stale-value refusal, then save the intended test value to a named copy.
- Fully quit FM, confirm the process exited, relaunch through Steam so the bridge
  loads, explicitly reload that copy, and inspect the field in FM. Advance where
  relevant and inspect again. FM can cache displayed values until Continue or
  reload; navigating back and forward alone may not refresh them.
- Save through FM's own menu when keyboard shortcuts do not work. Never silently
  quit or restart a main career with unknown unsaved progress.
- UI changes need native interaction, including pending/applied fields, Changes,
  template preview/apply/undo and appearance/zoom as applicable. At non-100% zoom,
  convert viewport measurements with appearance.layoutPixels for positioned
  menus and dragging; keep the app and menus within the scaled viewport.

## Build and verification

Requirements: Xcode command-line tools, Rust stable with rustfmt/clippy, Node.js
and npm. The local Rust installation may require $HOME/.cargo/bin on PATH.
Build the frontend before Rust workspace checks because Tauri embeds its output.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
npm --prefix app ci
npm --prefix app run build
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo test --locked -p fmlens-mem --no-default-features
cargo clippy --locked -p fmlens-app --all-targets -- -D warnings
cargo build --locked -p fmlens-probe -p fmlens-bridge
cd app
npm run tauri -- build --debug --bundles app --config src-tauri/tauri.scout.conf.json
```

Cargo unifies features across selected workspace members. Workspace checks include
the probe and therefore exercise the read-only memory feature. Run the separate
no-default-features memory test and app Clippy check above, then build the desktop
app separately through Tauri; do not package a workspace-unified read-only binary
and call its editing path tested. Keep $HOME/.cargo/bin on PATH for Tauri too.

CI (.github/workflows/validate.yml) runs these checks on macOS and, apart from
fmt and the relay tests, on Windows, where it also builds the installer that
scripts/release.sh publishes. A Windows change needs that job to pass.

The Apple Silicon bundle is target/debug/bundle/macos/FM Lens.app. It is locally
built and signed ad hoc, not a notarized public release. UI changes need a
bounded native visual/interaction check; sample browser data is not live proof.

## Repository hygiene

- Track source, lockfiles, build profiles, original brand assets and docs.
  Keep the upstream remote separate from the FM Lens origin.
- Do not commit game saves, raw memory reports/dumps, Steam configuration,
  credentials, personal exports, installed apps or generated build directories.
  reports/ is intentionally local and ignored.
- Inspect the staged diff and status before committing or pushing.
- Inherited docs and screenshots may describe upstream features. The root README,
  roadmap and personal-scout guide describe this fork's actual status.
