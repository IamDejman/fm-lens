# Contributing to FM Lens

Follow the [code of conduct](CODE_OF_CONDUCT.md), and report security problems
as [SECURITY.md](SECURITY.md) describes.

Read [AGENTS.md](AGENTS.md) and the [roadmap](docs/ROADMAP.md) first. Report
FM Lens bugs and requests in this repository, including the app version,
game build, platform, reproduction steps, expected behavior and actual result.
Do not attach saves, memory dumps, Steam configuration or credentials by default.

Build the frontend before Rust checks because Tauri embeds its output:

```sh
export PATH="$HOME/.cargo/bin:$PATH"
npm --prefix app ci
npm --prefix app run build
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
```

Match additional checks to the change. Read-only changes must retain the final
memory-write guard. Editing work needs a separate career copy and documented
game/build-specific evidence, including persistence through save/reload.

See [docs/PERSONAL-SCOUT.md](docs/PERSONAL-SCOUT.md) for setup and build commands.
Inherited development notes describe upstream behavior, not complete feature
parity in FM Lens.

Changes remain under [GPL-3.0-or-later](LICENSE), preserving upstream copyright
notices and third-party attribution.
