// The in-game scout card (Windows): FM Lens's card for the player whose card FM shows, over the game, at his peak
// while Shift is held. It is its own window, which the app shows once the card is drawn (see scout_card.rs).

import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Ability } from "./Ability";
import { call } from "./api";
import { formatNumber } from "./format";
import { ATTRIBUTE_LABELS, positionLabel, profileText, scoutText, type AttributeKey } from "./labels";
import { ClubLogo, NationFlag, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { roleLabel } from "./scoutRoles";
import { Stars } from "./ScoutParts";
import type { PlayerDetails, ScoutReport } from "./types";
import "./App.css";

/** What the app asks the card to show: the player, and whether at his peak. */
interface Shown {
  uid: number;
  peak: boolean;
}

interface Card {
  details: PlayerDetails;
  report: ScoutReport;
}

const text = scoutText.report;
const ROLES = 3;
const GAINS = 5;

function log(error: unknown) {
  console.error("FM Lens scout card:", error);
}

export function ScoutCard() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const box = useRef<HTMLElement>(null);
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
    if (uid === null) {
      return;
    }
    let live = true;
    Promise.all([call<PlayerDetails>("player_details", { uid }), call<ScoutReport>("player_scout", { uid })])
      .then(([details, report]) => live && setCard({ details, report }))
      .catch(log);
    return () => {
      live = false;
    };
  }, [uid]);

  const ready = card !== null && card.details.uid === uid ? card : null;

  // Drawn, and each time its size changes after (a font, a flag that fails): the app sizes the window to it and shows it.
  useLayoutEffect(() => {
    const element = box.current;
    if (ready === null || element === null) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      call("scout_card_ready", { uid: ready.details.uid, peak, width, height }).catch(log);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready, peak]);

  if (ready === null) {
    return null;
  }
  const { details, report } = ready;
  const roles = [...report.roles].sort((a, b) => (peak ? b.peak - a.peak : b.today - a.today)).slice(0, ROLES);
  return (
    <article ref={box} className="scout-card">
      <header className="scout-card-head">
        <PersonFace uid={details.uid} name={details.name} size={PICTURE_SIZE.columnFace} />
        <div className="scout-card-who">
          <h1>{details.name}</h1>
          <p>
            {details.club === null ? (
              profileText.freeAgent
            ) : (
              <WithPicture
                inline
                picture={<ClubLogo uid={details.clubUid} name={details.club} size={PICTURE_SIZE.textLogo} />}
              >
                {details.club}
              </WithPicture>
            )}
            {details.nation && (
              <>
                {" · "}
                <WithPicture inline picture={<NationFlag uid={details.nationUid} />}>
                  {details.nation}
                </WithPicture>
              </>
            )}
            {details.age !== null && (
              <>
                {" · "}
                <span className="scout-card-part">{profileText.age(details.age)}</span>
              </>
            )}
            {details.positions.length > 0 && (
              <>
                {" · "}
                <span className="scout-card-part">{positionLabel(details.positions[0])}</span>
              </>
            )}
          </p>
        </div>
        <div className="scout-card-abilities">
          <abbr title={profileText.currentAbility}>{profileText.currentAbilityShort}</abbr>
          <Ability value={details.currentAbility} />
          <abbr title={profileText.potentialAbility}>{profileText.potentialAbilityShort}</abbr>
          <Ability value={details.potentialAbility} />
        </div>
      </header>

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
    </article>
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
