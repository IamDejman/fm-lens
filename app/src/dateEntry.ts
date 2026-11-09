// A date as it is typed: the day, the month and the year in the order of the language, e.g. "20/07/2028". A date input
// of the browser cannot be used for this: WebKit (the Mac app) never moves from the day to the month on its own, so
// "20072028" typed in one go ended as the 28th of the month it started on.

import { numberFromIso } from "./editing";

export type DatePart = "day" | "month" | "year";

/** How the language writes a date in digits: the order of its parts and the mark between them. */
export interface DateLayout {
  order: readonly DatePart[];
  separator: string;
}

const WIDTH: Record<DatePart, number> = { day: 2, month: 2, year: 4 };
const DAY_FIRST: readonly DatePart[] = ["day", "month", "year"];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The layout of `locale`: day, month, year with "/" when the language has no order or mark of its own to offer. */
export function dateLayout(locale: string): DateLayout {
  const parts = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: "UTC",
  }).formatToParts(new Date(Date.UTC(2001, 1, 3)));
  const order = parts.flatMap((part) =>
    part.type === "day" || part.type === "month" || part.type === "year" ? [part.type] : [],
  );
  const mark = parts.find((part) => part.type === "literal")?.value.trim().charAt(0) ?? "";
  return {
    order: order.length === 3 && new Set(order).size === 3 ? order : DAY_FIRST,
    separator: mark !== "" && "/.-".includes(mark) ? mark : "/",
  };
}

/** `YYYY-MM-DD` as the layout writes it ("20/07/2028"); anything else as it is. */
export function dateText(iso: string, layout: DateLayout): string {
  const match = ISO.exec(iso);
  if (!match) {
    return iso;
  }
  const part: Record<DatePart, string> = { year: match[1], month: match[2], day: match[3] };
  return layout.order.map((key) => part[key]).join(layout.separator);
}

/**
 * The `YYYY-MM-DD` of a typed date; null until it is a whole, real one. The parts may be split by any mark
 * ("2/7/2028", "20.07.2028"), or not at all when all eight digits are there ("20072028"); `YYYY-MM-DD` itself is
 * taken too, so a pasted one or one set by a tool is read the same in every language.
 */
export function isoFromDateText(text: string, layout: DateLayout): string | null {
  const trimmed = text.trim();
  if (numberFromIso(trimmed) !== null) {
    return trimmed;
  }
  if (/[^\d\s/.-]/.test(trimmed)) {
    return null;
  }
  const runs = trimmed.split(/\D+/).filter((run) => run !== "");
  const digits = runs.length === 1 && runs[0].length === 8 ? splitRun(runs[0], layout) : runs;
  if (digits.length !== 3) {
    return null;
  }
  const part = Object.fromEntries(layout.order.map((key, at) => [key, digits[at]])) as Record<DatePart, string>;
  if (!/^\d{1,2}$/.test(part.day) || !/^\d{1,2}$/.test(part.month) || !/^\d{4}$/.test(part.year)) {
    return null;
  }
  const iso = `${part.year}-${part.month.padStart(2, "0")}-${part.day.padStart(2, "0")}`;
  return numberFromIso(iso) !== null ? iso : null;
}

/** Eight digits cut into the parts of the layout. */
function splitRun(run: string, layout: DateLayout): string[] {
  let at = 0;
  return layout.order.map((key) => run.slice(at, (at += WIDTH[key])));
}

/**
 * What the input shows for `text` as it is typed at its end: the digits fill the day, the month and the year in turn,
 * and the mark between them is written as soon as a part is whole. A part is whole with all its digits, with a mark
 * typed after it ("2/" is "02/"), or with a first digit no two-digit day or month starts with ("4" is "04/").
 */
export function typedDateText(text: string, layout: DateLayout): string {
  const closed = /\D$/.test(text);
  const runs = text.split(/\D+/).filter((run) => run !== "");
  const parts: string[] = [];
  for (const key of layout.order) {
    let run = runs.shift();
    if (run === undefined) {
      break;
    }
    const width = WIDTH[key];
    if (run.length > width) {
      runs.unshift(run.slice(width));
      run = run.slice(0, width);
    } else if (run.length === 1 && width === 2) {
      const last = runs.length === 0;
      if ((last && closed) || !last || Number(run) > (key === "day" ? 3 : 1)) {
        run = `0${run}`;
      }
    }
    parts.push(run);
  }
  const lastKey = layout.order[parts.length - 1];
  const whole = parts.length > 0 && parts[parts.length - 1].length === WIDTH[lastKey];
  return parts.join(layout.separator) + (whole && parts.length < 3 ? layout.separator : "");
}
