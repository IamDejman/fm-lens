# Contributing

Thanks for helping with FMLibreEditor.

- **Bugs and requests:** open an [issue](https://github.com/tozmoz/FMLibreEditor/issues/new/choose).
  For a bug, say which version of the app you use and where you run FM27 (Game Pass, Steam
  or macOS).
- **Questions:** ask in [Discussions](https://github.com/tozmoz/FMLibreEditor/discussions).
- **Code:** [docs/DEVELOPING.md](docs/DEVELOPING.md) explains how the editor works and how to
  build it. Before you open a pull request, run `cargo fmt`, `cargo clippy` and `cargo test`,
  and `npm run build` in `app/`. Every write to the game goes through the guarded patches
  described there; a change that writes somewhere new should say how the offset was found.

By contributing you agree that your work is published under the project's
[GPL-3.0-or-later](LICENSE) license.
