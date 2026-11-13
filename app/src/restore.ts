// What the window held, brought back when it starts again: after a reload, and after the app was closed.
//
// Switching the language or the currency reloads the window (see `setLocale` and `setCurrency`) and the app comes back
// connected without reading the game again, but every view would start from its beginning. Just before the reload
// `saveSnapshot` writes what the parts that registered with `useSnapshot` hold to `sessionStorage`; the next start
// reads it once and removes it, so it lasts for that reload only.
//
// What the parts hold is also kept in `localStorage` as it changes, for the next time the app is opened: the section,
// each list's search, filters, page, place and open profile, and the tab of a profile. It is kept with the career it
// was for (see `heldFor`): another career starts its lists afresh. A part can keep out of it (see `useSnapshot`).
//
// Nothing here may get in the way of the app: every access to the storage is guarded, and what is missing or wrong is
// the part's own start.

import { useEffect, useRef } from "react";

/** Where the snapshot of a reload is kept: a JSON object with a `version` and the `parts`, by name. */
const STORAGE_KEY = "fmlens.restore";

/** Where what the window held is kept between runs of the app: the same, with the `career` it was for. */
const LASTING_KEY = "fmlens.navigation";

/** The format of both; one of another format is left alone. */
const VERSION = 1;

/** How long the parts are left to change before what they hold is written for the next run. */
const KEEP_AFTER_MS = 300;

/** Whether `value` is an object with members (not an array, not null). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The parts of the snapshot the reload before this start left, by name; null when there was no such reload. */
function takeSaved(): Record<string, unknown> | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      return null;
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

/** What the parts held when the app last ran, and the career that was for; nothing when none was kept. */
function readLasting(): { career: string | null; parts: Record<string, unknown> } {
  try {
    const kept: unknown = JSON.parse(window.localStorage.getItem(LASTING_KEY) ?? "null");
    if (isRecord(kept) && kept.version === VERSION && isRecord(kept.parts)) {
      return { career: typeof kept.career === "string" ? kept.career : null, parts: kept.parts };
    }
  } catch {
    // The app then starts as it did before it kept anything.
  }
  return { career: null, parts: {} };
}

const reloaded = takeSaved();

/** What is kept for the next run. A part that is not on screen keeps what it last held. */
const lasting = readLasting();

/**
 * What the parts start from: what the reload left, or without one what the last run left. Read once, when the app
 * loads: in development React builds a component more than once on purpose, and every build must see the same.
 */
const saved: Record<string, unknown> = reloaded ?? { ...lasting.parts };

/**
 * What was saved for the part `name`, turned into what the part holds by `read`. `read` is given whatever was stored
 * (nothing when no start left anything, or anything at all) and answers with the part's own start for what is
 * missing or wrong.
 */
export function restored<T>(name: string, read: (value: unknown) => T): T {
  return read(saved[name]);
}

/** The parts that are on screen, each with what tells what it holds now, and whether that is kept between runs. */
const parts = new Map<string, { take: () => unknown; lasts: boolean }>();

/** The text last written for the next run, so that it is written only when it differs. */
let written: string | null = null;

/** Writes what the parts hold for the next run of the app. */
function keep(): void {
  try {
    for (const [name, part] of parts) {
      if (part.lasts) {
        lasting.parts[name] = part.take();
      }
    }
    const text = JSON.stringify({ version: VERSION, career: lasting.career, parts: lasting.parts });
    if (text !== written) {
      window.localStorage.setItem(LASTING_KEY, text);
      written = text;
    }
  } catch {
    // Without the storage the next run starts at its beginning.
  }
}

let waiting: number | null = null;

/** Says that a part may hold something else now: it is written for the next run shortly, once the changes pause. */
export function noteChange(): void {
  if (waiting !== null) {
    window.clearTimeout(waiting);
  }
  waiting = window.setTimeout(() => {
    waiting = null;
    keep();
  }, KEEP_AFTER_MS);
}

// The app may be closed before the pause is over.
window.addEventListener("pagehide", keep);

/**
 * Says which career the game has loaded, before the lists are built. What the last run left is for the career it had:
 * in another one the lists start afresh, as a row or a search of the other game may mean nothing here. The section
 * the window was in is used either way.
 */
export function heldFor(career: string): void {
  if (lasting.career === career) {
    return;
  }
  lasting.career = career;
  lasting.parts = {};
  if (reloaded === null) {
    for (const name of Object.keys(saved)) {
      delete saved[name];
    }
  }
  noteChange();
}

/**
 * Makes the part `name` a part of what is brought back: `take` tells what it holds (anything JSON can hold). What an
 * earlier start left for it has been used by the time it mounts, so it is dropped here: a part that mounts again
 * later, as the lists do after the connection was lost, starts as it would have anyway. With `lasts` false the part
 * comes back after a reload only, not when the app is opened again.
 */
export function useSnapshot(name: string, take: () => unknown, lasts = true): void {
  const latest = useRef(take);
  useEffect(() => {
    latest.current = take;
    if (lasts) {
      noteChange();
    }
  });

  useEffect(() => {
    delete saved[name];
    const mine = { take: () => latest.current(), lasts };
    parts.set(name, mine);
    return () => {
      if (parts.get(name) === mine) {
        if (lasts) {
          // Gone from the screen, as the lists are once the game has closed: the next run starts from what it held.
          try {
            lasting.parts[name] = mine.take();
          } catch {
            // It keeps what was written last.
          }
          noteChange();
        }
        parts.delete(name);
      }
    };
  }, [name, lasts]);
}

/** Stores what the parts that are on screen hold, for the start after the reload that is about to happen. */
export function saveSnapshot(): void {
  keep();
  try {
    // Deferred sections may still have unconsumed state from an earlier start.
    const held: Record<string, unknown> = { ...saved };
    for (const [name, part] of parts) {
      held[name] = part.take();
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, parts: held }));
  } catch {
    // Without the storage the window comes back at its start, as it did before there was a snapshot.
  }
}
