// Stand-ins for the Rust commands so the UI can be developed in a plain browser
// (`npm run dev`) without the game or Tauri. Every player here is made up.

import { fold } from "../format";
import type {
  ClubDetails,
  ClubPage,
  ClubSummary,
  ConnectionInfo,
  Detection,
  FmDate,
  GameInfo,
  PlayerDetails,
  PlayerPage,
  PlayerSummary,
  ReloadInfo,
  StaffDetails,
  StaffPage,
  StaffSummary,
} from "../types";

const GAME_DATE: FmDate = { year: 2026, month: 7, day: 18 };

const game: GameInfo = {
  pid: 4242,
  exePath: "D:\\Games\\Football Manager 27\\Content\\fm.exe",
  storefront: "gamePass",
  edition: 27,
  packageFullName: "SportsInteractive.FootballManager27_0.9.2355.0_x64__5w3tn6tb6stnm",
  packageVersion: "0.9.2355.0",
};

const FIRST = ["Arda", "Mateo", "Lukas", "Kerem", "Jonas", "Rafael", "Emre", "Noah", "Tiago", "Søren", "Ilkay", "Bruno"];
const LAST = ["Yılmaz", "Fernández", "Hoffmann", "Aydın", "Lindqvist", "Moreau", "Çelik", "Kowalski", "Silva", "Novák"];
const NATIONS = ["Türkiye", "Spain", "Germany", "Brazil", "Denmark", "France", "Poland", "Portugal", "Czechia"];
const CLUBS = ["Northbridge FC", "Atlético Riverside", "Sporting Harbour", "FC Lindenau", "Kuzey Spor", "Old Mill United"];

/** Small deterministic generator so the fixtures look the same on every reload. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const players: PlayerSummary[] = (() => {
  const next = random(27);
  const pick = <T,>(items: T[]) => items[Math.floor(next() * items.length)];
  return Array.from({ length: 400 }, (_, i) => {
    const ca = Math.round(40 + next() * 150);
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const born: FmDate = { year: 1988 + Math.floor(next() * 20), month: 1 + Math.floor(next() * 12), day: 1 + Math.floor(next() * 28) };
    return {
      uid: 1_000_000 + i * 37,
      name,
      fullName: next() < 0.3 ? `${name} ${pick(LAST)}` : null,
      dateOfBirth: born,
      age: GAME_DATE.year - born.year - (GAME_DATE.month * 100 + GAME_DATE.day < born.month * 100 + born.day ? 1 : 0),
      nation: pick(NATIONS),
      club: next() < 0.9 ? pick(CLUBS) : null,
      currentAbility: ca,
      potentialAbility: Math.min(200, ca + Math.round(next() * 40)),
    };
  });
})();

const ATTRIBUTES = [
  "corners", "crossing", "dribbling", "finishing", "first_touch", "free_kicks", "heading", "long_shots",
  "long_throws", "marking", "passing", "penalty_taking", "tackling", "technique", "aggression", "anticipation",
  "bravery", "composure", "concentration", "decisions", "determination", "flair", "leadership", "off_the_ball",
  "positioning", "teamwork", "vision", "work_rate", "acceleration", "agility", "balance", "jumping_reach",
  "natural_fitness", "pace", "stamina", "strength", "aerial_reach", "command_of_area", "communication",
  "eccentricity", "handling", "kicking", "one_on_ones", "punching", "reflexes", "rushing_out", "throwing",
  "consistency", "dirtiness", "important_matches", "injury_proneness", "versatility", "left_foot", "right_foot",
];
const GK_ONLY = new Set([
  "aerial_reach", "command_of_area", "communication", "eccentricity", "handling", "kicking", "one_on_ones",
  "punching", "reflexes", "rushing_out", "throwing",
]);
const POSITIONS = ["gk", "sw", "dl", "dc", "dr", "dm", "ml", "mc", "mr", "aml", "amc", "amr", "st", "wbl", "wbr"];
const PERSONALITY = [
  "adaptability", "ambition", "loyalty", "pressure", "professionalism", "sportsmanship", "temperament", "controversy",
];

/** Made-up but self-consistent profile for a fixture player. */
function details(player: PlayerSummary): PlayerDetails {
  const next = random(player.uid);
  const keeper = player.uid % 11 === 0;
  const level = player.currentAbility / 2; // raw attribute centre, 0–100
  const attributes = Object.fromEntries(
    ATTRIBUTES.map((key) => {
      const centre = GK_ONLY.has(key) !== keeper ? 12 : level;
      const raw = Math.max(1, Math.min(100, Math.round(centre + (next() - 0.5) * 40)));
      return [key, { raw, value: Math.max(1, Math.min(20, Math.floor((raw + 2) / 5))) }];
    }),
  );
  const natural = keeper ? "gk" : POSITIONS[1 + Math.floor(next() * (POSITIONS.length - 1))];
  const positions = Object.fromEntries(
    POSITIONS.map((key) => [key, key === natural ? 20 : keeper || key === "gk" ? 1 : Math.round(1 + next() * 16)]),
  );
  const personality = Object.fromEntries(PERSONALITY.map((key) => [key, Math.round(1 + next() * 19)]));
  return {
    ...player,
    heightCm: Math.round(168 + next() * 26),
    askingPrice: next() < 0.2 ? Math.round(next() * 40) * 1_000_000 : null,
    reputation: { home: Math.round(next() * 10000), current: Math.round(next() * 10000), world: Math.round(next() * 10000) },
    international: { caps: Math.round(next() * 90), goals: Math.round(next() * 30), u21Caps: Math.round(next() * 20), u21Goals: Math.round(next() * 8) },
    positions,
    personality,
    attributes,
    contract: player.club
      ? {
          wage: Math.round(player.currentAbility * 900 + next() * 20000),
          signed: { year: 2024, month: 7, day: 1 },
          expires: { year: 2027 + Math.floor(next() * 4), month: 6, day: 30 },
          joined: { year: 2022, month: 8, day: 15 },
          squadStatus: 1 + Math.floor(next() * 5),
          squadNumber: 1 + Math.floor(next() * 40),
          transferListed: next() < 0.1,
          loanListed: false,
        }
      : null,
  };
}

/** Job codes as stored in contracts (see labels.ts). */
const JOBS = [16, 20, 2, 2, 2, 34, 26, 14, 14, 44, 12, 60, 64, 88];
const STAFF_ATTRIBUTES = [
  "attacking", "defending", "fitness", "goalkeeping", "possession", "set_pieces", "tactical", "technical",
  "determination", "motivating", "people_management", "data_analysis", "judging_ability", "judging_potential",
  "judging_staff", "negotiating", "tactical_knowledge", "physiotherapy", "sports_science",
];
const STAFF_RATINGS = ["working_with_youngsters", "authority"];

const staff: StaffSummary[] = (() => {
  const next = random(1984);
  const pick = <T,>(items: T[]) => items[Math.floor(next() * items.length)];
  return Array.from({ length: 120 }, (_, i) => {
    const born: FmDate = { year: 1955 + Math.floor(next() * 40), month: 1 + Math.floor(next() * 12), day: 1 + Math.floor(next() * 28) };
    const ca = Math.round(40 + next() * 140);
    const employed = i === 0 || next() < 0.85;
    return {
      uid: 2_000_000 + i * 53,
      name: `${pick(FIRST)} ${pick(LAST)}`,
      fullName: null,
      dateOfBirth: born,
      age: GAME_DATE.year - born.year - (GAME_DATE.month * 100 + GAME_DATE.day < born.month * 100 + born.day ? 1 : 0),
      nation: pick(NATIONS),
      club: employed ? pick(CLUBS) : null,
      job: i === 0 ? 16 : employed ? pick(JOBS) : null,
      currentAbility: ca,
      potentialAbility: Math.min(200, ca + Math.round(next() * 30)),
      isHuman: i === 0,
    };
  });
})();

/** Made-up but self-consistent profile for a fixture member of staff. */
function staffDetails(member: StaffSummary): StaffDetails {
  const next = random(member.uid);
  const level = member.currentAbility / 2;
  const attributes = Object.fromEntries([
    ...STAFF_ATTRIBUTES.map((key) => {
      const raw = Math.max(1, Math.min(100, Math.round(level + (next() - 0.5) * 50)));
      return [key, { raw, value: Math.max(1, Math.min(20, Math.floor((raw + 2) / 5))) }];
    }),
    ...STAFF_RATINGS.map((key) => {
      const value = Math.round(1 + next() * 19);
      return [key, { raw: value, value }];
    }),
  ]);
  const personality = Object.fromEntries(PERSONALITY.map((key) => [key, Math.round(1 + next() * 19)]));
  return {
    ...member,
    reputation: { home: Math.round(next() * 10000), current: Math.round(next() * 10000), world: Math.round(next() * 10000) },
    personality,
    attributes,
    contract:
      member.job === null
        ? null
        : {
            wage: Math.round(member.currentAbility * 400 + next() * 20000),
            signed: { year: 2026, month: 6, day: 29 },
            expires: { year: 2027 + Math.floor(next() * 4), month: 6, day: 30 },
            joined: { year: 2021 + Math.floor(next() * 5), month: 7, day: 1 },
            job: member.job,
          },
  };
}

const clubs: ClubSummary[] = CLUBS.flatMap((name, i) => [
  { uid: 500 + i * 7, name, shortName: name.split(" ")[0], women: false, reputation: 8200 - i * 900, founded: 1880 + i * 11 },
  { uid: 2_000_100_000 + i, name, shortName: name.split(" ")[0], women: true, reputation: 6100 - i * 700, founded: 1985 + i * 4 },
]);

/** Made-up but self-consistent profile for a fixture club; women's clubs have no finances. */
function clubDetails(club: ClubSummary): ClubDetails {
  const next = random(club.uid);
  const rating = () => Math.round(5 + next() * 15);
  const mix = [10, 35, 15, 20, 6, 14];
  return {
    ...club,
    seasonTickets: Math.round(5000 + next() * 45000),
    socialMedia: Math.round(next() * 9_000_000),
    supporterMix: Object.fromEntries(["hardcore", "core", "family", "fair_weather", "casual", "other"].map((k, n) => [k, mix[n]])),
    supporterTraits: Object.fromEntries(
      ["loyalty", "passion", "patience", "affluence", "temperament", "expectations"].map((k) => [k, rating()]),
    ),
    facilities: Object.fromEntries(
      ["training", "youth_facilities", "youth_coaching", "youth_recruitment", ...(club.women ? [] : ["corporate"])].map((k) => [k, rating()]),
    ),
    finances: club.women
      ? null
      : {
          balance: Math.round((next() - 0.2) * 200_000_000),
          transferBudget: Math.round(next() * 60_000_000),
          wageBudget: Math.round(1_000_000 + next() * 3_000_000),
          totalWageBudget: Math.round(1_200_000 + next() * 3_200_000),
          ticketPrice: Math.round(20 + next() * 60),
        },
  };
}

export async function mockInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  switch (command) {
    case "detect_game": {
      const detection: Detection = { elevated: false, games: [{ pid: game.pid, info: game, pluginLoaded: true, error: null }] };
      return detection as T;
    }
    case "connect": {
      const info: ConnectionInfo = {
        game,
        profile: "FM27 0.9.2355.0 (Game Pass, Launch Preview)",
        arrays: {
          players: { pairRva: 0x5681dc0, count: players.length, confidence: 1 },
          staff: { pairRva: 0x5681e08, count: 120, confidence: 1 },
          clubs: { pairRva: 0x5681f78, count: CLUBS.length, confidence: 1 },
          fromProfile: true,
        },
        players: players.length,
        staff: staff.length,
        clubs: clubs.length,
        gameDate: GAME_DATE,
        loadMs: 480,
      };
      return info as T;
    }
    case "reload": {
      const reloaded: ReloadInfo = { players: players.length, staff: staff.length, clubs: clubs.length, gameDate: GAME_DATE };
      return reloaded as T;
    }
    case "search_players": {
      const query = String(args?.query ?? "");
      const limit = Number(args?.limit ?? 200);
      const words = fold(query).split(/\s+/).filter(Boolean);
      const hits = players
        .filter((p) => String(p.uid) === query.trim() || words.every((w) => fold(`${p.name} ${p.fullName ?? ""}`).includes(w)))
        .sort((a, b) => b.currentAbility - a.currentAbility || a.name.localeCompare(b.name));
      const page: PlayerPage = { total: hits.length, rows: hits.slice(0, limit) };
      return page as T;
    }
    case "search_clubs": {
      const query = String(args?.query ?? "");
      const limit = Number(args?.limit ?? 200);
      const words = fold(query).split(/\s+/).filter(Boolean);
      const hits = clubs
        .filter((c) => String(c.uid) === query.trim() || words.every((w) => fold(`${c.name} ${c.shortName ?? ""}`).includes(w)))
        .sort((a, b) => (b.reputation ?? -1) - (a.reputation ?? -1) || a.name.localeCompare(b.name));
      const page: ClubPage = { total: hits.length, rows: hits.slice(0, limit) };
      return page as T;
    }
    case "club_details": {
      const uid = Number(args?.uid);
      const club = clubs.find((c) => c.uid === uid);
      if (!club) {
        throw new Error(`No club with UID ${uid}`);
      }
      return clubDetails(club) as T;
    }
    case "search_staff": {
      const query = String(args?.query ?? "");
      const limit = Number(args?.limit ?? 200);
      const words = fold(query).split(/\s+/).filter(Boolean);
      const hits = staff
        .filter((s) => String(s.uid) === query.trim() || words.every((w) => fold(`${s.name} ${s.fullName ?? ""}`).includes(w)))
        .sort((a, b) => Number(b.isHuman) - Number(a.isHuman) || b.currentAbility - a.currentAbility || a.name.localeCompare(b.name));
      const page: StaffPage = { total: hits.length, rows: hits.slice(0, limit) };
      return page as T;
    }
    case "staff_details": {
      const uid = Number(args?.uid);
      const member = staff.find((s) => s.uid === uid);
      if (!member) {
        throw new Error(`No member of staff with id ${uid}`);
      }
      return staffDetails(member) as T;
    }
    case "player_details": {
      const uid = Number(args?.uid);
      const player = players.find((p) => p.uid === uid);
      if (!player) {
        throw new Error(`No player with UID ${uid}`);
      }
      return details(player) as T;
    }
    default:
      throw new Error(`No fixture for command "${command}"`);
  }
}
