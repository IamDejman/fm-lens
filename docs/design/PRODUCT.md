# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Football Manager 27 players, on Windows (Xbox / Game Pass and Steam builds) and macOS (Steam
build). The main scene is a quick fix between game sessions: FM runs full screen, the player
switches to the editor (Alt-Tab, Cmd-Tab) or glances at it on a second monitor, changes a few
things (heals an injury, lifts morale, adjusts a contract, edits one player) and goes back to
the game. Longer sessions (searching, comparing, mass edits) also happen, but are secondary.

## Product Purpose

A free, open-source real-time editor for FM27. It attaches to the running game, lists every
player, member of staff and club of the loaded save, and edits them in the game's memory.
Success is a change made in seconds, with confidence that it landed and can be undone, and a
quick return to the game.

## Positioning

In the spirit of FMRTE and FM Live Editor, but free and open source (GNU GPL 3 or later). It
writes only after checking that the game's memory still holds what it expects, shows every
change for review before applying it, and undoes it from a change log. On macOS it works
without turning System Integrity Protection off.

## Operating Context

- A desktop app (Tauri): WebView2 on Windows, WKWebView on macOS. The window opens at
  1280×800, with a minimum of 960×600. It is used as a large window alternating with the
  full-screen game, or on a second monitor beside it.
- The game's screens show a change after the player presses Continue in FM.
- Offline: no network. Club logos, flags and faces come from the graphics packs in the user's
  FM graphics folder; many users have none, and initials stand in.
- The interface is in English, Turkish and Spanish; Turkish and Spanish strings are often
  longer.
- `npm run dev` in `app/` serves the interface in a plain browser with sample data; `?macos`
  previews the macOS bridge panel.

## Capabilities and Constraints

- Sections: Players, Staff, Clubs and Changes, plus the connect panel (and on macOS, the
  bridge setup).
- Lists: search by name or UID, filters, sortable columns, saved filters, and mass edits with
  a preview.
- Profiles: players, staff and clubs, with attributes, positions on a pitch map, personality,
  contracts, injuries, reputation, facilities and finances; a club's squad tab with captains,
  fitness, morale and team-wide actions.
- Editing: an Edit mode in profiles (change, review, apply), a Changes view with undo, moves
  and swaps between clubs, and comparisons of up to four players.
- The current interface work adds no features.
- The data is the user's save: writes stay deliberate and reviewable.

## Brand Commitments

- Name: FMLibreEditor. Beta. Plain, short-sentence voice in English, Turkish and Spanish.
- FM's attribute colours (by value band) and the pitch position map stay: players read
  attributes and positions the way FM shows them. Their exact tones may change to sit in
  the app's palette.
- The look has an identity of its own, never a generic dashboard, and stays calm: the
  maintainer rejected two looks as AI-generic (a grey-green dashboard, then an imitation of
  FM's own skin). Colours are chosen to work together.
- Letters in the app icon or logo are "FML".

## Evidence on Hand

- App icons in `app/src-tauri/icons`.
- No logo beyond the app icon, and no testimonials, user counts or press: none may be
  invented.

## Product Principles

1. Back to the game fast: the common fixes are a few clicks from where the player already is.
2. The game's own language: values read as in FM (attribute colours, positions, dates,
   money), so nothing needs translating in the head.
3. Every write is deliberate: a change is visible before it lands and easy to undo.
4. The data leads: lists and profiles carry the information, and the chrome stays out of its
   way.
