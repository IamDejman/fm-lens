import { useEffect, useRef } from "react";
import { profileText } from "./labels";
import { ABILITY_ATTRIBUTES, ABILITY_POSITIONS, suggestedAbility } from "./abilityEstimate";
import type { PlayerDetails } from "./types";
import { useEditSession, type EditSession } from "./useProfileEditing";

/** What the input of `key` would write, or `stored` while it holds no change. */
function drafted(session: EditSession, key: string, stored: number): number {
  const input = session.input(key);
  return input?.status === "changed" ? Number(input.text) : stored;
}

/** Whether the input of `key` holds a change. */
const changed = (session: EditSession, key: string) => session.input(key)?.status === "changed";

/**
 * While a player is edited, the current ability that fits his attributes, feet and positions as they are typed, as
 * FM's own editor recommends one. Raising them raises the ability with them, and a potential that is below it, so
 * Apply writes both: FM pulls the attributes of a player back down to an ability that was left behind. An ability
 * typed in is left as typed. Otherwise a button puts the suggestion in the input; it is not shown while the input
 * already holds it, so a player nothing was changed on has none.
 */
export function SuggestedAbility({ details }: { details: Pick<PlayerDetails, "attributes" | "positionRatings"> }) {
  const session = useEditSession();
  const ability = session?.input("current_ability") ?? null;
  const potential = session?.input("potential_ability") ?? null;
  // What was put in the inputs here, not typed: they follow the attributes until an ability is typed over them.
  const put = useRef<{ ability?: string; potential?: string }>({});

  let suggestion: number | null = null;
  let edited = false;
  if (session && ability) {
    // An attribute that was not typed into counts as the game stores it, five steps to a point.
    const stored = Object.fromEntries(ABILITY_ATTRIBUTES.map((key) => [key, (details.attributes[key]?.raw ?? 0) / 5]));
    const attributes = Object.fromEntries(
      ABILITY_ATTRIBUTES.map((key) => [key, drafted(session, `attribute.${key}`, stored[key])]),
    );
    const rated = ABILITY_POSITIONS.filter((key) => details.positionRatings[key] !== undefined);
    const positions = Object.fromEntries(
      rated.map((key) => [key, drafted(session, `position.${key}`, details.positionRatings[key])]),
    );
    suggestion = suggestedAbility(
      ability.was,
      { attributes: stored, positions: details.positionRatings },
      { attributes, positions },
    );
    edited =
      ABILITY_ATTRIBUTES.some((key) => changed(session, `attribute.${key}`)) ||
      rated.some((key) => changed(session, `position.${key}`));
  }
  // The ability to hold while nothing else was typed there: the suggestion once an edit made it higher.
  const raised = ability && suggestion !== null ? (edited ? Math.max(suggestion, ability.was) : ability.was) : null;

  useEffect(() => {
    if (!session || session.busy || !ability || raised === null) {
      return;
    }
    if (ability.status !== "same" && ability.text !== put.current.ability) {
      return;
    }
    const text = String(raised);
    if (ability.text !== text) {
      put.current.ability = text;
      session.type("current_ability", text);
    }
    // A potential set as a range (a negative number) is left as it is, and so is one typed in.
    if (potential && potential.was > 0 && (potential.status === "same" || potential.text === put.current.potential)) {
      const above = String(Math.max(potential.was, raised));
      if (potential.text !== above) {
        put.current.potential = above;
        session.type("potential_ability", above);
      }
    }
  }, [session, ability, potential, raised]);

  if (!session || !ability || suggestion === null || Number(ability.text) === suggestion) {
    return null;
  }
  const use = () => {
    session.type("current_ability", String(suggestion));
    // A potential set as a range (a negative number) is left as it is.
    const held = Number(potential?.text);
    if (held > 0 && held < suggestion) {
      session.type("potential_ability", String(suggestion));
    }
  };
  return (
    <button type="button" disabled={session.busy} onClick={use}>
      {profileText.suggestedAbility(suggestion)}
    </button>
  );
}
