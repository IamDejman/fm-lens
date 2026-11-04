// Light, dark, or the system appearance. Chosen in the settings menu and kept on this computer.
// It applies at once: the page turns without a reload. System follows the operating system's light
// or dark setting, including a change while the app is open.

/** The appearances on offer, in the order of the menu. */
export const APPEARANCES = ["system", "light", "dark"] as const;

export type Appearance = (typeof APPEARANCES)[number];

/** Where the chosen appearance is kept. */
const STORAGE_KEY = "fmlibre.appearance";

function isAppearance(value: string | null): value is Appearance {
  return value === "system" || value === "light" || value === "dark";
}

/** The appearance chosen earlier; the system one when none is saved or it cannot be read. */
function savedAppearance(): Appearance {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isAppearance(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

let current: Appearance = savedAppearance();

/** The appearance of this run. */
export function appearance(): Appearance {
  return current;
}

function systemIsDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Puts `value` on the page: the night edition, or the day one. */
export function applyAppearance(value: Appearance = current): void {
  const dark = value === "dark" || (value === "system" && systemIsDark());
  document.documentElement.dataset.appearance = value;
  document.documentElement.classList.toggle("night", dark);
}

/**
 * Makes `next` the appearance and keeps it. Storage can be unavailable (a private window, a blocked
 * site setting); the page still turns for this run.
 */
export function setAppearance(next: Appearance): void {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice still applies until the window is closed.
  }
  applyAppearance(next);
}

applyAppearance();

try {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (current === "system") {
      applyAppearance("system");
    }
  });
} catch {
  // Without a system setting the saved choice still applies, and system stays the day edition.
}
