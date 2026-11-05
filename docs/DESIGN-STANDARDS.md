# FM Lens design standards

The rules every screen follows. The tokens live at the top of `app/src/App.css` (`:root` for light,
`:root[data-appearance="dark"]` for dark). New UI uses the tokens, never raw values.

## Who it is for

Football Manager players editing a running career. Many are not technical. They come in, find a person,
change a value, go back to FM. The app has to be quick to scan, quick to search, and hard to get wrong.

## Colour

| Token | Use |
|---|---|
| `--bg`, `--panel`, `--raised`, `--hover`, `--field` | Window, panels, headers/pressed controls, hover, inputs |
| `--text`, `--muted` | Body text; secondary text (still 4.5:1 on every surface) |
| `--border` | Dividers only (decorative) |
| `--border-strong` | Field and control edges (3:1 on `--field` in both themes) |
| `--accent` | The main action and what is picked. One primary button per area |
| `--accent-text` | Keyboard focus only |
| `--pending`, `--pending-soft`, `--on-pending` | An edit not yet applied |
| `--danger`, `--ok` | Errors and destructive actions; success |
| `--tier-1..4`, `--on-tier` | FM's attribute bands 1-5, 6-10, 11-15, 16-20 |
| `--strip` | The masthead, dark plum in both themes |

Rules:

- Colour never carries meaning alone: a band also has its number, a pending edit also has its count.
- Every text pair is at least 4.5:1, every control edge at least 3:1, in light and dark.
- Don't add a token for one screen. If a new meaning is needed, add it here first.

## Type

One family: Archivo (variable). The scale is fixed; 11px is the floor.

| Token | Size | Use |
|---|---|---|
| `--type-xs` | 11px | Tags, small labels, units |
| `--type-sm` | 12px | Secondary lines, table IDs, group headings |
| `--type-base` | 13px | Body, tables, controls |
| `--type-md` | 14px | Tabs, names in lists |
| `--type-lg` | 16px | Section titles, key numbers |
| `--type-xl` | 20px | Profile names in compact views |
| `--type-2xl` | 24px | Dialog titles |
| `--type-3xl` | 28px | Page titles, CA/PA in a profile header |

- Numbers in columns use `font-variant-numeric: tabular-nums`.
- IDs never get thousands separators. Counts and money always do (`Intl` via `format.ts`).
- Sentence case everywhere. Uppercase only for table headers, group headings and tags.

## Space, size, shape

- Spacing steps: 2, 4, 6, 8, 12, 16, 24px. Prefer 4, 8, 12.
- Controls are at least 30px tall; icon buttons 30px; nothing clickable under 24px.
- Corners: `--radius` (4px) for controls and panels, 2-3px for tags and chips, 50% only for dots.
- Shadows only on things that float: menus, dialogs, the tour.

## Layout

- Masthead (brand, sections, career, date, Reload, settings), then the workspace, then the status bar.
- Workspace: a list on the left, the open profile on the right. The edge between them can be dragged.
- Container queries, not media queries, decide the layout, so zoom (80-150%) behaves like a smaller window:
  - masthead under 1100px: brand mark only; under 900px: the sections take their own row;
  - workspace under 800px: the profile replaces the list, Escape goes back with focus on the row.

## Components

- **Buttons**: text says what happens ("Apply 3 changes", "Release"). One `primary` per area.
  Disabled buttons say why in a `title` when the reason isn't obvious (read-only, nothing to apply).
- **Lists**: search first, then filters, then the table. 200 rows, best first. The count says how many match.
- **Profiles**: header (picture, name, club, nation, vitals, CA/PA), actions, then groups. Values that can be
  edited are buttons that start editing at that field. A profile with 4 or more top-level groups gets the
  section bar (`SectionJump`): it stays at the top and links to each group. New groups appear in it by
  being a `section.profile-group` with an `h3` directly in the profile body.
- **Dialogs**: `useModal` (focus trap, Escape, focus returns to the opener). Title says the action.
  Footer: primary action first, then Close.
- **Banners**: `className="banner" role="alert"`. Say what went wrong and what to do.
- **Notes**: `role="status"` for outcomes ("3 changes applied").

## Keyboard

| Keys | Does |
|---|---|
| ⌘1 to ⌘9 (Ctrl elsewhere) | Players, Staff, Clubs, Nations, Competitions, Awards, Stadiums, Officials, Changes |
| ⌘F | Search box of the open list |
| Up / Down, Home / End | Move between rows |
| Enter or Space | Open the focused row |
| Escape | Close a menu or dialog; leave edit mode; close the profile |
| ⌘S | Apply the edits of the profile being edited |

- One Tab stop per composite widget (table, tab list, menu); arrow keys move inside it.
- Every focusable thing shows the `:focus-visible` ring.
- Dialogs swallow the app shortcuts while open.

## Motion

- Motion answers an action: a profile slides in, a pending value pulses. Nothing moves on its own.
- `prefers-reduced-motion` removes animations and transitions.

## Copy

Write like the user types: short, plain, direct. See also `app/src/i18n/en.ts`.

- Say what happens, not how it works. "Changes show in FM after you press Continue."
- No taglines or helper text. If a screen needs a paragraph to make sense, fix the screen.
- No em dashes. Use a comma, colon, period or " - ". Empty values show "-".
- Same word for the same thing everywhere: Apply/applied, Undo/undone, Release/released.
- Errors say what happened and what to do. They don't apologise.
- Every string goes through `i18n/en.ts`, mirrored in `es.ts` and `tr.ts`. No English in TSX.

## Accessibility checklist for a new screen

- Inputs have a visible label or `aria-label`; icon buttons have `aria-label`.
- Contrast checked in both themes.
- Works with the keyboard alone, including leaving the screen.
- Errors use `role="alert"`, outcomes `role="status"`.
- Truncated text has a `title` with the full value.
- Checked at 80%, 100% and 150% zoom, and at 960x600.
