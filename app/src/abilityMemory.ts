// The game's own offset of each player whose abilities were edited (see `ownAbility`), kept by save for the next time
// FM Lens is opened: the change log, which says what he had before an edit, lasts only while the app is open.

const KEY = "fm-lens.ownAbility";

type Kept = Record<string, Record<string, number>>;

function read(): Kept {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return typeof kept === "object" && kept !== null ? (kept as Kept) : {};
  } catch {
    return {};
  }
}

/** The offset kept for the player with this UID in `save`; null when none is, or the save has no name. */
export function keptOwnAbility(save: string | null, uid: number): number | null {
  const own: unknown = save === null ? undefined : read()[save]?.[uid];
  return typeof own === "number" && Number.isFinite(own) ? own : null;
}

/** Keeps `own` as the offset of the player with this UID in `save`. */
export function keepOwnAbility(save: string | null, uid: number, own: number): void {
  if (save === null) {
    return;
  }
  try {
    const kept = read();
    kept[save] = { ...kept[save], [uid]: Math.round(own * 100) / 100 };
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Not kept: it holds while the change log does.
  }
}
