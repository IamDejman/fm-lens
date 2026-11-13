// The columns of the player list: which there are, which the user chose to show, and the dialog that chooses them.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PERSONALITY_PREFIX, PLAYER_ATTRIBUTES } from "./AttributeFilters";
import { ATTRIBUTE_LABELS, playerListText, type AttributeKey } from "./labels";
import { useDialogReturn } from "./MoreMenu";
import { isRecord } from "./restore";
import { useModal } from "./useModal";

const text = playerListText.columnChooser;

/** The columns after the name, in the order the table has them; the attribute columns come before the abilities. */
export const PLAYER_COLUMNS = [
  "age",
  "positions",
  "nation",
  "club",
  "contractExpires",
  "born",
  "value",
  "wage",
  "reputation",
  "currentAbility",
  "potentialAbility",
  "uid",
] as const;

export type PlayerColumn = (typeof PLAYER_COLUMNS)[number];

/** The most attributes that are columns at once. */
export const MAX_ATTRIBUTE_COLUMNS = 8;

/** The columns the user chose: which of `PLAYER_COLUMNS`, and the attributes that have a column, by key. */
export interface ColumnChoice {
  columns: readonly PlayerColumn[];
  attributes: readonly string[];
}

/** What the list shows until the user chooses: everything but the reputation, and no attribute. */
export const DEFAULT_COLUMNS: ColumnChoice = {
  columns: PLAYER_COLUMNS.filter((column) => column !== "reputation"),
  attributes: [],
};

/** Where the choice is kept. */
const STORAGE_KEY = "fmlens.playerColumns";

/** The groups of attributes a column can show: a player's own, not the personality ratings of the filter rows. */
const ATTRIBUTE_GROUPS = PLAYER_ATTRIBUTES.groups.filter(
  (group) => !group.keys.some((key) => key.startsWith(PERSONALITY_PREFIX)),
);

/** Every attribute a column can show, in the order the profile lists them. */
const ATTRIBUTE_KEYS: readonly string[] = ATTRIBUTE_GROUPS.flatMap((group) => group.keys);

/** The choice in a stored value: columns and attributes there are, each once, in the table's order. */
export function readColumns(value: unknown): ColumnChoice {
  if (!isRecord(value) || !Array.isArray(value.columns) || !Array.isArray(value.attributes)) {
    return DEFAULT_COLUMNS;
  }
  const { columns, attributes } = value;
  return {
    columns: PLAYER_COLUMNS.filter((column) => columns.includes(column)),
    attributes: ATTRIBUTE_KEYS.filter((key) => attributes.includes(key)).slice(0, MAX_ATTRIBUTE_COLUMNS),
  };
}

function storedColumns(): ColumnChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? DEFAULT_COLUMNS : readColumns(JSON.parse(stored));
  } catch {
    return DEFAULT_COLUMNS;
  }
}

/** The columns the user chose, kept for the next time the app opens. */
export function usePlayerColumns(): [ColumnChoice, (choice: ColumnChoice) => void] {
  const [choice, setChoice] = useState(storedColumns);
  const choose = (next: ColumnChoice) => {
    setChoice(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Without storage the choice lasts until the window is closed.
    }
  };
  return [choice, choose];
}

/** An attribute's name: the app's own for a key it knows. */
export const attributeName = (key: string) => ATTRIBUTE_LABELS[key as AttributeKey] ?? key;

/**
 * What an attribute's column is headed, as it has room for a number only: the first letters of a name of several
 * words ("OtB"), else its first three ("Fin"). The header's hover text has the whole name.
 */
export function attributeHeading(key: string): string {
  const words = attributeName(key).split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.map((word) => word[0]).join("").slice(0, 3) : (words[0] ?? key).slice(0, 3);
}

interface ColumnsButtonProps {
  choice: ColumnChoice;
  onChoose: (choice: ColumnChoice) => void;
}

/** Columns, among the list's less common actions, and the dialog it opens. */
export function ColumnsButton({ choice, onChoose }: ColumnsButtonProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useDialogReturn(open, button);
  return (
    <>
      <button ref={button} type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {text.button}
      </button>
      {open && <ColumnsDialog choice={choice} onChoose={onChoose} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A checkbox for each column, then for each attribute; a change shows in the list behind at once. */
function ColumnsDialog({ choice, onChoose, onClose }: ColumnsButtonProps & { onClose: () => void }) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useModal(dialog, true, onClose);
  useEffect(() => {
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  const full = choice.attributes.length >= MAX_ATTRIBUTE_COLUMNS;
  const toggleColumn = (column: PlayerColumn, on: boolean) =>
    onChoose({
      ...choice,
      columns: PLAYER_COLUMNS.filter((other) => (other === column ? on : choice.columns.includes(other))),
    });
  const toggleAttribute = (key: string, on: boolean) =>
    onChoose({
      ...choice,
      attributes: ATTRIBUTE_KEYS.filter((other) => (other === key ? on : choice.attributes.includes(other))),
    });

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
      <div ref={dialog} className="modal columns-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal-head">
          <h2 id={titleId}>{text.title}</h2>
        </header>
        <div className="modal-body">
          <div className="column-choices">
            {PLAYER_COLUMNS.map((column) => (
              <label key={column} className="column-choice">
                <input
                  type="checkbox"
                  checked={choice.columns.includes(column)}
                  onChange={(event) => toggleColumn(column, event.currentTarget.checked)}
                />
                <span>{playerListText.columns[column]}</span>
              </label>
            ))}
          </div>
          <h3>{text.attributes}</h3>
          {ATTRIBUTE_GROUPS.map((group) => (
            <fieldset key={group.label} className="column-group">
              <legend>{group.label}</legend>
              <div className="column-choices">
                {group.keys.map((key) => {
                  const on = choice.attributes.includes(key);
                  return (
                    <label key={key} className="column-choice">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={full && !on}
                        onChange={(event) => toggleAttribute(key, event.currentTarget.checked)}
                      />
                      <span>{attributeName(key)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <p className="note" role="status">
            {full ? text.full(MAX_ATTRIBUTE_COLUMNS) : ""}
          </p>
        </div>
        <footer className="modal-foot">
          <button type="button" onClick={() => onChoose(DEFAULT_COLUMNS)}>
            {text.reset}
          </button>
          <span className="export-foot-gap" />
          <button type="button" className="primary" onClick={onClose}>
            {text.done}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
