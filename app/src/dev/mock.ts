// Stand-ins for the Rust commands so the UI can be developed in a plain browser
// (`npm run dev`) without the game or Tauri. Every player here is made up.

import { fold } from "../format";
import type {
  ApplyReport,
  ClubDetails,
  ClubFilter,
  ClubPage,
  ClubSummary,
  ConnectionInfo,
  Detection,
  FmDate,
  GameInfo,
  PlayerDetails,
  PlayerFilter,
  PlayerOrder,
  PlayerPage,
  PlayerSummary,
  ReloadInfo,
  StaffDetails,
  StaffFilter,
  StaffPage,
  StaffSummary,
  EditField,
  Entity,
  FieldEdit,
  FieldValues,
  LoggedChange,
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

/** The 15 positions, in the order the game stores their ratings. */
const POSITIONS = ["gk", "sw", "dl", "dc", "dr", "dm", "ml", "mc", "mr", "aml", "amc", "amr", "st", "wbl", "wbr"];

/** From this rating FM counts a position as one a player can play: the list's positions and its filter use it. */
const PLAYABLE_RATING = 15;

/** Every eleventh fixture player is a goalkeeper. */
const isKeeper = (uid: number) => uid % 11 === 0;

/** How well a fixture player plays each position (1–20): one natural position, a few that come close, the rest low. */
function positionRatings(next: () => number, keeper: boolean): Record<string, number> {
  const natural = keeper ? "gk" : POSITIONS[1 + Math.floor(next() * (POSITIONS.length - 1))];
  return Object.fromEntries(
    POSITIONS.map((key) => [key, key === natural ? 20 : keeper || key === "gk" ? 1 : Math.round(1 + next() ** 2 * 16)]),
  );
}

/** The positions rated PLAYABLE_RATING or more, best first (equals in the order of POSITIONS), as the real list has them. */
function playablePositions(ratings: Record<string, number>): string[] {
  return POSITIONS.filter((key) => ratings[key] >= PLAYABLE_RATING).sort((a, b) => ratings[b] - ratings[a]);
}

/** When a fixture contract ends: mostly on 30 June, some at the turn of the year, a few this year (after the game date). */
function contractEnd(next: () => number): FmDate {
  const roll = next();
  if (roll < 0.12) {
    return { year: GAME_DATE.year, month: 12, day: 31 };
  }
  const year = GAME_DATE.year + 1 + Math.floor(next() * 5);
  return roll < 0.8 ? { year, month: 6, day: 30 } : { year, month: 12, day: 31 };
}

/** The fixture players, and how well each plays every position (by UID): the list and the profile both read the ratings. */
const { players, ratings } = (() => {
  const next = random(27);
  const pick = <T,>(items: T[]) => items[Math.floor(next() * items.length)];
  const ratings: Record<number, Record<string, number>> = {};
  const players = Array.from({ length: 400 }, (_, i): PlayerSummary => {
    const uid = 1_000_000 + i * 37;
    const ca = Math.round(40 + next() * 150);
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const born: FmDate = { year: 1988 + Math.floor(next() * 20), month: 1 + Math.floor(next() * 12), day: 1 + Math.floor(next() * 28) };
    const fullName = next() < 0.3 ? `${name} ${pick(LAST)}` : null;
    const nation = pick(NATIONS);
    const club = next() < 0.9 ? pick(CLUBS) : null;
    const potentialAbility = Math.min(200, ca + Math.round(next() * 40));
    // Positions and contract are drawn from a generator of their own, so the other fields of each player come out as before.
    const own = random(uid ^ 0x5a5a5a);
    ratings[uid] = positionRatings(own, isKeeper(uid));
    return {
      uid,
      name,
      fullName,
      dateOfBirth: born,
      age: GAME_DATE.year - born.year - (GAME_DATE.month * 100 + GAME_DATE.day < born.month * 100 + born.day ? 1 : 0),
      nation,
      club,
      positions: playablePositions(ratings[uid]),
      contractExpires: club === null ? null : contractEnd(own),
      currentAbility: ca,
      potentialAbility,
    };
  });
  return { players, ratings };
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
const PERSONALITY = [
  "adaptability", "ambition", "loyalty", "pressure", "professionalism", "sportsmanship", "temperament", "controversy",
];

/** Made-up but self-consistent profile for a fixture player. */
function details(player: PlayerSummary): PlayerDetails {
  const next = random(player.uid);
  const keeper = isKeeper(player.uid);
  const level = generatedAbility.get(player.uid)! / 2; // raw attribute centre, 0–100
  const attributes = Object.fromEntries(
    ATTRIBUTES.map((key) => {
      const centre = GK_ONLY.has(key) !== keeper ? 12 : level;
      const raw = Math.max(1, Math.min(100, Math.round(centre + (next() - 0.5) * 40)));
      return [key, { raw, value: Math.max(1, Math.min(20, Math.floor((raw + 2) / 5))) }];
    }),
  );
  const personality = Object.fromEntries(PERSONALITY.map((key) => [key, Math.round(1 + next() * 19)]));
  return withWritten("player", {
    ...player,
    heightCm: Math.round(168 + next() * 26),
    askingPrice: next() < 0.2 ? Math.round(next() * 40) * 1_000_000 : null,
    reputation: { home: Math.round(next() * 10000), current: Math.round(next() * 10000), world: Math.round(next() * 10000) },
    international: { caps: Math.round(next() * 90), goals: Math.round(next() * 30), u21Caps: Math.round(next() * 20), u21Goals: Math.round(next() * 8) },
    // The ratings behind the positions of the list row: the profile and the row agree.
    positionRatings: { ...ratings[player.uid] },
    personality,
    attributes,
    contract: player.club
      ? {
          wage: Math.round(generatedAbility.get(player.uid)! * 900 + next() * 20000),
          signed: { year: 2024, month: 7, day: 1 },
          expires: player.contractExpires,
          joined: { year: 2022, month: 8, day: 15 },
          squadStatus: 1 + Math.floor(next() * 5),
          squadNumber: 1 + Math.floor(next() * 40),
          transferListed: next() < 0.1,
          loanListed: false,
        }
      : null,
  });
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
  const level = generatedAbility.get(member.uid)! / 2;
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
  return withWritten("staff", {
    ...member,
    reputation: { home: Math.round(next() * 10000), current: Math.round(next() * 10000), world: Math.round(next() * 10000) },
    personality,
    attributes,
    contract:
      member.job === null
        ? null
        : {
            wage: Math.round(generatedAbility.get(member.uid)! * 400 + next() * 20000),
            signed: { year: 2026, month: 6, day: 29 },
            expires: { year: 2027 + Math.floor(next() * 4), month: 6, day: 30 },
            joined: { year: 2021 + Math.floor(next() * 5), month: 7, day: 1 },
            job: member.job,
          },
  });
}

/** Each fixture person's current ability as generated: their made-up profile is built around it, edited or not. */
const generatedAbility = new Map<number, number>([...players, ...staff].map((p) => [p.uid, p.currentAbility]));

// Editing ---------------------------------------------------------------------------------------------------------

/** The staff attributes in the order the real field table has them (coaching, mental, knowledge, medical). */
const STAFF_ATTRIBUTE_ORDER = [
  "attacking", "defending", "fitness", "goalkeeping", "possession", "set_pieces", "tactical", "technical",
  "working_with_youngsters", "authority", "determination", "motivating", "people_management", "data_analysis",
  "judging_ability", "judging_potential", "judging_staff", "negotiating", "tactical_knowledge", "physiotherapy",
  "sports_science",
];

/** The international fields' keys and the profile's names for them. */
const INTERNATIONAL = { caps: "caps", goals: "goals", u21_caps: "u21Caps", u21_goals: "u21Goals" } as const;

/** The editable fields, as the real `edit_fields` lists them. */
function fieldTable(entity: Entity): EditField[] {
  const field = (key: string, kind: EditField["kind"], min: number, max: number, scale: EditField["scale"] = "plain") =>
    ({ key, entity, kind, scale, min, max }) satisfies EditField;
  const common = [
    field("current_ability", "u16", 1, 200),
    field("potential_ability", "i16", 1, 200),
  ];
  const reputation = ["home", "current", "world"].map((key) => field(`reputation.${key}`, "u16", 0, 10_000));
  const personality = PERSONALITY.map((key) => field(`personality.${key}`, "u8", 1, 20));
  if (entity === "player") {
    return [
      ...common,
      field("height", "u16", 140, 220),
      ...reputation,
      field("international.caps", "u16", 0, 1000),
      field("international.goals", "u16", 0, 1000),
      field("international.u21_caps", "u8", 0, 255),
      field("international.u21_goals", "u8", 0, 255),
      ...ATTRIBUTES.map((key) => field(`attribute.${key}`, "u8", 1, 100, "attribute")),
      // The game no longer plays a sweeper, so the real table leaves it out.
      ...POSITIONS.filter((key) => key !== "sw").map((key) => field(`position.${key}`, "u8", 1, 20)),
      ...personality,
    ];
  }
  return [
    ...common,
    ...reputation,
    ...STAFF_ATTRIBUTE_ORDER.map((key) =>
      STAFF_RATINGS.includes(key)
        ? field(`attribute.${key}`, "u8", 1, 20)
        : field(`attribute.${key}`, "u8", 0, 100, "attribute"),
    ),
    ...personality,
  ];
}

/**
 * Values written through the editor that the generated profiles would not show, by `entity:uid` and field key.
 * Ability and position ratings go straight into the list rows instead, which the profiles are built from.
 */
const written = new Map<string, FieldValues>();

/** Every change written in this browser session, oldest first. */
const changes: LoggedChange[] = [];

/** A generated profile with the values written through the editor on top. */
function withWritten<D extends PlayerDetails | StaffDetails>(entity: Entity, d: D): D {
  for (const [key, value] of Object.entries(written.get(`${entity}:${d.uid}`) ?? {})) {
    const [group, name = ""] = key.split(".");
    switch (group) {
      case "attribute":
        d.attributes[name] = STAFF_RATINGS.includes(name)
          ? { raw: value, value }
          : { raw: value, value: Math.max(1, Math.min(20, Math.floor((value + 2) / 5))) };
        break;
      case "personality":
        d.personality[name] = value;
        break;
      case "reputation":
        d.reputation[name as "home" | "current" | "world"] = value;
        break;
      case "height":
        (d as PlayerDetails).heightCm = value;
        break;
      case "international":
        (d as PlayerDetails).international[INTERNATIONAL[name as keyof typeof INTERNATIONAL]] = value;
        break;
    }
  }
  return d;
}

/** The person's profile, or an error like the real commands give. */
function profileOf(entity: Entity, uid: number): PlayerDetails | StaffDetails {
  if (entity === "player") {
    const player = players.find((p) => p.uid === uid);
    if (player) {
      return details(player);
    }
  } else {
    const member = staff.find((s) => s.uid === uid);
    if (member) {
      return staffDetails(member);
    }
  }
  throw new Error(`No ${entity} with id ${uid}`);
}

/** The stored value of every editable field, as `read_values` returns it. */
function currentValues(entity: Entity, uid: number): FieldValues {
  const d = profileOf(entity, uid);
  const value = (key: string): number => {
    const [group, name = ""] = key.split(".");
    switch (group) {
      case "current_ability":
        return d.currentAbility;
      case "potential_ability":
        return d.potentialAbility;
      case "height":
        return (d as PlayerDetails).heightCm;
      case "reputation":
        return d.reputation[name as "home" | "current" | "world"];
      case "international":
        return (d as PlayerDetails).international[INTERNATIONAL[name as keyof typeof INTERNATIONAL]];
      case "attribute":
        return d.attributes[name].raw;
      case "position":
        return (d as PlayerDetails).positionRatings[name];
      case "personality":
        return d.personality[name];
    }
    throw new Error(`No fixture value for ${key}`);
  };
  return Object.fromEntries(fieldTable(entity).map((f) => [f.key, value(f.key)]));
}

/** Stores `value` as the game would: ability and positions in the list rows, the rest on top of the profiles. */
function writeValue(entity: Entity, uid: number, key: string, value: number): void {
  const [group, name = ""] = key.split(".");
  const row = entity === "player" ? players.find((p) => p.uid === uid) : staff.find((s) => s.uid === uid);
  if (row && group === "current_ability") {
    row.currentAbility = value;
  } else if (row && group === "potential_ability") {
    row.potentialAbility = value;
  } else if (entity === "player" && group === "position") {
    ratings[uid][name] = value;
    (row as PlayerSummary).positions = playablePositions(ratings[uid]);
  } else {
    const slot = `${entity}:${uid}`;
    written.set(slot, { ...written.get(slot), [key]: value });
  }
}

/** `apply_edits`: every edit is checked and written on its own, like the real command, with the same messages. */
function applyEdits(entity: Entity, uid: number, edits: FieldEdit[]): ApplyReport {
  const name = profileOf(entity, uid).name;
  const report: ApplyReport = { applied: [], failed: [] };
  for (const edit of edits) {
    const field = fieldTable(entity).find((f) => f.key === edit.field);
    if (!field) {
      report.failed.push({ ...edit, error: `${entity} has no editable field ${edit.field}` });
      continue;
    }
    if (!Number.isInteger(edit.value) || edit.value < field.min || edit.value > field.max) {
      report.failed.push({ ...edit, error: `${edit.value} is not a valid ${field.key}; it takes ${field.min} to ${field.max}` });
      continue;
    }
    const old = currentValues(entity, uid)[field.key];
    if (old === edit.value) {
      continue;
    }
    writeValue(entity, uid, field.key, edit.value);
    const logged: LoggedChange = {
      id: changes.length + 1,
      at: Date.now(),
      name,
      entity,
      uid,
      field: field.key,
      old,
      new: edit.value,
      undoneAt: null,
    };
    changes.push(logged);
    report.applied.push({ ...logged });
  }
  return report;
}

/** `undo_change`: writes the old value back unless the value has changed since. */
function undoChange(id: number): LoggedChange {
  const entry = changes.find((c) => c.id === id);
  if (!entry) {
    throw new Error(`No change ${id}`);
  }
  if (entry.undoneAt !== null) {
    throw new Error("This change has already been undone.");
  }
  const found = currentValues(entry.entity, entry.uid)[entry.field];
  if (found !== entry.new) {
    throw new Error(`${entry.field} is now ${found}, not ${entry.new}; the game has changed it since`);
  }
  writeValue(entry.entity, entry.uid, entry.field, entry.old);
  entry.undoneAt = Date.now();
  return { ...entry };
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

/** A date as a number that orders like the date. */
const dayNumber = (date: FmDate) => (date.year * 100 + date.month) * 100 + date.day;

/** Whether `text` contains `needle`, ignoring accents and case; an empty needle matches anything. */
function contains(text: string | null, needle: string | undefined): boolean {
  const wanted = fold(needle?.trim() ?? "");
  return wanted === "" || (text !== null && fold(text).includes(wanted));
}

/** The player filter of the real command: fields that are not set match everyone. */
function matchesPlayerFilter(p: PlayerSummary, f: PlayerFilter): boolean {
  return (
    (f.position === undefined || p.positions.includes(f.position)) &&
    (f.minAge === undefined || (p.age !== null && p.age >= f.minAge)) &&
    (f.maxAge === undefined || (p.age !== null && p.age <= f.maxAge)) &&
    (f.minCurrentAbility === undefined || p.currentAbility >= f.minCurrentAbility) &&
    (f.minPotentialAbility === undefined || p.potentialAbility >= f.minPotentialAbility) &&
    contains(p.nation, f.nation) &&
    contains(p.club, f.club) &&
    (!f.freeAgents || p.club === null) &&
    (f.contractExpiresBy === undefined ||
      (p.contractExpires !== null && dayNumber(p.contractExpires) <= dayNumber(f.contractExpiresBy)))
  );
}

/** The search's own order, as the real index has it: best current ability first, then by name without accents or case. */
function bySearchRank(a: PlayerSummary, b: PlayerSummary): number {
  const x = fold(a.name);
  const y = fold(b.name);
  return b.currentAbility - a.currentAbility || (x < y ? -1 : x > y ? 1 : 0);
}

/**
 * The sort of the real command: unknown values (no age, no club, no contract) go last either way and text
 * compares without accents or case. Like the real one it is stable, so equals keep the search's order.
 */
function playerComparator({ by, ascending }: PlayerOrder): (a: PlayerSummary, b: PlayerSummary) => number {
  const value = (p: PlayerSummary): string | number | null => {
    switch (by) {
      case "currentAbility":
        return p.currentAbility;
      case "potentialAbility":
        return p.potentialAbility;
      case "age":
        return p.age;
      case "name":
        return fold(p.name);
      case "nation":
        return p.nation && fold(p.nation);
      case "club":
        return p.club && fold(p.club);
      case "contractExpires":
        return p.contractExpires && dayNumber(p.contractExpires);
    }
  };
  return (a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) {
      return x === y ? 0 : x === null ? 1 : -1;
    }
    return x === y ? 0 : (x < y ? -1 : 1) * (ascending ? 1 : -1);
  };
}

/** The staff filter of the real command: a player-coach has the code of the coaching job plus one, and matches it too. */
function matchesStaffFilter(s: StaffSummary, f: StaffFilter): boolean {
  return (
    (f.job === undefined || (s.job !== null && (s.job === f.job || s.job === f.job + 1))) &&
    (!f.unemployed || s.job === null)
  );
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
        editable: true,
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
      const filter = (args?.filter ?? {}) as PlayerFilter;
      // Without an order the best current ability comes first, as with the real command.
      const order = (args?.order ?? { by: "currentAbility", ascending: false }) as PlayerOrder;
      const words = fold(query).split(/\s+/).filter(Boolean);
      const hits = players
        .filter((p) => String(p.uid) === query.trim() || words.every((w) => fold(`${p.name} ${p.fullName ?? ""}`).includes(w)))
        .filter((p) => matchesPlayerFilter(p, filter))
        .sort(bySearchRank)
        .sort(playerComparator(order));
      const page: PlayerPage = { total: hits.length, rows: hits.slice(0, limit) };
      return page as T;
    }
    case "search_clubs": {
      const query = String(args?.query ?? "");
      const limit = Number(args?.limit ?? 200);
      const filter = (args?.filter ?? {}) as ClubFilter;
      const words = fold(query).split(/\s+/).filter(Boolean);
      const hits = clubs
        .filter((c) => String(c.uid) === query.trim() || words.every((w) => fold(`${c.name} ${c.shortName ?? ""}`).includes(w)))
        .filter((c) => filter.women === undefined || c.women === filter.women)
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
      const filter = (args?.filter ?? {}) as StaffFilter;
      const words = fold(query).split(/\s+/).filter(Boolean);
      const hits = staff
        .filter((s) => String(s.uid) === query.trim() || words.every((w) => fold(`${s.name} ${s.fullName ?? ""}`).includes(w)))
        .filter((s) => matchesStaffFilter(s, filter))
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
    case "edit_fields":
      return fieldTable(args?.entity as Entity) as T;
    case "read_values":
      return currentValues(args?.entity as Entity, Number(args?.uid)) as T;
    case "apply_edits":
      return applyEdits(args?.entity as Entity, Number(args?.uid), (args?.edits ?? []) as FieldEdit[]) as T;
    case "change_log":
      return changes.map((c) => ({ ...c })).reverse() as T;
    case "undo_change":
      return undoChange(Number(args?.id)) as T;
    default:
      throw new Error(`No fixture for command "${command}"`);
  }
}
