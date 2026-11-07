// Editing: the Rust commands that change the game, and how stored values are shown.

import { call } from "./api";
import { converts, toPounds, toShown } from "./currency";
import type {
  ApplyReport,
  BatchUndo,
  CaptainRole,
  ClubTeam,
  EditField,
  Entity,
  FieldEdit,
  FieldValues,
  FmDate,
  FutureTransfer,
  InjuryKind,
  LoggedChange,
  MassFilters,
  MassOperation,
  MassPreview,
  MassReport,
  ManagerPreview,
  MovePreview,
  MoveTerms,
  Nation,
  Promise as PlayerPromise,
  TeamAction,
  TieKind,
} from "./types";

/** The fields of players or of staff the editor can change, in display order. */
export const editFields = (entity: Entity) => call<EditField[]>("edit_fields", { entity });

/** Freezes the money of the club `club`, or unfreezes it; the clubs whose money is frozen now. */
export const freezeMoney = (club: number, frozen: boolean) => call<number[]>("freeze_money", { club, frozen });

/** The clubs whose money is frozen: while the app is connected, their balance does not go down. */
export const frozenClubs = () => call<number[]>("frozen_clubs");

/** Freezes the attributes of the player `uid`, or unfreezes them; the players whose attributes are frozen now. */
export const freezeAttributes = (uid: number, frozen: boolean) => call<number[]>("freeze_attributes", { uid, frozen });

/** The players whose attributes are frozen: while the app is connected, they do not get worse. */
export const frozenPlayers = () => call<number[]>("frozen_players");

/**
 * Sets every attribute of the player `uid` to its best: 20, and 1 for injury proneness and dirtiness. The changes are
 * logged as one batch, undone with `undoBatch`; `applied` counts them.
 */
/** Sets every attribute of the player to `level` (1 to 20); injury proneness and dirtiness, lower being better, to 21 - `level`. */
export const setAttributes = (uid: number, level: number) => call<MassReport>("set_attributes", { uid, level });

/** The nations of the people in the lists, by name: what a nation field can be set to. */
export const listNations = () => call<Nation[]>("list_nations");

/** Every editable field of one player or member of staff, as stored, read from the game now. */
export const readValues = (entity: Entity, uid: number) => call<FieldValues>("read_values", { entity, uid });

/** Writes `edits` (values as stored). Each one is checked and written on its own; refused ones change nothing. */
export const applyEdits = (entity: Entity, uid: number, edits: FieldEdit[]) =>
  call<ApplyReport>("apply_edits", { entity, uid, edits });

/** Every change written this session, newest first. */
export const changeLog = () => call<LoggedChange[]>("change_log");

/** Writes back the old value of a logged change; fails if the game has changed the value since. */
export const undoChange = (id: number) => call<LoggedChange>("undo_change", { id });

/** The whole percentage the game shows (0–100) for a stored one (0–10000), for a profile that has no field table. */
export const wholePercent = (stored: number): number => Math.floor((stored + 50) / 100);

const floatBits = new DataView(new ArrayBuffer(4));

/** The float whose bits are `bits`, as an "f32" field stores it. */
function floatOf(bits: number): number {
  floatBits.setUint32(0, bits);
  return floatBits.getFloat32(0);
}

/** The bits of `value` as a 32-bit float. */
function bitsOf(value: number): number {
  floatBits.setFloat32(0, value);
  return floatBits.getUint32(0);
}

/**
 * The value the game shows for a stored one: attributes are stored 0–100 and shown 1–20, percentages are stored
 * 0–10000 and shown 0–100, money is stored in pounds and shown in the chosen currency (see `currency.ts`), and a
 * float is shown in hundredths (1922.83 as 192283). A blank, such as an asking price that is not set, is shown as it
 * is stored.
 */
export function shownValue(field: EditField, stored: number): number {
  if (field.kind === "i32") {
    return stored === field.blank ? stored : toShown(stored);
  }
  if (field.kind === "f32") {
    return Math.round(floatOf(stored) * 100);
  }
  switch (field.scale) {
    case "attribute":
      return Math.min(20, Math.max(1, Math.floor((stored + 2) / 5)));
    case "percent":
      return wholePercent(stored);
    default:
      return stored;
  }
}

/**
 * Whether `field` is stored otherwise than it is shown, as attributes, percentages and money in another currency than
 * pounds are: what is shown is rounded or converted, so a list of changes has the values as stored in a hover text.
 * False for a field the table lacks.
 */
export const isStoredFiner = (field: EditField | undefined): boolean =>
  field !== undefined && (field.scale !== "plain" || (field.kind === "i32" && converts));

/**
 * The stored value to write for a value typed as shown: the middle of the stored values the game shows as it; for
 * money, the nearest whole pound; for a float, its bits.
 */
export function storedValue(field: EditField, shown: number): number {
  if (field.kind === "i32") {
    return shown === field.blank ? shown : toPounds(shown);
  }
  if (field.kind === "f32") {
    return bitsOf(shown / 100);
  }
  switch (field.scale) {
    case "attribute":
      return shown * 5;
    case "percent":
      return shown * 100;
    default:
      return shown;
  }
}

/** The values an input for `field` takes, as shown. */
export function shownRange(field: EditField): { min: number; max: number } {
  return { min: shownValue(field, field.min), max: shownValue(field, field.max) };
}

/**
 * The edit to send when the input of `field` holds `shown`, given the stored value it started from: null when
 * the game would show the same value as before, so an attribute's stored value is not rounded for nothing.
 */
export function editFor(field: EditField, stored: number, shown: number): FieldEdit | null {
  return shownValue(field, stored) === shown ? null : { field: field.key, expected: stored, value: storedValue(field, shown) };
}

/** The date a stored date value (a number like 20290630) stands for; null for 0 or anything that is not a date. */
export function dateFromNumber(value: number): FmDate | null {
  const year = Math.floor(value / 10_000);
  const month = Math.floor(value / 100) % 100;
  const day = value % 100;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate(); // days in that month
  return value > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days ? { year, month, day } : null;
}

/** The stored value of a date: a number like 20290630. */
export const numberFromDate = (date: FmDate): number => date.year * 10_000 + date.month * 100 + date.day;

/** A stored date value as a date input holds it (`YYYY-MM-DD`); "" for 0 or anything that is not a date. */
export function isoFromNumber(value: number): string {
  const date = dateFromNumber(value);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return date ? `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}` : "";
}

/** The stored date value of a date input's `YYYY-MM-DD`; null until it holds a whole, real date. */
export function numberFromIso(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const value = Number(match[1]) * 10_000 + Number(match[2]) * 100 + Number(match[3]);
  return dateFromNumber(value) ? value : null;
}

/**
 * Works out a mass edit: `operations` on every player, member of staff or club that `query` and the entity's
 * filter in `filters` select, from the values the game holds now. Nothing is written until `applyMassEdit`.
 */
export const planMassEdit = (entity: Entity, query: string, filters: MassFilters, operations: MassOperation[]) =>
  call<MassPreview>("plan_mass_edit", { entity, query, filters, operations });

/** Writes the mass edit previewed as `id`, exactly as shown; each change only if the value is still the one previewed. */
export const applyMassEdit = (id: number) => call<MassReport>("apply_mass_edit", { id });

/** Undoes every change of a mass edit that is not undone yet. */
export const undoBatch = (batch: number) => call<BatchUndo>("undo_batch", { batch });

/**
 * Checks that the player `uid` can move to the club `club` on `terms`, and names both clubs. Nothing is written;
 * when he cannot move, the error says why (a loan, a club a human manager runs, a squad list with no room, ...).
 */
export const planClubMove = (uid: number, club: number, terms: MoveTerms, fee?: number) =>
  call<MovePreview>("plan_club_move", { uid, club, terms, fee });

/**
 * Checks that the player `uid` can be released from his club, and names it. Nothing is written; when he cannot be
 * released, the error says why (a loan, a club a human manager runs, ...).
 */
export const planRelease = (uid: number) => call<MovePreview["from"]>("plan_release", { uid });

/**
 * Releases the player from his club, which leaves him a free agent: logged as a change of his `club` to 0, and undone
 * like a move.
 */
export const releasePlayer = (uid: number) => call<LoggedChange>("release_player", { uid });

/**
 * Points the player's tie `index` at another nation or club (by UID), and gives a training another homegrown rule;
 * what is left out stays. Logged and undone like any change.
 */
export const changeTie = (uid: number, index: number, change: { nation?: number; club?: number; rule?: number }) =>
  call<LoggedChange>("change_tie", { uid, index, ...change });

/**
 * Gives the clause `index` of the player's contract another amount (pounds) or condition; what is left out stays, and
 * only what the clause has can be changed. Logged and undone like any change.
 */
export const changeClause = (uid: number, index: number, change: { amount?: number; condition?: number }) =>
  call<LoggedChange>("change_clause", { uid, index, ...change });

/** Takes the clause `index` out of the player's contract. Logged and undone like any change. */
export const removeClause = (uid: number, index: number) => call<LoggedChange>("remove_clause", { uid, index });

/**
 * Gives the player's contract, which has none, a release clause of `amount` pounds, where its list has room (see
 * `PlayerDetails.clauseRoom`). Logged and undone like any change.
 */
export const addReleaseClause = (uid: number, amount: number) =>
  call<LoggedChange>("add_release_clause", { uid, amount });

/** Takes the player's tie `index` out of his list. Logged and undone like any change. */
export const removeTie = (uid: number, index: number) => call<LoggedChange>("remove_tie", { uid, index });

/**
 * Gives the player a tie to the nation or club with the UID `target`, under the homegrown rule `rule` for a training,
 * where his list has room (see `PlayerDetails.tieRoom`). Logged and undone like any change.
 */
export const addTie = (uid: number, tie: TieKind, target: number, rule?: number) =>
  call<LoggedChange>("add_tie", { uid, tie, target, rule });

/**
 * Gives the preference `index` of the player `uid`, or of the member of staff `uid` for `staff`, the strength
 * `strength`, 1 to 100.
 */
export const changePreference = (uid: number, staff: boolean, index: number, strength: number) =>
  call<LoggedChange>("change_preference", { uid, staff, index, strength });

/** What a preference can be pointed at: a club, for a club one, or a player or member of staff, for a person one. */
export type PreferenceTargetKind = "club" | "player" | "staff";

/**
 * Points the preference `index` of the player `uid`, or of the member of staff `uid` for `staff`, at the club, player
 * or member of staff `targetUid`, keeping its strength.
 */
export const pointPreference = (
  uid: number,
  staff: boolean,
  index: number,
  targetKind: PreferenceTargetKind,
  targetUid: number,
) => call<LoggedChange>("point_preference", { uid, staff, index, targetKind, targetUid });

/** Takes the preference `index` out of the list of the player `uid`, or of the member of staff `uid` for `staff`. */
export const removePreference = (uid: number, staff: boolean, index: number) =>
  call<LoggedChange>("remove_preference", { uid, staff, index });

/** Gives the language `index` of the player `uid`, or of the member of staff `uid` for `staff`, the level `level`, 1 to 10. */
export const changeLanguage = (uid: number, staff: boolean, index: number, level: number) =>
  call<LoggedChange>("change_language", { uid, staff, index, level });

/** Takes the language `index` out of the list of the player `uid`, or of the member of staff `uid` for `staff`. */
export const removeLanguage = (uid: number, staff: boolean, index: number) =>
  call<LoggedChange>("remove_language", { uid, staff, index });

/** The homegrown rules `changeTie` and `addTie` write, by the game's code. */
export const homegrownRules = () => call<number[]>("homegrown_rules");

/** Checks that the member of staff can move to the club, and names the clubs; the error says why he cannot. */
export const planStaffMove = (uid: number, club: number) => call<MovePreview>("plan_staff_move", { uid, club });

/** Moves the member of staff to the club, in the departments he works in; logged and undone like any change. */
export const moveStaff = (uid: number, club: number) => call<LoggedChange>("move_staff", { uid, club });

/** Checks the human manager can be made the manager of the club, and names who it dismisses. Nothing is written. */
export const planManagerMove = (uid: number, club: number) => call<ManagerPreview>("plan_manager_move", { uid, club });

/** Has the game make the human manager the club's manager, as its own editor does; logged, with no undo. */
export const moveManager = (uid: number, club: number) => call<LoggedChange>("move_manager", { uid, club });

/** Gives the member of staff another job at his club (a contract code); logged and undone like any change. */
export const changeStaffJob = (uid: number, job: number) => call<LoggedChange>("change_staff_job", { uid, job });

/** The jobs `changeStaffJob` gives, by contract code. */
export const staffJobs = () => call<number[]>("staff_jobs");

/** Moves the player to the senior team of the club on `terms`; the move is logged and undone like any change. */
export const movePlayer = (uid: number, club: number, terms: MoveTerms, fee?: number) =>
  call<LoggedChange>("move_player", { uid, club, terms, fee });

/**
 * Checks that the players `uid` and `other` can swap clubs, each joining the other's senior team on his own contract,
 * and names the clubs (`from` is the club of `uid`). Nothing is written; when they cannot, the error says why.
 */
export const planClubSwap = (uid: number, other: number) => call<MovePreview>("plan_club_swap", { uid, other });

/** Swaps the clubs of two players; logged as one change of the first player's club, undone as one. */
export const swapPlayers = (uid: number, other: number) => call<LoggedChange>("swap_players", { uid, other });

/**
 * Heals every current injury of the player, as the game does when he gets over them. Logged as one change of his
 * field `injuries` from how many he had to 0, and undone as one; fails when he has none.
 */
export const healPlayer = (uid: number) => call<LoggedChange>("heal_player", { uid });
/** Makes the injury `index` of the player `uid` last `days` days from when it began, at the most: 1 to 730. */
export const changeInjury = (uid: number, index: number, days: number) =>
  call<LoggedChange>("change_injury", { uid, index, days });
/** Takes the injury `index` out of the list of the player `uid`; his others stay. */
export const removeInjury = (uid: number, index: number) => call<LoggedChange>("remove_injury", { uid, index });

/** Closes the open promise at `index` in the promises of the player `uid`. */
export const closePromise = (uid: number, index: number, promise: PlayerPromise) =>
  call<LoggedChange>("close_promise", { uid, index, promise });

/** The kinds of injury the game knows, in its order. */
export const injuryKinds = () => call<InjuryKind[]>("injury_kinds");

/** Has the game give the player an injury of the kind with UID `kind`; it picks how long it lasts. */
export const addInjury = (uid: number, kind: number) => call<LoggedChange>("add_injury", { uid, kind });

/** Has the game grant the player a work permit for his club's country, or take it away. */
export const setWorkPermit = (uid: number, granted: boolean) =>
  call<LoggedChange>("set_work_permit", { uid, granted });

/** Has the game loan the player to the senior team of `club` from today until `ends` (a number like 20270630). */
export const startLoan = (uid: number, club: number, ends: number) =>
  call<LoggedChange>("start_loan", { uid, club, ends });

/** The clubs the player's loan would end between: the one he is loaned to, then his own. Only reads. */
export const planEndLoan = (uid: number) => call<MovePreview>("plan_end_loan", { uid });

/** Has the game end the player's loan today: he goes back to his own club. */
export const endLoan = (uid: number) => call<LoggedChange>("end_loan", { uid });

/** The moves FM agreed for the player on a later day, as cancelling them finds them; rejects when they cannot be. */
export const planCancelFutureTransfers = (uid: number) =>
  call<FutureTransfer[]>("plan_cancel_future_transfers", { uid });

/** Has the game cancel every move it agreed for the player on a later day. Nothing undoes it. */
export const cancelFutureTransfers = (uid: number) => call<LoggedChange[]>("cancel_future_transfers", { uid });

/** Has the game sign the free agent for the senior team of `club` on its own terms; `terms` then replace them. */
export const signFreeAgent = (uid: number, club: number, terms: MoveTerms) =>
  call<LoggedChange>("sign_free_agent", { uid, club, terms });

/** Has the game agree the free agent's signing for the senior team of `club` today, to join it on `joins` (yyyymmdd). */
export const signFreeAgentLater = (uid: number, club: number, joins: number) =>
  call<LoggedChange>("sign_free_agent_later", { uid, club, joins });

/**
 * Lifts every current ban of the player, as the game does once he has served them; his other absences stay. Logged
 * as one change of his field `bans` from how many he had to 0, and undone as one; fails when he has none.
 */
export const liftBans = (uid: number) => call<LoggedChange>("lift_bans", { uid });

/**
 * Keeps the player from retiring: the retirement the game has planned for him is taken out of its plans, and he gets
 * the trait "Will play football as long as possible" in place of "Will retire at top". Logged as one change of his
 * field `retirement` to 0, and undone as one; fails with "retirement.none" when there is nothing to change.
 */
export const keepPlaying = (uid: number) => call<LoggedChange>("keep_playing", { uid });

/** The teams of a club, the senior team first, with their players and the live values a squad screen shows. */
export const clubSquads = (uid: number) => call<ClubTeam[]>("club_squads", { uid });

/**
 * Makes the player `uid` the captain or vice-captain of the club's team `team` (see `ClubTeam.index`); he must play
 * for that team. When he held the other role, the two captains swap. Logged with `captaincy` and undone as one change.
 * Fails with "captain.notInTeam" or "captain.unchanged".
 */
export const setCaptain = (club: number, team: number, role: CaptainRole, uid: number) =>
  call<LoggedChange>("set_captain", { club, team, role, uid });

/**
 * Does `action` to every player of the club's team `team`, those out on loan too. The changes are logged as one
 * batch, undone with `undoBatch`; `applied` counts the changes (an injured player healed counts once).
 */
export const teamAction = (club: number, team: number, action: TeamAction) =>
  call<MassReport>("team_action", { club, team, action });
