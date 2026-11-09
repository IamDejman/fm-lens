// The calendar of a date field: a month of days to pick from, drawn by the app. The browser's own calendar cannot be
// used: it opens on the day of the real world rather than the game's, the one of Chromium (the Windows app) keeps
// every key to itself, and the one of WebKit (the Mac app) only closes when a hidden input gives up focus.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { layoutPixels } from "./appearance";
import { numberFromIso } from "./editing";
import { intlLocale } from "./i18n";
import { editText } from "./labels";

/** The room the calendar keeps between itself and its field, and between itself and the edge of the window. */
const GAP = 4;
const DAY = 86_400_000;

const time = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (at: number): string => new Date(at).toISOString().slice(0, 10);
const addDays = (iso: string, days: number): string => isoOf(time(iso) + days * DAY);

/** The same day `months` later, or the last day of that month when it is shorter. */
function addMonths(iso: string, months: number): string {
  const date = new Date(time(iso));
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months + 1);
  date.setUTCDate(0); // the last day of the month aimed at
  date.setUTCDate(Math.min(day, date.getUTCDate()));
  return isoOf(date.getTime());
}

/** The day of the real world, for when the game's is not known. */
function realToday(): string {
  const now = new Date();
  return isoOf(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** The day a week starts on in the language, as `getUTCDay` counts (0 is Sunday); Monday when it does not say. */
function weekStart(): number {
  try {
    const tag = new Intl.Locale(intlLocale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay?: number };
      weekInfo?: { firstDay?: number };
    };
    return ((tag.getWeekInfo?.() ?? tag.weekInfo)?.firstDay ?? 1) % 7;
  } catch {
    return 1;
  }
}

const START = weekStart();
const monthName = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = new Intl.DateTimeFormat(intlLocale, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const weekdayName = new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" });
// 4 January 1970 was a Sunday.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => weekdayName.format((3 + START + i) * DAY));

interface DateCalendarProps {
  /** The date of the field, `YYYY-MM-DD`; anything else for none. */
  value: string;
  /** The day of the game, `YYYY-MM-DD`; "" when it is not known. */
  today: string;
  /** The earliest and the latest day that can be picked, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  /** The field the calendar hangs under. */
  anchor: RefObject<HTMLElement | null>;
  /** The button that opens it: a press on it is not a press elsewhere. */
  toggle: RefObject<HTMLElement | null>;
  onPick: (iso: string) => void;
  /** A digit was pressed: the date is being typed, which is the field's to read. */
  onType: () => void;
  /** Closes it; `back` when focus goes back to the button that opened it. */
  onClose: (back: boolean) => void;
}

export function DateCalendar({ value, today, min, max, anchor, toggle, onPick, onType, onClose }: DateCalendarProps) {
  const within = (iso: string) => (min && iso < min ? min : max && iso > max ? max : iso);
  // The day the keys are on. It opens on the date of the field, or else on the day of the game.
  const [cursor, setCursor] = useState(() =>
    within(numberFromIso(value) !== null ? value : numberFromIso(today) !== null ? today : realToday()),
  );
  const box = useRef<HTMLSpanElement>(null);

  // It hangs under its field, above it when there is no room below, and stays inside the window. Where (0, 0) lands is
  // measured first: a box around the field may be what a fixed box is placed in.
  useLayoutEffect(() => {
    const [calendar, field] = [box.current, anchor.current];
    if (calendar === null || field === null) {
      return;
    }
    // Measured from where it lands with no offset: that is not the window's corner under a transformed ancestor.
    calendar.style.left = "0px";
    calendar.style.top = "0px";
    const origin = calendar.getBoundingClientRect();
    const at = field.getBoundingClientRect();
    const [width, height] = [layoutPixels(origin.width), layoutPixels(origin.height)];
    const [right, bottom] = [layoutPixels(window.innerWidth) - GAP, layoutPixels(window.innerHeight) - GAP];
    let left = layoutPixels(at.left);
    let top = layoutPixels(at.bottom) + GAP;
    if (left + width > right) {
      left = Math.max(GAP, right - width);
    }
    if (top + height > bottom) {
      top = Math.max(GAP, layoutPixels(at.top) - GAP - height);
    }
    calendar.style.left = `${left - layoutPixels(origin.left)}px`;
    calendar.style.top = `${top - layoutPixels(origin.top)}px`;
  }, [anchor]);

  // Focus is on the day the keys are on, in whichever month is shown.
  useLayoutEffect(() => {
    box.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus({ preventScroll: true });
  }, [cursor]);

  // A press elsewhere closes it, and so does a scroll or a resize: the field may move, the calendar would not.
  useEffect(() => {
    const pressed = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && (box.current?.contains(target) || toggle.current?.contains(target))) {
        return;
      }
      onClose(false);
    };
    const shut = () => onClose(false);
    document.addEventListener("pointerdown", pressed, true);
    window.addEventListener("scroll", shut, { capture: true, passive: true });
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("pointerdown", pressed, true);
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
    };
  }, [toggle, onClose]);

  const move = (to: string) => {
    // Past the years a date is written with there is nothing to show.
    if (numberFromIso(to) !== null) {
      setCursor(within(to));
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    switch (event.key) {
      case "ArrowLeft":
        move(addDays(cursor, -1));
        break;
      case "ArrowRight":
        move(addDays(cursor, 1));
        break;
      case "ArrowUp":
        move(addDays(cursor, -7));
        break;
      case "ArrowDown":
        move(addDays(cursor, 7));
        break;
      case "PageUp":
        move(addMonths(cursor, event.shiftKey ? -12 : -1));
        break;
      case "PageDown":
        move(addMonths(cursor, event.shiftKey ? 12 : 1));
        break;
      case "Escape":
        // A dialog or a profile behind closes on Escape too: this one is the calendar's.
        event.stopPropagation();
        event.preventDefault();
        onClose(true);
        return;
      case "Tab":
        // Tab leaves the calendar for the controls around its button.
        onClose(true);
        return;
      default:
        if (/^\d$/.test(event.key)) {
          onType();
        }
        return;
    }
    event.preventDefault();
  };

  const first = `${cursor.slice(0, 8)}01`;
  const days = new Date(time(addMonths(first, 1)) - DAY).getUTCDate();
  const offset = (new Date(time(first)).getUTCDay() - START + 7) % 7;
  const step = (label: string, months: number, path: string) => (
    <button
      type="button"
      className="date-step"
      tabIndex={-1}
      aria-label={label}
      // Focus stays on the day, so that the keys go on working.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => move(addMonths(cursor, months))}
    >
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );

  return (
    <span
      ref={box}
      className="date-calendar"
      role="dialog"
      aria-label={editText.pickDate}
      onKeyDown={keyDown}
      // Inside a label a click would go to the label's input.
      onClick={(event) => event.preventDefault()}
    >
      <span className="date-calendar-head">
        {step(editText.previousYear, -12, "M5 2L2 5l3 3M8.5 2l-3 3 3 3")}
        {step(editText.previousMonth, -1, "M6.5 2l-3 3 3 3")}
        <span className="date-calendar-month" aria-live="polite">
          {monthName.format(time(first))}
        </span>
        {step(editText.nextMonth, 1, "M3.5 2l3 3-3 3")}
        {step(editText.nextYear, 12, "M5 2l3 3-3 3M1.5 2l3 3-3 3")}
      </span>
      <span className="date-calendar-days">
        {WEEKDAYS.map((name, i) => (
          <span key={i} className="date-weekday" aria-hidden="true">
            {name}
          </span>
        ))}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${cursor.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
          return (
            <button
              key={iso}
              type="button"
              className="date-day"
              data-day={iso}
              tabIndex={-1}
              style={i === 0 ? { gridColumnStart: offset + 1 } : undefined}
              aria-label={dayName.format(time(iso))}
              aria-pressed={iso === value}
              aria-current={iso === today ? "date" : undefined}
              disabled={(!!min && iso < min) || (!!max && iso > max)}
              onClick={() => onPick(iso)}
            >
              {i + 1}
            </button>
          );
        })}
      </span>
    </span>
  );
}
