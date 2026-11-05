# FM Lens

![FM Lens logo](app/src/assets/brand/fm-lens-logo.png)

A personal Football Manager companion for FM27 Steam on Apple Silicon. It reads
a running career and can edit the player, staff and club fields that are already
mapped. Features that still need a memory layout stay off.

FM Lens derives from [FMLibreEditor](https://github.com/tozmoz/FMLibreEditor),
starting at commit `5fdb1e3e03a32b9855913f8c5ce7a885003e9c13`. Its Git history,
copyright notices and GPL-3.0-or-later license are retained. This fork's delivered
features differ from the upstream editor.

## Current build

- Connect to a loaded FM27 Steam career through a local macOS bridge, with System
  Integrity Protection enabled.
- Search players, staff and clubs. View and edit mapped player attributes, CA/PA,
  positions, traits, personality, reputation, happiness, caps and contract fields.
- Freeze a player's attributes, set them all to one value from 1 to 20, heal
  injuries, lift bans, and run the squad actions that are already built:
  inspire, refresh fitness and sharpness, and max attributes.
- Filter players by age, ability, position, nationality, club, attributes,
  contract expiry and transfer/loan listing. Staff filters include age, nation,
  club, ability, job and attributes; club filters include reputation and founded year.
- Browse nations represented by players/staff and the senior stadium of each
  loaded club, with stadium capacity filtering. These are partial read-only lists.
- Follow a skippable first-run introduction to navigation, search and settings.
- View and edit mapped club balances, budgets, facilities and stadium capacities.
- Move, swap and release players, and change mapped staff jobs, where the editor
  already has those operations. Linked history and finances are not fully proven.
- Capture player profiles, save portable templates, import/export template JSON,
  and preview/apply/undo template batches against filtered players or selected UIDs.
- Freeze mapped staff attributes for the current connection.
- Use currency selection, System/Light/Dark appearance, 80–150% UI zoom, CSV/JSON
  exports, and the Changes view for conditional undo.
- The probe and `scripts/scout` stay read-only. Unknown game builds stay
  read-only. A copied-career finishing edit passed save, full quit/relaunch and
  reload inspection in FM. Other mapped fields are not all persistence-tested.

On 4 November 2026, live checks covered native ARM64 FM27 Steam build 26340721,
a 30,314-player career, Arsenal's 29-player senior squad, all ten data-health
checks and visible player values compared against FM. These do not establish
complete feature coverage or support for other game builds. See the
[editing validation record](docs/EDITING-VALIDATION.md) and
[mapped field catalog](docs/EDITOR-FIELDS.md).

FM Lens connected, searched and displayed profiles with its network access
blocked. A fresh Steam Offline Mode launch has not yet been tested.

## Build and use

Requirements: Xcode command-line tools, Rust stable, Node.js and npm.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --locked -p fmlibre-probe -p fmlibre-bridge
cd app
npm ci
npm run tauri -- build --debug --bundles app --config src-tauri/tauri.scout.conf.json
```

The local Apple Silicon bundle is `target/debug/bundle/macos/FM Lens.app`.
It is signed ad hoc; no notarized FM Lens release is published.

See [setup, removal and validation notes](docs/PERSONAL-SCOUT.md) before setting
up the bridge. Save and quit FM, then quit Steam before setup. The launcher must
remain installed while Steam's launch option references it.

## Documentation

- [Agent instructions](AGENTS.md)
- [Feature status and roadmap](docs/ROADMAP.md)
- [Current build and live verification](docs/PERSONAL-SCOUT.md)
- [Editing tests and remaining validation](docs/EDITING-VALIDATION.md)
- [Mapped editing fields](docs/EDITOR-FIELDS.md)
- [Brand assets and generation prompts](docs/brand/FM-LENS.md)
- [Contributing and checks](CONTRIBUTING.md)

Other inherited documents and screenshots may describe upstream behavior,
including editing features this fork does not enable. The GitHub validation
workflow is manual and does not publish releases.

## Attribution and license

GPL-3.0-or-later. See [LICENSE](LICENSE).

Original implementation: [FMLibreEditor](https://github.com/tozmoz/FMLibreEditor)
and its contributors. Upstream credits memory-layout leads to
[fm-editor](https://github.com/barak14/fm-editor) by barak14.

The bundled [Archivo](https://github.com/Omnibus-Type/Archivo) typeface by
Omnibus-Type uses the SIL Open Font License 1.1; see
[app/licenses/Archivo-OFL.txt](app/licenses/Archivo-OFL.txt).

FM Lens is not affiliated with or endorsed by Sports Interactive or SEGA.
