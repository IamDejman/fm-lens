// Editing: the Rust commands that change the game, and how stored values are shown.

import { call } from "./api";
import type { ApplyReport, EditField, Entity, FieldEdit, FieldValues, LoggedChange } from "./types";

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
