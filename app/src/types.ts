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
  loadMs: number;
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
