# Roadmap

Each phase ends with something that runs. Release builds of FM27 move data around,
so every phase keeps game-specific addresses in data, not code, and checks them
before trusting them.

## Phase 0: reconnaissance (in progress)

- Read-only probe: find `fm.exe`, tell Steam / Epic / Game Pass apart, attach,
  list modules, read `game_plugin.dll` headers from memory.
- Locate the entity arrays (players, staff, clubs) in `game_plugin.dll` by scanning
  for `(begin, end)` pointer pairs and counting element vtables.
- Confirm on the Game Pass build that object layouts match the Steam notes in
  `docs/recon/`.
- Tauri app shell that builds and shows whether the game is detected.

## Phase 1: memory core

- Version profiles in data files: array RVAs, vtables, field offsets and encodings
  per build.
- Automatic calibration: re-find arrays and vtables after a patch, validated by
  decoding known fields (names, UIDs, dates).
- Decoders for FM strings, dates and attribute scales.

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
