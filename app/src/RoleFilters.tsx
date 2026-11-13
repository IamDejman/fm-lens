// Roles in the player list's filters: a row each, with the role and, optionally, the least rating a player must have
// in it. Every role picked is also a column of the list.

import { useId, useState } from "react";
import { chipLabel, type FilterChip } from "./FilterBar";
import { playerListText, scoutText } from "./labels";
import { isRecord } from "./restore";
import { ROLE_GROUPS, ROLE_IDS, roleLabel } from "./scoutRoles";
import type { RoleBound } from "./types";

const text = playerListText.filters;

/** A role row as its inputs hold it: the role id ("" until one is picked) and the least rating, as typed. */
export interface RoleRow {
  role: string;
  min: string;
}

/** Ratings run from 0 to 100. */
const SCALE = { min: 0, max: 100 };

/** The most rows: the list shows a column for each. */
export const MAX_ROLE_ROWS = 6;

function least(input: string): number | undefined {
  if (input.trim() === "") {
    return undefined;
  }
  const value = Number(input);
  return Number.isFinite(value) ? Math.min(SCALE.max, Math.max(SCALE.min, Math.round(value))) : undefined;
}

/** The roles the rows ask for: each picked role once, with its least rating where one is typed. */
export function toRoleBounds(rows: readonly RoleRow[]): RoleBound[] {
  const seen = new Set<string>();
  return rows.flatMap((row): RoleBound[] => {
    if (row.role === "" || seen.has(row.role)) {
      return [];
    }
    seen.add(row.role);
    const min = least(row.min);
    return [min === undefined ? { role: row.role } : { role: row.role, min }];
  });
}

/** A chip for each picked role ("Anchor (Defend): ≥ 70", or the role alone when it is only a column). */
export function roleChips(rows: readonly RoleRow[], onChange: (rows: RoleRow[]) => void): FilterChip[] {
  return rows.flatMap((row, index): FilterChip[] => {
    if (row.role === "") {
      return [];
    }
    const min = least(row.min);
    return [
      {
        key: `role-${index}`,
        label: min === undefined ? roleLabel(row.role) : chipLabel(roleLabel(row.role), `≥ ${min}`),
        remove: () => onChange(rows.filter((_, at) => at !== index)),
      },
    ];
  });
}

/** The rows in a stored value; a role this version does not know becomes no role. */
export function readRoleRows(value: unknown): RoleRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .slice(0, MAX_ROLE_ROWS)
    .map((row) => ({
      role: typeof row.role === "string" && ROLE_IDS.has(row.role) ? row.role : "",
      min: typeof row.min === "string" && row.min.length <= 3 && least(row.min) !== undefined ? row.min : "",
    }));
}

interface RoleFiltersProps {
  rows: readonly RoleRow[];
  onChange: (rows: RoleRow[]) => void;
}

export function RoleFilters({ rows, onChange }: RoleFiltersProps) {
  const heading = useId();
  const [added, setAdded] = useState(false);
  const set = (index: number, row: RoleRow) => onChange(rows.map((old, i) => (i === index ? row : old)));
  const name = (role: string) => (role === "" ? "" : roleLabel(role));

  return (
    <div className="filter-attributes" role="group" aria-labelledby={heading}>
      <span id={heading}>{text.roles.heading}</span>
      {rows.map((row, index) => (
        <div key={index} className="attribute-bound">
          <select
            aria-label={text.roles.role}
            autoFocus={added && index === rows.length - 1}
            value={row.role}
            onChange={(e) => set(index, { ...row, role: e.currentTarget.value })}
          >
            <option value="">{text.roles.pick}</option>
            {ROLE_GROUPS.map(({ group, ids }) => (
              <optgroup key={group} label={scoutText.roleGroups[group]}>
                {ids.map((id) => (
                  <option key={id} value={id}>
                    {roleLabel(id)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <input
            type="number"
            min={SCALE.min}
            max={SCALE.max}
            step={1}
            placeholder={text.minPlaceholder}
            aria-label={text.roles.min(name(row.role))}
            value={row.min}
            onChange={(e) => set(index, { ...row, min: e.currentTarget.value })}
          />
          <button
            type="button"
            className="bound-remove"
            aria-label={text.roles.remove(name(row.role))}
            title={text.roles.remove(name(row.role))}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      {rows.length < MAX_ROLE_ROWS && (
        <button
          type="button"
          className="bound-add"
          onClick={() => {
            setAdded(true);
            onChange([...rows, { role: "", min: "" }]);
          }}
        >
          {text.roles.add}
        </button>
      )}
    </div>
  );
}
