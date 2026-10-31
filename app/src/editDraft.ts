// What the inputs of an edit session hold and what Apply would write. No React here: the components only draw it.

import { dateFromNumber, editFor, isoFromNumber, numberFromIso, shownRange, shownValue } from "./editing";
import { formatDate, formatNumber, formatPounds } from "./format";
import { editText, profileText } from "./labels";
import type { EditField, FieldEdit, FieldValues } from "./types";

/**
 * The text of each input that was typed into, by field key; the others still show the value the game had. A number
 * input holds the number as typed, a date input `YYYY-MM-DD` (or nothing while the date is not whole).
 */
export type Typed = Partial<Record<string, string>>;

/** How the text of an input stands against the value the game had. */
export type Verdict =
  | { status: "same" }
  | { status: "changed"; shown: number; edit: FieldEdit }
  | { status: "invalid" };

const SAME: Verdict = { status: "same" };
const INVALID: Verdict = { status: "invalid" };

/**
 * The value `text` stands for in the input of `field`, as shown (for a date, the number like 20290630); null when
 * it stands for none: empty, not a whole number, or for a date not a whole, real `YYYY-MM-DD`.
 */
function parseInput(field: EditField, text: string): number | null {
  const trimmed = text.trim();
  if (field.kind === "date") {
    return numberFromIso(trimmed);
  }
  const shown = Number(trimmed);
  return trimmed === "" || !Number.isInteger(shown) ? null : shown;
}

/** What the input of `field` holds for the value `shown`: the number, or `YYYY-MM-DD` for a date. */
function inputText(field: EditField, shown: number): string {
  return field.kind === "date" ? isoFromNumber(shown) : String(shown);
}

/**
 * A value of `field`, as shown, written out: a date as the app shows dates, an amount of money in pounds, anything
 * else as a number. A field the table lacks (`undefined`) is a number.
 */
export function valueText(field: EditField | undefined, shown: number): string {
  switch (field?.kind) {
    case "date":
      return formatDate(dateFromNumber(shown)) || String(shown);
    case "i32":
      // FM stores a negative transfer budget when the board has not set one.
      return field.key === "finance.transfer_budget" && shown < 0 ? profileText.notSet : formatPounds(shown);
    default:
      return formatNumber(shown);
  }
}

/**
 * Whether `text` in the input of `field` is a change to write, no change, or unusable: empty, not a whole number
 * (a date: not a whole, real date), or outside what the input takes. `stored` is the value the game had when
 * editing began. The value the game shows for it is no change, so an attribute's stored value is not rounded for
 * nothing, and an `undefined` text is the input that was not touched.
 */
export function judge(field: EditField, stored: number, text: string | undefined): Verdict {
  if (text === undefined) {
    return SAME;
  }
  const shown = parseInput(field, text);
  if (shown === null) {
    return INVALID;
  }
  if (shown === shownValue(field, stored)) {
    return SAME;
  }
  const { min, max } = shownRange(field);
  const edit = shown < min || shown > max ? null : editFor(field, stored, shown);
  return edit === null ? INVALID : { status: "changed", shown, edit };
}

/** How one input stands. */
export interface InputState {
  /** The field the input is for: its kind says what the input is (a number, an amount of money, a date). */
  field: EditField;
  /** What the input holds: the number as typed, or `YYYY-MM-DD` for a date. */
  text: string;
  /** The values it takes, as shown (for a date, numbers like 20290630: see `isoFromNumber`). */
  range: { min: number; max: number };
  /** "changed": Apply would write it. "invalid": it cannot be written, or the game refused it. */
  status: "same" | "changed" | "invalid";
  /** The value the game showed when editing began, as shown. */
  was: number;
  /** Why it is invalid. */
  message: string | null;
}

/** What to tell about an input that cannot be applied, by what it takes. */
function invalidMessage(field: EditField, range: { min: number; max: number }): string {
  switch (field.kind) {
    case "date":
      return editText.invalidDate(valueText(field, range.min), valueText(field, range.max));
    case "i32":
      return editText.invalidMoney(valueText(field, range.min), valueText(field, range.max));
    default:
      return editText.invalid(range.min, range.max);
  }
}

/**
 * The input of `field`, which holds `text` (or was not touched, for `undefined`) while the game had `stored`.
 * `refusal` is the reason the game gave when it refused to write the value last time.
 */
export function inputState(
  field: EditField,
  stored: number,
  text: string | undefined,
  refusal: string | undefined,
): InputState {
  const verdict = judge(field, stored, text);
  const range = shownRange(field);
  const was = shownValue(field, stored);
  return {
    field,
    text: text ?? inputText(field, was),
    range,
    status: verdict.status === "invalid" || refusal !== undefined ? "invalid" : verdict.status,
    was,
    message: verdict.status === "invalid" ? invalidMessage(field, range) : (refusal ?? null),
  };
}

/** A change Apply would write. */
export interface Pending {
  field: EditField;
  /** The value the game showed when editing began, and the one typed: both as shown (see `valueText`). */
  was: number;
  now: number;
  /** The value the game had when editing began, as stored. */
  wasStored: number;
  /** What to send. */
  edit: FieldEdit;
}

export interface Summary {
  /** The changes, in the order of the field table. */
  changes: Pending[];
  /** The keys of the inputs that hold something that cannot be written. */
  invalid: string[];
}

/** The changes and the unusable inputs among everything that was typed. */
export function summarize(fields: readonly EditField[], start: FieldValues, typed: Typed): Summary {
  const summary: Summary = { changes: [], invalid: [] };
  for (const field of fields) {
    const stored = start[field.key];
    if (stored === undefined) {
      continue;
    }
    const verdict = judge(field, stored, typed[field.key]);
    if (verdict.status === "changed") {
      summary.changes.push({
        field,
        was: shownValue(field, stored),
        now: verdict.shown,
        wasStored: stored,
        edit: verdict.edit,
      });
    } else if (verdict.status === "invalid") {
      summary.invalid.push(field.key);
    }
  }
  return summary;
}
