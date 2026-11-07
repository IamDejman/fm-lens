import {
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Ability } from "./Ability";
import { call } from "./api";
import { ActivatableValue, EditableValue, EditBar, EditButton, EditInput, SharedRangeHint } from "./EditControls";
import { converts } from "./currency";
import { describeError, formatDate, formatMoney, formatNumber } from "./format";
import { isShortcut } from "./keys";
import { PERSONALITY_LABELS, profileText, type PersonalityKey } from "./labels";
import { PanelResizer, PanelWidthButton, usePanelWidth } from "./PanelResizer";
import type { Attribute, FmDate, Reputation } from "./types";
import {
  AppliedFieldsContext,
  EditActivationContext,
  SessionContext,
  useEditableField,
  type ProfileEditing,
} from "./useProfileEditing";

// What the player, staff and club profiles have in common: the panel frame, loading, rating rows and
// the label/value blocks. The frame also holds what editing adds to a profile (see EditControls).

/** Reputation is stored on a 0–10000 scale. */
const REPUTATION_MAX = 10000;

export type Loaded<T> = { details: T; error?: undefined } | { details?: undefined; error: string };

/** What ties a tab to its panel for assistive technology: the panel's own id, and the id of the tab that names it. */
export interface PanelIds {
  id: string;
  labelledBy: string;
}

/** Loads a profile with `command`, and again when `version` changes: the game data was read again. */
export function useProfileDetails<T>(command: string, uid: number, version: number): Loaded<T> | null {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const details = await call<T>(command, { uid });
        if (!cancelled) {
          setLoaded({ details });
        }
      } catch (e) {
        if (!cancelled) {
          setLoaded({ error: describeError(e) });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [command, uid, version]);

  return loaded;
}

interface ProfileFrameProps {
  /** Left of the names: a person's face, or a club's logo. */
  picture?: ReactNode;
  name: string;
  /** A second name under the name when it differs: a person's full name, a club's short name. */
  fullName: string | null;
  /** Sits beside the name. */
  badge?: ReactNode;
  /** The line under the names; a profile with nothing to say there leaves it out. */
  meta?: ReactNode;
  /**
   * The small print under that, e.g. the birth date: its parts, set apart by dots, each kept on one line. A part may
   * hold an input, which takes the place of its value while the profile is edited.
   */
  vitals: ReadonlyArray<ReactNode>;
  /** A row across the header under the names and ratings: a player's status, such as an injury, each a button to the
   * tab that has it. */
  status?: ReactNode;
  /** The abilities of a person, under the close button; inputs where they are while the person is edited. */
  currentAbility?: number;
  potentialAbility?: number;
  /** Under the close button instead of the abilities, e.g. the reputation of a club. */
  side?: ReactNode;
  /** Buttons before Edit in the header: a player's Compare button. */
  headActions?: ReactNode;
  /** Buttons in a row under the header, which is there only while it holds one: a player's Transfer and Release. */
  actions?: ReactNode;
  /** Between the header and the body, so that it stays in view while the body scrolls: the tabs of a club. */
  tabs?: ReactNode;
  /** For a body that holds a table, such as a club's squad: the panel takes more of the window than a profile does. */
  wide?: boolean;
  loaded: Loaded<unknown> | null;
  onClose: () => void;
  /**
   * The editing of a profile, from `useProfileEditing`: it adds the Edit button, the footer and the inputs (of the
   * body, and of the header too: see `side`), and makes closing the profile ask first while changes are pending.
   */
  editing?: ProfileEditing;
  /** The body, once the profile has loaded. */
  children?: ReactNode;
}

/**
 * The panel beside a list: header with the abilities (or another summary, as `side`) and a close
 * button, and a scrolling body that shows the loading state or error. Mount it with `key={uid}` so
 * a new person starts at the top.
 */
export function ProfileFrame(props: ProfileFrameProps) {
  const { picture, name, fullName, badge, meta, vitals, status, currentAbility, potentialAbility } = props;
  const { side, headActions, actions, tabs, wide, loaded, onClose, editing, children } = props;
  const closeProfile = editing ? () => editing.guardClose(onClose) : onClose;
  const onEscape = editing ? () => editing.escape(onClose) : onClose;
  const panelWidth = usePanelWidth(wide ? "wide" : "profile");
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape" && !event.isComposing) {
        onEscape();
      } else if (isShortcut(event, "s") && editing?.stage === "edit") {
        // ⌘S applies the edits, as the Apply button does.
        event.preventDefault();
        editing.apply();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onEscape, editing]);

  // The inputs reach the whole panel, so `side` can hold one too (a club's reputation is in the header). So does the
  // activation of a value, once the profile has loaded.
  return (
    <SessionContext.Provider value={editing?.session ?? null}>
      <AppliedFieldsContext.Provider value={editing?.appliedFields ?? new Set<string>()}>
      <EditActivationContext.Provider value={loaded?.details !== undefined ? (editing?.activation ?? null) : null}>
      <section
        ref={panelWidth.panel}
        className={["profile", editing?.stage === "edit" && "editing", wide && "wide"].filter(Boolean).join(" ")}
        role="complementary"
        aria-label={name}
        aria-busy={!loaded}
        style={panelWidth.style}
      >
        <PanelResizer panelWidth={panelWidth} />
        <header className="profile-head">
          {picture}
          <div className="profile-id">
            <h2>
              {name}
              {badge}
            </h2>
            {fullName && fullName !== name && <p className="profile-fullname">{fullName}</p>}
            {meta !== undefined && <p className="profile-meta">{meta}</p>}
            <p className="profile-vitals">
              {/* The dot stays at the end of a line, with the part before it. */}
              {vitals.filter(Boolean).map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && " · "}
                  <span className="vital">{part}</span>
                </Fragment>
              ))}
            </p>
          </div>
          <div className="profile-side">
            <div className="profile-actions">
              {headActions}
              {editing && <EditButton editing={editing} ready={loaded?.details !== undefined} />}
              <PanelWidthButton panelWidth={panelWidth} />
              <button
                className="icon-button"
                onClick={closeProfile}
                aria-label={profileText.close}
                title={profileText.close}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            </div>
            {side ??
              (currentAbility !== undefined && potentialAbility !== undefined && (
                <div className="profile-abilities">
                  <abbr title={profileText.currentAbility}>{profileText.currentAbilityShort}</abbr>
                  <EditableValue field="current_ability">
                    <Ability value={currentAbility} />
                  </EditableValue>
                  <abbr title={profileText.potentialAbility}>{profileText.potentialAbilityShort}</abbr>
                  <EditableValue field="potential_ability">
                    <Ability value={potentialAbility} />
                  </EditableValue>
                </div>
              ))}
          </div>
          {status}
        </header>
        {/* What can be done to this person's career (transfer, release): a row of its own under the header. */}
        {actions && <div className="profile-toolbar">{actions}</div>}

        {tabs}

        <div className="profile-body" ref={body} data-tour="profile">
          <SectionJump body={body} />
          {!loaded && (
            <p className="profile-status" role="status">
              {profileText.loading}
            </p>
          )}
          {loaded?.error !== undefined && (
            <div className="banner" role="alert">
              {loaded.error}
            </div>
          )}
          {children}
        </div>

        {editing && <EditBar editing={editing} />}
      </section>
      </EditActivationContext.Provider>
      </AppliedFieldsContext.Provider>
    </SessionContext.Provider>
  );
}

/** The fewest sections a profile has before it gets the bar of links to them. */
const JUMP_MIN = 4;

/**
 * A bar at the top of a long profile with a link to each of its sections (the groups with a heading straight in the
 * body), and one back to the top. It stays in view while the profile scrolls. Read from the page, so a section any
 * profile adds is listed without more code.
 */
function SectionJump({ body }: { body: RefObject<HTMLDivElement | null> }) {
  const [sections, setSections] = useState<{ heading: HTMLElement; label: string }[]>([]);

  useEffect(() => {
    const element = body.current;
    if (!element) {
      return;
    }
    const read = () => {
      const found = Array.from(
        element.querySelectorAll<HTMLElement>(
          ":scope > section.profile-group > h3, :scope > section.profile-group > .group-head > h3",
        ),
      );
      setSections((old) =>
        old.length === found.length && old.every((entry, i) => entry.heading === found[i])
          ? old
          : found.map((heading) => ({ heading, label: heading.textContent ?? "" })),
      );
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true });
    return () => observer.disconnect();
  }, [body]);

  if (sections.length < JUMP_MIN) {
    return null;
  }
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const go = (target: HTMLElement | null) => {
    if (target) {
      target.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    } else {
      body.current?.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
    }
  };
  return (
    <nav className="section-jump" aria-label={profileText.sections}>
      <button type="button" onClick={() => go(null)}>
        {profileText.top}
      </button>
      {sections.map(({ heading, label }) => (
        <button key={label} type="button" onClick={() => go(heading.closest("section"))}>
          {label}
        </button>
      ))}
    </nav>
  );
}

interface ProfileTabsProps<T extends string> {
  tabs: readonly T[];
  tab: T;
  /** The start of the ids of the tabs, which the panel they open names itself by (see `PanelIds`). */
  base: string;
  label: string;
  names: Record<T, string>;
  /** Why a tab can't be opened now, as its hover text; undefined while it can. */
  locked?: (tab: T) => string | undefined;
  onSelect: (tab: T) => void;
  /** At the end of the row: a tool for the open tab. */
  end?: ReactNode;
}

/** The tabs under the header of a profile. The arrow keys move between them, as in any tab list. */
export function ProfileTabs<T extends string>({
  tabs,
  tab,
  base,
  label,
  names,
  locked,
  onSelect,
  end,
}: ProfileTabsProps<T>) {
  const buttons = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const offered = tabs.filter((id) => locked?.(id) === undefined);

  const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const at = offered.indexOf(tab);
    const target =
      event.key === "ArrowRight"
        ? offered[(at + 1) % offered.length]
        : event.key === "ArrowLeft"
          ? offered[(at - 1 + offered.length) % offered.length]
          : event.key === "Home"
            ? offered[0]
            : event.key === "End"
              ? offered[offered.length - 1]
              : undefined;
    if (target !== undefined) {
      event.preventDefault();
      onSelect(target);
      buttons.current[target]?.focus();
    }
  };

  return (
    <div className="profile-tabs">
      <div className="profile-tablist" role="tablist" aria-label={label} onKeyDown={keyDown}>
        {tabs.map((id) => {
          const lockedTitle = locked?.(id);
          return (
            <button
              key={id}
              ref={(button) => {
                buttons.current[id] = button;
              }}
              type="button"
              role="tab"
              id={`${base}-${id}`}
              className="profile-tab"
              aria-selected={id === tab}
              aria-controls={`${base}-panel`}
              // Only the tab that is open is a Tab stop; the arrow keys reach the others.
              tabIndex={id === tab ? 0 : -1}
              disabled={lockedTitle !== undefined}
              title={lockedTitle}
              onClick={() => onSelect(id)}
            >
              {names[id]}
            </button>
          );
        })}
      </div>
      {end}
    </div>
  );
}

/**
 * Whether the button that had focus has let it go: taken away, which leaves it on the page, or dimmed, which some
 * browsers leave it on though it takes no keys. The group then gives it to what took the button's place.
 */
export const focusLost = () =>
  document.activeElement === document.body || !!document.activeElement?.matches(":disabled");

/** A group's heading, with what can be done to the whole group at its right. */
export function GroupHead({
  title,
  headingRef,
  children,
}: {
  title: ReactNode;
  /** For a heading that takes focus when the button that had it is gone. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  children?: ReactNode;
}) {
  return (
    <div className="group-head">
      <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * "Born 26 Mar 1982 (age 44)", for a person whose birth date is known; the date is an input while it can be edited.
 */
export function Born({ dateOfBirth, age }: { dateOfBirth: FmDate; age: number | null }) {
  return (
    <>
      {profileText.born} <EditableValue field="date_of_birth">{formatDate(dateOfBirth)}</EditableValue>
      {age !== null && ` (${profileText.age(age)})`}
    </>
  );
}

export interface RatingRow {
  key: string;
  /** The key of the editable field behind the row, e.g. "attribute.finishing"; while editing, its value is an input. */
  field?: string;
  label: string;
  value: number | undefined;
  /** Hover text, e.g. the value as stored. */
  title?: string;
  /** A low value is the good one, so the colours run the other way. */
  lowerIsBetter?: boolean;
}

/** Ratings where a low value is the good one. */
export const LOWER_IS_BETTER = new Set<string>(["injury_proneness", "dirtiness", "controversy"]);

const PERSONALITY: PersonalityKey[] = [
  "adaptability", "ambition", "loyalty", "pressure", "professionalism", "sportsmanship", "temperament", "controversy",
];

/** An attribute as FM shows it (1–20), with the value as stored in the hover text. */
export function attributeRow(
  key: string,
  label: string,
  attribute: Attribute | undefined,
  options: { lowerIsBetter?: boolean; scale?: number } = {},
): RatingRow {
  const { lowerIsBetter = false, scale } = options;
  const notes = [attribute && profileText.raw(attribute.raw, scale), lowerIsBetter && profileText.lowerIsBetter];
  return {
    key,
    field: `attribute.${key}`,
    label,
    value: attribute?.value,
    title: notes.filter(Boolean).join(" · ") || undefined,
    lowerIsBetter,
  };
}

export function personalityRows(personality: Record<string, number>): RatingRow[] {
  return PERSONALITY.map((key) => {
    const lowerIsBetter = LOWER_IS_BETTER.has(key);
    return {
      key,
      field: `personality.${key}`,
      label: PERSONALITY_LABELS[key],
      value: personality[key],
      title: lowerIsBetter ? profileText.lowerIsBetter : undefined,
      lowerIsBetter,
    };
  });
}

/** FM's colour bands for a 1–20 rating: 1–5, 6–10, 11–15 and 16–20. */
export function tierClass(value: number, lowerIsBetter = false): string {
  const score = lowerIsBetter ? 21 - value : value;
  return `tier-${score <= 5 ? 1 : score <= 10 ? 2 : score <= 15 ? 3 : 4}`;
}

/** The rows of a rating group: a label and the value on a chip coloured by band, or an input while editing. */
export function RatingList({ rows }: { rows: RatingRow[] }) {
  return (
    <dl className="stats ratings">
      {rows.map((row) => (
        <RatingItem key={row.key} row={row} />
      ))}
    </dl>
  );
}

function RatingItem({ row }: { row: RatingRow }) {
  const editing = useEditableField(row.field);
  const applied = useContext(AppliedFieldsContext).has(row.field ?? "");
  return (
    <div className="stat" title={row.title}>
      <dt>{row.label}</dt>
      {editing && row.field ? (
        <dd className="edit-cell">
          {/* Ratings all take 1 to 20, which one hint says for the profile (see `SharedRangeHint`). */}
          <EditInput field={row.field} hint={false} />
        </dd>
      ) : (
        <dd className={`${row.value === undefined ? "value" : `value ${tierClass(row.value, row.lowerIsBetter)}`}${applied ? " edit-applied" : ""}`}>
          {row.value === undefined || !row.field ? (
            row.value ?? profileText.none
          ) : (
            <ActivatableValue field={row.field}>{row.value}</ActivatableValue>
          )}
        </dd>
      )}
    </div>
  );
}

/** A heading over ratings; `hint`: the range their inputs take is said under it, where no other hint says it. */
export function RatingGroup({ title, rows, hint = false }: { title: string; rows: RatingRow[]; hint?: boolean }) {
  const shared = hint ? rows.find((row) => row.field !== undefined)?.field : undefined;
  return (
    <section className="profile-group">
      <h3>{title}</h3>
      {shared !== undefined && <SharedRangeHint field={shared} />}
      <RatingList rows={rows} />
    </section>
  );
}

export function Fact({ label, title, children }: { label: ReactNode; title?: string; children: ReactNode }) {
  return (
    <div className="stat" title={title}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The weekly wage, an input while it can be edited; in another currency than pounds, its hover text says so. */
export function WageFact({ wage }: { wage: number }) {
  return (
    <dl className="stats">
      <Fact label={profileText.wage} title={converts ? profileText.converted : undefined}>
        <EditableValue field="contract.wage">{formatMoney(wage)}</EditableValue>
      </Fact>
    </dl>
  );
}

/** When the contract was signed, ends and began; the end is a date input while it can be edited. */
export function ContractDates({
  contract,
}: {
  contract: { signed: FmDate | null; expires: FmDate | null; joined: FmDate | null };
}) {
  const date = (value: FmDate | null) => formatDate(value) || profileText.none;
  return (
    <dl className="stats">
      <Fact label={profileText.signed}>{date(contract.signed)}</Fact>
      <Fact label={profileText.expires}>
        <EditableValue field="contract.expires">{date(contract.expires)}</EditableValue>
      </Fact>
      <Fact label={profileText.joined}>{date(contract.joined)}</Fact>
    </dl>
  );
}

/** Home, current and world reputation as bars; the figures are inputs while the person is edited. */
export function ReputationBars({ reputation }: { reputation: Reputation }) {
  return (
    <dl className="stats">
      <ReputationBar label={profileText.reputationHome} value={reputation.home} field="reputation.home" />
      <ReputationBar label={profileText.reputationCurrent} value={reputation.current} field="reputation.current" />
      <ReputationBar label={profileText.reputationWorld} value={reputation.world} field="reputation.world" />
    </dl>
  );
}

function ReputationBar({ label, value, field }: { label: string; value: number; field: string }) {
  const style = { "--fill": reputationFill(value) } as CSSProperties;
  return (
    <div className="stat bar-stat">
      <dt>{label}</dt>
      <dd>
        <span className="bar" style={style} aria-hidden="true" />
        <EditableValue field={field}>
          <span className="figure">{formatNumber(value)}</span>
        </EditableValue>
      </dd>
    </div>
  );
}

/** How much of a bar a reputation fills, as a CSS length. */
function reputationFill(value: number): string {
  return `${Math.min(100, (value * 100) / REPUTATION_MAX)}%`;
}

/**
 * One reputation as a compact bar with the number on it, in the style of the abilities; a dash
 * when the reputation is unknown. For the club list and the club header.
 */
export function ReputationMeter({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="muted">{profileText.none}</span>;
  }
  const style = { "--fill": reputationFill(value) } as CSSProperties;
  return (
    <span className="ability rep" style={style}>
      {formatNumber(value)}
    </span>
  );
}
