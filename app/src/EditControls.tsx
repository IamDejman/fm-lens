// What editing draws: the inputs, the Edit button, the bar under a profile, and the groups only editing has.

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { valueText, type Pending } from "./editDraft";
import { isoFromNumber } from "./editing";
import { changesText, editText, fieldLabel, POSITION_LABELS, valueChange } from "./labels";
import { PITCH_ORDER } from "./PositionPitch";
import type { Entity } from "./types";
import { useEditableField, useEditSession, type ProfileEditing, type Report } from "./useProfileEditing";

/**
 * The input of an editable field, showing the value as the game shows it and taking the values it takes: a number
 * input, with the pound sign before it for an amount of money, or a date input (`YYYY-MM-DD`, with the calendar of
 * the browser) for a date. A changed input is outlined in the accent colour and says what it was; one that cannot
 * be applied is outlined as an error. Nothing while the profile is not being edited.
 */
export function EditInput({ field }: { field: string }) {
  const session = useEditSession();
  const input = session?.input(field);
  if (!session || !input) {
    return null;
  }
  const { field: spec, text, range, status, was, message } = input;
  const date = spec.kind === "date";
  const title = [message, status !== "same" && editText.was(valueText(spec, was))].filter(Boolean).join(" · ");
  // As wide as the longest value it takes, a minus sign included.
  const digits = Math.max(String(range.min).length, String(range.max).length);
  const control = (
    <input
      type={date ? "date" : "number"}
      className={status === "same" ? "edit-input" : `edit-input ${status}`}
      // A date input is as wide as the browser makes it.
      style={date ? undefined : ({ "--digits": digits } as CSSProperties)}
      min={date ? isoFromNumber(range.min) : range.min}
      max={date ? isoFromNumber(range.max) : range.max}
      step={date ? undefined : 1}
      value={text}
      readOnly={session.busy}
      aria-label={fieldLabel(session.entity, field)}
      aria-invalid={status === "invalid" || undefined}
      title={title || undefined}
      data-field={field}
      onChange={(e) => session.type(field, e.currentTarget.value)}
      // A wheel turned over the focused input would change its value: let go of it, so the profile scrolls instead.
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
  return spec.kind === "i32" ? (
    <span className="edit-money">
      <span className="edit-unit" aria-hidden="true">
        {editText.pounds}
      </span>
      {control}
    </span>
  ) : (
    control
  );
}

/** `children` while the profile is read, the input of `field` while it is edited. */
export function EditableValue({ field, children }: { field: string; children: ReactNode }) {
  const editing = useEditableField(field);
  return editing ? <EditInput field={field} /> : children;
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
      aria-pressed={active}
      aria-busy={editing.stage === "loading" || undefined}
      disabled={!ready}
      title={editText.editTitle}
      onClick={active ? editing.done : editing.begin}
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
              <span className="edit-count">{editText.confirmDiscard(changes.length)}</span>
              <button type="button" ref={keepButton} onClick={editing.keepEditing}>
                {editText.keepEditing}
              </button>
              <button type="button" className="danger" onClick={editing.confirmDiscard}>
                {editText.discard}
              </button>
            </>
          ) : (
            <>
              <span className="edit-count">
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
 * What Apply would write, as "Finishing 17 → 20", "Contract end 30 Jun 2029 → 30 Jun 2031" or "Balance £1,000 →
 * £2,000"; the hover text of an attribute has the stored values.
 */
function ReviewList({ id, changes }: { id: string; changes: Pending[] }) {
  return (
    <ul id={id} className="edit-review" aria-label={editText.reviewList}>
      {changes.map(({ field, was, now, wasStored, edit }) => (
        <li
          key={field.key}
          title={field.scale === "attribute" ? changesText.stored(valueChange(wasStored, edit.value)) : undefined}
        >
          <span>{fieldLabel(field.entity, field.key)}</span>{" "}
          <span className="edit-delta">{valueChange(valueText(field, was), valueText(field, now))}</span>
        </li>
      ))}
    </ul>
  );
}

/** Current and potential ability as inputs, above the attributes; there only while the person is being edited. */
export function AbilityEditGroup({ entity }: { entity: Entity }) {
  const editing = useEditableField("current_ability");
  if (!editing) {
    return null;
  }
  return (
    <section className="profile-group edit-ability">
      <h3>{editText.ability}</h3>
      <dl className="stats">
        {["current_ability", "potential_ability"].map((field) => (
          <div className="stat" key={field}>
            <dt>{fieldLabel(entity, field)}</dt>
            <dd className="edit-cell">
              <EditInput field={field} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The position ratings as a grid of inputs, in the order of the pitch; there only while a player is being edited. */
export function PositionEditGroup() {
  const session = useEditSession();
  const keys = session ? PITCH_ORDER.filter((key) => session.has(`position.${key}`)) : [];
  if (!session || keys.length === 0) {
    return null;
  }
  return (
    <section className="profile-group">
      <h3>{editText.positionRatings}</h3>
      <dl className="stats edit-grid">
        {keys.map((key) => (
          <div className="stat" key={key} title={fieldLabel(session.entity, `position.${key}`)}>
            <dt>{POSITION_LABELS[key]}</dt>
            <dd className="edit-cell">
              <EditInput field={`position.${key}`} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
