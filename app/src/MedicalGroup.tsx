// The Medical group of a player's profile: his energy, match sharpness and morale, his current injuries, and
// the button that heals them (or, without any, the control that has the game give him one); then his bans, and the
// button that lifts them.

import { useContext, useEffect, useRef, useState, type RefObject } from "react";
import { EditableValue } from "./EditControls";
import { addInjury, healPlayer, liftBans, wholePercent } from "./editing";
import { describeError, formatDate, formatDateRange, formatNumber, formatPercent } from "./format";
import { fieldLabel, profileText } from "./labels";
import { Fact } from "./ProfileParts";
import type { Ban, Injury, InjuryKind, PlayerDetails } from "./types";
import { EditorContext } from "./useProfileEditing";

/** A stored percentage (0–10000) as the profile shows it: "87%". The squad table of a club shows them the same way. */
export const percentText = (stored: number) => formatPercent(wholePercent(stored));

/**
 * Energy and match sharpness as whole percentages, morale out of 20, which are inputs while the player
 * is edited, and under them his injuries and his bans.
 */
export function MedicalGroup({ details }: { details: PlayerDetails }) {
  const { gameActions } = useContext(EditorContext);
  const injured = details.injuries.length > 0;
  const banned = details.bans.length > 0;
  const noInjuries = useRef<HTMLParagraphElement>(null);
  const injuriesHeading = useRef<HTMLHeadingElement>(null);
  const noBans = useRef<HTMLParagraphElement>(null);
  const wasInjured = useRef(injured);
  const wasBanned = useRef(banned);

  // A heal takes the Heal button, which had focus, away with the list it healed: focus goes to the line that takes
  // their place, so that someone using the keyboard stays in the group. Lifting bans does the same with Lift.
  // Adding an injury takes the Add button away the same way: focus goes to the list that takes its place.
  useEffect(() => {
    if (document.activeElement === document.body) {
      if (wasInjured.current && !injured) {
        noInjuries.current?.focus();
      } else if (!wasInjured.current && injured) {
        injuriesHeading.current?.focus();
      }
    }
    wasInjured.current = injured;
  }, [injured]);

  useEffect(() => {
    if (wasBanned.current && !banned && document.activeElement === document.body) {
      noBans.current?.focus();
    }
    wasBanned.current = banned;
  }, [banned]);

  return (
    <section className="profile-group">
      <h3>{profileText.medical}</h3>
      <dl className="stats medical-values">
        <Fact label={fieldLabel("player", "condition")}>
          <EditableValue field="condition">{percentText(details.condition)}</EditableValue>
        </Fact>
        <Fact label={fieldLabel("player", "match_sharpness")}>
          <EditableValue field="match_sharpness">{percentText(details.matchSharpness)}</EditableValue>
        </Fact>
        <Fact label={fieldLabel("player", "jadedness")} title={profileText.jadednessTitle}>
          <EditableValue field="jadedness">{formatNumber(details.jadedness)}</EditableValue>
        </Fact>
        <Fact label={fieldLabel("player", "morale")} title={profileText.moraleTitle}>
          <EditableValue field="morale">{profileText.morale(details.morale)}</EditableValue>
        </Fact>
      </dl>
      {injured ? (
        <InjuryList uid={details.uid} injuries={details.injuries} headingRef={injuriesHeading} />
      ) : (
        <>
          <p ref={noInjuries} tabIndex={-1} className="injuries-none">
            {profileText.noInjuries}
          </p>
          {gameActions.addInjury && <AddInjury uid={details.uid} />}
        </>
      )}
      {banned ? (
        <BanList uid={details.uid} bans={details.bans} />
      ) : (
        <p ref={noBans} tabIndex={-1} className="injuries-none">
          {profileText.noBans}
        </p>
      )}
    </section>
  );
}

/**
 * The bans a player has, each with how many matches he still misses and when it began, and the Lift button for all of
 * them. Like healing, lifting asks no question: it is logged like any change, and undone from the Changes view.
 */
function BanList({ uid, bans }: { uid: number; bans: Ban[] }) {
  const { editable, readOnlyNote, onEdited } = useContext(EditorContext);
  const [lifting, setLifting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // After lifting the button stays busy until the profile has read the game again, which gives a new list.
  useEffect(() => {
    setLifting(false);
  }, [bans]);

  const lift = async () => {
    // While lifting is under way the button is only dimmed (aria-disabled), not disabled: a disabled button loses focus.
    if (lifting) {
      return;
    }
    setLifting(true);
    setError(null);
    try {
      await liftBans(uid);
      // The game has changed: the lists, the profile and the change log read it again.
      onEdited();
    } catch (e) {
      if (alive.current) {
        setError(describeError(e));
        setLifting(false);
      }
    }
  };

  return (
    <div className="injuries">
      <div className="injuries-head">
        <h4>{fieldLabel("player", "bans")}</h4>
        <button
          type="button"
          className="heal-toggle"
          disabled={!editable}
          aria-disabled={lifting || undefined}
          aria-busy={lifting || undefined}
          title={editable ? profileText.liftBansTitle : readOnlyNote}
          onClick={() => void lift()}
        >
          {profileText.liftBans}
        </button>
      </div>
      {error !== null && (
        <p className="heal-error" role="alert">
          {error}
        </p>
      )}
      <ul className="injury-list">
        {bans.map((ban, index) => (
          <li key={index}>
            <span className="injury-name">{profileText.banMatches(ban.matches)}</span>
            {ban.started && <span className="injury-dates">{profileText.banStarted(formatDate(ban.started))}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** When an injury began and when he is expected back, as one line; nothing for an injury the game gave no dates for. */
function injuryDates({ started, backSoonest, backLatest }: Injury): string {
  return [
    started && profileText.injuryStarted(formatDate(started)),
    (backSoonest || backLatest) && profileText.injuryBack(formatDateRange(backSoonest, backLatest)),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The injuries a player has, each with its name and dates, and the Heal button for all of them. Healing asks no
 * question: it is logged like any change, and undone from the Changes view. Only there while he has an injury, so the
 * state of a heal goes with the list that was healed.
 */
function InjuryList({
  uid,
  injuries,
  headingRef,
}: {
  uid: number;
  injuries: Injury[];
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { editable, readOnlyNote, onEdited } = useContext(EditorContext);
  const [healing, setHealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // After a heal the button stays busy until the profile has read the game again, which gives a new list: pressed in
  // between, it would only heal what is healed already.
  useEffect(() => {
    setHealing(false);
  }, [injuries]);

  const heal = async () => {
    // While a heal is under way the button is only dimmed (aria-disabled), not disabled: a disabled button loses focus.
    if (healing) {
      return;
    }
    setHealing(true);
    setError(null);
    try {
      await healPlayer(uid);
      // The game has changed: the lists, the profile and the change log read it again.
      onEdited();
    } catch (e) {
      if (alive.current) {
        setError(describeError(e));
        setHealing(false);
      }
    }
  };

  return (
    <div className="injuries">
      <div className="injuries-head">
        <h4 ref={headingRef} tabIndex={-1}>
          {fieldLabel("player", "injuries")}
        </h4>
        <button
          type="button"
          className="heal-toggle"
          disabled={!editable}
          aria-disabled={healing || undefined}
          aria-busy={healing || undefined}
          title={editable ? profileText.healTitle : readOnlyNote}
          onClick={() => void heal()}
        >
          {profileText.heal}
        </button>
      </div>
      {error !== null && (
        <p className="heal-error" role="alert">
          {error}
        </p>
      )}
      <ul className="injury-list">
        {injuries.map((injury, index) => {
          const dates = injuryDates(injury);
          return (
            <li key={index}>
              <span className="injury-name">{injury.name ?? profileText.unknownInjury}</span>
              {dates && <span className="injury-dates">{dates}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * For a player with no injury: a select of the kinds of injury the game knows and the button that has the game give
 * him the one chosen, as its training injuries do; the game picks how long it lasts. Logged like any change, and undone
 * from the Changes view. Only there while he has no injury, as the game gives one only then.
 */
function AddInjury({ uid }: { uid: number }) {
  const { editable, readOnlyNote, onEdited, injuryKinds } = useContext(EditorContext);
  const [kinds, setKinds] = useState<InjuryKind[] | null>(null);
  const [kind, setKind] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    injuryKinds().then(
      (list) => {
        if (current) {
          setKinds(list);
          setKind((chosen) => chosen ?? list[0]?.uid ?? null);
        }
      },
      (e: unknown) => {
        if (current) {
          setError(describeError(e));
        }
      },
    );
    return () => {
      current = false;
    };
  }, [injuryKinds]);

  // Once added, the profile reads the game again and shows the injury in this control's place; only a failure
  // brings it back to life.
  const add = async () => {
    if (adding || kind === null) {
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await addInjury(uid, kind);
      onEdited();
    } catch (e) {
      setError(describeError(e));
      setAdding(false);
    }
  };

  const unavailable = !editable || kinds === null || kinds.length === 0;
  return (
    <>
      <div className="injury-add">
        <select
          className="edit-input"
          aria-label={profileText.injuryKind}
          value={kind ?? ""}
          disabled={unavailable}
          title={editable ? undefined : readOnlyNote}
          onChange={(e) => setKind(Number(e.target.value))}
        >
          {kinds?.map((k) => (
            <option key={k.uid} value={k.uid}>
              {k.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="heal-toggle"
          disabled={unavailable}
          aria-disabled={adding || undefined}
          aria-busy={adding || undefined}
          title={editable ? undefined : readOnlyNote}
          onClick={() => void add()}
        >
          {profileText.addInjury}
        </button>
      </div>
      {error !== null && (
        <p className="heal-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
