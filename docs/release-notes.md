## Download

- **FM-Lens-0.5.3-macos-universal.dmg**: open it and drag **FM Lens** onto **Applications**.
- **FM-Lens-0.5.3-macos-universal.zip**: the same app, zipped.

Both run on Apple Silicon and Intel Macs. macOS only, with Football Manager 27 from Steam,
build 26340721 (27.0.0). Another FM build opens read-only until FM Lens has a profile for it.
There is no Windows build: this fork builds and checks the Mac app only.

The app is signed ad hoc, not notarized by Apple. The first time you open it from
Applications, macOS says it cannot check the app: open **System Settings › Privacy &
Security**, choose **Open Anyway** under the message about FM Lens, then open it again.

Before you start, save your career under a new name in FM and work on that copy. FM Lens
needs a small helper that FM loads at startup: save and quit FM, quit Steam, then choose
**Set up** under **One-time setup** in FM Lens. Start FM from Steam, load the copy, and
choose **Connect**.

**Coming from 0.5.0:** quit FM Lens, then drag this version onto **Applications** and
replace the old one. From 0.5.1 on, FM Lens updates itself when it opens.

## What's new in 0.5.3

- **FM Lens everywhere.** The name of the editor FM Lens started from is gone from its
  files, its settings and the helper FM loads through Steam. Your setup and settings move
  over by themselves: there is nothing to set up again, and a game that is already running
  keeps connecting.
- **Coming from 0.5.2:** FM Lens installs this update in the background. Choose **Relaunch
  to update** at the foot of the window when it suits you.

## In 0.5.2

- **Report a problem.** In the Settings menu. It opens a bug report on GitHub with the
  FM Lens version, the FM build, your Mac and the changes you made filled in. You read it
  and send it yourself; FM Lens sends nothing.
- **No more surprise Reload.** FM moves its data when it loads a save, and at times as the
  game goes on. FM Lens now reads the game again by itself when you come back to it, so
  editing keeps working instead of failing at Apply.
- **Updates wait for you.** FM Lens installs a new version in the background and no longer
  restarts on its own. Choose **Relaunch to update** at the foot of the window when it
  suits you, or the new version runs the next time you open FM Lens.

## In 0.5.1

- **FM Lens updates itself.** When a newer version is out, FM Lens installs it as it opens
  and restarts, which takes a few seconds. Without a connection it opens as usual.
- **A simpler Changes page.** The notes above the list are gone, and the Changes tab no
  longer shows a count that stays until you quit.
- **A clearer disk image.** It opens on a window that shows where to drag FM Lens.

## In 0.5.0, since 0.4.2

Editing

- Every number you can type shows the least and the most FM takes ("Min: 1 Max: 20"); one
  line covers a whole group of attributes.
- Wages save at a value FM shows exactly, and the arrow keys step to the next one.
- The Changes view keeps its log and its Undo buttons across Reload and FM restarts.
- Undo works when FM has already put the old value back itself, and error messages no
  longer show memory addresses.
- A short guided tour takes you through your first edit.

People

- Languages: change a level (1 to 10) or remove a language. Levels read as FM words them.
- Likes and dislikes: change how strongly a person or club is favoured or disliked, or
  remove one.
- Staff: see and change a coaching licence.
- Work permits: see them, and grant or revoke them as FM's own editor does.
- Injuries: add one from the profile, through the game.
- Match officials: change ability, reputation and date of birth.
- Squad statuses, coaching licences and contract clauses use FM's names.

Transfers and loans

- Sign a free agent now or for a later day.
- Start a loan from the Transfer dialog, change a loan's terms, or end a loan early.
- See and cancel any transfer FM has agreed for a later day, between clubs too.

Nations, clubs and competitions

- Nation profiles: change FIFA points, game importance, attendance, nationality rules,
  senior team reputation and youth ratings; see women's football and when the association
  joined FIFA.
- Max tactics through FM's own editor action, and an experimental Max cohesion.
- Competitions and Awards views, read-only.
- Intel Macs get the officials, your manager and work permits.

## Known issues

- **FM raises a lowered language back.** If you lower a person's level in a main language
  of the country his club is in (English for a player in England, Italian in Italy), FM
  puts it back up on its own within a few days. FM Lens marks that language in the
  Languages dialog. Other languages keep the level you set. Undo still works afterwards.
- FM shows most changes after the next day, or after you reload the screen.
- FM shows only the strongest likes and dislikes on its own screens, so a weak one you
  change may not appear there.
- Cancelling an agreed transfer can't be undone.
- Not every field has been checked through a save and reload in FM.

## Source code

FM Lens is free software under the GNU GPL, version 3 or later. The source of this
version is [IamDejman/fm-lens at v0.5.3](https://github.com/IamDejman/fm-lens/tree/v0.5.3).
