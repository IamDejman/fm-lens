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

## Phase 1: memory core (in progress)

- [x] Build profiles and object layouts as data files in `profiles/`, matched by
  the `game_plugin.dll` fingerprint.
- [x] Automatic calibration: check the profile's arrays, or find them by scanning
  when there is no profile or it does not check out, validated by decoding names.
- [x] Decoders for FM strings, name-table entries and dates.
- [x] First read-only player list in the app: search by name or UID, accents
  ignored.
- [ ] Attribute scale and the rest of the player fields in the data model.
- [ ] Locate the in-game date, for ages.

## Phase 2: data model

- Players, staff and clubs: names, ages, attributes, CA/PA, positions, personality,
  contracts, club finances.
- Every field needs two independent confirmations before it becomes writable.

## Phase 3: read-only MVP

- Search, filters and player/staff/club profiles in the app. First public release.

## Phase 4: editing

- Writes with validation, pending-changes review, undo history and a change log.
- Mass editing with a preview.

## Phase 5: polish and reach

- Faces and logos from the user's graphics packs, pitch position map, comparisons,
  saved filters.
- Turkish and English UI; Steam and Epic builds; possibly Linux/Proton.
