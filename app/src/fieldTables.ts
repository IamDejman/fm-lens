// The tables of editable fields, which the profiles and the Changes view share.

import { editFields } from "./editing";
import type { EditField, Entity } from "./types";

const tables = new Map<Entity, Promise<EditField[]>>();

/** The editable fields of players or of staff. The table never changes during a connection, so it is fetched once. */
export function fieldTable(entity: Entity): Promise<EditField[]> {
  let table = tables.get(entity);
  if (table === undefined) {
    const fetched = editFields(entity);
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

/** Forgets the tables, for the next connection. */
export function forgetFieldTables(): void {
  tables.clear();
}
