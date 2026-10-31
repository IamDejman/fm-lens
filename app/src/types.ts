// Shapes returned by the Rust commands in src-tauri/src/lib.rs.

export type Storefront = "gamePass" | "steam" | "epic" | "unknown";

export interface GameInfo {
  pid: number;
  exePath: string;
  storefront: Storefront;
  edition: number | null;
  packageFullName: string | null;
  packageVersion: string | null;
}

/**
 * How a Rust command fails: a code such as "edit.outOfRange", the values its message names, and the message in
 * English. `describeError` (format.ts) words it in the language of the window.
 */
export interface Failure {
  code: string;
  params: Record<string, string>;
  message: string;
}

export interface DetectedGame {
  pid: number;
  info: GameInfo | null;
  pluginLoaded: boolean;
  error: Failure | null;
}

export interface Detection {
  elevated: boolean;
  games: DetectedGame[];
}

export interface ArrayRef {
  pairRva: number;
  count: number;
  confidence: number;
}

export interface EntityArrays {
  players: ArrayRef | null;
  staff: ArrayRef | null;
  clubs: ArrayRef | null;
  fromProfile: boolean;
}

export interface ConnectionInfo {
  game: GameInfo;
  profile: string | null;
  arrays: EntityArrays;
  players: number;
  staff: number;
  clubs: number;
  /** Current in-game date, when it could be read. */
  gameDate: FmDate | null;
  loadMs: number;
  /** Whether Windows let the app open the game for writing; without it nothing can be edited. */
  editable: boolean;
}

export interface ReloadInfo {
  players: number;
  staff: number;
  clubs: number;
  gameDate: FmDate | null;
}

export interface ClubSummary {
  uid: number;
  /** Full name, e.g. "Tottenham Hotspur". */
  name: string;
  shortName: string | null;
  /** A women's club. */
  women: boolean;
  /** 0–10000. */
  reputation: number | null;
  founded: number | null;
}

export interface ClubPage {
  total: number;
  rows: ClubSummary[];
}

export interface Finances {
  /** Pounds. */
  balance: number;
  /** Pounds. */
  transferBudget: number;
  /** Pounds per week. */
  wageBudget: number;
  /** Pounds per week. */
  totalWageBudget: number;
  /** Average match ticket, pounds. */
  ticketPrice: number;
}

export interface ClubDetails extends ClubSummary {
  seasonTickets: number | null;
  socialMedia: number | null;
  /** hardcore, core, family, fair_weather, casual, other → percent; empty when unknown. */
  supporterMix: Record<string, number>;
  /** loyalty, passion, patience, affluence, temperament, expectations → 1–20; empty when unknown. */
  supporterTraits: Record<string, number>;
  /** training, youth_facilities, youth_coaching, youth_recruitment and (with finances) corporate → 1–20. */
  facilities: Record<string, number>;
  /** Only clubs in the leagues being played have finances. */
  finances: Finances | null;
}

/** A manager, coach, scout, director or other non-playing person. */
export interface StaffSummary {
  uid: number;
  name: string;
  fullName: string | null;
  dateOfBirth: FmDate | null;
  age: number | null;
  nation: string | null;
  /** The nation's UID, for its flag (see pictures.ts). */
  nationUid: number | null;
  /** The employer. */
  club: string | null;
  /** The employer's UID, for its logo (see pictures.ts). */
  clubUid: number | null;
  /** FM job code from the contract; see `jobLabel` in labels.ts. */
  job: number | null;
  currentAbility: number;
  potentialAbility: number;
  /** The manager the user controls in this save. */
  isHuman: boolean;
}

export interface StaffPage {
  total: number;
  rows: StaffSummary[];
}

export interface StaffContract {
  /** Pounds per week. */
  wage: number;
  signed: FmDate | null;
  expires: FmDate | null;
  joined: FmDate | null;
  job: number;
}

export interface StaffDetails extends StaffSummary {
  reputation: Reputation;
  /** Same keys as a player's personality. */
  personality: Record<string, number>;
  /**
   * attacking, defending, fitness, goalkeeping, possession, set_pieces, tactical, technical,
   * working_with_youngsters, authority, determination, motivating, people_management,
   * data_analysis, judging_ability, judging_potential, judging_staff, negotiating,
   * tactical_knowledge, physiotherapy, sports_science → raw and shown value (1–20).
   */
  attributes: Record<string, Attribute>;
  contract: StaffContract | null;
}

export interface FmDate {
  year: number;
  month: number;
  day: number;
}

export interface PlayerSummary {
  uid: number;
  name: string;
  fullName: string | null;
  dateOfBirth: FmDate | null;
  /** Age on the in-game date. */
  age: number | null;
  nation: string | null;
  /** The nation's UID, for its flag (see pictures.ts). */
  nationUid: number | null;
  club: string | null;
  /** The club's UID, for its logo (see pictures.ts). */
  clubUid: number | null;
  /** Position keys rated 15 or more, best first. */
  positions: string[];
  contractExpires: FmDate | null;
  currentAbility: number;
  potentialAbility: number;
}

export interface PlayerPage {
  total: number;
  rows: PlayerSummary[];
}

/** Filters for `search_players`; omitted fields match everyone. */
export interface PlayerFilter {
  /** A position key (gk, sw, dl, dc, dr, dm, ml, mc, mr, aml, amc, amr, st, wbl, wbr); rated 15+ there. */
  position?: string;
  minAge?: number;
  maxAge?: number;
  minCurrentAbility?: number;
  minPotentialAbility?: number;
  /** Part of the nation's name; accents and case ignored. */
  nation?: string;
  /** Part of the club's name; accents and case ignored. */
  club?: string;
  /** Only players of the club with this UID, e.g. those a player can swap with. */
  clubUid?: number;
  /** Only players without a club. */
  freeAgents?: boolean;
  /** Only contracts ending on or before this date. */
  contractExpiresBy?: FmDate;
}

export type PlayerSort =
  | "currentAbility"
  | "potentialAbility"
  | "age"
  | "name"
  | "nation"
  | "club"
  | "contractExpires";

/** Sort order for `search_players`; without one, results are by current ability, highest first. */
export interface PlayerOrder {
  by: PlayerSort;
  ascending: boolean;
}

/** Filters for `search_staff`. */
export interface StaffFilter {
  /** Job code (see `jobLabel`); its player-coach variant matches too. */
  job?: number;
  /** Only staff without a contract. */
  unemployed?: boolean;
}

/** Filters for `search_clubs`. */
export interface ClubFilter {
  /** true: women's clubs only; false: men's clubs only. */
  women?: boolean;
}

/** An attribute as stored (`raw`, 0–100) and as FM shows it (`value`, 1–20). */
export interface Attribute {
  raw: number;
  value: number;
}

export interface Reputation {
  home: number;
  current: number;
  world: number;
}

export interface International {
  caps: number;
  goals: number;
  u21Caps: number;
  u21Goals: number;
}

export interface Contract {
  /** Pounds per week. */
  wage: number;
  signed: FmDate | null;
  expires: FmDate | null;
  joined: FmDate | null;
  squadStatus: number;
  squadNumber: number | null;
  transferListed: boolean;
  loanListed: boolean;
}

/** A row of the list and more. */
export interface PlayerDetails extends PlayerSummary {
  heightCm: number;
  /** Pounds; null when the club has not set one. */
  askingPrice: number | null;
  reputation: Reputation;
  international: International;
  /** gk, sw, dl, dc, dr, dm, ml, mc, mr, aml, amc, amr, st, wbl, wbr → 1–20 */
  positionRatings: Record<string, number>;
  /** adaptability, ambition, loyalty, pressure, professionalism, sportsmanship, temperament, controversy → 1–20 */
  personality: Record<string, number>;
  /** Attribute key (e.g. "first_touch") → raw and shown value. */
  attributes: Record<string, Attribute>;
  contract: Contract | null;
  /** Energy ("condition") and match sharpness, 0–10000 for 0–100%: what the game changes every day. */
  condition: number;
  matchSharpness: number;
  /**
   * 1–20: his morale, which the game shows as his overall happiness ("Memnun" at 10, "Biraz Mutlu" at 11, "Aşırı
   * Mutlu" at 15 and 20 in the Turkish game) and FM Live Editor as morale ("Okay" at 10, "Very Good" at 15).
   */
  morale: number;
  /** His current injuries; empty when he has none. */
  injuries: Injury[];
}

/** One current injury of a player. */
export interface Injury {
  /** The game's name for it, in the game's language; null when it could not be read. */
  name: string | null;
  started: FmDate | null;
  /** When he is expected back, at the soonest and at the latest. */
  backSoonest: FmDate | null;
  backLatest: FmDate | null;
}

/** What an edit is for. */
export type Entity = "player" | "staff" | "club";

/** A value of a player, member of staff or club that the editor can change, from `edit_fields`. */
export interface EditField {
  /**
   * People: "current_ability", "potential_ability", "height", "reputation.home", "international.caps",
   * "attribute.finishing", "position.st", "personality.ambition", "contract.wage", "contract.expires".
   * Players only: "contract.squad_number", "contract.squad_status", "contract.transfer_listed",
   * "contract.loan_listed".
   * Clubs: "reputation", "facilities.training", "facilities.youth_facilities", "facilities.youth_coaching",
   * "facilities.youth_recruitment", "facilities.corporate", "finance.balance", "finance.transfer_budget",
   * "finance.wage_budget", "finance.total_wage_budget".
   */
  key: string;
  entity: Entity;
  /**
   * "date": values are numbers like 20290630 (see `dateFromNumber` in editing.ts); "i32": money in pounds; "flag":
   * 0 or 1, a yes-or-no such as being on the transfer list.
   */
  kind: "u8" | "u16" | "i16" | "i32" | "date" | "flag";
  /**
   * "attribute": stored 0–100, shown 1–20 (see `shownValue` in editing.ts); "percent": stored 0–10000, shown as a
   * percentage 0–100; "plain": shown as stored.
   */
  scale: "plain" | "attribute" | "percent";
  /** Smallest stored value the editor writes. */
  min: number;
  /** Largest stored value the editor writes. */
  max: number;
  /** A stored value meaning "none" that the field may also be set to, such as 255 for no squad number. */
  blank: number | null;
  /**
   * The only values the field takes, in the order to offer them, when it holds a code from a list (a squad status,
   * named by `squadStatusName`); null for any value of its range.
   */
  choices: number[] | null;
  /** Whether a mass edit may change the field; some are changed one person at a time. */
  mass: boolean;
}

/**
 * Field key → value as stored, from `read_values`. Only fields that can be edited now are there: no contract
 * fields without a contract, no contract end the game has not set, no finances for a club without full finances.
 */
export type FieldValues = Record<string, number>;

/** One value to write, as stored. */
export interface FieldEdit {
  field: string;
  value: number;
}

/** A change written to the game this session, from `apply_edits` and `change_log`. */
export interface LoggedChange {
  id: number;
  /** When it was written, in milliseconds since 1970. */
  at: number;
  /** The person's name when it was written. */
  name: string;
  entity: Entity;
  uid: number;
  /** The field's key. */
  field: string;
  /** The value before, as stored. */
  old: number;
  /** The value written, as stored. */
  new: number;
  /** When it was undone, if it was. */
  undoneAt: number | null;
  /** The mass edit it was part of (see `undo_batch`); null for an edit made in a profile. */
  batch: number | null;
  // Healing (`heal_player`) is logged as a change of the player's field "injuries" from how many he had to 0.
  /**
   * Set for a move to another club, which is logged as a change of the player's field `club` whose old and new
   * values are the clubs' UIDs: the clubs' names.
   */
  moved?: {
    from: string;
    to: string;
    /** For a swap of two players, logged as one change, the player who went the other way. */
    with?: string;
  };
  /**
   * Set for a captaincy (`set_captain`), which is logged as a change of the club's field `captain` or
   * `vice_captain` whose old and new values are the players' UIDs (0 for nobody); `name` is the club's.
   */
  captaincy?: {
    /** Where the team is in the club's list of teams (see `ClubTeam.index`). */
    team: number;
    /** The team's kind and age limit, to name it by like a `ClubTeam`. */
    kind: number;
    ageLimit: number | null;
    /** Who held the role (null for nobody), and who took it. */
    from: string | null;
    to: string;
    /** Whether the player who took the role held the other one, which `from` now holds. */
    swapped: boolean;
  };
}

/** One of a club's teams as its squad screen shows it, from `club_squads`; the senior team comes first. */
export interface ClubTeam {
  /** Where it is in the club's list of teams; 0 is the senior team. */
  index: number;
  /**
   * The game's code for the kind of team. Seen on the test save: 0 the first team, 3 a B team (Juventus Next Gen),
   * 10 under-21s, 18 under-20s, 12 under-18s. Name a team by its `ageLimit` where it has one.
   */
  kind: number;
  /** The oldest its players may be, e.g. 21; null for a team without a limit. */
  ageLimit: number | null;
  /** UIDs of the captain and the vice-captain; null when the team has none. */
  captain: number | null;
  viceCaptain: number | null;
  players: SquadPlayer[];
}

/** A player in a team's list: his list row and the live values a squad screen shows. */
export interface SquadPlayer extends PlayerSummary {
  /** Whether he plays for this team; one under contract with it may play for another team of the club, or on loan. */
  playsHere: boolean;
  /** "in": here on loan from another club; "out": on loan to another club; null when he is not on loan. */
  loan: "in" | "out" | null;
  /** As stored, like `PlayerDetails`: energy and match sharpness 0–10000, morale 1–20. */
  condition: number;
  matchSharpness: number;
  morale: number;
  /** How many current injuries he has. */
  injuries: number;
}

/** A team's two captaincies. */
export type CaptainRole = "captain" | "viceCaptain";

/**
 * What a team-wide action does to every player of the team, those out on loan too: "heal" heals every injury,
 * "inspire" sets morale to 20, "refresh" sets energy and match sharpness to 100%.
 */
export type TeamAction = "heal" | "inspire" | "refresh";

/** The columns that sort a squad table. */
export type SquadSort =
  | "name"
  | "position"
  | "age"
  | "currentAbility"
  | "potentialAbility"
  | "condition"
  | "matchSharpness"
  | "morale";

/** The contract a move to another club gives the player, as stored; what is left out stays as it is. */
export interface MoveTerms {
  /** Pounds per week. */
  wage?: number;
  /** A date as a number like 20290630; it must come after the game's date. */
  expires?: number;
}

/** From `plan_club_move`: the move can be made, between these clubs. */
export interface MovePreview {
  from: { uid: number; name: string };
  to: { uid: number; name: string };
}

/** An edit `apply_edits` refused; it changed nothing. */
export interface FailedEdit {
  field: string;
  value: number;
  /** Why, e.g. that 250 is not a current ability, which takes 1 to 200. */
  error: Failure;
}

export interface ApplyReport {
  applied: LoggedChange[];
  failed: FailedEdit[];
}

/** What a mass edit does to a field. Values are as stored, like every edit's. */
export type MassOperationKind =
  | { op: "set"; value: number }
  /** May be negative; the result stays within the field's range. */
  | { op: "add"; amount: number }
  /** Multiplies by percent / 100, rounded; the result stays within the field's range. */
  | { op: "scale"; percent: number };

/** One field of a mass edit and what to do with it. Dates can only be set. */
export interface MassOperation {
  field: string;
  operation: MassOperationKind;
}

/** The filter of the list a mass edit applies to; only the one for its entity is used. */
export interface MassFilters {
  playerFilter?: PlayerFilter;
  staffFilter?: StaffFilter;
  clubFilter?: ClubFilter;
}

/** A change a mass edit would write: as stored. */
export interface PlannedChange {
  uid: number;
  name: string;
  field: string;
  old: number;
  new: number;
}

/** A value a mass edit leaves alone, and why (no contract, not set, not plausible, ...). */
export interface SkippedField {
  uid: number;
  name: string;
  field: string;
  /** Why, in English; `code` and `params` say it in the window's language, as a `Failure` would. */
  reason: string;
  code: string;
  params: Record<string, string>;
}

/** From `plan_mass_edit`: what applying would change. Nothing is written yet. */
export interface MassPreview {
  /** Pass to `apply_mass_edit` to write exactly these changes. */
  id: number;
  /** How many players, staff or clubs the search and filter selected. */
  targets: number;
  /** How many of them already have the values the edit would give them. */
  unchanged: number;
  /** How many values would change, in all. */
  changes: number;
  /** The first 500 changes. */
  rows: PlannedChange[];
  /** How many values are left alone, in all. */
  skippedCount: number;
  /** The first 500 of them. */
  skipped: SkippedField[];
}

/** From `apply_mass_edit`. */
export interface MassReport {
  /** The batch the changes are logged under; `undo_batch` undoes them together. */
  batch: number;
  applied: number;
  /** Changes not written, e.g. because the game changed the value after the preview. */
  failed: { uid: number; name: string; field: string; error: Failure }[];
}

/** From `undo_batch`. */
export interface BatchUndo {
  undone: number;
  /** Changes the game has changed since, left as they are. */
  failed: { id: number; error: Failure }[];
}

/** How many pictures of each kind the graphics packs hold. */
export interface GraphicsCounts {
  clubLogos: number;
  faces: number;
  flags: number;
  competitionLogos: number;
}

/** From `graphics_info`: the user's graphics packs, read once in the background when the app starts. */
export interface GraphicsInfo {
  /** The folder they are read from, e.g. Documents\Sports Interactive\Football Manager 27\graphics. */
  root: string | null;
  /** False while the packs are still being read. */
  ready: boolean;
  counts: GraphicsCounts;
}
