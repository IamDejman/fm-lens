// A toolbar's less common actions, behind More.

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { appText } from "./labels";

/** Closes the menu an action is in and gives focus to its More button; null outside a menu. */
const MenuContext = createContext<(() => void) | null>(null);

/**
 * For an action that opens a dialog: once the dialog is gone (`open` false again), the menu the action is in closes
 * and focus goes to its More button; outside a menu, focus goes back to the action's own button. Doing it earlier,
 * with the dialog still up, would only make the dialog take focus back.
 */
export function useDialogReturn(open: boolean, button: RefObject<HTMLButtonElement | null>) {
  const closeMenu = useContext(MenuContext);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) {
      if (closeMenu) {
        closeMenu();
      } else {
        button.current?.focus();
      }
    }
    wasOpen.current = open;
  }, [open, closeMenu, button]);
}

/**
 * A More button that opens `children` in a small panel. The actions stay mounted while it is closed, so a dialog one of
 * them opened survives. The panel stays open while that dialog is up and closes with it (see `useDialogReturn`);
 * Escape or a click elsewhere closes it too.
 */
export function MoreMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => {
    setOpen(false);
    toggle.current?.focus();
  }, []);

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
          close();
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
        <MenuContext value={close}>{children}</MenuContext>
      </div>
    </div>
  );
}
