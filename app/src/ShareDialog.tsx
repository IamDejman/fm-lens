// Sharing a player: the Share button in his profile, and the dialog it opens. The card is drawn on the device and only
// copied or saved to the exports folder: nothing is uploaded.

import { invoke } from "@tauri-apps/api/core";
import { useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { call, inTauri } from "./api";
import { describeError } from "./format";
import { shareText as text } from "./labels";
import { useDialogReturn } from "./MoreMenu";
import { CARD_FORMATS, CARD_SIZES, cardBlob, cardCaption, cardFileStem, drawCard, type CardFormat } from "./shareCard";
import type { FmDate, PlayerDetails, SavedCard } from "./types";
import { track } from "./usage";
import { useModal } from "./useModal";
import { EditorContext } from "./useProfileEditing";

/** Where the size and the CA and PA choice made last are kept. */
const FORMAT_KEY = "fmlens.cardFormat";
const ABILITY_KEY = "fmlens.cardAbility";

function saved<T>(key: string, read: (value: string | null) => T): T {
  try {
    return read(window.localStorage.getItem(key));
  } catch {
    return read(null);
  }
}

function keep(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not kept for next time; this card still uses it.
  }
}

/** Saves the PNG to the exports folder: the bytes go as they are, not as JSON. */
async function saveCard(png: Blob, stem: string): Promise<SavedCard> {
  if (!inTauri) {
    return call<SavedCard>("save_card", { stem });
  }
  const body = new Uint8Array(await png.arrayBuffer());
  return invoke<SavedCard>("save_card", body, { headers: { "Card-Stem": stem } });
}

/** What a card shows: the player as he was when the dialog opened. */
interface CardSubject {
  details: PlayerDetails;
  gameDate: FmDate | null;
}

/** The Share button of a player's profile, and the dialog it opens. It waits for his details. */
export function ShareButton({ details }: { details: PlayerDetails | undefined }) {
  const { gameDate } = useContext(EditorContext);
  const [subject, setSubject] = useState<CardSubject | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  useDialogReturn(subject !== null, button);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="icon-button"
        aria-haspopup="dialog"
        aria-label={text.button}
        disabled={details === undefined}
        title={text.buttonTitle}
        onClick={() => details && setSubject({ details, gameDate })}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path strokeLinejoin="round" d="M10 12.5V3M6.5 6.5 10 3l3.5 3.5M7 9H5v8h10V9h-2" />
        </svg>
      </button>
      {subject && <ShareDialog subject={subject} onClose={() => setSubject(null)} />}
    </>
  );
}

/** A card as drawn, shown at once, and its PNG, which takes a moment longer. */
interface Card {
  canvas: HTMLCanvasElement;
  png: Promise<Blob>;
}

/** The card as it will be shared, its size and whether it shows CA and PA, and Copy image, Save PNG and Copy caption. */
function ShareDialog({ subject, onClose }: { subject: CardSubject; onClose: () => void }) {
  const { details, gameDate } = subject;
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const [format, setFormat] = useState<CardFormat>(() =>
    saved(FORMAT_KEY, (value) => CARD_FORMATS.find((option) => option === value) ?? "post"),
  );
  const [showAbility, setShowAbility] = useState(() => saved(ABILITY_KEY, (value) => value !== "off"));
  const [card, setCard] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedCard, setSavedCard] = useState<SavedCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useModal(dialog, !busy, onClose);

  useEffect(() => {
    alive.current = true;
    dialog.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    return () => {
      alive.current = false;
    };
  }, []);

  // A new card for every choice; the last one stays in view until it is drawn.
  useEffect(() => {
    let current = true;
    drawCard({ details, gameDate, format, showAbility })
      .then((canvas) => {
        if (current) {
          const png = cardBlob(canvas);
          // Copy and Save say when it fails.
          png.catch(() => {});
          setCard({ canvas, png });
        }
      })
      .catch(() => {
        if (current) {
          setError(text.drawFailed);
        }
      });
    return () => {
      current = false;
    };
  }, [details, gameDate, format, showAbility]);

  // The canvas itself is the preview: it is the image that is shared.
  useEffect(() => {
    if (card) {
      card.canvas.setAttribute("role", "img");
      card.canvas.setAttribute("aria-label", text.preview(details.name));
      preview.current?.replaceChildren(card.canvas);
    }
  }, [card, details.name]);

  const say = (next: string) => {
    setError(null);
    setMessage(next);
  };

  const copyImage = async () => {
    if (!card) {
      return;
    }
    try {
      // The PNG goes as a promise: Safari copies only while the click is being handled.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": card.png })]);
      say(text.copied);
      track("card_exported", { action: "copy", format, ability: showAbility });
    } catch {
      setError(text.copyFailed);
    }
  };

  const save = async () => {
    if (!card || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const done = await saveCard(await card.png, cardFileStem(details.name, format, gameDate));
      track("card_exported", { action: "save", format, ability: showAbility });
      if (alive.current) {
        setSavedCard(done);
        say(text.saved(done.file));
      }
    } catch (e) {
      if (alive.current) {
        setError(describeError(e));
      }
    } finally {
      if (alive.current) {
        setBusy(false);
      }
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(cardCaption(details));
      say(text.captionCopied);
    } catch {
      setError(text.copyFailed);
    }
  };

  const show = async () => {
    if (savedCard === null) {
      return;
    }
    setError(null);
    try {
      await call("show_export", { path: savedCard.path });
    } catch (e) {
      setError(describeError(e));
    }
  };

  const { width, height } = CARD_SIZES[format];
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
        className="modal share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={titleId}>{text.title}</h2>
        </header>

        <div className="modal-body share-body">
          <div ref={preview} className="share-preview" style={{ aspectRatio: `${width} / ${height}` }} />
          <div className="share-controls">
            <fieldset className="export-formats">
              <legend>{text.formatLabel}</legend>
              {CARD_FORMATS.map((option) => (
                <label key={option} className="export-format">
                  <input
                    type="radio"
                    name="card-format"
                    value={option}
                    checked={format === option}
                    onChange={() => {
                      setFormat(option);
                      keep(FORMAT_KEY, option);
                    }}
                  />
                  <span className="export-format-name">{text.formats[option]}</span>
                </label>
              ))}
            </fieldset>
            <label className="export-format">
              <input
                type="checkbox"
                checked={showAbility}
                onChange={(event) => {
                  const next = event.currentTarget.checked;
                  setShowAbility(next);
                  keep(ABILITY_KEY, next ? "on" : "off");
                }}
              />
              <span className="export-format-name">{text.showAbility}</span>
            </label>
            <div className="share-actions">
              <button type="button" className="primary" disabled={!card} onClick={() => void copyImage()}>
                {text.copyImage}
              </button>
              <button type="button" disabled={!card || busy} onClick={() => void save()}>
                {text.save}
              </button>
              <button type="button" onClick={() => void copyCaption()}>
                {text.copyCaption}
              </button>
            </div>
          </div>
        </div>

        <div className="mass-result" role="status" aria-live="polite">
          {message !== null && <p>{message}</p>}
        </div>
        {error !== null && (
          <div className="banner mass-error" role="alert">
            {error}
          </div>
        )}

        <footer className="modal-foot">
          {savedCard !== null && (
            <button type="button" onClick={() => void show()}>
              {text.show}
            </button>
          )}
          <span className="export-foot-gap" />
          <button type="button" disabled={busy} onClick={onClose}>
            {text.close}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
