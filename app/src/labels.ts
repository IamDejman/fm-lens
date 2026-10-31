// Text of the player, staff and club profiles and lists, as the components import it. The wording is in i18n/en.ts
// and i18n/tr.ts (one shape, one file per language); this file hands out the language chosen at startup (see
// i18n/index.ts) under the names the components use. Keys of the game data map to the names FM uses; every other
// string of the panels is in `profileText` (those only the club panel has, in `clubProfileText`), and those of the
// player, staff and club lists in `playerListText`, `staffListText` and `clubListText`. Editing has `editText` (and
// `fieldLabel` for the names of the fields), the Changes view `changesText`, mass editing `massEditText`, comparing
// players `comparisonText`, moving a player to another club `moveText`, the sidebar and the connect panel `appText`,
// and the status of the graphics packs `graphicsText`.
// A new language only has to provide a dictionary of the same shape (and be added to i18n/index.ts).

import { formatNumber } from "./format";
import { intlLocale, strings } from "./i18n";
import type { Strings } from "./i18n/en";
import type { Entity } from "./types";

export const ATTRIBUTE_LABELS = strings.attributes;

export type AttributeKey = keyof Strings["attributes"];

export const STAFF_ATTRIBUTE_LABELS = strings.staffAttributes;

export type StaffAttributeKey = keyof Strings["staffAttributes"];

export const PERSONALITY_LABELS = strings.personality;

export type PersonalityKey = keyof Strings["personality"];

export const POSITION_LABELS = strings.positions;

export type PositionKey = keyof Strings["positions"];

/** The abbreviation of a position by its key ("st" is "ST"); a key the table lacks is shown upper-cased. */
export function positionLabel(key: string): string {
  return labelIn(POSITION_LABELS, key) ?? key.toUpperCase();
}

export const CLUB_FACILITY_LABELS = strings.clubFacilities;

export const SUPPORTER_TRAIT_LABELS = strings.supporterTraits;

/** The kinds of supporters, in the order of the supporter-mix bar. */
export const SUPPORTER_MIX_LABELS = strings.supporterMix;

export type SupporterMixKey = keyof Strings["supporterMix"];

/** FM's job codes as stored in contracts, with their names. */
const JOB_LABELS: Partial<Record<number, string>> = strings.jobs;

export const profileText = strings.profile;

/**
 * The name of a job code from a contract. An odd code above 1 is the player-coach variant of the
 * code below it. A person without a contract (`null`) has no job; codes the table does not know
 * are shown as they are.
 */
export function jobLabel(code: number | null): string {
  if (code === null) {
    return profileText.none;
  }
  const label = JOB_LABELS[code];
  if (label !== undefined) {
    return label;
  }
  const coach = code > 1 && code % 2 === 1 ? JOB_LABELS[code - 1] : undefined;
  return coach !== undefined ? profileText.playerCoach(coach) : profileText.unknownJob(code);
}

/** How the codes of a field that holds codes from a list (see `EditField.choices`) are named, by the field's key. */
const CHOICE_NAMES = new Map<string, (code: number) => string>([
  ["contract.squad_status", profileText.squadStatusName],
]);

/**
 * The name of `code`, a value of the field `key` that holds codes from a list; a field whose codes have no names
 * shows them as numbers. A code the game holds that the field does not offer is named the same way.
 */
export function choiceLabel(key: string, code: number): string {
  return CHOICE_NAMES.get(key)?.(code) ?? formatNumber(code);
}

/**
 * The jobs the staff list can be filtered by, one entry each, in the order of their names (as the language
 * sorts them). The odd codes (player-coaches) are left out: a filter on a coaching job finds them too. So is
 * "Player" (code 1), which is no job of a member of staff and, with the next code added, would match the coaches.
 */
export const JOB_FILTER_OPTIONS: readonly { code: number; label: string }[] = Object.keys(JOB_LABELS)
  .map(Number)
  .filter((code) => code > 1)
  .map((code) => ({ code, label: jobLabel(code) }))
  .sort((a, b) => a.label.localeCompare(b.label, intlLocale));

/** The player list: search, filter bar and columns. */
export const playerListText = strings.playerList;

/** The staff list. */
export const staffListText = strings.staffList;

/** The club profile: what the player and staff panels do not have. */
export const clubProfileText = strings.clubProfile;

/** The club list, with the sidebar entry and the status-line count that go with it. */
export const clubListText = strings.clubList;

/**
 * The app around the lists: the sidebar (and the note at its foot, which depends on the connection, see
 * `ConnectionInfo.editable`), the status line and the connect panel.
 */
export const appText = strings.app;

/** The graphics packs the pictures come from: their status at the foot of the sidebar. */
export const graphicsText = strings.graphics;

/** Editing a person or a club: the Edit button, the inputs, and the footer under the profile. */
export const editText = strings.edit;

/** The Changes view: what was written to the game this session. */
export const changesText = strings.changes;

/** Mass editing: the button in the toolbar of a list and the dialog it opens. */
export const massEditText = strings.massEdit;

/** Comparing players: the button in a profile, the tray under the player list and the dialog. */
export const comparisonText = strings.comparison;

/** Moving a player to another club: the button in his profile and the dialog it opens. */
export const moveText = strings.move;

const asText = (value: number | string) => (typeof value === "number" ? formatNumber(value) : value);

/**
 * "17 → 20": a value before and after a change, as shown. A number gets the reader's thousands separators; text,
 * such as a date or an amount of money already written out (see `valueText` in editDraft.ts), is used as it is.
 */
export const valueChange = (from: number | string, to: number | string) => `${asText(from)} → ${asText(to)}`;

/** The text of `table` for `key`; nothing for a key the table lacks, however it is spelled (e.g. "constructor"). */
function labelIn(table: object, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? (table as Record<string, string>)[key] : undefined;
}

/** The names of the fields that are not attributes, personality or positions, by key. */
const FIELD_LABELS: Readonly<Record<string, string>> = strings.fields;

/**
 * The name of an editable field, from the key `edit_fields` gives it ("current_ability", "attribute.finishing",
 * "position.st", "contract.wage", "finance.balance", …). A key it does not know is returned as it is.
 */
export function fieldLabel(entity: Entity, key: string): string {
  const fixed = labelIn(FIELD_LABELS, key);
  if (fixed !== undefined) {
    return fixed;
  }
  const [group, name = ""] = key.split(".");
  switch (group) {
    case "attribute":
      return labelIn(entity === "staff" ? STAFF_ATTRIBUTE_LABELS : ATTRIBUTE_LABELS, name) ?? key;
    case "personality":
      return labelIn(PERSONALITY_LABELS, name) ?? key;
    case "position": {
      const position = labelIn(POSITION_LABELS, name);
      return position === undefined ? key : editText.positionRating(position);
    }
    default:
      return key;
  }
}
