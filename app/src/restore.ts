// What the window held before the language (or the currency) was switched, brought back after the reload. Switching
// reloads the window (see `setLocale` and `setCurrency`) and the app comes back connected without reading the game
// again, but every view would start from its beginning. Just before the reload `saveSnapshot` writes what the parts
// that registered with `useSnapshot` hold to `sessionStorage`; the next start reads it once and removes it, so it
// lasts for that reload only, never for a restart or for another reload. Nothing here may get in the way of the reload: every access to the storage is
// guarded, and what is missing or wrong is the part's own start.

import { useEffect, useRef } from "react";

/** Where the snapshot is kept: a JSON object with a `version` and the `parts`, by name. */
const STORAGE_KEY = "fmlibre.restore";

/** The format of the snapshot; one of another format is left alone. */
const VERSION = 1;

/** Whether `value` is an object with members (not an array, not null). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The parts of the snapshot the reload before this start left, by name; none when there was no such reload. */
function takeSaved(): Record<string, unknown> {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      return {};
    }
    // It is for this start only: it goes before it is even read.
    window.sessionStorage.removeItem(STORAGE_KEY);
    const snapshot: unknown = JSON.parse(stored);
    if (isRecord(snapshot) && snapshot.version === VERSION && isRecord(snapshot.parts)) {
      return snapshot.parts;
    }
  } catch {
    // Without a snapshot that can be read every part starts as it would have anyway.
  }
  return {};
}

/**
 * Read once, when the app loads: in development React builds a component more than once on purpose, and every build
 * must see the same snapshot.
 */
const saved = takeSaved();

/**
 * What was saved for the part `name`, turned into what the part holds by `read`. `read` is given whatever was stored
 * (nothing when the reload left nothing, or anything at all) and answers with the part's own start for what is
 * missing or wrong.
 */
export function restored<T>(name: string, read: (value: unknown) => T): T {
  return read(saved[name]);
}

/** The parts that are on screen, each with what tells what it holds now. */
const parts = new Map<string, () => unknown>();

/**
 * Makes the part `name` a part of the snapshot taken when the language is switched: `take` tells what it holds then
 * (anything JSON can hold). What the reload left for it has been used by the time it mounts, so it is dropped here: a
 * part that mounts again later, as the lists do after the connection was lost, starts as it would have anyway.
 */
export function useSnapshot(name: string, take: () => unknown): void {
  const latest = useRef(take);
  useEffect(() => {
    latest.current = take;
  });

  useEffect(() => {
    delete saved[name];
    const mine = () => latest.current();
    parts.set(name, mine);
    return () => {
      if (parts.get(name) === mine) {
        parts.delete(name);
      }
    };
  }, [name]);
}

/** Stores what the parts that are on screen hold, for the start after the reload that is about to happen. */
export function saveSnapshot(): void {
  try {
    const held: Record<string, unknown> = {};
    for (const [name, take] of parts) {
      held[name] = take();
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, parts: held }));
  } catch {
    // Without the storage the window comes back at its start, as it did before there was a snapshot.
  }
}
