---
version: 1
slug: "app-src-app-tsx"
primary_target: "app/src/App.tsx"
related_targets: ["app/src/App.css"]
---

# The FMLibreEditor app

## Scope and mode

The whole desktop app interface (`app/src`) and the app icon, on Windows (WebView2) and macOS (WKWebView). Mode: Operate. No new features; behavior, texts and both languages stay.

## Audience and job

An FM27 player alt-tabs in from the full-screen game (or glances at a second monitor), finds a person, fixes a value, reviews it, applies it and goes back. The maintainer rejected two looks as AI-generic and asked for a distinct identity that stays calm, easy to use and harmonious in colour. FM's attribute colours stay; nothing else is fixed, the sidebar included.

## Direction contract

THESIS: The editor reads as a football season almanac, the yearbook that prints every squad as a table. Black ink, tight tables and big figures carry it; colour appears only where it means something. It refuses both the grey dashboard and the FM-skin imitation that came before.

OWN-WORLD: Cool white page (never cream) and near-black ink, hairline rules between rows, a thick ink rule over every section heading. One grotesque family (Archivo, bundled, the same on Windows and macOS): condensed bold for names, headings and big figures, regular width for text. Selection is reverse print, white on ink. Primary actions are ink-filled. A marker-yellow highlight marks an edit not yet applied, brick red marks danger, and FM's four bands are retuned as earthy inks. A night edition inverts the page.

STORY: The player opens the almanac at a section tab, finds the entry, marks a change in highlighter, applies it and returns to the game.

FIRST VIEWPORT: A masthead across the top: the FML mark, the section tabs (the open one joins the page), and at the right the in-game date, Reload and the language. Below it, the page: the search over a tight almanac table, the picked row in reverse print, and the player's entry opening beside it. A colophon at the foot carries the game and the notes: one line where both fit, the notes to the right. Where they do not (Turkish strings are often longer, and the minimum window is 960 wide), the notes take a second line of their own, so the advice on applying edits and backing up is never cut; the packs' note shows whole or not at all.

FORM: The season almanac (football yearbook), candidate 6 of 7 on the grounded list, assigned by the roll and chosen by the user; seed ac7aed80.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

Picking a player turns his row to reverse print, and his entry opens beside it like a page of the yearbook. Every change waits in highlighter until it is applied.

## Unresolved

- Whether Archivo's tabular figures hold in every table, or the numbers need a fallback.
