// A toolbar's less common actions, behind More.

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { appText } from "./labels";

/** The menu an action is in: `hide` takes its panel off the screen, `focus` gives focus to its More button. */
interface Menu {
  hide: () => void;
  focus: () => void;
}

/** Null outside a menu. */
const MenuContext = createContext<Menu | null>(null);

/**
 * For an action that opens a dialog: the menu the action is in goes as the dialog opens, so its panel does not show
 * beside the dialog or over it. Once the dialog is gone (`open` false again), focus goes to the menu's More button;
 * outside a menu, to the action's own button. Doing that earlier, with the dialog still up, would only make the dialog
 * take focus back.
 */
export function useDialogReturn(open: boolean, button: RefObject<HTMLButtonElement | null>) {
  const menu = useContext(MenuContext);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      menu?.hide();
    } else if (wasOpen.current && !open) {
      (menu ? menu.focus : () => button.current?.focus())();
    }
    wasOpen.current = open;
  }, [open, menu, button]);
}

/**
 * A More button that opens `children` in a small panel. The actions stay mounted while it is closed, so a dialog one of
 * them opened survives the panel closing, which it does as the dialog opens (see `useDialogReturn`). Escape or a click
 * elsewhere closes it too.
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
  const menu = useMemo<Menu>(() => ({ hide: () => setOpen(false), focus: () => toggle.current?.focus() }), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && box.current?.contains(target)) {
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
        <MenuContext value={menu}>{children}</MenuContext>
      </div>
    </div>
  );
}
