// Dragging a number: pressing on its input and moving sideways changes it step by step, right for more and left for
// less, as fast as the pointer moves. A press that does not move is the click it always was, which puts the caret in
// the input to type. Only the mouse and the pen drag: a finger scrolls.

import { useRef, useState, type DragEvent, type PointerEvent } from "react";
import { layoutPixels } from "./appearance";

/** How far the pointer moves sideways, in pixels of the window, before a press is a drag. */
const SLOP = 4;

interface Press {
  pointer: number;
  /** Where the steps are counted from: where the press left the slop. */
  x: number;
  /** The value the input stood for when it was pressed. */
  from: number;
  /** How many steps the drag has made of it so far. */
  steps: number;
  dragging: boolean;
}

interface DragValue {
  /** True from the first step's worth of movement until the button is let go. */
  dragging: boolean;
  /** For the input. */
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLInputElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLInputElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLInputElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLInputElement>) => void;
    onLostPointerCapture: (event: PointerEvent<HTMLInputElement>) => void;
    onDragStart: (event: DragEvent<HTMLInputElement>) => void;
  };
}

/**
 * Makes an input one that is dragged, while `enabled`. `value` is what it stands for now and `pace` how many pixels
 * of the layout make one step. `onDrag` is told the value the drag began at and how many steps it is from it now,
 * negative to the left, each time that count changes.
 */
export function useDragValue(
  enabled: boolean,
  value: number,
  pace: number,
  onDrag: (from: number, steps: number) => void,
): DragValue {
  const press = useRef<Press | null>(null);
  const [dragging, setDragging] = useState(false);

  const end = (event: PointerEvent<HTMLInputElement>) => {
    const held = press.current;
    if (held === null || held.pointer !== event.pointerId) {
      return;
    }
    press.current = null;
    if (held.dragging) {
      setDragging(false);
      // As after a click on a value: the number is selected, so that typing replaces it.
      if (document.activeElement === event.currentTarget) {
        event.currentTarget.select();
      }
    }
  };

  return {
    dragging,
    handlers: {
      onPointerDown: (event) => {
        if (!enabled || event.button !== 0 || !event.isPrimary || event.pointerType === "touch") {
          return;
        }
        press.current = { pointer: event.pointerId, x: event.clientX, from: value, steps: 0, dragging: false };
        // The moves and the release reach the input wherever the pointer goes.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event) => {
        const held = press.current;
        if (held === null || held.pointer !== event.pointerId) {
          return;
        }
        if (!held.dragging) {
          if (Math.abs(event.clientX - held.x) < SLOP) {
            return;
          }
          held.dragging = true;
          held.x = event.clientX;
          setDragging(true);
        }
        const steps = Math.trunc(layoutPixels(event.clientX - held.x) / pace);
        if (steps !== held.steps) {
          held.steps = steps;
          onDrag(held.from, steps);
        }
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
      // A press on selected text would carry the text off to drop it elsewhere, and end the drag of the value.
      onDragStart: (event) => {
        if (enabled) {
          event.preventDefault();
        }
      },
    },
  };
}
