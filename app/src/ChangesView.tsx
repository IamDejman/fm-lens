// The Changes view: everything written to the game this session, newest first, with an Undo for each change.

import { useCallback, useEffect, useRef, useState } from "react";
import { valueText } from "./editDraft";
import { changeLog, shownValue, undoChange } from "./editing";
import { fieldTable } from "./fieldTables";
import { describeError, formatTime } from "./format";
import { changesText as text, fieldLabel, profileText, valueChange } from "./labels";
import type { EditField, LoggedChange } from "./types";

/**
 * This session's change log. `reload` reads it again; when several reads overlap, the answer to the last one asked
 * is the one kept. `clear` forgets it, as a new connection starts with an empty log.
 */
export function useChangeLog() {
  const [log, setLog] = useState<LoggedChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++asked.current;
    try {
      const entries = await changeLog();
      if (mine === asked.current) {
        setLog(entries);
        setError(null);
      }
    } catch (e) {
      if (mine === asked.current) {
        setError(describeError(e));
      }
    }
  }, []);

  const clear = useCallback(() => {
    asked.current++;
    setLog([]);
    setError(null);
  }, []);

  return { log, error, reload, clear };
}

/**
 * The editable fields of players, staff and clubs by `entity:key`, to turn stored values into shown ones and to
 * know what kind of value they are (a date, an amount of money); null until read.
 */
function useFieldIndex(): { fields: ReadonlyMap<string, EditField> | null; error: string | null } {
  const [fields, setFields] = useState<ReadonlyMap<string, EditField> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fieldTable("player"), fieldTable("staff"), fieldTable("club")]).then(
      (tables) => {
        if (!cancelled) {
          setFields(new Map(tables.flat().map((field) => [`${field.entity}:${field.key}`, field] as const)));
        }
      },
      (e) => {
        if (!cancelled) {
          setError(describeError(e));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { fields, error };
}

interface ChangesViewProps {
  log: LoggedChange[];
  /** Why the log could not be read. */
  error: string | null;
  /** Reads the log again. */
  reload: () => void;
  /** Called after a change was undone: the game's data and the log are not what they were. */
  onUndone: () => void;
}

/** The table of this session's changes. It reads the log again whenever it is shown. */
export function ChangesView({ log, error, reload, onUndone }: ChangesViewProps) {
  const { fields, error: fieldsError } = useFieldIndex();
  const [undoing, setUndoing] = useState(false);
  // Why an undo failed, by change id.
  const [failures, setFailures] = useState<Record<number, string>>({});

  useEffect(() => {
    reload();
  }, [reload]);

  const undo = async (change: LoggedChange) => {
    setUndoing(true);
    setFailures((old) => {
      const rest = { ...old };
      delete rest[change.id];
      return rest;
    });
    try {
      await undoChange(change.id);
      onUndone();
    } catch (e) {
      setFailures((old) => ({ ...old, [change.id]: describeError(e) }));
      // The log may be out of date, e.g. when the change was undone already.
      reload();
    } finally {
      setUndoing(false);
    }
  };

  // Stored values are turned into shown ones with the field tables, so the rows wait for them.
  const ready = fields !== null || fieldsError !== null;
  const undone = log.filter((change) => change.undoneAt !== null).length;
  const problem = error ?? fieldsError;

  return (
    <div className="workspace">
      <section className="players changes">
        <div className="toolbar">
          <h2 className="view-title">{text.title}</h2>
          <span className="count">{text.count(log.length, undone)}</span>
        </div>
        <p className="view-note">{text.hint}</p>
        {problem && (
          <div className="banner" role="alert">
            {problem}
          </div>
        )}

        <div className="table-wrap">
          <table className="grid changes-grid">
            <thead>
              <tr>
                <th>{text.columns.time}</th>
                <th>{text.columns.name}</th>
                <th>{text.columns.field}</th>
                <th>{text.columns.change}</th>
                <th>{text.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {ready &&
                log.map((change) => (
                  <ChangeRow
                    key={change.id}
                    change={change}
                    field={fields?.get(`${change.entity}:${change.field}`)}
                    failure={failures[change.id]}
                    undoing={undoing}
                    onUndo={undo}
                  />
                ))}
            </tbody>
          </table>
          {ready && log.length === 0 && <p className="empty">{text.empty}</p>}
        </div>
      </section>
    </div>
  );
}

interface ChangeRowProps {
  change: LoggedChange;
  /**
   * The field's entry in the field table, for the conversion of its values and to tell a date or an amount of
   * money from a plain number; none when the table lacks it.
   */
  field: EditField | undefined;
  /** Why the last try to undo it failed. */
  failure: string | undefined;
  /** Whether any undo is under way: one at a time. */
  undoing: boolean;
  onUndo: (change: LoggedChange) => void;
}

function ChangeRow({ change, field, failure, undoing, onUndo }: ChangeRowProps) {
  const label = fieldLabel(change.entity, change.field);
  const shown = (stored: number) => (field ? shownValue(field, stored) : stored);
  // An attribute is stored on a finer scale than it is shown: its hover text has the values as stored.
  const storedNote = field?.scale === "attribute" ? text.stored(valueChange(change.old, change.new)) : undefined;

  return (
    <tr className={change.undoneAt === null ? undefined : "undone"}>
      <td className="date" title={new Date(change.at).toLocaleString()}>
        {formatTime(change.at)}
      </td>
      <td className="col-person">
        <div className="name">
          {change.name}
          <span className="tag kind">{text.kinds[change.entity]}</span>
        </div>
        <div className="sub uid">
          {change.entity === "staff" ? profileText.id : profileText.uid} {change.uid}
        </div>
      </td>
      <td>{label}</td>
      <td className="change-value" title={storedNote}>
        {valueChange(valueText(field, shown(change.old)), valueText(field, shown(change.new)))}
      </td>
      <td className="col-status">
        {change.undoneAt === null ? (
          <>
            <button type="button" disabled={undoing} title={text.undoTitle(label)} onClick={() => onUndo(change)}>
              {text.undo}
            </button>
            {failure !== undefined && (
              <span className="row-error" role="alert">
                {failure}
              </span>
            )}
          </>
        ) : (
          text.undone(formatTime(change.undoneAt))
        )}
      </td>
    </tr>
  );
}
