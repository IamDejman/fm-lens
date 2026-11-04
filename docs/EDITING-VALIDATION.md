# FM Lens editing validation

Date: 4 November 2026. Target: FM27 Steam build 26340721, native ARM64,
module UUID `F4540355-2186-39CB-9119-C706A6A35346`.

This is a bounded test record, not certification of every mapped field or the
full requested editor. Source definitions are listed in [EDITOR-FIELDS.md](EDITOR-FIELDS.md).
Unimplemented and unverified features remain in [ROADMAP.md](ROADMAP.md).

## Copied-career edit and persistence

1. Copied the existing career to a separately named validation file. Kept the
   original file's SHA-256 locally under ignored `reports/`.
2. Loaded the validation copy in FM. Connected the native FM Lens desktop app;
   the browser indexed 30,314 players, 20,217 staff and 21,675 clubs.
3. Selected Bukayo Saka, UID 28122642. Baseline finishing was 15 in FM and 73 on
   FM's stored attribute scale. Other visible profile values matched FM.
4. Changed finishing to 16. The native input showed its pending red border;
   Apply reported one applied change. The separately compiled read-only probe
   read finishing 80, displayed as 16.
5. Used FM's Save Game As to create a new edited validation file with that value.
   Save completed successfully. The main career was not overwritten.
6. Opened Changes in FM Lens and undid the edit. History marked the change
   undone; the undo restored the original stored value. This undo was deliberately
   **not saved**, so the edited validation file retained finishing 16.
7. Quit FM completely and confirmed the process exited. Relaunched through
   Steam, opened Load Game and explicitly selected the edited validation file.
8. FM's reloaded Saka profile displayed **Finishing 16**. This establishes saved
   persistence of that one mapped attribute through a full process restart.
9. Advanced the copied career from 11:00 to 17:30 on 8 December 2027. Further
   multi-day, training, match and season-boundary checks remain open. The
   read-only probe still reported finishing 16 after advancement; a second
   post-advancement inspection in FM was not completed.

FM cached its profile display before the restart; simply navigating away and
back did not immediately reflect the live write. Do not infer a bad layout from
a cached display, or claim correctness from memory readback alone.

## Clone and portable templates

Exercised in the native app on the reloaded validation copy:

- Searched by UID, selected Saka and captured all five groups: 142 portable
  fields across CA/PA, attributes, personality, positions and traits.
- Saved the template in the local library.
- Imported a version-1 JSON template containing only finishing 73. Preview
  showed one player and one change, **16 -> 15**, with zero skipped fields.
- Applied the preview; the app reported one applied change. Undo batch reported
  one undone change, restoring 16. No main-career mutation was involved.
- Attempted to import `contract.wage`; the backend rejected it as an unsupported
  template field. Core tests also reject identity, nationality, unknown fields,
  invalid ranges, unsupported versions and empty templates.

This exercises a one-player batch. Multiple-target cloning, transfer between
different careers/builds, file-picker import and a full-squad persistence test
remain unverified. Templates are revalidated against each destination layout.

## Other checks and limits

- Staff attribute freeze could be enabled and disabled for Pep Guardiola in the
  native profile. It was left disabled. This verifies the control and command;
  natural attribute decline, long-term holding and restart behavior were not
  tested. Staff freezes are connection-local.
- Light and dark appearance rendered in the native app. A 125% zoom check found
  viewport/anchor scaling errors; layout coordinates and viewport heights were
  corrected. The rebuilt app was checked again at 125%: the footer stayed
  visible and Settings was anchored correctly within the window. Restored
  System appearance and 100% afterward.
- Full read-only field scans covered all searchable player, staff and club
  records. Eighteen players had sharpness below the inherited 35% lower bound;
  the mapped percentage now allows 0–100%. Some clubs use 255 in youth facility
  fields; its meaning remains unverified and those values remain guarded.
- The retirement class lookup incorporates upstream fix `b7a7cc5` for large Mac
  saves. Retirement mutations themselves have not been tested in FM.
- Known-build and career-storage checks apply to ordinary writes and undo.
  Single edits, bulk edits and undo compare expected/current values. They are
  not atomic game transactions. A career reload creates a fresh Session and
  discards unsafe cached history/previews.
- Repeated a bounded edit on the final build after advancement: finishing
  16 -> 17, one change applied, green readback border visible, Changes undo
  marked it undone, and the read-only probe confirmed finishing 16 again.
- The main career SHA-256 matched its baseline after the tests.
- No claim is made for complete transfers, full contract clauses, promises,
  youth intake, nations, competitions, awards, officials or special manager
  actions. Their Mac layouts and linked simulation behavior still need work.

## Reproducing checks

Use the commands in [AGENTS.md](../AGENTS.md). The frontend build, Rust formatting,
workspace tests, strict workspace/app Clippy checks and separate writable-memory
tests were run during implementation. The native bundle was built through Tauri
and signed ad hoc. Local logs and private diagnostic outputs stay in ignored
`reports/`; game saves and memory reports are not repository artifacts.

For isolated editor state, launch the development bundle with `FMLIBRE_DATA`
and `FMLIBRE_EXPORTS` pointing to local directories under `reports/`. This keeps
test freezes and exports separate from ordinary app state.

Next validation priorities: stale-draft/undo conflict in the native app, career
switch while connected, multi-target templates, staff/club/contract persistence,
structural operations, and a fresh Steam Offline Mode launch.
