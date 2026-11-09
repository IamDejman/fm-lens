import { useId, type ReactNode } from "react";
import {
  attributeChips,
  AttributeFilters,
  PLAYER_ATTRIBUTES,
  toAttributeBounds,
  type AttributeRow,
} from "./AttributeFilters";
import { DateInput } from "./DateInput";
import { chipLabel, FilterBar, rangeText, type FilterChip } from "./FilterBar";
import { formatDate } from "./format";
import { playerListText, POSITION_LABELS, type PositionKey } from "./labels";
import type { FmDate, PlayerFilter } from "./types";

const text = playerListText.filters;

/** The positions in the select, from the goal to the front; their labels are in `POSITION_LABELS`. */
export const POSITION_ORDER: readonly PositionKey[] = [
  "gk", "sw", "dl", "dc", "dr", "wbl", "wbr", "dm", "ml", "mc", "mr", "aml", "amc", "amr", "st",
];

/** What the number inputs hold, at most: ability is 1–200; the ages only keep absurd numbers out of the request. */
const AGE_RANGE = { min: 0, max: 99 };
const ABILITY_RANGE = { min: 1, max: 200 };

/** What the filter inputs hold, as typed: an empty string, or `false`, is no filter. */
export interface PlayerFilterFields {
  /** A position key. */
  position: string;
  minAge: string;
  maxAge: string;
  minCurrentAbility: string;
  minPotentialAbility: string;
  nation: string;
  club: string;
  freeAgents: boolean;
  /** `YYYY-MM-DD`, as a date input holds it. */
  contractExpiresBy: string;
  transferListed: boolean;
  loanListed: boolean;
  attributes: AttributeRow[];
}

export const NO_PLAYER_FILTERS: PlayerFilterFields = {
  position: "",
  minAge: "",
  maxAge: "",
  minCurrentAbility: "",
  minPotentialAbility: "",
  nation: "",
  club: "",
  freeAgents: false,
  contractExpiresBy: "",
  transferListed: false,
  loanListed: false,
  attributes: [],
};

/** A whole number within `range`; nothing for an empty or unreadable input. */
function whole(input: string, range: { min: number; max: number }): number | undefined {
  if (input.trim() === "") {
    return undefined;
  }
  const value = Number(input);
  return Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, Math.round(value))) : undefined;
}

/** A date input's `YYYY-MM-DD` as the game's date; nothing until the whole date is there. */
function toFmDate(input: string): FmDate | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : undefined;
}

/** The filter the inputs ask for, or `undefined` while none is in effect. */
export function toPlayerFilter(fields: PlayerFilterFields): PlayerFilter | undefined {
  const filter: PlayerFilter = {
    position: fields.position || undefined,
    minAge: whole(fields.minAge, AGE_RANGE),
    maxAge: whole(fields.maxAge, AGE_RANGE),
    minCurrentAbility: whole(fields.minCurrentAbility, ABILITY_RANGE),
    minPotentialAbility: whole(fields.minPotentialAbility, ABILITY_RANGE),
    nation: fields.nation.trim() || undefined,
    club: fields.club.trim() || undefined,
    freeAgents: fields.freeAgents || undefined,
    contractExpiresBy: toFmDate(fields.contractExpiresBy),
    transferListed: fields.transferListed || undefined,
    loanListed: fields.loanListed || undefined,
    attributes: toAttributeBounds(fields.attributes),
  };
  return countFilters(filter) > 0 ? filter : undefined;
}

/** How many filters are in effect; the two ends of the age range count as one, and each attribute bound as one. */
export function countFilters(filter: PlayerFilter | undefined): number {
  if (!filter) {
    return 0;
  }
  const single = [
    filter.position,
    filter.minAge ?? filter.maxAge,
    filter.minCurrentAbility,
    filter.minPotentialAbility,
    filter.nation,
    filter.club,
    filter.freeAgents,
    filter.contractExpiresBy,
    filter.transferListed,
    filter.loanListed,
  ].filter((value) => value !== undefined).length;
  return single + (filter.attributes?.length ?? 0);
}

interface PlayerFilterBarProps {
  fields: PlayerFilterFields;
  onChange: (fields: PlayerFilterFields) => void;
  /** More controls at the end of the head of the bar, e.g. those of the saved filters. */
  actions?: ReactNode;
}

/** A chip for each filter in effect, as `countFilters` counts them: the two ends of the age range are one. */
function playerChips(fields: PlayerFilterFields, onChange: (fields: PlayerFilterFields) => void): FilterChip[] {
  const filter = toPlayerFilter(fields);
  if (!filter) {
    return [];
  }
  const chips: FilterChip[] = [];
  const add = (key: string, label: string, cleared: Partial<PlayerFilterFields>) =>
    chips.push({ key, label, remove: () => onChange({ ...fields, ...cleared }) });
  const number = (value: number | undefined) => (value === undefined ? null : String(value));
  const age = rangeText(filter.minAge, filter.maxAge);
  const minCa = number(filter.minCurrentAbility);
  const minPa = number(filter.minPotentialAbility);

  if (filter.position) {
    add("position", chipLabel(text.position, POSITION_LABELS[filter.position as PositionKey] ?? filter.position), {
      position: "",
    });
  }
  if (age !== null) {
    add("age", chipLabel(text.age, age), { minAge: "", maxAge: "" });
  }
  if (minCa !== null) {
    add("minCa", chipLabel(text.minCurrentAbility, minCa), { minCurrentAbility: "" });
  }
  if (minPa !== null) {
    add("minPa", chipLabel(text.minPotentialAbility, minPa), { minPotentialAbility: "" });
  }
  if (filter.nation) {
    add("nation", chipLabel(text.nation, filter.nation), { nation: "" });
  }
  if (filter.club) {
    add("club", chipLabel(text.club, filter.club), { club: "" });
  }
  if (filter.freeAgents) {
    add("freeAgents", text.freeAgentsOnly, { freeAgents: false });
  }
  if (filter.contractExpiresBy) {
    add("contract", chipLabel(text.contractEndsBy, formatDate(filter.contractExpiresBy)), { contractExpiresBy: "" });
  }
  if (filter.transferListed) {
    add("transferListed", text.transferListedOnly, { transferListed: false });
  }
  if (filter.loanListed) {
    add("loanListed", text.loanListedOnly, { loanListed: false });
  }
  return [
    ...chips,
    ...attributeChips(fields.attributes, PLAYER_ATTRIBUTES, (attributes) => onChange({ ...fields, attributes })),
  ];
}

/** The filter bar of the player list. */
export function PlayerFilterBar({ fields, onChange, actions }: PlayerFilterBarProps) {
  const ageLabel = useId();

  const set = <K extends keyof PlayerFilterFields>(key: K, value: PlayerFilterFields[K]) =>
    onChange({ ...fields, [key]: value });

  return (
    <FilterBar chips={playerChips(fields, onChange)} onClear={() => onChange(NO_PLAYER_FILTERS)} actions={actions}>
      <label className="filter-field">
        <span>{text.position}</span>
        <select value={fields.position} onChange={(e) => set("position", e.currentTarget.value)}>
          <option value="">{text.any}</option>
          {POSITION_ORDER.map((key) => (
            <option key={key} value={key}>
              {POSITION_LABELS[key]}
            </option>
          ))}
        </select>
      </label>

      <div className="filter-field" role="group" aria-labelledby={ageLabel}>
        <span id={ageLabel}>{text.age}</span>
        <input
          type="number"
          min={AGE_RANGE.min}
          max={AGE_RANGE.max}
          step={1}
          placeholder={text.minPlaceholder}
          aria-label={text.minAge}
          value={fields.minAge}
          onChange={(e) => set("minAge", e.currentTarget.value)}
        />
        <span aria-hidden="true">–</span>
        <input
          type="number"
          min={AGE_RANGE.min}
          max={AGE_RANGE.max}
          step={1}
          placeholder={text.maxPlaceholder}
          aria-label={text.maxAge}
          value={fields.maxAge}
          onChange={(e) => set("maxAge", e.currentTarget.value)}
        />
      </div>

      <label className="filter-field" title={text.minCurrentAbilityTitle}>
        <span>{text.minCurrentAbility}</span>
        <input
          type="number"
          min={ABILITY_RANGE.min}
          max={ABILITY_RANGE.max}
          step={1}
          placeholder={text.abilityPlaceholder}
          value={fields.minCurrentAbility}
          onChange={(e) => set("minCurrentAbility", e.currentTarget.value)}
        />
      </label>

      <label className="filter-field" title={text.minPotentialAbilityTitle}>
        <span>{text.minPotentialAbility}</span>
        <input
          type="number"
          min={ABILITY_RANGE.min}
          max={ABILITY_RANGE.max}
          step={1}
          placeholder={text.abilityPlaceholder}
          value={fields.minPotentialAbility}
          onChange={(e) => set("minPotentialAbility", e.currentTarget.value)}
        />
      </label>

      <label className="filter-field">
        <span>{text.nation}</span>
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={fields.nation}
          onChange={(e) => set("nation", e.currentTarget.value)}
        />
      </label>

      <label className="filter-field">
        <span>{text.club}</span>
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={fields.club}
          onChange={(e) => set("club", e.currentTarget.value)}
        />
      </label>

      <label className="filter-field">
        <input
          type="checkbox"
          checked={fields.freeAgents}
          onChange={(e) => set("freeAgents", e.currentTarget.checked)}
        />
        <span>{text.freeAgentsOnly}</span>
      </label>

      <label className="filter-field">
        <span>{text.contractEndsBy}</span>
        <DateInput value={fields.contractExpiresBy} onChange={(value) => set("contractExpiresBy", value)} />
      </label>

      <label className="filter-field">
        <input
          type="checkbox"
          checked={fields.transferListed}
          onChange={(e) => set("transferListed", e.currentTarget.checked)}
        />
        <span>{text.transferListedOnly}</span>
      </label>

      <label className="filter-field">
        <input
          type="checkbox"
          checked={fields.loanListed}
          onChange={(e) => set("loanListed", e.currentTarget.checked)}
        />
        <span>{text.loanListedOnly}</span>
      </label>

      <AttributeFilters
        rows={fields.attributes}
        choices={PLAYER_ATTRIBUTES}
        onChange={(rows) => set("attributes", rows)}
      />
    </FilterBar>
  );
}
