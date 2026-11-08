// The promises made to a player: FM's number for each, when it was made and when it is due or ended, and while he is
// edited a Close button on each open one.

import { useContext, useEffect, useRef, useState } from "react";
import { closePromise } from "./editing";
import { describeError, formatDate } from "./format";
import { profileText } from "./labels";
import type { Promise as PlayerPromise } from "./types";
import { EditorContext } from "./useProfileEditing";

/** When a promise was made and when it is due, or ended; nothing for dates FM left unset. */
function promiseDates({ made, due, closed }: PlayerPromise): string {
  return [
    made && profileText.promiseMade(formatDate(made)),
    due && (closed ? profileText.promiseEnded(formatDate(due)) : profileText.promiseDue(formatDate(due))),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The group, which says so when he has no promise, or when the editor cannot read them (`promises` null). Closing asks
 * no question: it is logged, and undone from Changes.
 */
export function PromisesGroup({ uid, promises }: { uid: number; promises: PlayerPromise[] | null }) {
  const { editable, readOnlyNote, onEdited } = useContext(EditorContext);
  const [closing, setClosing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const list = useRef<HTMLUListElement>(null);
  // The promise just closed, whose row takes focus once its Close button, which had it, is gone.
  const closed = useRef<number | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The button stays busy until the profile has read the game again and the promise shows as closed. Focus then goes
  // to the promise's row, so that someone using the keyboard stays in the group.
  useEffect(() => {
    setClosing(null);
    const index = closed.current;
    closed.current = null;
    if (index !== null && document.activeElement === document.body) {
      (list.current?.children[index] as HTMLElement | undefined)?.focus();
    }
  }, [promises]);

  const close = async (index: number, promise: PlayerPromise) => {
    if (closing !== null) {
      return;
    }
    setClosing(index);
    setError(null);
    try {
      await closePromise(uid, index, promise);
      closed.current = index;
      onEdited();
    } catch (e) {
      if (alive.current) {
        setError(describeError(e));
        setClosing(null);
      }
    }
  };

  return (
    <section className="profile-group">
      <h3>{profileText.promises}</h3>
      {error !== null && (
        <p className="heal-error" role="alert">
          {error}
        </p>
      )}
      {promises === null ? (
        <p className="injuries-none">{profileText.promisesUnavailable}</p>
      ) : promises.length === 0 ? (
        <p className="injuries-none">{profileText.noPromises}</p>
      ) : (
        <ul ref={list} className="injury-list promise-list">
          {promises.map((promise, index) => (
            <li key={index} tabIndex={-1}>
              <div>
                <span className="injury-name">{profileText.promiseName(promise.id)}</span>
                <span className="injury-dates">{promiseDates(promise)}</span>
              </div>
              {!promise.closed && (
                <button
                  type="button"
                  className="heal-toggle"
                  disabled={!editable}
                  aria-disabled={closing === index || undefined}
                  aria-busy={closing === index || undefined}
                  title={editable ? profileText.closePromiseTitle : readOnlyNote}
                  onClick={() => void close(index, promise)}
                >
                  {profileText.closePromise}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
