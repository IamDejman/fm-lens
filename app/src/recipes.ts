// What the player and staff lists can be ranked for. A recipe is a few attributes and what a point of each counts
// for; the search scores everyone on it out of 100 (see `best.rs`) and lists the best fit first. The weights are a
// judgement of what each job asks for, not anything read from the game.

import {
  ATTRIBUTE_LABELS,
  jobLabel,
  positionLabel,
  STAFF_ATTRIBUTE_LABELS,
  type AttributeKey,
  type PositionKey,
  type StaffAttributeKey,
} from "./labels";
import type { BestFor, Fit } from "./types";

export interface Recipe {
  /** What names the recipe in the select and in the snapshot of the window. */
  key: string;
  label: string;
  /** What the search is asked to rank for. */
  best: BestFor;
  /** The name of each attribute of `best.weights`, in their order. */
  names: readonly string[];
}

function recipe<Key extends string>(
  key: string,
  label: string,
  weights: Partial<Record<Key, number>>,
  labels: Readonly<Record<Key, string>>,
  positions?: readonly string[],
): Recipe {
  const keys = Object.keys(weights) as Key[];
  return {
    key,
    label,
    best: { weights: keys.map((name) => ({ key: name, weight: weights[name] ?? 0 })), positions: positions?.slice() },
    names: keys.map((name) => labels[name]),
  };
}

/** A recipe for the players of `positions` (anyone with none), named by its first attribute: "ST: Finishing". */
function player(positions: readonly PositionKey[], weights: Partial<Record<AttributeKey, number>>): Recipe {
  const lead = Object.keys(weights)[0] as AttributeKey;
  const name = ATTRIBUTE_LABELS[lead];
  const label = positions.length > 0 ? `${positions.map(positionLabel).join("/")}: ${name}` : name;
  return recipe(`${positions[0] ?? "any"}.${lead}`, label, weights, ATTRIBUTE_LABELS, positions);
}

/** A recipe for staff, named by the job; `focus` adds its first attribute: "Coach: Attacking". */
function staff(job: number, weights: Partial<Record<StaffAttributeKey, number>>, focus = false): Recipe {
  const lead = Object.keys(weights)[0] as StaffAttributeKey;
  const label = focus ? `${jobLabel(job)}: ${STAFF_ATTRIBUTE_LABELS[lead]}` : jobLabel(job);
  return recipe(`${job}.${lead}`, label, weights, STAFF_ATTRIBUTE_LABELS);
}

export const PLAYER_RECIPES: readonly Recipe[] = [
  player(["gk"], { reflexes: 3, handling: 3, one_on_ones: 2, aerial_reach: 2, positioning: 2, agility: 2, concentration: 1 }),
  player(["gk"], { kicking: 3, rushing_out: 3, passing: 2, first_touch: 2, anticipation: 2, composure: 2, acceleration: 1 }),
  player(["dc"], { tackling: 3, marking: 3, positioning: 3, heading: 2, jumping_reach: 2, strength: 2, anticipation: 2 }),
  player(["dc"], { passing: 3, composure: 3, first_touch: 2, vision: 2, technique: 2, tackling: 2, positioning: 2 }),
  player(["dl", "dr"], { tackling: 3, marking: 3, positioning: 3, concentration: 2, anticipation: 2, pace: 2, stamina: 1 }),
  player(["wbl", "wbr"], { crossing: 3, pace: 3, acceleration: 3, stamina: 3, dribbling: 2, off_the_ball: 2, work_rate: 2 }),
  player(["dm"], { tackling: 3, work_rate: 3, positioning: 2, anticipation: 2, stamina: 2, strength: 2, teamwork: 2 }),
  player(["mc"], { passing: 3, vision: 3, first_touch: 3, decisions: 3, technique: 2, composure: 2, teamwork: 1 }),
  player(["mc"], { stamina: 3, work_rate: 3, teamwork: 2, passing: 2, tackling: 2, off_the_ball: 2, decisions: 2 }),
  player(["amc"], { vision: 3, passing: 3, technique: 3, first_touch: 3, flair: 2, composure: 2, off_the_ball: 2 }),
  player(["aml", "amr"], { crossing: 3, pace: 3, acceleration: 3, dribbling: 2, agility: 2, technique: 2, stamina: 1 }),
  player(["aml", "amr"], { dribbling: 3, acceleration: 3, finishing: 2, off_the_ball: 2, technique: 2, flair: 2, composure: 2 }),
  player(["st"], { finishing: 3, composure: 3, off_the_ball: 3, anticipation: 2, first_touch: 2, acceleration: 2, pace: 1 }),
  player(["st"], { heading: 3, jumping_reach: 3, strength: 3, bravery: 2, finishing: 2, balance: 1, first_touch: 1 }),
  player(["st"], { work_rate: 3, stamina: 3, aggression: 2, teamwork: 2, acceleration: 2, anticipation: 2, finishing: 2 }),
  player([], { free_kicks: 3, corners: 2, penalty_taking: 1, technique: 1 }),
  player([], { leadership: 3, determination: 2, teamwork: 2, composure: 1, bravery: 1 }),
];

/** What every coach needs to get his coaching across. */
const DRIVE = { determination: 2, authority: 2, motivating: 2 };

export const STAFF_RECIPES: readonly Recipe[] = [
  staff(16, { tactical_knowledge: 3, people_management: 3, motivating: 3, authority: 2, determination: 2 }),
  staff(20, { tactical_knowledge: 3, judging_ability: 3, judging_potential: 2, people_management: 2, motivating: 2 }),
  staff(2, { attacking: 6, tactical: 2, technical: 2, ...DRIVE }, true),
  staff(2, { defending: 6, tactical: 2, technical: 2, ...DRIVE }, true),
  staff(2, { possession: 6, tactical: 2, technical: 2, ...DRIVE }, true),
  staff(26, { fitness: 9, ...DRIVE }),
  staff(34, { goalkeeping: 9, ...DRIVE }),
  staff(22, { set_pieces: 9, ...DRIVE }),
  staff(64, { working_with_youngsters: 3, judging_potential: 3, people_management: 2, motivating: 1 }),
  staff(14, { judging_ability: 3, judging_potential: 3, determination: 1 }),
  staff(10, { negotiating: 3, judging_ability: 3, judging_potential: 3, judging_staff: 2 }),
  staff(60, { data_analysis: 3, tactical_knowledge: 1 }),
  staff(12, { physiotherapy: 1 }),
  staff(48, { sports_science: 1 }),
];

/** What a fit is made of, a line for each attribute of the recipe the person has: "Finishing 17". */
export function fitParts(recipe: Recipe, fit: Fit): string {
  return recipe.names
    .map((name, i) => ((fit.values[i] ?? 0) > 0 ? `${name} ${fit.values[i]}` : null))
    .filter((line) => line !== null)
    .join("\n");
}
