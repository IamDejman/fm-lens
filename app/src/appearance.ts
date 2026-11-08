export type Appearance = "system" | "light" | "dark";
export const ZOOMS = [80, 90, 100, 110, 125, 150] as const;

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
const savedAppearance = stored("fm-lens.appearance");
export let appearance: Appearance =
  savedAppearance === "light" || savedAppearance === "dark"
    ? savedAppearance
    : "system";
const savedZoom = Number(stored("fm-lens.zoom"));
export let zoom: number = ZOOMS.find((value) => value === savedZoom) ?? 100;
const dark = matchMedia("(prefers-color-scheme: dark)");

function apply() {
  document.documentElement.dataset.appearance =
    appearance === "system" ? (dark.matches ? "dark" : "light") : appearance;
  document.documentElement.style.zoom = String(zoom / 100);
  document.documentElement.style.setProperty("--ui-scale", String(zoom / 100));
}
export function setAppearance(next: Appearance) {
  appearance = next;
  try {
    localStorage.setItem("fm-lens.appearance", next);
  } catch {
    /* Keep this session usable without storage. */
  }
  apply();
}
const zoomWatchers = new Set<() => void>();
/** Re-measure positioned/layout-dependent UI after a zoom preference changes. */
export function watchZoom(watcher: () => void): () => void {
  zoomWatchers.add(watcher);
  return () => { zoomWatchers.delete(watcher); };
}
export function setZoom(next: number) {
  zoom = ZOOMS.find((value) => value === next) ?? 100;
  try {
    localStorage.setItem("fm-lens.zoom", String(zoom));
  } catch {
    /* Keep this session usable without storage. */
  }
  apply();
  for (const watcher of zoomWatchers) watcher();
}
dark.addEventListener("change", apply);
apply();

/** Convert viewport measurements to the coordinates used by zoomed CSS. */
export function layoutPixels(value: number): number {
  return value / (zoom / 100);
}
