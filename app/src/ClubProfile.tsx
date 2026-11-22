import { useContext, useEffect, useId, useState } from "react";
import { EditableValue } from "./EditControls";
import {
  freezeMoney,
  frozenClubs,
  protectedClubs,
  protectSquad,
  renameStadium,
  setKitColour,
  watchMassFreeze,
} from "./editing";
import { converts, inCurrency } from "./currency";
import { describeError, formatMoney, formatNumber } from "./format";
import {
  CLUB_FACILITY_LABELS,
  clubProfileText,
  profileText,
  SUPPORTER_MIX_LABELS,
  SUPPORTER_TRAIT_LABELS,
  type SupporterMixKey,
} from "./labels";
import { ClubLogo, Picture, PICTURE_SIZE } from "./Picture";
import { clubKits, type KitKind } from "./pictures";
import {
  Fact,
  ProfileFrame,
  ProfileTabs,
  RatingGroup,
  RatingList,
  ReputationMeter,
  useProfileDetails,
  type PanelIds,
  type RatingRow,
} from "./ProfileParts";
import { ClubStaffTab } from "./ClubStaffTab";
import { ClubTiesGroups } from "./RelationGroups";
import { RenameButton } from "./RenameClub";
import { SquadTab } from "./SquadTab";
import type { ClubDetails, ClubSummary, Finances, Income, KitPart, Stadium } from "./types";
import { EditorContext, useProfileEditing } from "./useProfileEditing";

const text = clubProfileText;

/** The tabs of the profile: what the club has, its squad and its staff. */
export type ClubTab = "overview" | "squad" | "staff";

const TABS: readonly ClubTab[] = ["overview", "squad", "staff"];

/** Why a tab cannot be opened while the club is edited: its values are on the Overview. */
const LOCKED: Record<Exclude<ClubTab, "overview">, string> = { squad: text.squadLocked, staff: text.staffLocked };

/** The tab saved before the language was switched; the overview when there is none. */
export const readTab = (value: unknown): ClubTab => TABS.find((tab) => tab === value) ?? "overview";

interface ClubProfileProps {
  /** The row that was picked; its fields fill the header while the full profile loads. */
  club: ClubSummary;
  /** Changes when the game data is read again, so the profile is too. */
  version: number;
  /** The open tab. The list keeps it, so that the next club picked opens on it too. */
  tab: ClubTab;
  onTab: (tab: ClubTab) => void;
  onClose: () => void;
}

/** The profile of one club. Mount it with `key={uid}` so a new club starts at the top. */
export function ClubProfile({ club, version, tab, onTab, onClose }: ClubProfileProps) {
  const loaded = useProfileDetails<ClubDetails>("club_details", club.uid, version);
  const editing = useProfileEditing("club", club.uid);
  const { gameActions } = useContext(EditorContext);
  const base = useId();
  const details = loaded?.details;
  const info: ClubSummary = details ?? club;
  const vitals = [info.founded !== null && text.founded(info.founded), `${profileText.uid} ${info.uid}`];

  // The club is edited on the Overview, which has its inputs: editing starts there, and the Squad and Staff tabs are not
  // offered until it is done.
  const locked = editing.stage !== "view";
  useEffect(() => {
    if (locked) {
      onTab("overview");
    }
  }, [locked, onTab]);
  const shown = locked ? "overview" : tab;
  const panel: PanelIds = { id: `${base}-panel`, labelledBy: `${base}-${shown}` };

  return (
    <ProfileFrame
      picture={<ClubLogo uid={info.uid} name={info.name} size={PICTURE_SIZE.clubLogo} />}
      name={info.name}
      fullName={info.shortName}
      badge={info.women ? <span className="tag women">{text.womensClub}</span> : undefined}
      vitals={vitals}
      side={
        // Laid out like the abilities of a person: a label and a bar with the number on it. While the club is
        // edited the number is an input, where it is shown.
        <div className="profile-abilities">
          <abbr title={text.reputationTitle}>{text.reputationShort}</abbr>
          <EditableValue field="reputation">
            <ReputationMeter value={info.reputation} />
          </EditableValue>
        </div>
      }
      tabs={
        details && (
          <ProfileTabs
            tabs={TABS}
            tab={shown}
            base={base}
            label={text.tabsLabel}
            names={text.tabs}
            // The Squad and Staff tabs are out of reach while the club is edited.
            locked={(id) => (locked && id !== "overview" ? LOCKED[id] : undefined)}
            onSelect={onTab}
          />
        )
      }
      wide={details !== undefined && shown === "squad"}
      loaded={loaded}
      onClose={onClose}
      editing={editing}
      actions={
        // Only while the profile is read, not edited, and where clubs are renamed on this version.
        editing.editable &&
        editing.stage === "view" &&
        gameActions.renameClub &&
        details && <RenameButton club={{ uid: info.uid, name: info.name, shortName: info.shortName }} />
      }
    >
      {details &&
        (shown === "squad" ? (
          <SquadTab clubUid={club.uid} version={version} panel={panel} />
        ) : shown === "staff" ? (
          <ClubStaffTab clubUid={club.uid} clubName={info.name} version={version} panel={panel} />
        ) : (
          <ClubBody details={details} panel={panel} />
        ))}
    </ProfileFrame>
  );
}

/** Two columns: what the club has on the left, the people around it on the right. */
function ClubBody({ details, panel }: { details: ClubDetails; panel: PanelIds }) {
  return (
    <div className="profile-split" role="tabpanel" id={panel.id} aria-labelledby={panel.labelledBy}>
      <div className="profile-stack">
        <Facilities facilities={details.facilities} />
        <FinancesGroup club={details.uid} finances={details.finances} />
        <IncomeGroup title={text.incomeThisSeason} income={details.income} season="thisSeason" />
        <IncomeGroup title={text.incomeLastSeason} income={details.income} season="lastSeason" />
        <StadiumGroup club={details.uid} stadium={details.stadium} />
      </div>
      <div className="profile-stack">
        <Supporters traits={details.supporterTraits} mix={details.supporterMix} />
        <ClubInfo details={details} />
        <ClubTiesGroups club={details} rivals={details.rivals} links={details.links} />
        <Kits club={details.uid} colours={details.kits} />
      </div>
    </div>
  );
}

const KIT_KINDS: KitKind[] = ["home", "away", "third"];

/**
 * The club's kits: their pictures, from the user's kit packs or else the game, and the colours the game keeps for
 * each part; nothing when it has neither.
 */
function Kits({ club, colours }: { club: number; colours: KitPart[] }) {
  const [kits, setKits] = useState<KitKind[]>([]);
  useEffect(() => {
    let cancelled = false;
    clubKits(club)
      .then((found) => !cancelled && setKits(found))
      .catch(() => !cancelled && setKits([]));
    return () => {
      cancelled = true;
    };
  }, [club]);
  const { editable, onEdited } = useContext(EditorContext);
  const [error, setError] = useState<string | null>(null);
  const kinds = KIT_KINDS.filter((kind) => kits.includes(kind) || colours.some((part) => part.kit === kind));
  const swatch = (part: KitPart, trim: boolean) => {
    const colour = trim ? part.trim : part.main;
    if (!editable) {
      return <span style={{ background: colour }} />;
    }
    const save = (chosen: string) => {
      if (chosen.toLowerCase() === colour.toLowerCase()) {
        return;
      }
      setError(null);
      setKitColour(club, part.kit, part.part, trim, chosen)
        .then(onEdited)
        .catch((e: unknown) => setError(describeError(e)));
    };
    return (
      <input
        key={colour}
        type="color"
        defaultValue={colour}
        aria-label={`${text.kitNames[part.kit]} · ${text.kitParts[part.part]}`}
        onBlur={(event) => save(event.currentTarget.value)}
      />
    );
  };
  if (kinds.length === 0) {
    return null;
  }
  return (
    <section className="profile-group">
      <h3>{text.kits}</h3>
      <ul className="club-kits">
        {kinds.map((kind) => (
          <li key={kind}>
            {kits.includes(kind) && (
              <Picture kind={`kit-${kind}`} id={club} size={PICTURE_SIZE.kit} label={text.kitNames[kind]} />
            )}
            <span>{text.kitNames[kind]}</span>
            <span className="kit-colours">
              {colours
                .filter((part) => part.kit === kind)
                .map((part) => (
                  <span
                    key={part.part}
                    className="kit-part"
                    role={editable ? undefined : "img"}
                    aria-label={editable ? undefined : `${text.kitParts[part.part]}: ${part.main}, ${part.trim}`}
                    title={text.kitParts[part.part]}
                  >
                    {swatch(part, false)}
                    {swatch(part, true)}
                  </span>
                ))}
            </span>
          </li>
        ))}
      </ul>
      {error !== null && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** The keys of `labels` that `values` has, in the order of `labels`. */
function knownKeys<K extends string>(labels: Record<K, string>, values: Record<string, number>): K[] {
  return (Object.keys(labels) as K[]).filter((key) => values[key] !== undefined);
}

/**
 * Rating rows for the keys of `labels` that `values` has; a rating the game does not give is left out. The rows of
 * values the editor can change have `fieldGroup` (e.g. "facilities"): their field is `fieldGroup.key`.
 */
function ratingRows(
  labels: Record<string, string>,
  values: Record<string, number>,
  fieldGroup?: string,
): RatingRow[] {
  return knownKeys(labels, values).map((key) => ({
    key,
    field: fieldGroup === undefined ? undefined : `${fieldGroup}.${key}`,
    label: labels[key],
    value: values[key],
  }));
}

/** The club's facilities as ratings; inputs while the club is edited. */
function Facilities({ facilities }: { facilities: Record<string, number> }) {
  const rows = ratingRows(CLUB_FACILITY_LABELS, facilities, "facilities");
  return rows.length > 0 ? <RatingGroup title={text.facilities} rows={rows} hint /> : null;
}

function Supporters({ traits, mix }: { traits: Record<string, number>; mix: Record<string, number> }) {
  const traitRows = ratingRows(SUPPORTER_TRAIT_LABELS, traits);
  const segments = mixSegments(mix);
  if (traitRows.length === 0 && segments.length === 0) {
    return null;
  }
  return (
    <section className="profile-group">
      <h3>{text.supporters}</h3>
      {traitRows.length > 0 && <RatingList rows={traitRows} />}
      {segments.length > 0 && <SupporterMix segments={segments} />}
    </section>
  );
}

interface MixSegment {
  key: SupporterMixKey;
  label: string;
  /** Percent of the supporters. */
  value: number;
}

/** The kinds of supporters the game gives, in the order of the bar; nothing when it gives none. */
function mixSegments(mix: Record<string, number>): MixSegment[] {
  const segments = knownKeys(SUPPORTER_MIX_LABELS, mix).map((key) => ({
    key,
    label: SUPPORTER_MIX_LABELS[key],
    value: mix[key],
  }));
  // A mix of zeroes tells no more than none at all.
  return segments.some((segment) => segment.value > 0) ? segments : [];
}

/**
 * The supporter mix as one stacked bar, split by percent, with a legend that has every share as
 * text. Each kind keeps its colour (see `.mix-*` in App.css), whatever the others are.
 */
function SupporterMix({ segments }: { segments: MixSegment[] }) {
  return (
    <div className="mix">
      <h4>{text.supporterMix}</h4>
      {/* The legend has every share as text, so the bar is only for the eye. */}
      <div className="mix-bar" aria-hidden="true">
        {segments
          .filter((segment) => segment.value > 0)
          .map(({ key, label, value }) => (
            <span
              key={key}
              className={`mix-${key}`}
              style={{ flexGrow: value }}
              title={text.mixTooltip(label, text.percent(value))}
            />
          ))}
      </div>
      <ul className="legend mix-legend">
        {segments.map(({ key, label, value }) => (
          <li key={key} className={`mix-${key}`}>
            <span className="swatch" />
            {label}
            <span className="range">{text.percent(value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the club earned in a season, by source; nothing when it earned nothing or this build does not read it. */
function IncomeGroup({ title, income, season }: { title: string; income: Income[]; season: "thisSeason" | "lastSeason" }) {
  const sources: Record<string, string> = text.incomeSources;
  const rows = income.filter((row) => row[season] !== 0 && sources[row.source]);
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="profile-group">
      <h3>{title}</h3>
      <dl className="stats" title={converts ? profileText.converted : undefined}>
        {rows.map((row) => (
          <Fact key={row.source} label={sources[row.source]}>
            <span className={row[season] < 0 ? "negative" : undefined}>{formatMoney(row[season])}</span>
          </Fact>
        ))}
      </dl>
    </section>
  );
}

/**
 * The club's money; the four amounts the editor can change are inputs while the club is edited, and the money can be
 * frozen.
 */
function FinancesGroup({ club, finances }: { club: number; finances: Finances | null }) {
  return (
    <section className="profile-group">
      <h3>{text.finances}</h3>
      {finances ? (
        <>
          <dl className="stats" title={converts ? profileText.converted : undefined}>
            <Fact label={text.balance}>
              <EditableValue field="finance.balance">
                <span className={finances.balance < 0 ? "negative" : undefined}>{formatMoney(finances.balance)}</span>
              </EditableValue>
            </Fact>
            <Fact label={text.transferBudget}>
              <EditableValue field="finance.transfer_budget">
                {/* FM stores -1 when the board has not set a transfer budget; below that the club has overspent. */}
                {finances.transferBudget === -1 ? (
                  profileText.notSet
                ) : (
                  <span className={finances.transferBudget < 0 ? "negative" : undefined}>
                    {formatMoney(finances.transferBudget)}
                  </span>
                )}
              </EditableValue>
            </Fact>
            <Fact label={text.wageBudget}>
              {formatMoney(finances.wageBudget)}
              <PerWeek />
            </Fact>
            <Fact label={text.totalWageBudget}>
              <EditableValue field="finance.total_wage_budget">{formatMoney(finances.totalWageBudget)}</EditableValue>
              <PerWeek />
            </Fact>
            <Fact label={text.ticketPrice}>
              <EditableValue field="finance.ticket_price">{formatTicketPrice(finances.ticketPrice)}</EditableValue>
            </Fact>
          </dl>
          <Hold club={club} read={frozenClubs} set={freezeMoney} label={text.freeze} note={text.freezeNote} />
          <Hold club={club} read={protectedClubs} set={protectSquad} label={text.protect} note={text.protectNote} />
        </>
      ) : (
        <p className="note">{text.noFinances}</p>
      )}
    </section>
  );
}

/**
 * The stadium the senior team plays at: its name, and its capacities, inputs while the club is edited; and its owner
 * where that is another club.
 */
function StadiumGroup({ club, stadium }: { club: number; stadium: Stadium | null }) {
  const { editable, onEdited, gameActions } = useContext(EditorContext);
  const [error, setError] = useState<string | null>(null);
  const change = (done: Promise<unknown>) => {
    setError(null);
    done.then(onEdited).catch((e: unknown) => setError(describeError(e)));
  };
  const renames = editable && gameActions.renameClub && stadium?.name;
  return (
    <section className="profile-group">
      <h3>{stadium?.name ? `${text.stadium} · ${stadium.name}` : text.stadium}</h3>
      {stadium ? (
        <dl className="stats">
          {renames && (
            <Fact label={text.stadiumName}>
              <input
                key={stadium.name}
                type="text"
                className="stadium-name"
                defaultValue={stadium.name ?? ""}
                maxLength={50}
                aria-label={text.stadiumName}
                onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                onBlur={(event) => {
                  const name = event.currentTarget.value.trim();
                  if (name !== "" && name !== stadium.name) {
                    change(renameStadium(club, name));
                  }
                }}
              />
            </Fact>
          )}
          <Fact label={text.capacity}>
            <EditableValue field="stadium.capacity">{formatNumber(stadium.capacity)}</EditableValue>
          </Fact>
          <Fact label={text.seating}>
            <EditableValue field="stadium.seating">{formatNumber(stadium.seating)}</EditableValue>
          </Fact>
          <Fact label={text.used} title={text.usedTitle}>
            <EditableValue field="stadium.used">{stadium.used === 0 ? text.usedAll : formatNumber(stadium.used)}</EditableValue>
          </Fact>
          <Fact label={text.expansion}>
            <EditableValue field="stadium.expansion">{formatNumber(stadium.expansion)}</EditableValue>
          </Fact>
          {stadium.owner && stadium.owner.uid !== club && <Fact label={text.owner}>{stadium.owner.name}</Fact>}
        </dl>
      ) : (
        <p className="note">{text.noStadium}</p>
      )}
      {error !== null && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * A switch the app holds for the club while it is open and connected: its money frozen, or its players protected.
 * `read` gives the clubs it is on for and `set` turns it on or off. Offered while the game can be written to; once
 * on, a note says what it does.
 */
function Hold({
  club,
  read: held,
  set,
  label,
  note,
}: {
  club: number;
  read: () => Promise<number[]>;
  set: (club: number, on: boolean) => Promise<number[]>;
  label: string;
  note: string;
}) {
  const { editable } = useContext(EditorContext);
  // Whether it is on for the club; null until the app has said.
  const [frozen, setFrozen] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const read = () =>
      held()
        .then((clubs) => alive && setFrozen(clubs.includes(club)))
        .catch(() => alive && setFrozen(false));
    void read();
    const stop = watchMassFreeze(() => void read());
    return () => {
      alive = false;
      stop();
    };
  }, [club, held]);

  if (!editable || frozen === null) {
    return null;
  }
  const toggle = async (on: boolean) => {
    setError(null);
    try {
      setFrozen((await set(club, on)).includes(club));
    } catch (e) {
      setError(describeError(e));
    }
  };
  return (
    <>
      <label className="freeze-toggle" title={note}>
        <input type="checkbox" checked={frozen} onChange={(e) => void toggle(e.currentTarget.checked)} />
        <span>{label}</span>
      </label>
      {frozen && <p className="note">{note}</p>}
      {error && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** After an amount per week: "p/w" in small print. */
function PerWeek() {
  return <span className="unit">{text.perWeek}</span>;
}

/** A ticket price: a whole amount as it is, anything else with two decimals ("£41.80"). */
function formatTicketPrice(price: number): string {
  return Number.isInteger(inCurrency(price))
    ? formatMoney(price)
    : formatMoney(price, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ClubInfo({ details }: { details: ClubDetails }) {
  const count = (value: number | null) => (value === null ? profileText.none : formatNumber(value));
  // FM's codes start at 1; one it gives no name for shows no row.
  const kind = details.ownership ? text.ownershipKinds[details.ownership - 1] : undefined;
  return (
    <section className="profile-group">
      <h3>{text.info}</h3>
      <dl className="stats">
        <Fact label={text.seasonTickets}>
          <EditableValue field="info.season_tickets">{count(details.seasonTickets)}</EditableValue>
        </Fact>
        <Fact label={text.socialMedia}>{count(details.socialMedia)}</Fact>
        {kind && (
          <Fact label={text.ownership}>
            <EditableValue field="info.ownership">{kind}</EditableValue>
          </Fact>
        )}
      </dl>
    </section>
  );
}
