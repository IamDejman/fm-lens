// Renaming a club: the button in the header of its profile, and the dialog it opens. The dialog has the club's name
// and its short name, each to change or leave. The rename is logged like any change, and one undo from the Changes
// view gives the club back the names it had.

import { useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createPortal } from "react-dom";
import { gameClubNames, renameClub } from "./editing";
import { describeError, isFailure } from "./format";
import { renameText } from "./labels";
import { useModal } from "./useModal";
import { EditorContext } from "./useProfileEditing";

const text = renameText;

/** The most characters a name takes (`MOST_NAME_CHARS` in the core). */
const MOST_CHARS = 50;

/** The macOS settings page that lets an app change files in other apps, where FM keeps its file of club names. */
const APP_MANAGEMENT = "x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles";

/** The club the dialog renames; a club without a short name is given none. */
interface NamedClub {
  uid: number;
  name: string;
  shortName: string | null;
}

/** The Rename button of a club's profile, and the dialog it opens. The profile decides when the button is there. */
export function RenameButton({ club }: { club: NamedClub }) {
  const { onEdited } = useContext(EditorContext);
  // The club the dialog was opened for: the profile behind it cannot change while it is up.
  const [opened, setOpened] = useState<NamedClub | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Once the dialog is gone, focus goes back to the button that opened it.
  useEffect(() => {
    if (wasOpen.current && opened === null) {
      button.current?.focus();
    }
    wasOpen.current = opened !== null;
  }, [opened]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="move-toggle"
        aria-haspopup="dialog"
        onClick={() => setOpened(club)}
      >
        {text.button}
      </button>
      {opened && <RenameDialog club={opened} onRenamed={onEdited} onClose={() => setOpened(null)} />}
    </>
  );
}

interface RenameDialogProps {
  club: NamedClub;
  /** Called once the club is renamed: the game has changed, so the lists and the profile read it again. */
  onRenamed: () => void;
  onClose: () => void;
}

function RenameDialog({ club, onRenamed, onClose }: RenameDialogProps) {
  const base = useId();
  const id = (part: string) => `${base}-${part}`;
  const dialog = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const running = useRef(false);

  const [name, setName] = useState(club.name);
  const [shortName, setShortName] = useState(club.shortName ?? "");
  const [renaming, setRenaming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The system keeps FM Lens out of FM's folder until it is allowed in its settings.
  const [blocked, setBlocked] = useState(false);
  // The names the game gives the club without FM Lens's file, where the file gives it others.
  const [original, setOriginal] = useState<{ name: string | null; shortName: string | null } | null>(null);

  useModal(dialog, !renaming, onClose);

  useEffect(() => {
    alive.current = true;
    nameInput.current?.select();
    gameClubNames(club.uid)
      .then((names) => {
        if (alive.current) {
          setOriginal(names ?? null);
        }
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);

  // Only a name that changed is sent; the other stays as the game has it.
  const newName = name.trim() !== club.name ? name.trim() : null;
  const newShortName = club.shortName !== null && shortName.trim() !== club.shortName ? shortName.trim() : null;
  const canRename = !renaming && (newName ?? newShortName) !== null && newName !== "" && newShortName !== "";

  const originalName = original?.name ?? name;
  const originalShort = club.shortName !== null ? (original?.shortName ?? shortName) : shortName;
  const showOriginal = original !== null && (originalName !== name || originalShort !== shortName);

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!canRename || running.current) {
      return;
    }
    running.current = true;
    setRenaming(true);
    setFailure(null);
    setBlocked(false);
    try {
      await renameClub(club.uid, newName, newShortName);
      onRenamed();
      onClose();
    } catch (e) {
      if (alive.current) {
        setFailure(describeError(e));
        setBlocked(isFailure(e) && e.code === "club.nameFileBlocked");
      }
    } finally {
      running.current = false;
      if (alive.current) {
        setRenaming(false);
      }
    }
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
        className="modal move-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id("title")}
        aria-busy={renaming || undefined}
        tabIndex={-1}
      >
        <form onSubmit={(event) => void rename(event)}>
          <header className="modal-head">
            <h2 id={id("title")}>{text.title}</h2>
          </header>

          <div className="modal-body rename-fields">
            <div className="move-term">
              <label htmlFor={id("name")}>{text.name}</label>
              <input
                ref={nameInput}
                id={id("name")}
                name="name"
                className="edit-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={MOST_CHARS}
                value={name}
                disabled={renaming}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {club.shortName !== null && (
              <div className="move-term">
                <label htmlFor={id("short")}>{text.shortName}</label>
                <input
                  id={id("short")}
                  name="shortName"
                  className="edit-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={MOST_CHARS}
                  value={shortName}
                  disabled={renaming}
                  onChange={(event) => setShortName(event.target.value)}
                />
              </div>
            )}
            {showOriginal && (
              <button
                type="button"
                disabled={renaming}
                onClick={() => {
                  setName(originalName);
                  setShortName(originalShort);
                }}
              >
                {text.original}
              </button>
            )}
          </div>

          {failure !== null && (
            <div className="banner move-error" role="alert">
              {failure}
              {blocked && (
                <button type="button" onClick={() => void openUrl(APP_MANAGEMENT).catch(() => setBlocked(false))}>
                  {text.appManagement}
                </button>
              )}
            </div>
          )}

          <footer className="modal-foot">
            <button type="submit" className="primary" disabled={!canRename}>
              {renaming ? text.renaming : text.rename}
            </button>
            <button type="button" disabled={renaming} onClick={onClose}>
              {text.cancel}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
