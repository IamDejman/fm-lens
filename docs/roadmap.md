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

## Phase 4: editing (in progress)

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
- [ ] Contracts and club finances.
- [ ] Mass editing with a preview.

## Phase 5: polish and reach

- Faces and logos from the user's graphics packs, pitch position map, comparisons,
  saved filters.
- Turkish and English UI; Steam and Epic builds; possibly Linux/Proton.
