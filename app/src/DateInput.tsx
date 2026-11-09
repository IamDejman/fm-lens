import { useRef, useState, type InputHTMLAttributes } from "react";
import { dateLayout, dateText, isoFromDateText, typedDateText } from "./dateEntry";
import { numberFromIso } from "./editing";
import { intlLocale } from "./i18n";
import { editText } from "./labels";

const layout = dateLayout(intlLocale);
const hint = layout.order.map((part) => editText.dateParts[part]).join(layout.separator);
const canPick = typeof HTMLInputElement !== "undefined" && "showPicker" in HTMLInputElement.prototype;

interface DateInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "min" | "max" | "onChange" | "placeholder"
> {
  /** `YYYY-MM-DD`, or what was typed while that is no date yet; "" for none. */
  value: string;
  /** The earliest and the latest day of the calendar, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  /** The `YYYY-MM-DD` of what was typed or picked; the text itself while it is no whole, real date; "" when empty. */
  onChange: (value: string) => void;
}

/**
 * A date typed as text in the order of the language, the same in the Mac and the Windows app, with the browser's
 * calendar behind a button. The other props are those of the text input.
 */
export function DateInput(props: DateInputProps) {
  const { value, min, max, onChange, onBlur, onMouseDown, readOnly, disabled, ...rest } = props;
  const [draft, setDraft] = useState(() => ({ text: dateText(value, layout), value }));
  const field = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // A value that is not the one typed here came from outside (the calendar, a reset): show it.
  if (draft.value !== value) {
    setDraft({ text: dateText(value, layout), value });
  }
  const text = draft.value === value ? draft.text : dateText(value, layout);

  const type = (input: HTMLInputElement) => {
    const atEnd = input.selectionStart === null || input.selectionStart === input.value.length;
    const kept = input.value.replace(/[^\d\s/.-]/g, "");
    // A whole date takes no more digits: one typed after it starts the next date, as selecting it all first would.
    const added = kept.startsWith(text) ? kept.slice(text.length) : "";
    const raw = atEnd && /^\d/.test(added) && isoFromDateText(text, layout) !== null ? added : kept;
    const whole = isoFromDateText(raw, layout);
    // Only what is typed or pasted at the end is laid out: an edit in the middle and a deletion stay as typed.
    const laidOut = atEnd && kept.length > text.length;
    const next = !laidOut ? raw : whole !== null ? dateText(whole, layout) : typedDateText(raw, layout);
    const typed = isoFromDateText(next, layout) ?? next.trim();
    setDraft({ text: next, value: typed });
    onChange(typed);
  };

  return (
    <span className="date-field">
      <input
        {...rest}
        ref={field}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder={hint}
        value={text}
        readOnly={readOnly}
        disabled={disabled}
        onChange={(e) => type(e.currentTarget)}
        onMouseDown={(e) => {
          // The click that enters the field selects the date, as tabbing into it does, so that typing replaces it
          // rather than landing in the middle of it; a click inside the focused field places the caret.
          if (document.activeElement !== e.currentTarget) {
            e.preventDefault();
            e.currentTarget.focus();
            e.currentTarget.select();
          }
          onMouseDown?.(e);
        }}
        onBlur={(e) => {
          // "2/7/2028" reads as it will be sent.
          const typed = isoFromDateText(text, layout);
          if (typed !== null) {
            setDraft({ text: dateText(typed, layout), value });
          }
          onBlur?.(e);
        }}
      />
      {canPick && (
        <>
          <input
            ref={picker}
            className="date-picker"
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            value={numberFromIso(value) !== null ? value : ""}
            min={min}
            max={max}
            onChange={(e) => onChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              // The calendar is for picking: a date typed while it is open goes to the field that reads it right.
              if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                field.current?.focus();
                field.current?.select();
              }
            }}
          />
          <button
            type="button"
            className="date-pick"
            aria-label={editText.pickDate}
            disabled={readOnly || disabled}
            onClick={() => {
              try {
                // WebKit closes its calendar only when the date input loses focus, so it has to hold it.
                picker.current?.focus();
                picker.current?.showPicker();
              } catch {
                // No calendar to show: the date can still be typed.
              }
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 5.5h12v10.5H4zM4 9h12M7 3.5v3M13 3.5v3" />
            </svg>
          </button>
        </>
      )}
    </span>
  );
}
