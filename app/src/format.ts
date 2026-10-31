import { intlLocale, strings } from "./i18n";
import type { FmDate, GameInfo, Storefront } from "./types";

export const STOREFRONTS: Record<Storefront, string> = strings.game.storefronts;

/** "FM27 · Game Pass 0.9.2355.0" */
export function describeGame(game: GameInfo): string {
  const edition = game.edition ? `FM${game.edition}` : strings.game.name;
  const version = game.packageVersion ? ` ${game.packageVersion}` : "";
  return `${edition} · ${STOREFRONTS[game.storefront]}${version}`;
}

const integers = new Intl.NumberFormat(intlLocale);

/**
 * A number with the thousands separators of the language ("12,345" in English, "12.345" in Turkish); `options` are
 * those of `Intl.NumberFormat`, e.g. for decimals.
 */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return (options ? new Intl.NumberFormat(intlLocale, options) : integers).format(value);
}

const dates = new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "26 Mar 1982" in English, "26 Eyl 1982" in Turkish: the date as the language writes it; nothing for no date. */
export function formatDate(date: FmDate | null): string {
  if (!date) {
    return "";
  }
  return dates.format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

/** A moment (milliseconds since 1970) as the local time of day, "14:05:09". */
export function formatTime(ms: number): string {
  const time = new Date(ms);
  return [time.getHours(), time.getMinutes(), time.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

/** A moment (milliseconds since 1970) as the local date and time, the way the language writes both. */
export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(intlLocale);
}

/** The message of a failed call: what a Rust command answers with, or the message of an error. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** "£1,234,567", grouped the way the language does it; "-£1,234" when negative, like a club's overdraft. */
export function formatPounds(amount: number): string {
  return `${amount < 0 ? "-" : ""}£${formatNumber(Math.abs(amount))}`;
}

/** Lower-cases and strips accents, matching the Rust side's `fold`. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/[øØ]/g, "o")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐ]/g, "d")
    .replace(/ß/g, "ss")
    .toLowerCase();
}
