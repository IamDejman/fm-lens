// The size of the interface, separate from the window's own zoom. Chosen in the settings menu and
// kept on this computer. It applies at once, as a scale of the whole page.

import { formatPercent } from "./format";

/** The scales on offer, in the order of the menu: 100 is the size the layout was drawn at. */
export const ZOOMS = [80, 90, 100, 110, 125, 150] as const;

export type Zoom = (typeof ZOOMS)[number];

/** Where the chosen scale is kept. */
const STORAGE_KEY = "fmlibre.zoom";

function isZoom(value: number): value is Zoom {
  return ZOOMS.some((zoom) => zoom === value);
}

/** The scale chosen earlier; 100 when none is saved, it cannot be read, or it is not one on offer. */
function savedZoom(): Zoom {
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return isZoom(saved) ? saved : 100;
  } catch {
    return 100;
  }
}

let current: Zoom = savedZoom();

/** The scale of this run, as a percent. */
export function zoom(): Zoom {
  return current;
}

/** How a scale is written in the menu: "125%", or "%125" in Turkish. */
export function zoomLabel(value: Zoom): string {
  return formatPercent(value);
}

/** Puts `value` on the page. */
export function applyZoom(value: Zoom = current): void {
  document.documentElement.style.setProperty("--ui-zoom", String(value / 100));
}

/**
 * Makes `next` the scale and keeps it. Storage can be unavailable; the page still scales for this run.
 */
export function setZoom(next: Zoom): void {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // The choice still applies until the window is closed.
  }
  applyZoom(next);
}

applyZoom();
