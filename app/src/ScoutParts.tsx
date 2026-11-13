// FM Lens's scouting estimates on screen: the progress stars, and a player's Scout tab.

import { useContext, type CSSProperties } from "react";
import { Ability } from "./Ability";
import { formatNumber } from "./format";
import { ATTRIBUTE_LABELS, playerListText, profileText, scoutText, type AttributeKey } from "./labels";
import { MENTAL, PHYSICAL, TECHNICAL, GOALKEEPING, isGoalkeeper } from "./playerAttributes";
import { Fact, tierClass, useProfileDetails } from "./ProfileParts";
import { roleLabel } from "./scoutRoles";
import type { PlayerDetails, ScoutReport } from "./types";
import { EditorContext } from "./useProfileEditing";

const text = scoutText.report;

/** A progress rate as five stars, filled to `halfStars` (0 to 10). */
export function Stars({ halfStars }: { halfStars: number }) {
  const label = scoutText.starsLabel(halfStars);
  const style = { "--stars": `${Math.max(0, Math.min(10, halfStars)) * 10}%` } as CSSProperties;
  return (
    <span className="stars" role="img" aria-label={label} title={label} style={style}>
      <span className="stars-on" aria-hidden="true" />
    </span>
  );
}

/** A player's Scout tab: his development, best roles, potential attributes and other careers, and Find similar. */
export function ScoutTab({ details, version }: { details: PlayerDetails; version: number }) {
  const loaded = useProfileDetails<ScoutReport>("player_scout", details.uid, version);
  const { findSimilar } = useContext(EditorContext);
  if (loaded === null) {
    return <p className="note">{profileText.loading}</p>;
  }
  if (loaded.error !== undefined) {
    return <p className="note error">{text.failed(loaded.error)}</p>;
  }
  const report = loaded.details;
  const player = { uid: details.uid, name: details.name };
  return (
    <>
      <section className="profile-group">
        <h3>{text.development}</h3>
        <dl className="stats">
          <Fact label={text.chance} title={text.chanceTitle}>
            {report.development ? `${formatNumber(report.development.probability)}%` : profileText.none}
          </Fact>
          <Fact label={text.progress} title={report.development ? text.gain(Math.round(report.development.gain)) : undefined}>
            {report.development ? <Stars halfStars={report.development.halfStars} /> : profileText.none}
          </Fact>
          <Fact label={text.potential}>
            {report.potential === null ? profileText.none : <Ability value={report.potential} />}
          </Fact>
        </dl>
        <div className="scout-actions" role="group" aria-label={text.findSimilar}>
          <span>{text.findSimilar}</span>
          <button type="button" onClick={() => findSimilar(player, false)}>
            {text.similarToday}
          </button>
          <button type="button" onClick={() => findSimilar(player, true)}>
            {text.similarPeak}
          </button>
        </div>
      </section>

      <section className="profile-group">
        <h3>{text.roles}</h3>
        <table className="scout-table">
          <thead>
            <tr>
              <th>{text.role}</th>
              <th className="num">{text.today}</th>
              <th className="num">{text.peak}</th>
            </tr>
          </thead>
          <tbody>
            {report.roles.map((rating) => (
              <tr key={rating.role}>
                <td>{roleLabel(rating.role)}</td>
                <td className="num">{rating.today}</td>
                <td className="num">{rating.peak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <PotentialAttributes details={details} peak={report.peak} />

      <section className="profile-group">
        <h3>{text.careers}</h3>
        {report.careers === null ? (
          <p className="note">{text.careersReading}</p>
        ) : report.careers.length === 0 ? (
          <p className="note">{text.noCareers}</p>
        ) : (
          report.careers.map((career, index) => (
            <div key={index} className="scout-career">
              <h4>{text.career(career.manager, career.club)}</h4>
              <table className="scout-table">
                <thead>
                  <tr>
                    <th className="num">{text.year}</th>
                    <th className="num">{text.age}</th>
                    <th className="num">{playerListText.columns.currentAbility}</th>
                    <th className="num">{playerListText.columns.potentialAbility}</th>
                  </tr>
                </thead>
                <tbody>
                  {career.points.map((point) => (
                    <tr key={point.year}>
                      <td className="num">{point.year}</td>
                      <td className="num">{point.age}</td>
                      <td className="num">
                        <Ability value={point.currentAbility} />
                      </td>
                      <td className="num">
                        <Ability value={point.potentialAbility} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>
    </>
  );
}

/** His attributes at his potential beside the ones he has, group by group as on his Attributes tab. */
function PotentialAttributes({ details, peak }: { details: PlayerDetails; peak: Record<string, number> }) {
  const groups: { title: string; keys: readonly AttributeKey[] }[] = [
    isGoalkeeper(details)
      ? { title: profileText.goalkeeping, keys: GOALKEEPING }
      : { title: profileText.technical, keys: TECHNICAL },
    { title: profileText.mental, keys: MENTAL },
    { title: profileText.physical, keys: PHYSICAL },
  ];
  return (
    <section className="profile-group">
      <h3>{text.attributes}</h3>
      <div className="profile-columns">
        {groups.map((group) => (
          <section key={group.title} className="profile-group">
            <h4>{group.title}</h4>
            <dl className="stats ratings">
              {group.keys.map((key) => {
                const now = details.attributes[key]?.value;
                const then = peak[key];
                const gain = now !== undefined && then !== undefined ? then - now : 0;
                return (
                  <div key={key} className="stat">
                    <dt>{ATTRIBUTE_LABELS[key]}</dt>
                    <dd className={then === undefined ? "value" : `value ${tierClass(then)}`}>
                      {then ?? profileText.none}
                      {gain > 0 && <span className="scout-gain">+{gain}</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
    </section>
  );
}
