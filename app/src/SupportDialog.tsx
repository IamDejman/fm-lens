// Support FM Lens: the window the foot of the app, Settings and the Help menu open. It shows Ko-fi's own panel, so
// saying thanks never leaves the app. Ko-fi takes the payment: FM Lens sees none of it.

import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { appText, supportText } from "./labels";
import { useModal } from "./useModal";

const text = supportText;

/** FM Lens's page on Ko-fi (allowed in capabilities/default.json, and framed under tauri.conf.json's frame-src). */
const PAGE = "https://ko-fi.com/dejman";
/** The page's panel alone, which Ko-fi makes to be framed. */
const PANEL = `${PAGE}/?hidefeed=true&widget=true&embed=true&preview=true`;

/** Which button opened the window. */
export type SupportSource = "footer" | "settings" | "menu";

export function SupportDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);

  useModal(dialog, true, onClose);

  useEffect(() => {
    dialog.current?.focus();
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialog}
        className="modal support-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={id}>{text.title}</h2>
        </header>
        <div className="modal-body">
          <iframe className="support-panel" src={PANEL} title={text.title} tabIndex={0} />
        </div>
        <footer className="modal-foot">
          <button
            type="button"
            onClick={() => {
              openUrl(PAGE).catch(() => {
                // Nothing to fall back on: the panel stays where it is.
              });
            }}
          >
            {text.browser}
          </button>
          <button type="button" className="primary" onClick={onClose}>
            {appText.done}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
