// What editing draws: the inputs, which take the place of the values they change, the Edit button, and the bar under a
// profile.

import { useContext, useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { DateInput } from "./DateInput";
import { valueText, type Pending } from "./editDraft";
import { isoFromNumber, isStoredFiner } from "./editing";
import { currencySymbol } from "./format";
import { blankLabel, changesText, choiceLabel, editText, fieldLabel, valueChange } from "./labels";
import {
  AppliedFieldsContext,
  EditActivationContext,
  useEditableField,
  useEditSession,
  type ProfileEditing,
  type Report,
} from "./useProfileEditing";

/**
 * The input of an editable field, showing the value as the game shows it and taking the values it takes: a number
 * input, with the sign of the chosen currency before it for an amount of money and the percent sign after it for a percentage, or a
 * date typed as text (`DateInput`, with the calendar of the browser behind a button) for a date. A field that holds a code from a list is a
 * select of its choices, and a yes-or-no a checkbox with the name of the field, or with Yes or No `inFact`, where the
 * label beside it names the field. A number that may be left empty says "none" while it is. A changed input is
 * outlined in the accent colour and says what it was; one that cannot be applied is outlined as an error. A number
 * input has the least and the most it takes under it, unless `hint` is false: in a group of inputs that take the same,
 * one `SharedRangeHint` says it for all. Nothing while the profile is not being edited.
 */
export function EditInput({ field, inFact = false, hint = true }: { field: string; inFact?: boolean; hint?: boolean }) {
  const session = useEditSession();
  const hintId = useId();
  const applied = useContext(AppliedFieldsContext).has(field);
  const input = session?.input(field);
  if (!session || !input) {
    return null;
  }
  const { field: spec, text, range, status, was, message, notice, stepped } = input;
  const label = fieldLabel(session.entity, field);
  const title = [message, status !== "same" && editText.was(valueText(spec, was))].filter(Boolean).join(" · ");
  const outline = status === "same" ? applied ? " applied" : "" : ` ${status}`;
  // What every kind of input carries: whether it holds something that cannot be applied, and its field, which focus
  // goes back to when an Apply refused its value.
  const common = { "aria-invalid": status === "invalid" || undefined, "data-field": field };

  // A yes-or-no is a checkbox in a pill, like the tag that shows it while the profile is read: the pill carries the
  // outline and the name of the field, or in a fact its value, as the fact says it while the profile is read.
  if (spec.kind === "flag") {
    return (
      <label className={`edit-flag${outline}`} title={title || undefined}>
        <input
          type="checkbox"
          checked={text === "1"}
          disabled={session.busy}
          aria-label={inFact ? label : undefined}
          {...common}
          onChange={(e) => session.type(field, e.currentTarget.checked ? "1" : "0")}
        />
        {inFact ? (text === "1" ? editText.yes : editText.no) : label}
      </label>
    );
  }

  if (spec.choices !== null) {
    // A code the game holds that the field does not offer stays on the list as the current one, so that a code picked
    // instead can be put back.
    const codes = spec.choices.includes(was) ? spec.choices : [was, ...spec.choices];
    return (
      <select
        className={`edit-input${outline}`}
        value={text}
        disabled={session.busy}
        aria-label={label}
        title={title || undefined}
        {...common}
        onChange={(e) => session.type(field, e.currentTarget.value)}
      >
        {codes.map((code) => (
          <option key={code} value={code}>
            {choiceLabel(spec.key, code)}
          </option>
        ))}
      </select>
    );
  }

  const date = spec.kind === "date";
  // A date's calendar keeps to its range on its own.
  const hinted = hint && !date;
  // A float such as FIFA points is typed to two decimal places; its range is in hundredths.
  const unit = spec.kind === "f32" ? 100 : 1;
  // A number that may be left empty is a text input: a number input reads what is no number (a lone minus sign) as
  // empty, which here would stand for "none".
  const clearable = spec.blank !== null;
  const blank = clearable ? blankLabel(spec.key) : undefined;
  // As wide as the longest value it takes, a minus sign included; an input that may be empty has room for its hint.
  const widest = (value: number) => (unit === 1 ? String(value) : (value / unit).toFixed(2)).length;
  const digits = Math.max(widest(range.min), widest(range.max), blank?.length ?? 0);
  const control = date ? (
    <DateInput
      className={`edit-input${outline}`}
      min={isoFromNumber(range.min)}
      max={isoFromNumber(range.max)}
      value={text}
      readOnly={session.busy}
      aria-label={label}
      aria-describedby={notice ? hintId : undefined}
      title={title || undefined}
      {...common}
      onChange={(value) => session.type(field, value)}
    />
  ) : (
    <input
      type={clearable ? "text" : "number"}
      inputMode={clearable ? "numeric" : undefined}
      className={`edit-input${outline}`}
      style={{ "--digits": digits } as CSSProperties}
      min={range.min / unit}
      max={range.max / unit}
      step={1 / unit}
      placeholder={blank}
      value={text}
      readOnly={session.busy}
      aria-label={label}
      aria-describedby={hinted || notice ? hintId : undefined}
      title={title || undefined}
      {...common}
      onChange={(e) => session.type(field, e.currentTarget.value)}
      // ↑ and ↓ step a wage to the next one FM shows as it is, rather than by £1.
      onKeyDown={
        stepped === null || session.busy
          ? undefined
          : (e) => {
              if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.altKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                session.type(field, e.key === "ArrowUp" ? stepped.up : stepped.down);
              }
            }
      }
      // A wheel turned over the focused input would change its value: let go of it, so the profile scrolls instead.
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
  const shown =
    spec.kind === "i32" ? (
      <span className="edit-money">
        <span className="edit-unit" aria-hidden="true">
          {currencySymbol}
        </span>
        {control}
      </span>
    ) : spec.scale === "percent" ? (
      <span className="edit-percent">
        {control}
        <span className="edit-unit" aria-hidden="true">
          {editText.percent}
        </span>
      </span>
    ) : (
      control
    );
  // Keep the wage input mounted while its display notice appears or disappears.
  if (!hinted && spec.key !== "contract.wage") {
    return shown;
  }
  return (
    <span className="edit-ranged">
      {shown}
      <span id={hintId}>
        {hinted && <RangeHint min={valueText(spec, range.min)} max={valueText(spec, range.max)} />}
        {notice && <span className="range-hint" role="status">{notice}</span>}
      </span>
    </span>
  );
}

/** "Min: 1 Max: 100": the least and the most a number input takes, as they are shown. */
export function RangeHint({ id, min, max }: { id?: string; min: string; max: string }) {
  return (
    <span id={id} className="range-hint">
      {/* The space keeps the two apart where the hint is read out as one line. */}
      <span>{editText.least(min)}</span> <span>{editText.most(max)}</span>
    </span>
  );
}

/**
 * The range of `field` while it is edited, said once for a group of inputs that all take the same, such as a profile's
 * attributes; nothing while it is not.
 */
export function SharedRangeHint({ field }: { field: string }) {
  const session = useEditSession();
  const input = session?.has(field) ? session.input(field) : undefined;
  if (!input) {
    return null;
  }
  return (
    <p className="range-hint-line">
      <RangeHint min={valueText(input.field, input.range.min)} max={valueText(input.field, input.range.max)} />
    </p>
  );
}

/**
 * `children` while the profile is read, the input of `field` in their place while it is edited. `inFact`: the value of
 * a fact, whose label names the field; `hint`: whether its range is said under it (see `EditInput`). While the profile
 * is read, a value that can be edited is a button that begins editing with its input focused.
 */
export function EditableValue({
  field,
  inFact,
  hint,
  children,
}: {
  field: string;
  inFact?: boolean;
  hint?: boolean;
  children: ReactNode;
}) {
  const editing = useEditableField(field);
  const applied = useContext(AppliedFieldsContext).has(field);
  if (editing) {
    return <EditInput field={field} inFact={inFact} hint={hint} />;
  }
  const value = <ActivatableValue field={field}>{children}</ActivatableValue>;
  return applied ? <span className="edit-applied" title={editText.appliedTitle}>{value}</span> : value;
}

/** `children` as a button that begins editing at `field`, where that is offered; else `children` as they are. */
export function ActivatableValue({ field, children }: { field: string; children: ReactNode }) {
  const activation = useContext(EditActivationContext);
  if (activation === null || !activation.canActivate(field)) {
    return children;
  }
  const label = `${editText.edit} ${fieldLabel(activation.entity, field)}`;
  return (
    <button
      type="button"
      className="editable-value"
      data-edit-field={field}
      aria-label={label}
      title={label}
      disabled={activation.busy}
      onClick={() => activation.activate(field)}
    >
      {children}
    </button>
  );
}

/** The Edit button in the header of a profile. It stays while editing, pressed, and then ends the editing like Done. */
export function EditButton({ editing, ready }: { editing: ProfileEditing; ready: boolean }) {
  if (!editing.editable) {
    return null;
  }
  const active = editing.stage === "edit";
  return (
    <button
      ref={editing.editButton}
      type="button"
      className="edit-toggle"
      data-tour="edit"
      aria-pressed={active}
      aria-busy={editing.stage === "loading" || undefined}
      disabled={!ready}
      title={editText.editTitle}
      onClick={active ? editing.done : () => editing.begin()}
    >
      {editText.edit}
    </button>
  );
}

/**
 * The bar at the foot of a profile: what the last Apply said, and while editing the list of changes and the
 * footer with the buttons. The report is in a live region that is always there, so it is read out when it fills.
 */
export function EditBar({ editing }: { editing: ProfileEditing }) {
  const { stage, changes, invalid, reviewing, confirming, applying, report } = editing;
  const reviewId = useId();
  const keepButton = useRef<HTMLButtonElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // The question takes the place of the buttons: focus goes to its safe answer, and back to Done once answered.
  useEffect(() => {
    if (confirming) {
      keepButton.current?.focus();
    } else if (wasConfirming.current) {
      doneButton.current?.focus();
    }
    wasConfirming.current = confirming;
  }, [confirming]);

  if (!editing.editable) {
    return null;
  }
  const showReview = stage === "edit" && reviewing && changes.length > 0;
  const canApply = changes.length > 0 && invalid === 0 && !applying;

  return (
    <div className="edit-bar">
      <div className="edit-report" role="status" aria-live="polite">
        {report && <ReportText report={report} />}
      </div>
      {report && (
        <button
          type="button"
          className="icon-button edit-dismiss"
          aria-label={editText.dismiss}
          title={editText.dismiss}
          onClick={editing.dismissReport}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      )}
      {showReview && <ReviewList id={reviewId} changes={changes} />}

      {stage === "edit" && (
        <div className="edit-footer" role="group" aria-label={editText.footer}>
          {confirming ? (
            <>
              <span className="edit-count">{editText.confirmDiscard(changes.length + invalid)}</span>
              <button type="button" ref={keepButton} onClick={editing.keepEditing}>
                {editText.keepEditing}
              </button>
              <button type="button" className="danger" onClick={editing.confirmDiscard}>
                {editText.discard}
              </button>
            </>
          ) : (
            <>
              <span className={changes.length > 0 ? "edit-count pending" : "edit-count"}>
                {editText.changes(changes.length)}
                {invalid > 0 && <span className="edit-invalid"> · {editText.invalidCount(invalid)}</span>}
              </span>
              <button
                type="button"
                aria-expanded={showReview}
                aria-controls={reviewId}
                disabled={changes.length === 0}
                onClick={editing.toggleReview}
              >
                {editText.review}
              </button>
              <button type="button" disabled={changes.length + invalid === 0 || applying} onClick={editing.discard}>
                {editText.discard}
              </button>
              <button
                type="button"
                className="primary"
                data-tour="apply"
                disabled={!canApply}
                title={invalid > 0 ? editText.applyBlocked : undefined}
                onClick={editing.apply}
              >
                {applying ? editText.applying : editText.apply}
              </button>
              <button type="button" ref={doneButton} disabled={applying} onClick={editing.done}>
                {editText.done}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** "Applied 3 changes", and the changes the game refused with its reasons. */
function ReportText({ report }: { report: Report }) {
  const { applied, problems } = report;
  return (
    <>
      {(applied > 0 || problems.length === 0) && (
        <p>{applied > 0 ? editText.applied(applied) : editText.nothingToChange}</p>
      )}
      {problems.length > 0 && (
        <ul className="edit-problems">
          {problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * What Apply would write, as "Finishing 17 → 20", "Contract end 30 Jun 2029 → 30 Jun 2031", "Balance £1,000 →
 * £2,000" or "Energy 70% → 100%"; the hover text of an attribute or a percentage has the stored values.
 */
function ReviewList({ id, changes }: { id: string; changes: Pending[] }) {
  return (
    <ul id={id} className="edit-review" aria-label={editText.reviewList}>
      {changes.map(({ field, was, now, wasStored, edit }) => (
        <li
          key={field.key}
          title={isStoredFiner(field) ? changesText.stored(valueChange(wasStored, edit.value)) : undefined}
        >
          <span>{fieldLabel(field.entity, field.key)}</span>{" "}
          <span className="edit-delta">{valueChange(valueText(field, was), valueText(field, now))}</span>
        </li>
      ))}
    </ul>
  );
}

