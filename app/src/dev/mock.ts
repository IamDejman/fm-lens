// Stand-ins for the Rust commands so the UI can be developed in a plain browser
// (`npm run dev`) without the game or Tauri. Every player here is made up.

import { dateFromNumber, numberFromDate } from "../editing";
import { fold } from "../format";
import { BOARD_JOBS, fitOf } from "../recipes";
import { version as appVersion } from "../../package.json";
import type {
  ApplyReport,
  AttributeBound,
  BestFor,
  Fit,
  Yours,
  ClubMoney,
  FeePlan,
  Nation,
  NamedPerson,
  NationDetails,
  NationalTeam,
  NationPage,
  NationSummary,
  OfficialPage,
  OfficialSummary,
  AwardPage,
  AwardSummary,
  CompetitionPage,
  CompetitionRule,
  CompetitionSummary,
  StadiumFilter,
  OfficialFilter,
  CompetitionFilter,
  AwardFilter,
  NationFilter,
  StadiumPage,
  StadiumSummary,
  BridgeInfo,
  CaptainRole,
  ClubTeam,
  SquadPlayer,
  TeamAction,
  ClubDetails,
  Language,
  ClubFilter,
  ClubPage,
  ClubSummary,
  CheckKey,
  ConnectionInfo,
  Detection,
  Failure,
  FmDate,
  FutureTransfer,
  GameInfo,
  Health,
  Ban,
  Promise as PlayerPromise,
  Injury,
  LoanTerms,
  WorkPermit,
  Preference,
  Tie,
  Clause,
  CompetitionBonus,
  TieKind,
  PlayerDetails,
  PlayerFilter,
  PlayerOrder,
  PlayerPage,
  PlayerRow,
  ScoutReport,
  SimilarTo,
  TopKind,
  TopPlaces,
  TopScope,
  PlayerSummary,
  Refrozen,
  ReloadInfo,
  StaffDetails,
  StaffFilter,
  StaffPage,
  StaffSummary,
  EditField,
  Entity,
  ExportReport,
  SavedCard,
  FieldEdit,
  FieldValues,
  LoggedChange,
  BatchUndo,
  MassFilters,
  MassOperation,
  MassOperationKind,
  MassPreview,
  MassReport,
  ManagerPreview,
  MovePreview,
  ReleasePreview,
  MoveTerms,
  PlannedChange,
  SkippedField,
} from "../types";

const GAME_DATE: FmDate = { year: 2026, month: 7, day: 18 };

/** The age on `today` of someone born on `born`. */
const ageOn = (born: FmDate, today: FmDate) =>
  today.year - born.year - (today.month * 100 + today.day < born.month * 100 + born.day ? 1 : 0);

const game: GameInfo = {
  pid: 4242,
  exePath: "D:\\Games\\Football Manager 27\\Content\\fm.exe",
  storefront: "gamePass",
  edition: 27,
  packageFullName: "SportsInteractive.FootballManager27_0.9.2409.0_x64__5w3tn6tb6stnm",
  packageVersion: "0.9.2409.0",
  steamBuild: null,
};

const FIRST = ["Arda", "Mateo", "Lukas", "Kerem", "Jonas", "Rafael", "Emre", "Noah", "Tiago", "Søren", "Ilkay", "Bruno"];
const LAST = ["Yılmaz", "Fernández", "Hoffmann", "Aydın", "Lindqvist", "Moreau", "Çelik", "Kowalski", "Silva", "Novák"];
const NATIONS = ["Türkiye", "Spain", "Germany", "Brazil", "Denmark", "France", "Poland", "Portugal", "Czechia"];
const CLUBS = ["Northbridge FC", "Atlético Riverside", "Sporting Harbour", "FC Lindenau", "Kuzey Spor", "Old Mill United"];

/** Where the game would keep each fixture nation: what a nation field holds. */
const nationAddress = (nation: string) => 0x7f00_0000 + NATIONS.indexOf(nation) * 0x400;

/** The fixture nation a nation field's value stands for. */
const nationAt = (address: number) => NATIONS.find((nation) => nationAddress(nation) === address);

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

/** Squad status codes the fixtures draw from: FM's five main ones, a few others it uses, and 14, which has no name. */
const MOCK_SQUAD_STATUSES = [1, 2, 3, 4, 5, 7, 10, 11, 14, 22];

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

/** Made-up grounds no club of the sample save plays at: a national stadium, a closed one, a training ground. */
const UNPLAYED_GROUNDS: readonly (readonly [string, number])[] = [
  ["National Stadium", 61000],
  ["Old Riverside Ground", 18500],
  ["Harbour Training Centre", 2400],
];

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
      age: ageOn(born, GAME_DATE),
      ...withUids(nation, club),
      positions: playablePositions(ratings[uid]),
      contractExpires: club === null ? null : contractEnd(own),
      currentAbility: ca,
      potentialAbility,
      // Read from the profile when he is listed (see `listed`), so the row and the profile agree.
      value: null,
      wage: null,
      currentReputation: 0,
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
    transferValue: player.clubUid ? player.currentAbility * 250_000 : 0,
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
          squadStatus: MOCK_SQUAD_STATUSES[Math.floor(next() * MOCK_SQUAD_STATUSES.length)],
          squadNumber: 1 + Math.floor(next() * 40),
          transferListed: next() < 0.1,
          loanListed: false,
          loyaltyBonus: Math.round(next() * 30000),
          happiness: Math.round(-20 + next() * 100),
          playingTimeHappiness: Math.round(next() * 40),
          clauses: clausesOf(player.uid, [
            { index: 0, kind: 32, amount: Math.round(10000 + next() * 60000), condition: null },
            { index: 1, kind: 33, amount: Math.round(5000 + next() * 40000), condition: null },
            { index: 2, kind: 38, amount: Math.round(2000 + next() * 15000), condition: null },
            ...(next() < 0.5 ? [{ index: 3, kind: 0, amount: Math.round(50 + next() * 500) * 1_000_000, condition: null }] : []),
            ...(next() < 0.5 ? [{ index: 4, kind: 22, amount: null, condition: 1 }] : []),
            ...(player.uid % 4 === 0 ? [{ index: 5, kind: 13, amount: 275_000, condition: 20 }] : []),
            ...(player.uid % 6 === 0 ? [{ index: 6, kind: 55, amount: 28_000_000, condition: null }] : []),
          ]),
          // Some contracts pay for a competition: a league's, and now and then one whose UID names none.
          competitionBonuses: [
            ...(player.uid % 5 === 0 ? [competitionBonus(0, 100, Math.round(100 + next() * 900) * 1_000)] : []),
            ...(player.uid % 10 === 0 ? [competitionBonus(1, 9_999, 250_000)] : []),
          ],
          // A few players have reasons to be unhappy: one over, and one or two that last.
          concerns:
            next() < 0.3
              ? [
                  { started: { year: 2026, month: 7, day: 2 }, ended: { year: 2026, month: 7, day: 9 }, motive: 1202, kind: 1 },
                  { started: { year: 2026, month: 7, day: 12 }, ended: null, motive: 926, kind: 1 },
                  ...(next() < 0.5 ? [{ started: { year: 2026, month: 7, day: 15 }, ended: null, motive: 596, kind: 2 }] : []),
                ]
              : [],
          // A player moved to another club signed today, without a squad number, off the transfer list.
          ...(movedPlayers.has(player.uid) && {
            signed: GAME_DATE,
            joined: GAME_DATE,
            squadNumber: null,
            transferListed: false,
          }),
        }
      : null,
    // As stored: energy and match sharpness 0–10000 (the game keeps sharpness at 35% or more), and jadedness
    // from -500, fully rested, to a little above 0 early in a season.
    condition: Math.round(7000 + next() * 3000),
    matchSharpness: Math.round(3500 + next() * 6500),
    jadedness: Math.round(-500 + next() * 600),
    traits: [7, 10, 19, 20, 35, 43, 51].filter(() => next() < 0.4),
    injuries: injuriesOf(player.uid),
    bans: bansOf(player.uid),
    promises: promisesOf(player.uid),
    ties: tiesOf(player),
    tieRoom: tieRoomOf(player),
    preferences: currentPreferences(false, player.uid),
    languages: currentLanguages(false, player.uid),
    clauseRoom: player.club ? clauseRoomOf(player.uid) : 0,
    loan: loanOf(player),
    workPermits: workPermitsOf(player),
    futureTransfers: futureTransfersOf(player),
    retirementKnown: true,
    retires: retiresOf(player.uid),
    // Drawn last, so that the values above come out as before.
    morale: Math.round(7 + next() * 10),
  });
}

/** Every eleventh player at a club is there on loan from another club, which pays half his wage. */
function loanOf(player: PlayerSummary): LoanTerms | null {
  if (endedLoans.has(player.uid)) {
    return null;
  }
  const started = startedLoans.get(player.uid);
  if (started) {
    return {
      parent: started.parent,
      parentUid: started.parentUid,
      wage: 0,
      starts: GAME_DATE,
      ends: started.ends,
      futureFee: null,
    };
  }
  if (!player.club || player.uid % 11 !== 0) {
    return null;
  }
  const parent = CLUBS[(CLUBS.indexOf(player.club) + 1) % CLUBS.length] ?? CLUBS[0]!;
  return {
    parent,
    parentUid: 1000 + CLUBS.indexOf(parent),
    wage: 5000 + (player.uid % 9) * 2500,
    starts: { year: 2026, month: 8, day: 10 },
    ends: { year: 2027, month: 6, day: 29 },
    // Every other one has a future fee, which End loan refuses.
    futureFee: player.uid % 2 === 0 ? 25_000_000 : null,
  };
}

/**
 * The moves the game agreed for a player on a later day, by UID, once the editor changed them: a free agent's signing
 * made with a date, or none after a cancel. Before that, every 13th player at a club has a deal agreed with another.
 */
const futureTransfers = new Map<number, FutureTransfer[]>();
/** The exact offer associated with each deferred signing in the change log. */
const signingOffers = new Map<number, number>();

function futureTransfersOf(player: PlayerSummary): FutureTransfer[] {
  const fixture = (club: string): FutureTransfer => {
    const to = CLUBS[(CLUBS.indexOf(club) + 2) % CLUBS.length] ?? CLUBS[0]!;
    const joins = { year: 2027, month: 7, day: 1 };
    return { offer: 500 + player.uid, club: to, clubUid: 1000 + CLUBS.indexOf(to), joins };
  };
  const agreed =
    futureTransfers.get(player.uid) ?? (player.club && player.uid % 13 === 0 ? [fixture(player.club)] : []);
  return agreed.map((transfer) => ({ ...transfer }));
}

/** `plan_cancel_future_transfers`: the fixture player's agreed moves, or why there are none to cancel. */
function planCancelFutureTransfers(uid: number): FutureTransfer[] {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const agreed = futureTransfersOf(player);
  if (agreed.length === 0) {
    throw failure("move.notPending", "the transfer is no longer waiting for its day: FM has made it or cancelled it");
  }
  return agreed;
}

/** `cancel_future_transfers`: the game cancels them all; each is logged as a change nothing undoes. */
function cancelFutureTransfers(uid: number): LoggedChange[] {
  const agreed = planCancelFutureTransfers(uid);
  const name = players.find((p) => p.uid === uid)?.name ?? "";
  futureTransfers.set(uid, []);
  return agreed.map((transfer) => {
    for (const entry of changes) {
      if (entry.uid === uid && !entry.earlierGame && entry.undoneAt === null
        && signingOffers.get(entry.id) === transfer.offer) {
        entry.permanent = true;
      }
    }
    const logged: LoggedChange = {
      id: changes.length + 1,
      at: Date.now(),
      name,
      entity: "player",
      uid,
      field: "future_transfer",
      old: transfer.clubUid ?? 0,
      new: 0,
      undoneAt: null,
      batch: null,
      moved: {
        ...(transfer.club === null ? {} : { to: transfer.club }),
        ...(transfer.joins === null ? {} : { joins: numberFromDate(transfer.joins) }),
      },
      permanent: true,
    };
    changes.push(logged);
    return { ...logged };
  });
}

/** The loans the editor had the game start, by UID: the club he is loaned from, until when. */
const startedLoans = new Map<number, { parent: string; parentUid: number; ends: FmDate }>();

/** `start_loan`: the game loans the fixture player to `clubUid` from today until `ends`. */
function startLoan(uid: number, clubUid: number, ends: number): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const to = clubs.find((c) => c.uid === clubUid);
  if (!to) {
    throw notFound("club", clubUid);
  }
  if (!player.club || player.clubUid === null) {
    throw failure("move.freeAgent", "the player has no club; free agents cannot be moved yet");
  }
  if (loanOf(player)) {
    throw failure("move.onLoan", "the player is on loan, to his club or from it");
  }
  if (player.clubUid === clubUid) {
    throw failure("move.sameClub", "the player is at that club already");
  }
  const endsOn = dateFromNumber(ends);
  if (!endsOn || ends <= numberFromDate(GAME_DATE)) {
    throw failure("move.outOfRange", "loan.ends is out of range", {
      field: "loan.ends",
      value: ends,
      min: numberFromDate(addDays(GAME_DATE, 1)),
      max: 21001231,
    });
  }
  const from = { name: player.club, uid: player.clubUid };
  startedLoans.set(uid, { parent: from.name, parentUid: from.uid, ends: endsOn });
  // A loaned player plays for the club he is loaned to; his parent club is in the loan.
  player.club = to.name;
  player.clubUid = to.uid;
  const logged: LoggedChange = {
    id: changes.length + 1,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "loan",
    old: from.uid,
    new: clubUid,
    undoneAt: null,
    batch: null,
    moved: { from: from.name, to: to.name },
  };
  changes.push(logged);
  return { ...logged };
}

/** The loans the editor had the game end, by UID: the loan as it was, and the club he was loaned to. */
const endedLoans = new Map<number, { loan: LoanTerms; borrower: { name: string; uid: number } }>();
/** What each loan's end replaced, by change ID: the loan the editor had started, if it was one. */
const loanEndUndo = new Map<number, { parent: string; parentUid: number; ends: FmDate } | undefined>();

/** `plan_end_loan`: the clubs the fixture player's loan would end between, as the real command checks them. */
function planEndLoan(uid: number): MovePreview {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const loan = loanOf(player);
  if (!loan || player.club === null || player.clubUid === null || loan.parentUid === null || loan.parent === null) {
    throw failure("move.notOnLoan", "the player is not on loan");
  }
  if (loan.futureFee !== null) {
    throw failure("loan.futureFee", "the loan has a future fee; ending it early would complete the transfer");
  }
  return { from: { uid: player.clubUid, name: player.club }, to: { uid: loan.parentUid, name: loan.parent } };
}

/** `end_loan`: the game ends the fixture player's loan today, and he goes back to his own club. */
function endLoan(uid: number): LoggedChange {
  const plan = planEndLoan(uid);
  const player = players.find((p) => p.uid === uid)!;
  const id = changes.length + 1;
  endedLoans.set(uid, { loan: loanOf(player)!, borrower: { name: plan.from.name, uid: plan.from.uid } });
  loanEndUndo.set(id, startedLoans.get(uid));
  startedLoans.delete(uid);
  player.club = plan.to.name;
  player.clubUid = plan.to.uid;
  const logged: LoggedChange = {
    id,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "loan",
    old: plan.from.uid,
    new: plan.to.uid,
    undoneAt: null,
    batch: null,
    moved: { from: plan.from.name, to: plan.to.name },
  };
  changes.push(logged);
  return { ...logged };
}

/** Every seventh player abroad holds an English work permit; a few of those an ESC slot. */
function workPermitsOf(player: PlayerSummary): WorkPermit[] {
  const set = permitsSet.get(player.uid);
  if (set !== undefined) {
    return set ? [{ nation: "England", nationUid: 765, esc: false, escSince: null }] : [];
  }
  if (!player.club || player.uid % 7 !== 0) {
    return [];
  }
  const esc = player.uid % 3 === 0;
  return [{ nation: "England", nationUid: 765, esc, escSince: esc ? { year: 2026, month: 2, day: 3 } : null }];
}

/** The work permits given (true) or taken away (false) through the editor, by UID. */
const permitsSet = new Map<number, boolean>();
/** What each permit change replaced, by change ID: undefined when the player had the fixture's permits. */
const permitUndo = new Map<number, boolean | undefined>();

/** `work_permit_needed`: every fifth player at a club needs none under FM's rules, as a player from its country. */
function workPermitNeeded(uid: number): boolean | null {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  return player.club ? player.uid % 5 !== 0 : null;
}

/** `set_work_permit`: the fixture player is given an English work permit, or has his taken away. */
function setWorkPermit(uid: number, granted: boolean): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  if (!player.club) {
    throw failure("move.freeAgent", "the player has no club; free agents cannot be moved yet");
  }
  const [held] = workPermitsOf(player);
  const was = held !== undefined;
  if (was === granted || (granted && !workPermitNeeded(uid))) {
    throw failure("call.declined", "the game did not make the change");
  }
  const logged: LoggedChange = {
    id: changes.length + 1,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "work_permit",
    old: held?.escSince ? numberFromDate(held.escSince) : was ? 1 : 0,
    new: granted ? 1 : 0,
    undoneAt: null,
    batch: null,
  };
  permitUndo.set(logged.id, permitsSet.get(uid));
  permitsSet.set(uid, granted);
  changes.push(logged);
  return { ...logged };
}

/** The fixture players healed through the editor, by UID, while the healing is not undone. */
const healedPlayers = new Set<number>();

/** `date` moved on by `days`. */
function addDays(date: FmDate, days: number): FmDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** How many days from `from` to `to`. */
function numberOfDays(from: FmDate, to: FmDate): number {
  const utc = (date: FmDate) => Date.UTC(date.year, date.month - 1, date.day);
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** The injuries the editor had the game give fixture players, by UID: the kind's name. */
const addedInjuries = new Map<number, string>();

/** The kinds of injury `injury_kinds` gives, in the game's order. */
const INJURY_KINDS = [
  { uid: 104, name: "Twisted ankle" },
  { uid: 110, name: "Tight hamstring" },
  { uid: 23, name: "Broken leg" },
  { uid: 57, name: "Groin strain" },
  { uid: 61, name: "Bruised ribs" },
  { uid: 88, name: "Knee ligament damage" },
  { uid: 12, name: "Calf strain" },
  { uid: 140, name: "Concussion" },
];

/** `add_injury`: the game gives the fixture player an injury of the kind `kind`, if he has none. */
function addInjury(uid: number, kindUid: number): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const kind = INJURY_KINDS.find((k) => k.uid === kindUid);
  if (!kind) {
    throw failure("injury.noKind", `the game has no kind of injury with UID ${kindUid}`, { uid: kindUid });
  }
  if (injuriesOf(uid).length > 0) {
    throw failure("injury.already", "the player is injured already");
  }
  addedInjuries.set(uid, kind.name);
  const logged: LoggedChange = {
    id: changes.length + 1,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "injuries",
    old: 0,
    new: 1,
    undoneAt: null,
    batch: null,
  };
  changes.push(logged);
  return { ...logged };
}

/** The current injuries of a fixture player: every seventh one is injured, some of them twice over, until healed. */
function injuriesOf(uid: number): Injury[] {
  const added = addedInjuries.get(uid);
  if (added !== undefined) {
    return [
      { name: added, started: GAME_DATE, backSoonest: addDays(GAME_DATE, 10), backLatest: addDays(GAME_DATE, 18), days: 18 },
    ];
  }
  if (uid % 7 !== 3 || healedPlayers.has(uid)) {
    return [];
  }
  const set = injuriesSet.get(uid);
  if (set !== undefined) {
    return set;
  }
  const injury = (name: string, daysAgo: number, soonest: number, latest: number): Injury => {
    const started = addDays(GAME_DATE, -daysAgo);
    return { name, started, backSoonest: addDays(started, soonest), backLatest: addDays(started, latest), days: latest };
  };
  const injuries = [injury("Hamstring strain", 4, 21, 35)];
  if (uid % 2 === 0) {
    injuries.push(injury("Twisted ankle", 1, 7, 12));
  }
  return injuries;
}

/** The fixture players' injuries as changed through the editor, by UID, and as they were before each change. */
const injuriesSet = new Map<number, Injury[]>();
const injuryUndo = new Map<number, Injury[]>();

/** Logs a change to a fixture player's injury, as a change of his `injury` from the days it lasted to the days now. */
function logInjury(uid: number, before: Injury, after: Injury | null, next: Injury[]): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const end = (injury: Injury | null) =>
    injury === null ? null : { name: injury.name ?? "-", rule: null, value: injury.days };
  const id = changes.length + 1;
  injuryUndo.set(id, injuriesOf(uid));
  injuriesSet.set(uid, next);
  const logged: LoggedChange = {
    id,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "injury",
    old: before.days,
    new: after?.days ?? 0,
    undoneAt: null,
    batch: null,
    tie: { from: end(before), to: end(after) },
  };
  changes.push(logged);
  return { ...logged };
}

/** The injury at `index` of a fixture player. */
function injuryAt(uid: number, index: number): Injury {
  const injury = injuriesOf(uid)[index];
  if (injury === undefined) {
    throw failure("list.missing", `the list holds nothing at number ${index}`, { index });
  }
  return injury;
}

/** `change_injury`: a fixture player's injury lasts `days` days from when it began, at the most. */
function changeInjury(uid: number, index: number, days: number): LoggedChange {
  const before = injuryAt(uid, index);
  if (!Number.isInteger(days) || days < 1 || days > 730) {
    throw failure("move.outOfRange", `${days} is not valid for days; it takes 1 to 730`, {
      field: "days",
      value: days,
      min: 1,
      max: 730,
    });
  }
  if (days === before.days) {
    throw failure("relation.same", "the player has that already");
  }
  const soonest =
    before.started && before.backSoonest
      ? Math.min(numberOfDays(before.started, before.backSoonest), days)
      : days;
  const after: Injury = {
    ...before,
    days,
    backSoonest: before.started ? addDays(before.started, soonest) : null,
    backLatest: before.started ? addDays(before.started, days) : null,
  };
  const next = injuriesOf(uid).map((injury, i) => (i === index ? after : injury));
  return logInjury(uid, before, after, next);
}

/** `remove_injury`: takes one of a fixture player's injuries out of his list. */
function removeInjury(uid: number, index: number): LoggedChange {
  const before = injuryAt(uid, index);
  const next = injuriesOf(uid).filter((_, i) => i !== index);
  return logInjury(uid, before, null, next);
}

// Ties: secondary nationalities and homegrown status --------------------------------------------------------------

/** The homegrown rules the real `change_tie` and `add_tie` write. */
const HOMEGROWN_RULES = [1, 2, 5, 10];

/** The ties of the fixture players changed through the editor, by UID; the others have the ones `fixtureTies` gives. */
const tiesSet = new Map<number, Tie[]>();

/** What each change to a player's ties (by the id of its logged change) found, for its undo. */
const tieUndo = new Map<number, Tie[]>();

/**
 * A fixture player's ties as the game would hold them: every fifth player has a secondary nationality, and each was
 * trained in his nation and at his club under the 15–21 rule.
 */
function fixtureTies(player: PlayerSummary): Tie[] {
  const ties: Tie[] = [];
  if (player.uid % 5 === 0) {
    const other = NATIONS[(NATIONS.indexOf(player.nation ?? NATIONS[0]) + 1) % NATIONS.length];
    ties.push({ index: 0, tie: "nationality", targetUid: 1000 + NATIONS.indexOf(other), name: other, rule: null });
  }
  if (player.nation) {
    ties.push({ index: 0, tie: "trainedInNation", targetUid: player.nationUid ?? 0, name: player.nation, rule: 1 });
  }
  if (player.club && player.clubUid !== null) {
    ties.push({ index: 0, tie: "trainedAtClub", targetUid: player.clubUid, name: player.club, rule: 1 });
  }
  // A list holds other relations too: the ties are spread through it.
  return ties.map((tie, i) => ({ ...tie, index: i * 2 + 1 }));
}

const tiesOf = (player: PlayerSummary) => tiesSet.get(player.uid) ?? fixtureTies(player);

/**
 * A fixture player's favoured and disliked clubs and people: every other player favours one club and dislikes
 * another, every third favours a member of staff. They sit between the ties in his list.
 */
function preferencesOf(player: PlayerSummary): Preference[] {
  const preferences: Preference[] = [];
  if (player.uid % 2 === 0) {
    const liked = player.uid % CLUBS.length;
    const disliked = (liked + 3) % CLUBS.length;
    preferences.push(
      { index: 0, kind: "favouredClub", targetUid: 500 + liked * 7, name: CLUBS[liked], strength: 35 },
      { index: 2, kind: "dislikedClub", targetUid: 500 + disliked * 7, name: CLUBS[disliked], strength: 30 },
    );
  }
  if (player.uid % 3 === 0) {
    const member = staff[player.uid % staff.length];
    preferences.push({ index: 4, kind: "favouredPerson", targetUid: member.uid, name: member.name, strength: 25 });
  }
  return preferences;
}

/** A fixture person's other languages: none for every third, one or two for the rest. */
function languagesOf(uid: number): Language[] {
  const pool: Language[] = [
    { name: "English", level: 10, local: true },
    { name: "Spanish", level: 5, local: false },
    { name: "German", level: 2, local: false },
  ];
  return uid % 3 === 0 ? [] : pool.slice(uid % 2, (uid % 2) + 1 + (uid % 5 === 0 ? 1 : 0));
}

/** A fixture club's rivals, strongest first, and an affiliate for the men's clubs. */
function clubTiesOf(club: ClubSummary): Pick<ClubDetails, "rivals" | "links"> {
  const i = CLUBS.indexOf(club.name);
  const other = (step: number) => {
    const n = (i + step) % CLUBS.length;
    return { uid: (club.women ? 2_000_100_000 + n : 500 + n * 7), name: CLUBS[n] };
  };
  return {
    rivals: [
      { ...other(1), strength: 100 },
      { ...other(2), strength: 60 },
    ],
    links: club.women ? [] : [{ ...other(4), strength: null }],
  };
}

/** Room for one or two more ties in every third list, less what was added to it. */
const tieRoomOf = (player: PlayerSummary) =>
  Math.max(0, (player.uid % 3) - (tiesOf(player).length - fixtureTies(player).length));

/** The fixture nation with the UID `uid`, or the real commands' failure. */
function mockNation(uid: number): string {
  const name = NATIONS[uid - 1000];
  if (name === undefined) {
    throw failure("app.notFound", `No nation with UID ${uid}`, { uid });
  }
  return name;
}

/** Logs a change to a player's ties as the real commands do, keeping his ties as they were for undoing it. */
function logTie(player: PlayerSummary, before: Tie | null, after: Tie | null, ties: Tie[]): LoggedChange {
  const id = changes.length + 1;
  tieUndo.set(id, tiesOf(player));
  tiesSet.set(player.uid, ties);
  const kind = (before ?? after)!.tie;
  const end = (tie: Tie | null) => tie && { name: tie.name ?? "", rule: tie.rule };
  const logged: LoggedChange = {
    id,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid: player.uid,
    field: `tie.${kind}`,
    old: before?.targetUid ?? 0,
    new: after?.targetUid ?? 0,
    undoneAt: null,
    batch: null,
    tie: { from: end(before), to: end(after) },
  };
  changes.push(logged);
  return { ...logged };
}

/** The fixture player `uid`, and his tie at `index`, or the real commands' failures. */
function tieAt(uid: number, index: number): [PlayerSummary, Tie] {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const tie = tiesOf(player).find((t) => t.index === index);
  if (!tie) {
    throw failure("relation.missing", `the player has no nationality or homegrown tie number ${index}`, { index });
  }
  return [player, tie];
}

/** `change_tie`: points a fixture player's tie at another nation, or gives a training another rule. */
function changeTie(uid: number, index: number, nation?: number, rule?: number): LoggedChange {
  const [player, tie] = tieAt(uid, index);
  if (rule !== undefined && (tie.rule === null || !HOMEGROWN_RULES.includes(rule))) {
    throw failure("relation.rule", `homegrown rule ${rule} is not one the editor writes`, { rule });
  }
  const after: Tie = {
    ...tie,
    ...(nation !== undefined && { targetUid: nation, name: mockNation(nation) }),
    ...(rule !== undefined && { rule }),
  };
  const ties = tiesOf(player);
  if (ties.some((t) => t.tie === after.tie && t.targetUid === after.targetUid && t.rule === after.rule)) {
    throw failure("relation.same", "the player has that already");
  }
  return logTie(player, tie, after, ties.map((t) => (t.index === index ? after : t)));
}

/** `remove_tie`: takes a fixture player's tie out of his list. */
function removeTie(uid: number, index: number): LoggedChange {
  const [player, tie] = tieAt(uid, index);
  return logTie(player, tie, null, tiesOf(player).filter((t) => t.index !== index));
}

/** `add_tie`: gives a fixture player a nationality or a nation he was trained in, where his list has room. */
function addTie(uid: number, kind: TieKind, target: number, rule?: number): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  if (tieRoomOf(player) === 0) {
    throw failure(
      "relation.noRoom",
      "the player's list of nationalities and ties has no room for another, and the editor cannot make it bigger; change one of them instead",
    );
  }
  const ties = tiesOf(player);
  const index = Math.max(0, ...ties.map((t) => t.index)) + 1;
  const after: Tie = { index, tie: kind, targetUid: target, name: mockNation(target), rule: rule ?? null };
  if (ties.some((t) => t.tie === kind && t.targetUid === target && t.rule === after.rule)) {
    throw failure("relation.same", "the player has that already");
  }
  return logTie(player, null, after, [...ties, after]);
}

// Likes and dislikes ----------------------------------------------------------------------------------------------

/** The likes and dislikes changed through the editor, by "player:UID" or "staff:UID"; the others are the fixture's. */
const preferencesSet = new Map<string, Preference[]>();

/** What each change to a person's likes and dislikes found, by the id of its logged change, for its undo. */
const preferenceUndo = new Map<number, [string, Preference[]]>();

const preferenceKey = (isStaff: boolean, uid: number) => `${isStaff ? "staff" : "player"}:${uid}`;

/** A fixture member of staff's likes: the human manager and every fourth member favour a club, as the game has them. */
function staffPreferencesOf(member: StaffSummary): Preference[] {
  if (!member.isHuman && member.uid % 4 !== 0) {
    return [];
  }
  const liked = member.uid % CLUBS.length;
  return [{ index: 0, kind: "favouredClub", targetUid: 500 + liked * 7, name: CLUBS[liked], strength: 100 }];
}

/** The likes and dislikes of the fixture player, or member of staff for `isStaff`, `uid` as the game holds them now. */
function currentPreferences(isStaff: boolean, uid: number): Preference[] {
  const set = preferencesSet.get(preferenceKey(isStaff, uid));
  if (set) {
    return set;
  }
  if (isStaff) {
    const member = staff.find((m) => m.uid === uid);
    return member ? staffPreferencesOf(member) : [];
  }
  const player = players.find((p) => p.uid === uid);
  return player ? preferencesOf(player) : [];
}

/** The name of the fixture person `uid` and his preference at `index`, or the real commands' failures. */
function preferenceAt(uid: number, isStaff: boolean, index: number): [string, Preference] {
  const person = isStaff ? staff.find((m) => m.uid === uid) : players.find((p) => p.uid === uid);
  if (!person) {
    throw notFound(isStaff ? "staff" : "player", uid);
  }
  const preference = currentPreferences(isStaff, uid).find((p) => p.index === index);
  if (!preference) {
    throw failure("list.missing", `the list holds nothing at number ${index}`, { index });
  }
  return [person.name, preference];
}

/** Logs a change to a person's likes as the real commands do, keeping his likes as they were for undoing it. */
function logPreference(
  isStaff: boolean,
  uid: number,
  name: string,
  before: Preference,
  after: Preference | null,
  next: Preference[],
): LoggedChange {
  const id = changes.length + 1;
  const key = preferenceKey(isStaff, uid);
  preferenceUndo.set(id, [key, currentPreferences(isStaff, uid)]);
  preferencesSet.set(key, next);
  const end = (p: Preference | null) => p && { name: p.name ?? "", rule: null, value: p.strength };
  const logged: LoggedChange = {
    id,
    at: Date.now(),
    name,
    entity: isStaff ? "staff" : "player",
    uid,
    field: `preference.${before.kind}`,
    old: before.strength,
    new: after?.strength ?? 0,
    undoneAt: null,
    batch: null,
    tie: { from: end(before), to: end(after) },
  };
  changes.push(logged);
  return { ...logged };
}

/** `change_preference`: gives a fixture person's preference another strength, 1 to 100. */
function changePreference(uid: number, isStaff: boolean, index: number, strength: number): LoggedChange {
  const [name, before] = preferenceAt(uid, isStaff, index);
  if (!Number.isInteger(strength) || strength < 1 || strength > 100) {
    throw failure("move.outOfRange", `${strength} is not a valid strength; it takes 1 to 100`, {
      field: "strength",
      value: strength,
      min: 1,
      max: 100,
    });
  }
  if (strength === before.strength) {
    throw failure("relation.same", "the player has that already");
  }
  const after = { ...before, strength };
  const next = currentPreferences(isStaff, uid).map((p) => (p.index === index ? after : p));
  return logPreference(isStaff, uid, name, before, after, next);
}

/** `remove_preference`: takes a fixture person's preference out of his list. */
function removePreference(uid: number, isStaff: boolean, index: number): LoggedChange {
  const [name, before] = preferenceAt(uid, isStaff, index);
  const next = currentPreferences(isStaff, uid).filter((p) => p.index !== index);
  return logPreference(isStaff, uid, name, before, null, next);
}

/**
 * `point_preference`: points a fixture person's preference at the club, player or member of staff `targetUid`,
 * keeping its strength, with the real command's failures.
 */
function pointPreference(uid: number, isStaff: boolean, index: number, targetKind: string, targetUid: number): LoggedChange {
  const [name, before] = preferenceAt(uid, isStaff, index);
  const isClubKind = (kind: Preference["kind"]) => kind === "favouredClub" || kind === "dislikedClub";
  const club = isClubKind(before.kind);
  const target =
    targetKind === "club"
      ? clubs.find((c) => c.uid === targetUid)
      : (targetKind === "staff" ? staff : players).find((p) => p.uid === targetUid);
  if (target === undefined || (targetKind === "club") !== club || (!club && targetUid === uid)) {
    throw failure("preference.target", "that is not a club or person of the game, of the kind this like or dislike takes");
  }
  const current = currentPreferences(isStaff, uid);
  if (current.some((p) => isClubKind(p.kind) === club && p.targetUid === targetUid)) {
    throw failure("preference.same", "the person already likes or dislikes that one");
  }
  const after = { ...before, targetUid, name: target.name };
  return logPreference(isStaff, uid, name, before, after, current.map((p) => (p.index === index ? after : p)));
}

// Languages -------------------------------------------------------------------------------------------------------

/** The languages changed through the editor, by "player:UID" or "staff:UID"; the others are the fixture's. */
const languagesSet = new Map<string, Language[]>();

/** What each change to a person's languages found, by the id of its logged change, for its undo. */
const languageUndo = new Map<number, [string, Language[]]>();

/** The languages of the fixture player, or member of staff for `isStaff`, `uid` as the game holds them now. */
function currentLanguages(isStaff: boolean, uid: number): Language[] {
  return languagesSet.get(preferenceKey(isStaff, uid)) ?? languagesOf(uid);
}

/** The name of the fixture person `uid` and his language at `index`, or the real commands' failures. */
function languageAt(uid: number, isStaff: boolean, index: number): [string, Language] {
  const person = isStaff ? staff.find((m) => m.uid === uid) : players.find((p) => p.uid === uid);
  if (!person) {
    throw notFound(isStaff ? "staff" : "player", uid);
  }
  const language = currentLanguages(isStaff, uid)[index];
  if (!language) {
    throw failure("list.missing", `the list holds nothing at number ${index}`, { index });
  }
  return [person.name, language];
}

/** Logs a change to a person's languages as the real commands do, keeping them as they were for undoing it. */
function logLanguage(
  isStaff: boolean,
  uid: number,
  name: string,
  before: Language,
  after: Language | null,
  next: Language[],
): LoggedChange {
  const id = changes.length + 1;
  const key = preferenceKey(isStaff, uid);
  languageUndo.set(id, [key, currentLanguages(isStaff, uid)]);
  languagesSet.set(key, next);
  const end = (l: Language | null) => l && { name: l.name ?? "-", rule: null, value: l.level };
  const logged: LoggedChange = {
    id,
    at: Date.now(),
    name,
    entity: isStaff ? "staff" : "player",
    uid,
    field: "language",
    old: before.level,
    new: after?.level ?? 0,
    undoneAt: null,
    batch: null,
    tie: { from: end(before), to: end(after) },
  };
  changes.push(logged);
  return { ...logged };
}

/** `change_language`: gives a fixture person's language another level, 1 to 10. */
function changeLanguage(uid: number, isStaff: boolean, index: number, level: number): LoggedChange {
  const [name, before] = languageAt(uid, isStaff, index);
  if (!Number.isInteger(level) || level < 1 || level > 10) {
    throw failure("move.outOfRange", `${level} is not a valid level; it takes 1 to 10`, {
      field: "level",
      value: level,
      min: 1,
      max: 10,
    });
  }
  if (level === before.level) {
    throw failure("relation.same", "the player has that already");
  }
  const after = { ...before, level };
  const next = currentLanguages(isStaff, uid).map((l, i) => (i === index ? after : l));
  return logLanguage(isStaff, uid, name, before, after, next);
}

/** `remove_language`: takes a fixture person's language out of his list. */
function removeLanguage(uid: number, isStaff: boolean, index: number): LoggedChange {
  const [name, before] = languageAt(uid, isStaff, index);
  const next = currentLanguages(isStaff, uid).filter((_, i) => i !== index);
  return logLanguage(isStaff, uid, name, before, null, next);
}

/** The fixture players whose bans were lifted through the editor, by UID, while the lifting is not undone. */
const liftedPlayers = new Set<number>();

/** The current bans of a fixture player: every eleventh one is banned, for one to three matches, until lifted. */
function bansOf(uid: number): Ban[] {
  if (uid % 11 !== 5 || liftedPlayers.has(uid)) {
    return [];
  }
  return [{ started: addDays(GAME_DATE, -3), matches: 1 + (uid % 3) }];
}

/** The fixture promises closed through the editor, as `uid:index`, while the closing is not undone. */
const closedPromises = new Set<string>();

/**
 * The promises made to a fixture player: every seventh one has two, one open and one ended a week ago, and FM's
 * numbers for them follow his UID.
 */
function promisesOf(uid: number): PlayerPromise[] {
  if (uid % 7 !== 3) {
    return [];
  }
  const open = (index: number, id: number, made: number, due: number): PlayerPromise =>
    closedPromises.has(`${uid}:${index}`)
      ? { id, status: 1, closed: true, made: addDays(GAME_DATE, made), due: GAME_DATE }
      : { id, status: 0, closed: false, made: addDays(GAME_DATE, made), due: addDays(GAME_DATE, due) };
  return [
    open(0, 3 + (uid % 5), -40, 60),
    { id: 11, status: 1, closed: true, made: addDays(GAME_DATE, -120), due: addDays(GAME_DATE, -7) },
  ];
}

/** The fixture players' contract clauses as changed through the editor, by UID, and as they were before each change. */
const clausesSet = new Map<number, Clause[]>();
const clauseUndo = new Map<number, Clause[]>();
/** How many clauses each fixture contract's list holds: every third one has room for one more. */
const clauseCapacity = new Map<number, number>();

/** The clauses of a fixture contract: as changed through the editor, or as `generated`, numbered in order. */
/** A fixture contract's bonus for the competition `uid`, named as the app names it from the competitions. */
function competitionBonus(index: number, uid: number, amount: number): CompetitionBonus {
  return { index, competitionUid: uid, competition: COMPETITIONS.find((c) => c.uid === uid)?.name ?? null, amount };
}

function clausesOf(uid: number, generated: Clause[]): Clause[] {
  const listed = generated.map((clause, index) => ({ ...clause, index }));
  if (!clauseCapacity.has(uid)) {
    clauseCapacity.set(uid, listed.length + (uid % 3 === 0 ? 1 : 0));
  }
  return clausesSet.get(uid) ?? listed;
}

/** How many more clauses the fixture contract of `uid` has room for. */
function clauseRoomOf(uid: number): number {
  const capacity = clauseCapacity.get(uid) ?? 0;
  const listed = clausesSet.get(uid)?.length ?? capacity - (uid % 3 === 0 ? 1 : 0);
  return capacity - listed;
}

/** The fixture player `uid` and his contract's clauses, or the real commands' failures. */
function clausesAt(uid: number): [PlayerSummary, Clause[]] {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const clauses = details(player).contract?.clauses;
  if (!clauses) {
    throw failure("clause.noContract", "the player has no contract");
  }
  return [player, clauses];
}

/** Logs a change to a fixture contract's clauses, which then are `clauses`. */
function logClause(player: PlayerSummary, before: Clause | null, after: Clause | null, clauses: Clause[]): LoggedChange {
  const id = changes.length + 1;
  clauseUndo.set(id, clausesAt(player.uid)[1]);
  clausesSet.set(player.uid, clauses.map((clause, index) => ({ ...clause, index })));
  const logged: LoggedChange = {
    id,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid: player.uid,
    field: "clause",
    old: before?.amount ?? 0,
    new: after?.amount ?? 0,
    undoneAt: null,
    batch: null,
    clause: { from: before, to: after },
  };
  changes.push(logged);
  return { ...logged };
}

/** `change_clause`: a new amount or condition for one of a fixture contract's clauses. */
function changeClause(uid: number, index: number, amount?: number, condition?: number): LoggedChange {
  const [player, clauses] = clausesAt(uid);
  const clause = clauses[index];
  if (!clause) {
    throw failure("clause.missing", `the contract has no clause number ${index}`, { index });
  }
  if ((amount !== undefined && clause.amount === null) || (condition !== undefined && clause.condition === null)) {
    const field = amount !== undefined && clause.amount === null ? "clause.amount" : "clause.condition";
    throw failure("clause.notInClause", "this clause has nothing of that kind to change", { field });
  }
  const after: Clause = { ...clause, ...(amount !== undefined && { amount }), ...(condition !== undefined && { condition }) };
  if (after.amount === clause.amount && after.condition === clause.condition) {
    throw failure("clause.same", "the contract has that already");
  }
  return logClause(player, clause, after, clauses.map((c) => (c.index === index ? after : c)));
}

/** `remove_clause`: takes one of a fixture contract's clauses out. */
function removeClause(uid: number, index: number): LoggedChange {
  const [player, clauses] = clausesAt(uid);
  const clause = clauses[index];
  if (!clause) {
    throw failure("clause.missing", `the contract has no clause number ${index}`, { index });
  }
  return logClause(player, clause, null, clauses.filter((c) => c.index !== index));
}

/** `add_release_clause`: gives a fixture contract without one a release clause, where its list has room. */
function addReleaseClause(uid: number, amount: number): LoggedChange {
  const [player, clauses] = clausesAt(uid);
  if (clauses.some((c) => c.kind === 0)) {
    throw failure("clause.same", "the contract has that already");
  }
  if (clauseRoomOf(uid) === 0) {
    throw failure("clause.noRoom", "the contract's list of clauses has no room for another, and the editor cannot make it bigger");
  }
  const after: Clause = { index: clauses.length, kind: 0, amount, condition: null };
  return logClause(player, null, after, [...clauses, after]);
}

/** The fixture players kept from retiring through the editor, by UID, while it is not undone. */
const keptPlayers = new Set<number>();

/** The retirement the game plans for a fixture player: every seventh one retires on 30 June next year, until kept. */
function retiresOf(uid: number): FmDate | null {
  if (uid % 7 !== 3 || keptPlayers.has(uid)) {
    return null;
  }
  return { year: GAME_DATE.year + 1, month: 6, day: 30 };
}

/** `keep_playing`: the fixture player's retirement is taken out of the plans, logged as a change of his `retirement`. */
function keepPlaying(uid: number): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const retires = retiresOf(uid);
  if (retires === null) {
    throw failure("retirement.none", "the game has not planned the player's retirement, and he already means to play on");
  }
  keptPlayers.add(uid);
  const logged: LoggedChange = {
    id: changes.length + 1,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "retirement",
    old: retires.year * 10000 + retires.month * 100 + retires.day,
    new: 0,
    undoneAt: null,
    batch: null,
  };
  changes.push(logged);
  return { ...logged };
}

/** Job codes as stored in contracts (see labels.ts). */
const JOBS = [16, 20, 2, 2, 2, 34, 26, 14, 14, 44, 12, 60, 64, 88];
const STAFF_ATTRIBUTES = [
  "attacking", "defending", "fitness", "goalkeeping", "possession", "set_pieces", "tactical", "technical",
  "determination", "motivating", "people_management", "data_analysis", "judging_ability", "judging_potential",
  "judging_staff", "negotiating", "tactical_knowledge", "physiotherapy", "sports_science",
];
const STAFF_RATINGS = ["working_with_youngsters", "authority"];

/** The teams of a fixture club's staff, as `fixtureTeams` lists them: most work for the first team. */
const SENIOR_TEAM = { index: 0, kind: 0, ageLimit: null };
const STAFF_TEAMS = [SENIOR_TEAM, SENIOR_TEAM, SENIOR_TEAM, { index: 1, kind: 10, ageLimit: 21 }, { index: 2, kind: 12, ageLimit: 18 }];

const staff: StaffSummary[] = (() => {
  const next = random(1984);
  const pick = <T,>(items: T[]) => items[Math.floor(next() * items.length)];
  return Array.from({ length: 120 }, (_, i) => {
    const born: FmDate = { year: 1955 + Math.floor(next() * 40), month: 1 + Math.floor(next() * 12), day: 1 + Math.floor(next() * 28) };
    const ca = Math.round(40 + next() * 140);
    const employed = i !== 1 && (i === 0 || next() < 0.85);
    return {
      uid: 2_000_000 + i * 53,
      name: `${pick(FIRST)} ${pick(LAST)}`,
      fullName: null,
      dateOfBirth: born,
      age: ageOn(born, GAME_DATE),
      ...withUids(pick(NATIONS), employed ? pick(CLUBS) : null),
      team: i === 0 ? SENIOR_TEAM : employed ? STAFF_TEAMS[i % STAFF_TEAMS.length] : null,
      job: i === 0 ? 16 : employed ? pick(JOBS) : null,
      // One manager of a national team: no club contract, so no job code and no club.
      national: i === 1 ? { nation: "England", nationUid: null, ageLimit: 21, women: false } : null,
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
    // Only the human manager's flags are read; everyone else's stay unknown, as in the app.
    unsackable: member.isHuman ? false : null,
    registrationAnytime: member.isHuman ? false : null,
    languages: currentLanguages(true, member.uid),
    preferences: currentPreferences(true, member.uid),
    coachingLicence: member.uid % 9,
    formations: [[29, 4, 28, 3][member.uid % 4], [22, 4, 0, 32][member.uid % 4]],
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
  // An official's abilities, reputation and birth date, one official at a time.
  if (entity === "official") {
    return [
      { ...field("current_ability", "u16", 1, 200), mass: false },
      { ...field("potential_ability", "u16", 1, 200), mass: false },
      { ...field("reputation", "u16", 0, 10_000), mass: false },
      { ...field("date_of_birth", "date", 19400101, 20201231), mass: false },
    ];
  }
  // A nation's senior team reputation and its rules, one nation at a time; 255 years is never.
  if (entity === "nation") {
    return [
      { ...field("reputation", "u16", 0, 10_000), mass: false },
      { ...field("youth_rating", "i16", 0, 165), mass: false },
      { ...field("game_importance", "i8", 0, 4), mass: false },
      { ...field("attendance", "u8", 0, 16), mass: false },
      ...NATION_STYLE.map((key) => ({ ...field(`style.${key}`, "i8", 0, 20), mass: false })),
      { ...field("women.reputation", "u16", 0, 10_000), mass: false },
      { ...field("women.youth_rating", "i16", 0, 165), mass: false },
      { ...field("women.game_importance", "i8", 0, 4), mass: false },
      { ...field("women.attendance", "u8", 0, 16), mass: false },
      ...NATION_STYLE.map((key) => ({ ...field(`women.style.${key}`, "i8", 0, 20), mass: false })),
      { ...field("points", "f32", 0, floatBits(3000)), mass: false },
      { ...field("women.points", "f32", 0, floatBits(3000)), mass: false },
      { ...field("population", "u32", 1, 2_000_000_000), mass: false },
      { ...field("dual_nationality", "u8", 0, 2), choices: [0, 2], mass: false },
      { ...field("naturalisation", "u8", 0, 50), blank: 255, mass: false },
    ];
  }
  // A player's squad number (255: none), squad status and listing are changed one player at a time.
  const playerContract: EditField[] = [
    { ...field("contract.squad_number", "u8", 1, 99), blank: 255, mass: false },
    { ...field("contract.squad_status", "u8", 1, 40), choices: [1, 2, 3, 4, 5], mass: false },
    { ...field("contract.transfer_listed", "flag", 0, 1), mass: false },
    { ...field("contract.loan_listed", "flag", 0, 1), mass: false },
    field("contract.loyalty_bonus", "i32", 0, 10_000_000),
    field("contract.happiness", "i8", -100, 100),
    field("contract.playing_time_happiness", "i8", -100, 100),
    field("contract.unhappiness", "u32", 0, 0),
    ...Array.from({ length: 64 }, (_, bit) => field(`trait.${bit}`, "flag", 0, 1)),
  ];
  const common = [
    field("current_ability", "u16", 1, 200),
    field("potential_ability", "i16", 1, 200),
  ];
  const reputation = ["home", "current", "world"].map((key) => field(`reputation.${key}`, "u16", 0, 10_000));
  const personality = PERSONALITY.map((key) => field(`personality.${key}`, "u8", 1, 20));
  // The days a contract was signed and its holder joined run to the game's date, one person at a time.
  const latestStart = numberFromDate(GAME_DATE);
  const contract = [
    field("contract.wage", "i32", 0, 10_000_000),
    field("contract.expires", "date", 20000101, 21001231),
    { ...field("contract.signed", "date", 19500101, latestStart), mass: false },
    { ...field("contract.joined", "date", 19500101, latestStart), mass: false },
  ];
  const loan = [
    { ...field("loan.wage", "i32", 0, 10_000_000), mass: false },
    { ...field("loan.ends", "date", 20000101, 21001231), mass: false },
  ];
  if (entity === "club") {
    return [
      field("reputation", "u16", 0, 10_000),
      ...CLUB_FACILITIES.map((key) => field(`facilities.${key}`, "u8", 1, 20)),
      field("finance.balance", "i32", -2_000_000_000, 2_000_000_000),
      field("finance.transfer_budget", "i32", 0, 2_000_000_000),
      field("finance.wage_budget", "i32", 0, 100_000_000),
      field("finance.total_wage_budget", "i32", 0, 100_000_000),
      ...["capacity", "seating", "used", "expansion"].map((key) => field(`stadium.${key}`, "u32", 0, 250_000)),
    ];
  }
  if (entity === "player") {
    return [
      ...common,
      field("height", "u16", 140, 220),
      { ...field("nation", "pointer", 0x1_0000, 0x7fff_ffff_ffff), mass: false },
      field("date_of_birth", "date", 19400101, 20201231),
      { ...field("asking_price", "i32", 0, 2_000_000_000), blank: -1 },
      ...reputation,
      field("international.caps", "u16", 0, 1000),
      field("international.goals", "u16", 0, 1000),
      field("international.u21_caps", "u8", 0, 255),
      field("international.u21_goals", "u8", 0, 255),
      field("condition", "u16", 0, 10_000, "percent"),
      field("match_sharpness", "u16", 3_500, 10_000, "percent"),
      field("jadedness", "i16", -500, 1000),
      field("morale", "u8", 1, 20),
      ...ATTRIBUTES.map((key) => field(`attribute.${key}`, "u8", 1, 100, "attribute")),
      // The game no longer plays a sweeper, so the real table leaves it out.
      ...POSITIONS.filter((key) => key !== "sw").map((key) => field(`position.${key}`, "u8", 1, 20)),
      ...personality,
      ...contract,
      ...playerContract,
      ...loan,
    ];
  }
  return [
    ...common,
    ...reputation,
    { ...field("nation", "pointer", 0x1_0000, 0x7fff_ffff_ffff), mass: false },
    // From 1920: chairmen and owners are staff too.
    field("date_of_birth", "date", 19200101, 20201231),
    ...STAFF_ATTRIBUTE_ORDER.map((key) =>
      STAFF_RATINGS.includes(key)
        ? field(`attribute.${key}`, "u8", 1, 20)
        : field(`attribute.${key}`, "u8", 0, 100, "attribute"),
    ),
    ...personality,
    ...contract,
    { ...field("coaching_licence", "i8", 0, 8), choices: [0, 7, 6, 5, 4, 3, 2, 1] },
    {
      ...field("formation.in_possession", "u8", 1, 64),
      choices: [3, 4, 7, 22, 28, 29, 30, 32, 33, 35, 63, 64],
      mass: false,
    },
    { ...field("formation.out_of_possession", "u8", 1, 64), choices: [4, 7, 22, 27, 30, 32, 33, 35, 63, 64], mass: false },
    { ...field("manager.unsackable", "flag", 0, 1), mass: false },
    { ...field("manager.registration_anytime", "flag", 0, 1), mass: false },
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
      case "coaching_licence":
        (d as StaffDetails).coachingLicence = value;
        break;
      case "formation": {
        const formations = (d as StaffDetails).formations;
        if (formations !== null) {
          formations[name === "out_of_possession" ? 1 : 0] = value;
        }
        break;
      }
      case "height":
        (d as PlayerDetails).heightCm = value;
        break;
      case "asking_price":
        (d as PlayerDetails).askingPrice = value === -1 ? null : value;
        break;
      case "condition":
        (d as PlayerDetails).condition = value;
        break;
      case "match_sharpness":
        (d as PlayerDetails).matchSharpness = value;
        break;
      case "jadedness":
        (d as PlayerDetails).jadedness = value;
        break;
      case "morale":
        (d as PlayerDetails).morale = value;
        break;
      case "trait": {
        const traits = new Set((d as PlayerDetails).traits);
        if (value === 1) traits.add(Number(name));
        else traits.delete(Number(name));
        (d as PlayerDetails).traits = [...traits].sort((a, b) => a - b);
        break;
      }
      case "international":
        (d as PlayerDetails).international[INTERNATIONAL[name as keyof typeof INTERNATIONAL]] = value;
        break;
      case "manager":
        if (entity === "staff" && name === "unsackable" && (d as StaffDetails).unsackable !== null) {
          (d as StaffDetails).unsackable = value === 1;
        }
        if (entity === "staff" && name === "registration_anytime" && (d as StaffDetails).registrationAnytime !== null) {
          (d as StaffDetails).registrationAnytime = value === 1;
        }
        break;
      case "loan": {
        const loan = entity === "player" ? (d as PlayerDetails).loan : null;
        if (loan && name === "wage") {
          loan.wage = value;
        } else if (loan && name === "ends") {
          loan.ends = dateFromNumber(value);
        }
        break;
      }
      case "contract":
        if (d.contract && name === "wage") {
          d.contract.wage = value;
        } else if (d.contract && name === "expires") {
          d.contract.expires = dateFromNumber(value);
        } else if (d.contract && name === "signed") {
          d.contract.signed = dateFromNumber(value);
        } else if (d.contract && name === "joined") {
          d.contract.joined = dateFromNumber(value);
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
          } else if (name === "loyalty_bonus") {
            contract.loyaltyBonus = value;
          } else if (name === "happiness") {
            contract.happiness = value;
          } else if (name === "playing_time_happiness") {
            contract.playingTimeHappiness = value;
          } else if (name === "unhappiness") {
            // Set to none, the reasons that last end today; an undo has the ones that ended today last again.
            const today = numberFromDate(GAME_DATE);
            contract.concerns = contract.concerns.map((concern) =>
              value === 0
                ? { ...concern, ended: concern.ended ?? GAME_DATE }
                : { ...concern, ended: concern.ended && numberFromDate(concern.ended) === today ? null : concern.ended },
            );
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
    } else if (group === "stadium" && d.stadium) {
      d.stadium[name as "capacity" | "seating" | "used" | "expansion"] = value;
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
  if (entity === "nation") {
    return nationValues(uid);
  }
  if (entity === "official") {
    const official = officialOf(uid);
    return {
      current_ability: official.currentAbility,
      potential_ability: official.potentialAbility,
      reputation: official.reputation,
      ...(official.dateOfBirth && { date_of_birth: numberFromDate(official.dateOfBirth) }),
    };
  }
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
      case "date_of_birth":
        return person.dateOfBirth && numberFromDate(person.dateOfBirth);
      case "nation":
        return person.nation === null ? undefined : nationAddress(person.nation);
      case "asking_price":
        return (person as PlayerDetails).askingPrice ?? -1;
      case "condition":
        return person.condition;
      case "match_sharpness":
        return person.matchSharpness;
      case "jadedness":
        return (person as PlayerDetails).jadedness;
      case "morale":
        return person.morale;
      case "trait":
        return Number((person as PlayerDetails).traits.includes(Number(name)));
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
      case "coaching_licence":
        return (person as StaffDetails).coachingLicence;
      case "formation":
        return (person as StaffDetails).formations?.[name === "out_of_possession" ? 1 : 0];
      case "contract": {
        const contract = (person as PlayerDetails).contract;
        switch (name) {
          case "wage":
            return person.contract?.wage;
          case "expires":
            return person.contract?.expires && numberFromDate(person.contract.expires);
          case "signed":
            return person.contract?.signed && numberFromDate(person.contract.signed);
          case "joined":
            return person.contract?.joined && numberFromDate(person.contract.joined);
          // Only a player's contract has these; the real table offers them for players only.
          case "squad_number":
            return contract && (contract.squadNumber ?? 255);
          case "squad_status":
            return contract?.squadStatus;
          case "transfer_listed":
            return contract && Number(contract.transferListed);
          case "loan_listed":
            return contract && Number(contract.loanListed);
          case "loyalty_bonus":
            return contract?.loyaltyBonus;
          case "happiness":
            return contract?.happiness;
          case "playing_time_happiness":
            return contract?.playingTimeHappiness;
          case "unhappiness": {
            // None that last reads as nothing to remove, unless some ended today: those an undo can have last again.
            const lasting = contract?.concerns.filter((concern) => concern.ended === null).length ?? 0;
            const today = numberFromDate(GAME_DATE);
            const endedToday = contract?.concerns.some((c) => c.ended && numberFromDate(c.ended) === today) ?? false;
            return lasting > 0 || endedToday ? lasting : undefined;
          }
        }
        return undefined;
      }
      case "loan": {
        const loan = (person as PlayerDetails).loan;
        if (name === "wage") {
          return loan?.wage;
        }
        return name === "ends" && loan?.ends ? numberFromDate(loan.ends) : undefined;
      }
      case "manager":
        // Missing for everyone but the human manager, so an edit or undo of anyone else finds no record.
        {
          const flag = name === "registration_anytime" ? person.registrationAnytime : person.unsackable;
          return flag === null || flag === undefined ? undefined : Number(flag);
        }
      case "facilities":
        return club.facilities[name];
      case "finance":
        return club.finances?.[FINANCE[name as keyof typeof FINANCE]];
      case "stadium":
        return club.stadium?.[name as "capacity" | "seating" | "used" | "expansion"];
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
  if (entity === "official") {
    // The officials list is the official's profile.
    const official = officialOf(uid);
    if (key === "date_of_birth") {
      official.dateOfBirth = dateFromNumber(value);
      official.age = official.dateOfBirth && ageOn(official.dateOfBirth, GAME_DATE);
    } else {
      const property = { current_ability: "currentAbility", potential_ability: "potentialAbility" }[key] ?? key;
      Object.assign(official, { [property]: value });
    }
    return;
  }
  if (entity === "club") {
    const club = clubs.find((c) => c.uid === uid);
    if (club && key === "reputation") {
      club.reputation = value;
      return;
    }
  } else if (entity !== "nation") {
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
    const nation = key === "nation" ? nationAt(value) : undefined;
    if (row && nation !== undefined) {
      // The list row has the nation, and the profile is built from the row.
      Object.assign(row, { nation, nationUid: 1000 + NATIONS.indexOf(nation) });
      return;
    }
    if (row && key === "date_of_birth") {
      // The list row has the birth date and the age, and the profile is built from the row.
      row.dateOfBirth = dateFromNumber(value);
      row.age = row.dateOfBirth && ageOn(row.dateOfBirth, GAME_DATE);
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
  const name =
    entity === "nation" ? nationName(uid) : entity === "official" ? officialOf(uid).name : profileOf(entity, uid).name;
  const report: ApplyReport = { applied: [], failed: [] };
  const write = (field: string, old: number, value: number) => {
    writeValue(entity, uid, field, value);
    const logged: LoggedChange = {
      id: changes.length + 1,
      at: Date.now(),
      name,
      entity,
      uid,
      field,
      old,
      new: value,
      undoneAt: null,
      batch: null,
    };
    changes.push(logged);
    report.applied.push({ ...logged });
  };
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
    if (old !== edit.expected) {
      report.failed.push({ ...edit, error: failure("edit.conflict", `The value of ${field.key} has changed since it was read.`, { field: field.key, expected: edit.expected, found: old ?? "unknown" }) });
      continue;
    }
    if (old === undefined) {
      // No contract, no contract end, or a club without full finances.
      const message = `${field.key} cannot be changed here: its record is missing or does not check out`;
      report.failed.push({ ...edit, error: failure("edit.noRecord", message, { field: field.key }) });
      continue;
    }
    if (old === edit.value) {
      continue;
    }
    write(field.key, old, edit.value);
  }
  // Like the real command, a happiness his morale does not allow moves his morale with it, unless the edit set it.
  const held = entity === "player" ? report.applied.find((change) => change.field === "contract.happiness") : undefined;
  const morale: number | undefined = currentValues(entity, uid)["morale"];
  if (held && morale !== undefined && !edits.some((edit) => edit.field === "morale")) {
    const allows = (level: number) => {
      const [low, high] = moraleBand(level);
      const happiness = Math.max(held.new, -20);
      return happiness >= low && happiness <= high;
    };
    const nearest = Array.from({ length: 20 }, (_, i) => i + 1)
      .filter(allows)
      .sort((a, b) => Math.abs(a - morale) - Math.abs(b - morale) || a - b)[0];
    if (!allows(morale) && nearest !== undefined) {
      write("morale", morale, nearest);
    }
  }
  return report;
}

/** The happiness the game allows a player no reason to be unhappy holds elsewhere, by his morale. */
function moraleBand(morale: number): [number, number] {
  if (morale >= 18) return [80, 100];
  if (morale >= 15) return [60, 80];
  if (morale >= 13) return [40, 60];
  if (morale >= 11) return [20, 40];
  return [-20, 20];
}

/** `undo_change`: writes the old value back unless the value has changed since. */
// Staff: moves and jobs ---------------------------------------------------------------------------------------------

/** The jobs the real `change_staff_job` gives, by contract code. */
const STAFF_JOBS = [2, 20, 22, 26, 34, 60, 64, 12, 40, 48, 50, 14, 44, 58];
/** The contract job of a club's manager. */
const MANAGER_JOB = 16;

/** What a member of staff's move or new job changed, by the change's id: his list row as it was. */
const staffUndo = new Map<number, Pick<StaffSummary, "club" | "clubUid" | "team" | "job">>();

/** The member of staff `uid`, checked as the real commands check him before a move or a new job. */
function movableStaff(uid: number): StaffSummary {
  const member = staff.find((s) => s.uid === uid);
  if (!member) {
    throw notFound("staff", uid);
  }
  if (member.isHuman) {
    throw failure("staff.you", "that's you; use Change club");
  }
  if (member.clubUid === null) {
    throw failure("staff.unemployed", "the member of staff has no club");
  }
  if (member.job === 16) {
    const message =
      "the club or one of its teams points at this member of staff directly, as a team does at its manager; the game moves him itself";
    throw failure("staff.role", message);
  }
  return member;
}

/**
 * `plan_manager_move`: the human manager's move to a club, and the club's manager, whom the game dismisses: the first
 * of its staff with a manager's job.
 */
function planManagerMove(uid: number, clubUid: number): ManagerPreview {
  const member = staff.find((s) => s.uid === uid);
  if (!member) {
    throw notFound("staff", uid);
  }
  const to = clubs.find((c) => c.uid === clubUid);
  if (!to) {
    throw notFound("club", clubUid);
  }
  if (member.clubUid === clubUid) {
    throw failure("move.sameClub", "the player is at this club already");
  }
  const from = clubs.find((c) => c.uid === member.clubUid);
  const sitting = staff.find((s) => s.clubUid === clubUid && s.job === MANAGER_JOB && !s.isHuman);
  return {
    from: from ? { uid: from.uid, name: from.name } : null,
    to: { uid: to.uid, name: to.name },
    ...(sitting && { displaced: sitting.name }),
    permanent: true,
  };
}

/** `move_manager`: the human manager becomes the club's manager and its manager loses his job. Nothing undoes it. */
function moveManager(uid: number, clubUid: number): LoggedChange {
  const preview = planManagerMove(uid, clubUid);
  const member = staff.find((s) => s.uid === uid)!;
  const sitting = staff.find((s) => s.clubUid === clubUid && s.job === MANAGER_JOB && !s.isHuman);
  if (sitting) {
    sitting.club = null;
    sitting.clubUid = null;
    sitting.team = null;
    sitting.job = null;
  }
  member.club = preview.to.name;
  member.clubUid = preview.to.uid;
  member.team = SENIOR_TEAM;
  member.job = MANAGER_JOB;
  const logged = logStaff(member, "club", preview.from?.uid ?? 0, preview.to.uid, {
    ...(preview.from && { from: preview.from.name }),
    to: preview.to.name,
  });
  const entry = changes.find((c) => c.id === logged.id)!;
  entry.permanent = true;
  return { ...entry };
}

/** `plan_staff_move`: the checks of the real command that the fixtures can have, with its messages. */
function planStaffMove(uid: number, clubUid: number): MovePreview {
  const member = movableStaff(uid);
  const to = clubs.find((c) => c.uid === clubUid);
  if (!to) {
    throw notFound("club", clubUid);
  }
  if (member.clubUid === clubUid) {
    throw failure("move.sameClub", "the player is at this club already");
  }
  if (to.women) {
    throw failure("move.menAndWomen", "one club is a men's club and the other a women's club");
  }
  const from = clubs.find((c) => c.uid === member.clubUid)!;
  return { from: { uid: from.uid, name: from.name }, to: { uid: to.uid, name: to.name } };
}

/** Logs a member of staff's move or new job, as the real commands do, keeping his row as it was for undoing it. */
function logStaff(member: StaffSummary, field: string, old: number, value: number, moved?: LoggedChange["moved"]) {
  const id = changes.length + 1;
  const logged: LoggedChange = {
    id,
    at: Date.now(),
    name: member.name,
    entity: "staff",
    uid: member.uid,
    field,
    old,
    new: value,
    undoneAt: null,
    batch: null,
    ...(moved && { moved }),
  };
  changes.push(logged);
  return { ...logged };
}

function moveStaff(uid: number, clubUid: number): LoggedChange {
  const preview = planStaffMove(uid, clubUid);
  const member = staff.find((s) => s.uid === uid)!;
  staffUndo.set(changes.length + 1, { club: member.club, clubUid: member.clubUid, team: member.team, job: member.job });
  member.club = preview.to.name;
  member.clubUid = preview.to.uid;
  member.team = SENIOR_TEAM;
  return logStaff(member, "club", preview.from.uid, preview.to.uid, { from: preview.from.name, to: preview.to.name });
}

function changeStaffJob(uid: number, job: number): LoggedChange {
  const member = movableStaff(uid);
  for (const code of [member.job, job]) {
    if (code === null || !STAFF_JOBS.includes(code)) {
      throw failure("staff.job", `job ${code} is not one the editor gives or takes away`, { job: code ?? 0 });
    }
  }
  staffUndo.set(changes.length + 1, { club: member.club, clubUid: member.clubUid, team: member.team, job: member.job });
  const old = member.job!;
  member.job = job;
  return logStaff(member, "contract.job", old, job);
}

function undoChange(id: number): LoggedChange {
  const entry = changes.find((c) => c.id === id);
  if (!entry) {
    throw failure("app.noChange", `No change ${id}`, { id });
  }
  if (entry.undoneAt !== null) {
    throw failure("app.alreadyUndone", "This change has already been undone.");
  }
  if (entry.earlierGame) {
    throw failure(
      "app.earlierGame",
      "This change was made before FM was closed or loaded a save, so it can no longer be undone.",
    );
  }
  if (entry.permanent) {
    throw failure("app.permanent", "This change cannot be undone.");
  }
  const staffRow = entry.entity === "staff" ? staffUndo.get(entry.id) : undefined;
  if (staffRow) {
    Object.assign(staff.find((s) => s.uid === entry.uid)!, staffRow);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  // An ended loan starts again, until the same day.
  if (entry.field === "loan" && loanEndUndo.has(entry.id)) {
    const player = players.find((p) => p.uid === entry.uid);
    const ended = endedLoans.get(entry.uid);
    if (player && ended) {
      player.club = ended.borrower.name;
      player.clubUid = ended.borrower.uid;
      const started = loanEndUndo.get(entry.id);
      if (started) {
        startedLoans.set(entry.uid, started);
      }
    }
    endedLoans.delete(entry.uid);
    loanEndUndo.delete(entry.id);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  // A loan the editor started ends at once, as the game does here.
  if (entry.field === "loan") {
    const player = players.find((p) => p.uid === entry.uid);
    const started = startedLoans.get(entry.uid);
    if (player && started) {
      player.club = started.parent;
      player.clubUid = started.parentUid;
    }
    startedLoans.delete(entry.uid);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  // A signing for a later day is cancelled: he never left the free agents. One cancelled already is not pending.
  if (entry.moved?.joins !== undefined) {
    const joins = entry.moved.joins;
    const player = players.find((p) => p.uid === entry.uid);
    const agreed = player ? futureTransfersOf(player) : [];
    const kept = agreed.filter((t) => !(t.clubUid === entry.new && t.joins && numberFromDate(t.joins) === joins));
    if (kept.length === agreed.length) {
      throw failure("move.notPending", "the transfer is no longer waiting for its day: FM has made it or cancelled it");
    }
    futureTransfers.set(entry.uid, kept);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.moved) {
    undoMove(entry);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field === "injuries") {
    if (entry.new > entry.old) {
      addedInjuries.delete(entry.uid);
    } else {
      unhealed(entry.uid);
    }
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field === "work_permit") {
    const before = permitUndo.get(entry.id);
    if (before === undefined) {
      permitsSet.delete(entry.uid);
    } else {
      permitsSet.set(entry.uid, before);
    }
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field === "cohesion") {
    familiarity.set(entry.uid, entry.old ?? 0);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field === "tactics") {
    tacticsRaised.delete(entry.uid);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field === "bans") {
    liftedPlayers.delete(entry.uid);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field === "promise") {
    closedPromises.delete(promiseUndo.get(entry.id)!);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field === "retirement") {
    keptPlayers.delete(entry.uid);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.clause) {
    clausesSet.set(entry.uid, clauseUndo.get(entry.id)!);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field === "injury") {
    injuriesSet.set(entry.uid, injuryUndo.get(entry.id)!);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field === "language") {
    const [key, languages] = languageUndo.get(entry.id)!;
    languagesSet.set(key, languages);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.field.startsWith("preference.")) {
    const [key, preferences] = preferenceUndo.get(entry.id)!;
    preferencesSet.set(key, preferences);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.tie) {
    tiesSet.set(entry.uid, tieUndo.get(entry.id)!);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  if (entry.captaincy) {
    undoCaptain(entry);
    entry.undoneAt = Date.now();
    return { ...entry };
  }
  const found = currentValues(entry.entity, entry.uid)[entry.field];
  // Like the real undo: a value the game has put back itself is undone, with nothing to write.
  if (found !== entry.new && found !== entry.old) {
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
const moveUndo = new Map<
  number,
  { row: ClubRow; written?: FieldValues; other?: { uid: number; row: ClubRow }; paid?: [number, string, number][] }
>();

/** The most a transfer fee can be, as in the real commands. */
const MAX_FEE = 2_000_000_000;

/**
 * What paying `fee` does to the money of the clubs `to` (which pays it out of its balance and transfer budget) and
 * `from` (whose balance takes it), as the real command works it out; a club without finances is left alone.
 */
function feePlan(from: number, to: number, fee: number): FeePlan {
  if (!Number.isInteger(fee) || fee < 0 || fee > MAX_FEE) {
    throw failure("edit.outOfRange", `${fee} is not a valid fee; it takes 0 to ${MAX_FEE}`, {
      field: "fee",
      value: fee,
      min: 0,
      max: MAX_FEE,
    });
  }
  const money = (club: number, buying: boolean): ClubMoney | null => {
    const now = currentValues("club", club);
    const balance = now["finance.balance"];
    if (balance === undefined) {
      return null;
    }
    const budget = now["finance.transfer_budget"];
    return {
      club,
      balance: { before: balance, after: buying ? balance - fee : balance + fee },
      transferBudget:
        buying && budget !== undefined && budget >= 0 ? { before: budget, after: Math.max(0, budget - fee) } : null,
    };
  };
  return { fee, buyer: money(to, true), seller: money(from, false) };
}

/** The men's fixture club whose squad list is full, so that the move dialog's refusal can be seen. */
const FULL_CLUB = 500 + (CLUBS.length - 1) * 7;

/** The real commands' checks of a contract's terms, with their messages. */
function checkTerms(terms: MoveTerms): void {
  const outOfRange = (field: string, value: number, min: number, max: number) =>
    failure("move.outOfRange", `${value} is not a valid ${field}; it takes ${min} to ${max}`, { field, value, min, max });
  if (terms.wage !== undefined && (!Number.isInteger(terms.wage) || terms.wage < 0 || terms.wage > 10_000_000)) {
    throw outOfRange("contract.wage", terms.wage, 0, 10_000_000);
  }
  const tomorrow = numberFromDate(GAME_DATE) + 1;
  if (terms.expires !== undefined && (dateFromNumber(terms.expires) === null || terms.expires < tomorrow || terms.expires > 21001231)) {
    throw outOfRange("contract.expires", terms.expires, tomorrow, 21001231);
  }
}

/** `plan_club_move`: the checks of the real command that the fixtures can have, with its messages. */
function planMove(uid: number, clubUid: number, terms: MoveTerms, fee?: number): MovePreview {
  const player = players.find((p) => p.uid === uid);
  const to = clubs.find((c) => c.uid === clubUid);
  if (!player) {
    throw notFound("player", uid);
  }
  if (!to) {
    throw notFound("club", clubUid);
  }
  checkTerms(terms);
  if (player.clubUid === null) {
    throw failure("move.freeAgent", "the player has no club; free agents cannot be moved yet");
  }
  if (player.clubUid === clubUid) {
    throw failure("move.sameClub", "the player is at this club already");
  }
  // From your club FM makes the transfer itself, and nothing undoes it.
  const permanent = staff.some((s) => s.isHuman && s.clubUid === player.clubUid);
  if (to.women) {
    throw failure("move.menAndWomen", "one club is a men's club and the other a women's club");
  }
  if (clubUid === FULL_CLUB && !permanent) {
    const message = "the club's squad list has no room for another player (36 now), and the editor cannot make it bigger";
    throw failure("move.noRoom", message, { players: 36 });
  }
  const from = clubs.find((c) => c.uid === player.clubUid)!;
  return {
    from: { uid: from.uid, name: from.name },
    to: { uid: to.uid, name: to.name },
    ...(fee !== undefined && fee > 0 && { fee: feePlan(from.uid, to.uid, fee) }),
    ...(permanent && { permanent }),
  };
}

/** `move_player`: moves the fixture player and logs it as a change of his `club`. */
function movePlayer(uid: number, clubUid: number, terms: MoveTerms, fee?: number): LoggedChange {
  const preview = planMove(uid, clubUid, terms, fee);
  const player = players.find((p) => p.uid === uid)!;
  const id = changes.length + 1;
  // The fee, as the real command pays it: each amount by what it changes, so that undoing takes back just that.
  const paid: [number, string, number][] = [];
  for (const money of [preview.fee?.buyer, preview.fee?.seller]) {
    if (money) {
      paid.push([money.club, "finance.balance", money.balance.after - money.balance.before]);
      writeValue("club", money.club, "finance.balance", money.balance.after);
      if (money.transferBudget) {
        paid.push([money.club, "finance.transfer_budget", money.transferBudget.after - money.transferBudget.before]);
        writeValue("club", money.club, "finance.transfer_budget", money.transferBudget.after);
      }
    }
  }
  if (!preview.permanent) {
    moveUndo.set(id, {
      row: { club: player.club, clubUid: player.clubUid, contractExpires: player.contractExpires },
      written: written.get(`player:${uid}`),
      paid,
    });
  }
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
    moved: { from: preview.from.name, to: preview.to.name, ...(preview.fee && { fee: preview.fee.fee }) },
    ...(preview.permanent && { permanent: true }),
  };
  changes.push(logged);
  return { ...logged };
}

/**
 * `sign_free_agent`: the game signs the fixture free agent for `clubUid` on its own terms, then the editor writes the
 * wage and contract end given. Logged as a change of his `club` from 0; undoing it releases him again.
 */
function signFreeAgent(uid: number, clubUid: number, terms: MoveTerms): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  const to = clubs.find((c) => c.uid === clubUid);
  if (!player) {
    throw notFound("player", uid);
  }
  if (!to) {
    throw notFound("club", clubUid);
  }
  if (player.clubUid !== null) {
    throw failure("move.hasClub", "the player has a club; only a free agent signs for one");
  }
  checkTerms(terms);
  const id = changes.length + 1;
  moveUndo.set(id, {
    row: { club: null, clubUid: null, contractExpires: null },
    written: written.get(`player:${uid}`),
  });
  player.club = to.name;
  player.clubUid = to.uid;
  player.contractExpires =
    terms.expires === undefined ? { year: GAME_DATE.year + 1, month: 6, day: 30 } : dateFromNumber(terms.expires);
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
    old: 0,
    new: to.uid,
    undoneAt: null,
    batch: null,
    moved: { to: to.name },
  };
  changes.push(logged);
  return { ...logged };
}

/**
 * `sign_free_agent_later`: the game agrees the fixture free agent's signing for `clubUid` today, to join it on `joins`
 * (yyyymmdd). He stays a free agent until then, so only the change log has it; undoing it cancels the signing.
 */
function signFreeAgentLater(uid: number, clubUid: number, joins: number): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  const to = clubs.find((c) => c.uid === clubUid);
  if (!player) {
    throw notFound("player", uid);
  }
  if (!to) {
    throw notFound("club", clubUid);
  }
  if (player.clubUid !== null) {
    throw failure("move.hasClub", "the player has a club; only a free agent signs for one");
  }
  if (!(joins > numberFromDate(GAME_DATE) && joins <= 21001231)) {
    throw failure("move.outOfRange", "transfer.joins is out of range", {
      field: "transfer.joins",
      value: joins,
      min: numberFromDate(addDays(GAME_DATE, 1)),
      max: 21001231,
    });
  }
  const logged: LoggedChange = {
    id: changes.length + 1,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "club",
    old: 0,
    new: to.uid,
    undoneAt: null,
    batch: null,
    moved: { to: to.name, joins },
  };
  changes.push(logged);
  signingOffers.set(logged.id, 900 + logged.id);
  futureTransfers.set(uid, [
    ...futureTransfersOf(player),
    { offer: 900 + logged.id, club: to.name, clubUid: to.uid, joins: dateFromNumber(joins) },
  ]);
  return { ...logged };
}

/**
 * `plan_release`: the checks of the real command that the fixtures can have, with its messages; names his club. The
 * fixtures' game releases players itself, at your club too, and nothing undoes it.
 */
function planRelease(uid: number): ReleasePreview {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  if (player.clubUid === null) {
    throw failure("move.freeAgent", "the player has no club; free agents cannot be moved yet");
  }
  const from = clubs.find((c) => c.uid === player.clubUid)!;
  return { uid: from.uid, name: from.name, permanent: true };
}

/** `release_player`: the fixture player leaves his club as a free agent, logged as a change of his `club` to 0. */
function releasePlayer(uid: number): LoggedChange {
  const from = planRelease(uid);
  const player = players.find((p) => p.uid === uid)!;
  const id = changes.length + 1;
  Object.assign(player, { club: null, clubUid: null, contractExpires: null });
  const logged: LoggedChange = {
    id,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "club",
    old: from.uid,
    new: 0,
    undoneAt: null,
    batch: null,
    moved: { from: from.name },
    permanent: true,
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
        "he plays for your club; transfer him in FM",
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

/**
 * Puts back what the move (or swap, or release) logged as `entry` changed, unless a player has moved again since. A
 * release logged 0 as his new club: he has none.
 */
function undoMove(entry: LoggedChange): void {
  const player = players.find((p) => p.uid === entry.uid);
  const before = moveUndo.get(entry.id);
  const other = before?.other && players.find((p) => p.uid === before.other!.uid);
  if (!player || !before || (player.clubUid ?? 0) !== entry.new || (before.other && other?.clubUid !== entry.old)) {
    throw failure("move.changed", "the game has changed the player's club since; reload and try again");
  }
  if (before.other && other) {
    Object.assign(other, before.other.row);
    unmoved(other.uid);
  }
  // The fee goes back by what it changed.
  for (const [club, key, change] of before.paid ?? []) {
    writeValue("club", club, key, currentValues("club", club)[key]! - change);
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
  addedInjuries.delete(uid);
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

/** `lift_bans`: the fixture player's bans are lifted, logged as a change of his `bans` to none. */
function liftBans(uid: number, batch: number | null = null): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const bans = bansOf(uid).length;
  if (bans === 0) {
    throw failure("ban.notBanned", "the player has no ban to lift");
  }
  liftedPlayers.add(uid);
  const logged: LoggedChange = {
    id: changes.length + 1,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "bans",
    old: bans,
    new: 0,
    undoneAt: null,
    batch,
  };
  changes.push(logged);
  return { ...logged };
}

/** `remove_unhappiness`: the fixture player's reasons to be unhappy that last end today, logged as one change. */
function removeUnhappiness(uid: number): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const report: MassReport = { batch: 0, applied: 0, failed: [], freeze: null };
  setValues(player, [["contract.unhappiness", 0]], report);
  const logged = changes[changes.length - 1];
  if (report.applied === 0 || !logged) {
    throw failure("list.missing", "the list holds nothing at number 0", { index: 0 });
  }
  logged.batch = null;
  return { ...logged };
}

/** Which promise (as `uid:index`) each closing, by the id of its logged change, closed, for its undo. */
const promiseUndo = new Map<number, string>();

/** `close_promise`: the fixture player's open promise at `index` ends, logged as a change of his `promise` to 0. */
function closePromise(uid: number, index: number, shown: PlayerPromise | undefined): LoggedChange {
  const player = players.find((p) => p.uid === uid);
  if (!player) {
    throw notFound("player", uid);
  }
  const promise = promisesOf(uid)[index];
  if (shown !== undefined && JSON.stringify(promise) !== JSON.stringify(shown)) {
    throw failure("move.changed", "the game has changed this since; reload and try again", {});
  }
  if (!promise || promise.closed) {
    throw failure("promise.notOpen", "the player has no open promise there", { uid, index });
  }
  closedPromises.add(`${uid}:${index}`);
  const logged: LoggedChange = {
    id: changes.length + 1,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid,
    field: "promise",
    old: promise.id,
    new: 0,
    undoneAt: null,
    batch: null,
  };
  changes.push(logged);
  promiseUndo.set(logged.id, `${uid}:${index}`);
  return { ...logged };
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
        jadedness: d.jadedness,
        morale: d.morale,
        injuries: d.injuries.length,
        bans: d.bans.length,
        unhappy: d.contract?.concerns.some((concern) => concern.ended === null) ?? false,
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
    throw failure("move.changed", "the game has changed this since; reload and try again", { address: "0x0" });
  }
  captainsSet.set(undo.key, undo.before);
}

/** `team_action`: the action on every player of the fixture team, logged as one batch like a mass edit. */
function teamAction(clubUid: number, index: number, action: TeamAction): MassReport {
  const team = fixtureTeam(clubUid, index);
  const batch = nextMassId++;
  const report: MassReport = { batch, applied: 0, failed: [], freeze: null };
  if (action === "heal") {
    for (const player of team.players.filter((p) => p.injuries > 0)) {
      healPlayer(player.uid, batch);
      report.applied++;
    }
    return report;
  }
  if (action === "liftBans") {
    for (const player of team.players.filter((p) => p.bans > 0)) {
      liftBans(player.uid, batch);
      report.applied++;
    }
    return report;
  }
  if (action === "removeUnhappiness") {
    for (const player of team.players.filter((p) => p.unhappy)) {
      setValues(player, [["contract.unhappiness", 0]], report);
    }
    return report;
  }
  if (action === "maxCohesion") {
    for (const player of team.players) {
      raiseFamiliarity(player, report);
    }
    return report;
  }
  if (action === "maxTactics") {
    for (const player of team.players) {
      raiseTactics(player, report);
    }
    return report;
  }
  const values: [string, number][] =
    action === "maxMorale"
      ? [["morale", 20]]
      : action === "refresh"
        ? [["condition", 10_000], ["match_sharpness", 10_000], ["jadedness", -500]]
        : ATTRIBUTES.map(bestAttribute);
  for (const player of team.players) {
    setValues(player, values, report);
  }
  return report;
}

/** Fixture players Max tactics made fully familiar with the tactic, by UID. */
const tacticsRaised = new Set<number>();

/** Max tactics for one fixture player: every fifth knows the tactic fully already, the rest 30 to 89 before. */
function raiseTactics(player: { uid: number; name: string }, report: MassReport): void {
  if (player.uid % 5 === 0 || tacticsRaised.has(player.uid)) {
    return;
  }
  tacticsRaised.add(player.uid);
  changes.push({
    id: changes.length + 1,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid: player.uid,
    field: "tactics",
    old: 30 + (player.uid % 60),
    new: 100,
    undoneAt: null,
    batch: report.batch,
  });
  report.applied++;
}

/** Fixture familiarity with the club, by UID, once Max cohesion changed it. */
const familiarity = new Map<number, number>();

/** Max cohesion for one fixture player: every seventh has no familiarity with the club yet, the rest 40 to 99, or 100. */
function raiseFamiliarity(player: { uid: number; name: string }, report: MassReport): void {
  if (player.uid % 7 === 0) {
    const message = "the game has not started the player's familiarity with this club yet, and the editor cannot add it";
    report.failed.push({ uid: player.uid, name: player.name, field: "cohesion", error: failure("cohesion.none", message) });
    return;
  }
  const before = familiarity.get(player.uid) ?? Math.min(100, 40 + (player.uid % 70));
  if (before >= 100) {
    return;
  }
  familiarity.set(player.uid, 100);
  changes.push({
    id: changes.length + 1,
    at: Date.now(),
    name: player.name,
    entity: "player",
    uid: player.uid,
    field: "cohesion",
    old: before,
    new: 100,
    undoneAt: null,
    batch: report.batch,
  });
  report.applied++;
}

/** An attribute at its best, as Max attributes writes it: 20, stored as 100, and 1 (stored as 5) where lower is better. */
/** `key` at `level` as stored (shown × 5); lower is better for injury proneness and dirtiness, so they get 21 − level. */
const attributeAt = (key: string, level: number): [string, number] => [
  `attribute.${key}`,
  (key === "injury_proneness" || key === "dirtiness" ? 21 - level : level) * 5,
];

const bestAttribute = (key: string): [string, number] => attributeAt(key, 20);

/** Writes `values` (field, value as stored) to the player, each logged in the batch of `report`, which counts them. */
function setValues(player: { uid: number; name: string }, values: [string, number][], report: MassReport): void {
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
      batch: report.batch,
    };
    changes.push(logged);
    report.applied++;
  }
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
let pendingMass: { id: number; entity: Entity; planned: PlannedChange[]; freeze: MassFreeze | null } | null = null;
let nextMassId = 1;

/** Those a mass edit freezes (`frozen`) or unfreezes: not those that are that way already. */
interface MassFreeze {
  entity: Entity;
  frozen: boolean;
  uids: number[];
}

/** What each mass edit froze or unfroze, by its batch, for its undo. */
const massFreezes = new Map<number, MassFreeze>();

/** What is frozen of a kind of entity: the attributes of players or staff, the money of clubs. */
const frozenSet = (entity: Entity) =>
  entity === "player" ? frozenAttributes : entity === "staff" ? frozenStaff : frozenMoney;

/** Freezes or unfreezes what `freeze` names. */
function makeFreeze({ entity, frozen, uids }: MassFreeze) {
  const held = frozenSet(entity);
  for (const uid of uids) {
    if (frozen) {
      held.add(uid);
    } else {
      held.delete(uid);
    }
  }
}

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
function planMass(
  entity: Entity,
  query: string,
  filters: MassFilters,
  operations: MassOperation[],
  wanted: boolean | null,
): MassPreview {
  if (operations.length === 0 && wanted === null) {
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
  const held = frozenSet(entity);
  const freeze: MassFreeze | null =
    wanted === null
      ? null
      : { entity, frozen: wanted, uids: targets.map(({ uid }) => uid).filter((uid) => held.has(uid) !== wanted) };
  const id = nextMassId++;
  pendingMass = { id, entity, planned, freeze };
  return {
    id,
    targets: targets.length,
    // Without operations nobody "already has these values": the plan is the freeze alone.
    unchanged: ops.length === 0 ? 0 : unchanged,
    changes: planned.length,
    rows: planned.slice(0, PREVIEW_ROWS),
    skippedCount: skipped.length,
    skipped: skipped.slice(0, PREVIEW_ROWS),
    freeze: freeze && { frozen: freeze.frozen, count: freeze.uids.length },
  };
}

/** `apply_mass_edit`: the previewed changes, each only while the value is still the one previewed, then its freeze. */
function applyMass(id: number): MassReport {
  if (!pendingMass || pendingMass.id !== id) {
    throw failure("mass.outOfDate", "This preview is out of date. Preview the mass edit again.");
  }
  const { entity, planned, freeze } = pendingMass;
  pendingMass = null;
  const batch = nextMassId++;
  const report: MassReport = { batch, applied: 0, failed: [], freeze: null };
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
  if (freeze) {
    makeFreeze(freeze);
    report.freeze = { frozen: freeze.frozen, count: freeze.uids.length, failed: 0, error: null };
    if (freeze.uids.length > 0) {
      massFreezes.set(batch, freeze);
    }
  }
  return report;
}

/** `undo_batch`: every change of the batch not undone yet, newest first, and what it froze or unfroze. */
function undoMassBatch(batch: number): BatchUndo {
  const report: BatchUndo = { undone: 0, failed: [], freeze: null };
  for (const entry of [...changes].reverse()) {
    if (entry.batch !== batch || entry.undoneAt !== null || entry.earlierGame) {
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
  const made = massFreezes.get(batch);
  if (made) {
    massFreezes.delete(batch);
    makeFreeze({ ...made, frozen: !made.frozen });
    report.freeze = { frozen: !made.frozen, count: made.uids.length };
  }
  return report;
}

const clubs: ClubSummary[] = CLUBS.flatMap((name, i) => {
  // The men's club and its women's club are from the same nation.
  const place = { nation: NATIONS[i % NATIONS.length], nationUid: 1000 + (i % NATIONS.length) };
  const shortName = name.split(" ")[0];
  return [
    { uid: 500 + i * 7, name, shortName, women: false, reputation: 8200 - i * 900, founded: 1880 + i * 11, ...place },
    { uid: 2_000_100_000 + i, name, shortName, women: true, reputation: 6100 - i * 700, founded: 1985 + i * 4, ...place },
  ];
});

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
    stadium: stadiumOf(club, next),
    ...clubTiesOf(club),
  });
}

/** A made-up stadium for `club`: all seated, as in the top leagues, with room to grow. */
function stadiumOf(club: ClubSummary, next: () => number): ClubDetails["stadium"] {
  const capacity = Math.round(8000 + next() * 60000);
  // The men's club owns the ground its women's club shares.
  const owner = clubs.find((other) => other.shortName === club.shortName && !other.women) ?? club;
  return {
    name: `${club.shortName} Park`,
    capacity,
    seating: capacity,
    used: 0,
    expansion: Math.round(capacity * 1.25),
    owner: { uid: owner.uid, name: owner.name, women: owner.women },
  };
}

/** A date as a number that orders like the date. */
const dayNumber = (date: FmDate) => (date.year * 100 + date.month) * 100 + date.day;

/** Whether `text` contains `needle`, ignoring accents and case; an empty needle matches anything. */
function contains(text: string | null, needle: string | undefined): boolean {
  const wanted = fold(needle?.trim() ?? "");
  return wanted === "" || (text !== null && fold(text).includes(wanted));
}

/**
 * Whether an attribute as FM shows it keeps to `bound`; as in the real filter, one the person does not have keeps to
 * none.
 */
function holds(bound: AttributeBound, value: number | undefined): boolean {
  return (
    value !== undefined &&
    value > 0 &&
    (bound.min === undefined || value >= bound.min) &&
    (bound.max === undefined || value <= bound.max)
  );
}

/** Whether `value` is known and within the two ends, as the real filter has it; with neither end it need not be known. */
function within(value: number | null, min: number | undefined, max: number | undefined): boolean {
  return (
    (min === undefined && max === undefined) ||
    (value !== null && (min === undefined || value >= min) && (max === undefined || value <= max))
  );
}

/**
 * The sort of the real commands by a column: unknown values go last either way and text compares without accents or
 * case. Like the real one it is stable, so equals keep the search's order.
 */
function byColumn<Row>(
  order: { by: string; ascending: boolean } | undefined,
  column: (row: Row, by: string) => string | number | null,
): (a: Row, b: Row) => number {
  if (!order) {
    return () => 0;
  }
  const value = (row: Row) => {
    const found = column(row, order.by);
    return typeof found === "string" ? fold(found) : found;
  };
  return (a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) {
      return x === y ? 0 : x === null ? 1 : -1;
    }
    return x === y ? 0 : (x < y ? -1 : 1) * (order.ascending ? 1 : -1);
  };
}

type Ratings = Record<string, { value: number } | undefined>;

/** The club of the career's manager. */
const humanClub = () => staff.find((s) => s.isHuman)?.clubUid ?? null;

const onBoard = (s: StaffSummary) => s.job !== null && BOARD_JOBS.includes(s.job);

/** What a search was asked to rank for, if anything. */
function bestOf(args: Record<string, unknown> | undefined): BestFor | undefined {
  const best = args?.best as BestFor | undefined;
  return best && best.weights.length > 0 ? best : undefined;
}

/**
 * The hits of a search asked to rank for something, each with its fit, the best first unless an order was asked for;
 * the hits as they are without it.
 */
function ranked<Row extends { fit?: Fit }>(
  hits: Row[],
  args: Record<string, unknown> | undefined,
  ratings: (row: Row) => Ratings,
): Row[] {
  const best = bestOf(args);
  if (!best) {
    return hits;
  }
  const rows = hits.map((row) => ({ ...row, fit: fitOf(best, (key) => ratings(row)[key]?.value ?? 0) }));
  return args?.order ? rows : rows.sort((a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1));
}

/** The best fit among `own`, those of your club a ranked search could list, as the real search answers with it. */
function yoursOf<Row extends { uid: number; name: string }>(
  own: Row[],
  args: Record<string, unknown> | undefined,
  ratings: (row: Row) => Ratings,
): Yours | undefined {
  const best = bestOf(args);
  if (!best) {
    return undefined;
  }
  let yours: Yours | undefined;
  for (const row of own) {
    const score = fitOf(best, (key) => ratings(row)[key]?.value ?? 0)?.score;
    if (score !== undefined && score >= (yours?.score ?? 0)) {
      yours = { uid: row.uid, name: row.name, score };
    }
  }
  return yours;
}

/** The sort a search was asked for, if any. */
const orderOf = (args: Record<string, unknown> | undefined) =>
  args?.order as { by: string; ascending: boolean } | undefined;

/** A player as the list has him: with the value, wage and reputation of his profile. */
function listed(p: PlayerSummary): PlayerSummary {
  const d = details(p);
  return { ...p, value: d.transferValue ?? null, wage: d.contract?.wage ?? null, currentReputation: d.reputation.current };
}

/** The player filter of the real command: fields that are not set match everyone. */
function matchesPlayerFilter(p: PlayerSummary, f: PlayerFilter): boolean {
  // The listings, the attributes and what else the row leaves out are in the profile, made only when a filter asks
  // for them.
  const needsDetails =
    f.transferListed ||
    f.loanListed ||
    (f.attributes?.length ?? 0) > 0 ||
    (f.personality?.length ?? 0) > 0 ||
    (f.traits?.length ?? 0) > 0 ||
    [f.minHeight, f.maxHeight, f.minWage, f.maxWage, f.minValue, f.maxValue, f.minReputation, f.maxReputation].some(
      (bound) => bound !== undefined,
    );
  const d = needsDetails ? details(p) : null;
  return (
    (f.positions === undefined || f.positions.some((key) => p.positions.includes(key))) &&
    (f.minAge === undefined || (p.age !== null && p.age >= f.minAge)) &&
    (f.maxAge === undefined || (p.age !== null && p.age <= f.maxAge)) &&
    (f.minCurrentAbility === undefined || p.currentAbility >= f.minCurrentAbility) &&
    (f.maxCurrentAbility === undefined || p.currentAbility <= f.maxCurrentAbility) &&
    (f.minPotentialAbility === undefined || p.potentialAbility >= f.minPotentialAbility) &&
    (f.maxPotentialAbility === undefined || (p.potentialAbility > 0 && p.potentialAbility <= f.maxPotentialAbility)) &&
    within(d && d.heightCm > 0 ? d.heightCm : null, f.minHeight, f.maxHeight) &&
    within(d?.contract?.wage ?? null, f.minWage, f.maxWage) &&
    within(d?.transferValue ?? null, f.minValue, f.maxValue) &&
    within(d?.reputation.current ?? null, f.minReputation, f.maxReputation) &&
    (f.personality ?? []).every((bound) => holds(bound, d?.personality[bound.key])) &&
    (f.traits ?? []).every((bit) => d?.traits.includes(bit) === true) &&
    contains(p.nation, f.nation) &&
    contains(p.club, f.club) &&
    (f.clubUid === undefined || p.clubUid === f.clubUid) &&
    (!f.freeAgents || p.club === null) &&
    (f.contractExpiresBy === undefined ||
      (p.contractExpires !== null && dayNumber(p.contractExpires) <= dayNumber(f.contractExpiresBy))) &&
    (!f.transferListed || d?.contract?.transferListed === true) &&
    (!f.loanListed || d?.contract?.loanListed === true) &&
    (f.attributes ?? []).every((bound) => holds(bound, d?.attributes[bound.key]?.value)) &&
    (f.potentialAttributes ?? []).every((bound) => holds(bound, mockScout(p).peak[bound.key])) &&
    (f.roles ?? []).every((bound) => bound.min === undefined || mockRoleRating(p, bound.role) >= bound.min) &&
    (f.minDevelopment === undefined || (mockDevelopment(p)?.probability ?? -1) >= f.minDevelopment) &&
    (f.minProgress === undefined || (mockDevelopment(p)?.halfStars ?? -1) >= f.minProgress) &&
    contains(mockPlace(p)?.name ?? null, f.basedIn)
  );
}

/** The scouting report of a made-up player: his attributes a little higher, and a few roles. */
function mockScout(p: PlayerSummary): Omit<ScoutReport, "careers"> {
  const d = details(p);
  const growth = Math.max(0, p.potentialAbility - p.currentAbility) * 0.08;
  const peak = Object.fromEntries(
    Object.entries(d.attributes).map(([key, attribute]) => [key, Math.min(20, Math.round(attribute.value + growth))]),
  );
  const roles = ["advanced_forward.attack", "inside_forward.attack", "winger.support", "poacher.attack",
    "central_midfielder.support", "ball_playing_defender.defend"]
    .map((role) => ({ role, today: mockRoleRating(p, role), peak: Math.min(100, mockRoleRating(p, role) + Math.round(growth * 4)) }))
    .sort((a, b) => b.peak - a.peak);
  return { potential: p.potentialAbility > 0 ? p.potentialAbility : null, peak, development: mockDevelopment(p), roles };
}

// Stand-ins for FM Lens's scouting estimates (crates/fmlens-scout): simple numbers that move the right way, enough to
// lay the UI out with. They are not the real models.

/** A number from 0 to `span` - 1 that is the same for the same text. */
function spread(text: string, span: number): number {
  let hash = 7;
  for (const char of text) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 100003;
  }
  return hash % span;
}

function mockDevelopment(p: PlayerSummary): { probability: number; gain: number; halfStars: number } | null {
  if (p.age === null || p.potentialAbility <= 0) {
    return null;
  }
  const gap = Math.max(0, p.potentialAbility - p.currentAbility);
  const years = Math.max(0, 25 - p.age);
  const gain = Math.min(gap, (gap * Math.min(years, 2)) / 4);
  const probability = gap <= 7 ? 100 : Math.max(1, Math.min(99, Math.round(95 - gap + years * 4)));
  const halfStars = [1, 3, 5, 8, 11, 15, 19, 24, 30, 37].filter((bound) => gain >= bound).length;
  return { probability, gain, halfStars };
}

function mockRoleRating(p: PlayerSummary, role: string): number {
  return Math.max(0, Math.min(100, Math.round(p.currentAbility / 2.2 + spread(`${p.uid}${role}`, 25))));
}

function mockSimilarity(target: PlayerSummary, p: PlayerSummary, peak: boolean): number {
  const ability = (x: PlayerSummary) => (peak ? Math.max(x.currentAbility, x.potentialAbility) : x.currentAbility);
  const shared = target.positions.some((position) => p.positions.includes(position)) ? 0 : 25;
  return Math.max(0, 100 - Math.abs(ability(target) - ability(p)) - shared - spread(`${target.uid}:${p.uid}`, 8));
}

function mockRow(p: PlayerSummary, roles: readonly string[], similar: { target: PlayerSummary; peak: boolean } | null, rank: number | null): PlayerRow {
  const development = mockDevelopment(p);
  return {
    ...p,
    similarity: similar ? mockSimilarity(similar.target, p, similar.peak) : null,
    development: development?.probability ?? null,
    progress: development?.halfStars ?? null,
    roles: Object.fromEntries(roles.map((role) => [role, mockRoleRating(p, role)])),
    rank,
  };
}

/** Where a made-up player's club is: the club's name decides the country, so the lists have some to choose from. */
const MOCK_PLACES = [
  { uid: 765, name: "England", continent: "Europe" },
  { uid: 796, name: "Spain", continent: "Europe" },
  { uid: 1649, name: "Argentina", continent: "South America" },
];
const mockPlace = (p: PlayerSummary) => (p.club === null ? null : MOCK_PLACES[spread(p.club, MOCK_PLACES.length)]);

/** The search's own order, as the real index has it: best current ability first, then by name without accents or case. */
function bySearchRank(a: PlayerSummary, b: PlayerSummary): number {
  const x = fold(a.name);
  const y = fold(b.name);
  return b.currentAbility - a.currentAbility || (x < y ? -1 : x > y ? 1 : 0) || a.uid - b.uid;
}

/**
 * The sort of the real command: unknown values (no age, no club, no contract) go last either way and text
 * compares without accents or case. Like the real one it is stable, so equals keep the search's order.
 */
function playerComparator({ by, ascending }: PlayerOrder): (a: PlayerSummary, b: PlayerSummary) => number {
  const value = (p: PlayerSummary): string | number | null => {
    if (by.startsWith("attribute.")) {
      return details(p).attributes[by.slice("attribute.".length)]?.value ?? null;
    }
    if (by.startsWith("role.")) {
      return mockRoleRating(p, by.slice("role.".length));
    }
    switch (by) {
      case "value":
        return details(p).transferValue ?? null;
      case "wage":
        return details(p).contract?.wage ?? null;
      case "reputation":
        return details(p).reputation.current;
      case "development":
        return mockDevelopment(p)?.probability ?? null;
      case "progress":
        return mockDevelopment(p)?.gain ?? null;
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
      default:
        return null;
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
function matchesClubFilter(c: ClubSummary, f: ClubFilter): boolean {
  return (
    (f.women === undefined || c.women === f.women) &&
    (f.minReputation === undefined || (c.reputation !== null && c.reputation >= f.minReputation)) &&
    (f.maxReputation === undefined || (c.reputation !== null && c.reputation <= f.maxReputation)) &&
    (f.foundedFrom === undefined || (c.founded !== null && c.founded >= f.foundedFrom)) &&
    (f.foundedTo === undefined || (c.founded !== null && c.founded <= f.foundedTo)) &&
    contains(c.nation, f.nation)
  );
}

function matchesStaffFilter(s: StaffSummary, f: StaffFilter): boolean {
  const d = (f.attributes?.length ?? 0) > 0 ? staffDetails(s) : null;
  return (
    (f.job === undefined || (s.job !== null && (s.job === f.job || s.job === f.job + 1))) &&
    (!f.unemployed || s.job === null) &&
    (!f.humanOnly || s.isHuman) &&
    (f.minAge === undefined || (s.age !== null && s.age >= f.minAge)) &&
    (f.maxAge === undefined || (s.age !== null && s.age <= f.maxAge)) &&
    (f.minCurrentAbility === undefined || s.currentAbility >= f.minCurrentAbility) &&
    (f.maxCurrentAbility === undefined || s.currentAbility <= f.maxCurrentAbility) &&
    (f.minPotentialAbility === undefined || s.potentialAbility >= f.minPotentialAbility) &&
    (f.maxPotentialAbility === undefined || (s.potentialAbility > 0 && s.potentialAbility <= f.maxPotentialAbility)) &&
    contains(s.nation, f.nation) &&
    contains(s.club, f.club) &&
    (f.attributes ?? []).every((bound) => holds(bound, d?.attributes[bound.key]?.value))
  );
}

/** The clubs whose money is frozen in this page; the fixtures have no game days for it to hold through. */
const frozenMoney = new Set<number>();

/** The players whose attributes are frozen in this page, likewise. */
const frozenAttributes = new Set<number>();

/** The members of staff whose attributes are frozen in this page, likewise. */
const frozenStaff = new Set<number>();

/** The fixture connection, once `connect` has been called in this page. */
let mockConnection: ConnectionInfo | null = null;

/**
 * `?unknownbuild` in the address previews a version of the game the editor has no profile for: read-only until Edit
 * anyway. `?failedchecks` previews checks that did not pass: the attributes, the contracts and the in-game date.
 */
const unknownBuild = new URLSearchParams(window.location.search).has("unknownbuild");
const failedChecks = new URLSearchParams(window.location.search).has("failedchecks");
/** `?writable` previews a game the app may write to, so Edit, Apply and Undo can be tried on the sample data. */
const writable = new URLSearchParams(window.location.search).has("writable");
/** `?refrozen` previews connecting to a save in which players and a club were frozen the last time. */
const refrozen = new URLSearchParams(window.location.search).has("refrozen");
/** `?restarted` previews connecting after FM was restarted: the changes made before are listed, no longer undone. */
const restarted = new URLSearchParams(window.location.search).has("restarted");
/** `?moved` previews FM moving its lists after connecting: editing is off until the app reads the game again. */
let listsMoved = false;

/** What `?restarted` lists: an edit, and a mass edit of two players, made an hour before FM was restarted. */
function earlierChanges(): LoggedChange[] {
  const at = Date.now() - 60 * 60 * 1000;
  const batch = nextMassId++;
  const [first, second, third] = players;
  const change = (id: number, player: PlayerSummary, field: string, old: number, value: number): LoggedChange => ({
    id,
    at: at + id * 60_000,
    name: player.name,
    entity: "player",
    uid: player.uid,
    field,
    old,
    new: value,
    undoneAt: null,
    earlierGame: true,
    batch: id === 1 ? null : batch,
  });
  return [
    change(1, first, "attribute.finishing", 70, 85),
    change(2, second, "attribute.pace", 60, 100),
    change(3, third, "attribute.pace", 65, 100),
  ];
}
const CHECKS: CheckKey[] = [
  "gameDate",
  "players",
  "positions",
  "attributes",
  "personality",
  "liveValues",
  "contracts",
  "teams",
  "staff",
  "clubs",
  "nations",
];
const FAILING: CheckKey[] = ["gameDate", "attributes", "contracts"];

/**
 * What the checks find in the fixtures: every one passes, but for the failing ones of `?failedchecks`, and the in-game
 * date under `?nodate`, as a date that cannot be read never passes.
 */
/** The sample career: its human manager (the first member of staff) and his club. */
function mockCareer() {
  const manager = staff.find((member) => member.isHuman);
  return manager ? { uid: manager.uid, manager: manager.name, club: manager.club, clubUid: manager.clubUid } : null;
}

function mockHealth(): Health {
  return {
    results: CHECKS.map((check) => {
      const passed = !(failedChecks && FAILING.includes(check)) && !(check === "gameDate" && gameDate === null);
      return { check, passed, fit: passed ? 2000 : 640, sampled: 2000, note: "" };
    }),
  };
}

/**
 * `?macos` in the address previews the connect panel on macOS: the bridge is not set up, Steam is running, and the game
 * was started without the bridge. The first set-up meets a running Steam, as the real one would; the next one works.
 */
const macPreview = new URLSearchParams(window.location.search).has("macos");
/** `?nodate` previews a version of the game whose in-game date the editor cannot read. */
const gameDate = new URLSearchParams(window.location.search).has("nodate") ? null : GAME_DATE;
const notSetUp = (): BridgeInfo => ({
  ready: false,
  installed: false,
  launchOption:
    'DYLD_INSERT_LIBRARIES="/Users/me/Library/Application Support/FM27Scout/libfmlens_bridge.dylib" %command%',
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
        message: `macOS does not let FM Lens into the game (pid ${game.pid}): it was started without the bridge`,
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
    case "app_version":
      return appVersion as T;
    case "bridge_status":
      return (macPreview ? mockBridge : null) as T;
    case "connect": {
      const info: ConnectionInfo = {
        game,
        profile: unknownBuild ? null : "FM27 0.9.2409.0 (Game Pass)",
        arrays: {
          players: { pairRva: 0x5681dc0, count: players.length, confidence: 1 },
          staff: { pairRva: 0x5681e08, count: 120, confidence: 1 },
          clubs: { pairRva: 0x5681f78, count: CLUBS.length, confidence: 1 },
          fromProfile: true,
        },
        players: players.length,
        staff: staff.length,
        clubs: clubs.length,
        gameDate: failedChecks ? null : gameDate,
        loadMs: 480,
        editable: writable && !unknownBuild,
        writable,
        knownBuild: !unknownBuild,
        health: mockHealth(),
        career: mockCareer(),
        gameActions: { addInjury: true, workPermit: true, startLoan: true, signFreeAgent: true, transfer: true, endLoan: true, release: true, futureTransfer: true, maxTactics: true, moveManager: true },
      };
      if (restarted && changes.length === 0) {
        changes.push(...earlierChanges());
      }
      mockConnection = info;
      listsMoved = new URLSearchParams(window.location.search).has("moved");
      if (!refrozen) {
        return info as T;
      }
      // What a restart of the app finds frozen in this save: the first two players and the first club, with one more
      // that waits.
      for (const player of players.slice(0, 2)) {
        frozenAttributes.add(player.uid);
      }
      frozenMoney.add(clubs[0].uid);
      const again: Refrozen = {
        players: players.slice(0, 2).map((p) => p.name),
        staff: [],
        clubs: [clubs[0].name],
        waiting: 1,
      };
      return { ...info, refrozen: again } as T;
    }
    case "graphics_info":
      // A plain browser has no graphics packs: every picture falls back.
      return { root: null, ready: true, counts: { clubLogos: 0, faces: 0, flags: 0, competitionLogos: 0, kits: 0 } } as T;
    case "club_kits":
      // The browser has no graphics packs.
      return [] as T;
    case "allow_editing": {
      if (!mockConnection) {
        throw failure("app.notConnected", "Not connected to the game");
      }
      mockConnection = { ...mockConnection, editable: mockConnection.writable && mockConnection.knownBuild };
      return mockConnection as T;
    }
    case "current_connection":
      // Like the real command after a window reload; here a reload starts the fixtures afresh, so it is null then.
      return (mockConnection && { ...mockConnection, loadMs: 0, editable: mockConnection.editable && !listsMoved }) as T;
    case "reload": {
      listsMoved = false;
      const reloaded: ReloadInfo = {
        editable: mockConnection?.editable ?? false,
        writable: mockConnection?.writable ?? false,
        knownBuild: mockConnection?.knownBuild ?? !unknownBuild,
        players: players.length,
        staff: staff.length,
        clubs: clubs.length,
        gameDate: failedChecks ? null : gameDate,
        health: mockHealth(),
        career: mockCareer(),
      };
      return reloaded as T;
    }
    case "search_players": {
      const query = String(args?.query ?? "");
      const limit = Number(args?.limit ?? 200);
      const filter = (args?.filter ?? {}) as PlayerFilter;
      const similarTo = (args?.similar ?? null) as SimilarTo | null;
      const target = similarTo && players.find((p) => p.uid === similarTo.uid);
      if (similarTo && !target) {
        throw notFound("player", similarTo.uid);
      }
      const similar = target ? { target, peak: similarTo?.peak === true } : null;
      // Without an order the best current ability comes first, as with the real command; compared, the most alike.
      const order = (args?.order ?? { by: "currentAbility", ascending: false }) as PlayerOrder;
      const roles = ((args?.roles ?? []) as string[]).slice(0, 6);
      const words = fold(query).split(/\s+/).filter(Boolean);
      const positions = (args?.best as BestFor | undefined)?.positions ?? [];
      const plays = (p: PlayerSummary) => positions.length === 0 || positions.some((key) => p.positions.includes(key));
      const found = players
        .filter((p) => String(p.uid) === query.trim() || words.every((w) => fold(`${p.name} ${p.fullName ?? ""}`).includes(w)))
        .filter((p) => p.uid !== target?.uid && matchesPlayerFilter(p, filter))
        .filter(plays)
        .sort(bySearchRank)
        .sort(
          similar && args?.order === undefined
            ? (a, b) => mockSimilarity(similar.target, b, similar.peak) - mockSimilarity(similar.target, a, similar.peak)
            : playerComparator(order),
        );
      // A comparison orders the list itself; it is never ranked for Best for at once.
      const hits = similar ? found : ranked(found, args, (p) => details(p).attributes);
      const own = players.filter((p) => p.clubUid !== null && p.clubUid === humanClub() && plays(p));
      // The attributes the list has columns for go with each row.
      const columns = ((args?.attributes ?? []) as string[]).slice(0, 12);
      const rows = hits.slice(Number(args?.offset ?? 0), Number(args?.offset ?? 0) + limit).map((p): PlayerRow => {
        const attributes = details(p).attributes;
        const shown = columns.filter((key) => attributes[key] !== undefined).map((key) => [key, attributes[key].value]);
        const row = mockRow(listed(p), roles, similar, null);
        return { ...row, ...(shown.length > 0 ? { attributeValues: Object.fromEntries(shown) } : {}) };
      });
      const page: PlayerPage = {
        total: hits.length,
        rows,
        yours: yoursOf(own, args, (p) => details(p).attributes),
      };
      return page as T;
    }
    case "player_scout": {
      const uid = Number(args?.uid);
      const player = players.find((p) => p.uid === uid);
      if (!player) {
        throw notFound("player", uid);
      }
      // Every third made-up player turns up in another career.
      const careers = player.uid % 3 === 0 && player.age !== null
        ? [{
            manager: "Alex Morgan",
            club: "Northbridge Athletic",
            points: [0, 1, 2].map((year) => ({
              year: 2026 + year,
              age: (player.age ?? 0) - 1 + year,
              currentAbility: Math.max(1, player.currentAbility - 12 + year * 9),
              potentialAbility: player.potentialAbility,
            })),
          }]
        : [];
      const report: ScoutReport = { ...mockScout(player), careers };
      return report as T;
    }
    case "top_places_list": {
      const places: TopPlaces = {
        continents: [...new Set(MOCK_PLACES.map((place) => place.continent))].sort(),
        nations: [...MOCK_PLACES].sort((a, b) => a.name.localeCompare(b.name)),
        // Each made-up country has two divisions; a player's is by his UID.
        divisions: MOCK_PLACES.flatMap((place) =>
          [0, 1].map((tier) => ({
            uid: place.uid * 10 + tier,
            name: `${place.name} ${tier === 0 ? "First" : "Second"} Division`,
            nation: place.uid,
            women: false,
          })),
        ),
      };
      return places as T;
    }
    case "top_players_list": {
      const query = String(args?.query ?? "");
      const limit = Number(args?.limit ?? 200);
      const offset = Number(args?.offset ?? 0);
      const kind = (args?.kind ?? "best") as TopKind;
      const scope = (args?.scope ?? {}) as TopScope;
      const inScope = (p: PlayerSummary) => {
        const place = mockPlace(p);
        return (
          (scope.women ?? false) === false &&
          (scope.nation === undefined || place?.uid === scope.nation) &&
          (scope.division === undefined || (place ? place.uid * 10 + (p.uid % 2) : -1) === scope.division) &&
          (scope.continent === undefined || place?.continent === scope.continent)
        );
      };
      const ranked = players
        .filter((p) => inScope(p) && (kind === "best" || (p.age !== null && p.age <= 21)))
        .sort((a, b) =>
          kind === "best"
            ? b.currentAbility - a.currentAbility || b.potentialAbility - a.potentialAbility
            : b.potentialAbility - a.potentialAbility || b.currentAbility - a.currentAbility,
        )
        .slice(0, 100)
        .map((p, at) => ({ p, rank: at + 1 }));
      const words = fold(query).split(/\s+/).filter(Boolean);
      const hits = ranked.filter(({ p }) => words.every((w) => fold(p.name).includes(w)));
      const page: PlayerPage = {
        total: hits.length,
        rows: hits.slice(offset, offset + limit).map(({ p, rank }) => mockRow(listed(p), [], null, rank)),
      };
      return page as T;
    }
    case "search_clubs": {
      const query = String(args?.query ?? "");
      const limit = Number(args?.limit ?? 200);
      const filter = (args?.filter ?? {}) as ClubFilter;
      const words = fold(query).split(/\s+/).filter(Boolean);
      const hits = clubs
        .filter((c) => String(c.uid) === query.trim() || words.every((w) => fold(`${c.name} ${c.shortName ?? ""}`).includes(w)))
        .filter((c) => matchesClubFilter(c, filter))
        .sort((a, b) => (b.reputation ?? -1) - (a.reputation ?? -1) || a.name.localeCompare(b.name))
        .sort(byColumn<ClubSummary>(orderOf(args), (c, by) => (by === "name" ? c.name : by === "nation" ? c.nation : by === "founded" ? c.founded : c.reputation)));
      // A picker lists the person's own side of the game first.
      const pickedFor = args?.pickedFor as { uid: number; staff: boolean } | undefined;
      if (pickedFor) {
        const clubUid = (pickedFor.staff ? staff : players).find((p) => p.uid === pickedFor.uid)?.clubUid;
        const women = clubs.find((c) => c.uid === clubUid)?.women ?? false;
        hits.sort((a, b) => Number(a.women !== women) - Number(b.women !== women));
      }
      const page: ClubPage = { total: hits.length, rows: hits.slice(Number(args?.offset ?? 0), Number(args?.offset ?? 0) + limit) };
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
      const found = staff
        .filter((s) => String(s.uid) === query.trim() || words.every((w) => fold(`${s.name} ${s.fullName ?? ""}`).includes(w)))
        .filter((s) => matchesStaffFilter(s, filter))
        // A ranked list leaves the board out unless it is filtered to one of its jobs.
        .filter((s) => !bestOf(args) || filter.job !== undefined || !onBoard(s))
        .sort((a, b) => Number(b.isHuman) - Number(a.isHuman) || b.currentAbility - a.currentAbility || a.name.localeCompare(b.name))
        .sort(
          byColumn<StaffSummary>(orderOf(args), (s, by) => {
            switch (by) {
              case "name":
                return s.name;
              case "age":
                return s.age;
              case "club":
                return s.club ?? s.national?.nation ?? null;
              case "nation":
                return s.nation;
              case "potentialAbility":
                return s.potentialAbility;
              default:
                return s.currentAbility;
            }
          }),
        );
      const hits = ranked(found, args, (s) => staffDetails(s).attributes);
      const own = staff.filter((s) => !s.isHuman && !onBoard(s) && s.clubUid !== null && s.clubUid === humanClub());
      const page: StaffPage = {
        total: hits.length,
        rows: hits.slice(Number(args?.offset ?? 0), Number(args?.offset ?? 0) + limit),
        yours: yoursOf(own, args, (s) => staffDetails(s).attributes),
      };
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
    case "freeze_money": {
      const club = Number(args?.club);
      if (args?.frozen) {
        frozenMoney.add(club);
      } else {
        frozenMoney.delete(club);
      }
      return [...frozenMoney] as T;
    }
    case "frozen_clubs":
      return [...frozenMoney] as T;
    case "freeze_attributes": {
      const uid = Number(args?.uid);
      if (args?.frozen) {
        frozenAttributes.add(uid);
      } else {
        frozenAttributes.delete(uid);
      }
      return [...frozenAttributes] as T;
    }
    case "frozen_players":
      return [...frozenAttributes] as T;
    case "freeze_staff_attributes": {
      const uid = Number(args?.uid);
      if (args?.frozen) {
        frozenStaff.add(uid);
      } else {
        frozenStaff.delete(uid);
      }
      return [...frozenStaff] as T;
    }
    case "frozen_staff":
      return [...frozenStaff] as T;
    case "frozen_selection": {
      const entity = args?.entity as Entity;
      const held = frozenSet(entity);
      const targets = selectTargets(entity, String(args?.query ?? ""), (args?.filters ?? {}) as MassFilters);
      return { selected: targets.length, frozen: targets.filter(({ uid }) => held.has(uid)).length } as T;
    }
    case "export_players": {
      // Nothing is written in a browser: the report names the file a real export would have.
      const selected = selectTargets("player", String(args?.query ?? ""), {
        playerFilter: (args?.filter ?? {}) as PlayerFilter,
      });
      const folder = "C:\\Users\\you\\Documents\\FM Lens\\Exports";
      const two = (n: number) => String(n).padStart(2, "0");
      const stem = gameDate ? `players-${gameDate.year}-${two(gameDate.month)}-${two(gameDate.day)}` : "players";
      const file = `${stem}.${args?.format === "json" ? "json" : "csv"}`;
      const report: ExportReport = { path: `${folder}\\${file}`, file, folder, players: selected.length, skipped: 0 };
      return report as T;
    }
    case "save_card": {
      // Nothing is written in a browser: the answer names the file the app would have saved.
      const folder = "C:\\Users\\you\\Documents\\FM Lens\\Exports";
      const file = `${String(args?.stem ?? "player")}.png`;
      const saved: SavedCard = { path: `${folder}\\${file}`, file, folder };
      return saved as T;
    }
    case "open_export":
    case "show_export":
      return null as T;
    case "set_attributes": {
      const uid = Number(args?.uid);
      const level = Number(args?.level);
      const player = players.find((p) => p.uid === uid);
      if (!player) {
        throw notFound("player", uid);
      }
      const report: MassReport = { batch: nextMassId++, applied: 0, failed: [], freeze: null };
      setValues(player, ATTRIBUTES.map((key) => attributeAt(key, level)), report);
      return report as T;
    }
    case "list_nations": {
      const nations: Nation[] = NATIONS.map((name) => ({ address: nationAddress(name), uid: 1000 + NATIONS.indexOf(name), name }));
      return nations.sort((a, b) => a.name.localeCompare(b.name)) as T;
    }
    case "search_stadiums": {
      const raw = String(args?.query ?? "");
      const query = fold(raw);
      const limit = Number(args?.limit ?? 200);
      const filter = (args?.filter ?? {}) as StadiumFilter;
      // As in the game, a women's club often plays at its men's club's ground: one row each, its clubs best first.
      const grounds = new Map<string, StadiumSummary>();
      for (const club of [...clubs].sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0))) {
        const stadium = clubDetails(club).stadium;
        if (!stadium) {
          continue;
        }
        const tenant = { uid: club.uid, name: club.name, women: club.women };
        const ground = grounds.get(stadium.name ?? String(club.uid));
        if (ground) {
          ground.clubs.push(tenant);
          continue;
        }
        grounds.set(stadium.name ?? String(club.uid), {
          uid: club.uid,
          clubs: [tenant],
          name: stadium.name,
          capacity: stadium.capacity,
          seating: stadium.seating,
          used: stadium.used,
          expansion: stadium.expansion,
          owner: stadium.owner,
        });
      }
      // Grounds of the game's table that no club of the save plays at, as a build that places the table lists them.
      UNPLAYED_GROUNDS.forEach(([name, capacity], index) => {
        grounds.set(name, {
          uid: 0xf000_0000 + index,
          clubs: [],
          name,
          capacity,
          seating: capacity,
          used: 0,
          expansion: Math.round(capacity * 1.2),
          owner: null,
        });
      });
      const words = query.split(/\s+/).filter(Boolean);
      const rows = [...grounds.values()].filter((row) => {
        const haystack = fold(`${row.name ?? ""} ${row.clubs.map((c) => c.name).join(" ")}`);
        const named = raw.trim() === String(row.uid) || words.every((word) => haystack.includes(word));
        return (
          named &&
          (filter.women === undefined || row.clubs.some((c) => c.women === filter.women)) &&
          (filter.minCapacity === undefined || row.capacity >= filter.minCapacity) &&
          (filter.maxCapacity === undefined || row.capacity <= filter.maxCapacity)
        );
      });
      const label = (row: StadiumSummary) => row.name ?? row.clubs[0]?.name ?? "";
      rows.sort((a, b) => b.capacity - a.capacity || label(a).localeCompare(label(b)));
      rows.sort(
        byColumn<StadiumSummary>(orderOf(args), (row, by) =>
          by === "name" ? label(row) : by === "seating" ? row.seating : by === "expansion" ? row.expansion : row.capacity,
        ),
      );
      const stadiumPage: StadiumPage = { total: rows.length, rows: rows.slice(Number(args?.offset ?? 0), Number(args?.offset ?? 0) + limit) };
      return stadiumPage as T;
    }
    case "search_officials": {
      const query = fold(String(args?.query ?? ""));
      const limit = Number(args?.limit ?? 200);
      const filter = (args?.filter ?? {}) as OfficialFilter;
      const rows = OFFICIALS.filter(
        (official) => query === "" || fold(official.name).includes(query) || String(official.uid) === String(args?.query ?? "").trim(),
      )
        .filter(
          (o) =>
            (filter.minAge === undefined || (o.age !== null && o.age >= filter.minAge)) &&
            (filter.maxAge === undefined || (o.age !== null && o.age <= filter.maxAge)) &&
            (filter.minCurrentAbility === undefined || o.currentAbility >= filter.minCurrentAbility) &&
            (filter.maxCurrentAbility === undefined || o.currentAbility <= filter.maxCurrentAbility) &&
            (filter.minPotentialAbility === undefined || o.potentialAbility >= filter.minPotentialAbility) &&
            (filter.maxPotentialAbility === undefined || o.potentialAbility <= filter.maxPotentialAbility) &&
            (filter.minReputation === undefined || o.reputation >= filter.minReputation) &&
            (filter.maxReputation === undefined || o.reputation <= filter.maxReputation) &&
            contains(o.nation, filter.nation),
        )
        .sort((a, b) => b.currentAbility - a.currentAbility || a.name.localeCompare(b.name))
        .sort(
          byColumn<OfficialSummary>(orderOf(args), (o, by) => {
            switch (by) {
              case "name":
                return o.name;
              case "age":
                return o.age;
              case "nation":
                return o.nation;
              case "reputation":
                return o.reputation;
              case "potentialAbility":
                return o.potentialAbility;
              default:
                return o.currentAbility;
            }
          }),
        );
      const officialPage: OfficialPage = { total: rows.length, rows: rows.slice(Number(args?.offset ?? 0), Number(args?.offset ?? 0) + limit) };
      return officialPage as T;
    }
    case "search_competitions": {
      const query = fold(String(args?.query ?? ""));
      const limit = Number(args?.limit ?? 200);
      const filter = (args?.filter ?? {}) as CompetitionFilter;
      const rows = COMPETITIONS.filter(
        (c) => query === "" || fold(c.name).includes(query) || String(c.uid) === String(args?.query ?? "").trim(),
      )
        .filter(
          (c) =>
            (filter.women === undefined || c.women === filter.women) &&
            contains(c.nation, filter.nation) &&
            contains(c.continent, filter.continent) &&
            (filter.minReputation === undefined || c.reputation >= filter.minReputation) &&
            (filter.maxReputation === undefined || c.reputation <= filter.maxReputation),
        )
        .sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name))
        .sort(
          byColumn<CompetitionSummary>(orderOf(args), (c, by) =>
            by === "name" ? c.name : by === "nation" ? c.nation : by === "continent" ? c.continent : c.reputation,
          ),
        );
      const competitionPage: CompetitionPage = { total: rows.length, rows: rows.slice(Number(args?.offset ?? 0), Number(args?.offset ?? 0) + limit) };
      return competitionPage as T;
    }
    case "competition_rules": {
      const uid = Number(args?.uid);
      if (!COMPETITIONS.some((c) => c.uid === uid)) {
        throw failure("app.notFound", `No competition with UID ${uid}`, { uid });
      }
      return competitionRules(uid) as T;
    }
    case "search_awards": {
      const query = fold(String(args?.query ?? ""));
      const limit = Number(args?.limit ?? 200);
      const filter = (args?.filter ?? {}) as AwardFilter;
      const rows = AWARDS.filter(
        (a) =>
          query === "" ||
          fold(a.name).includes(query) ||
          fold(a.competition ?? "").includes(query) ||
          String(a.uid) === String(args?.query ?? "").trim(),
      )
        .filter(
          (a) =>
            (filter.women === undefined || a.women === filter.women) &&
            contains(a.nation, filter.nation) &&
            (filter.recipients === undefined || a.recipients === filter.recipients) &&
            (filter.minPrestige === undefined || a.prestige >= filter.minPrestige) &&
            (filter.maxPrestige === undefined || a.prestige <= filter.maxPrestige),
        )
        .sort((a, b) => b.prestige - a.prestige || a.name.localeCompare(b.name))
        .sort(
          byColumn<AwardSummary>(orderOf(args), (a, by) =>
            by === "name" ? a.name : by === "competition" ? a.competition : by === "nation" ? a.nation : a.prestige,
          ),
        );
      const awardPage: AwardPage = { total: rows.length, rows: rows.slice(Number(args?.offset ?? 0), Number(args?.offset ?? 0) + limit) };
      return awardPage as T;
    }
    case "nations_detailed":
      return true as T;
    case "nation_details": {
      const index = Number(args?.uid) - 1000;
      return (index >= 0 && index < NATIONS.length ? nationDetails(index) : null) as T;
    }
    case "search_nations": {
      const query = fold(String(args?.query ?? ""));
      const limit = Number(args?.limit ?? 200);
      const filter = (args?.filter ?? {}) as NationFilter;
      const rows: NationSummary[] = NATIONS.map((name, index) => ({
        uid: 1000 + index,
        nationUid: 1000 + index,
        name,
        continent: continentOf(name),
      }))
        .filter((nation) => query === "" || fold(nation.name).includes(query) || String(nation.uid) === String(args?.query ?? "").trim())
        .filter((nation) => contains(nation.continent, filter.continent));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      rows.sort(byColumn<NationSummary>(orderOf(args), (nation, by) => (by === "continent" ? nation.continent : nation.name)));
      const page: NationPage = { total: rows.length, rows: rows.slice(Number(args?.offset ?? 0), Number(args?.offset ?? 0) + limit) };
      return page as T;
    }
    case "read_values":
      return currentValues(args?.entity as Entity, Number(args?.uid)) as T;
    case "apply_edits":
      return applyEdits(args?.entity as Entity, Number(args?.uid), (args?.edits ?? []) as FieldEdit[]) as T;
    case "change_log":
      return changes.map((c) => ({ ...c })).reverse() as T;
    case "system_version":
      return "macOS 27.2, Apple Silicon" as T;
    case "undo_change":
      return undoChange(Number(args?.id)) as T;
    case "plan_mass_edit":
      return planMass(
        args?.entity as Entity,
        String(args?.query ?? ""),
        (args?.filters ?? {}) as MassFilters,
        (args?.operations ?? []) as MassOperation[],
        (args?.freeze ?? null) as boolean | null,
      ) as T;
    case "apply_mass_edit":
      return applyMass(Number(args?.id)) as T;
    case "undo_batch":
      return undoMassBatch(Number(args?.batch)) as T;
    case "plan_club_move":
      return planMove(Number(args?.uid), Number(args?.club), (args?.terms ?? {}) as MoveTerms, args?.fee as number) as T;
    case "move_player":
      return movePlayer(Number(args?.uid), Number(args?.club), (args?.terms ?? {}) as MoveTerms, args?.fee as number) as T;
    case "staff_jobs":
      return [...STAFF_JOBS] as T;
    case "plan_staff_move":
      return planStaffMove(Number(args?.uid), Number(args?.club)) as T;
    case "move_staff":
      return moveStaff(Number(args?.uid), Number(args?.club)) as T;
    case "refresh_game_ui":
      return undefined as T;
    case "career":
      return mockCareer() as T;
    case "plan_manager_move":
      return planManagerMove(Number(args?.uid), Number(args?.club)) as T;
    case "move_manager":
      return moveManager(Number(args?.uid), Number(args?.club)) as T;
    case "change_staff_job":
      return changeStaffJob(Number(args?.uid), Number(args?.job)) as T;
    case "plan_club_swap":
      return planSwap(Number(args?.uid), Number(args?.other)) as T;
    case "plan_release":
      return planRelease(Number(args?.uid)) as T;
    case "release_player":
      return releasePlayer(Number(args?.uid)) as T;
    case "heal_player":
      return healPlayer(Number(args?.uid)) as T;
    case "injury_kinds":
      return INJURY_KINDS.map((k) => ({ ...k })) as T;
    case "add_injury":
      return addInjury(Number(args?.uid), Number(args?.kind)) as T;
    case "set_work_permit":
      return setWorkPermit(Number(args?.uid), Boolean(args?.granted)) as T;
    case "work_permit_needed":
      return workPermitNeeded(Number(args?.uid)) as T;
    case "start_loan":
      return startLoan(Number(args?.uid), Number(args?.club), Number(args?.ends)) as T;
    case "plan_end_loan":
      return planEndLoan(Number(args?.uid)) as T;
    case "end_loan":
      return endLoan(Number(args?.uid)) as T;
    case "sign_free_agent":
      return signFreeAgent(Number(args?.uid), Number(args?.club), (args?.terms ?? {}) as MoveTerms) as T;
    case "plan_cancel_future_transfers":
      return planCancelFutureTransfers(Number(args?.uid)) as T;
    case "cancel_future_transfers":
      return cancelFutureTransfers(Number(args?.uid)) as T;
    case "sign_free_agent_later":
      return signFreeAgentLater(Number(args?.uid), Number(args?.club), Number(args?.joins)) as T;
    case "lift_bans":
      return liftBans(Number(args?.uid)) as T;
    case "remove_unhappiness":
      return removeUnhappiness(Number(args?.uid)) as T;
    case "close_promise":
      return closePromise(Number(args?.uid), Number(args?.index), args?.promise as PlayerPromise | undefined) as T;
    case "change_clause":
      return changeClause(
        Number(args?.uid),
        Number(args?.index),
        args?.amount as number | undefined,
        args?.condition as number | undefined,
      ) as T;
    case "remove_clause":
      return removeClause(Number(args?.uid), Number(args?.index)) as T;
    case "add_release_clause":
      return addReleaseClause(Number(args?.uid), Number(args?.amount)) as T;
    case "keep_playing":
      return keepPlaying(Number(args?.uid)) as T;
    case "change_tie":
      return changeTie(
        Number(args?.uid),
        Number(args?.index),
        args?.nation as number | undefined,
        args?.rule as number | undefined,
      ) as T;
    case "remove_tie":
      return removeTie(Number(args?.uid), Number(args?.index)) as T;
    case "change_preference":
      return changePreference(Number(args?.uid), Boolean(args?.staff), Number(args?.index), Number(args?.strength)) as T;
    case "remove_preference":
      return removePreference(Number(args?.uid), Boolean(args?.staff), Number(args?.index)) as T;
    case "point_preference":
      return pointPreference(
        Number(args?.uid),
        Boolean(args?.staff),
        Number(args?.index),
        String(args?.targetKind),
        Number(args?.targetUid),
      ) as T;
    case "change_language":
      return changeLanguage(Number(args?.uid), Boolean(args?.staff), Number(args?.index), Number(args?.level)) as T;
    case "remove_language":
      return removeLanguage(Number(args?.uid), Boolean(args?.staff), Number(args?.index)) as T;
    case "change_injury":
      return changeInjury(Number(args?.uid), Number(args?.index), Number(args?.days)) as T;
    case "remove_injury":
      return removeInjury(Number(args?.uid), Number(args?.index)) as T;
    case "add_tie":
      return addTie(Number(args?.uid), args?.tie as TieKind, Number(args?.target), args?.rule as number | undefined) as T;
    case "homegrown_rules":
      return [...HOMEGROWN_RULES] as T;
    case "club_squads":
      return clubSquads(Number(args?.uid)) as T;
    case "club_staff":
      return staff.filter((s) => s.clubUid === Number(args?.uid)) as T;
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

/** The continent of a fixture nation. */
const continentOf = (nation: string) => (nation === "Brazil" ? "South America" : "Europe");

/** Made-up competitions: a league and a cup in each fixture nation, a women's league in some, and two others. */
const COMPETITIONS: CompetitionSummary[] = [
  ...NATIONS.flatMap((nation, i): CompetitionSummary[] => {
    const place = { nation, nationUid: 1000 + i, continent: continentOf(nation) };
    const league = { ...place, uid: 100 + i * 10, name: `${nation} First Division`, shortName: `${nation} 1` };
    const cup = { ...place, uid: 101 + i * 10, name: `${nation} Cup`, shortName: null };
    const women = { ...place, uid: 102 + i * 10, name: `${nation} Women's League`, shortName: null };
    return [
      { ...league, reputation: 170 - i * 9, women: false },
      { ...cup, reputation: 120 - i * 6, women: false },
      ...(i % 2 === 0 ? [{ ...women, reputation: 90 - i * 4, women: true }] : []),
    ];
  }),
  {
    uid: 1301394,
    name: "Continental Champions Cup",
    shortName: "Champions Cup",
    nation: null,
    nationUid: null,
    continent: "Europe",
    reputation: 200,
    women: false,
  },
  { uid: 1301385, name: "World Cup", shortName: null, nation: null, nationUid: null, continent: null, reputation: 200, women: false },
];

/** Made-up rules: a league's squad, foreign and stadium rules; a cup's substitutes; none for the rest. */
function competitionRules(uid: number): CompetitionRule[] {
  if (uid >= 1_000_000) {
    return [];
  }
  const league = uid % 10 === 0;
  return league
    ? [
        { key: "level", value: 0 },
        { key: "max_squad_size", value: 25 },
        { key: "max_foreign_players", value: 4 + (uid % 7) },
        { key: "subs_allowed", value: 5 },
        { key: "max_subs", value: 9 },
        { key: "extended_injury_time", value: true },
        { key: "min_games_for_medal", value: 5 },
        { key: "min_stadium_capacity", value: 5000 },
        { key: "requires_grass_pitch", value: true },
        { key: "requires_undersoil_heating", value: uid % 20 === 0 },
      ]
    : [
        { key: "subs_allowed", value: 5 },
        { key: "max_subs", value: 9 },
        { key: "extended_injury_time", value: false },
      ];
}

/** Made-up awards: for each league a player and young player of the year, a golden glove and more; and a world award. */
const AWARDS: AwardSummary[] = [
  ...COMPETITIONS.filter((c) => c.name.endsWith("First Division")).flatMap((c, i): AwardSummary[] => {
    const base = {
      competition: c.name,
      competitionUid: c.uid,
      nation: c.nation,
      nationUid: c.nationUid,
      continent: c.continent,
      women: false,
      goalkeepersOnly: false,
      maxAge: null,
    };
    const name = (award: string) => `${c.name} ${award}`;
    return [
      { ...base, uid: 20_000 + i * 10, name: name("Player of the Year"), prestige: 17 - (i % 6), period: 3, recipients: 1 },
      { ...base, uid: 20_001 + i * 10, name: name("Manager of the Month"), prestige: 12 - (i % 6), period: 2, recipients: 2 },
      { ...base, uid: 20_002 + i * 10, name: name("Young Player of the Year"), prestige: 14 - (i % 6), period: 3, recipients: 1, maxAge: 22 },
      { ...base, uid: 20_003 + i * 10, name: name("Golden Glove"), prestige: 13 - (i % 6), period: 3, recipients: 1, goalkeepersOnly: true },
      { ...base, uid: 20_004 + i * 10, name: name("Team of the Week"), prestige: 6, period: 1, recipients: 7 },
    ];
  }),
  {
    uid: 102406,
    name: "World Golden Ball",
    competition: null,
    competitionUid: null,
    nation: null,
    nationUid: null,
    continent: null,
    prestige: 20,
    period: 6,
    recipients: 1,
    women: false,
    goalkeepersOnly: false,
    maxAge: null,
  },
  {
    uid: 2000506221,
    name: "World Golden Ball",
    competition: null,
    competitionUid: null,
    nation: null,
    nationUid: null,
    continent: null,
    prestige: 20,
    period: 6,
    recipients: 1,
    women: true,
    goalkeepersOnly: false,
    maxAge: null,
  },
];

/** Made-up match officials: a few established referees and some young ones still rising. */
const OFFICIALS: OfficialSummary[] = Array.from({ length: 40 }, (_, i): OfficialSummary => {
  const first = ["Mark", "Tomás", "Jan", "Emre", "Lukas", "Pierre", "Rui", "Piotr"][i % 8];
  const last = ["Hale", "Ortega", "Novák", "Demir", "Brandt", "Morel", "Costa", "Wójcik"][(i * 3) % 8];
  const nation = NATIONS[i % NATIONS.length];
  const year = 1975 + ((i * 7) % 25);
  const currentAbility = 190 - ((i * 13) % 110);
  return {
    uid: 5_000 + i * 37,
    name: `${first} ${last}`,
    nation,
    nationUid: 1000 + NATIONS.indexOf(nation),
    dateOfBirth: { year, month: 1 + (i % 12), day: 1 + ((i * 5) % 28) },
    age: 2026 - year,
    currentAbility,
    potentialAbility: Math.min(200, currentAbility + (year > 1992 ? 25 : 0)),
    reputation: 9_500 - i * 211,
  };
});

/** The fixture official with `uid`, as the officials list has him. */
function officialOf(uid: number): OfficialSummary {
  const official = OFFICIALS.find((o) => o.uid === uid);
  if (!official) {
    throw notFound("official", uid);
  }
  return official;
}

/** A nation's profile: made-up figures in the shape the game gives; the last nation in the list has none. */
function nationDetails(index: number): NationDetails | null {
  if (index === NATIONS.length - 1) {
    return null;
  }
  const name = NATIONS[index];
  const members = players.filter((p) => p.nation === name);
  const person = (p: PlayerSummary | undefined): NamedPerson | null => (p ? { uid: p.uid, name: p.name } : null);
  const team = (ageLimit: number | null, kind: number, reputation: number, from: PlayerSummary[]): NationalTeam => ({
    kind,
    ageLimit,
    reputation,
    manager: { uid: 90_000 + kind, name: `${name} coach ${kind}` },
    captain: person(from[0]),
    viceCaptain: person(from[1]),
    squad: from.slice(0, 23).map((p) => ({ uid: p.uid, name: p.name })),
  });
  const older = members.filter((p) => (p.age ?? 30) > 21);
  const younger = members.filter((p) => (p.age ?? 30) <= 21);
  return withWrittenNation(1000 + index, {
    code: name.slice(0, 3).toUpperCase(),
    continent: name === "Brazil" ? "South America" : "Europe",
    capital: null,
    population: 10_000_000 + index * 7_654_321,
    dualNationality: index % 4 !== 3,
    naturalisationYears: index % 5 === 4 ? null : 2 + (index % 4) * 3,
    naturalisationNever: index % 5 === 4,
    languages: [{ name: `${name} language`, percent: 100 - index }],
    ranking: index === 2 ? null : 3 + index * 4,
    points: index === 2 ? null : 1900 - index * 41.37,
    founded: 1880 + index * 7,
    joinedFifa: 1904 + index * 5,
    joinedContinental: 1950 + index * 3,
    youthRating: 140 - index * 9,
    gameImportance: index % 3,
    attendance: 15 - index,
    style: nationStyle(index),
    rivals: NATIONS.filter((_, i) => i !== index)
      .slice(0, 3)
      .map((rival, i) => ({ uid: 1000 + NATIONS.indexOf(rival), name: rival, strength: 100 - i * 15 })),
    teams: [team(null, 0, 8_500 - index * 300, older), team(21, 266, 6_000 - index * 200, younger)],
    women: {
      ranking: index + 2,
      points: 2105.4 - index * 31.7,
      joinedFifa: 1970 + index * 4,
      joinedContinental: 1972 + index * 4,
      youthRating: 155 - index * 11,
      gameImportance: 4,
      attendance: 10 - (index % 4),
      style: nationStyle(index + 5),
      teams: [team(null, 0, 9_000 - index * 450, []), team(20, 274, 4_000 - index * 150, [])],
    },
  });
}

/** The keys of a nation's style ratings, as the real build names them. */
const NATION_STYLE = [
  "depth",
  "directness",
  "flamboyancy",
  "flexibility",
  "free_roles",
  "marking",
  "offside",
  "pressing",
  "sitting_back",
  "tempo",
  "playmaker",
  "width",
];

/** Made-up style ratings around FM's usual 10. */
function nationStyle(seed: number): Record<string, number> {
  return Object.fromEntries(NATION_STYLE.map((key, i) => [key, 10 + (((seed + i) * 7) % 9) - 4]));
}

/** The name of the nation with the made-up UID `uid`, or the real commands' failure. */
function nationName(uid: number): string {
  const name = NATIONS[uid - 1000];
  if (name === undefined) {
    throw notFound("nation", uid);
  }
  return name;
}

/** A generated nation profile with the values written through the editor on top. */
function withWrittenNation(uid: number, d: NationDetails): NationDetails {
  const values = written.get(`nation:${uid}`) ?? {};
  const senior = d.teams.find((team) => team.kind === 0);
  if (values.reputation !== undefined && senior) {
    senior.reputation = values.reputation;
  }
  if (values.youth_rating !== undefined) {
    d.youthRating = values.youth_rating;
  }
  if (values.game_importance !== undefined) {
    d.gameImportance = values.game_importance;
  }
  if (values.attendance !== undefined) {
    d.attendance = values.attendance;
  }
  const women = d.women;
  const womenSenior = women?.teams.find((team) => team.kind === 0);
  if (values["women.reputation"] !== undefined && womenSenior) {
    womenSenior.reputation = values["women.reputation"];
  }
  if (values["women.youth_rating"] !== undefined && women) {
    women.youthRating = values["women.youth_rating"];
  }
  if (values["women.game_importance"] !== undefined && women) {
    women.gameImportance = values["women.game_importance"];
  }
  if (values["women.attendance"] !== undefined && women) {
    women.attendance = values["women.attendance"];
  }
  for (const [prefix, side] of [
    ["", d],
    ["women.", women],
  ] as const) {
    const style = side?.style;
    for (const key of NATION_STYLE) {
      const value = values[`${prefix}style.${key}`];
      if (value !== undefined && style) {
        style[key] = value;
      }
    }
  }
  if (values.points !== undefined) {
    d.points = floatOfBits(values.points);
  }
  if (values["women.points"] !== undefined && women) {
    women.points = floatOfBits(values["women.points"]);
  }
  if (values.population !== undefined) {
    d.population = values.population;
  }
  if (values.dual_nationality !== undefined) {
    d.dualNationality = values.dual_nationality === 0;
  }
  if (values.naturalisation !== undefined) {
    d.naturalisationNever = values.naturalisation === 255;
    d.naturalisationYears = d.naturalisationNever ? null : values.naturalisation;
  }
  return d;
}

const floatView = new DataView(new ArrayBuffer(4));

/** The bits of `value` as a 32-bit float, as an "f32" field stores it. */
function floatBits(value: number): number {
  floatView.setFloat32(0, value);
  return floatView.getUint32(0);
}

/** The float whose bits are `bits`. */
function floatOfBits(bits: number): number {
  floatView.setUint32(0, bits);
  return floatView.getFloat32(0);
}

/** `read_values` of a nation: its senior team's reputation and its rules, as stored; none without a profile. */
function nationValues(uid: number): FieldValues {
  nationName(uid);
  const d = nationDetails(uid - 1000);
  if (d === null) {
    return {};
  }
  const values: FieldValues = { naturalisation: d.naturalisationNever ? 255 : (d.naturalisationYears ?? 0) };
  const senior = d.teams.find((team) => team.kind === 0);
  if (senior) {
    values.reputation = senior.reputation;
  }
  if (d.youthRating !== null) {
    values.youth_rating = d.youthRating;
  }
  if (d.gameImportance !== null) {
    values.game_importance = d.gameImportance;
  }
  if (d.attendance !== null) {
    values.attendance = d.attendance;
  }
  const womenSenior = d.women?.teams.find((team) => team.kind === 0);
  if (womenSenior) {
    values["women.reputation"] = womenSenior.reputation;
  }
  if (d.women && d.women.youthRating !== null) {
    values["women.youth_rating"] = d.women.youthRating;
  }
  if (d.women && d.women.gameImportance !== null) {
    values["women.game_importance"] = d.women.gameImportance;
  }
  if (d.women && d.women.attendance !== null) {
    values["women.attendance"] = d.women.attendance;
  }
  for (const [prefix, style] of [
    ["", d.style],
    ["women.", d.women?.style ?? null],
  ] as const) {
    for (const [key, value] of Object.entries(style ?? {})) {
      values[`${prefix}style.${key}`] = value;
    }
  }
  // FM keeps the points of an unranked nation too; the profile shows none.
  values.points = floatBits(d.points ?? 0);
  if (d.women) {
    values["women.points"] = floatBits(d.women.points ?? 0);
  }
  if (d.population !== null) {
    values.population = d.population;
  }
  if (d.dualNationality !== null) {
    values.dual_nationality = d.dualNationality ? 0 : 2;
  }
  return values;
}
