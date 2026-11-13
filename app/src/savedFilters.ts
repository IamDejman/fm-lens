// The filters the user saved under a name, for each list: what is kept, how it is read back, and the hook the filter
// bars use. They are kept in `localStorage`, which anyone can edit and which can be unavailable (a private window, blocked site
// data): every access is guarded, and every entry is checked field by field, with a default for what is wrong.

import { useState } from "react";
import { PLAYER_ATTRIBUTES, readAttributeRows } from "./AttributeFilters";
import { intlLocale } from "./i18n";
import { NO_PLAYER_FILTERS, POSITION_ORDER, TRAIT_CHOICES, type PlayerFilterFields } from "./PlayerFilters";
import { isRecord } from "./restore";
import { readListOrder } from "./SortHeader";
import type { ListOrder, PlayerColumnSort, PlayerOrder, PlayerSort } from "./types";

/** Where the player list's saved filters are kept: a JSON array of `SavedPlayerFilter`. */
export const STORAGE_KEY = "fmlens.savedPlayerFilters";

/** The most filters that are kept, and the longest name one has. */
export const MAX_SAVED = 20;
export const MAX_NAME_LENGTH = 50;

/** A filter the user saved: what the filter bar held and how the list was sorted, under a name of the user's own. */
export interface SavedFilter<Fields, Order> {
  /** As the user typed it. */
  name: string;
  fields: Fields;
  /** The sort a column header was clicked for; null for the order the list starts in. */
  order: Order | null;
}

export type SavedPlayerFilter = SavedFilter<PlayerFilterFields, PlayerOrder>;

/** What a list's saved filters are: where they are kept, and how its fields and its sort are read from a stored value. */
export interface SavedFilterKind<Fields, Order> {
  /** A JSON array of `SavedFilter`. */
  storageKey: string;
  readFields: (value: unknown) => Fields;
  readOrder: (value: unknown) => Order | null;
}

/** What the filter bar's inputs can hold at the most, however a stored value got there. */
const MAX_TEXT_LENGTH = 200;

/** Every column sort there is; the type makes the table fail to compile when one is added without being listed here. */
const SORTS: Record<PlayerColumnSort, true> = {
  currentAbility: true,
  potentialAbility: true,
  age: true,
  name: true,
  nation: true,
  club: true,
  contractExpires: true,
  value: true,
  wage: true,
  reputation: true,
};

/** What an attribute's sort starts with: "attribute.finishing". */
export const ATTRIBUTE_SORT = "attribute.";

/** The attributes a column can show and sort by: a player's own, not the personality ratings of the filter rows. */
const SORTED_ATTRIBUTES = PLAYER_ATTRIBUTES.groups
  .flatMap((group) => group.keys)
  .filter((key) => !key.includes("."));

/** The sorts, for a sort that is read back (see `readListOrder`): the columns, then each attribute. */
export const PLAYER_SORTS: readonly PlayerSort[] = [
  ...(Object.keys(SORTS) as PlayerColumnSort[]),
  ...SORTED_ATTRIBUTES.map((key): PlayerSort => `${ATTRIBUTE_SORT}${key}`),
];

/** The positions in a stored value, in the filter's order; one saved before the filter took several is one position. */
function readPositions(value: unknown, earlier: unknown): string[] {
  const given = Array.isArray(value) ? value : typeof earlier === "string" ? [earlier] : [];
  return POSITION_ORDER.filter((key) => given.includes(key));
}

/**
 * The inputs of a filter bar from a stored value, against `defaults`: a text stays a text and a flag a flag; a field
 * that is missing or is of another kind is as in `defaults`. What a text may say is for the list to check.
 */
export function readPlain<Fields extends Record<string, string | boolean>>(value: unknown, defaults: Fields): Fields {
  const given = isRecord(value) ? value : {};
  const fields: Record<string, string | boolean> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const stored = given[key];
    fields[key] = typeof fallback === "boolean" ? (typeof stored === "boolean" ? stored : fallback) : textOr(stored, fallback);
  }
  return fields as Fields;
}

/** A date input's `YYYY-MM-DD`. */
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;

/** A number as a number input holds it: empty, or something `Number` reads. */
const isNumberText = (text: string) => text.trim() === "" || Number.isFinite(Number(text));

/** `value` when it is a text that `fits`, `fallback` otherwise. */
function textOr(value: unknown, fallback: string, fits: (text: string) => boolean = () => true): string {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH && fits(value) ? value : fallback;
}

/**
 * The fields of the filter bar from a stored value; a field that is missing or is not what the bar holds is empty. It
 * also brings the bar back after the language was switched (see `restore.ts`).
 */
export function readFields(value: unknown): PlayerFilterFields {
  const given = isRecord(value) ? value : {};
  const none = NO_PLAYER_FILTERS;
  return {
    positions: readPositions(given.positions, given.position),
    minAge: textOr(given.minAge, none.minAge, isNumberText),
    maxAge: textOr(given.maxAge, none.maxAge, isNumberText),
    minCurrentAbility: textOr(given.minCurrentAbility, none.minCurrentAbility, isNumberText),
    maxCurrentAbility: textOr(given.maxCurrentAbility, none.maxCurrentAbility, isNumberText),
    minPotentialAbility: textOr(given.minPotentialAbility, none.minPotentialAbility, isNumberText),
    maxPotentialAbility: textOr(given.maxPotentialAbility, none.maxPotentialAbility, isNumberText),
    minHeight: textOr(given.minHeight, none.minHeight, isNumberText),
    maxHeight: textOr(given.maxHeight, none.maxHeight, isNumberText),
    minWage: textOr(given.minWage, none.minWage, isNumberText),
    maxWage: textOr(given.maxWage, none.maxWage, isNumberText),
    minValue: textOr(given.minValue, none.minValue, isNumberText),
    maxValue: textOr(given.maxValue, none.maxValue, isNumberText),
    minReputation: textOr(given.minReputation, none.minReputation, isNumberText),
    maxReputation: textOr(given.maxReputation, none.maxReputation, isNumberText),
    nation: textOr(given.nation, none.nation),
    club: textOr(given.club, none.club),
    freeAgents: typeof given.freeAgents === "boolean" ? given.freeAgents : none.freeAgents,
    contractExpiresBy: textOr(
      given.contractExpiresBy,
      none.contractExpiresBy,
      (text) => text === "" || DATE_TEXT.test(text),
    ),
    transferListed: typeof given.transferListed === "boolean" ? given.transferListed : none.transferListed,
    loanListed: typeof given.loanListed === "boolean" ? given.loanListed : none.loanListed,
    trait: textOr(given.trait, none.trait, (text) => text === "" || TRAIT_CHOICES.includes(Number(text))),
    attributes: readAttributeRows(given.attributes, PLAYER_ATTRIBUTES),
  };
}

/**
 * The sort from a stored value; the list's own order when it is missing or is not a sort. It also brings the sort back
 * after the language was switched.
 */
export function readOrder(value: unknown): PlayerOrder | null {
  return readListOrder(value, PLAYER_SORTS);
}

/** The player list's saved filters, kept where they were before the other lists had any. */
export const PLAYER_SAVED: SavedFilterKind<PlayerFilterFields, PlayerOrder> = {
  storageKey: STORAGE_KEY,
  readFields,
  readOrder,
};

/** The saved filters of the list called `list`, with the sorts its columns offer. */
export function savedKind<Fields, Sort extends string>(
  list: string,
  readFields: (value: unknown) => Fields,
  sorts: readonly Sort[],
): SavedFilterKind<Fields, ListOrder<Sort>> {
  return { storageKey: `fmlens.savedFilters.${list}`, readFields, readOrder: (value) => readListOrder(value, sorts) };
}

/** A name as it is kept: without the spaces around it, and no longer than a name may be. */
export function cleanName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH).trim();
}

/** Whether two names are the same one: names differing in case only are. */
const sameName = (a: string, b: string) => a.toLocaleLowerCase(intlLocale) === b.toLocaleLowerCase(intlLocale);

/**
 * The saved filters in a stored value. An entry without a name is left out, and so is a second one with a name that is
 * taken; so are the entries after the first `MAX_SAVED`. What is wrong in the rest of an entry is replaced by the
 * defaults, field by field.
 */
export function readSaved<Fields = PlayerFilterFields, Order = PlayerOrder>(
  value: unknown,
  kind: SavedFilterKind<Fields, Order> = PLAYER_SAVED as unknown as SavedFilterKind<Fields, Order>,
): SavedFilter<Fields, Order>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const saved: SavedFilter<Fields, Order>[] = [];
  for (const entry of value) {
    if (saved.length >= MAX_SAVED) {
      break;
    }
    if (!isRecord(entry) || typeof entry.name !== "string") {
      continue;
    }
    const name = cleanName(entry.name);
    if (name === "" || saved.some((other) => sameName(other.name, name))) {
      continue;
    }
    saved.push({ name, fields: kind.readFields(entry.fields), order: kind.readOrder(entry.order) });
  }
  return saved;
}

/** Whether the filter bar and the sort are as `saved` has them. */
export function isInEffect<Fields, Order>(saved: SavedFilter<Fields, Order>, fields: Fields, order: Order | null): boolean {
  return sameJson([saved.fields, saved.order]) === sameJson([fields, order]);
}

/** `value` as JSON with every object's keys in order, so that two values with the same content read the same. */
function sameJson(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) =>
    isRecord(part) ? Object.fromEntries(Object.entries(part).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : part,
  );
}

/** The filters kept from earlier; none when nothing is kept or it cannot be read. */
function readStored<Fields, Order>(kind: SavedFilterKind<Fields, Order>): SavedFilter<Fields, Order>[] {
  try {
    const stored = window.localStorage.getItem(kind.storageKey);
    return stored === null ? [] : readSaved(JSON.parse(stored), kind);
  } catch {
    return [];
  }
}

function writeStored(storageKey: string, saved: readonly unknown[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    // Without storage the filters last until the window is closed.
  }
}

/** The saved filters, and what can be done to them. */
export interface SavedFilterList<Fields, Order> {
  /** In the order they were saved. */
  saved: readonly SavedFilter<Fields, Order>[];
  /** Whether a saved filter has this name (as `save` and `remove` take it: case aside). */
  has: (name: string) => boolean;
  /**
   * Keeps the filter under `name`, in place of the one that has the name already. False, and nothing kept, when the
   * name is a new one and `MAX_SAVED` filters are kept.
   */
  save: (name: string, fields: Fields, order: Order | null) => boolean;
  remove: (name: string) => void;
}

/** A list's saved filters: read once, when its filter bar is first shown, and written back at every change. */
export function useSavedFilters<Fields, Order>(kind: SavedFilterKind<Fields, Order>): SavedFilterList<Fields, Order> {
  const [saved, setSaved] = useState<readonly SavedFilter<Fields, Order>[]>(() => readStored(kind));

  const change = (next: readonly SavedFilter<Fields, Order>[]) => {
    setSaved(next);
    writeStored(kind.storageKey, next);
  };

  return {
    saved,
    has: (name) => saved.some((entry) => sameName(entry.name, name)),
    save: (name, fields, order) => {
      const kept = cleanName(name);
      const index = saved.findIndex((entry) => sameName(entry.name, kept));
      if (kept === "" || (index < 0 && saved.length >= MAX_SAVED)) {
        return false;
      }
      // A copy, so that what is kept does not change with the bar.
      const entry: SavedFilter<Fields, Order> = JSON.parse(JSON.stringify({ name: kept, fields, order }));
      change(index < 0 ? [...saved, entry] : saved.map((old, at) => (at === index ? entry : old)));
      return true;
    },
    remove: (name) => change(saved.filter((entry) => !sameName(entry.name, name))),
  };
}
