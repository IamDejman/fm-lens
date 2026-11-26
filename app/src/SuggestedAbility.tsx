import { useContext, useEffect, useMemo, useRef } from "react";
import { profileText } from "./labels";
import { ABILITY_ATTRIBUTES, ABILITY_POSITIONS, ownAbility, suggestedAbility } from "./abilityEstimate";
import { keepOwnAbility, keptOwnAbility } from "./abilityMemory";
import type { PlayerDetails } from "./types";
import { profileKey } from "./editing";
import { EditHistoryContext, useEditSession, type EditSession } from "./useProfileEditing";

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
 * already holds it, so a player nothing was changed on has none. The suggestion goes by what the game held before the
 * edits of this session: an ability typed in or left behind by an earlier Apply is not taken as the game's own. How
 * far the game's own was from the estimate is kept as his abilities are applied, for the times FM Lens is opened after.
 */
export function SuggestedAbility({ details }: { details: Pick<PlayerDetails, "uid" | "attributes" | "positionRatings"> }) {
  const session = useEditSession();
  const { save, before } = useContext(EditHistoryContext);
  const kept = useMemo(() => keptOwnAbility(save, details.uid), [save, details.uid]);
  const ability = session?.input("current_ability") ?? null;
  const potential = session?.input("potential_ability") ?? null;
  // What was put in the inputs here, not typed: they follow the attributes until an ability is typed over them.
  const put = useRef<{ ability?: string; potential?: string }>({});

  let suggestion: number | null = null;
  let own: number | null = null;
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
    // The game's own ability, attributes and positions: what a field held before it was first edited.
    const first = before.get(profileKey(session.entity, details.uid));
    const game = (key: string, held: number) => first?.get(key) ?? held;
    const was = {
      attributes: Object.fromEntries(
        ABILITY_ATTRIBUTES.map((key) => [key, game(`attribute.${key}`, details.attributes[key]?.raw ?? 0) / 5]),
      ),
      positions: Object.fromEntries(rated.map((key) => [key, game(`position.${key}`, details.positionRatings[key])])),
    };
    own = ownAbility(game("current_ability", ability.was), was, kept);
    suggestion = suggestedAbility(game("current_ability", ability.was), was, { attributes, positions }, kept);
    edited =
      ABILITY_ATTRIBUTES.some((key) => changed(session, `attribute.${key}`)) ||
      rated.some((key) => changed(session, `position.${key}`));
  }
  // The ability to hold while nothing else was typed there: the suggestion once an edit made it higher.
  const raised = ability && suggestion !== null ? (edited ? Math.max(suggestion, ability.was) : ability.was) : null;

  // As his abilities are applied: what he has after is no longer the game's own.
  const keep = session?.busy && (edited || ability?.status === "changed") ? own : null;
  useEffect(() => {
    if (keep !== null) {
      keepOwnAbility(save, details.uid, keep);
    }
  }, [keep, save, details.uid]);

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
