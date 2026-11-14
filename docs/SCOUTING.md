# Scouting in FM Lens

FM Lens can score and rank players with estimates of its own. None of them is
read from FM: FM does not store attributes at a player's potential, ratings
for roles in its database, or a chance of development. Every estimate uses the
player's own data only (age, ability, attributes, personality and positions),
so a player gets the same estimate whichever club he is at. Club facilities,
training and playing time are not taken into account.

The models are in `crates/fmlens-scout`, which has no game or platform code.
Its tests run on any machine with `cargo test -p fmlens-scout`.

## Potential attributes

What a player's attributes would be once his current ability reaches his
potential ability.

Across FM's players, an attribute a player relies on sits near
3 + CA / 12.5: about 7 at CA 50, 11 at 100, 15 at 150 and 19 at 200. So each
point of ability still to gain is worth about 0.08 of an attribute point. The
projection spreads that growth over the attributes that make up ability, more
on his stronger ones (between half and one and a half times the typical
growth), and caps each at 20.

Some attributes do not grow:

- those FM leaves out of ability: aggression, bravery, determination, flair,
  leadership, natural fitness, teamwork and work rate;
- the hidden attributes and the feet;
- a goalkeeper's outfield technique (first touch and passing do grow) and an
  outfield player's goalkeeping.

A negative potential is one of FM's ranges; the middle of the range stands
for it (-9 is 150 to 180, so 165). A running career has usually settled these.

Use: the **Potential attributes** filter, the Scout tab, and **Find similar**
at his peak.

## Roles and duties

A rating from 0 to 100 for each of 57 roles and duties (42 roles, from
Goalkeeper to Pressing Forward). For each role the key attributes count twice
and the preferred ones once; the rating is their weighted average on a scale
of 100. It is lowered for a player who does not play the role's positions: all
of it from a rating of 18 in the best of them, 95% when accomplished (15), down
to 30% for a position he cannot play.

These are FM Lens's weights, written for this app, not FM's role suitability
stars. They rate every player the same way, so they rank players fairly
against each other.

Use: the **Roles** filter (each role picked becomes a sortable column; give it
a minimum to filter by it) and the Scout tab, today and at his peak.

## Find similar

Every other player scored from 0 to 100 against one player:

- 80% from the attributes: the root mean square difference, with his strong
  attributes counting most (weight 0.5 + attribute / 20). A difference of 8
  points or more counts as nothing alike. Goalkeepers are compared on
  goalkeeping, first touch, passing and the mental and physical attributes;
  outfield players on technical, mental and physical.
- 20% from the positions both play (rated 10 or more by either).

**As he is today** compares both as they are. **At his peak** compares both at
their potential, which finds players who could become what he will be.

## Chance of development

The chance that the player's current ability comes within 7 points of his
potential during his career.

Each year a player closes part of the gap between his current and potential
ability. For a player of average personality that share is 24% at 15, 27% at
18 and 19, 20% at 22, 8% at 25, 1.5% at 28 and nothing from 29; a goalkeeper
follows the same curve two years later. The share is scaled by his character:

- from (2 x professionalism + ambition + determination) / 4, from about 0.64
  for the lowest to 1.4 for the highest;
- lowered by up to 18% for injury proneness above 8.

FM Lens follows that to the end of his career and turns the expected gap left
into a chance, with a spread that reflects how uncertain development is. A
player already within 7 of his potential shows 100%. Without his age or
potential there is no estimate.

## Progress rate

The ability he is expected to gain over the next two years, by the same
model, shown as 0 to 5 stars in half stars: half a star from 1 point, then 3,
5, 8, 11, 15, 19, 24, 30 and five stars from 37. A player past his growth shows
no stars.

## Top players

The best players (by current ability) or the most promising (21 and under, by
potential ability) of men's or women's clubs, in the world, a continent or a
country: 100 at most. A player plays in the country his club is in, as the
game finds it (where it plays when based abroad). Free agents appear only in
the world lists. On Windows a country's list can be narrowed to one of its
divisions, by the league each club plays in this season; macOS does not read
that yet (see [the research note](recon/fm27-scouting-research.md)).

## Your other careers

Each time FM Lens connects to a career, or reloads it, it records every
player's age, current and potential ability, at most once a month of game
time, in its own data folder (`history/`, one file per career). It never
leaves the computer.

A player's Scout tab then shows how the same player developed in the user's
other careers. A player is matched by his ID and by a hash of his name and
birth date, as players FM makes up during a career (regens) can reuse an ID.
Only careers connected in FM Lens are recorded, from the first time each one is
connected after updating.

## Pictures and kits

With no graphics pack, FM Lens shows the game's own club logos, faces, flags,
competition logos and kits, read from the game's install. Staff have no
pictures in the game and show initials. FM Lens also reads kit packs: a mapping to `graphics/pictures/club/<id>/kits/home`
(or `away` or `third`) puts that shirt on the club's Overview.

## In-game scout card (Windows)

Hover the (i) by a player's name in FM and FM Lens's card for him shows by
the pointer, over the game: his face, club, nation, age, position, current and
potential ability, his best three roles, chance of development and progress
rate. Hold Shift for his peak: the roles at his potential and the attributes
that grow most. FM Lens must be running and connected to the career.

The card never takes focus or a click from FM. It goes when the pointer leaves
FM's card, when FM is not the window in front and at FM's main menu, and it
follows FM when another save loads. It works with FM full screen or in a
window. Switch it off in Settings, General.

FM Lens finds the player from FM's own card: FM keeps the player's UID in its
Unity layer, reached from one fixed place (see
[the research note](recon/fm27-scouting-research.md)). macOS does not read it
yet, so the card and its switch are Windows only.
