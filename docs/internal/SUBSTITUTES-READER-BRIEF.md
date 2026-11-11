# Brief: the substitutes reader

For a session on the Mac with FM27 running. Written 11 November 2026 from a cloud session that could not reach the
game; nothing in it was checked live that day.

The task: make FM Lens show a competition's substitution rule (changes allowed and substitutes named) from a source
checked against FM's screens. Reads only: nothing here needs a write to game memory. `AGENTS.md` applies (career copy,
main-career hash, diagnostics under `reports/`).

## The problem

The competition profile has two rows, `subs_allowed` (`SBal`) and `max_subs` (`SBmx`), in `RULES` in
`crates/fmlens-core/src/competitions.rs`. `Session::competition_rules` only reads top-level number and yes/no entries
of the competition's rule vector (`[competition]` `actual = 0xB0`, `rules = 0x50` in
`profiles/fm27/layout-macos.toml`). The recon never found those two keys there, so the rows are probably always blank.
Confirm that first on the Premier League (UID 11).

## Read before starting

- `docs/recon/fm27-competitions-awards-2.md`, section 2 (rule keys, node types, stage findings) and its open items 1
  and 2.
- `reports/batch/scratch/competitions/` if it is still on this Mac: `tags.py`, `stream.py`, `fourcc-dictionary.txt`,
  `tags-epl-ucl.txt`.

## Known, do not redo

- A value node is `[type pointer][payload]`: a number is a u32 at +8, a yes/no the low byte at +8. A list's payload
  points at an object holding `(begin, end, cap)` vectors of node pointers. Key and struct nodes are undecoded.
- `SBal` and `SBmx` occur 16 times, inside `sqsr` lists in the static rule data (`SBal` 5, 5, 4, 4, 3; `SBmx` 9, 8, 7,
  9, 8, 7). No link to a competition is known.
- `subr` holds a named rule set (`five_from_nine` and so on); its numbers are unmapped. `srdl` is the rule by division
  level.
- The Premier League's `fxri` (fixture rules index) is 6.
- `sicomps::LEAGUE_STAGE` has its competition at +0x70 and a `sicomps::LEAGUE_SETTINGS` at +0xF0. The Premier League's
  settings read (1, 5) at +0xC9..+0xCA and (1, 9) at +0xD1..+0xD2. One stage, unverified. Finding stages by vtable
  scan took 413 s.
- Not in `db::COMP`'s fixed bytes. `mgqm` is medals, not substitutes.
- Recon RVAs are for build 26340721 arm64. Check the running build; if it is 26385295, find classes by name with
  `fmlens-probe instances`, not by RVA.

## Establish, in this order

1. The layout of list, key and struct nodes: enough to walk `sqsr` and print each `SBal`/`SBmx` pair with the siblings
   that tell the pairs apart.
2. The path from a competition to its substitution rule: what the Premier League's rule vector links to, and where
   `fxri` 6 leads. If `subr` is the carrier, map its numbers to the rule set names.
3. Whether the stage settings bytes hold across stages, what cup and group stages hold, and a way to reach a
   competition's current stage in a few reads. A minutes-long scan cannot ship.
4. FM's own Rules screen for at least three competitions whose substitution numbers differ, one of them a cup. Record
   what FM shows beside each read.

## Choose the source

Prefer the stage values if they match FM for every competition checked and are cheap to reach, since they are what the
running season uses. Otherwise use the rule data path. If neither matches FM, do not ship a guess: record what was
found and stop.

## Then implement

- Offsets as optional keys in `[competition]` (`CompetitionLayout` in `crates/fmlens-core/src/profile.rs`), macOS arm64
  only. Do not copy them to Intel or Windows; note the gap in `docs/internal/WINDOWS-PARITY-HANDOFF.md`.
- Keep the keys `subs_allowed` and `max_subs` so the existing en, es and tr labels apply. Fail closed: class and bounds
  checks, small plausible numbers, no rows where anything does not check out.
- Unit tests for the parsing that needs no game.
- Check the rows in the built app against the same competitions.
- Update the recon note, the Competitions row of `docs/ROADMAP.md` and `docs/EDITING-VALIDATION.md` with exactly which
  checks ran.
- Run the checks in `AGENTS.md`, "Build and verification".

## Out of scope

Editing any rule, VAR, goal-line technology, awards and referee attributes.

## Branch and report

Work on a new branch from `origin/main`. Report back: the node layouts, the path, a table of FM against FM Lens for
each competition checked, which source was chosen and why, and what stayed unproven. Remove this file in the change
that lands the reader.
