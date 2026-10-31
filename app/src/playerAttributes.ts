// The attributes of a player in the order FM lists them, by group, and who counts as a goalkeeper: what the profile
// of a player and the comparison of players share, so that the two group and order the same way.

import type { AttributeKey } from "./labels";
import type { PlayerDetails } from "./types";

export const TECHNICAL: readonly AttributeKey[] = [
  "corners", "crossing", "dribbling", "finishing", "first_touch", "free_kicks", "heading",
  "long_shots", "long_throws", "marking", "passing", "penalty_taking", "tackling", "technique",
];
export const MENTAL: readonly AttributeKey[] = [
  "aggression", "anticipation", "bravery", "composure", "concentration", "decisions", "determination",
  "flair", "leadership", "off_the_ball", "positioning", "teamwork", "vision", "work_rate",
];
export const PHYSICAL: readonly AttributeKey[] = [
  "acceleration", "agility", "balance", "jumping_reach", "natural_fitness", "pace", "stamina", "strength",
];
/** First touch and passing are Technical attributes too: a keeper has them in both groups. */
export const GOALKEEPING: readonly AttributeKey[] = [
  "aerial_reach", "command_of_area", "communication", "eccentricity", "first_touch", "handling", "kicking",
  "one_on_ones", "passing", "punching", "reflexes", "rushing_out", "throwing",
];
export const HIDDEN: readonly AttributeKey[] = [
  "consistency", "dirtiness", "important_matches", "injury_proneness", "versatility",
];
export const FEET: readonly AttributeKey[] = ["left_foot", "right_foot"];

/** A player counts as a goalkeeper from this rating at gk; the panel then shows Goalkeeping instead of Technical. */
export const GOALKEEPER_RATING = 15;

/** Whether the player is a goalkeeper, by the rating the profile goes by. */
export function isGoalkeeper(player: Pick<PlayerDetails, "positionRatings">): boolean {
  return (player.positionRatings.gk ?? 0) >= GOALKEEPER_RATING;
}
