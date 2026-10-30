import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Ability } from "./Ability";
import { call } from "./api";
import { formatDate, formatPounds } from "./format";
import { PERSONALITY_LABELS, profileText, type PersonalityKey } from "./labels";
import type { Attribute, FmDate, Reputation } from "./types";

// What the player, staff and club profiles have in common: the panel frame, loading, rating rows and
// the label/value blocks.

/** Reputation is stored on a 0–10000 scale. */
const REPUTATION_MAX = 10000;

export type Loaded<T> = { details: T; error?: undefined } | { details?: undefined; error: string };

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
          setLoaded({ error: String(e) });
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
  name: string;
  /** A second name under the name when it differs: a person's full name, a club's short name. */
  fullName: string | null;
  /** Sits beside the name. */
  badge?: ReactNode;
  /** The line under the names; a profile with nothing to say there leaves it out. */
  meta?: ReactNode;
  /** The small print under that, e.g. the birth date. */
  vitals: string;
  /** The abilities of a person, under the close button. */
  currentAbility?: number;
  potentialAbility?: number;
  /** Under the close button instead of the abilities, e.g. the reputation of a club. */
  side?: ReactNode;
  loaded: Loaded<unknown> | null;
  onClose: () => void;
  /** The body, once the profile has loaded. */
  children?: ReactNode;
}

/**
 * The panel beside a list: header with the abilities (or another summary, as `side`) and a close
 * button, and a scrolling body that shows the loading state or error. Mount it with `key={uid}` so
 * a new person starts at the top.
 */
export function ProfileFrame(props: ProfileFrameProps) {
  const { name, fullName, badge, meta, vitals, currentAbility, potentialAbility, side, loaded, onClose, children } =
    props;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <section className="profile" role="dialog" aria-label={name} aria-busy={!loaded}>
      <header className="profile-head">
        <div className="profile-id">
          <h2>
            {name}
            {badge}
          </h2>
          {fullName && fullName !== name && <p className="profile-fullname">{fullName}</p>}
          {meta !== undefined && <p className="profile-meta">{meta}</p>}
          <p className="profile-vitals">{vitals}</p>
        </div>
        <div className="profile-side">
          <button className="icon-button" onClick={onClose} aria-label={profileText.close} title={profileText.close}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
          {side ??
            (currentAbility !== undefined && potentialAbility !== undefined && (
              <div className="profile-abilities">
                <abbr title={profileText.currentAbility}>{profileText.currentAbilityShort}</abbr>
                <Ability value={currentAbility} />
                <abbr title={profileText.potentialAbility}>{profileText.potentialAbilityShort}</abbr>
                <Ability value={potentialAbility} />
              </div>
            ))}
        </div>
      </header>

      <div className="profile-body">
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
    </section>
  );
}

/** "Born 26 Mar 1982 (age 44)"; nothing when the birth date is unknown. */
export function bornText(person: { dateOfBirth: FmDate | null; age: number | null }): string | null {
  if (!person.dateOfBirth) {
    return null;
  }
  const age = person.age === null ? "" : ` (${profileText.age(person.age)})`;
  return `${profileText.born} ${formatDate(person.dateOfBirth)}${age}`;
}

export interface RatingRow {
  key: string;
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
      label: PERSONALITY_LABELS[key],
      value: personality[key],
      title: lowerIsBetter ? profileText.lowerIsBetter : undefined,
      lowerIsBetter,
    };
  });
}

/** FM's colour bands for a 1–20 rating: 1–5, 6–10, 11–15 and 16–20. */
function tierClass(value: number, lowerIsBetter = false): string {
  const score = lowerIsBetter ? 21 - value : value;
  return `tier-${score <= 5 ? 1 : score <= 10 ? 2 : score <= 15 ? 3 : 4}`;
}

/** The rows of a rating group: a label and the value on a chip coloured by band. */
export function RatingList({ rows }: { rows: RatingRow[] }) {
  return (
    <dl className="stats ratings">
      {rows.map((row) => (
        <div className="stat" key={row.key} title={row.title}>
          <dt>{row.label}</dt>
          <dd className={row.value === undefined ? "value" : `value ${tierClass(row.value, row.lowerIsBetter)}`}>
            {row.value ?? profileText.none}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RatingGroup({ title, rows }: { title: string; rows: RatingRow[] }) {
  return (
    <section className="profile-group">
      <h3>{title}</h3>
      <RatingList rows={rows} />
    </section>
  );
}

export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The weekly wage, with the note that the game stores it in pounds. */
export function WageFact({ wage }: { wage: number }) {
  return (
    <>
      <dl className="stats">
        <Fact label={profileText.wage}>{formatPounds(wage)}</Fact>
      </dl>
      <p className="note">{profileText.wageNote}</p>
    </>
  );
}

export function ContractDates({
  contract,
}: {
  contract: { signed: FmDate | null; expires: FmDate | null; joined: FmDate | null };
}) {
  const date = (value: FmDate | null) => formatDate(value) || profileText.none;
  return (
    <dl className="stats">
      <Fact label={profileText.signed}>{date(contract.signed)}</Fact>
      <Fact label={profileText.expires}>{date(contract.expires)}</Fact>
      <Fact label={profileText.joined}>{date(contract.joined)}</Fact>
    </dl>
  );
}

/** Home, current and world reputation as bars. */
export function ReputationBars({ reputation }: { reputation: Reputation }) {
  return (
    <dl className="stats">
      <ReputationBar label={profileText.reputationHome} value={reputation.home} />
      <ReputationBar label={profileText.reputationCurrent} value={reputation.current} />
      <ReputationBar label={profileText.reputationWorld} value={reputation.world} />
    </dl>
  );
}

function ReputationBar({ label, value }: { label: string; value: number }) {
  const style = { "--fill": reputationFill(value) } as CSSProperties;
  return (
    <div className="stat bar-stat">
      <dt>{label}</dt>
      <dd>
        <span className="bar" style={style} aria-hidden="true" />
        <span className="figure">{value.toLocaleString()}</span>
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
      {value.toLocaleString()}
    </span>
  );
}
