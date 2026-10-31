// Editing: the Rust commands that change the game, and how stored values are shown.

import { call } from "./api";
import type {
  ApplyReport,
  BatchUndo,
  EditField,
  Entity,
  FieldEdit,
  FieldValues,
  FmDate,
  LoggedChange,
  MassFilters,
  MassOperation,
  MassPreview,
  MassReport,
} from "./types";

/** The fields of players or of staff the editor can change, in display order. */
export const editFields = (entity: Entity) => call<EditField[]>("edit_fields", { entity });

/** Every editable field of one player or member of staff, as stored, read from the game now. */
export const readValues = (entity: Entity, uid: number) => call<FieldValues>("read_values", { entity, uid });

/** Writes `edits` (values as stored). Each one is checked and written on its own; refused ones change nothing. */
export const applyEdits = (entity: Entity, uid: number, edits: FieldEdit[]) =>
  call<ApplyReport>("apply_edits", { entity, uid, edits });

/** Every change written this session, newest first. */
export const changeLog = () => call<LoggedChange[]>("change_log");

/** Writes back the old value of a logged change; fails if the game has changed the value since. */
export const undoChange = (id: number) => call<LoggedChange>("undo_change", { id });

/** The value the game shows for a stored one: attributes are stored 0–100 and shown 1–20. */
export function shownValue(field: EditField, stored: number): number {
  return field.scale === "attribute" ? Math.min(20, Math.max(1, Math.floor((stored + 2) / 5))) : stored;
}

/** The stored value to write for a value typed as shown: the middle of the stored values the game shows as it. */
export function storedValue(field: EditField, shown: number): number {
  return field.scale === "attribute" ? shown * 5 : shown;
}

/** The values an input for `field` takes, as shown. */
export function shownRange(field: EditField): { min: number; max: number } {
  return { min: shownValue(field, field.min), max: shownValue(field, field.max) };
}

/**
 * The edit to send when the input of `field` holds `shown`, given the stored value it started from: null when
 * the game would show the same value as before, so an attribute's stored value is not rounded for nothing.
 */
export function editFor(field: EditField, stored: number, shown: number): FieldEdit | null {
  return shownValue(field, stored) === shown ? null : { field: field.key, value: storedValue(field, shown) };
}

/** The date a stored date value (a number like 20290630) stands for; null for 0 or anything that is not a date. */
export function dateFromNumber(value: number): FmDate | null {
  const year = Math.floor(value / 10_000);
  const month = Math.floor(value / 100) % 100;
  const day = value % 100;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate(); // days in that month
  return value > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days ? { year, month, day } : null;
}

/** The stored value of a date: a number like 20290630. */
export const numberFromDate = (date: FmDate): number => date.year * 10_000 + date.month * 100 + date.day;

/** A stored date value as a date input holds it (`YYYY-MM-DD`); "" for 0 or anything that is not a date. */
export function isoFromNumber(value: number): string {
  const date = dateFromNumber(value);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return date ? `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}` : "";
}

/** The stored date value of a date input's `YYYY-MM-DD`; null until it holds a whole, real date. */
export function numberFromIso(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const value = Number(match[1]) * 10_000 + Number(match[2]) * 100 + Number(match[3]);
  return dateFromNumber(value) ? value : null;
}

/**
 * Works out a mass edit: `operations` on every player, member of staff or club that `query` and the entity's
 * filter in `filters` select, from the values the game holds now. Nothing is written until `applyMassEdit`.
 */
export const planMassEdit = (entity: Entity, query: string, filters: MassFilters, operations: MassOperation[]) =>
  call<MassPreview>("plan_mass_edit", { entity, query, filters, operations });

/** Writes the mass edit previewed as `id`, exactly as shown; each change only if the value is still the one previewed. */
export const applyMassEdit = (id: number) => call<MassReport>("apply_mass_edit", { id });

/** Undoes every change of a mass edit that is not undone yet. */
export const undoBatch = (batch: number) => call<BatchUndo>("undo_batch", { batch });
