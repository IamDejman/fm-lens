// The dialog that changes the entries of one of a person's lists, each a name and a number: how strongly he favours or
// dislikes each person and club, or how well he speaks each language. Each row's number can be saved, or the row
// removed. Each change is written at once, logged like any change and undone from the Changes view.

import { useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { describeError } from "./format";
import { editText, listText, tieText } from "./labels";
import { useModal } from "./useModal";
import { EditorContext } from "./useProfileEditing";

/** One entry of the list: its place in the list as the game holds it, its name, and its number. */
export interface ValueRow {
  index: number;
  name: string;
  /** What the row shows for the name, where that is more than the name: a club's logo beside it, say. */
  label?: ReactNode;
  value: number;
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

/**
 * The rows with the controls that change them: a number and its Save, and Remove. A write keeps every control busy
 * until the profile has read the game again; then the dialog shows the rows the game holds.
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

  useModal(dialog, !busy, onClose);

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
  }, [list]);

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

  const row = ({ index, name, label, value }: ValueRow) => {
    const text = typed[index] ?? String(value);
    const next = numberOf(text);
    const changed = next !== null && next !== value;
    const saveRow = () => next !== null && void write(() => save(index, next));
    return (
      <li key={index} className="tie-row clause-row">
        <span className="tie-target">{label ?? name}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="clause-condition"
          aria-label={inputLabel(name)}
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
        </header>

        <div className="modal-body">
          {sections.map((section) =>
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
          <button ref={closeButton} type="button" disabled={busy} onClick={onClose}>
            {tieText.close}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
