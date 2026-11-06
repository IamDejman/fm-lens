# FM Lens

![FM Lens logo](app/src/assets/brand/fm-lens-logo.png)

FM Lens is a free Mac companion for Football Manager 27. It reads the career you
have loaded and lets you search, compare and edit players, staff and clubs while
FM runs.

**[Download FM Lens](https://getfmlens.com/download/)** for Apple Silicon and Intel
Macs from [getfmlens.com](https://getfmlens.com). FM Lens updates itself after that.

![FM Lens with sample data: the player list and a player's profile](docs/images/fm-lens.png)

## What you need

- A Mac with Apple Silicon or Intel.
- Football Manager 27 from Steam, version 27.0.0 (build 26340721). Other builds
  open read-only.
- A copy of your save to edit.

## Getting started

1. Open the disk image and drag **FM Lens** onto **Applications**. The first
   time, open **System Settings › Privacy & Security** and choose **Open Anyway**.
2. Save and quit FM, quit Steam, then choose **Set up** in FM Lens. This adds a
   small helper that FM loads when Steam starts it.
3. Start FM from Steam, load the copy of your save and choose **Connect**.

Edits go into FM when you press **Apply**. On the supported Apple Silicon build,
Apply and Undo also notify FM to refresh its views, without advancing time.
Attribute and contract-expiry header refresh have been checked in FM. Other
fields and panels have not all been verified.
**Changes** lists each one, with **Undo**. To take the helper out again, choose
**Remove the helper** in FM Lens.

Found a problem? [Open an issue](https://github.com/IamDejman/fm-lens/issues/new/choose).
Questions and ideas go to [Discussions](https://github.com/IamDejman/fm-lens/discussions).

## What it does

- Search and filter players, staff and clubs. Browse nations, stadiums,
  competitions, awards and match officials.
- Edit attributes, CA and PA, positions, traits, personality, reputation,
  happiness and contracts, and club balances, budgets, facilities and stadiums.
- Grant work permits, change coaching licences, add injuries, start and end
  loans, and sign free agents.
- Heal injuries, lift bans, refresh fitness and sharpness, and set or freeze a
  player's attributes.
- Copy a player's profile onto others with templates, previewed first.
- Export to CSV or JSON. Light and dark appearance, 80 to 150% zoom and
  keyboard shortcuts.

## Limits

- Not every field has been tested through a save and reload in FM.
- Moving, swapping and releasing players may not update every linked record,
  such as history and finances.
- Max cohesion, an unsackable manager and squad registration at any time are
  experimental.
- There is no Windows version.

Test results are in the [editing validation record](docs/EDITING-VALIDATION.md).

## Build from source

Requirements: Xcode command-line tools, Rust stable, Node.js and npm.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --locked -p fmlens-probe -p fmlens-bridge
cd app
npm ci
npm run tauri -- build --debug --bundles app --config src-tauri/tauri.scout.conf.json
```

The app is `target/debug/bundle/macos/FM Lens.app`. Releases are built as
[Releasing](docs/DEVELOPING.md#releasing) describes.

## Documentation

- [Contributing and checks](CONTRIBUTING.md)
- [Developing and releasing](docs/DEVELOPING.md)
- [Feature status and roadmap](docs/ROADMAP.md)
- [Mapped editing fields](docs/EDITOR-FIELDS.md)
- [Editing tests and remaining validation](docs/EDITING-VALIDATION.md)
- [Current build and live verification](docs/PERSONAL-SCOUT.md)
- [Brand assets and generation prompts](docs/brand/FM-LENS.md)
- [Agent instructions](AGENTS.md)

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
