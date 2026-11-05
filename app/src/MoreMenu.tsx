// A toolbar's less common actions, folded behind More while space is short.

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { appText } from "./labels";

/**
 * Shows `children` as they are, or, while `folded`, behind a More button that opens them in a small panel. The actions
 * stay mounted either way, so a dialog one of them opened survives the fold. The panel stays open while that dialog is
 * up, so that focus can go back to the action when it closes; Escape or a click elsewhere closes it.
 */
export function MoreMenu({ folded, children }: { folded: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Unfolding closes the panel, so that it does not spring open the next time the actions fold.
  const [wasFolded, setWasFolded] = useState(folded);
  if (wasFolded !== folded) {
    setWasFolded(folded);
    setOpen(false);
  }
  const box = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const shown = !folded || open;

  useEffect(() => {
    if (!folded || !open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      // A click in a dialog an action opened is not a click elsewhere.
      if (target instanceof Element && (box.current?.contains(target) || target.closest(".modal-backdrop"))) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [folded, open]);

  return (
    <div
      ref={box}
      className="more-menu"
      data-folded={folded || undefined}
      onKeyDown={(event) => {
        if (folded && open && event.key === "Escape") {
          // An open profile closes on Escape too: this one is the panel's.
          event.stopPropagation();
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      {folded && (
        <button
          ref={toggle}
          type="button"
          className="more-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {appText.more}
        </button>
      )}
      <div id={panelId} className="more-panel" hidden={!shown}>
        {children}
      </div>
    </div>
  );
}
