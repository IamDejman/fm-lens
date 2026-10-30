// Stand-ins for the Rust commands so the UI can be developed in a plain browser
// (`npm run dev`) without the game or Tauri. Every player here is made up.

import { fold } from "../format";
import type { ConnectionInfo, Detection, GameInfo, PlayerDetails, PlayerPage, PlayerSummary } from "../types";

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
    return {
      uid: 1_000_000 + i * 37,
      name,
      fullName: next() < 0.3 ? `${name} ${pick(LAST)}` : null,
      dateOfBirth: { year: 1988 + Math.floor(next() * 20), month: 1 + Math.floor(next() * 12), day: 1 + Math.floor(next() * 28) },
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
        loadMs: 480,
      };
      return info as T;
    }
    case "reload_players":
      return players.length as T;
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
