import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { call } from "./api";
import { Ability } from "./Ability";
import { formatDate, formatPounds } from "./format";
import {
  ATTRIBUTE_LABELS,
  PERSONALITY_LABELS,
  profileText,
  type AttributeKey,
  type PersonalityKey,
} from "./labels";
import { PositionPitch } from "./PositionPitch";
import type { Attribute, Contract, FmDate, PlayerDetails, PlayerSummary } from "./types";

// Attributes in the order FM lists them.
const TECHNICAL: AttributeKey[] = [
  "corners", "crossing", "dribbling", "finishing", "first_touch", "free_kicks", "heading",
  "long_shots", "long_throws", "marking", "passing", "penalty_taking", "tackling", "technique",
];
const MENTAL: AttributeKey[] = [
  "aggression", "anticipation", "bravery", "composure", "concentration", "decisions", "determination",
  "flair", "leadership", "off_the_ball", "positioning", "teamwork", "vision", "work_rate",
];
const PHYSICAL: AttributeKey[] = [
  "acceleration", "agility", "balance", "jumping_reach", "natural_fitness", "pace", "stamina", "strength",
];
const GOALKEEPING: AttributeKey[] = [
  "aerial_reach", "command_of_area", "communication", "eccentricity", "first_touch", "handling", "kicking",
  "one_on_ones", "passing", "punching", "reflexes", "rushing_out", "throwing",
];
const HIDDEN: AttributeKey[] = ["consistency", "dirtiness", "important_matches", "injury_proneness", "versatility"];
const FEET: AttributeKey[] = ["left_foot", "right_foot"];
const PERSONALITY: PersonalityKey[] = [
  "adaptability", "ambition", "loyalty", "pressure", "professionalism", "sportsmanship", "temperament", "controversy",
];

/** A player counts as a goalkeeper from this rating at gk; the panel then shows Goalkeeping instead of Technical. */
const GOALKEEPER_RATING = 15;
/** Reputation is stored on a 0–10000 scale. */
const REPUTATION_MAX = 10000;

type Loaded = { details: PlayerDetails; error?: undefined } | { details?: undefined; error: string };

interface PlayerProfileProps {
  /** The row that was picked; its fields fill the header while the full profile loads. */
  player: PlayerSummary;
  /** Changes when the game data is read again, so the profile is too. */
  version: number;
  onClose: () => void;
}

/** The profile of one player. Mount it with `key={uid}` so a new player starts at the top. */
export function PlayerProfile({ player, version, onClose }: PlayerProfileProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const details = await call<PlayerDetails>("player_details", { uid: player.uid });
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
  }, [player.uid, version]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const details = loaded?.details;
  const info: PlayerSummary = details ?? player;
  const vitals = [
    info.dateOfBirth && `${profileText.born} ${formatDate(info.dateOfBirth)}`,
    details && details.heightCm > 0 && profileText.height(details.heightCm),
    `${profileText.uid} ${info.uid}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="profile" role="dialog" aria-label={info.name} aria-busy={!loaded}>
      <header className="profile-head">
        <div className="profile-id">
          <h2>{info.name}</h2>
          {info.fullName && info.fullName !== info.name && <p className="profile-fullname">{info.fullName}</p>}
          <p className="profile-meta">
            {info.club ?? <span className="muted">{profileText.freeAgent}</span>}
            {info.nation && ` · ${info.nation}`}
          </p>
          <p className="profile-vitals">{vitals}</p>
        </div>
        <div className="profile-side">
          <button className="icon-button" onClick={onClose} aria-label={profileText.close} title={profileText.close}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
          <div className="profile-abilities">
            <abbr title={profileText.currentAbility}>{profileText.currentAbilityShort}</abbr>
            <Ability value={info.currentAbility} />
            <abbr title={profileText.potentialAbility}>{profileText.potentialAbilityShort}</abbr>
            <Ability value={info.potentialAbility} />
          </div>
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
        {details && <ProfileBody details={details} />}
      </div>
    </section>
  );
}

function ProfileBody({ details }: { details: PlayerDetails }) {
  const goalkeeper = (details.positions.gk ?? 0) >= GOALKEEPER_RATING;
  return (
    <>
      <div className="profile-columns">
        {goalkeeper ? (
          <RatingGroup title={profileText.goalkeeping} rows={attributeRows(details, GOALKEEPING)} />
        ) : (
          <RatingGroup title={profileText.technical} rows={attributeRows(details, TECHNICAL)} />
        )}
        <RatingGroup title={profileText.mental} rows={attributeRows(details, MENTAL)} />
        <RatingGroup title={profileText.physical} rows={attributeRows(details, PHYSICAL)} />
      </div>

      <div className="profile-columns">
        <div className="profile-stack">
          <RatingGroup title={profileText.hidden} rows={attributeRows(details, HIDDEN)} />
          <RatingGroup title={profileText.feet} rows={attributeRows(details, FEET)} />
        </div>
        <RatingGroup title={profileText.personality} rows={personalityRows(details)} />
        <section className="profile-group">
          <h3>{profileText.positions}</h3>
          <PositionPitch ratings={details.positions} />
        </section>
      </div>

      {details.contract && <ContractGroup contract={details.contract} />}
      <CareerGroup details={details} />
    </>
  );
}

interface RatingRow {
  key: string;
  label: string;
  value: number | undefined;
  /** Hover text, e.g. the value as stored. */
  title?: string;
  /** A low value is the good one, so the colours run the other way. */
  lowerIsBetter?: boolean;
}

const LOWER_IS_BETTER = new Set<string>(["injury_proneness", "dirtiness", "controversy"]);

function attributeRows(details: PlayerDetails, keys: AttributeKey[]): RatingRow[] {
  return keys.map((key) => {
    const attribute: Attribute | undefined = details.attributes[key];
    const lowerIsBetter = LOWER_IS_BETTER.has(key);
    const notes = [attribute && profileText.raw(attribute.raw), lowerIsBetter && profileText.lowerIsBetter];
    return {
      key,
      label: ATTRIBUTE_LABELS[key],
      value: attribute?.value,
      title: notes.filter(Boolean).join(" · ") || undefined,
      lowerIsBetter,
    };
  });
}

function personalityRows(details: PlayerDetails): RatingRow[] {
  return PERSONALITY.map((key) => {
    const lowerIsBetter = LOWER_IS_BETTER.has(key);
    return {
      key,
      label: PERSONALITY_LABELS[key],
      value: details.personality[key],
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

function RatingGroup({ title, rows }: { title: string; rows: RatingRow[] }) {
  return (
    <section className="profile-group">
      <h3>{title}</h3>
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
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ContractGroup({ contract }: { contract: Contract }) {
  const date = (value: FmDate | null) => formatDate(value) || profileText.none;
  return (
    <section className="profile-group">
      <h3>{profileText.contract}</h3>
      <div className="profile-split">
        <div>
          <dl className="stats">
            <Fact label={profileText.wage}>{formatPounds(contract.wage)}</Fact>
          </dl>
          <p className="note">{profileText.wageNote}</p>
          <dl className="stats">
            <Fact label={profileText.squadStatus}>{profileText.squadStatusName(contract.squadStatus)}</Fact>
            <Fact label={profileText.squadNumber}>{contract.squadNumber ?? profileText.none}</Fact>
          </dl>
        </div>
        <dl className="stats">
          <Fact label={profileText.signed}>{date(contract.signed)}</Fact>
          <Fact label={profileText.expires}>{date(contract.expires)}</Fact>
          <Fact label={profileText.joined}>{date(contract.joined)}</Fact>
        </dl>
      </div>
      {(contract.transferListed || contract.loanListed) && (
        <div className="tags">
          {contract.transferListed && <span className="tag listed">{profileText.transferListed}</span>}
          {contract.loanListed && <span className="tag listed">{profileText.loanListed}</span>}
        </div>
      )}
    </section>
  );
}

function CareerGroup({ details }: { details: PlayerDetails }) {
  const { international, reputation, askingPrice } = details;
  return (
    <section className="profile-group">
      <h3>{profileText.career}</h3>
      <div className="profile-split">
        <dl className="stats">
          <Fact label={profileText.internationalCaps}>{international.caps}</Fact>
          <Fact label={profileText.internationalGoals}>{international.goals}</Fact>
          <Fact label={profileText.u21Caps}>{international.u21Caps}</Fact>
          <Fact label={profileText.u21Goals}>{international.u21Goals}</Fact>
          <Fact label={profileText.askingPrice}>
            {askingPrice === null ? profileText.notSet : formatPounds(askingPrice)}
          </Fact>
        </dl>
        <div>
          <h4>{profileText.reputation}</h4>
          <dl className="stats">
            <ReputationBar label={profileText.reputationHome} value={reputation.home} />
            <ReputationBar label={profileText.reputationCurrent} value={reputation.current} />
            <ReputationBar label={profileText.reputationWorld} value={reputation.world} />
          </dl>
        </div>
      </div>
    </section>
  );
}

function ReputationBar({ label, value }: { label: string; value: number }) {
  const style = { "--fill": `${Math.min(100, (value / REPUTATION_MAX) * 100)}%` } as CSSProperties;
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
