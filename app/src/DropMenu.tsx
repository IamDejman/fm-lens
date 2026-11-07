// A button that opens a menu: the Lists menu of the top bar, and More among a squad's actions. The menu is drawn over
// the window at the place of its button, so that no box with a scroll of its own cuts it off.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { layoutPixels } from "./appearance";

/** The room the menu keeps between itself and its button, and between itself and the edge of the window. */
const GAP = 4;

/** The items of a menu that arrow keys move between. */
const ITEMS = '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)';

/** Where the open menu hangs: the window's coordinates of its button. */
interface Anchor {
  left: number;
  top: number;
  bottom: number;
}

interface DropMenuProps {
  /** What the button shows; a chevron follows it. */
  label: ReactNode;
  /** The menu's name for assistive technology. */
  menuLabel: string;
  /** The button's class. */
  className: string;
  title?: string;
  /** Whether the view on screen is one of its items. */
  current?: boolean;
  /** Whether there is nothing to pick from now. */
  disabled?: boolean;
  /** Whether a change is under way: the button is only dimmed (aria-disabled), and the menu waits for it. */
  busy?: boolean;
  /**
   * The items: buttons with the role "menuitem" or "menuitemradio" and a tabIndex of -1. `close` shuts the menu and
   * gives focus back to its button; an item calls it before it does anything.
   */
  children: (close: () => void) => ReactNode;
}

/** The chevron at the end of a button that opens something under it. */
export function Chevron() {
  return (
    <svg className="drop-chevron" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
}

export function DropMenu({ label, menuLabel, className, title, current, disabled, busy, children }: DropMenuProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  const show = () => {
    const box = button.current?.getBoundingClientRect();
    if (box) {
      setAnchor({ left: layoutPixels(box.left), top: layoutPixels(box.top), bottom: layoutPixels(box.bottom) });
    }
  };

  const close = () => {
    setAnchor(null);
    button.current?.focus();
  };

  // Once the menu is on screen it stays inside the window, above its button when there is no room below, and takes
  // focus: the item that is current, or else the first.
  useLayoutEffect(() => {
    const list = menu.current;
    if (anchor === null || list === null) {
      return;
    }
    const box = list.getBoundingClientRect();
    const [width, height] = [layoutPixels(box.width), layoutPixels(box.height)];
    const [right, bottom] = [layoutPixels(window.innerWidth) - GAP, layoutPixels(window.innerHeight) - GAP];
    if (anchor.left + width > right) {
      list.style.left = `${Math.max(GAP, right - width)}px`;
    }
    if (anchor.bottom + GAP + height > bottom) {
      list.style.top = `${Math.max(GAP, anchor.top - GAP - height)}px`;
    }
    (list.querySelector<HTMLElement>('[aria-checked="true"]') ?? list.querySelector<HTMLElement>(ITEMS))?.focus();
  }, [anchor]);

  // A press elsewhere closes it, and so does a scroll or a resize: the button may move, the menu would not.
  useEffect(() => {
    if (!open) {
      return;
    }
    const pressed = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && (menu.current?.contains(target) || button.current?.contains(target))) {
        return;
      }
      setAnchor(null);
    };
    const shut = () => setAnchor(null);
    document.addEventListener("pointerdown", pressed, true);
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("pointerdown", pressed, true);
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
    };
  }, [open]);

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(ITEMS));
    const at = items.findIndex((item) => item === document.activeElement);
    let next: HTMLElement | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = items[(at + 1) % items.length];
        break;
      case "ArrowUp":
        next = items[(at - 1 + items.length) % items.length];
        break;
      case "Home":
        next = items[0];
        break;
      case "End":
        next = items[items.length - 1];
        break;
      case "Escape":
        // A profile behind closes on Escape too: this one is the menu's.
        event.stopPropagation();
        event.preventDefault();
        close();
        return;
      case "Tab":
        // Tab leaves the menu for the controls after its button.
        close();
        return;
      default:
        return;
    }
    event.preventDefault();
    next?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`${className} drop-toggle`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={current ? "page" : undefined}
        aria-disabled={busy || undefined}
        disabled={disabled}
        title={title}
        onClick={() => {
          if (open) {
            setAnchor(null);
          } else if (!busy) {
            show();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open && !busy) {
            event.preventDefault();
            show();
          }
        }}
      >
        {label}
        <Chevron />
      </button>
      {anchor !== null &&
        createPortal(
          <div
            ref={menu}
            className="squad-menu drop-menu"
            role="menu"
            aria-label={menuLabel}
            style={{ top: anchor.bottom + GAP, left: anchor.left }}
            onKeyDown={keyDown}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}
