// The current ability FM would give a player for his attributes, feet and positions: what FM's own editor recommends
// after an edit, so that an edited player's ability still fits what he can do. The game's sum is not read from the
// game: these weights were fitted to every player of a save (30,282 players, game build 26577676), and land within
// about 2 points of the ability the game holds, 4 points for 19 players in 20.

/** The roles the game weighs attributes for, in the order of the weights below. */
const ROLES = ["gk", "dc", "fb", "wb", "dm", "mc", "wm", "w", "amc", "st"] as const;

/** The role each position is played as; the sweeper, which FM27 has no use for, counts as no role. */
const ROLE_OF: Readonly<Record<string, (typeof ROLES)[number]>> = {
  gk: "gk", dc: "dc", dl: "fb", dr: "fb", wbl: "wb", wbr: "wb", dm: "dm", mc: "mc", ml: "wm", mr: "wm",
  aml: "w", amr: "w", amc: "amc", st: "st",
};

/**
 * What a point of each attribute (1–20) is worth, by role. `weak_foot` is the weaker of the two feet. An attribute
 * that is not here costs nothing: determination, natural fitness and the hidden ones barely move the ability.
 */
const WEIGHTS: Readonly<Record<string, readonly number[]>> = {
  corners: [0, 0.21, 0.17, 0.2, 0.21, 0.18, 0.05, 0.11, 0.2, 0.15],
  crossing: [0.04, 0.14, 0.46, 0.62, 0.16, 0.14, 1.23, 0.95, 0.12, 0.37],
  dribbling: [0.05, 0.16, 0.14, 0.29, 0.34, 0.35, 0.6, 0.95, 0.49, 0.77],
  finishing: [0, 0.16, 0.2, 0.29, 0.33, 0.35, 0.41, 0.42, 0.56, 1.5],
  first_touch: [0.15, 0.32, 0.58, 0.71, 0.71, 1.32, 0.88, 0.88, 0.99, 0.94],
  free_kicks: [0.03, 0.12, 0.15, 0.18, 0.17, 0.12, 0.1, 0.13, 0.18, 0.17],
  heading: [0.1, 0.92, 0.43, 0.12, 0.22, 0.1, 0.23, 0.19, 0.21, 0.91],
  long_shots: [0, 0.15, 0.24, 0.21, 0.5, 0.52, 0.38, 0.25, 0.48, 0.22],
  long_throws: [0, 0.15, 0.16, 0.26, 0.17, 0.14, 0.23, 0.26, 0.11, 0.15],
  marking: [0, 1.65, 0.6, 0.25, 0.52, 0.54, 0.19, 0.15, 0.18, 0.17],
  passing: [0.5, 0.29, 0.35, 0.58, 0.69, 1.19, 0.59, 0.25, 0.67, 0.24],
  penalty_taking: [0, 0.12, 0.24, 0.17, 0.17, 0.16, 0.16, 0.2, 0.15, 0.11],
  tackling: [0, 0.93, 0.88, 0.71, 1.61, 0.48, 0.37, 0.38, 0.35, 0.17],
  technique: [0.13, 0.15, 0.27, 0.44, 0.49, 0.72, 0.75, 0.56, 0.97, 0.55],
  aggression: [0, 0.03, 0, 0, 0.03, 0.05, 0, 0, 0, 0],
  anticipation: [0.47, 0.82, 0.57, 0.56, 0.87, 0.45, 0.55, 0.51, 0.52, 0.71],
  bravery: [0.99, 0.35, 0.41, 0.14, 0.14, 0.14, 0.07, 0.14, 0.15, 0.13],
  composure: [0.34, 0.29, 0.35, 0.47, 0.26, 0.47, 0.5, 0.51, 0.51, 0.91],
  concentration: [0.95, 0.67, 0.83, 0.71, 0.48, 0.34, 0.46, 0.38, 0.38, 0.33],
  decisions: [1.93, 2.11, 1.84, 0.98, 1.81, 1.44, 0.97, 0.91, 1.06, 0.72],
  determination: [0, 0, 0, 0, 0.03, 0, 0.08, 0, 0, 0],
  flair: [0, 0, 0.05, 0.1, 0, 0, 0, 0.1, 0.07, 0.05],
  leadership: [0.28, 0.29, 0.22, 0.24, 0.17, 0.17, 0.24, 0.15, 0.17, 0.14],
  off_the_ball: [0, 0.19, 0.19, 0.38, 0.21, 0.54, 0.47, 0.36, 0.51, 0.99],
  positioning: [0.75, 1.59, 0.77, 0.48, 0.97, 0.5, 0.25, 0.13, 0.31, 0.3],
  teamwork: [0.25, 0.11, 0.4, 0.41, 0.33, 0.33, 0.36, 0.28, 0.25, 0.17],
  vision: [0.14, 0.14, 0.43, 0.41, 0.67, 1.22, 0.45, 0.41, 1.18, 0.27],
  work_rate: [0.16, 0.27, 0.36, 0.47, 0.8, 0.61, 0.59, 0.53, 0.51, 0.27],
  acceleration: [1.08, 1.16, 1.84, 2.26, 1.19, 1.14, 1.73, 2.48, 1.98, 1.79],
  agility: [1.49, 1.14, 1.51, 1.14, 1.22, 1.2, 1.28, 1.19, 1.13, 0.92],
  balance: [0.28, 0.29, 0.32, 0.36, 0.33, 0.29, 0.31, 0.35, 0.28, 0.26],
  jumping_reach: [0.13, 1.32, 0.37, 0.26, 0.18, 0.17, 0.19, 0.11, 0.14, 0.84],
  natural_fitness: [0, 0, 0.04, 0, 0, 0.03, 0.06, 0.04, 0, 0],
  pace: [0.44, 0.91, 1.17, 1.71, 0.77, 0.99, 1.75, 2.45, 1.5, 1.17],
  stamina: [0.17, 0.47, 1.34, 1.82, 0.81, 1.21, 1.12, 1.3, 1.16, 0.9],
  strength: [0.66, 1.15, 0.95, 0.95, 0.99, 0.78, 0.8, 0.71, 0.63, 1.01],
  aerial_reach: [1.07, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  command_of_area: [0.93, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  communication: [0.76, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  handling: [1.47, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  kicking: [0.79, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  one_on_ones: [0.61, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  reflexes: [1.55, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  throwing: [0.43, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  weak_foot: [0.49, 0.94, 0.96, 1.18, 1.17, 1.33, 1.2, 1.2, 1.56, 1.4],
};

/** What each role's sum starts from. */
const BASE: readonly number[] = [-115.7, -118.1, -117.5, -120.7, -117.2, -117.6, -115.5, -119.9, -117.3, -116.4];

/** What playing more positions well costs, by how many he plays (seven or more count as seven). */
const VERSATILITY: readonly number[] = [0, 0, -0.3, 0.6, 2.3, 5.1, 7.1, 11.4];

/** A position counts as played from this rating: the game calls him accomplished there. */
const PLAYED = 15;

/** The attributes the estimate reads, the two feet included. */
export const ABILITY_ATTRIBUTES: readonly string[] = [
  ...Object.keys(WEIGHTS).filter((key) => key !== "weak_foot"),
  "left_foot",
  "right_foot",
];

/** The positions the estimate reads. */
export const ABILITY_POSITIONS: readonly string[] = Object.keys(ROLE_OF);

/**
 * The current ability that fits a player, not rounded and not kept within 1–200: null when he has no position rating.
 * `attributes` are on the scale the game shows (1–20, between whole numbers for a stored value that is: the game
 * stores five steps for each), `positions` are his ratings, 1–20. The role that costs the most among the positions
 * he plays sets the ability; a player who plays none at 15 or more is judged by his best.
 */
export function abilityFor(
  attributes: Readonly<Record<string, number>>,
  positions: Readonly<Record<string, number>>,
): number | null {
  const rated = ABILITY_POSITIONS.filter((key) => positions[key] !== undefined);
  if (rated.length === 0) {
    return null;
  }
  const best = Math.max(...rated.map((key) => positions[key]));
  const played = rated.filter((key) => positions[key] >= Math.min(PLAYED, best));
  const values: Record<string, number> = {
    ...attributes,
    weak_foot: Math.min(attributes.left_foot ?? 0, attributes.right_foot ?? 0),
  };
  const cost = (role: number) =>
    Object.entries(WEIGHTS).reduce((sum, [key, weights]) => sum + weights[role] * (values[key] ?? 0), BASE[role]);
  const roles = new Set(played.map((key) => ROLES.indexOf(ROLE_OF[key])));
  const count = best >= PLAYED ? Math.min(played.length, VERSATILITY.length - 1) : 1;
  return Math.max(...[...roles].map(cost)) + VERSATILITY[count];
}

/** How far a player's ability may be from the estimate and still be taken as the game's own. */
const OWN = 6;

/**
 * The current ability to suggest for a player whose attributes, feet or positions are `after` an edit, when the
 * game held `ability` for `before`: 1–200, or null when there is nothing to go by. An ability the game worked out
 * itself moves by what the edit is worth, so a player nothing was changed on is suggested the ability he has. One
 * that is further from the estimate than the game's ever is (an ability typed in before) is suggested the estimate.
 */
export function suggestedAbility(
  ability: number,
  before: { attributes: Readonly<Record<string, number>>; positions: Readonly<Record<string, number>> },
  after: { attributes: Readonly<Record<string, number>>; positions: Readonly<Record<string, number>> },
): number | null {
  const was = abilityFor(before.attributes, before.positions);
  const now = abilityFor(after.attributes, after.positions);
  if (was === null || now === null) {
    return null;
  }
  const own = Math.abs(ability - was) <= OWN ? ability - was : 0;
  return Math.min(200, Math.max(1, Math.round(now + own)));
}
