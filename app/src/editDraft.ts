// What the inputs of an edit session hold and what Apply would write. No React here: the components only draw it.

import { editFor, shownRange, shownValue } from "./editing";
import { editText } from "./labels";
import type { EditField, FieldEdit, FieldValues } from "./types";

/** The text of each input that was typed into, by field key; the others still show the value the game had. */
export type Typed = Partial<Record<string, string>>;

/** How the text of an input stands against the value the game had. */
export type Verdict =
  | { status: "same" }
  | { status: "changed"; shown: number; edit: FieldEdit }
  | { status: "invalid" };

const SAME: Verdict = { status: "same" };
const INVALID: Verdict = { status: "invalid" };

/**
 * Whether `text` in the input of `field` is a change to write, no change, or unusable: empty, not a whole number,
 * or outside what the input takes. `stored` is the value the game had when editing began. The value the game shows
 * for it is no change, so an attribute's stored value is not rounded for nothing, and an `undefined` text is the
 * input that was not touched.
 */
export function judge(field: EditField, stored: number, text: string | undefined): Verdict {
  if (text === undefined) {
    return SAME;
  }
  const trimmed = text.trim();
  const shown = Number(trimmed);
  if (trimmed === "" || !Number.isInteger(shown)) {
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
  /** What the input holds. */
  text: string;
  /** The values it takes, as shown. */
  range: { min: number; max: number };
  /** "changed": Apply would write it. "invalid": it cannot be written, or the game refused it. */
  status: "same" | "changed" | "invalid";
  /** The value the game showed when editing began, as shown. */
  was: number;
  /** Why it is invalid. */
  message: string | null;
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
    text: text ?? String(was),
    range,
    status: verdict.status === "invalid" || refusal !== undefined ? "invalid" : verdict.status,
    was,
    message: verdict.status === "invalid" ? editText.invalid(range.min, range.max) : (refusal ?? null),
  };
}

/** A change Apply would write. */
export interface Pending {
  field: EditField;
  /** The value the game showed when editing began, and the one typed: both as shown. */
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
