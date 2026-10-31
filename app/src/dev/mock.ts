// Stand-ins for the Rust commands so the UI can be developed in a plain browser
// (`npm run dev`) without the game or Tauri. Every player here is made up.

import { dateFromNumber, numberFromDate } from "../editing";
import { fold } from "../format";
import type {
  ApplyReport,
  BridgeInfo,
  CaptainRole,
  ClubTeam,
  SquadPlayer,
  TeamAction,
  ClubDetails,
  ClubFilter,
  ClubPage,
  ClubSummary,
  ConnectionInfo,
  Detection,
  Failure,
  FmDate,
  GameInfo,
  Injury,
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
  BatchUndo,
  MassFilters,
  MassOperation,
  MassOperationKind,
  MassPreview,
  MassReport,
  MovePreview,
  MoveTerms,
  PlannedChange,
  SkippedField,
} from "../types";

const GAME_DATE: FmDate = { year: 2026, month: 7, day: 18 };

const game: GameInfo = {
  pid: 4242,
  exePath: "D:\\Games\\Football Manager 27\\Content\\fm.exe",
  storefront: "gamePass",
  edition: 27,
  packageFullName: "SportsInteractive.FootballManager27_0.9.2355.0_x64__5w3tn6tb6stnm",
  packageVersion: "0.9.2355.0",
  steamBuild: null,
};

const FIRST = ["Arda", "Mateo", "Lukas", "Kerem", "Jonas", "Rafael", "Emre", "Noah", "Tiago", "Søren", "Ilkay", "Bruno"];
const LAST = ["Yılmaz", "Fernández", "Hoffmann", "Aydın", "Lindqvist", "Moreau", "Çelik", "Kowalski", "Silva", "Novák"];
const NATIONS = ["Türkiye", "Spain", "Germany", "Brazil", "Denmark", "France", "Poland", "Portugal", "Czechia"];
const CLUBS = ["Northbridge FC", "Atlético Riverside", "Sporting Harbour", "FC Lindenau", "Kuzey Spor", "Old Mill United"];

/** A fixture person's nation and club with their UIDs, as the real rows have them; the clubs are the men's ones below. */
function withUids(nation: string, club: string | null) {
  return {
    nation,
    nationUid: 1000 + NATIONS.indexOf(nation),
    club,
    clubUid: club === null ? null : 500 + CLUBS.indexOf(club) * 7,
  };
}

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
      ...withUids(nation, club),
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
          // A player moved to another club signed today, without a squad number, off the transfer list.
          ...(movedPlayers.has(player.uid) && {
            signed: GAME_DATE,
            joined: GAME_DATE,
            squadNumber: null,
            transferListed: false,
          }),
        }
      : null,
    // As stored: energy and match sharpness 0–10000 (the game keeps sharpness at 35% or more).
    condition: Math.round(7000 + next() * 3000),
    matchSharpness: Math.round(3500 + next() * 6500),
    injuries: injuriesOf(player.uid),
    // Drawn last, so that the values above come out as before.
    morale: Math.round(7 + next() * 10),
  });
}

/** The fixture players healed through the editor, by UID, while the healing is not undone. */
const healedPlayers = new Set<number>();

/** `date` moved on by `days`. */
function addDays(date: FmDate, days: number): FmDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** The current injuries of a fixture player: every seventh one is injured, some of them twice over, until healed. */
function injuriesOf(uid: number): Injury[] {
  if (uid % 7 !== 3 || healedPlayers.has(uid)) {
    return [];
  }
  const injury = (name: string, daysAgo: number, soonest: number, latest: number): Injury => {
    const started = addDays(GAME_DATE, -daysAgo);
    return { name, started, backSoonest: addDays(started, soonest), backLatest: addDays(started, latest) };
  };
  const injuries = [injury("Hamstring strain", 4, 21, 35)];
  if (uid % 2 === 0) {
    injuries.push(injury("Twisted ankle", 1, 7, 12));
  }
  return injuries;
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
      ...withUids(pick(NATIONS), employed ? pick(CLUBS) : null),
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
  const field = (
    key: string,
    kind: EditField["kind"],
    min: number,
    max: number,
    scale: EditField["scale"] = "plain",
  ): EditField => ({ key, entity, kind, scale, min, max, blank: null, choices: null, mass: true });
  // A player's squad number (255: none), squad status and listing are changed one player at a time.
  const playerContract: EditField[] = [
    { ...field("contract.squad_number", "u8", 1, 99), blank: 255, mass: false },
    { ...field("contract.squad_status", "u8", 1, 40), choices: [1, 2, 3, 4, 5], mass: false },
    { ...field("contract.transfer_listed", "flag", 0, 1), mass: false },
    { ...field("contract.loan_listed", "flag", 0, 1), mass: false },
  ];
  const common = [
    field("current_ability", "u16", 1, 200),
    field("potential_ability", "i16", 1, 200),
  ];
  const reputation = ["home", "current", "world"].map((key) => field(`reputation.${key}`, "u16", 0, 10_000));
  const personality = PERSONALITY.map((key) => field(`personality.${key}`, "u8", 1, 20));
  const contract = [field("contract.wage", "i32", 0, 10_000_000), field("contract.expires", "date", 20000101, 21001231)];
  if (entity === "club") {
    return [
      field("reputation", "u16", 0, 10_000),
      ...CLUB_FACILITIES.map((key) => field(`facilities.${key}`, "u8", 1, 20)),
      field("finance.balance", "i32", -2_000_000_000, 2_000_000_000),
      field("finance.transfer_budget", "i32", 0, 2_000_000_000),
      field("finance.wage_budget", "i32", 0, 100_000_000),
      field("finance.total_wage_budget", "i32", 0, 100_000_000),
    ];
  }
  if (entity === "player") {
    return [
      ...common,
      field("height", "u16", 140, 220),
      ...reputation,
      field("international.caps", "u16", 0, 1000),
      field("international.goals", "u16", 0, 1000),
      field("international.u21_caps", "u8", 0, 255),
      field("international.u21_goals", "u8", 0, 255),
      field("condition", "u16", 0, 10_000, "percent"),
      field("match_sharpness", "u16", 3_500, 10_000, "percent"),
      field("morale", "u8", 1, 20),
      ...ATTRIBUTES.map((key) => field(`attribute.${key}`, "u8", 1, 100, "attribute")),
      // The game no longer plays a sweeper, so the real table leaves it out.
      ...POSITIONS.filter((key) => key !== "sw").map((key) => field(`position.${key}`, "u8", 1, 20)),
      ...personality,
      ...contract,
      ...playerContract,
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
    ...contract,
  ];
}

/** The club facilities the editor changes, in the order of the real field table. */
const CLUB_FACILITIES = ["training", "youth_facilities", "youth_coaching", "youth_recruitment", "corporate"];

/** The finance fields' keys and the profile's names for them. */
const FINANCE = {
  balance: "balance",
  transfer_budget: "transferBudget",
  wage_budget: "wageBudget",
  total_wage_budget: "totalWageBudget",
} as const;

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
      case "condition":
        (d as PlayerDetails).condition = value;
        break;
      case "match_sharpness":
        (d as PlayerDetails).matchSharpness = value;
        break;
      case "morale":
        (d as PlayerDetails).morale = value;
        break;
      case "international":
        (d as PlayerDetails).international[INTERNATIONAL[name as keyof typeof INTERNATIONAL]] = value;
        break;
      case "contract":
        if (d.contract && name === "wage") {
          d.contract.wage = value;
        } else if (d.contract && name === "expires") {
          d.contract.expires = dateFromNumber(value);
        } else if (entity === "player" && (d as PlayerDetails).contract) {
          // What only a player's contract has.
          const contract = (d as PlayerDetails).contract!;
          if (name === "squad_number") {
            contract.squadNumber = value === 255 ? null : value;
          } else if (name === "squad_status") {
            contract.squadStatus = value;
          } else if (name === "transfer_listed") {
            contract.transferListed = value === 1;
          } else if (name === "loan_listed") {
            contract.loanListed = value === 1;
          }
        }
        break;
    }
  }
  return d;
}

/** A generated club profile with the values written through the editor on top. */
function withWrittenClub(d: ClubDetails): ClubDetails {
  for (const [key, value] of Object.entries(written.get(`club:${d.uid}`) ?? {})) {
    const [group, name = ""] = key.split(".");
    if (group === "facilities") {
      d.facilities[name] = value;
    } else if (group === "finance" && d.finances) {
      d.finances[FINANCE[name as keyof typeof FINANCE]] = value;
    }
  }
  return d;
}

/** A failure the way the real commands report one (see `Failure`): its code, the values it names, and the English. */
function failure(code: string, message: string, params: Record<string, string | number> = {}): Failure {
  return { code, message, params: Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])) };
}

/** The real commands' failure for a player, member of staff or club the lists do not have. */
const notFound = (entity: Entity, uid: number) => failure("app.notFound", `No ${entity} with id ${uid}`, { entity, uid });

/** The profile of the person or club, or an error like the real commands give. */
function profileOf(entity: Entity, uid: number): PlayerDetails | StaffDetails | ClubDetails {
  const found =
    entity === "player"
      ? players.find((p) => p.uid === uid)
      : entity === "staff"
        ? staff.find((s) => s.uid === uid)
        : clubs.find((c) => c.uid === uid);
  if (!found) {
    throw notFound(entity, uid);
  }
  return entity === "player"
    ? details(found as PlayerSummary)
    : entity === "staff"
      ? staffDetails(found as StaffSummary)
      : clubDetails(found as ClubSummary);
}

/**
 * The stored value of every field that can be edited now, as `read_values` returns it: like the real command it
 * leaves out contract fields without a contract, a contract end that is not set, and a club's missing finances.
 */
function currentValues(entity: Entity, uid: number): FieldValues {
  const d = profileOf(entity, uid);
  const person = d as PlayerDetails & StaffDetails;
  const club = d as ClubDetails;
  const value = (key: string): number | null | undefined => {
    const [group, name = ""] = key.split(".");
    switch (group) {
      case "current_ability":
        return person.currentAbility;
      case "potential_ability":
        return person.potentialAbility;
      case "height":
        return person.heightCm;
      case "condition":
        return person.condition;
      case "match_sharpness":
        return person.matchSharpness;
      case "morale":
        return person.morale;
      case "reputation":
        return entity === "club" ? club.reputation : person.reputation[name as "home" | "current" | "world"];
      case "international":
        return person.international[INTERNATIONAL[name as keyof typeof INTERNATIONAL]];
      case "attribute":
        return person.attributes[name].raw;
      case "position":
        return person.positionRatings[name];
      case "personality":
        return person.personality[name];
      case "contract": {
        const contract = (person as PlayerDetails).contract;
        switch (name) {
          case "wage":
            return person.contract?.wage;
          case "expires":
            return person.contract?.expires && numberFromDate(person.contract.expires);
          // Only a player's contract has these; the real table offers them for players only.
          case "squad_number":
            return contract && (contract.squadNumber ?? 255);
          case "squad_status":
            return contract?.squadStatus;
          case "transfer_listed":
            return contract && Number(contract.transferListed);
          case "loan_listed":
            return contract && Number(contract.loanListed);
        }
        return undefined;
      }
      case "facilities":
        return club.facilities[name];
      case "finance":
        return club.finances?.[FINANCE[name as keyof typeof FINANCE]];
    }
    throw new Error(`No fixture value for ${key}`);
  };
  return Object.fromEntries(
    fieldTable(entity).flatMap((f) => {
      const v = value(f.key);
      return v === null || v === undefined ? [] : [[f.key, v]];
    }),
  );
}

/** Stores `value` as the game would: what the list rows show in them, the rest on top of the profiles. */
function writeValue(entity: Entity, uid: number, key: string, value: number): void {
  const [group, name = ""] = key.split(".");
  if (entity === "club") {
    const club = clubs.find((c) => c.uid === uid);
    if (club && key === "reputation") {
      club.reputation = value;
      return;
    }
  } else {
    const row = entity === "player" ? players.find((p) => p.uid === uid) : staff.find((s) => s.uid === uid);
    if (row && group === "current_ability") {
      row.currentAbility = value;
      return;
    }
    if (row && group === "potential_ability") {
      row.potentialAbility = value;
      return;
    }
    if (entity === "player" && group === "position") {
      ratings[uid][name] = value;
      (row as PlayerSummary).positions = playablePositions(ratings[uid]);
      return;
    }
    if (entity === "player" && key === "contract.expires") {
      // The list row has the contract end, and the profile builds its contract from the row.
      (row as PlayerSummary).contractExpires = dateFromNumber(value);
      return;
    }
  }
  const slot = `${entity}:${uid}`;
  written.set(slot, { ...written.get(slot), [key]: value });
}

/** `apply_edits`: every edit is checked and written on its own, like the real command, with the same messages. */
function applyEdits(entity: Entity, uid: number, edits: FieldEdit[]): ApplyReport {
  const name = profileOf(entity, uid).name;
  const report: ApplyReport = { applied: [], failed: [] };
  for (const edit of edits) {
    const field = fieldTable(entity).find((f) => f.key === edit.field);
    if (!field) {
      const message = `${entity} has no editable field ${edit.field}`;
      report.failed.push({ ...edit, error: failure("edit.unknownField", message, { entity, field: edit.field }) });
      continue;
    }
    // Like the real command, a field also takes its blank (a squad number of 255 is none).
    const takes = edit.value === field.blank || (edit.value >= field.min && edit.value <= field.max);
    if (!Number.isInteger(edit.value) || !takes) {
      const message = `${edit.value} is not a valid ${field.key}; it takes ${field.min} to ${field.max}`;
      const params = { field: field.key, value: edit.value, min: field.min, max: field.max };
      report.failed.push({ ...edit, error: failure("edit.outOfRange", message, params) });
      continue;
    }
    if (field.kind === "date" && dateFromNumber(edit.value) === null) {
      const message = `${edit.value} is not a date for ${field.key}`;
      report.failed.push({ ...edit, error: failure("edit.notADate", message, { field: field.key, value: edit.value }) });
      continue;
    }
    const old: number | undefined = currentValues(entity, uid)[field.key];
    if (old === undefined) {
      // No contract, no contract end, or a club without full finances.
      const message = `${field.key} cannot be changed here: its record is missing or does not check out`;
      report.failed.push({ ...edit, error: failure("edit.noRecord", message, { field: field.key }) });
      continue;
    }
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
      batch: null,
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
    throw failure("app.noChange", `No change ${id}`, { id });
  }
  if (entry.undoneAt !== null) {
    throw failure("app.alreadyUndone", "This change has already been undone.");
  }
  if (entry.moved) {
    undoMove(entry);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field === "injuries") {
    unhealed(entry.uid);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.captaincy) {
    undoCaptain(entry);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  const found = currentValues(entry.entity, entry.uid)[entry.field];
  if (found !== entry.new) {
    const message = `${entry.field} is now ${found}, not ${entry.new}; the game has changed it since`;
    throw failure("edit.conflict", message, { field: entry.field, expected: entry.new, found: found ?? 0 });
  }
  writeValue(entry.entity, entry.uid, entry.field, entry.old);
  entry.undoneAt = Date.now();
  return { ...entry };
}

// Moves to other clubs ----------------------------------------------------------------------------------------------

/** The players moved to another club, with how many of their moves are not undone. */
const movedPlayers = new Map<number, number>();

/** What a list row says about the player's club and contract end. */
type ClubRow = Pick<PlayerSummary, "club" | "clubUid" | "contractExpires">;

/**
 * What each move (by the id of its logged change) found in the list row and on top of the profile, for its undo; a
 * swap also keeps the row of the player who went the other way.
 */
const moveUndo = new Map<number, { row: ClubRow; written?: FieldValues; other?: { uid: number; row: ClubRow } }>();

/** The men's fixture club whose squad list is full, so that the move dialog's refusal can be seen. */
const FULL_CLUB = 500 + (CLUBS.length - 1) * 7;

/** `plan_club_move`: the checks of the real command that the fixtures can have, with its messages. */
function planMove(uid: number, clubUid: number, terms: MoveTerms): MovePreview {
  const player = players.find((p) => p.uid === uid);
  const to = clubs.find((c) => c.uid === clubUid);
  if (!player) {
    throw notFound("player", uid);
  }
  if (!to) {
    throw notFound("club", clubUid);
  }
  const outOfRange = (field: string, value: number, min: number, max: number) =>
    failure("move.outOfRange", `${value} is not a valid ${field}; it takes ${min} to ${max}`, { field, value, min, max });
  if (terms.wage !== undefined && (!Number.isInteger(terms.wage) || terms.wage < 0 || terms.wage > 10_000_000)) {
    throw outOfRange("contract.wage", terms.wage, 0, 10_000_000);
  }
  const tomorrow = numberFromDate(GAME_DATE) + 1;
  if (terms.expires !== undefined && (dateFromNumber(terms.expires) === null || terms.expires < tomorrow || terms.expires > 21001231)) {
    throw outOfRange("contract.expires", terms.expires, tomorrow, 21001231);
  }
  if (player.clubUid === null) {
    throw failure("move.freeAgent", "the player has no club; free agents cannot be moved yet");
  }
  if (player.clubUid === clubUid) {
    throw failure("move.sameClub", "the player is at this club already");
  }
  if (staff.some((s) => s.isHuman && s.clubUid === player.clubUid)) {
    throw failure(
      "move.humanClub",
      "the player is at a club a human manager runs; its tactics and training point at him too, so he leaves it in the game itself",
    );
  }
  if (to.women) {
    throw failure("move.menAndWomen", "one club is a men's club and the other a women's club");
  }
  if (clubUid === FULL_CLUB) {
    const message = "the club's squad list has no room for another player (36 now), and the editor cannot make it bigger";
    throw failure("move.noRoom", message, { players: 36 });
  }
  const from = clubs.find((c) => c.uid === player.clubUid)!;
  return { from: { uid: from.uid, name: from.name }, to: { uid: to.uid, name: to.name } };
}

/** `move_player`: moves the fixture player and logs it as a change of his `club`. */
function movePlayer(uid: number, clubUid: number, terms: MoveTerms): LoggedChange {
  const preview = planMove(uid, clubUid, terms);
  const player = players.find((p) => p.uid === uid)!;
  const id = changes.length + 1;
  moveUndo.set(id, {
    row: { club: player.club, clubUid: player.clubUid, contractExpires: player.contractExpires },
    written: written.get(`player:${uid}`),
  });
  player.club = preview.to.name;
  player.clubUid = preview.to.uid;
  if (terms.expires !== undefined) {
    player.contractExpires = dateFromNumber(terms.expires);
  }
  if (terms.wage !== undefined) {
    writeValue("player", uid, "contract.wage", terms.wage);
  }
  movedPlayers.set(uid, (movedPlayers.get(uid) ?? 0) + 1);
  const logged: LoggedChange = {
    id,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "club",
    old: preview.from.uid,
    new: preview.to.uid,
    undoneAt: null,
    batch: null,
    moved: { from: preview.from.name, to: preview.to.name },
  };
  changes.push(logged);
  return { ...logged };
}

/** `plan_club_swap`: the checks of the real command that the fixtures can have, with its messages. */
function planSwap(uid: number, otherUid: number): MovePreview {
  const player = players.find((p) => p.uid === uid);
  const other = players.find((p) => p.uid === otherUid);
  if (!player) {
    throw notFound("player", uid);
  }
  if (!other) {
    throw notFound("player", otherUid);
  }
  for (const p of [player, other]) {
    if (p.clubUid === null) {
      throw failure("move.freeAgent", "the player has no club; free agents cannot be moved yet");
    }
    if (staff.some((s) => s.isHuman && s.clubUid === p.clubUid)) {
      throw failure(
        "move.humanClub",
        "the player is at a club a human manager runs; its tactics and training point at him too, so he leaves it in the game itself",
      );
    }
  }
  if (player.clubUid === other.clubUid) {
    throw failure("move.sameClub", "the player is at this club already");
  }
  const from = clubs.find((c) => c.uid === player.clubUid)!;
  const to = clubs.find((c) => c.uid === other.clubUid)!;
  return { from: { uid: from.uid, name: from.name }, to: { uid: to.uid, name: to.name } };
}

/** `swap_players`: the two fixture players change clubs, logged as one change of the first one's club. */
function swapPlayers(uid: number, otherUid: number): LoggedChange {
  const preview = planSwap(uid, otherUid);
  const player = players.find((p) => p.uid === uid)!;
  const other = players.find((p) => p.uid === otherUid)!;
  const id = changes.length + 1;
  const rowOf = (p: PlayerSummary) => ({ club: p.club, clubUid: p.clubUid, contractExpires: p.contractExpires });
  moveUndo.set(id, { row: rowOf(player), written: written.get(`player:${uid}`), other: { uid: otherUid, row: rowOf(other) } });
  Object.assign(player, { club: preview.to.name, clubUid: preview.to.uid });
  Object.assign(other, { club: preview.from.name, clubUid: preview.from.uid });
  for (const moved of [uid, otherUid]) {
    movedPlayers.set(moved, (movedPlayers.get(moved) ?? 0) + 1);
  }
  const logged: LoggedChange = {
    id,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "club",
    old: preview.from.uid,
    new: preview.to.uid,
    undoneAt: null,
    batch: null,
    moved: { from: preview.from.name, to: preview.to.name, with: other.name },
  };
  changes.push(logged);
  return { ...logged };
}

/** One fewer move of the player `uid` stands. */
function unmoved(uid: number): void {
  const live = (movedPlayers.get(uid) ?? 1) - 1;
  if (live > 0) {
    movedPlayers.set(uid, live);
  } else {
    movedPlayers.delete(uid);
  }
}

/** Puts back what the move (or swap) logged as `entry` changed, unless a player has moved again since. */
function undoMove(entry: LoggedChange): void {
  const player = players.find((p) => p.uid === entry.uid);
  const before = moveUndo.get(entry.id);
  const other = before?.other && players.find((p) => p.uid === before.other!.uid);
  if (!player || !before || player.clubUid !== entry.new || (before.other && other?.clubUid !== entry.old)) {
    throw failure("move.changed", "the game has changed the player's club since; reload and try again");
  }
  if (before.other && other) {
    Object.assign(other, before.other.row);
    unmoved(other.uid);
  }
  Object.assign(player, before.row);
  if (before.written) {
    written.set(`player:${entry.uid}`, before.written);
  } else {
    written.delete(`player:${entry.uid}`);
  }
  unmoved(entry.uid);
}

// Healing -----------------------------------------------------------------------------------------------------------

/**
 * `heal_player`: the fixture player gets over his injuries, logged as a change of his `injuries` to none; `batch`
 * groups the healings of a team-wide action.
 */
function healPlayer(uid: number, batch: number | null = null): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const injuries = injuriesOf(uid).length;
  if (injuries === 0) {
    throw failure("heal.notInjured", "the player has no injury to heal");
  }
  healedPlayers.add(uid);
  const logged: LoggedChange = {
    id: changes.length + 1,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "injuries",
    old: injuries,
    new: 0,
    undoneAt: null,
    batch,
  };
  changes.push(logged);
  return { ...logged };
}

/** Lists the injuries of the player `uid` again. */
function unhealed(uid: number): void {
  healedPlayers.delete(uid);
}

// Squads and captains -----------------------------------------------------------------------------------------------

/** The captains changed through the editor, by `club:team`. */
const captainsSet = new Map<string, { captain: number | null; viceCaptain: number | null }>();

/** What each captaincy (by the id of its logged change) found and left, for its undo. */
const captainUndo = new Map<number, { key: string; before: CaptainPair; after: CaptainPair }>();

type CaptainPair = { captain: number | null; viceCaptain: number | null };

/**
 * The teams of a fixture club, as UIDs: the senior team holds the players over 21 and the best youngsters, the
 * under-21s and under-18s the other youngsters. The weakest senior player is out on loan. Women's clubs have no
 * fixture players, so their one team is empty.
 */
function fixtureTeams(clubUid: number): { kind: number; ageLimit: number | null; uids: number[]; out: number | null }[] {
  const own = players.filter((p) => p.clubUid === clubUid).sort((a, b) => b.currentAbility - a.currentAbility);
  const young = (p: PlayerSummary, limit: number) => p.age !== null && p.age <= limit;
  const senior = own.filter((p, i) => !young(p, 21) || i < 4);
  const rest = own.filter((p) => !senior.includes(p));
  const teams = [
    { kind: 0, ageLimit: null, uids: senior.map((p) => p.uid), out: senior[senior.length - 1]?.uid ?? null },
    { kind: 10, ageLimit: 21, uids: rest.filter((p) => !young(p, 18)).map((p) => p.uid), out: null },
    { kind: 12, ageLimit: 18, uids: rest.filter((p) => young(p, 18)).map((p) => p.uid), out: null },
  ];
  return own.length === 0 ? teams.slice(0, 1) : teams;
}

/** The captains of a fixture team: the senior team's two best players until the editor changes them. */
function captainsOf(clubUid: number, index: number, uids: number[]): CaptainPair {
  const set = captainsSet.get(`${clubUid}:${index}`);
  if (set) {
    return set;
  }
  return index === 0 ? { captain: uids[0] ?? null, viceCaptain: uids[1] ?? null } : { captain: null, viceCaptain: null };
}

/** `club_squads`: the fixture club's teams with their players' list rows and live values. */
function clubSquads(clubUid: number): ClubTeam[] {
  if (!clubs.some((c) => c.uid === clubUid)) {
    throw notFound("club", clubUid);
  }
  return fixtureTeams(clubUid).map((team, index) => ({
    index,
    kind: team.kind,
    ageLimit: team.ageLimit,
    ...captainsOf(clubUid, index, team.uids),
    players: team.uids.map((uid): SquadPlayer => {
      const row = players.find((p) => p.uid === uid)!;
      const d = details(row);
      return {
        ...row,
        playsHere: uid !== team.out,
        loan: uid === team.out ? "out" : null,
        condition: d.condition,
        matchSharpness: d.matchSharpness,
        morale: d.morale,
        injuries: d.injuries.length,
      };
    }),
  }));
}

/** The team at `index` of the fixture club, or the real command's failure. */
function fixtureTeam(clubUid: number, index: number): ClubTeam {
  const team = clubSquads(clubUid).find((t) => t.index === index);
  if (!team) {
    throw failure("squad.noTeam", `the club has no team number ${index} that checks out`, { index });
  }
  return team;
}

/** `set_captain`: the checks of the real command, a swap when he held the other role, and the log entry. */
function setCaptain(clubUid: number, index: number, role: CaptainRole, uid: number): LoggedChange {
  const team = fixtureTeam(clubUid, index);
  if (!team.players.some((p) => p.uid === uid && p.playsHere)) {
    throw failure("captain.notInTeam", "the player does not play for this team");
  }
  const [key, otherKey] = role === "captain" ? (["captain", "viceCaptain"] as const) : (["viceCaptain", "captain"] as const);
  const old = team[key];
  if (old === uid) {
    throw failure("captain.unchanged", "The player holds that role already.");
  }
  const swapped = team[otherKey] === uid;
  const before: CaptainPair = { captain: team.captain, viceCaptain: team.viceCaptain };
  const after: CaptainPair = { ...before, [key]: uid, ...(swapped && { [otherKey]: old }) };
  const keyOf = `${clubUid}:${index}`;
  captainsSet.set(keyOf, after);
  const nameOf = (u: number) => players.find((p) => p.uid === u)?.name ?? String(u);
  const logged: LoggedChange = {
    id: changes.length + 1,
    at: Date.now(),
    name: clubs.find((c) => c.uid === clubUid)!.name,
    entity: "club",
    uid: clubUid,
    field: role === "captain" ? "captain" : "vice_captain",
    old: old ?? 0,
    new: uid,
    undoneAt: null,
    batch: null,
    captaincy: {
      team: index,
      kind: team.kind,
      ageLimit: team.ageLimit,
      from: old === null ? null : nameOf(old),
      to: nameOf(uid),
      swapped,
    },
  };
  captainUndo.set(logged.id, { key: keyOf, before, after });
  changes.push(logged);
  return { ...logged };
}

/** Gives back the captaincies the change `entry` took, unless they have changed again since. */
function undoCaptain(entry: LoggedChange): void {
  const undo = captainUndo.get(entry.id);
  const [clubUid, index] = undo ? undo.key.split(":").map(Number) : [0, 0];
  const now = undo && captainsOf(clubUid, index, []);
  if (!undo || now?.captain !== undo.after.captain || now?.viceCaptain !== undo.after.viceCaptain) {
    throw failure("move.changed", "the game has changed the memory at 0x0 since; reload and try again", { address: "0x0" });
  }
  captainsSet.set(undo.key, undo.before);
}

/** `team_action`: the action on every player of the fixture team, logged as one batch like a mass edit. */
function teamAction(clubUid: number, index: number, action: TeamAction): MassReport {
  const team = fixtureTeam(clubUid, index);
  const batch = nextMassId++;
  const report: MassReport = { batch, applied: 0, failed: [] };
  if (action === "heal") {
    for (const player of team.players.filter((p) => p.injuries > 0)) {
      healPlayer(player.uid, batch);
      report.applied++;
    }
    return report;
  }
  const values: [string, number][] =
    action === "inspire" ? [["morale", 20]] : [["condition", 10_000], ["match_sharpness", 10_000]];
  for (const player of team.players) {
    const now = currentValues("player", player.uid);
    for (const [field, value] of values) {
      if (now[field] === value) {
        continue;
      }
      writeValue("player", player.uid, field, value);
      const logged: LoggedChange = {
        id: changes.length + 1,
        at: Date.now(),
        name: player.name,
        entity: "player",
        uid: player.uid,
        field,
        old: now[field],
        new: value,
        undoneAt: null,
        batch,
      };
      changes.push(logged);
      report.applied++;
    }
  }
  return report;
}

// Mass edits --------------------------------------------------------------------------------------------------------

/** Most targets one mass edit may change, and most rows a preview lists, as with the real commands. */
const MASS_LIMIT = 10_000;
const PREVIEW_ROWS = 500;

/** Whether `name` (with the other names it is found by) and `uid` match `query`, as the real search does. */
function matchesQuery(query: string, uid: number, names: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return String(uid) === query.trim() || words.every((w) => fold(names).includes(w));
}

/** The players, staff or clubs a search and the entity's filter select, as the real `plan_mass_edit` does. */
function selectTargets(entity: Entity, query: string, filters: MassFilters): { uid: number; name: string }[] {
  if (entity === "player") {
    const filter = filters.playerFilter ?? {};
    return players.filter((p) => matchesQuery(query, p.uid, `${p.name} ${p.fullName ?? ""}`) && matchesPlayerFilter(p, filter));
  }
  if (entity === "staff") {
    const filter = filters.staffFilter ?? {};
    return staff.filter((s) => matchesQuery(query, s.uid, `${s.name} ${s.fullName ?? ""}`) && matchesStaffFilter(s, filter));
  }
  const women = filters.clubFilter?.women;
  return clubs.filter((c) => matchesQuery(query, c.uid, `${c.name} ${c.shortName ?? ""}`) && (women === undefined || c.women === women));
}

/** The mass edit last previewed, until it is applied or replaced. */
let pendingMass: { id: number; entity: Entity; planned: PlannedChange[] } | null = null;
let nextMassId = 1;

/** What an operation turns `old` into, as the real one does: added and scaled values stay within the field's range. */
function operate(field: EditField, operation: MassOperationKind, old: number): number {
  const clamp = (value: number) => Math.min(field.max, Math.max(field.min, value));
  switch (operation.op) {
    case "set":
      return operation.value;
    case "add":
      return clamp(old + operation.amount);
    case "scale":
      return clamp(Math.round((old * operation.percent) / 100));
  }
}

/** `plan_mass_edit`, with the real command's checks and messages. */
function planMass(entity: Entity, query: string, filters: MassFilters, operations: MassOperation[]): MassPreview {
  if (operations.length === 0) {
    throw failure("mass.noOperations", "Choose at least one field to change.");
  }
  const targets = selectTargets(entity, query, filters);
  if (targets.length > MASS_LIMIT) {
    const message = `${targets.length} match. Narrow the search or the filters to ${MASS_LIMIT} or fewer for a mass edit.`;
    throw failure("mass.tooMany", message, { count: targets.length, limit: MASS_LIMIT });
  }
  const table = fieldTable(entity);
  const ops = operations.map(({ field: key, operation }) => {
    const field = table.find((f) => f.key === key);
    if (!field) {
      throw failure("edit.unknownField", `${entity} has no editable field ${key}`, { entity, field: key });
    }
    if (operation.op === "set" && (operation.value < field.min || operation.value > field.max)) {
      const message = `${operation.value} is not a valid ${key}; it takes ${field.min} to ${field.max}`;
      throw failure("edit.outOfRange", message, { field: key, value: operation.value, min: field.min, max: field.max });
    }
    if (operation.op !== "set" && field.kind === "date") {
      throw failure("edit.unsupported", `${key}: a date can only be set`, { field: key, reason: "a date can only be set" });
    }
    return { field, operation };
  });
  const planned: PlannedChange[] = [];
  const skipped: SkippedField[] = [];
  let unchanged = 0;
  for (const { uid, name } of targets) {
    const values = currentValues(entity, uid);
    let changed = false;
    for (const { field, operation } of ops) {
      const old: number | undefined = values[field.key];
      if (old === undefined) {
        const reason = `${field.key} cannot be changed here: its record is missing or does not check out`;
        skipped.push({ uid, name, field: field.key, reason, code: "edit.noRecord", params: { field: field.key } });
        continue;
      }
      const value = operate(field, operation, old);
      if (value !== old) {
        changed = true;
        planned.push({ uid, name, field: field.key, old, new: value });
      }
    }
    unchanged += changed ? 0 : 1;
  }
  const id = nextMassId++;
  pendingMass = { id, entity, planned };
  return {
    id,
    targets: targets.length,
    unchanged,
    changes: planned.length,
    rows: planned.slice(0, PREVIEW_ROWS),
    skippedCount: skipped.length,
    skipped: skipped.slice(0, PREVIEW_ROWS),
  };
}

/** `apply_mass_edit`: the previewed changes, each only while the value is still the one previewed. */
function applyMass(id: number): MassReport {
  if (!pendingMass || pendingMass.id !== id) {
    throw failure("mass.outOfDate", "This preview is out of date. Preview the mass edit again.");
  }
  const { entity, planned } = pendingMass;
  pendingMass = null;
  const batch = nextMassId++;
  const report: MassReport = { batch, applied: 0, failed: [] };
  for (const change of planned) {
    const found = currentValues(entity, change.uid)[change.field];
    if (found !== change.old) {
      const message = `${change.field} is now ${found}, not ${change.old}; the game has changed it since`;
      const params = { field: change.field, expected: change.old, found: found ?? 0 };
      report.failed.push({ ...change, error: failure("edit.conflict", message, params) });
      continue;
    }
    writeValue(entity, change.uid, change.field, change.new);
    changes.push({ ...change, id: changes.length + 1, at: Date.now(), entity, undoneAt: null, batch });
    report.applied++;
  }
  return report;
}

/** `undo_batch`: every change of the batch not undone yet, newest first. */
function undoMassBatch(batch: number): BatchUndo {
  const report: BatchUndo = { undone: 0, failed: [] };
  for (const entry of [...changes].reverse()) {
    if (entry.batch !== batch || entry.undoneAt !== null) {
      continue;
    }
    try {
      undoChange(entry.id);
      report.undone++;
    } catch (e) {
      // `undoChange` fails the way the real command does, with a failure.
      report.failed.push({ id: entry.id, error: e as Failure });
    }
  }
  return report;
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
  return withWrittenClub({
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
  });
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
    (f.clubUid === undefined || p.clubUid === f.clubUid) &&
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

/** The fixture connection, once `connect` has been called in this page. */
let mockConnection: ConnectionInfo | null = null;

/**
 * `?macos` in the address previews the connect panel on macOS: the bridge is not set up, Steam is running, and the game
 * was started without the bridge. The first set-up meets a running Steam, as the real one would; the next one works.
 */
const macPreview = new URLSearchParams(window.location.search).has("macos");
const notSetUp = (): BridgeInfo => ({
  ready: false,
  installed: false,
  launchOption:
    'DYLD_INSERT_LIBRARIES="/Users/me/Library/Application Support/FMLibreEditor/libfmlibre_bridge.dylib" %command%',
  steamRunning: true,
  accounts: [{ id: "123456789", launchOptions: null, loadsBridge: false }],
});
let mockBridge = notSetUp();

export async function mockInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  switch (command) {
    case "detect_game": {
      const noBridge: Failure = {
        code: "memory.noBridge",
        params: { pid: String(game.pid) },
        message: `macOS does not let FMLibreEditor into the game (pid ${game.pid}): it was started without the bridge`,
      };
      const reachable = !macPreview || mockBridge.ready;
      const detection: Detection = {
        elevated: false,
        games: [
          reachable
            ? { pid: game.pid, info: game, pluginLoaded: true, error: null }
            : { pid: game.pid, info: null, pluginLoaded: false, error: noBridge },
        ],
        bridge: macPreview ? mockBridge : null,
      };
      return detection as T;
    }
    case "set_up_bridge": {
      const wasRunning = mockBridge.steamRunning;
      mockBridge = { ...mockBridge, installed: true, steamRunning: false };
      if (wasRunning) {
        const failure: Failure = { code: "setup.steamRunning", params: {}, message: "Steam is running" };
        throw failure;
      }
      const launchOptions = mockBridge.launchOption;
      mockBridge = { ...mockBridge, ready: true, accounts: [{ id: "123456789", launchOptions, loadsBridge: true }] };
      return mockBridge as T;
    }
    case "remove_bridge":
      mockBridge = { ...notSetUp(), steamRunning: false };
      return mockBridge as T;
    case "bridge_status":
      return (macPreview ? mockBridge : null) as T;
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
      mockConnection = info;
      return info as T;
    }
    case "graphics_info":
      // A plain browser has no graphics packs: every picture falls back.
      return { root: null, ready: true, counts: { clubLogos: 0, faces: 0, flags: 0, competitionLogos: 0 } } as T;
    case "current_connection":
      // Like the real command after a window reload; here a reload starts the fixtures afresh, so it is null then.
      return (mockConnection && { ...mockConnection, loadMs: 0 }) as T;
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
        throw notFound("club", uid);
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
        throw notFound("staff", uid);
      }
      return staffDetails(member) as T;
    }
    case "player_details": {
      const uid = Number(args?.uid);
      const player = players.find((p) => p.uid === uid);
      if (!player) {
        throw notFound("player", uid);
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
    case "plan_mass_edit":
      return planMass(
        args?.entity as Entity,
        String(args?.query ?? ""),
        (args?.filters ?? {}) as MassFilters,
        (args?.operations ?? []) as MassOperation[],
      ) as T;
    case "apply_mass_edit":
      return applyMass(Number(args?.id)) as T;
    case "undo_batch":
      return undoMassBatch(Number(args?.batch)) as T;
    case "plan_club_move":
      return planMove(Number(args?.uid), Number(args?.club), (args?.terms ?? {}) as MoveTerms) as T;
    case "move_player":
      return movePlayer(Number(args?.uid), Number(args?.club), (args?.terms ?? {}) as MoveTerms) as T;
    case "plan_club_swap":
      return planSwap(Number(args?.uid), Number(args?.other)) as T;
    case "heal_player":
      return healPlayer(Number(args?.uid)) as T;
    case "club_squads":
      return clubSquads(Number(args?.uid)) as T;
    case "set_captain":
      return setCaptain(Number(args?.club), Number(args?.team), args?.role as CaptainRole, Number(args?.uid)) as T;
    case "team_action":
      return teamAction(Number(args?.club), Number(args?.team), args?.action as TeamAction) as T;
    case "swap_players":
      return swapPlayers(Number(args?.uid), Number(args?.other)) as T;
    default:
      throw new Error(`No fixture for command "${command}"`);
  }
}
