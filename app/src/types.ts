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

export interface DetectedGame {
  pid: number;
  info: GameInfo | null;
  pluginLoaded: boolean;
  error: string | null;
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
  /** The employer. */
  club: string | null;
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
  club: string | null;
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
}

/** Whom an edit is for. */
export type Entity = "player" | "staff";

/** A value of a player or member of staff that the editor can change, from `edit_fields`. */
export interface EditField {
  /**
   * E.g. "current_ability", "potential_ability", "height", "reputation.home", "international.caps",
   * "attribute.finishing", "position.st", "personality.ambition".
   */
  key: string;
  entity: Entity;
  kind: "u8" | "u16" | "i16";
  /** "attribute": stored 0–100, shown 1–20 (see `shownValue` in editing.ts); "plain": shown as stored. */
  scale: "plain" | "attribute";
  /** Smallest stored value the editor writes. */
  min: number;
  /** Largest stored value the editor writes. */
  max: number;
}

/** Field key → value as stored, from `read_values`. */
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
}

/** An edit `apply_edits` refused; it changed nothing. */
export interface FailedEdit {
  field: string;
  value: number;
  /** Why, e.g. "250 is not a valid current_ability; it takes 1 to 200". */
  error: string;
}

export interface ApplyReport {
  applied: LoggedChange[];
  failed: FailedEdit[];
}
