import { useId, useRef, useState, type ReactNode } from "react";
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
  };
  return countFilters(filter) > 0 ? filter : undefined;
}

/** How many filters are in effect; the two ends of the age range count as one. */
export function countFilters(filter: PlayerFilter | undefined): number {
  if (!filter) {
    return 0;
  }
  return [
    filter.position,
    filter.minAge ?? filter.maxAge,
    filter.minCurrentAbility,
    filter.minPotentialAbility,
    filter.nation,
    filter.club,
    filter.freeAgents,
    filter.contractExpiresBy,
  ].filter((value) => value !== undefined).length;
}

interface PlayerFilterBarProps {
  fields: PlayerFilterFields;
  onChange: (fields: PlayerFilterFields) => void;
  /** How many filters are in effect, from `countFilters`. */
  active: number;
  /** More controls after Clear in the head of the bar, e.g. those of the saved filters. */
  actions?: ReactNode;
}

/** The filter bar of the player list: a button with the number of filters in effect, and the inputs behind it. */
export function PlayerFilterBar({ fields, onChange, active, actions }: PlayerFilterBarProps) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const ageLabel = useId();

  const set = <K extends keyof PlayerFilterFields>(key: K, value: PlayerFilterFields[K]) =>
    onChange({ ...fields, [key]: value });

  return (
    <div className="filter-bar">
      <div className="filter-head">
        <button
          ref={toggle}
          type="button"
          className="filter-toggle"
          aria-expanded={open}
          aria-label={active > 0 ? text.toggleActive(active) : undefined}
          onClick={() => setOpen(!open)}
        >
          {text.toggle}
          {active > 0 && <span className="filter-count">{active}</span>}
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 8 5 5 5-5" />
          </svg>
        </button>
        {active > 0 && (
          <button
            type="button"
            className="filter-clear"
            onClick={() => {
              onChange(NO_PLAYER_FILTERS);
              // This button goes away with the filters: keep keyboard focus on the bar.
              toggle.current?.focus();
            }}
          >
            {text.clear}
          </button>
        )}
        {actions}
      </div>

      {open && (
        <div className="filter-fields">
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
            <input
              type="date"
              value={fields.contractExpiresBy}
              onChange={(e) => set("contractExpiresBy", e.currentTarget.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
