## What's new

FM Lens 1.1.8 keeps up with your game: when FM brings in new players, FM Lens now sees them by itself. Your youth intake shows up in your under-18s seconds after it lands, with no Reload and no reconnect. Everything below is new since 1.1.7.

### Your youth intake shows up by itself

- On intake day FM hands you a list of youth candidates, and until now FM Lens could not see any of them. They were missing from your under-18s and from search until you pressed Reload.
- From 1.1.8 FM Lens notices when FM adds players and reads the game again by itself, a few seconds after the new players settle. Open your club, go to Squad, pick U18, and your candidates are there with their ability and potential, before you decide who gets a contract.
- It is not only your club. Every club's intake, every new player FM creates and every new member of staff shows up the same way, so search finds them too.

### Why they were missing

- FM Lens reads every player once, when it connects, and it read again only when FM moved its lists, as it does when you load another save. A youth intake adds players to the list where it already is, so FM Lens never knew there was anything new to read. In one career the list grew from 30,993 players to 32,692 without moving, and FM Lens knew only the first 30,993.
- Now it also counts the players, staff and clubs, and reads again when a count changes.

### Good to know

- FM Lens waits for the numbers to stop changing before it reads, and reads at most once every 30 seconds, longer in a very large database. On holiday, when FM adds players day after day, it does not read over and over.
- It works the same when FM Lens is connected read-only.
- If you have previewed a mass edit and not applied it when FM Lens reads again, the preview is dropped, the same as when you press Reload. Preview it again and apply.
- Reload is still there whenever you want to read the game again yourself.

### How this was tested

- We found the cause on an Apple Silicon Mac with Steam's 27.1.1, in a career on its intake day, and the fix passed our automatic checks on macOS and Windows.
- We have not yet played 1.1.8 through an intake day on a Mac or on Windows. If new players do not show up by themselves, press Reload and tell us from Report a problem.

### Updating

- Open FM Lens and it fetches 1.1.8 by itself. Press Relaunch to update when it appears, or download 1.1.8 from getfmlens.com.
- Every supported game version keeps working: 27.1.1, 27.1.0, 27.0.1 and 27.0.0 on Steam, and 0.9.2524.0 and 0.9.2435.0 on Game Pass.
- As always, edit a copy of your save.

FM Lens is free and open source, and it will stay that way. A [star on GitHub](https://github.com/IamDejman/fm-lens) encourages me.
