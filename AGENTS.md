# FM Lens agent instructions

## Product and current scope

FM Lens is a personal Football Manager companion. The delivered milestone is a
read-only macOS app for FM27 Steam on Apple Silicon. The wider editor is a roadmap,
not a completed product. Read README.md, docs/ROADMAP.md and
docs/PERSONAL-SCOUT.md before making support or feature claims.

This repository derives from FMLibreEditor commit
5fdb1e3e03a32b9855913f8c5ce7a885003e9c13. Preserve upstream history,
GPL-3.0-or-later licensing, copyright notices and third-party attribution.

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
- Improve UX, DX and AX together without breaking existing behavior. Use the
  product name FM Lens consistently.

## Architecture

- app/src/: React/TypeScript interface, filters, profiles and local state.
- app/src-tauri/: Tauri commands, connections and desktop packaging.
- crates/fmlibre-mem/: process access and the final memory-write guard.
- crates/fmlibre-core/: FM decoding, layouts, validation and domain operations.
- crates/fmlibre-bridge/: macOS bridge library and Steam launcher.
- crates/fmlibre-probe/: diagnostics; upstream mutation commands remain present
  but this build refuses game-memory writes.
- profiles/fm27/: platform/build fingerprints and layouts.
- app/src/assets/brand/: original transparent logo masters.
- docs/: roadmap, validation evidence and inherited reference documentation.

Keep raw memory access out of the frontend. Use stable entity identifiers,
validated fields and the guarded memory layer for domain operations.

## Game-data rules

- Preserve the default fmlibre-mem/read-only feature and read-only desktop
  connection during scouting work. UI disabling alone is not a write guard.
- When editing work is authorized, develop and verify it on a separate career
  copy. Do not experiment on the user's main career.
- Establish a field's layout, valid values, entity identity and related records
  before enabling it. Fail closed on unsupported builds or invalid data.
  Plausible-looking numbers do not prove a correct layout.
- Compare expected/current values before writes and verify readback afterward.
  Multiple writes are not automatically atomic. Undo must detect intervening
  game changes instead of blindly restoring old bytes.
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
  dependencies or restore upstream automatic updates.

## Evidence and status

- Distinguish available UI, inherited code, live verification and roadmap work.
  Code presence does not establish that an operation works on this user's save.
- The verified target is FM27 Steam build 26340721, native ARM64, module UUID
  F4540355-2186-39CB-9119-C706A6A35346. Reinspect after game updates. Intel and
  Windows delivery are not locally verified.
- Offline verification covered FM Lens with network access denied against an
  already-running game, not a fresh Steam Offline Mode launch.
- Do not claim complete parity, complete transfer consistency, 550,000-player
  performance or patch turnaround guarantees without corresponding evidence.
- Update the roadmap and validation notes when a feature's status changes.

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
cargo build --locked -p fmlibre-probe -p fmlibre-bridge
cd app
npm run tauri -- build --debug --bundles app --config src-tauri/tauri.scout.conf.json
```

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
