# FM27 Steam 26340721 on macOS: refresh after edits on Intel (x86_64)

7 November 2026. Found statically, then checked in FM under Rosetta the same day (see "Checked in FM"). The values come from the x86_64 slice
of `game_plugin` (LC_UUID `0981AB31-AC3B-3D93-944F-47FE4B59CD9E`), compared with the arm64 slice
(`F4540355-2186-39CB-9119-C706A6A35346`). Both slices were cut with `lipo -thin` from the installed file (read only)
and disassembled with `llvm-objdump`. RVAs are file addresses of the slice, as in
[fm27-steam-26340721-macos-x86_64.md](fm27-steam-26340721-macos-x86_64.md).

## Summary

On arm64, FM Lens asks FM to refresh after every successful Apply and Undo (see EDITING-VALIDATION.md, "Edits show
without Continue"). That needs three values, which the Intel profile lacked:

| Value | arm64 | x86_64 | How it was found |
|---|---|---|---|
| `game_ui` (static pointer to GAME_UI) | `0x56D48B8` | `0x5C8AC88` | Editor actions that call GAME_UI slot +0xA0 |
| `calls.entity_changed` (GAME_UI slot +0xA0) | `0x30B50` | `0x308A0` | GAME_UI's vtable, through its RTTI |
| `calls.refresh_views` (rfui dispatcher) | `0x2FC20` | `0x2FA70` | Called by entity_changed's notifier; same code |

The bridge's allowlist is built from the profiles (`crates/fmlens-bridge/build.rs`), so the two calls are allowed on
the Intel build with no bridge change. Both take plain register arguments, which the bridge already passes the System V
way on x86_64; neither returns an object indirectly (the Intel bridge has since gained the hidden `rdi` result place; see the 8 November section of fm27-steam-26340721-macos-x86_64.md).

## entity_changed: GAME_UI's vtable

`refresh_entity` checks that the object at `game_ui` has class `N11game_plugin7GAME_UIE` and that its vtable +0xA0 is
`entity_changed`. So the slot was read from the vtable itself:

1. The type name `N11game_plugin7GAME_UIE` is at `0x58B9FB0` (arm64 `0x52DD490`).
2. Its typeinfo is the data pointer to that name minus 8: `0x5A6B450` (arm64 `0x54B2358`). The pointers are chained
   fixups; a rebase's low 36 bits are the target RVA.
3. The vtable is the pointer to that typeinfo with offset-to-top 0: typeinfo slot `0x5A6B148`, address point
   `0x5A6B150` (arm64 `0x54B2050`, `0x54B2058`).
4. Slot +0xA0 is `0x308A0`. The same steps on arm64 give `0x30B50`, the value already in its profile.

`0x308A0` matches arm64 `0x30B50` step for step:

- It makes the identity's reference vector with `0x683730(sret, identity, 0)` (arm64 `0x6585E4`).
- It passes the vector to the rfui notifier `0x2F9D0(vector, 0, 0)` (arm64 `0x2FB64`).
- It frees the vector.

It takes `(ui, identity)` in `rdi` and `rsi`, as `refresh_entity` passes them.

## refresh_views: the rfui dispatcher

The notifier `0x2F9D0` calls `0x2FA70(vector, rsi, rdx)` at `0x2FA23`, where arm64 `0x2FB64` calls `0x2FC20`.
`0x2FA70` is the same code as arm64 `0x2FC20`:

| Step | arm64 `0x2FC20` | x86_64 `0x2FA70` |
|---|---|---|
| Listener list and count | `bl 0x2504550`, `bl 0x2505F24` | `call 0x2704430`, `call 0x2705DE0` |
| Per listener | `bl 0x2523DC8`, `ldrb [x0, #0x19c]`, `cmp #1` | `call 0x2724CC0`, `cmpb $0x1, 0x19c(%rax)` |
| Dispatcher global | `0x56A4AA8` | `0x5C5CF10` |
| Listener +0x138 | `bl 0x769694` | `call 0x7A2140` |
| Six-argument dispatch | `bl 0x77DB60`, last argument `0x56D6300` | `call 0x7B64A0`, last argument `0x5C8C768` |
| No listeners | `bl 0x768090`, then the dispatch | `call 0x7A0CD0`, then the dispatch |

The dispatch receives the caller's vector, second and third arguments in the same order on both. FM Lens calls it with
an empty vector and two zeros, as on arm64.

## game_ui: the static pointer

Every x86_64 call through a vtable +0xA0 was listed with the RIP-relative global loaded just before it. `0x5C8AC88`
is loaded before nine of them: `0x2564807`, `0x2564BC8`, `0x2564C76`, `0x2565004`, `0x256897D`, `0x256ABE0`,
`0x256B58A`, `0x256B611` and `0x295C0BF`. The arm64 sites that load `0x56D48B8` before +0xA0 sit in the same block of
editor actions, the first four at `0x238A628`, `0x238AA48`, `0x238AB14` and `0x238AF44`, spaced like the x86_64
sites.

The first site is the same on both:

- the object's slot +0x38 is called;
- bit 3 of the byte at +0x2E is set from the result;
- the global's slot +0xA0 is called with the object.

`0x5C8AC88` is in `__DATA`'s zero-fill part, so the game sets it at run time, like arm64 `0x56D48B8`.

## Identity offsets

`refresh_entity` takes player and staff identities from `layout-macos.toml`, which both architectures load. The
officials' come from their vtable at -0x18. The Intel work permit calls already pass identity blocks found this way,
and were checked under Rosetta on 6 November.

## Checks

- `cargo fmt --all --check`.
- `cargo test --locked -p fmlens-core`: 95 tests. A new test pins all three values on both halves; the Intel call
  count is now five.
- `cargo build --locked -p fmlens-probe -p fmlens-bridge`, and the release bridge for `x86_64-apple-darwin`: its
  allowlist for the Intel UUID has `0x308A0` and `0x2FA70`.

## Checked in FM

FM ran as x86_64 under Rosetta with the release bridge from this branch, on the disposable `FM Lens Batch 2026-11-05`
copy (Arsenal, 11 Dec 2027 16:30), as EDITING-VALIDATION.md describes. FM Lens was built from this branch. Each edit
showed on Declan Rice's profile, already open in FM, without Continue; the clock never moved:

- Finishing 11 to 15: FM showed 15 at once, with the change arrow. Undo: 11 again.
- Contract end 30/6/2030 to 30/6/2031: the profile header showed 30/6/2031 at once. Undo: 30/6/2030 again.

FM was quit without saving, and the copy's hash was unchanged.
