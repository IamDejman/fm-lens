// The in-game scout card: FM Lens's card for the player, member of staff or club the pointer rests on in FM, a
// player at his peak while Shift is held. A click on it opens them in FM Lens. It is its own window, which the app
// shows once the card is drawn (see scout_card.rs).

import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Ability } from "./Ability";
import { call } from "./api";
import { formatNumber } from "./format";
import {
  ATTRIBUTE_LABELS,
  clubProfileText,
  jobLabel,
  positionLabel,
  profileText,
  scoutText,
  type AttributeKey,
} from "./labels";
import { ClubLogo, NationFlag, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { ReputationMeter } from "./ProfileParts";
import { roleLabel } from "./scoutRoles";
import { Stars } from "./ScoutParts";
import { employerOf, jobOf } from "./StaffProfile";
import type { ClubDetails, PlayerDetails, ScoutReport, StaffDetails } from "./types";
import "./App.css";

type Kind = "player" | "staff" | "club";

/** What the app asks the card to show: who, and for a player whether at his peak. */
interface Shown {
  kind: Kind;
  uid: number;
  peak: boolean;
}

type Card =
  | { kind: "player"; details: PlayerDetails; report: ScoutReport }
  | { kind: "staff"; details: StaffDetails }
  | { kind: "club"; details: ClubDetails };

const text = scoutText.report;
const ROLES = 3;
const GAINS = 5;

function log(error: unknown) {
  console.error("FM Lens scout card:", error);
}

function load(kind: Kind, uid: number): Promise<Card> {
  switch (kind) {
    case "player":
      return Promise.all([
        call<PlayerDetails>("player_details", { uid }),
        call<ScoutReport>("player_scout", { uid }),
      ]).then(([details, report]) => ({ kind, details, report }));
    case "staff":
      return call<StaffDetails>("staff_details", { uid }).then((details) => ({ kind, details }));
    case "club":
      return call<ClubDetails>("club_details", { uid }).then((details) => ({ kind, details }));
  }
}

export function ScoutCard() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const box = useRef<HTMLElement>(null);
  const kind = shown?.kind ?? null;
  const uid = shown?.uid ?? null;
  const peak = shown?.peak ?? false;

  // What to show: each change as the app sends it, and what it shows now, which the window may have opened after.
  useEffect(() => {
    let live = true;
    const stop = listen<Shown | null>("scout-card", (event) => setShown(event.payload));
    stop
      .then(() => call<Shown | null>("scout_card_shown"))
      .then((now) => live && setShown(now))
      .catch(log);
    return () => {
      live = false;
      stop.then((unlisten) => unlisten()).catch(log);
    };
  }, []);

  // A theme or zoom changed in Settings: the card takes it.
  useEffect(() => {
    const reload = (event: StorageEvent) => {
      if (event.key === "fm-lens.appearance" || event.key === "fm-lens.zoom") {
        window.location.reload();
      }
    };
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, []);

  useEffect(() => {
    if (kind === null || uid === null) {
      return;
    }
    let live = true;
    load(kind, uid)
      .then((loaded) => live && setCard(loaded))
      .catch(log);
    return () => {
      live = false;
    };
  }, [kind, uid]);

  const ready = card !== null && card.kind === kind && card.details.uid === uid ? card : null;

  // Drawn, and each time its size changes after (a font, a flag that fails): the app sizes the window to it and shows it.
  // Measured now too, as a hidden window may not be drawn, and then its size is never seen to change.
  useLayoutEffect(() => {
    const element = box.current;
    if (ready === null || element === null) {
      return;
    }
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      call("scout_card_ready", { kind: ready.kind, uid: ready.details.uid, peak, width, height }).catch(log);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready, peak]);

  if (ready === null) {
    return null;
  }
  const open = () => call("scout_card_open", { kind: ready.kind, uid: ready.details.uid, name: ready.details.name }).catch(log);
  return (
    <article ref={box} className="scout-card">
      {ready.kind === "player" ? (
        <PlayerCard details={ready.details} report={ready.report} peak={peak} onOpen={open} />
      ) : ready.kind === "staff" ? (
        <StaffCard details={ready.details} onOpen={open} />
      ) : (
        <ClubCard details={ready.details} onOpen={open} />
      )}
    </article>
  );
}

/** The top of a card: a picture, the name (the button that opens them), a line of facts and numbers on the right. */
function Head({
  picture,
  name,
  facts,
  numbers,
  onOpen,
}: {
  picture: ReactNode;
  name: string;
  facts: ReactNode[];
  numbers: ReactNode;
  onOpen: () => void;
}) {
  const shown = facts.filter((fact) => fact !== null && fact !== undefined && fact !== false && fact !== "");
  return (
    <header className="scout-card-head">
      {picture}
      <div className="scout-card-who">
        <h1>
          <button type="button" onClick={onOpen}>
            {name}
          </button>
        </h1>
        {shown.length > 0 && (
          <p>
            {shown.map((fact, at) => (
              // The facts are in a fixed order, and only ever dropped, so their place names them.
              <span key={at}>
                {at > 0 && " · "}
                {fact}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="scout-card-abilities">{numbers}</div>
    </header>
  );
}

function Abilities({ current, potential }: { current: number; potential: number }) {
  return (
    <>
      <abbr title={profileText.currentAbility}>{profileText.currentAbilityShort}</abbr>
      <Ability value={current} />
      <abbr title={profileText.potentialAbility}>{profileText.potentialAbilityShort}</abbr>
      <Ability value={potential} />
    </>
  );
}

function nation(name: string | null, uid: number | null): ReactNode {
  return (
    name && (
      <WithPicture inline picture={<NationFlag uid={uid} />}>
        {name}
      </WithPicture>
    )
  );
}

function Part({ children }: { children: ReactNode }) {
  return <span className="scout-card-part">{children}</span>;
}

function PlayerCard({
  details,
  report,
  peak,
  onOpen,
}: {
  details: PlayerDetails;
  report: ScoutReport;
  peak: boolean;
  onOpen: () => void;
}) {
  const roles = [...report.roles].sort((a, b) => (peak ? b.peak - a.peak : b.today - a.today)).slice(0, ROLES);
  return (
    <>
      <Head
        picture={<PersonFace uid={details.uid} name={details.name} size={PICTURE_SIZE.columnFace} />}
        name={details.name}
        onOpen={onOpen}
        facts={[
          details.club === null ? (
            profileText.freeAgent
          ) : (
            <WithPicture
              inline
              picture={<ClubLogo uid={details.clubUid} name={details.club} size={PICTURE_SIZE.textLogo} />}
            >
              {details.club}
            </WithPicture>
          ),
          nation(details.nation, details.nationUid),
          details.age !== null && <Part>{profileText.age(details.age)}</Part>,
          details.positions.length > 0 && <Part>{positionLabel(details.positions[0])}</Part>,
        ]}
        numbers={<Abilities current={details.currentAbility} potential={details.potentialAbility} />}
      />

      <section>
        <h2>{peak ? text.peak : text.today}</h2>
        <dl>
          {roles.map((rating) => (
            <div key={rating.role}>
              <dt>{roleLabel(rating.role)}</dt>
              <dd>{peak ? rating.peak : rating.today}</dd>
            </div>
          ))}
        </dl>
      </section>

      {peak ? (
        <PeakGains details={details} peak={report.peak} />
      ) : (
        report.development && (
          <section>
            <dl>
              <div>
                <dt>{text.chance}</dt>
                <dd>{`${formatNumber(report.development.probability)}%`}</dd>
              </div>
              <div>
                <dt>{text.progress}</dt>
                <dd>
                  <Stars halfStars={report.development.halfStars} />
                </dd>
              </div>
            </dl>
          </section>
        )
      )}
    </>
  );
}

function StaffCard({ details, onOpen }: { details: StaffDetails; onOpen: () => void }) {
  const employer = employerOf(details);
  const job = jobOf(details);
  return (
    <Head
      picture={<PersonFace uid={details.uid} name={details.name} size={PICTURE_SIZE.columnFace} />}
      name={details.name}
      onOpen={onOpen}
      facts={[
        job !== null && jobLabel(job),
        details.club !== null ? (
          <WithPicture
            inline
            picture={<ClubLogo uid={details.clubUid} name={details.club} size={PICTURE_SIZE.textLogo} />}
          >
            {details.club}
          </WithPicture>
        ) : (
          employer
        ),
        nation(details.nation, details.nationUid),
        details.age !== null && <Part>{profileText.age(details.age)}</Part>,
      ]}
      numbers={<Abilities current={details.currentAbility} potential={details.potentialAbility} />}
    />
  );
}

function ClubCard({ details, onOpen }: { details: ClubDetails; onOpen: () => void }) {
  return (
    <Head
      picture={<ClubLogo uid={details.uid} name={details.name} size={PICTURE_SIZE.columnFace} />}
      name={details.name}
      onOpen={onOpen}
      facts={[
        nation(details.nation, details.nationUid),
        details.founded !== null && <Part>{clubProfileText.founded(details.founded)}</Part>,
        details.stadium?.name,
      ]}
      numbers={
        <>
          <abbr title={clubProfileText.reputationTitle}>{clubProfileText.reputationShort}</abbr>
          <ReputationMeter value={details.reputation} />
        </>
      }
    />
  );
}

/** The attributes that grow most by his peak: now and then. */
function PeakGains({ details, peak }: { details: PlayerDetails; peak: Record<string, number> }) {
  const gains = Object.entries(peak)
    .flatMap(([key, then]) => {
      const now = details.attributes[key]?.value;
      return key in ATTRIBUTE_LABELS && now !== undefined && then > now ? [{ key, now, then }] : [];
    })
    .sort((a, b) => b.then - b.now - (a.then - a.now) || b.then - a.then)
    .slice(0, GAINS);
  if (gains.length === 0) {
    return null;
  }
  return (
    <section>
      <h2>{text.attributes}</h2>
      <dl>
        {gains.map(({ key, now, then }) => (
          <div key={key}>
            <dt>{ATTRIBUTE_LABELS[key as AttributeKey]}</dt>
            <dd>{`${now} → ${then}`}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
