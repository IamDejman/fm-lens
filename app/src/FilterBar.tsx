// The filter bar of a list: Filters, with how many are in effect, a chip for each that takes it out, Clear, and the
// inputs behind Filters.

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { playerListText } from "./labels";

const text = playerListText.filters;

/** A filter in effect: what its chip says, and how to take it out. */
export interface FilterChip {
  key: string;
  label: string;
  remove: () => void;
}

/** A chip of a filter with a value: "Nation: Brazil". */
export const chipLabel = (name: string, value: string) => `${name}: ${value}`;

/** The two ends of a range as a chip shows them: "20–25", "≥ 20" or "≤ 25"; null with neither. */
export function rangeText(min: number | undefined, max: number | undefined, show: (value: number) => string = String) {
  if (min !== undefined && max !== undefined) {
    return `${show(min)}–${show(max)}`;
  }
  if (min !== undefined) {
    return `≥ ${show(min)}`;
  }
  return max === undefined ? null : `≤ ${show(max)}`;
}

/** The least and most a number filter takes. */
export interface NumberRange {
  min: number;
  max: number;
}

/** A whole number within `range`; nothing for an empty or unreadable input. */
export function whole(input: string, range: NumberRange): number | undefined {
  if (input.trim() === "") {
    return undefined;
  }
  const value = Number(input);
  return Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, Math.round(value))) : undefined;
}

/** A text input saved before the language was switched; empty when there is none. */
export const readText = (value: unknown) => (typeof value === "string" ? value : "");

/** Which rows a list with men's and women's rows shows. */
export type Kind = "all" | "men" | "women";

/** A kind saved before the language was switched; all when there is none. */
export const readKind = (value: unknown): Kind => (value === "men" || value === "women" ? value : "all");

/** A kind as a filter takes it: `true` for women's rows only, `false` for men's only. */
export const womenOnly = (kind: Kind) => (kind === "all" ? undefined : kind === "women");

/** The words of a kind select: its name and the name of each choice. */
export interface KindText {
  kind: string;
  all: string;
  men: string;
  women: string;
}

/** The chip of a kind other than all, in a list to spread into the chips. */
export const kindChip = (kind: Kind, labels: KindText, remove: () => void): FilterChip[] =>
  kind === "all" ? [] : [{ key: "kind", label: kind === "men" ? labels.men : labels.women, remove }];

/** A select of all, men's or women's rows. */
export function KindField({
  labels,
  value,
  onChange,
}: {
  labels: KindText;
  value: Kind;
  onChange: (kind: Kind) => void;
}) {
  return (
    <label className="filter-field">
      <span>{labels.kind}</span>
      <select aria-label={labels.kind} value={value} onChange={(e) => onChange(readKind(e.currentTarget.value))}>
        <option value="all">{labels.all}</option>
        <option value="men">{labels.men}</option>
        <option value="women">{labels.women}</option>
      </select>
    </label>
  );
}

interface RangeFieldProps {
  label: string;
  minLabel: string;
  maxLabel: string;
  range: NumberRange;
  min: string;
  max: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}

/** The two ends of a number filter under one name. */
export function RangeField({ label, minLabel, maxLabel, range, min, max, onMin, onMax }: RangeFieldProps) {
  const id = useId();
  return (
    <div className="filter-field" role="group" aria-labelledby={id}>
      <span id={id}>{label}</span>
      <input
        type="number"
        min={range.min}
        max={range.max}
        step={1}
        placeholder={text.minPlaceholder}
        aria-label={minLabel}
        value={min}
        onChange={(e) => onMin(e.currentTarget.value)}
      />
      <span aria-hidden="true">–</span>
      <input
        type="number"
        min={range.min}
        max={range.max}
        step={1}
        placeholder={text.maxPlaceholder}
        aria-label={maxLabel}
        value={max}
        onChange={(e) => onMax(e.currentTarget.value)}
      />
    </div>
  );
}

interface FilterBarProps {
  /** The filters in effect, a chip each; the button counts them. */
  chips: readonly FilterChip[];
  /** Takes every filter out. */
  onClear: () => void;
  /** More controls at the end of the head of the bar, e.g. those of the saved filters. */
  actions?: ReactNode;
  /** The inputs, shown while the bar is open. */
  children: ReactNode;
}

export function FilterBar({ chips, onClear, actions, children }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // Where the chip taken out was, until the bar has drawn the chips left.
  const removedAt = useRef<number | null>(null);
  const active = chips.length;

  // A chip taken out goes away with the focus it had: it goes to the chip now in its place, or the one before, or else
  // to Filters.
  useLayoutEffect(() => {
    const at = removedAt.current;
    if (at === null) {
      return;
    }
    removedAt.current = null;
    const left = list.current?.querySelectorAll("button") ?? [];
    (left[Math.min(at, left.length - 1)] ?? toggle.current)?.focus();
  });

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
          <ul ref={list} className="filter-chips" aria-label={text.chips}>
            {chips.map((chip, index) => (
              <li key={chip.key}>
                <button
                  type="button"
                  className="filter-chip"
                  aria-label={text.removeChip(chip.label)}
                  title={text.removeChip(chip.label)}
                  onClick={() => {
                    removedAt.current = index;
                    chip.remove();
                  }}
                >
                  <span className="filter-chip-text">{chip.label}</span>
                  <svg viewBox="0 0 10 10" aria-hidden="true">
                    <path d="m2.5 2.5 5 5m0-5-5 5" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        {active > 1 && (
          <button
            type="button"
            className="filter-clear"
            onClick={() => {
              onClear();
              // This button goes away with the filters: keep keyboard focus on the bar.
              toggle.current?.focus();
            }}
          >
            {text.clear}
          </button>
        )}
        {actions}
      </div>
      {open && <div className="filter-fields">{children}</div>}
    </div>
  );
}
