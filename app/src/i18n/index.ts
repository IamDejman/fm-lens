// The language of the UI. It is chosen once, when the app starts: the language saved by the switch in the sidebar,
// otherwise Turkish for a Turkish browser or system and English for everything else. Changing it saves the choice and
// reloads the window, so nothing in the app has to react to a language change while it runs.

import { en, type Strings } from "./en";
import { tr } from "./tr";

export type Locale = "en" | "tr";

/** Where the chosen language is kept. */
const STORAGE_KEY = "fmlibre.locale";

/** The language the user chose earlier; null when none is saved, or when the storage cannot be read. */
function savedLocale(): Locale | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "en" || saved === "tr" ? saved : null;
  } catch {
    return null;
  }
}

/** Turkish when the browser or system is set to Turkish, English otherwise. */
function systemLocale(): Locale {
  return window.navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

/** The language of this run. */
export const locale: Locale = savedLocale() ?? systemLocale();

/** The text of the language in use. `labels.ts` hands it out to the components. */
export const strings: Strings = locale === "tr" ? tr : en;

/**
 * The tag dates and numbers are formatted by (see `format.ts`): Turkish conventions for Turkish, British ones for
 * English, as FM is British.
 */
export const intlLocale = locale === "tr" ? "tr-TR" : "en-GB";

// Browsers use the language of the page for hyphenation, spell checking and upper-casing: the dotted İ of the table
// headers, which are upper-cased by the style sheet, depends on it.
document.documentElement.lang = locale;

/**
 * Makes `next` the language and reloads the window to apply it. The choice is saved first, so that the reload picks
 * it up; when it cannot be saved the window is left alone, as the reload would only bring the old language back.
 * Callers that have edits pending ask the user first (see `askToLeave`).
 */
export function setLocale(next: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    return;
  }
  window.location.reload();
}
