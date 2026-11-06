# FM Lens

![FM Lens logo](app/src/assets/brand/fm-lens-logo.png)

FM Lens is a companion for Football Manager 27 on macOS. It reads the career you
have loaded and lets you search, compare and edit players, staff and clubs while
FM runs. Fields that still need a memory layout stay off.

**[Download FM Lens](https://getfmlens.com/download/)** for Apple Silicon and Intel
Macs from [getfmlens.com](https://getfmlens.com). FM Lens updates itself after that.

![FM Lens with sample data: the player list and a player's profile](docs/images/fm-lens.png)

## What you need

- macOS, on Apple Silicon or Intel.
- Football Manager 27 from Steam, build 26340721 (27.0.0). Other builds open
  read-only until FM Lens has a profile for them.
- A copy of your save. FM Lens writes to the running game, and not every field
  has been checked through a save and reload in FM.

## Getting started

1. Open the disk image and drag **FM Lens** onto **Applications**. The app is not
   notarized by Apple: the first time, open **System Settings › Privacy &
   Security** and choose **Open Anyway**.
2. Save and quit FM, quit Steam, then choose **Set up** under **One-time setup**
   in FM Lens. This adds a small helper that FM loads when Steam starts it.
   System Integrity Protection stays on.
3. Start FM from Steam, load the copy of your save and choose **Connect**.

Edits go into FM when you press **Apply**, and FM shows them after you press
**Continue**. The **Changes** view lists every change, with **Undo**.

Found a problem? [Open an issue](https://github.com/IamDejman/fm-lens/issues/new/choose).
Questions and ideas go to [Discussions](https://github.com/IamDejman/fm-lens/discussions).

## What it does

- Connect to a loaded FM27 Steam career through a local macOS bridge, with System
  Integrity Protection enabled.
- Search players, staff and clubs. View and edit mapped player attributes, CA/PA,
  positions, traits, personality, reputation, happiness, caps and contract fields.
- Freeze a player's attributes, set them all to one value from 1 to 20, heal
  injuries, lift bans, and run the squad actions that are already built:
  inspire, refresh fitness and sharpness, max attributes and an experimental
  max cohesion, which raises existing club familiarity only.
- Experimental options for your own manager on this build: unsackable, and squad
  registration at any time. Dismissal protection is unverified.
- Filter players by age, ability, position, nationality, club, attributes,
  contract expiry and transfer/loan listing. Staff filters include age, nation,
  club, ability, job and attributes; club filters include reputation and founded year.
- Browse nations, match officials and the senior stadium of each loaded club,
  with stadium capacity filtering. Nation profiles show nationality rules,
  languages, FIFA ranking, rivals and men's national teams. These are read-only.
- See languages, favoured and disliked people and clubs, club rivals and linked
  clubs on profiles. These are read-only.
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

## Build from source

Requirements: Xcode command-line tools, Rust stable, Node.js and npm.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --locked -p fmlens-probe -p fmlens-bridge
cd app
npm ci
npm run tauri -- build --debug --bundles app --config src-tauri/tauri.scout.conf.json
```

The local Apple Silicon bundle is `target/debug/bundle/macos/FM Lens.app`.
Releases are built and published as [Releasing](docs/DEVELOPING.md#releasing) describes.

See [setup, removal and validation notes](docs/PERSONAL-SCOUT.md) before setting
up the bridge. Save and quit FM, then quit Steam before setup. The launcher must
remain installed while Steam's launch option references it.

## Documentation

- [Contributing and checks](CONTRIBUTING.md)
- [Developing and releasing](docs/DEVELOPING.md)
- [Feature status and roadmap](docs/ROADMAP.md)
- [Mapped editing fields](docs/EDITOR-FIELDS.md)
- [Editing tests and remaining validation](docs/EDITING-VALIDATION.md)
- [Current build and live verification](docs/PERSONAL-SCOUT.md)
- [Brand assets and generation prompts](docs/brand/FM-LENS.md)
- [Agent instructions](AGENTS.md)

Every pull request runs the checks in `.github/workflows/validate.yml`.

## Security

Report security problems privately, as [SECURITY.md](SECURITY.md) describes, not
in a public issue.

## Attribution and license

GPL-3.0-or-later. See [LICENSE](LICENSE).

FM Lens derives from [FMLibreEditor](https://github.com/tozmoz/FMLibreEditor),
starting at commit `5fdb1e3e03a32b9855913f8c5ce7a885003e9c13`. Its Git history,
copyright notices and GPL-3.0-or-later license are retained.

Original implementation: [FMLibreEditor](https://github.com/tozmoz/FMLibreEditor)
and its contributors. Upstream credits memory-layout leads to
[fm-editor](https://github.com/barak14/fm-editor) by barak14.

The bundled [Archivo](https://github.com/Omnibus-Type/Archivo) typeface by
Omnibus-Type uses the SIL Open Font License 1.1; see
[app/licenses/Archivo-OFL.txt](app/licenses/Archivo-OFL.txt).

FM Lens is not affiliated with or endorsed by Sports Interactive or SEGA.
