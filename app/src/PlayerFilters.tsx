import { useId, type ReactNode } from "react";
import {
  attributeChips,
  AttributeFilters,
  PERSONALITY_PREFIX,
  PLAYER_ATTRIBUTES,
  toAttributeBounds,
  type AttributeRow,
} from "./AttributeFilters";
import { toPounds } from "./currency";
import { DateInput } from "./DateInput";
import { chipLabel, FilterBar, RangeField, rangeText, type FilterChip } from "./FilterBar";
import { formatDate, formatMoney, formatNumber } from "./format";
import { intlLocale } from "./i18n";
import { playerListText, POSITION_LABELS, profileText, type PositionKey } from "./labels";
import type { FmDate, PlayerFilter } from "./types";

const text = playerListText.filters;
const columns = playerListText.columns;

/** The positions in the select, from the goal to the front; their labels are in `POSITION_LABELS`. */
export const POSITION_ORDER: readonly PositionKey[] = [
  "gk", "sw", "dl", "dc", "dr", "wbl", "wbr", "dm", "ml", "mc", "mr", "aml", "amc", "amr", "st",
];

/** What the number inputs hold, at most: ability is 1–200; the ages only keep absurd numbers out of the request. */
const AGE_RANGE = { min: 0, max: 99 };
const ABILITY_RANGE = { min: 1, max: 200 };
const HEIGHT_RANGE = { min: 100, max: 250 };
const REPUTATION_RANGE = { min: 0, max: 10_000 };
/** Money as typed, in the currency on show; the request has it in pounds, within what the game keeps an amount in. */
const MONEY_RANGE = { min: 0, max: Number.MAX_SAFE_INTEGER };
const MOST_POUNDS = 2_147_483_647;

/** The traits the game names, by their bit: the select offers these (bits 61 and 62 are no trait in FM27). */
export const TRAIT_CHOICES: readonly number[] = Array.from({ length: 64 }, (_, bit) => bit).filter(
  (bit) => bit !== 61 && bit !== 62,
);

/** What the filter inputs hold, as typed: an empty string, or `false`, is no filter. */
export interface PlayerFilterFields {
  /** Position keys: a player who can play any of them matches. */
  positions: string[];
  minAge: string;
  maxAge: string;
  minCurrentAbility: string;
  maxCurrentAbility: string;
  minPotentialAbility: string;
  maxPotentialAbility: string;
  /** Centimetres. */
  minHeight: string;
  maxHeight: string;
  /** A week, in the currency on show. */
  minWage: string;
  maxWage: string;
  /** His stored base value, in the currency on show. */
  minValue: string;
  maxValue: string;
  minReputation: string;
  maxReputation: string;
  nation: string;
  club: string;
  freeAgents: boolean;
  /** `YYYY-MM-DD`, as a date input holds it. */
  contractExpiresBy: string;
  transferListed: boolean;
  loanListed: boolean;
  /** The bit of a trait he must have. */
  trait: string;
  /** Bounds on attributes and, with `PERSONALITY_PREFIX` before their key, on personality ratings. */
  attributes: AttributeRow[];
}

export const NO_PLAYER_FILTERS: PlayerFilterFields = {
  positions: [],
  minAge: "",
  maxAge: "",
  minCurrentAbility: "",
  maxCurrentAbility: "",
  minPotentialAbility: "",
  maxPotentialAbility: "",
  minHeight: "",
  maxHeight: "",
  minWage: "",
  maxWage: "",
  minValue: "",
  maxValue: "",
  minReputation: "",
  maxReputation: "",
  nation: "",
  club: "",
  freeAgents: false,
  contractExpiresBy: "",
  transferListed: false,
  loanListed: false,
  trait: "",
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

/** An amount typed in the currency on show, in the pounds the request takes; nothing for an empty input. */
function pounds(input: string): number | undefined {
  const shown = whole(input, MONEY_RANGE);
  return shown === undefined ? undefined : Math.min(MOST_POUNDS, toPounds(shown));
}

/** The bit of the trait the select holds; nothing for no trait, or for what is not one the select offers. */
function traitBit(input: string): number | undefined {
  const bit = input === "" ? NaN : Number(input);
  return TRAIT_CHOICES.includes(bit) ? bit : undefined;
}

/** The filter the inputs ask for, or `undefined` while none is in effect. */
export function toPlayerFilter(fields: PlayerFilterFields): PlayerFilter | undefined {
  // The rows bound attributes and personality ratings alike; the request has the two apart.
  const bounds = toAttributeBounds(fields.attributes) ?? [];
  const attributes = bounds.filter((bound) => !bound.key.startsWith(PERSONALITY_PREFIX));
  const personality = bounds
    .filter((bound) => bound.key.startsWith(PERSONALITY_PREFIX))
    .map((bound) => ({ ...bound, key: bound.key.slice(PERSONALITY_PREFIX.length) }));
  const trait = traitBit(fields.trait);
  const filter: PlayerFilter = {
    positions: fields.positions.length > 0 ? fields.positions : undefined,
    minAge: whole(fields.minAge, AGE_RANGE),
    maxAge: whole(fields.maxAge, AGE_RANGE),
    minCurrentAbility: whole(fields.minCurrentAbility, ABILITY_RANGE),
    maxCurrentAbility: whole(fields.maxCurrentAbility, ABILITY_RANGE),
    minPotentialAbility: whole(fields.minPotentialAbility, ABILITY_RANGE),
    maxPotentialAbility: whole(fields.maxPotentialAbility, ABILITY_RANGE),
    minHeight: whole(fields.minHeight, HEIGHT_RANGE),
    maxHeight: whole(fields.maxHeight, HEIGHT_RANGE),
    minWage: pounds(fields.minWage),
    maxWage: pounds(fields.maxWage),
    minValue: pounds(fields.minValue),
    maxValue: pounds(fields.maxValue),
    minReputation: whole(fields.minReputation, REPUTATION_RANGE),
    maxReputation: whole(fields.maxReputation, REPUTATION_RANGE),
    nation: fields.nation.trim() || undefined,
    club: fields.club.trim() || undefined,
    freeAgents: fields.freeAgents || undefined,
    contractExpiresBy: toFmDate(fields.contractExpiresBy),
    transferListed: fields.transferListed || undefined,
    loanListed: fields.loanListed || undefined,
    attributes: attributes.length > 0 ? attributes : undefined,
    personality: personality.length > 0 ? personality : undefined,
    traits: trait === undefined ? undefined : [trait],
  };
  return countFilters(filter) > 0 ? filter : undefined;
}

/**
 * How many filters are in effect; the two ends of a range count as one, and each bound on an attribute or a
 * personality rating as one.
 */
export function countFilters(filter: PlayerFilter | undefined): number {
  if (!filter) {
    return 0;
  }
  const single = [
    filter.positions,
    filter.minAge ?? filter.maxAge,
    filter.minCurrentAbility ?? filter.maxCurrentAbility,
    filter.minPotentialAbility ?? filter.maxPotentialAbility,
    filter.minHeight ?? filter.maxHeight,
    filter.minWage ?? filter.maxWage,
    filter.minValue ?? filter.maxValue,
    filter.minReputation ?? filter.maxReputation,
    filter.nation,
    filter.club,
    filter.freeAgents,
    filter.contractExpiresBy,
    filter.transferListed,
    filter.loanListed,
    filter.traits,
  ].filter((value) => value !== undefined).length;
  return single + (filter.attributes?.length ?? 0) + (filter.personality?.length ?? 0);
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
  const age = rangeText(filter.minAge, filter.maxAge);
  const ability = rangeText(filter.minCurrentAbility, filter.maxCurrentAbility);
  const potential = rangeText(filter.minPotentialAbility, filter.maxPotentialAbility);
  const height = rangeText(filter.minHeight, filter.maxHeight, profileText.height);
  // The chips say the amounts as the list shows money: in the currency on show.
  const wage = rangeText(filter.minWage, filter.maxWage, formatMoney);
  const value = rangeText(filter.minValue, filter.maxValue, formatMoney);
  const trait = filter.traits?.[0];

  if (filter.positions) {
    const names = filter.positions.map((key) => POSITION_LABELS[key as PositionKey] ?? key).join(", ");
    add("position", chipLabel(text.position, names), { positions: [] });
  }
  if (age !== null) {
    add("age", chipLabel(text.age, age), { minAge: "", maxAge: "" });
  }
  if (ability !== null) {
    add("ability", chipLabel(columns.currentAbility, ability), { minCurrentAbility: "", maxCurrentAbility: "" });
  }
  if (potential !== null) {
    add("potential", chipLabel(columns.potentialAbility, potential), {
      minPotentialAbility: "",
      maxPotentialAbility: "",
    });
  }
  if (height !== null) {
    add("height", chipLabel(profileText.heightLabel, height), { minHeight: "", maxHeight: "" });
  }
  if (wage !== null) {
    add("wage", chipLabel(text.wage, wage), { minWage: "", maxWage: "" });
  }
  if (value !== null) {
    add("value", chipLabel(text.value, value), { minValue: "", maxValue: "" });
  }
  const reputation = rangeText(filter.minReputation, filter.maxReputation, formatNumber);
  if (reputation !== null) {
    add("reputation", chipLabel(text.reputation, reputation), { minReputation: "", maxReputation: "" });
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
  if (trait !== undefined) {
    add("trait", chipLabel(text.trait, profileText.traitName(trait)), { trait: "" });
  }
  return [
    ...chips,
    ...attributeChips(fields.attributes, PLAYER_ATTRIBUTES, (attributes) => onChange({ ...fields, attributes })),
  ];
}

/** The traits of the select, by name. */
const TRAIT_OPTIONS = TRAIT_CHOICES.map((bit) => ({ bit, name: profileText.traitName(bit) })).sort((a, b) =>
  a.name.localeCompare(b.name, intlLocale),
);

/** The filter bar of the player list. */
export function PlayerFilterBar({ fields, onChange, actions }: PlayerFilterBarProps) {
  const ageLabel = useId();

  const positionLabel = useId();
  const set = <K extends keyof PlayerFilterFields>(key: K, value: PlayerFilterFields[K]) =>
    onChange({ ...fields, [key]: value });
  /** Puts a position in or takes it out; they stay in the order of the pitch. */
  const togglePosition = (key: string) =>
    set(
      "positions",
      fields.positions.includes(key)
        ? fields.positions.filter((other) => other !== key)
        : POSITION_ORDER.filter((other) => other === key || fields.positions.includes(other)),
    );

  return (
    <FilterBar chips={playerChips(fields, onChange)} onClear={() => onChange(NO_PLAYER_FILTERS)} actions={actions}>
      <div className="filter-field filter-positions" role="group" aria-labelledby={positionLabel}>
        <span id={positionLabel}>{text.position}</span>
        {POSITION_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            className="position-toggle"
            aria-pressed={fields.positions.includes(key)}
            onClick={() => togglePosition(key)}
          >
            {POSITION_LABELS[key]}
          </button>
        ))}
      </div>

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

      <RangeField
        label={columns.currentAbility}
        minLabel={text.minCurrentAbilityTitle}
        maxLabel={text.maxCurrentAbilityTitle}
        range={ABILITY_RANGE}
        min={fields.minCurrentAbility}
        max={fields.maxCurrentAbility}
        onMin={(value) => set("minCurrentAbility", value)}
        onMax={(value) => set("maxCurrentAbility", value)}
      />

      <RangeField
        label={columns.potentialAbility}
        minLabel={text.minPotentialAbilityTitle}
        maxLabel={text.maxPotentialAbilityTitle}
        range={ABILITY_RANGE}
        min={fields.minPotentialAbility}
        max={fields.maxPotentialAbility}
        onMin={(value) => set("minPotentialAbility", value)}
        onMax={(value) => set("maxPotentialAbility", value)}
      />

      <RangeField
        label={text.height}
        minLabel={text.minHeight}
        maxLabel={text.maxHeight}
        range={HEIGHT_RANGE}
        min={fields.minHeight}
        max={fields.maxHeight}
        onMin={(value) => set("minHeight", value)}
        onMax={(value) => set("maxHeight", value)}
      />

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

      <RangeField
        label={text.wage}
        minLabel={text.minWage}
        maxLabel={text.maxWage}
        range={MONEY_RANGE}
        min={fields.minWage}
        max={fields.maxWage}
        onMin={(value) => set("minWage", value)}
        onMax={(value) => set("maxWage", value)}
        wide
      />

      <RangeField
        label={text.value}
        minLabel={text.minValue}
        maxLabel={text.maxValue}
        range={MONEY_RANGE}
        min={fields.minValue}
        max={fields.maxValue}
        onMin={(value) => set("minValue", value)}
        onMax={(value) => set("maxValue", value)}
        wide
      />

      <RangeField
        label={text.reputation}
        minLabel={text.minReputation}
        maxLabel={text.maxReputation}
        range={REPUTATION_RANGE}
        min={fields.minReputation}
        max={fields.maxReputation}
        onMin={(value) => set("minReputation", value)}
        onMax={(value) => set("maxReputation", value)}
      />

      <label className="filter-field">
        <span>{text.trait}</span>
        <select value={fields.trait} onChange={(e) => set("trait", e.currentTarget.value)}>
          <option value="">{text.any}</option>
          {TRAIT_OPTIONS.map(({ bit, name }) => (
            <option key={bit} value={bit}>
              {name}
            </option>
          ))}
        </select>
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
        <DateInput
          // The label holds the calendar too: the field is named by its own words alone.
          aria-label={text.contractEndsBy}
          value={fields.contractExpiresBy}
          onChange={(value) => set("contractExpiresBy", value)}
        />
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
