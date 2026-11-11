// Report a problem and the wishlist: the dialog the buttons at the foot of the window open. The user says what happened,
// or what FM Lens should do next, and Send hands it to the report relay (see report.ts), a problem with what the app
// knows, with any screenshots and videos attached, pasted or dropped on the dialog. The user never leaves the app.

import { type ClipboardEvent, type DragEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { reportText, wishText } from "./labels";
import {
  ACCEPTED_FILES,
  type AttachProblem,
  type Attachment,
  type ReportFacts,
  type SendResult,
  attach,
  sendReport,
  sendWish,
} from "./report";
import { useModal } from "./useModal";

/** The longest report the relay takes, in characters. */
const MAX_LENGTH = 5000;

type Phase = "writing" | "sending" | SendResult;

/** A file to send, with the preview of an image. */
type Shown = Attachment & { preview?: string };

/** What the dialog sends: a problem, filed as a bug, or a wish, filed as a feature request. */
export type ReportKind = "problem" | "wish";

export function ReportDialog({
  kind = "problem",
  facts,
  onClose,
}: {
  kind?: ReportKind;
  facts: ReportFacts;
  onClose: () => void;
}) {
  const text = kind === "wish" ? { ...reportText, ...wishText } : reportText;
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [what, setWhat] = useState("");
  const [phase, setPhase] = useState<Phase>("writing");
  const [files, setFiles] = useState<Shown[]>([]);
  const [problem, setProblem] = useState<AttachProblem | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const sending = phase === "sending";
  const sent = phase === "sent";

  useModal(dialog, !sending, onClose);

  // The previews still shown, let go when the dialog closes.
  const shown = useRef(files);
  useEffect(() => {
    shown.current = files;
  }, [files]);
  useEffect(() => () => shown.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []);

  const add = (added: File[]) => {
    if (sending || sent || added.length === 0) {
      return;
    }
    const result = attach(files, added);
    setFiles([
      ...files,
      ...result.files
        .slice(files.length)
        .map((f) => (f.kind === "image" ? { ...f, preview: URL.createObjectURL(f.file) } : f)),
    ]);
    setProblem(result.problem);
  };

  const remove = (gone: Shown) => {
    if (gone.preview) {
      URL.revokeObjectURL(gone.preview);
    }
    setFiles(files.filter((f) => f !== gone));
    setProblem(null);
  };

  const paste = (event: ClipboardEvent) => {
    const pasted = [...event.clipboardData.files];
    if (pasted.length > 0) {
      event.preventDefault();
      add(pasted);
    }
  };

  const drop = (event: DragEvent) => {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      add([...event.dataTransfer.files]);
    }
  };

  const send = async () => {
    if (sending || what.trim() === "") {
      return;
    }
    setPhase("sending");
    setProblem(null);
    const result = await (kind === "wish" ? sendWish : sendReport)(facts, what.trim(), files);
    setPhase(result);
    // Not sent: back to the report, which is kept, to send again.
    if (result !== "sent") {
      field.current?.focus();
    }
  };

  const failure =
    phase === "tooMany"
      ? text.tooMany
      : phase === "failed"
        ? text.failed
        : problem !== null
          ? text.fileProblem[problem]
          : null;

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
        className="modal report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        aria-busy={sending || undefined}
        tabIndex={-1}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = sending || sent ? "none" : "copy";
          }
        }}
        onDrop={drop}
      >
        <header className="modal-head">
          <h2 id={id}>{text.title}</h2>
        </header>

        <div className="modal-body">
          <div className="live-region" role="status">
            {sent && <p className="move-plan ok">{text.sent}</p>}
          </div>
          {!sent && (
            <>
              <label className="report-what">
                {text.what}
                <textarea
                  ref={field}
                  // The dialog opens to write in.
                  autoFocus
                  name="what"
                  autoComplete="off"
                  rows={7}
                  value={what}
                  maxLength={MAX_LENGTH}
                  readOnly={sending}
                  onChange={(event) => setWhat(event.target.value)}
                  onPaste={paste}
                />
              </label>
              <div className="report-files">
                {files.length > 0 && (
                  <ul aria-label={text.files}>
                    {files.map((attachment, i) => (
                      <li key={`${attachment.file.name}-${i}`} title={attachment.file.name}>
                        {attachment.kind === "image" ? (
                          <img src={attachment.preview} alt={attachment.file.name} width={64} height={64} />
                        ) : (
                          <span className="report-video">{text.video}</span>
                        )}
                        <button
                          type="button"
                          className="report-remove"
                          aria-label={text.remove(attachment.file.name)}
                          disabled={sending}
                          onClick={() => remove(attachment)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" disabled={sending} onClick={() => picker.current?.click()}>
                  {text.attach}
                </button>
                <input
                  ref={picker}
                  type="file"
                  accept={ACCEPTED_FILES}
                  multiple
                  hidden
                  onChange={(event) => {
                    add([...(event.target.files ?? [])]);
                    event.target.value = "";
                  }}
                />
              </div>
            </>
          )}
        </div>

        {failure !== null && (
          <div className="banner move-error" role="alert">
            {failure}
          </div>
        )}

        <footer className="modal-foot">
          {sent ? (
            <button type="button" className="primary" autoFocus onClick={onClose}>
              {text.close}
            </button>
          ) : (
            <>
              <span className="move-foot-note">{text.sentWith}</span>
              <button
                type="button"
                className="primary"
                disabled={sending || what.trim() === ""}
                onClick={() => void send()}
              >
                {sending ? text.sending : text.send}
              </button>
              <button type="button" disabled={sending} onClick={onClose}>
                {text.cancel}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
