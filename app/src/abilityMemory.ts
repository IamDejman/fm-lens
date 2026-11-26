// The game's own offset of each player whose abilities were edited (see `ownAbility`), kept by career for the next
// time FM Lens is opened: the change log, which says what he had before an edit, lasts only while the app is open.
// A career is told from another by its key (`Career.key`), not by its save's name: a save is renamed, and a new
// career can be saved under an old name.

import { ABILITY_ATTRIBUTES, ABILITY_POSITIONS, ownAbility } from "./abilityEstimate";
import { changeLog, profileKey, readValues, stands, valuesBefore } from "./editing";

const KEY = "fm-lens.ownAbility.careers";

/** Where the offsets were kept by save name, before they were kept by career. */
const BY_NAME = "fm-lens.ownAbility";

type Kept = Record<string, Record<string, number>>;

function read(key: string): Kept {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return typeof kept === "object" && kept !== null ? (kept as Kept) : {};
  } catch {
    return {};
  }
}

/** The offset kept for the player with this UID in `career`; null when none is, or no career is loaded. */
export function keptOwnAbility(career: string | null, uid: number): number | null {
  const own: unknown = career === null ? undefined : read(KEY)[career]?.[uid];
  return typeof own === "number" && Number.isFinite(own) ? own : null;
}

/** Keeps `own` as the offset of the player with this UID in `career`. */
export function keepOwnAbility(career: string | null, uid: number, own: number): void {
  if (career === null) {
    return;
  }
  try {
    const kept = read(KEY);
    kept[career] = { ...kept[career], [uid]: Math.round(own * 100) / 100 };
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Not kept: it holds while the change log does.
  }
}

/**
 * The first time `career` is seen: takes over the offsets kept under its save's name by a version that kept them by
 * name, and takes them from there, so that no other career saved under that name is given them too. Whether they
 * were this career's cannot be told, so it is done once for a career and never after a rename.
 */
export function claimOwnAbilities(career: string | null, save: string | null): void {
  if (career === null) {
    return;
  }
  try {
    const kept = read(KEY);
    if (kept[career] !== undefined) {
      return;
    }
    const named = read(BY_NAME);
    kept[career] = (save !== null && named[save]) || {};
    localStorage.setItem(KEY, JSON.stringify(kept));
    if (save !== null && named[save] !== undefined) {
      delete named[save];
      localStorage.setItem(BY_NAME, JSON.stringify(named));
    }
  } catch {
    // Nothing is taken over: his offset is then read from the ability he has.
  }
}

/** Whether a change to this field of a player moves the ability that fits him, or is his ability itself. */
const ESTIMATED: ReadonlySet<string> = new Set([
  "current_ability",
  ...ABILITY_ATTRIBUTES.map((key) => `attribute.${key}`),
  ...ABILITY_POSITIONS.map((key) => `position.${key}`),
]);

/**
 * Keeps the game's own offset of every player whose attributes, positions or ability the changes logged as `batch`
 * wrote: Set all attributes, a template and a mass edit write them without a profile's Apply, which keeps it. What
 * each player had before is in the change log, so it is worked out as if before the write. A player who cannot be
 * read is passed over.
 */
export async function keepOwnAbilities(career: string | null, batch: number): Promise<void> {
  if (career === null) {
    return;
  }
  const log = await changeLog();
  const before = valuesBefore(log);
  const uids = new Set(
    log
      .filter((change) => change.batch === batch && change.entity === "player" && stands(change))
      .filter((change) => ESTIMATED.has(change.field))
      .map((change) => change.uid),
  );
  for (const uid of uids) {
    try {
      const now = await readValues("player", uid);
      const first = before.get(profileKey("player", uid));
      const game = (key: string): number | undefined => first?.get(key) ?? now[key];
      const ability = game("current_ability");
      if (ability === undefined) {
        continue;
      }
      const was = {
        attributes: Object.fromEntries(ABILITY_ATTRIBUTES.map((key) => [key, (game(`attribute.${key}`) ?? 0) / 5])),
        positions: Object.fromEntries(
          ABILITY_POSITIONS.flatMap((key) => {
            const rating = game(`position.${key}`);
            return rating === undefined ? [] : [[key, rating]];
          }),
        ),
      };
      const own = ownAbility(ability, was, keptOwnAbility(career, uid));
      if (own !== null) {
        keepOwnAbility(career, uid, own);
      }
    } catch {
      // He is gone or cannot be read: nothing is kept for him.
    }
  }
}
