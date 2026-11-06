// The dialog that changes a player's or member of staff's likes and dislikes: how strongly he favours or dislikes each
// person and club, or that he no longer does. Each change is written at once, logged like any change and undone from
// the Changes view.

import { useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { changePreference, removePreference } from "./editing";
import { describeError } from "./format";
import { editText, likesText, profileText, tieText } from "./labels";
import { ClubLogo, PICTURE_SIZE, WithPicture } from "./Picture";
import type { Preference, PreferenceKind } from "./types";
import { useModal } from "./useModal";
import { EditorContext } from "./useProfileEditing";

/** The strengths the game gives a preference, which the editor writes. */
const LEAST_STRENGTH = 1;
const MOST_STRENGTH = 100;

/** Whose likes and dislikes: a player's, or a member of staff's for `staff`. */
export interface PreferenceOwner {
  uid: number;
  staff: boolean;
  name: string;
}

interface PreferencesDialogProps {
  owner: PreferenceOwner;
  preferences: Preference[];
  /** The kinds in the order the profile lists them. */
  kinds: readonly PreferenceKind[];
  onClose: () => void;
}

const nameOf = (preference: Preference) => preference.name ?? String(preference.targetUid);

const isClub = (kind: PreferenceKind) => kind === "favouredClub" || kind === "dislikedClub";

/** The strength typed, or null where it is not a whole number the editor writes. */
function strengthOf(text: string): number | null {
  const strength = Number(text.trim());
  return text.trim() !== "" && Number.isInteger(strength) && strength >= LEAST_STRENGTH && strength <= MOST_STRENGTH
    ? strength
    : null;
}

/**
 * The likes and dislikes with the controls that change them: a strength and its Save, and Remove. A write keeps every
 * control busy until the profile has read the game again; then the dialog shows the ones the game holds.
 */
export function PreferencesDialog({ owner, preferences, kinds, onClose }: PreferencesDialogProps) {
  const { onEdited } = useContext(EditorContext);
  const base = useId();
  const id = (part: string) => `${base}-${part}`;
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The strengths typed, by the index of the preference; the others show the game's.
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

  // The profile has read the game again: the strengths are the game's, and the controls take changes again.
  useEffect(() => {
    setBusy(false);
    setTyped({});
  }, [preferences]);

  // Focus goes back to the control that had it, or to Close when that control went with the preference it removed.
  useEffect(() => {
    const control = focused.current;
    if (busy || control === null) {
      return;
    }
    focused.current = null;
    (control.isConnected ? control : closeButton.current)?.focus();
  }, [busy]);

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

  const row = (preference: Preference) => {
    const name = nameOf(preference);
    const text = typed[preference.index] ?? String(preference.strength);
    const strength = strengthOf(text);
    const changed = strength !== null && strength !== preference.strength;
    const save = () => strength !== null && void write(() => changePreference(owner.uid, owner.staff, preference.index, strength));
    return (
      <li key={preference.index} className="tie-row clause-row">
        <span className="tie-target">
          {isClub(preference.kind) ? (
            <WithPicture
              inline
              picture={<ClubLogo uid={preference.targetUid} name={name} size={PICTURE_SIZE.textLogo} />}
            >
              {name}
            </WithPicture>
          ) : (
            name
          )}
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="clause-condition"
          aria-label={likesText.strengthOf(name)}
          aria-invalid={strength === null || undefined}
          title={strength === null ? editText.invalid(LEAST_STRENGTH, MOST_STRENGTH) : undefined}
          value={text}
          disabled={busy}
          onChange={(e) => {
            const next = e.currentTarget.value;
            setTyped((all) => ({ ...all, [preference.index]: next }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && changed) {
              save();
            }
          }}
        />
        <button type="button" disabled={busy || !changed} onClick={save}>
          {likesText.save}
        </button>
        <button
          type="button"
          disabled={busy}
          title={tieText.removeTitle(name)}
          onClick={() => void write(() => removePreference(owner.uid, owner.staff, preference.index))}
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
        aria-describedby={id("owner")}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={id("title")}>{profileText.preferences}</h2>
          <p id={id("owner")} className="move-player">
            {owner.name}
          </p>
        </header>

        <div className="modal-body">
          {kinds.map((kind) => {
            const listed = preferences.filter((preference) => preference.kind === kind);
            if (listed.length === 0) {
              return null;
            }
            return (
              <section key={kind} className="move-section" aria-labelledby={id(kind)}>
                <h3 id={id(kind)}>{profileText.preferenceKinds[kind]}</h3>
                <ul className="tie-rows">{listed.map(row)}</ul>
              </section>
            );
          })}
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
