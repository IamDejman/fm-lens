## What's new

FM Lens 1.1.11 makes Suggested CA sharper and safer. The current ability it suggests is now closer to what Football Manager itself would give your player, it tells you when your attributes go past what the game can hold, and it never touches potential ability behind your back. Everything below is new since 1.1.10.

### Suggested CA lands closer to the game's own number

- Suggested CA now works the way FM's own pre-game editor does. Every position your player can play is weighed by how well he plays it: rated 18 to 20 it counts in full, and it counts for less the lower he is rated there.
- The position that asks the most of his attributes sets the number, and each other position he can play adds a little on top, more the better he plays it and depending on what kind of position it is.
- The result: tested on all 30,282 players of an FM27 save, the suggestion is within 2 points of the game's own current ability for 86 players in 100 (81 in 1.1.10) and within 4 for 98 in 100 (96 in 1.1.10).
- Versatile players gain the most. A winger who can also play wing back, or a striker who can fill in at centre back, now gets a suggestion that reflects that.

### See when your attributes go past 200

- When the attributes you set are worth more than the game can hold, a note beside Suggested CA shows the real figure, for example "Attributes fit CA 243, the most is 200".
- You know straight away how far over you are, so you can trim attributes back if you want the ability to match.

### Potential ability is yours alone

- FM Lens no longer raises potential ability for you. Suggested CA still fills current ability as you build a player, but PA stays exactly where you put it.
- When current ability goes above potential, a note says "CA is above PA", so you can decide what to do about it.

### Suggested CA remembers more of your edits

- Set all attributes, player templates and mass edits now keep FM Lens's note on every player they change, the same way editing from a player's profile does. His next suggestion starts from the right place.
- Notes now belong to your career, not to the name of your save. Save As, a renamed save, or a career you have not saved under a name yet all keep their notes.
- A new career saved under an old name starts fresh instead of picking up notes meant for another career.

### Good to know

- Notes from 1.1.10 move to the first career you open under that save name. If you kept two careers under the same name, open the one you edited first.
- After a mass edit of many players, FM Lens reads each of them once in the background to keep his note. You can carry on while it does.
- Set all attributes to 20 still sets CA and PA to 200, as its own message says.

### How this was tested

- The app's automated checks cover every change above.
- The accuracy figures come from every player in an FM27 save. We also checked FM27's own pre-game editor: on 12 of the hardest players its recommended ability matches the game's within 3 points, and Suggested CA now weighs positions by their rating the way it does.
- We have not yet run 1.1.11 in the installed app against FM on a Mac or on Windows. If a suggestion looks wrong, tell us from Report a problem.

### Updating

- Open FM Lens and it fetches 1.1.11 by itself. Press Relaunch to update when it appears, or download 1.1.11 from getfmlens.com.
- Every supported game version keeps working: 27.1.1, 27.1.0, 27.0.1 and 27.0.0 on Steam, and 0.9.2562.0, 0.9.2524.0 and 0.9.2435.0 on Game Pass.
- As always, edit a copy of your save.

FM Lens is free and open source, and it will stay that way. A [star on GitHub](https://github.com/IamDejman/fm-lens) encourages me.
