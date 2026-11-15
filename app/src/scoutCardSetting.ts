// The switch for the in-game scout card (see ScoutCard.tsx): on unless switched off in Settings.

import { call, inTauri } from "./api";

const KEY = "fm-lens.scoutCard";

export const scoutCardAvailable = inTauri;

export function scoutCardOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

/** Tells the app the switch: as the main window opens, and each time it changes. */
export function applyScoutCard(on = scoutCardOn()): void {
  if (scoutCardAvailable) {
    call("set_scout_card", { on }).catch((error: unknown) => console.error("FM Lens scout card switch:", error));
  }
}

export function setScoutCardOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Not kept: it holds until FM Lens restarts.
  }
  applyScoutCard(on);
}
