import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { profileText } from "./labels";

// The left edge of the profile panel can be dragged to make the panel wider or narrower. The width is kept, one for
// profiles and one for the wide panels (a club's squad), so the next profile opens as wide as the last one was left.

/** Where the widths are kept. */
const STORAGE_KEY = "fmlibre.profileWidth";

/** The narrowest a panel can be made: its `min-width` in the style sheet. */
const PANEL_MIN = 440;

/** What the list beside the panel keeps at least, however wide the panel is dragged. */
const LIST_MIN = 360;

/** How far an arrow key moves the edge. */
const KEY_STEP = 24;

export type PanelKind = "profile" | "wide";

type Widths = Partial<Record<PanelKind, number>>;

/** The widths saved earlier; none when nothing is saved, or when the storage cannot be read. */
function savedWidths(): Widths {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    const widths: Widths = {};
    if (typeof saved === "object" && saved !== null) {
      for (const kind of ["profile", "wide"] as const) {
        const width: unknown = (saved as Record<string, unknown>)[kind];
        if (typeof width === "number" && Number.isFinite(width) && width >= PANEL_MIN) {
          widths[kind] = Math.round(width);
        }
      }
    }
    return widths;
  } catch {
    return {};
  }
}

function saveWidths(widths: Widths): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Not kept: the panel opens at its usual width next time.
  }
}

/**
 * The width of a panel of `kind` that the user set, and how to change it; undefined while it has its usual width.
 * The style it returns caps the width so that the list keeps `LIST_MIN` when the window is made smaller later.
 */
export function usePanelWidth(kind: PanelKind) {
  const [widths, setWidths] = useState(savedWidths);
  const width = widths[kind];
  const set = (next: number | undefined) => {
    // Another panel may have saved its width since this one opened: start from what is saved.
    const all = { ...savedWidths(), [kind]: next };
    if (next === undefined) {
      delete all[kind];
    }
    saveWidths(all);
    setWidths(all);
  };
  const style = width === undefined ? undefined : { flexBasis: `min(${width}px, 100% - ${LIST_MIN}px)` };
  return { width, set, style };
}

/** The widest `panel` can be made in the space it has now: the list keeps `LIST_MIN`. */
function widest(panel: HTMLElement): number {
  const space = panel.parentElement?.clientWidth ?? window.innerWidth;
  return Math.max(PANEL_MIN, space - LIST_MIN);
}

const clamp = (width: number, max: number) => Math.round(Math.min(Math.max(width, PANEL_MIN), max));

/**
 * The handle on the left edge of a panel: drag it, or focus it and press the arrow keys, to resize the panel;
 * double-click it, or press Enter, to give the panel its usual width again.
 */
export function PanelResizer({ panelWidth }: { panelWidth: ReturnType<typeof usePanelWidth> }) {
  const [dragging, setDragging] = useState(false);
  // For assistive technology: the width now, which the style sheet decides while the user has set none.
  const [shown, setShown] = useState<{ now: number; max: number } | null>(null);

  const panelOf = (handle: HTMLElement) => handle.parentElement as HTMLElement;

  const describe = (panel: HTMLElement) =>
    setShown({ now: Math.round(panel.getBoundingClientRect().width), max: widest(panel) });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    handle.focus();
    setDragging(true);
  };

  // While dragging the panel follows the pointer directly, without rendering the profile on every move; the width is
  // kept when the button is let go.
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) {
      return;
    }
    const panel = panelOf(event.currentTarget);
    const width = clamp(panel.getBoundingClientRect().right - event.clientX, widest(panel));
    panel.style.flexBasis = `${width}px`;
  };

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) {
      return;
    }
    setDragging(false);
    const panel = panelOf(event.currentTarget);
    panelWidth.set(Math.round(panel.getBoundingClientRect().width));
    // React sets the style from the saved width again.
    panel.style.flexBasis = "";
    describe(panel);
  };

  const reset = (panel: HTMLElement) => {
    panelWidth.set(undefined);
    panel.style.flexBasis = "";
    requestAnimationFrame(() => describe(panel));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const panel = panelOf(event.currentTarget);
    const now = panel.getBoundingClientRect().width;
    const max = widest(panel);
    let next: number | null = null;
    // The handle is on the left edge: left widens the panel, right narrows it.
    if (event.key === "ArrowLeft") {
      next = now + KEY_STEP;
    } else if (event.key === "ArrowRight") {
      next = now - KEY_STEP;
    } else if (event.key === "Home") {
      next = max;
    } else if (event.key === "End") {
      next = PANEL_MIN;
    } else if (event.key === "Enter") {
      event.preventDefault();
      reset(panel);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      next = clamp(next, max);
      panelWidth.set(next);
      setShown({ now: next, max });
    }
  };

  return (
    <div
      className={dragging ? "panel-resizer dragging" : "panel-resizer"}
      role="separator"
      aria-orientation="vertical"
      aria-label={profileText.resize}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={shown?.max}
      aria-valuenow={shown?.now}
      title={profileText.resizeHint}
      tabIndex={0}
      onFocus={(event) => describe(panelOf(event.currentTarget))}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={(event) => reset(panelOf(event.currentTarget))}
      onKeyDown={onKeyDown}
    />
  );
}
