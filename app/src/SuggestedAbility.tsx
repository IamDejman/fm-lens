import { profileText } from "./labels";
import { ABILITY_ATTRIBUTES, ABILITY_POSITIONS, suggestedAbility } from "./abilityEstimate";
import type { PlayerDetails } from "./types";
import { useEditSession, type EditSession } from "./useProfileEditing";

/** What the input of `key` would write, or `stored` while it holds no change. */
function drafted(session: EditSession, key: string, stored: number): number {
  const input = session.input(key);
  return input?.status === "changed" ? Number(input.text) : stored;
}

/**
 * While a player is edited, the current ability that fits his attributes, feet and positions as they are typed, as
 * FM's own editor recommends one: a button that puts it in the input, and raises a potential that is below it. Not
 * shown while the input already holds it, so a player nothing was changed on has none.
 */
export function SuggestedAbility({ details }: { details: Pick<PlayerDetails, "attributes" | "positionRatings"> }) {
  const session = useEditSession();
  const ability = session?.input("current_ability");
  if (!session || !ability) {
    return null;
  }
  // An attribute that was not typed into counts as the game stores it, five steps to a point.
  const stored = Object.fromEntries(ABILITY_ATTRIBUTES.map((key) => [key, (details.attributes[key]?.raw ?? 0) / 5]));
  const attributes = Object.fromEntries(
    ABILITY_ATTRIBUTES.map((key) => [key, drafted(session, `attribute.${key}`, stored[key])]),
  );
  const positions = Object.fromEntries(
    ABILITY_POSITIONS.filter((key) => details.positionRatings[key] !== undefined).map((key) => [
      key,
      drafted(session, `position.${key}`, details.positionRatings[key]),
    ]),
  );
  const suggestion = suggestedAbility(
    ability.was,
    { attributes: stored, positions: details.positionRatings },
    { attributes, positions },
  );
  if (suggestion === null || Number(ability.text) === suggestion) {
    return null;
  }
  const use = () => {
    session.type("current_ability", String(suggestion));
    // A potential set as a range (a negative number) is left as it is.
    const potential = Number(session.input("potential_ability")?.text);
    if (potential > 0 && potential < suggestion) {
      session.type("potential_ability", String(suggestion));
    }
  };
  return (
    <button type="button" disabled={session.busy} onClick={use}>
      {profileText.suggestedAbility(suggestion)}
    </button>
  );
}
