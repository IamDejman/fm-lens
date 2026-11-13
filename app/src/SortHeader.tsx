// A list's sort: the hook that keeps which column a list is sorted by, and the column header that changes it.

import { useState } from "react";
import { playerListText } from "./labels";
import { isRecord, restored, useSnapshot } from "./restore";
import type { ListOrder } from "./types";

/** A list's sort: what the search is asked for, how the headers show it, and how a header changes it. */
export interface ListSort<Sort extends string> {
  /** The sort a column header was clicked for; null until then, while the search answers in its own order. */
  order: ListOrder<Sort> | null;
  /** How the list is sorted now: `order`, or the order the search answers in; null while it is by fit instead. */
  shown: ListOrder<Sort> | null;
  /** A click on the header of `by`: the other way when the list is sorted by it, else the column's first way. */
  sortBy: (by: Sort) => void;
  /** Another sort, e.g. a saved filter's; null for the search's own order. */
  set: (order: ListOrder<Sort> | null) => void;
}

/** What a list's sort starts from. */
export interface SortStart<Sort extends string> {
  /** Every column the list sorts by: a stored sort by anything else is not one. */
  sorts: readonly Sort[];
  /** The order the search answers in, which the headers show until one is clicked. */
  start: ListOrder<Sort>;
  /** The columns whose first click sorts from A to Z or from the earliest; the others start with the highest. */
  firstAscending: readonly Sort[];
}

/** The sort in a stored value; none when it is missing or is not a sort by one of `sorts`. */
export function readListOrder<Sort extends string>(value: unknown, sorts: readonly Sort[]): ListOrder<Sort> | null {
  if (isRecord(value) && typeof value.ascending === "boolean") {
    const by = sorts.find((sort) => sort === value.by);
    return by === undefined ? null : { by, ascending: value.ascending };
  }
  return null;
}

/**
 * The sort of the list `name` keeps in the snapshot of the window (see `restore.ts`): it starts as it was before the
 * language was switched, if it was. While the list is `ranked` (see `BestFor.tsx`) the search answers by fit.
 */
export function useListSort<Sort extends string>(
  name: string,
  { sorts, start, firstAscending }: SortStart<Sort>,
  ranked = false,
): ListSort<Sort> {
  const [order, setOrder] = useState<ListOrder<Sort> | null>(() =>
    restored(name, (value) => readListOrder(value, sorts)),
  );
  useSnapshot(name, () => order);
  const shown = order ?? (ranked ? null : start);
  return {
    order,
    shown,
    sortBy: (by) => setOrder({ by, ascending: shown?.by === by ? !shown.ascending : firstAscending.includes(by) }),
    set: setOrder,
  };
}

interface SortHeaderProps<Sort extends string> {
  /** The column; it is also what the list is sorted by. */
  by: Sort;
  sort: ListSort<Sort>;
  /** What the header says. */
  label: string;
  /** What the hover text calls the column, when that is not `label`: "Sort by current ability" over "CA". */
  name?: string;
  className?: string;
}

/** A column header that sorts the list; the sorted column shows an arrow and says which way in `aria-sort`. */
export function SortHeader<Sort extends string>({ by, sort, label, name, className }: SortHeaderProps<Sort>) {
  const { shown } = sort;
  const direction = shown?.by !== by ? undefined : shown.ascending ? "ascending" : "descending";
  return (
    <th className={className} aria-sort={direction}>
      <button type="button" className="sort" title={playerListText.sortBy(name ?? label)} onClick={() => sort.sortBy(by)}>
        {label}
        <svg className="sort-arrow" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M5 8.5v-7M2 4.5l3-3 3 3" />
        </svg>
      </button>
    </th>
  );
}
