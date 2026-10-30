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
  /** Current in-game date, when it could be read. */
  gameDate: FmDate | null;
  loadMs: number;
}

export interface ReloadInfo {
  players: number;
  staff: number;
  gameDate: FmDate | null;
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
  currentAbility: number;
  potentialAbility: number;
}

export interface PlayerPage {
  total: number;
  rows: PlayerSummary[];
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

export interface PlayerDetails extends PlayerSummary {
  heightCm: number;
  /** Pounds; null when the club has not set one. */
  askingPrice: number | null;
  reputation: Reputation;
  international: International;
  /** gk, sw, dl, dc, dr, dm, ml, mc, mr, aml, amc, amr, st, wbl, wbr → 1–20 */
  positions: Record<string, number>;
  /** adaptability, ambition, loyalty, pressure, professionalism, sportsmanship, temperament, controversy → 1–20 */
  personality: Record<string, number>;
  /** Attribute key (e.g. "first_touch") → raw and shown value. */
  attributes: Record<string, Attribute>;
  contract: Contract | null;
}
