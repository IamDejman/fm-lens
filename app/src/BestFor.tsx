// Best for: the select that ranks a list for a recipe (see `recipes.ts`), and the column of how well each row fits.

import { useState } from "react";
import { useHoverNote } from "./HoverNote";
import { fitParts, type Recipe } from "./recipes";
import { bestForText, playerListText, profileText } from "./labels";
import { restored, useSnapshot } from "./restore";
import type { ListSort } from "./SortHeader";
import type { Fit } from "./types";

/** The recipe a list is ranked for, kept in the snapshot of the window under `name`; none until one is picked. */
export function useBestFor(name: string, recipes: readonly Recipe[]) {
  const [key, setKey] = useState(() =>
    restored(name, (value) => (recipes.some((recipe) => recipe.key === value) ? String(value) : "")),
  );
  useSnapshot(name, () => key);
  return { key, recipe: recipes.find((recipe) => recipe.key === key), set: setKey };
}

interface BestForSelectProps {
  recipes: readonly Recipe[];
  /** The key of the recipe picked; "" for none. */
  value: string;
  onChange: (key: string) => void;
}

export function BestForSelect({ recipes, value, onChange }: BestForSelectProps) {
  return (
    <label className="best-for">
      <span>{bestForText.label}</span>
      <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="">{playerListText.filters.any}</option>
        {recipes.map((recipe) => (
          <option key={recipe.key} value={recipe.key}>
            {recipe.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The header of the fit column: the list is by fit until another header is clicked, and this one puts it back. */
export function FitHeader<Sort extends string>({ sort }: { sort: ListSort<Sort> }) {
  return (
    <th className="num col-fit" aria-sort={sort.order === null ? "descending" : undefined}>
      <button
        type="button"
        className="sort"
        title={playerListText.sortBy(bestForText.fitName)}
        onClick={() => sort.set(null)}
      >
        {bestForText.fit}
        <svg className="sort-arrow" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M5 8.5v-7M2 4.5l3-3 3 3" />
        </svg>
      </button>
    </th>
  );
}

/** How well a row fits, out of 100; the box over it has the attributes it is made of. */
export function FitCell({ recipe, fit }: { recipe: Recipe; fit: Fit | undefined }) {
  const note = useHoverNote(fit && fitParts(recipe, fit));
  return (
    <td className="num col-fit" {...note.target}>
      {fit ? Math.round(fit.score) : profileText.none}
      {note.box}
    </td>
  );
}
