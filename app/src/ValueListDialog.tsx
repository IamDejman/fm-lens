// The dialog that changes the entries of one of a person's lists, each a name and a number: how strongly he favours or
// dislikes each person and club, or how well he speaks each language. Each row's number can be saved, or the row
// removed, or, where the list allows it, the row pointed at another club or person found by a search. Each change is
// written at once, logged like any change and undone from the Changes view.

import { useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RangeHint } from "./EditControls";
import { describeError, formatNumber } from "./format";
import { editText, listText, tieText } from "./labels";
import { useModal } from "./useModal";
import { EditorContext } from "./useProfileEditing";

/** One entry of the list: its place in the list as the game holds it, its name, and its number. */
export interface ValueRow {
  index: number;
  name: string;
  /** What the row shows for the name, where that is more than the name: a club's logo beside it, say. */
  label?: ReactNode;
  /** A line under the name, where the game treats the row's number in its own way. */
  note?: string;
  value: number;
  /** How the row is pointed at another club or person, where the list allows it. */
  replace?: Replacement;
}

/** One club or person a row can be pointed at, as the search found it. */
export interface ReplacementOption {
  key: string;
  label: ReactNode;
  /** Points the row at this one. */
  choose: () => Promise<unknown>;
}

/** The search that finds what a row can be pointed at. */
export interface Replacement {
  /** The search box's placeholder, and its name for assistive technology. */
  label: string;
  /** What `query` finds; for an empty one, a first few to pick from. */
  search: (query: string) => Promise<ReplacementOption[]>;
}

/** The rows under one heading; no heading for a list of one kind. */
export interface ValueSection {
  key: string;
  heading: string | null;
  rows: ValueRow[];
}

interface ValueListDialogProps {
  title: string;
  /** Whose list: the person's name. */
  who: string;
  sections: ValueSection[];
  /** The numbers the editor writes. */
  least: number;
  most: number;
  /** The number input of a row, for assistive technology. */
  inputLabel: (name: string) => string;
  /** Writes the number `value` to the row at `index`, or takes the row out. */
  save: (index: number, value: number) => Promise<unknown>;
  remove: (index: number) => Promise<unknown>;
  /** The list as last read: a new one, read after a write, ends that write. */
  list: unknown;
  onClose: () => void;
}

/** How long the search waits after the last key, so that a burst of keys asks the game once. */
const SEARCH_DELAY = 150;

/** What the search found for `query`, or why it found nothing. */
type Found = { query: string; options: ReplacementOption[] } | { query: string; error: string };

/**
 * The search box that finds what a row can be pointed at, and its results: the arrows move through them, and Enter or
 * a click picks one.
 */
function ReplaceSearch({
  replacement,
  busy,
  onPick,
}: {
  replacement: Replacement;
  busy: boolean;
  onPick: (option: ReplacementOption) => void;
}) {
  const base = useId();
  const id = (part: string) => `${base}-${part}`;
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLUListElement>(null);
  // Set when a key moved the highlight, so that the row it reached scrolls into view; the mouse is not followed.
  const keyboardMoved = useRef(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  // The option Enter picks.
  const [active, setActive] = useState(0);

  // Until the search has answered for what is typed the options are the last ones: Enter leaves them alone.
  const options = found !== null && "options" in found ? found.options : [];
  const settled = found !== null && found.query === query;

  useEffect(() => {
    input.current?.focus();
  }, []);

  // The search asks the game a moment after the last key. An answer that comes after the text changed is dropped.
  const { search } = replacement;
  useEffect(() => {
    let cancelled = false;
    const answer = (next: Found) => {
      if (!cancelled) {
        setFound(next);
        setActive(0);
      }
    };
    const timer = setTimeout(
      () => {
        search(query).then(
          (options) => answer({ query, options }),
          (e) => answer({ query, error: describeError(e) }),
        );
      },
      // The first look needs no wait.
      query === "" ? 0 : SEARCH_DELAY,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, query]);

  useEffect(() => {
    if (keyboardMoved.current) {
      keyboardMoved.current = false;
      results.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
    }
  }, [active]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // The arrows move through the options, not the caret.
      event.preventDefault();
      if (options.length > 0) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        keyboardMoved.current = true;
        setActive((index) => (index + step + options.length) % options.length);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[active];
      if (settled && option) {
        onPick(option);
      }
    }
  };

  // What the search says under its list: a live region that is always there, so that it is read out when it fills.
  const note =
    found === null
      ? listText.searching
      : !settled
        ? ""
        : "error" in found
          ? listText.searchFailed(found.error)
          : found.options.length === 0
            ? listText.noMatch(query)
            : "";
  const noteIsError = found !== null && settled && "error" in found;

  return (
    <>
      <label className="search move-search">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4.5 4.5" />
        </svg>
        <input
          ref={input}
          role="combobox"
          aria-label={replacement.label}
          aria-autocomplete="list"
          aria-expanded={options.length > 0}
          aria-controls={id("options")}
          aria-activedescendant={options.length > 0 ? id(`option-${active}`) : undefined}
          value={query}
          placeholder={replacement.label}
          spellCheck={false}
          autoComplete="off"
          // Read-only, not disabled, while a pick is written: focus stays here for the next try if it fails.
          readOnly={busy}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      </label>
      <div className="move-results-box" aria-busy={!settled || undefined}>
        <ul ref={results} id={id("options")} className="move-results" role="listbox" aria-label={replacement.label}>
          {options.map((option, index) => (
            <li
              key={option.key}
              id={id(`option-${index}`)}
              className={index === active ? "move-option active" : "move-option"}
              role="option"
              aria-selected={index === active}
              aria-disabled={busy || undefined}
              // Focus stays in the search box: a click only picks.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(option)}
            >
              {option.label}
            </li>
          ))}
        </ul>
        <p className={noteIsError ? "move-results-note error" : "move-results-note"} role="status">
          {note}
        </p>
      </div>
    </>
  );
}

/**
 * The rows with the controls that change them: a number and its Save, Replace where the row takes it, and Remove. A
 * write keeps every control busy until the profile has read the game again; then the dialog shows the rows the game
 * holds. Replace swaps the rows for a search, until one is picked or Back is pressed.
 */
export function ValueListDialog({
  title,
  who,
  sections,
  least,
  most,
  inputLabel,
  save,
  remove,
  list,
  onClose,
}: ValueListDialogProps) {
  const { onEdited } = useContext(EditorContext);
  const base = useId();
  const id = (part: string) => `${base}-${part}`;
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The numbers typed, by the index of the row; the others show the game's.
  const [typed, setTyped] = useState<Partial<Record<number, string>>>({});
  // The row being pointed elsewhere, while its search is on show.
  const [replacing, setReplacing] = useState<ValueRow | null>(null);

  const back = () => setReplacing(null);
  // Escape leaves the search before it closes the dialog.
  useModal(dialog, !busy, replacing === null ? onClose : back);

  useEffect(() => {
    alive.current = true;
    closeButton.current?.focus();
    return () => {
      alive.current = false;
    };
  }, []);

  // The control that had focus when a write began: it is disabled while the write runs, which takes focus away.
  const focused = useRef<HTMLElement | null>(null);

  // The profile has read the game again: the numbers are the game's, and the controls take changes again.
  useEffect(() => {
    setBusy(false);
    setTyped({});
    setReplacing(null);
  }, [list]);

  // When the search goes, by Back or by the write of a pick, focus goes back to the Replace button it came from. This
  // runs before the effect below, which then has nothing left to do.
  const replacedIndex = useRef<number | null>(null);
  useEffect(() => {
    if (replacing !== null) {
      replacedIndex.current = replacing.index;
      return;
    }
    const index = replacedIndex.current;
    if (index === null) {
      return;
    }
    replacedIndex.current = null;
    focused.current = null;
    (document.getElementById(id(`replace-${index}`)) ?? closeButton.current)?.focus();
  }, [replacing]);

  // Focus goes back to the control that had it, or to Close when that control went with the row it removed.
  useEffect(() => {
    const control = focused.current;
    if (busy || control === null) {
      return;
    }
    focused.current = null;
    (control.isConnected ? control : closeButton.current)?.focus();
  }, [busy]);

  /** The number typed, or null where it is not a whole number the editor writes. */
  const numberOf = (text: string): number | null => {
    const value = Number(text.trim());
    return text.trim() !== "" && Number.isInteger(value) && value >= least && value <= most ? value : null;
  };

  const write = async (change: () => Promise<unknown>) => {
    if (busy) {
      return;
    }
    focused.current = dialog.current?.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    setBusy(true);
    setError(null);
    try {
      await change();
      // The game has changed: the lists, the profile and the change log read it again.
      onEdited();
    } catch (e) {
      if (alive.current) {
        setError(describeError(e));
        setBusy(false);
      }
    }
  };

  const row = (entry: ValueRow) => {
    const { index, name, label, note, value, replace } = entry;
    const text = typed[index] ?? String(value);
    const next = numberOf(text);
    const changed = next !== null && next !== value;
    const saveRow = () => next !== null && void write(() => save(index, next));
    return (
      <li key={index} className="tie-row clause-row">
        <span className="tie-target">
          {label ?? name}
          {note !== undefined && (
            <span id={id(`note-${index}`)} className="tie-note">
              {note}
            </span>
          )}
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="clause-condition"
          aria-label={inputLabel(name)}
          aria-describedby={note === undefined ? id("range") : `${id("range")} ${id(`note-${index}`)}`}
          aria-invalid={next === null || undefined}
          title={next === null ? editText.invalid(least, most) : undefined}
          value={text}
          disabled={busy}
          onChange={(e) => {
            const typedText = e.currentTarget.value;
            setTyped((all) => ({ ...all, [index]: typedText }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && changed) {
              saveRow();
            }
          }}
        />
        <button type="button" disabled={busy || !changed} onClick={saveRow}>
          {listText.save}
        </button>
        {replace !== undefined && (
          <button
            id={id(`replace-${index}`)}
            type="button"
            disabled={busy}
            title={listText.replaceTitle(name)}
            onClick={() => setReplacing(entry)}
          >
            {listText.replace}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          title={tieText.removeTitle(name)}
          onClick={() => void write(() => remove(index))}
        >
          {tieText.remove}
        </button>
      </li>
    );
  };

  return createPortal(
    // A click beside the dialog does nothing, and keeps focus where it is.
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
    >
      <div
        ref={dialog}
        className="modal move-dialog ties-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id("title")}
        aria-describedby={id("who")}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={id("title")}>{title}</h2>
          <p id={id("who")} className="move-player">
            {who}
          </p>
          {/* Every row takes the same numbers: one hint says them for all, while the rows are on show. */}
          {replacing === null && <RangeHint id={id("range")} min={formatNumber(least)} max={formatNumber(most)} />}
        </header>

        <div className="modal-body">
          {replacing?.replace !== undefined ? (
            <section className="move-section" aria-labelledby={id("replacing")}>
              <h3 id={id("replacing")}>{listText.insteadOf(replacing.name)}</h3>
              <ReplaceSearch
                replacement={replacing.replace}
                busy={busy}
                onPick={(option) => void write(option.choose)}
              />
            </section>
          ) : (
            sections.map((section) =>
              section.rows.length === 0 ? null : section.heading === null ? (
                <ul key={section.key} className="tie-rows">
                  {section.rows.map(row)}
                </ul>
              ) : (
                <section key={section.key} className="move-section" aria-labelledby={id(section.key)}>
                  <h3 id={id(section.key)}>{section.heading}</h3>
                  <ul className="tie-rows">{section.rows.map(row)}</ul>
                </section>
              ),
            )
          )}
        </div>

        <div className="ties-status" role="status">
          {busy ? tieText.working : ""}
        </div>
        {error !== null && (
          <div className="banner move-error" role="alert">
            {error}
          </div>
        )}

        <footer className="modal-foot">
          <button ref={closeButton} type="button" disabled={busy} onClick={replacing === null ? onClose : back}>
            {replacing === null ? tieText.close : listText.back}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
