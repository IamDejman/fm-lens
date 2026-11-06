// Report a problem: the dialog the button at the foot of the window opens. The user says what happened, and Send hands
// it to the report relay with what the app knows (see report.ts). The user never leaves the app.

import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { reportText as text } from "./labels";
import { type ReportFacts, type SendResult, sendReport } from "./report";
import { useModal } from "./useModal";

/** The longest report the relay takes, in characters. */
const MAX_LENGTH = 5000;

type Phase = "writing" | "sending" | SendResult;

export function ReportDialog({ facts, onClose }: { facts: ReportFacts; onClose: () => void }) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [what, setWhat] = useState("");
  const [phase, setPhase] = useState<Phase>("writing");
  const sending = phase === "sending";
  const sent = phase === "sent";

  useModal(dialog, !sending, onClose);

  const send = async () => {
    if (sending || what.trim() === "") {
      return;
    }
    setPhase("sending");
    const result = await sendReport(facts, what.trim());
    setPhase(result);
    // Not sent: back to the report, which is kept, to send again.
    if (result !== "sent") {
      field.current?.focus();
    }
  };

  const failure = phase === "tooMany" ? text.tooMany : phase === "failed" ? text.failed : null;

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
      >
        <header className="modal-head">
          <h2 id={id}>{text.title}</h2>
        </header>

        <div className="modal-body">
          {sent ? (
            <p className="move-plan ok" role="status">
              {text.sent}
            </p>
          ) : (
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
              />
            </label>
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
