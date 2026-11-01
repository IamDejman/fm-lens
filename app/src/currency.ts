// The currency the app shows money in. The game keeps every amount in pounds and converts it only to show it, at the
// rates its database holds for each currency, year by year; the app does the same with the latest of those rates, so
// that it shows what FM shows. Like the language, the currency is chosen once, when the app starts: changing it saves
// the choice and reloads the window (see `setCurrency`).

import { saveSnapshot } from "./restore";

/**
 * The currencies on offer, in the order of the menu, with what one pound is worth in each: FM27's own rates for 2025,
 * the last year its database holds (`db::CURRENCY_RECORD`, read from the game on 1 November 2026). With them a
 * billion euros, Kylian Mbappé's release clause, is the 859,031,872 pounds the game keeps, give or take a few million.
 */
const RATES = {
  GBP: 1,
  EUR: 1.16756499,
  USD: 1.31842196,
  TRY: 52.2383461,
  BRL: 7.36309385,
  ARS: 1644.82361,
  MXN: 25.3028679,
} as const;

export type Currency = keyof typeof RATES;

export const CURRENCIES = Object.keys(RATES) as Currency[];

/** Where the chosen currency is kept. */
const STORAGE_KEY = "fmlibre.currency";

function isCurrency(value: string | null): value is Currency {
  return value !== null && Object.prototype.hasOwnProperty.call(RATES, value);
}

/** The currency the user chose earlier; pounds, as the game keeps them, when none is saved or it cannot be read. */
function savedCurrency(): Currency {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isCurrency(saved) ? saved : "GBP";
  } catch {
    return "GBP";
  }
}

/** The currency of this run. */
export const currency: Currency = savedCurrency();

const rate: number = RATES[currency];

/** Whether amounts are shown in another currency than the pounds the game keeps. */
export const converts = currency !== "GBP";

/** An amount the game keeps, in pounds, in the chosen currency, unrounded: for a ticket price's decimals. */
export const inCurrency = (pounds: number): number => pounds * rate;

/** An amount the game keeps, in pounds, as shown: in the chosen currency, to the whole unit. */
export const toShown = (pounds: number): number => Math.round(pounds * rate);

/**
 * The pounds to write for an amount typed in the chosen currency: the nearest whole pound, as the game keeps no less.
 * In a currency worth less than a pound, an amount the game then shows may differ a little from the one typed.
 */
export const toPounds = (shown: number): number => Math.round(shown / rate);

/**
 * Makes `next` the currency and reloads the window to apply it, as a new language is (see `setLocale`): the choice is
 * saved first, and what the window shows too; when the choice cannot be saved, the window is left alone.
 */
export function setCurrency(next: Currency): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    return;
  }
  saveSnapshot();
  window.location.reload();
}
