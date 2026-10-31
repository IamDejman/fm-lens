---
name: FMLibreEditor
description: A real-time FM27 editor that reads as one more screen of Football Manager.
colors:
  rail: "#0b0d13"
  ground: "#11131b"
  panel: "#181b25"
  raised: "#212533"
  hover: "#272c3c"
  field: "#0f1118"
  zebra: "rgb(255 255 255 / 0.025)"
  rule: "#2a2f40"
  rule-strong: "#3a4157"
  ink: "#eceef4"
  ink-muted: "#9ba2b7"
  royal-blue: "#3170f0"
  royal-blue-hover: "#4380f7"
  royal-blue-text: "#86adff"
  royal-blue-soft: "rgb(49 112 240 / 0.26)"
  royal-blue-faint: "rgb(49 112 240 / 0.1)"
  title-strip: "#2254c9"
  on-accent: "#ffffff"
  pending-gold: "#e8b84a"
  pending-gold-soft: "rgb(232 184 74 / 0.16)"
  danger-red: "#f2675f"
  danger-red-soft: "rgb(242 103 95 / 0.14)"
  scrim: "rgb(5 6 10 / 0.66)"
  tier-1: "#ef5f57"
  tier-2: "#eaa53c"
  tier-3: "#bcd45c"
  tier-4: "#4fca91"
  on-tier: "#11131b"
typography:
  figure:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum"
  headline:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.2px"
  title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "-0.1px"
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  body-dense:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
  small:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "11.5px"
    fontWeight: 700
    letterSpacing: "0.5px"
  mono:
    fontFamily: "Cascadia Mono, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  tight: "3px"
  base: "4px"
  panel: "6px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body-dense}"
    rounded: "{rounded.base}"
    padding: "5px 12px"
    height: "30px"
  button-hover:
    backgroundColor: "{colors.hover}"
  button-primary:
    backgroundColor: "{colors.royal-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.base}"
    padding: "5px 12px"
    height: "30px"
  button-primary-hover:
    backgroundColor: "{colors.royal-blue-hover}"
  button-danger:
    textColor: "{colors.danger-red}"
    rounded: "{rounded.base}"
    padding: "5px 12px"
  button-on-strip:
    textColor: "{colors.on-accent}"
    rounded: "{rounded.base}"
  edit-toggle-on:
    backgroundColor: "{colors.pending-gold-soft}"
    textColor: "{colors.pending-gold}"
  nav-item:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.base}"
    padding: "0 10px"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.royal-blue}"
    textColor: "{colors.on-accent}"
  title-strip:
    backgroundColor: "{colors.title-strip}"
    textColor: "{colors.on-accent}"
    typography: "{typography.title}"
    height: "52px"
  search-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "0 12px"
    height: "36px"
  edit-input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "2px 6px"
  edit-input-changed:
    backgroundColor: "{colors.pending-gold-soft}"
  edit-input-invalid:
    backgroundColor: "{colors.danger-red-soft}"
  table-header:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    padding: "0 12px"
    height: "34px"
  table-row:
    textColor: "{colors.ink}"
    padding: "4px 12px"
    height: "36px"
  table-row-selected:
    backgroundColor: "{colors.royal-blue-soft}"
  tag:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.tight}"
    padding: "0 6px"
  panel-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "22px 24px 24px"
  dialog:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
  dialog-head:
    backgroundColor: "{colors.raised}"
    padding: "14px 20px 12px"
  profile-tab:
    textColor: "{colors.ink-muted}"
    padding: "8px 14px"
  profile-tab-selected:
    textColor: "{colors.ink}"
---

# Design System: FMLibreEditor

## Overview

**Creative North Star: "One More Screen of Football Manager"**

The editor speaks Football Manager's own interface grammar, so a player who alt-tabs in from the full-screen game is already fluent. Deep indigo-charcoal grounds, a solid royal-blue title strip with white type, dense zebra tables, panels headed by ruled strips of small capitals, and FM's four attribute bands. Every screen has one lead: the search field over the squad table, the profile head with its two ability figures, the gold of what waits to be applied.

Density is high and deliberate. Rows are 36px, attribute rows 26px, one system sans at a tight scale, 1px rules, small corners. Colour is a vocabulary, not decoration: royal blue is what is picked and the main action, gold is an edit not yet applied, red is danger, and the four bands rate a 1–20 value. Everything else is ink on indigo. The editor reads no club's kit colours; FM's club-coloured title bar becomes the editor's own blue strip.

The world refuses the category default: a dark dashboard of identical grey cards with neon pills. It runs in a dark theme and a light theme that follow the OS, with the same roles in both.

**Key Characteristics:**
- Stepped indigo grounds (rail, ground, panel, raised) carry depth; panels, cards and tables cast no shadow.
- A 52px royal-blue title strip, level with the sidebar's brand block, so the two read as one band.
- Dense FM squad tables: raised uppercase header row, zebra rows with no rules between them, selection in royal blue.
- 1–20 values coloured by FM's four bands; the position pitch in the same bands.
- Gold marks pending edits everywhere they appear: the input, the profile head's rule, the count, the Edit toggle.
- One system sans; tabular digits in every column of numbers.

## Colors

A cool indigo-charcoal neutral field with four meaning-bearing hues and FM's four rating bands. Frontmatter values are the dark theme; the light theme (under `prefers-color-scheme: light`) redefines every role with the same meaning, and its values are recorded in the sidecar.

### Primary
- **Royal Blue** (`royal-blue`): the main action of a place (primary buttons, Edit), the active section in the rail, the pressed half of a segmented switch, the captain badge, the selected tab's underline. Its **soft** wash marks the picked table row and a pressed Compare; its **faint** wash marks the best value of a comparison row and the row Enter will pick, faint enough for text and chips to keep contrast. **Royal Blue Text** is the readable form for focus rings, outlined badges and the caret.
- **Title Strip Blue** (`title-strip`): the solid strip across the top of the main area, one step deeper than Royal Blue so its white type holds contrast.

### Secondary
- **Pending Gold** (`pending-gold`): an edit not yet applied, and nothing else. Changed inputs (tint plus a doubled gold border), the 2px rule under a profile head while editing, the pending-change count, and the Edit toggle while it is on.

### Tertiary
- **Danger Red** (`danger-red`): removal and failure. The outlined danger button, invalid inputs, error banners and bars, negative amounts.
- **Rating Bands** (`tier-1` to `tier-4`): FM's colours for 1–5, 6–10, 11–15 and 16–20, kept from the incumbent design as a product commitment. A rating is the number itself in its band's colour, bold. The position pitch uses the same bands for natural, accomplished and lesser positions, and its grass is a faint `tier-4`.

### Neutral
- **Rail** (`rail`): the sidebar, the deepest ground.
- **Ground** (`ground`): the app background behind lists.
- **Panel** (`panel`): profiles, cards, dialogs.
- **Raised** (`raised`): what sits on a panel: table headers, profile heads, dialog heads, the edit footer, default buttons, menus.
- **Hover** (`hover`): the hover state of rows and buttons.
- **Field** (`field`): inputs, a step below the panel they sit on.
- **Zebra** (`zebra`): every other row of a table or a value list.
- **Rule / Rule Strong** (`rule`, `rule-strong`): 1px dividers; the strong rule under table headers and group headings and around controls.
- **Ink / Ink Muted** (`ink`, `ink-muted`): text and secondary text.
- **Scrim** (`scrim`): the dimmed app behind a dialog.

The supporter-mix bar carries six fixed categorical hues (`--mix-1` to `--mix-6`, see sidecar), one per kind of supporter, used only in that bar. A club with no logo gets an initials badge in its name's hue at fixed 50% saturation and 30% lightness.

### Named Rules
**The Meaning-Only Rule.** Colour always means something: blue is picked or primary, gold is pending, red is danger, the bands rate a value. A hue that carries none of these is not added.

**The Gold Waits Rule.** Gold appears only on what has been changed and not yet applied. When the change lands or is dropped, the gold goes.

**The Strip Rule.** On the title strip everything is white; secondary text is the same white dimmed (68–85% opacity), never grey. Buttons on the strip are white-outlined and transparent.

## Typography

**Display Font:** none; the system sans carries every role.
**Body Font:** Segoe UI Variable Text / Segoe UI on Windows, SF via `system-ui` on macOS.
**Label/Mono Font:** Cascadia Mono, SF Mono, Menlo, Consolas, for UIDs and the launch option only.

**Character:** The platform's own UI sans, as a desktop tool in Operate mode should be. Hierarchy comes from weight (600 and 700 dominate) and a tight size scale, not from a display face.

### Hierarchy
- **Figure** (700, 24px, 1.1, tabular): current ability in a profile head; potential ability at 20px weight 600 muted beside it.
- **Headline** (700, 22px, 1.2, -0.2px): the person's or club's name in a profile head. The connect card heading sits at 19px.
- **Title** (700, 17px, -0.1px): the section name on the title strip and dialog heads.
- **Body** (400, 14px, 1.45): the app default; nav items at 600; ratings at 14px 700.
- **Body Dense** (13px, 1.3): buttons (600), value lists, attribute rows, edit flags.
- **Small** (12px, 1.4): notes, sub-lines in table cells, the sidebar note; 11.5px for tags and counters.
- **Label** (700, 11.5px, 0.5–0.6px tracking, uppercase): table header cells, the ruled heading of a profile group, comparison group and move-dialog section, and the CA/PA abbreviations.

### Named Rules
**The One Sans Rule.** One system sans at a tight scale (11.5–24px). No web font, no display face.

**The Tabular Digits Rule.** Tables, value lists, abilities and figures use `tabular-nums`, numbers right-aligned so digits line up down every column.

## Layout

A fixed grid: a 216px sidebar rail, then the main column. The main column opens with the 52px title strip (section name left, in-game date and Refresh right), then the workspace. A workspace is the list (min 240px) and, when a row is picked, the profile beside it (flex basis 560px, min 440px; a club profile on its squad tab widens to 880px). Lists stay mounted when hidden so search, scroll and selection survive switching sections.

The list adapts by container queries on the table's own width, not the window: columns drop in a fixed order (Born and UID, then Contract, Nation, Positions). Beside an open profile the players list narrows to name, positions and CA; at its narrowest (the 960×600 minimum window) it keeps name and CA. Names stay on one line and never wrap; columns drop before a name gives way, and only then is it cut with an ellipsis, the whole text in the hover.

Profile bodies lay groups in three equal columns (attributes) or two (split facts), with 12–16px gutters and 22px between stacked blocks. Spacing steps are 4, 6, 8, 12, 16, 20, 24px; padding of 14px appears at the workspace and profile head. A window shorter than 640px lets the comparison head scroll away.

### Named Rules
**The Columns Go First Rule.** When room runs out, whole columns drop; the name and CA are the last to leave.

## Elevation & Depth

Flat by default. Depth is tonal: rail, ground, panel, raised, each a step lighter (in light theme, the panel is white on a cool grey ground), with 1px rules between. Panels, cards, tables and the profile cast no shadow. Inset 1px rings are not elevation: they double a border (a changed or invalid input, the club badge's edge, the search field's focus).

### Shadow Vocabulary
- **Dialog** (`box-shadow: 0 18px 48px rgb(0 0 0 / 0.45)`): dialogs over the scrim.
- **Menu** (`box-shadow: 0 10px 28px rgb(0 0 0 / 0.4)`): the squad row menu hanging over the window.

### Named Rules
**The Overlay Exception Rule.** Only overlays (dialogs and menus) cast a shadow, offset and blurred, because they float over the page. Everything on the page is flat.

## Shapes

Small corners, square geometry. Buttons, inputs, nav items, switches and banners are 4px; tags, badges, counters and menu items 3px; cards and dialogs 6px. Segmented switches (EN | TR, move or swap, squad teams) are one 4px frame of square-cornered halves split by a 1px rule. Circles are kept for faces, initials and the connection dot; club badges are rounded squares (22%). The supporter-mix bar is a 12px bar with 2px corners and 2px gaps. No full-radius pills.

## Components

### Buttons
Raised ink, dense and square.
- **Shape:** gently cornered (4px), min height 30px, 13px weight 600.
- **Default:** raised fill with a strong 1px rule; hover steps to the hover ground, active to the rule colour. Transitions on colour only, 120ms ease-out.
- **Primary:** Royal Blue fill, white text; hover lightens. One per place: Connect, Apply, Edit.
- **Danger:** transparent with a red outline and red text, for what removes or drops.
- **On the strip:** transparent with a 45% white outline; hover is a 14% white wash.
- **Focus:** 2px Royal Blue Text outline, 2px offset. Disabled is 50% opacity.
- **Edit toggle:** primary blue until pressed, then gold outline, gold text and gold wash, as the edits it leaves.

### Chips and Tags
- **Tag:** outlined, square-cornered (3px), 11.5px weight 600, muted; the "you" tag is solid blue.
- **Role badge:** C is solid Royal Blue, VC outlined in Royal Blue Text.
- **Comparison chip:** a tag-like chip per picked player in the tray under the list.

### Cards / Containers
- **Corner Style:** 6px.
- **Background:** Panel on Ground.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px Rule.
- **Internal Padding:** 22px 24px 24px for the connect card; facts inside are label-value rows on zebra stripes.

### Inputs / Fields
- **Style:** Field fill (a step below its panel), 1px Rule Strong, 4px corners. Search is 36px tall with a muted stroke icon; edit inputs size to their digits and drop spin buttons.
- **Focus:** search gains a Royal Blue border plus a 1px blue ring; filter fields a 1px blue outline; edit inputs a 2px Royal Blue Text outline.
- **Changed:** gold border, gold wash and an inset gold ring.
- **Invalid:** the same in red.

### Navigation
- **Rail:** 36px items, 14px weight 600, muted, 18px stroke icons; hover is raised fill with ink text; the active section is solid Royal Blue with white text. A change counter sits at the row's end.
- **Profile tabs:** muted 600 text over a 1px rule; the open tab is ink with a 2px Royal Blue underline.
- **Segmented switch:** a field-coloured frame; the pressed half is solid Royal Blue.

### Squad Table (signature)
FM's squad table: sticky 34px raised header in uppercase labels, sortable by header buttons with an arrow; 36px zebra rows with no rules between them; hover fills the row; the row whose profile is open is the Royal Blue wash; focus is an inset 2px outline. CA and PA are bold tabular figures, right-aligned.

### Profile Head and Attribute Groups (signature)
The head is a raised band: name large, meta muted under it, CA and PA as figures at the right with the actions. Groups are headed by a ruled strip of small capitals; rows are 26px label-value pairs on zebra stripes, the value coloured by its band. While editing, a 2px gold rule runs under the head and a raised footer holds the count and Review, Discard, Apply, Done.

### Dialogs and Menus
6px panel boxes on the scrim, with a raised head band, a scrolling body (16px 20px) and a foot. They and the squad row menu carry the overlay shadows.

## Do's and Don'ts

### Do:
- **Do** give every screen one lead: the search field over the table, the profile head, or the gold of pending edits.
- **Do** colour 1–20 values by FM's four bands (`tier-1` to `tier-4`), as the number itself, bold.
- **Do** mark the picked row, the active section and the main action in Royal Blue, and nothing decorative.
- **Do** show every pending edit in gold until it is applied or dropped.
- **Do** carry depth with the ground steps (rail, ground, panel, raised) and 1px rules.
- **Do** keep numbers in `tabular-nums`, right-aligned.
- **Do** drop whole columns before a name wraps or is cut.
- **Do** keep white type on the title strip, secondary text as dimmed white.

### Don't:
- **Don't** put shadows on panels, cards, tables or the profile; only dialogs and menus cast one.
- **Don't** use gold for anything but an edit not yet applied.
- **Don't** read club kit colours into the chrome; the strip is always the editor's own blue.
- **Don't** build a dashboard of identical grey cards with neon pills; no full-radius pills.
- **Don't** add a web font or display face; the system sans carries every role.
- **Don't** round corners past 6px on any rectangle.
