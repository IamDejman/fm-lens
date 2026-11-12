// The rows ticked in a list, for the actions that take the ticked ones in place of the whole list (Mass edit, Clone &
// templates). The set lives with the list (the players, staff and clubs each have their own), which stays mounted
// while another view is shown, and it outlasts searches, filters and pages, so rows found by several searches can be
// ticked together. A reload of the window starts with none.

import { useMemo, useState } from "react";

/** The ticked rows of a list, and what can be done to them. */
export interface Ticks {
  /** The UIDs of the ticked rows, in the order they were ticked. */
  uids: readonly number[];
  has: (uid: number) => boolean;
  toggle: (uid: number) => void;
  /** Ticks every one of `uids`, or unticks them: the rows on show, from the box in the header. */
  setAll: (uids: readonly number[], ticked: boolean) => void;
  clear: () => void;
}

const NONE: ReadonlySet<number> = new Set();

/**
 * The ticks of the list that calls it: none to begin with. They are of one game: `game` changes when another game is
 * read (see `App`), where a UID may be someone else, and the set is empty again.
 */
export function useTicks(game: number): Ticks {
  const [held, setHeld] = useState({ game, uids: NONE });
  const uids = held.game === game ? held.uids : NONE;

  return useMemo<Ticks>(() => {
    const change = (edit: (old: Set<number>) => void) =>
      setHeld((old) => {
        const next = new Set(old.game === game ? old.uids : NONE);
        edit(next);
        return { game, uids: next };
      });
    return {
      uids: [...uids],
      has: (uid) => uids.has(uid),
      toggle: (uid) =>
        change((set) => {
          if (!set.delete(uid)) {
            set.add(uid);
          }
        }),
      setAll: (all, ticked) =>
        change((set) => {
          for (const uid of all) {
            if (ticked) {
              set.add(uid);
            } else {
              set.delete(uid);
            }
          }
        }),
      clear: () => setHeld({ game, uids: NONE }),
    };
  }, [game, uids]);
}
