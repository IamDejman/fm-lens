# FM Lens interface

A record of one scoped refinement, not a new visual system mandate. The user
asked for the desktop app to look close enough to Football Manager 27 to be
recognised at once, and for editing to be seamless. The existing screens,
routes, features, offline use and FM Lens branding were kept.

## Visual treatment

- Own assets only: the FM Lens logo and the self-hosted Archivo face. No FM
  images, fonts or club colours are copied or read.
- A dark plum masthead in both lightings, with white navigation and a violet
  underline under the open tab.
- Compact, operational surfaces. Light: pale cool window, white panels, slate
  text. Dark: deep navy window, charcoal panels. Violet marks the main action and
  the picked row; amber, green and red keep their meaning (pending, applied,
  danger). Blue remains the keyboard focus ring.
- Tables and stat rows are dense and faintly striped. A profile has one raised
  header for identity, club, nation, age and abilities, then FM's attribute
  groups as small-capital labels over thin dividers, with 1–20 colour bands and
  lower-is-better reversal unchanged.
- System, Light and Dark, the zoom levels and saved preferences work as before.

## Direct scalar editing

- While a profile is read, a mapped, non-pointer value the game has a value for
  is a button. Clicking it, or Enter/Space on it, begins editing and focuses
  that field's input in the same profile, with number and text contents
  selected.
- The Edit button remains, for discoverability and batch edits.
- Editing always starts from a fresh read; nothing is written until Apply. The
  review list, expected-value check, build and career guards, readback and
  conditional undo are unchanged.

## Native verification

Mouse and keyboard direct activation, selection, pending navigation guard,
review/apply/undo, light at 125% and dark at 150% were exercised on the desktop
build. A 150% overflow was fixed with list-pane scrolling and masthead wrapping,
then confirmed natively. See EDITING-VALIDATION.md for the exact evidence and
remaining game-data limits.
