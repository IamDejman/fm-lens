// Best for: the select that ranks a list for a recipe (see `recipes.ts`), and the column of how well each row fits.

import { useState } from "react";
import { useHoverNote } from "./HoverNote";
import { fitParts, type Recipe, type RecipeFit } from "./recipes";
import { bestForText, playerListText, profileText } from "./labels";
import { restored, useSnapshot } from "./restore";
import type { ListSort } from "./SortHeader";
import type { Fit, Yours } from "./types";

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

/** Beside the select: who fits best at your club, and how well. The fits of the list are read against it. */
export function YourBest({ yours }: { yours: Yours | null }) {
  const text = yours && bestForText.yours(yours.name, Math.round(yours.score));
  // The hover text has what a long name is cut to.
  return text ? <span className="your-best" title={text}>{text}</span> : null;
}

/**
 * How well a row fits, out of 100; the box over it has the attributes it is made of. A fit better than `yours`, the
 * best at your club, is marked.
 */
export function FitCell({ recipe, fit, yours }: { recipe: Recipe; fit: Fit | undefined; yours?: Yours | null }) {
  const note = useHoverNote(fit && fitParts(recipe, fit));
  const better = fit !== undefined && yours != null && fit.score > yours.score;
  return (
    <td className={better ? "num col-fit better" : "num col-fit"} {...note.target}>
      {better && (
        <svg className="better-mark" viewBox="0 0 10 10" role="img" aria-label={bestForText.better}>
          <path d="M5 1.5 9 8H1z" />
        </svg>
      )}
      {fit ? Math.round(fit.score) : profileText.none}
      {note.box}
    </td>
  );
}

/** In a profile: the recipes the person fits best, each with its score out of 100. Nothing where none fits. */
export function BestFits({ fits }: { fits: RecipeFit[] }) {
  if (fits.length === 0) {
    return null;
  }
  return (
    <section className="profile-group best-fits">
      <h3>{bestForText.label}</h3>
      <dl className="stats">
        {fits.map(({ recipe, fit }) => (
          <BestFit key={recipe.key} recipe={recipe} fit={fit} />
        ))}
      </dl>
    </section>
  );
}

function BestFit({ recipe, fit }: RecipeFit) {
  const note = useHoverNote(fitParts(recipe, fit));
  return (
    <div className="stat" {...note.target}>
      <dt>{recipe.label}</dt>
      <dd>{Math.round(fit.score)}</dd>
      {note.box}
    </div>
  );
}
