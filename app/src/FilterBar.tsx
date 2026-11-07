// The filter bar of a list: Filters, with how many are in effect, a chip for each that takes it out, Clear, and the
// inputs behind Filters.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
