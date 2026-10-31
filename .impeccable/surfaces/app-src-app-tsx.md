---
version: 1
slug: "app-src-app-tsx"
primary_target: "app/src/App.tsx"
related_targets: ["app/src/App.css"]
---

# The FMLibreEditor app

## Scope and mode

The whole desktop app interface (`app/src`): sidebar, title strip, lists, profiles, edit mode, dialogs, the Changes view and the connect panel, on Windows (WebView2) and macOS (WKWebView). Mode: Operate. No new features; behavior, texts and both languages stay.

## Audience and job

An FM27 player alt-tabs in from the full-screen game (or glances at a second monitor), finds a person, fixes a value, reviews it, applies it and goes back. Pain named by the user: everything looks the same, so nothing leads. Must stay: FM's attribute colours with the pitch position map, and the left sidebar.

## Direction contract

THESIS: The editor reads as one more screen of Football Manager, so the player alt-tabs in already fluent. It refuses the category default, a dark dashboard of identical grey cards with neon pills, and gives every screen one clear lead.

OWN-WORLD: Deep indigo-charcoal panels, a solid title strip in the editor's own royal blue with white type, gold for pending edits, red for danger, FM's four attribute bands. One system sans at a tight scale, dense zebra tables, 1px rules, small corners, no shadows, no pills. FM's club-colour title bar becomes the editor's own strip: the editor reads no kit colours.

STORY: The player finds a person by name, sees him the way FM shows him, changes a value, reviews the change, applies it and is back in the game.

FIRST VIEWPORT: Left, the section rail. Top, the title strip: the section name on the left, the in-game date and Refresh on the right. Below, the search field over a dense FM squad-style table. Picking a row opens the profile on the right while the list narrows to name, position and CA.

FORM: Football Manager's own interface grammar, candidate 4 of 7 on the grounded list, chosen by the user from the safer re-roll; seed 9da5ffb0.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

Alt-tabbing from FM into a screen that already speaks FM: the title strip, the squad table and the attribute panel look like home.

## Unresolved

- Whether the profile should replace the list on narrow windows (960px) instead of sharing the width.
