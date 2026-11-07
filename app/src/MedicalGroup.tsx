// The Medical tab of a player's profile: his energy, match sharpness and jadedness; his injuries, with the buttons that
// heal them and change how long each lasts (or, without any, the control that has the game give him one); then his
// bans, and the button that lifts them. Each button is on the heading of its group.

import { useContext, useEffect, useRef, useState } from "react";
import { EditableValue } from "./EditControls";
import { addInjury, changeInjury, healPlayer, liftBans, removeInjury, wholePercent } from "./editing";
import { describeError, formatDate, formatDateRange, formatNumber, formatPercent } from "./format";
import { fieldLabel, jadedText, listText, profileText } from "./labels";
import { Fact, focusLost, GroupHead } from "./ProfileParts";
import { ListChange } from "./RelationGroups";
import { ValueListDialog } from "./ValueListDialog";
import type { Ban, Injury, InjuryKind, PlayerDetails } from "./types";
import { EditorContext } from "./useProfileEditing";

/** The days an injury can be made to last from when it began, as the editor writes them. */
const INJURY_DAYS = { least: 1, most: 730 };

/** A stored percentage (0–10000) as the profile shows it: "87%". The squad table of a club shows them the same way. */
export const percentText = (stored: number) => formatPercent(wholePercent(stored));

/** Energy and match sharpness as whole percentages and jadedness, which are inputs while the player is edited; then
 * his injuries and his bans. */
export function MedicalGroups({ details }: { details: PlayerDetails }) {
  return (
    <>
      <section className="profile-group">
        <h3>{profileText.fitness}</h3>
        <dl className="stats">
          <Fact label={fieldLabel("player", "condition")}>
            <EditableValue field="condition">{percentText(details.condition)}</EditableValue>
          </Fact>
          <Fact label={fieldLabel("player", "match_sharpness")}>
            <EditableValue field="match_sharpness">{percentText(details.matchSharpness)}</EditableValue>
          </Fact>
          <Fact
            label={fieldLabel("player", "jadedness")}
            title={profileText.jadednessTitle(formatNumber(details.jadedness))}
          >
            <EditableValue field="jadedness">{jadedText(details.jadedness)}</EditableValue>
          </Fact>
        </dl>
      </section>
      <InjuryGroup uid={details.uid} who={details.name} injuries={details.injuries} />
      <BanGroup uid={details.uid} bans={details.bans} />
    </>
  );
}

/** Calls `task`, keeping `busy` on from the start until the profile has read the game again (see `onEdited`). */
function useGameAction(resetOn: unknown) {
  const { onEdited } = useContext(EditorContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // After the write the button stays busy until the profile has read the game again, which gives a new list: pressed in
  // between, it would only do again what is done already.
  useEffect(() => {
    setBusy(false);
  }, [resetOn]);

  const run = async (task: () => Promise<unknown>) => {
    // While it is under way the button is only dimmed (aria-disabled), not disabled: a disabled button loses focus.
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await task();
      // The game has changed: the lists, the profile and the change log read it again.
      onEdited();
    } catch (e) {
      if (alive.current) {
        setError(describeError(e));
        setBusy(false);
      }
    }
  };

  return { busy, error, setError, run };
}

/**
 * The bans a player has, each with how many matches he still misses and when it began, and on the heading the Lift
 * button for all of them. Like healing, lifting asks no question: it is logged like any change, and undone from the
 * Changes view.
 */
function BanGroup({ uid, bans }: { uid: number; bans: Ban[] }) {
  const { editable, readOnlyNote } = useContext(EditorContext);
  const { busy, error, run } = useGameAction(bans);
  const banned = bans.length > 0;
  const noBans = useRef<HTMLParagraphElement>(null);
  const wasBanned = useRef(banned);

  // Lifting takes the focus from the Lift button, which goes dim with no bans left: it goes to the line that says so,
  // so that someone using the keyboard stays in the group.
  useEffect(() => {
    if (wasBanned.current && !banned && focusLost()) {
      noBans.current?.focus();
    }
    wasBanned.current = banned;
  }, [banned]);

  return (
    <section className="profile-group">
      <GroupHead title={fieldLabel("player", "bans")}>
        <button
          type="button"
          className="heal-toggle"
          disabled={!editable || !banned}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          title={editable ? profileText.liftBansTitle : readOnlyNote}
          onClick={() => void run(() => liftBans(uid))}
        >
          {profileText.liftBans}
        </button>
      </GroupHead>
      {error !== null && (
        <p className="heal-error" role="alert">
          {error}
        </p>
      )}
      {banned ? (
        <ul className="injury-list">
          {bans.map((ban, index) => (
            <li key={index}>
              <span className="injury-name">{profileText.banMatches(ban.matches)}</span>
              {ban.started && <span className="injury-dates">{profileText.banStarted(formatDate(ban.started))}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p ref={noBans} tabIndex={-1} className="injuries-none">
          {profileText.noBans}
        </p>
      )}
    </section>
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
 * The injuries a player has, each with its name and dates; on the heading, the Change button that sets how many days
 * each lasts or takes one out, and the Heal button for all of them. Healing asks no question: it is logged like any
 * change, and undone from the Changes view. Without an injury the heading has the control that gives him one.
 */
function InjuryGroup({ uid, who, injuries }: { uid: number; who: string; injuries: Injury[] }) {
  const { editable, readOnlyNote, gameActions } = useContext(EditorContext);
  const action = useGameAction(injuries);
  const injured = injuries.length > 0;
  const heading = useRef<HTMLHeadingElement>(null);
  const noInjuries = useRef<HTMLParagraphElement>(null);
  const wasInjured = useRef(injured);

  // A heal takes the Heal button, which had focus, away with the list it healed: focus goes to the line that takes
  // their place, so that someone using the keyboard stays in the group. Adding an injury takes the Add button away the
  // same way: focus goes to the heading of the list that takes its place.
  useEffect(() => {
    if (document.activeElement === document.body) {
      if (wasInjured.current && !injured) {
        noInjuries.current?.focus();
      } else if (!wasInjured.current && injured) {
        heading.current?.focus();
      }
    }
    wasInjured.current = injured;
  }, [injured]);

  return (
    <section className="profile-group">
      <GroupHead title={fieldLabel("player", "injuries")} headingRef={heading}>
        {injured ? (
          <>
            <ListChange
              title={listText.injuriesTitle}
              dialog={(onClose) => (
                <ValueListDialog
                  title={listText.daysOut}
                  who={who}
                  sections={[
                    {
                      key: "injuries",
                      heading: null,
                      rows: injuries.map((injury, index) => ({
                        index,
                        name: injury.name ?? profileText.unknownInjury,
                        note: injuryDates(injury) || undefined,
                        value: injury.days,
                      })),
                    },
                  ]}
                  {...INJURY_DAYS}
                  inputLabel={listText.daysOf}
                  save={(index, days) => changeInjury(uid, index, days)}
                  remove={(index) => removeInjury(uid, index)}
                  list={injuries}
                  onClose={onClose}
                />
              )}
            />
            <button
              type="button"
              className="heal-toggle"
              disabled={!editable}
              aria-disabled={action.busy || undefined}
              aria-busy={action.busy || undefined}
              title={editable ? profileText.healTitle : readOnlyNote}
              onClick={() => void action.run(() => healPlayer(uid))}
            >
              {profileText.heal}
            </button>
          </>
        ) : (
          gameActions.addInjury && <AddInjury uid={uid} action={action} />
        )}
      </GroupHead>
      {action.error !== null && (
        <p className="heal-error" role="alert">
          {action.error}
        </p>
      )}
      {injured ? (
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
      ) : (
        <p ref={noInjuries} tabIndex={-1} className="injuries-none">
          {profileText.noInjuries}
        </p>
      )}
    </section>
  );
}

/**
 * For a player with no injury: a select of the kinds of injury the game knows and the button that has the game give
 * him the one chosen, as its training injuries do; the game picks how long it lasts. Logged like any change, and undone
 * from the Changes view. Once added, the profile reads the game again and shows the injury in this control's place.
 */
function AddInjury({ uid, action }: { uid: number; action: ReturnType<typeof useGameAction> }) {
  const { editable, readOnlyNote, injuryKinds } = useContext(EditorContext);
  const [kinds, setKinds] = useState<InjuryKind[] | null>(null);
  const [kind, setKind] = useState<number | null>(null);
  const { setError } = action;

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
  }, [injuryKinds, setError]);

  const unavailable = !editable || kinds === null || kinds.length === 0;
  return (
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
        aria-disabled={action.busy || undefined}
        aria-busy={action.busy || undefined}
        title={editable ? undefined : readOnlyNote}
        onClick={() => {
          if (kind !== null) {
            void action.run(() => addInjury(uid, kind));
          }
        }}
      >
        {profileText.addInjury}
      </button>
    </div>
  );
}
