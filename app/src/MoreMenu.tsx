// A toolbar's less common actions, behind More.

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { appText } from "./labels";

/**
 * A More button that opens `children` in a small panel. The actions stay mounted while it is closed, so a dialog one of
 * them opened survives. The panel stays open while that dialog is up, so that focus can go back to the action when it
 * closes; Escape or a click elsewhere closes it.
 */
export function MoreMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
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
  }, [open]);

  return (
    <div
      ref={box}
      className="more-menu"
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          // An open profile closes on Escape too: this one is the panel's.
          event.stopPropagation();
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
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
      <div id={panelId} className="more-panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
