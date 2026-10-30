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
