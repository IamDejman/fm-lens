// The tables of editable fields, which the profiles and the Changes view share.

import { editFields, listNations } from "./editing";
import { nameNations } from "./labels";
import type { EditField, Entity } from "./types";

const tables = new Map<Entity, Promise<EditField[]>>();

/**
 * The editable fields of players, of staff or of clubs. The table never changes during a connection, so it is
 * fetched once.
 */
export function fieldTable(entity: Entity): Promise<EditField[]> {
  let table = tables.get(entity);
  if (table === undefined) {
    const fetched = editFields(entity).then(withNations);
    table = fetched;
    tables.set(entity, fetched);
    // A failed fetch is not kept: the next call asks again.
    fetched.catch(() => {
      if (tables.get(entity) === fetched) {
        tables.delete(entity);
      }
    });
  }
  return table;
}

/**
 * The table with the nations its nation field can be set to as the field's choices, so that it is picked from a
 * select by name. The game has no list of nations of its own: they are the nations of the people in the lists.
 */
async function withNations(table: EditField[]): Promise<EditField[]> {
  if (!table.some((field) => field.kind === "pointer")) {
    return table;
  }
  const nations = await listNations();
  nameNations(nations);
  const choices = nations.map((nation) => nation.address);
  return table.map((field) => (field.key === "nation" ? { ...field, choices } : field));
}

/** The kinds of thing that have a table. */
const ENTITIES: readonly Entity[] = ["player", "staff", "club", "nation", "official"];

/** What a field is kept under in `fieldIndex`: `player:attribute.finishing`. */
export const fieldIndexKey = (entity: Entity, key: string) => `${entity}:${key}`;

/**
 * Every editable field by `fieldIndexKey`, to tell what kind of value a logged change or a failure holds (an
 * attribute, a date, an amount of money) and how it is shown.
 */
export async function fieldIndex(): Promise<ReadonlyMap<string, EditField>> {
  const all = await Promise.all(ENTITIES.map(fieldTable));
  return new Map(all.flat().map((field) => [fieldIndexKey(field.entity, field.key), field] as const));
}

/** Forgets the tables, for the next connection. */
export function forgetFieldTables(): void {
  tables.clear();
}
