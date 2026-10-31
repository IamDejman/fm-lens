# Roadmap

Each phase ends with something that runs. Release builds of FM27 move data around,
so every phase keeps game-specific addresses in data, not code, and checks them
before trusting them.

## Phase 0: reconnaissance (done)

- [x] Read-only probe: find `fm.exe`, tell Steam / Epic / Game Pass apart, attach,
  list modules, read `game_plugin.dll` headers from memory. Attaching to the Game
  Pass build works without administrator rights.
- [x] Locate the entity arrays (players, staff, clubs) in `game_plugin.dll` by
  scanning for `(begin, end)` pointer pairs and counting element vtables.
- [x] Confirm on the Game Pass build that object layouts match the Steam notes in
  `docs/recon/` (player, staff and club layouts).
- [x] Tauri app shell that builds and shows whether the game is detected.

## Phase 1: memory core (done)

- [x] Build profiles and object layouts as data files in `profiles/`, matched by
  the `game_plugin.dll` fingerprint.
- [x] Automatic calibration: check the profile's arrays, or find them by scanning
  when there is no profile or it does not check out, validated by decoding names.
- [x] Decoders for FM strings, name-table entries and dates.
- [x] First read-only player list in the app: search by name or UID, accents
  ignored.
- [x] Attribute scale and the rest of the player fields in the data model:
  attributes, positions, personality, reputation, caps, contract; player-coaches
  handled.
- [x] Player profile panel in the app.
- [x] Locate the in-game date; ages in the list and the profile.

## Phase 2: data model (done)

- [x] Players: names, ages, attributes, CA/PA, positions, personality, contracts.
- [x] Staff: names, ages, jobs, employers, attributes, personality, contracts,
  including the human manager.
- [x] Clubs: reputation, founding year, facilities, supporters, finances.
- Every field needs two independent confirmations before it becomes writable.

## Phase 3: read-only MVP (done)

- [x] Search and player / staff / club profiles in the app.
- [x] Player filters (position, age, CA/PA, nation, club, free agents, contract
  end) and sortable columns; staff filters (job, unemployed); club filter
  (men's / women's).
- [x] A local release build: `npm run release` in `app/` makes a stand-alone exe
  with its own icon, no installer. The first public release is the maintainer's
  call.

## Phase 4: editing (done)

- [x] Guarded writes, heap only. Editable fields for players are CA/PA,
  attributes, positions, personality, height, reputation and caps. For staff they
  are CA/PA, attributes, personality and reputation.
  - Every write re-checks the target and the field's range, and is read back.
  - Undo works when the game has not changed the value since.
  - The probe has `fields`, `get` and `set`. Each field was written, read back and
    restored live on the test save.
- [x] Editing in the app:
  - an Edit mode in the player and staff profiles that marks changed and
    invalid values;
  - a review of the pending changes;
  - a Changes view that logs every change of the session, with Undo.
- [x] Contracts and clubs, in the probe and the app:
  - player and staff contracts (wage, end date);
  - club reputation, facilities and finances.

  Each record is checked before it is written: a contract must point back at its
  owner, the senior team at its club, and finances must be the full finance record.
- [x] Mass editing with a preview:
  - **Targets:** the players, staff or clubs that the list's search and filters
    select, up to 10,000.
  - **Operations:** set a field, add to it, or change it by a percentage.
  - **Preview:** lists every old → new value and what is left alone.
  - **Apply:** writes exactly the previewed changes, each only while the game still
    holds the previewed value.
  - **Undo:** the whole batch at once, from the Changes view.

## Phase 5: polish and reach (in progress)

- [x] Turkish and English UI:
  - an EN | TR switch in the sidebar;
  - dates and numbers follow the language;
  - the connection and the change log survive the switch.
- [x] Pitch position map.
- [x] Pictures from the user's graphics packs:
  - club logos, flags and faces, in the lists and the profiles;
  - read from the packs' `config.xml` mappings in the FM27 graphics folder;
  - initials stand in where a pack has no picture.
- [x] Player comparisons and saved filters:
  - up to four players side by side, with the best value of each row marked;
  - player filters and sort saved under a name.
- [x] The Steam build on Windows (build 26227640), with its own build profile. Every
  release from here on is checked on both Game Pass and Steam.
- [ ] Epic; possibly Linux/Proton. macOS is set aside: it needs a Mac and its own
  memory access.

## Phase 6: Game Pass completeness (in progress)

- [x] Move a player to another club's senior team, on his contract or new terms,
  with undo. Nothing is allocated in the game, so the new club's squad list must
  have room in its block. Loans, free agents and players at a human manager's club
  are refused.
- [x] The rough edges of what shipped:
  - opening a mass edit asks about unapplied profile edits;
  - the Changes view pages and folds mass edits;
  - a language switch keeps the view, the filters and the open profile;
  - the Rust side's errors appear in Turkish too;
  - faces are checked with a test pack, and `FMLIBRE_GRAPHICS` points the app at
    another graphics folder.
- [x] Check in the game that moved players play for their new club and that the
  following days run normally. Arda Güler was moved to the human manager's club;
  the game ran on for several days and took a work permit application for him
  without trouble.
- [x] More of what FM Live Editor and FMRTE users reach for, as far as data-only
  writes allow:
  - a player's squad number, squad status, and transfer and loan listing;
  - swapping two players between clubs, with undo;
  - healing injuries, with undo; setting energy, match sharpness and morale, one
    player at a time or in a mass edit.
- [x] A squad tab in the club profile, like FM Live Editor's Teams tab:
  - each team's players with their fitness, morale, injuries and loans;
  - captain and vice-captain;
  - heal all, inspire all (morale to 20) and refresh all (energy and match
    sharpness to 100%), each undone as one batch.
- [ ] Next: team cohesion and tactical familiarity (FMLE's "Max Cohesion" and "Max
  Tactics"), suspensions ("Unban All"), and the squad status codes past 5 (youth
  and backup roles), once the game's own data names them.
