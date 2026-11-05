# Checking a new FM build

FM Lens only writes to a build it has a profile for (`profiles/fm27/`, matched by game_plugin's LC_UUID). When FM
updates, the new build is read-only until it passes the steps below. Each step says what it proves; none of them is
skipped because an earlier build passed.

## 1. Read checks (no writes, a few minutes)

Load any career in FM, then run:

```bash
scripts/check-build.sh
```

The script runs the probe, which cannot write, and keeps every output under `reports/build-check/<UUID>-<time>/` with
a `summary.md`. It exits 0 only when every step passes:

| Step | Passes when |
| --- | --- |
| info | the probe reads the game and its game_plugin UUID |
| profile | FM Lens has a profile for that UUID |
| health | every pre-write check passes (`crates/fmlibre-core/src/health.rs`) |
| scan | scanning, without the profile, finds the player, staff and club arrays |
| arrays match | the arrays scanning finds are the ones the profile names |
| player, staff, club, teams, nation, officials, cohesion | each reader decodes a known entity |
| fields-player, fields-staff, fields-club | every editable field reads on every object |

The known entities are Bukayo Saka, Nicolas Jover, Arsenal, England and Michael Oliver, which every FM27 database
holds. Set `PLAYER`, `STAFF`, `CLUB`, `NATION` or `OFFICIAL` to use others, `--pid` when two games run, and `--probe`
for another probe binary.

## 2. New UUID, same layout

A small patch often rebuilds game_plugin without changing its objects: the UUID and the static RVAs change, the
layouts do not. If `profile` fails and every other step passes:

1. Copy the closest profile to `profiles/fm27/<storefront>-<build>-<platform>.toml` with the new UUID and name.
2. Take the arrays from `scan.txt`, and the in-game date's RVA from `fmlibre-probe find "<date FM shows>"`
   ([macOS notes](recon/fm27-steam-macos.md#2700-steam-build-26340721)).
3. The profile's other values (retirement manager, officials, human manager) were traced in the old build's code:
   re-trace each as its comment says, or leave it out, which turns that feature off on this build.
4. Run the script again. It must pass in full.

## 3. A step fails

Keep FM Lens read-only on the build; do not add a profile. A failing check names what moved:

- `health` lists the checks that failed and how many samples fit. Fix the layout (`profiles/fm27/layout*.toml`) for
  that group, by the method in [DEVELOPING.md](DEVELOPING.md) for a new build, then run the script again.
- A reader failing alone (for example `nation`) means its own offsets or root moved. Its feature can ship read-only or
  off while the rest passes.

## 4. Write checks (a copy of a career, in FM)

Only after step 1 passes in full. On a copy of a career, never the main one (hash the main career before and after):

1. Connect FM Lens and edit one field of each group: a player attribute, a player's contract wage, a member of staff's
   attribute, a club's balance, a nation's reputation.
2. Read each back with the probe, then check FM shows it after Continue.
3. Undo one edit in Changes and read it back.
4. Save the copy under a new name, quit FM, relaunch, load it, and check FM shows each saved value.

Record what ran in [EDITING-VALIDATION.md](EDITING-VALIDATION.md), with the build and the date, and only then merge
the profile.
