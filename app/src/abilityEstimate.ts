// The current ability FM would give a player for his attributes, feet and positions: what FM's own editor recommends
// after an edit, so that an edited player's ability still fits what he can do. The game's sum is not read from the
// game: these weights were fitted to every player of a save (30,282 players, game build 26577676), with a position
// weighed by its rating, and his other positions counted, as FM's own editor does. They land within 2 points of the
// ability the game holds for 85 players in 100 and within 4 for 98 (root mean square error 1.9). On players kept out
// of the fit the error is 1.92; counting every position from 15 in full, as at first, it was 2.13.

/** The roles the game weighs attributes for, in the order of the weights below. */
const ROLES = ["gk", "dc", "fb", "wb", "dm", "mc", "wm", "w", "amc", "st"] as const;

/** The role each position is played as; the sweeper, which FM27 has no use for, counts as no role. */
const ROLE_OF: Readonly<Record<string, (typeof ROLES)[number]>> = {
  gk: "gk", dc: "dc", dl: "fb", dr: "fb", wbl: "wb", wbr: "wb", dm: "dm", mc: "mc", ml: "wm", mr: "wm",
  aml: "w", amr: "w", amc: "amc", st: "st",
};

/**
 * What a point of each attribute (1–20) is worth, by role. `weak_foot` is the weaker of the two feet. An attribute
 * that is not here costs nothing: aggression, determination, flair, natural fitness and the hidden ones, as in FM's
 * own editor.
 */
const WEIGHTS: Readonly<Record<string, readonly number[]>> = {
  corners: [0, 0.21, 0.16, 0.2, 0.18, 0.14, 0.1, 0.08, 0.13, 0.14],
  crossing: [0.04, 0.15, 0.41, 0.62, 0.17, 0.14, 1.11, 0.92, 0.05, 0.35],
  dribbling: [0.05, 0.16, 0.14, 0.27, 0.35, 0.35, 0.61, 0.88, 0.4, 0.76],
  finishing: [0, 0.17, 0.23, 0.22, 0.39, 0.35, 0.38, 0.47, 0.58, 1.54],
  first_touch: [0.15, 0.35, 0.59, 0.65, 0.67, 1.3, 0.79, 0.87, 0.98, 0.93],
  free_kicks: [0.03, 0.12, 0.19, 0.16, 0.18, 0.14, 0.09, 0.15, 0.18, 0.2],
  heading: [0.11, 0.9, 0.43, 0.15, 0.19, 0.13, 0.19, 0.26, 0.18, 0.92],
  long_shots: [0, 0.18, 0.21, 0.22, 0.54, 0.51, 0.45, 0.19, 0.49, 0.21],
  long_throws: [0, 0.13, 0.19, 0.2, 0.15, 0.13, 0.24, 0.18, 0.11, 0.13],
  marking: [0, 1.63, 0.56, 0.3, 0.52, 0.53, 0.26, 0.19, 0.22, 0.16],
  passing: [0.5, 0.29, 0.35, 0.62, 0.66, 1.2, 0.58, 0.28, 0.69, 0.26],
  penalty_taking: [0, 0.12, 0.23, 0.19, 0.15, 0.15, 0.2, 0.17, 0.13, 0.09],
  tackling: [0, 0.94, 0.89, 0.63, 1.69, 0.52, 0.42, 0.38, 0.35, 0.15],
  technique: [0.13, 0.16, 0.3, 0.51, 0.48, 0.75, 0.94, 0.65, 1.08, 0.6],
  anticipation: [0.47, 0.83, 0.54, 0.63, 0.9, 0.47, 0.45, 0.55, 0.55, 0.7],
  bravery: [0.99, 0.36, 0.41, 0.16, 0.14, 0.17, 0.17, 0.17, 0.18, 0.15],
  composure: [0.33, 0.27, 0.33, 0.41, 0.24, 0.45, 0.5, 0.5, 0.52, 0.91],
  concentration: [0.95, 0.66, 0.8, 0.7, 0.5, 0.31, 0.31, 0.32, 0.34, 0.31],
  decisions: [1.93, 2.14, 1.86, 1, 1.85, 1.49, 1.01, 0.93, 1.12, 0.72],
  leadership: [0.28, 0.29, 0.2, 0.25, 0.15, 0.16, 0.18, 0.15, 0.17, 0.13],
  off_the_ball: [0, 0.19, 0.23, 0.35, 0.18, 0.52, 0.48, 0.38, 0.46, 0.99],
  positioning: [0.75, 1.6, 0.83, 0.53, 0.97, 0.53, 0.24, 0.12, 0.34, 0.29],
  teamwork: [0.25, 0.11, 0.38, 0.41, 0.35, 0.29, 0.41, 0.29, 0.27, 0.14],
  vision: [0.14, 0.15, 0.4, 0.41, 0.68, 1.18, 0.53, 0.42, 1.18, 0.28],
  work_rate: [0.16, 0.29, 0.36, 0.42, 0.86, 0.59, 0.7, 0.5, 0.52, 0.3],
  acceleration: [1.09, 1.15, 1.87, 2.33, 1.23, 1.15, 1.9, 2.47, 2.02, 1.8],
  agility: [1.5, 1.15, 1.54, 1.17, 1.24, 1.19, 1.34, 1.2, 1.14, 0.9],
  balance: [0.28, 0.27, 0.32, 0.36, 0.31, 0.31, 0.37, 0.33, 0.3, 0.27],
  jumping_reach: [0.13, 1.33, 0.38, 0.24, 0.17, 0.2, 0.29, 0.14, 0.15, 0.85],
  pace: [0.44, 0.9, 1.18, 1.65, 0.74, 0.94, 1.65, 2.45, 1.5, 1.2],
  stamina: [0.17, 0.48, 1.33, 1.88, 0.76, 1.23, 1.04, 1.33, 1.11, 0.9],
  strength: [0.66, 1.15, 0.94, 0.94, 1, 0.77, 0.66, 0.65, 0.63, 1.01],
  aerial_reach: [1.07, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  command_of_area: [0.93, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  communication: [0.76, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  handling: [1.47, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  kicking: [0.79, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  one_on_ones: [0.61, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  reflexes: [1.55, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  throwing: [0.43, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  weak_foot: [0.49, 0.93, 0.98, 1.11, 1.11, 1.36, 1.19, 1.19, 1.58, 1.4],
};

/** What each role's sum starts from. */
const BASE: readonly number[] = [-115.7, -117.7, -117.1, -119.6, -117.3, -116.9, -117.5, -118.1, -116.6, -116.4];

/**
 * What his other positions cost, by how many he plays besides the one that sets his ability (see `PLAYED`): between
 * whole numbers the cost is read between the two, and six or more count as six.
 */
const VERSATILITY: readonly number[] = [0, -0.3, 1.6, 4.4, 8.9, 12.5, 17.2];

/**
 * How much of a position played a rating of 1–20 counts for, in the steps FM's own editor takes: nothing up to 10, a
 * whole one at 20.
 */
const PLAYED: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.3, 0.4, 0.6, 0.6, 0.8, 0.8, 0.8, 1];

/**
 * How much of its role's cost a position rated 1–20 counts for, as FM's own editor weighs it: in full from 18, and
 * less the lower it is rated.
 */
const FADE: readonly number[] = [
  0.013, 0.013, 0.013, 0.083, 0.24, 0.401, 0.561, 0.637, 0.717, 0.802, 0.842, 0.88, 0.918, 0.943, 0.96, 0.978, 0.989, 1,
  1, 1,
];

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
 * stores five steps for each), `positions` are his ratings, 1–20. Each position costs what its role does, less the
 * lower it is rated (see `FADE`), and the one that costs the most sets the ability; the others add to it (see
 * `VERSATILITY`).
 */
export function abilityFor(
  attributes: Readonly<Record<string, number>>,
  positions: Readonly<Record<string, number>>,
): number | null {
  const rated = ABILITY_POSITIONS.filter((key) => positions[key] !== undefined);
  if (rated.length === 0) {
    return null;
  }
  const values: Record<string, number> = {
    ...attributes,
    weak_foot: Math.min(attributes.left_foot ?? 0, attributes.right_foot ?? 0),
  };
  const cost = (role: number) =>
    Object.entries(WEIGHTS).reduce((sum, [key, weights]) => sum + weights[role] * (values[key] ?? 0), BASE[role]);
  const costs = new Map<number, number>();
  const ratings = rated.map((key) => Math.min(FADE.length, Math.max(1, Math.round(positions[key]))));
  const faded = rated.map((key, index) => {
    const role = ROLES.indexOf(ROLE_OF[key]);
    if (!costs.has(role)) {
      costs.set(role, cost(role));
    }
    return FADE[ratings[index] - 1] * (costs.get(role) ?? 0);
  });
  const most = Math.max(...faded);
  const best = faded.indexOf(most);
  const others = ratings.reduce((sum, rating, index) => sum + (index === best ? 0 : PLAYED[rating - 1]), 0);
  const whole = Math.min(Math.floor(others), VERSATILITY.length - 2);
  const between = Math.min(others - whole, 1);
  return most + VERSATILITY[whole] + between * (VERSATILITY[whole + 1] - VERSATILITY[whole]);
}

/** How far a player's ability may be from the estimate and still be taken as the game's own. */
const OWN = 6;

/** How far below the offset remembered for a player his ability has to be for the offset to be taken as too high. */
const BELOW = 1;

/** A player as the estimate reads him. */
type Rated = { attributes: Readonly<Record<string, number>>; positions: Readonly<Record<string, number>> };

/**
 * How far the game's own ability of a player is from the estimate, when it holds `ability` for `before`: null when
 * there is nothing to go by. An ability further from the estimate than the game's ever is (one typed in before) says
 * nothing, and counts as none. `kept` is the offset remembered from an edit of him before: his ability may have been
 * left above what he needs since, so `kept` holds, unless he is now seen further below the estimate than it says.
 */
export function ownAbility(ability: number, before: Rated, kept: number | null = null): number | null {
  const was = abilityFor(before.attributes, before.positions);
  if (was === null) {
    return null;
  }
  const seen = ability - was;
  if (kept !== null && (seen >= kept - BELOW || seen < -OWN)) {
    return kept;
  }
  return Math.abs(seen) <= OWN ? seen : 0;
}

/**
 * The current ability that fits a player whose attributes, feet or positions are `after` an edit, when the game held
 * `ability` for `before`: a whole number that may be outside 1–200, or null when there is nothing to go by. An
 * ability the game worked out itself moves by what the edit is worth, so a player nothing was changed on fits the
 * ability he has. One that is further from the estimate than the game's ever is (an ability typed in before) fits
 * the estimate. `kept` is the offset remembered for him (see `ownAbility`).
 */
export function fittedAbility(ability: number, before: Rated, after: Rated, kept: number | null = null): number | null {
  const own = ownAbility(ability, before, kept);
  const now = abilityFor(after.attributes, after.positions);
  if (own === null || now === null) {
    return null;
  }
  return Math.round(now + own);
}

/** The current ability to suggest for him: the one that fits (see `fittedAbility`), kept within 1–200. */
export function suggestedAbility(ability: number, before: Rated, after: Rated, kept: number | null = null): number | null {
  const fitted = fittedAbility(ability, before, after, kept);
  return fitted === null ? null : Math.min(200, Math.max(1, fitted));
}
