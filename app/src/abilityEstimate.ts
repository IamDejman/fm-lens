// The current ability FM would give a player for his attributes, feet and positions: what FM's own editor recommends
// after an edit, so that an edited player's ability still fits what he can do. The game's sum is not read from the
// game: these weights were fitted to every player of a save (30,282 players, game build 26577676), with a position
// weighed by its rating as FM's own editor weighs it. They land within 2 points of the ability the game holds for 84
// players in 100 and within 4 for 97 (root mean square error 2.0). On players kept out of the fit the error is 2.00;
// counting every position from 15 in full, as before, it was 2.13.

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
  corners: [0, 0.23, 0.14, 0.21, 0.2, 0.16, 0, 0.09, 0.16, 0.15],
  crossing: [0.04, 0.13, 0.42, 0.57, 0.19, 0.15, 1.14, 0.9, 0.08, 0.34],
  dribbling: [0.05, 0.16, 0.1, 0.33, 0.37, 0.33, 0.62, 0.91, 0.41, 0.77],
  finishing: [0, 0.18, 0.21, 0.25, 0.37, 0.33, 0.36, 0.44, 0.55, 1.53],
  first_touch: [0.15, 0.35, 0.6, 0.69, 0.67, 1.31, 0.86, 0.88, 1.02, 0.93],
  free_kicks: [0.03, 0.1, 0.16, 0.17, 0.17, 0.14, 0.12, 0.15, 0.15, 0.2],
  heading: [0.11, 0.9, 0.42, 0.19, 0.19, 0.13, 0.23, 0.25, 0.17, 0.93],
  long_shots: [0, 0.18, 0.24, 0.22, 0.54, 0.52, 0.45, 0.21, 0.52, 0.22],
  long_throws: [0, 0.14, 0.18, 0.2, 0.17, 0.16, 0.24, 0.19, 0.12, 0.14],
  marking: [0, 1.64, 0.57, 0.31, 0.51, 0.54, 0.27, 0.2, 0.21, 0.17],
  passing: [0.5, 0.29, 0.36, 0.64, 0.66, 1.2, 0.61, 0.26, 0.7, 0.24],
  penalty_taking: [0, 0.12, 0.25, 0.2, 0.17, 0.16, 0.19, 0.2, 0.15, 0.09],
  tackling: [0, 0.94, 0.89, 0.65, 1.69, 0.52, 0.43, 0.42, 0.37, 0.16],
  technique: [0.13, 0.15, 0.29, 0.48, 0.48, 0.74, 0.91, 0.63, 1.04, 0.59],
  anticipation: [0.47, 0.83, 0.54, 0.62, 0.91, 0.48, 0.55, 0.51, 0.56, 0.71],
  bravery: [0.99, 0.35, 0.41, 0.16, 0.15, 0.16, 0.16, 0.17, 0.18, 0.14],
  composure: [0.33, 0.28, 0.34, 0.43, 0.22, 0.48, 0.5, 0.53, 0.52, 0.93],
  concentration: [0.95, 0.67, 0.82, 0.71, 0.52, 0.3, 0.37, 0.35, 0.37, 0.32],
  decisions: [1.93, 2.14, 1.87, 0.97, 1.84, 1.48, 0.99, 0.92, 1.09, 0.71],
  leadership: [0.28, 0.3, 0.21, 0.27, 0.16, 0.17, 0.21, 0.15, 0.17, 0.13],
  off_the_ball: [0, 0.21, 0.19, 0.36, 0.23, 0.54, 0.45, 0.33, 0.45, 1],
  positioning: [0.75, 1.6, 0.81, 0.49, 0.92, 0.51, 0.25, 0.15, 0.35, 0.29],
  teamwork: [0.25, 0.11, 0.38, 0.43, 0.36, 0.3, 0.41, 0.3, 0.27, 0.15],
  vision: [0.14, 0.15, 0.42, 0.43, 0.67, 1.18, 0.49, 0.44, 1.19, 0.28],
  work_rate: [0.16, 0.29, 0.39, 0.44, 0.87, 0.6, 0.66, 0.52, 0.52, 0.3],
  acceleration: [1.09, 1.16, 1.87, 2.29, 1.22, 1.14, 1.73, 2.5, 2.02, 1.78],
  agility: [1.5, 1.15, 1.53, 1.16, 1.23, 1.21, 1.38, 1.18, 1.13, 0.92],
  balance: [0.28, 0.26, 0.34, 0.35, 0.3, 0.31, 0.39, 0.34, 0.31, 0.26],
  jumping_reach: [0.13, 1.33, 0.37, 0.23, 0.17, 0.19, 0.25, 0.12, 0.15, 0.84],
  pace: [0.44, 0.9, 1.19, 1.63, 0.77, 0.94, 1.65, 2.49, 1.49, 1.18],
  stamina: [0.17, 0.47, 1.34, 1.86, 0.75, 1.24, 1.13, 1.35, 1.12, 0.89],
  strength: [0.66, 1.15, 0.97, 0.96, 0.98, 0.76, 0.73, 0.68, 0.65, 1.01],
  aerial_reach: [1.07, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  command_of_area: [0.93, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  communication: [0.76, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  handling: [1.47, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  kicking: [0.79, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  one_on_ones: [0.61, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  reflexes: [1.55, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  throwing: [0.43, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  weak_foot: [0.49, 0.94, 1, 1.17, 1.12, 1.36, 1.22, 1.22, 1.61, 1.4],
};

/** What each role's sum starts from. */
const BASE: readonly number[] = [-115.7, -118.1, -117.9, -120, -117.4, -117.8, -118, -119.8, -117.7, -116.5];

/** What playing more positions well costs, by how many he plays (seven or more count as seven). */
const VERSATILITY: readonly number[] = [0, 0, 0, 1.1, 2.8, 5.5, 7.6, 11.8];

/** A position counts towards how many he plays from this rating: the game calls him accomplished there. */
const PLAYED = 15;

/**
 * How much of its role's cost a position rated 1–20 counts for, as FM's own editor weighs it: in full from 18, and
 * less the lower it is rated.
 */
const FADE: readonly number[] = [
  0.01, 0.067, 0.125, 0.182, 0.24, 0.359, 0.478, 0.598, 0.717, 0.802, 0.842, 0.88, 0.918, 0.939, 0.96, 0.978, 0.989, 1,
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
 * lower it is rated (see `FADE`), and the one that costs the most sets the ability.
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
  const faded = rated.map((key) => {
    const role = ROLES.indexOf(ROLE_OF[key]);
    if (!costs.has(role)) {
      costs.set(role, cost(role));
    }
    const rating = Math.min(FADE.length, Math.max(1, Math.round(positions[key])));
    return (FADE[rating - 1] ?? 0) * (costs.get(role) ?? 0);
  });
  const played = rated.filter((key) => positions[key] >= PLAYED).length;
  return Math.max(...faded) + VERSATILITY[Math.min(Math.max(played, 1), VERSATILITY.length - 1)];
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
