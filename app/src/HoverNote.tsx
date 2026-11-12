// What a rating measures, in a box over its row while the pointer rests on it or the keyboard focus is in it, as FM
// shows one over the name of an attribute. The box is drawn over the window, so no panel or dialog clips it.

import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { layoutPixels } from "./appearance";

/** The space between the box and its row, and between the box and the edge of the window. */
const GAP = 6;
/** How long the pointer rests on a row before its box shows, so that crossing a list does not flash one per row. */
const DELAY = 200;

/** Puts away the box on screen, so that one shows at a time: the pointer may rest on one row and the focus be in another. */
let putAway: (() => void) | undefined;

interface Anchor {
  left: number;
  top: number;
  bottom: number;
}

export interface HoverNote {
  /** What the element the note is about takes: the handlers that show and hide the box, and its tie to the box. */
  target: {
    onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
    onFocus: (event: FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
    "aria-describedby": string | undefined;
  };
  /** The box while it shows, to render anywhere inside that element. */
  box: ReactNode;
}

/** The box for `note`, with `detail` in small print under it; without a note there is no box. */
export function useHoverNote(note: string | undefined, detail?: string): HoverNote {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();
  const open = anchor !== null && note !== undefined;

  const show = (element: HTMLElement) => {
    const at = element.getBoundingClientRect();
    putAway?.();
    putAway = () => setAnchor(null);
    setAnchor({ left: layoutPixels(at.left), top: layoutPixels(at.top), bottom: layoutPixels(at.bottom) });
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setAnchor(null);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Once on screen the box sits above its row, or under it where there is no room above, and inside the window.
  useLayoutEffect(() => {
    const element = box.current;
    if (anchor === null || element === null) {
      return;
    }
    const size = element.getBoundingClientRect();
    const [width, height] = [layoutPixels(size.width), layoutPixels(size.height)];
    const above = anchor.top - GAP - height;
    element.style.top = `${above >= GAP ? above : anchor.bottom + GAP}px`;
    element.style.left = `${Math.max(GAP, Math.min(anchor.left, layoutPixels(window.innerWidth) - GAP - width))}px`;
    element.style.visibility = "visible";
  }, [anchor]);

  // A scroll or a resize moves the row from under the box, and Escape puts the box away.
  useEffect(() => {
    if (!open) {
      return;
    }
    const shut = () => setAnchor(null);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        shut();
      }
    };
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  return {
    target: {
      onMouseEnter: (event) => {
        const element = event.currentTarget;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => show(element), DELAY);
      },
      onMouseLeave: hide,
      // The focus may be on the value or, while editing, in its input: the box shows for either.
      onFocus: (event) => show(event.currentTarget),
      onBlur: hide,
      "aria-describedby": open ? id : undefined,
    },
    box:
      open &&
      createPortal(
        <div ref={box} id={id} className="hover-note" role="tooltip" style={{ top: anchor.top, left: anchor.left }}>
          <p>{note}</p>
          {detail && <p className="hover-note-detail">{detail}</p>}
        </div>,
        document.body,
      ),
  };
}
