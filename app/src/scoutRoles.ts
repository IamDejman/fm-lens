// The roles FM Lens rates players in, as `fmlens-scout` lists them (its tests check this list against its own), in the
// groups the role select shows them in. A role id is the role and its duty: "anchor.defend".

import { strings } from "./i18n";

export type RoleGroup = "goalkeepers" | "defenders" | "midfielders" | "forwards";

export const ROLE_GROUPS: readonly { group: RoleGroup; ids: readonly string[] }[] = [
  {
    group: "goalkeepers",
    ids: [
      "goalkeeper.defend",
      "sweeper_keeper.support",
    ],
  },
  {
    group: "defenders",
    ids: [
      "central_defender.defend",
      "stopper.defend",
      "covering_defender.defend",
      "ball_playing_defender.defend",
      "no_nonsense_defender.defend",
      "full_back.defend",
      "full_back.support",
      "full_back.attack",
      "wing_back.support",
      "wing_back.attack",
      "inverted_wing_back.support",
      "complete_wing_back.attack",
    ],
  },
  {
    group: "midfielders",
    ids: [
      "defensive_midfielder.defend",
      "anchor.defend",
      "half_back.defend",
      "ball_winning_midfielder.defend",
      "deep_lying_playmaker.defend",
      "deep_lying_playmaker.support",
      "regista.support",
      "roaming_playmaker.support",
      "segundo_volante.attack",
      "central_midfielder.defend",
      "central_midfielder.support",
      "central_midfielder.attack",
      "box_to_box_midfielder.support",
      "mezzala.support",
      "mezzala.attack",
      "carrilero.support",
      "advanced_playmaker.support",
      "advanced_playmaker.attack",
      "wide_midfielder.support",
      "defensive_winger.support",
      "attacking_midfielder.support",
      "attacking_midfielder.attack",
      "enganche.support",
    ],
  },
  {
    group: "forwards",
    ids: [
      "winger.support",
      "winger.attack",
      "inverted_winger.support",
      "inside_forward.support",
      "inside_forward.attack",
      "raumdeuter.attack",
      "wide_target_forward.attack",
      "shadow_striker.attack",
      "trequartista.attack",
      "advanced_forward.attack",
      "poacher.attack",
      "target_forward.support",
      "target_forward.attack",
      "deep_lying_forward.support",
      "deep_lying_forward.attack",
      "false_nine.support",
      "complete_forward.support",
      "complete_forward.attack",
      "pressing_forward.defend",
      "pressing_forward.attack",
    ],
  },
];

/** Every role id. */
export const ROLE_IDS: ReadonlySet<string> = new Set(ROLE_GROUPS.flatMap((group) => group.ids));

const text = strings.scout;

type RoleKey = keyof typeof text.roles;
type DutyKey = keyof typeof text.duties;

function parts(id: string): { role: (typeof text.roles)[RoleKey] | undefined; duty: DutyKey | undefined } {
  const [role, duty] = id.split(".");
  return {
    role: Object.prototype.hasOwnProperty.call(text.roles, role) ? text.roles[role as RoleKey] : undefined,
    duty: Object.prototype.hasOwnProperty.call(text.duties, duty) ? (duty as DutyKey) : undefined,
  };
}

/** "Anchor (Defend)"; the id itself for a role this version does not know. */
export function roleLabel(id: string): string {
  const { role, duty } = parts(id);
  return role && duty ? text.roleLabel(role.name, text.duties[duty]) : id;
}

/** "A-D", for a column header. */
export function roleShort(id: string): string {
  const { role, duty } = parts(id);
  return role && duty ? `${role.short}-${text.dutyShort[duty]}` : id;
}
