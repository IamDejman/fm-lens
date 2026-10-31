import type { FmDate, GameInfo, Storefront } from "./types";

export const STOREFRONTS: Record<Storefront, string> = {
  gamePass: "Game Pass",
  steam: "Steam",
  epic: "Epic Games",
  unknown: "Unknown store",
};

/** "FM27 · Game Pass 0.9.2355.0" */
export function describeGame(game: GameInfo): string {
  const edition = game.edition ? `FM${game.edition}` : "Football Manager";
  const version = game.packageVersion ? ` ${game.packageVersion}` : "";
  return `${edition} · ${STOREFRONTS[game.storefront]}${version}`;
}

export function formatDate(date: FmDate | null): string {
  if (!date) {
    return "";
  }
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A moment (milliseconds since 1970) as the local time of day, "14:05:09". */
export function formatTime(ms: number): string {
  const time = new Date(ms);
  return [time.getHours(), time.getMinutes(), time.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

/** The message of a failed call: what a Rust command answers with, or the message of an error. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** "£1,234,567", grouped the way the reader's locale does it; "-£1,234" when negative, like a club's overdraft. */
export function formatPounds(amount: number): string {
  return `${amount < 0 ? "-" : ""}£${Math.abs(amount).toLocaleString()}`;
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
