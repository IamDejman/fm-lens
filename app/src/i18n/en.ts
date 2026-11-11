import { knownFormationName } from "../formationNames";
// The English text of the UI, and the shape every language has: `tr.ts` and `es.ts` are typed `Strings`, which is
// `typeof en`, so a key that one dictionary has and another lacks fails the build. A new language is a new file like
// them, which `index.ts` then offers and `SettingsMenu.tsx` gives a flag.
//
// Keys of the game data map to the names FM uses; every other string of the panels is in `profile` (those only the
// club panel has, in `clubProfile`), and those of the player, staff and club lists in `playerList`, `staffList` and
// `clubList` (the saved player filters are in `playerList.filters.saved`). Editing has `edit` (and `fields` for the
// names of the fields), the Changes view `changes`, mass editing `massEdit`, comparing players `comparison`, moving a
// player to another club or swapping him with one `move`, a club's squad `squad`, the sidebar and the connect panel
// `app`. The components read them through `labels.ts`.
//
// The text functions (counts, summaries, "was …") are written per language: plurals and word order differ, so a
// language builds its sentences itself.

import type {
  CheckKey,
  Entity,
  ExportFormat,
  MassEntity,
  MassOperationKind,
  MassPreview,
  PlayerSort,
  SquadSort,
  Storefront,
} from "../types";
import { fieldName } from "./fieldNames";
import type { CardFormat } from "../shareCard";
import { PERCENT_CLAUSES, RELEASE_CLAUSES } from "../clauseKinds";

const numbers = new Intl.NumberFormat("en-GB");
const percents = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

/** A count or an amount with the thousands separators of the language: "12,345". */
const format = (value: number) => numbers.format(value);

/** "No changes", "1 change", "3 changes", "12,345 changes". */
const changeCount = (count: number) =>
  count === 0 ? "No changes" : count === 1 ? "1 change" : `${format(count)} changes`;

/** "1 value left alone", "12 values left alone". */
const valuesLeftAlone = (count: number) =>
  count === 1 ? "1 value left alone" : `${format(count)} values left alone`;

/** "237 players", "1 player", "237 staff", "1 member of staff", "12 clubs", "1 club". */
const entityCount: Record<MassEntity, (count: number) => string> = {
  player: (count) => (count === 1 ? "1 player" : `${format(count)} players`),
  staff: (count) => (count === 1 ? "1 member of staff" : `${format(count)} staff`),
  club: (count) => (count === 1 ? "1 club" : `${format(count)} clubs`),
};

/** What each list holds, in the plural. */
const entityNouns: Record<MassEntity, string> = { player: "players", staff: "staff", club: "clubs" };

const SQUAD_STATUSES: Partial<Record<number, string>> = {
  1: "Star player",
  2: "Important player",
  3: "Regular starter",
  4: "Squad player",
  5: "Impact sub",
  7: "Fringe player",
  9: "Emergency backup",
  10: "Breakthrough prospect",
  11: "Future prospect",
  13: "Youngster",
  15: "First-choice goalkeeper",
  16: "Cup goalkeeper",
  17: "Domestic cup goalkeeper",
  20: "Backup",
  21: "Emergency backup",
  22: "Surplus to requirements",
};

/**
 * Sentences for the failures of the Rust commands, by code (see `describeError` in format.ts). Each gets the values
 * the failure names, its amounts and dates already written out; fields come as keys, which `fieldName` names. A code
 * a dictionary leaves out shows the English message the command sent.
 */
export type ErrorTexts = Partial<Record<string, (params: Readonly<Record<string, string>>) => string>>;

/** The name of the field a failure names. */
const field = (key: string | undefined) => fieldName(en, key ?? "");

/** What a check is about, from the key a failure gives, with a capital: "Contracts". */
const checkName = (key: string | undefined) => {
  const name = (en.checks as Partial<Record<string, string>>)[key ?? ""] ?? key ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** The commands' own English is kept where it names no field. */
const errors: ErrorTexts = {
  "edit.unknownField": (p) => `“${p.field}” can't be edited here.`,
  "edit.outOfRange": (p) => `${field(p.field)} must be from ${p.min} to ${p.max}. You entered ${p.value}.`,
  "edit.notADate": (p) => `${field(p.field)}: ${p.value} isn't a valid date.`,
  "edit.notAChoice": (p) => `${field(p.field)} can't be ${p.value}.`,
  "edit.taken": (p) => `${p.name ?? "Another player"} already wears number ${p.value}.`,
  "edit.unsupported": (p) => `Can't change ${field(p.field)} that way: ${p.reason}.`,
  "edit.noRecord": (p) => `Can't change ${field(p.field)}: FM's record for it is missing or looks wrong.`,
  "edit.unset": (p) => `${field(p.field)} isn't set in FM, so it wasn't changed.`,
  "edit.implausible": (p) => `${field(p.field)} reads ${p.value}, which can't be right, so it wasn't changed.`,
  "edit.notApplied": (p) => `${field(p.field)} didn't stick: FM Lens wrote ${p.wrote}, FM has ${p.read}.`,
  "edit.conflict": (p) => `FM has since changed ${field(p.field)} to ${p.found}, so it was left alone.`,
  "move.outOfRange": (p) => `${field(p.field)} must be from ${p.min} to ${p.max}. You entered ${p.value}.`,
  "move.humanClub": () => "He plays for your club. Transfer him in FM.",
  "move.you": () => "That's you. Change clubs in FM.",
  "export.failed": (p) => `Couldn't save the file: ${p.reason}`,
  "export.notAllowed": (p) =>
    `FM Lens can't save to ${p.folder}. Allow it in System Settings › Privacy & Security › Files & Folders, ` +
    "then export again.",
  "export.blocked": (p) =>
    `FM Lens can't save to ${p.folder}. If Windows Security blocks it, allow FM Lens under Ransomware protection › ` +
    "Allow an app through Controlled folder access, then export again.",
  "export.openFailed": (p) => `Couldn't open it: ${p.reason}`,
  "session.noSuchProcess": () => "FM closed or restarted. Load a save and connect again.",
  // FM's main menu: no career to read yet.
  "session.noCareer": () => "No save is loaded in FM. Load one, then connect.",
  "session.playersNotFound": () => "No save is loaded in FM. Load one, then connect.",
  "attributes.level": () => "Choose a value from 1 to 20.",
  "call.unavailable": () => "FM can't make this change on this version.",
  "call.declined": () => "FM didn't make the change.",
  "loan.futureFee": () =>
    "This loan has a future fee. Ending it early would make FM complete the transfer.",
  "loan.joinedOther": (p) => `FM ended the loan, but he joined ${p.club} instead of going back.`,
  "injury.already": () => "He's injured already. Heal him first.",
  "injury.noKind": () => "FM has no such injury.",
  "cohesion.none": () => "FM hasn't set his familiarity with this club yet.",
  "cohesion.changed": (p) => `FM has since changed his familiarity with the club to ${p.found}, so it was left alone.`,
  "tactics.changed": () => "FM has since changed his familiarity with the tactic, so it was left alone.",
  "list.missing": () => "That entry is no longer in the list. Press Reload and try again.",
  "preference.target": () => "Pick a club in place of a club, and another person in place of a person.",
  "preference.same": () => "That one is in the list already.",
  "guard.unknownBuild": () =>
    "FM Lens hasn't been tested with this FM version yet, so editing is off.",
  "guard.careerChanged": () => "FM has moved its data since FM Lens read it. Press Reload, then try again.",
  "guard.failed": (p) =>
    `${checkName(p.check)} look wrong in this FM version, so FM Lens won't change them.`,
  "move.changed": () => "FM has changed this since. Press Reload and try again.",
  "move.notApplied": () => "FM Lens wrote the change, but FM holds something else.",
  "memory.read": (p) => `Couldn't read FM's memory (system error ${p.code}).`,
  "memory.write": (p) => `Couldn't write to FM's memory (system error ${p.code}).`,
  "memory.notWritable": () => "That isn't part of FM's writable memory, so nothing was written.",
  "memory.noBridge": () =>
    "FM was started without the FM Lens helper. Quit FM and start it again from Steam.",
  "setup.steamRunning": () =>
    "The helper is installed, but Steam is open, so the launch option wasn't set. Quit Steam and press Set up " +
    "again, or add the launch option yourself.",
};

/**
 * The kinds of contract clauses and bonuses, by the codes contracts hold them as; named as FMRTE names them, and the
 * rest after the game's own list of kinds. 8, 13, 41 and 55 are named as FM's contract screen names them; FM does not
 * show 63 there.
 */
const CLAUSE_NAMES_EN: Partial<Record<number, string>> = {
  0: "Minimum fee release clause",
  1: "Relegation release clause",
  2: "Non-promotion release clause",
  3: "Yearly wage rise",
  4: "Promotion wage rise",
  5: "Relegation wage drop",
  6: "Non-playing job release clause",
  7: "Release at any time",
  8: "Sell-on fee percentage",
  9: "Sell-on fee from profit",
  10: "Seasonal landmark goal bonus",
  11: "One-year extension after league games",
  12: "Match highest earner",
  13: "Wage after reaching club league games",
  14: "Top division promotion wage rise",
  15: "Top division relegation wage drop",
  16: "Minimum fee release clause (foreign clubs)",
  17: "Minimum fee release clause (clubs in a higher division)",
  18: "Minimum fee release clause (domestic clubs)",
  19: "Wage after reaching international matches",
  20: "Wages paid by sponsor",
  21: "Share of gate receipts",
  22: "Optional contract extension by club",
  23: "No compensation if offered a manager's job",
  24: "Compensation needed to leave",
  25: "One-year extension if promoted",
  26: "One-year extension if relegation is avoided",
  27: "Minimum fee release clause (clubs in the Champions Cup)",
  28: "Guaranteed contract",
  29: "Automatic extension if promoted",
  30: "Injury release clause",
  31: "Minimum fee release clause (clubs in continental competitions)",
  32: "Appearance fee",
  33: "Goal bonus",
  34: "Clean sheet bonus",
  37: "International cap bonus",
  38: "Unused substitute fee",
  39: "Assist bonus",
  40: "Seasonal landmark assist bonus",
  41: "Seasonal landmark combined goal and assist bonus",
  55: "Active relegation release clause",
};

/** Promises by FM's number for them, named as FM's screens word them. */
const PROMISE_NAMES_EN: Partial<Record<number, string>> = {
  1: "Playing time",
  208: "Preferred position and role",
};

/** Reasons to be unhappy, by the codes the game keeps them as; named as FMRTE names them or FM's screens word them. */
const CONCERN_MOTIVES_EN: Partial<Record<number, string>> = {
  570: "Worried about the poor dressing room atmosphere",
  596: "Left out of a competition squad",
  652: "Wants to start more games",
  808: "Thinks a teammate has been treated unfairly",
  811: "Thinks a teammate is right that the poor dressing room atmosphere needs to be addressed",
  926: "Doesn't believe a teammate deserves the playing time he wants",
};

/** Players' traits (preferred moves), by their bit in the game's mask; named as FMRTE names them. */
const TRAIT_NAMES_EN: readonly string[] = [
  "Runs with ball down left",
  "Runs with ball down right",
  "Runs with ball through centre",
  "Gets into opposition area",
  "Moves into channels",
  "Gets forward whenever possible",
  "Plays short simple passes",
  "Tries killer balls often",
  "Shoots from distance",
  "Shoots with power",
  "Places shots",
  "Curls ball",
  "Likes to round keeper",
  "Likes to try to beat offside trap",
  "Uses outside of foot",
  "Marks opponent tightly",
  "Winds up opponents",
  "Argues with officials",
  "Plays with back to goal",
  "Comes deep to get ball",
  "Plays one-twos",
  "Likes to lob keeper",
  "Dictates tempo",
  "Attempts overhead kicks",
  "Looks for pass rather than attempting to score",
  "Plays no through balls",
  "Stops play",
  "Knocks ball past opponent",
  "Moves ball to right foot before dribble attempt",
  "Moves ball to left foot before dribble attempt",
  "Dwells on ball",
  "Arrives late in opponents' area",
  "Tries to play way out of trouble",
  "Stays back at all times",
  "Avoids using weaker foot",
  "Tries tricks",
  "Tries long range free kicks",
  "Dives into tackles",
  "Does not dive into tackles",
  "Cuts inside",
  "Hugs line",
  "Gets crowd going",
  "Tries first time shots",
  "Tries long range passes",
  "Likes ball played into feet",
  "Hits free kicks with power",
  "Likes to beat man repeatedly",
  "Likes to switch ball to other flank",
  "Will retire at top",
  "Will play football as long as possible",
  "Possesses long flat throw",
  "Runs with ball often",
  "Runs with ball rarely",
  "Attempts to develop weaker foot",
  "Static target man",
  "Uses long throw to start counter attacks",
  "Refrains from taking long shots",
  "Cuts inside from left wing",
  "Cuts inside from right wing",
  "Crosses early",
  "Brings ball out of defence",
  "Plays ball with feet"
];

export const en = {
  attributes: {
    // Technical
    corners: "Corners",
    crossing: "Crossing",
    dribbling: "Dribbling",
    finishing: "Finishing",
    first_touch: "First Touch",
    free_kicks: "Free Kick Taking",
    heading: "Heading",
    long_shots: "Long Shots",
    long_throws: "Long Throws",
    marking: "Marking",
    passing: "Passing",
    penalty_taking: "Penalty Taking",
    tackling: "Tackling",
    technique: "Technique",
    // Mental
    aggression: "Aggression",
    anticipation: "Anticipation",
    bravery: "Bravery",
    composure: "Composure",
    concentration: "Concentration",
    decisions: "Decisions",
    determination: "Determination",
    flair: "Flair",
    leadership: "Leadership",
    off_the_ball: "Off the Ball",
    positioning: "Positioning",
    teamwork: "Teamwork",
    vision: "Vision",
    work_rate: "Work Rate",
    // Physical
    acceleration: "Acceleration",
    agility: "Agility",
    balance: "Balance",
    jumping_reach: "Jumping Reach",
    natural_fitness: "Natural Fitness",
    pace: "Pace",
    stamina: "Stamina",
    strength: "Strength",
    // Goalkeeping (first touch and passing are shared with Technical)
    aerial_reach: "Aerial Reach",
    command_of_area: "Command of Area",
    communication: "Communication",
    eccentricity: "Eccentricity",
    handling: "Handling",
    kicking: "Kicking",
    one_on_ones: "One on Ones",
    punching: "Punching (Tendency)",
    reflexes: "Reflexes",
    rushing_out: "Rushing Out (Tendency)",
    throwing: "Throwing",
    // Hidden
    consistency: "Consistency",
    dirtiness: "Dirtiness",
    important_matches: "Important Matches",
    injury_proneness: "Injury Proneness",
    versatility: "Versatility",
    // Feet
    left_foot: "Left Foot",
    right_foot: "Right Foot",
  },

  staffAttributes: {
    // Coaching
    attacking: "Attacking",
    defending: "Defending",
    fitness: "Fitness",
    goalkeeping: "Goalkeeping",
    possession: "Possession",
    set_pieces: "Set Pieces",
    tactical: "Tactical",
    technical: "Technical",
    working_with_youngsters: "Working with Youngsters",
    // Mental
    authority: "Authority",
    determination: "Determination",
    motivating: "Motivating",
    people_management: "People Management",
    // Knowledge
    data_analysis: "Data Analysis",
    judging_ability: "Judging Player Ability",
    judging_potential: "Judging Player Potential",
    judging_staff: "Judging Staff Ability",
    negotiating: "Negotiating",
    tactical_knowledge: "Tactical Knowledge",
    // Medical
    physiotherapy: "Physiotherapy",
    sports_science: "Sports Science",
  },

  personality: {
    adaptability: "Adaptability",
    ambition: "Ambition",
    loyalty: "Loyalty",
    pressure: "Pressure",
    professionalism: "Professionalism",
    sportsmanship: "Sportsmanship",
    temperament: "Temperament",
    controversy: "Controversy",
  },

  /** The abbreviations of the positions: the same in every language. */
  positions: {
    gk: "GK",
    sw: "SW",
    dl: "DL",
    dc: "DC",
    dr: "DR",
    dm: "DM",
    ml: "ML",
    mc: "MC",
    mr: "MR",
    aml: "AML",
    amc: "AMC",
    amr: "AMR",
    st: "ST",
    wbl: "WBL",
    wbr: "WBR",
  },

  clubFacilities: {
    training: "Training",
    youth_facilities: "Youth Facilities",
    youth_coaching: "Youth Coaching",
    youth_recruitment: "Youth Recruitment",
    /** Only a club with finances has it. */
    corporate: "Corporate",
  },

  /** A nation's style ratings, 0 to 20, in the order the profile lists them. */
  nationStyle: {
    depth: "Depth",
    directness: "Directness",
    flamboyancy: "Flamboyancy",
    flexibility: "Flexibility",
    free_roles: "Free Roles",
    marking: "Marking",
    offside: "Offside",
    pressing: "Pressing",
    sitting_back: "Sitting Back",
    tempo: "Tempo",
    playmaker: "Use of Playmaker",
    width: "Width",
  },

  supporterTraits: {
    loyalty: "Loyalty",
    passion: "Passion",
    patience: "Patience",
    affluence: "Affluence",
    temperament: "Temperament",
    expectations: "Expectations",
  },

  /** The kinds of supporters, in the order of the supporter-mix bar. */
  supporterMix: {
    hardcore: "Hardcore",
    core: "Core",
    family: "Family",
    fair_weather: "Fair-weather",
    casual: "Casual",
    other: "Other",
  },

  /** FM's job codes as stored in contracts. */
  jobs: {
    1: "Player",
    2: "Coach",
    4: "Chairperson",
    6: "Director",
    8: "Managing Director",
    10: "Director of Football",
    12: "Physio",
    14: "Scout",
    16: "Manager",
    20: "Assistant Manager",
    22: "Set Piece Coach",
    24: "General Manager",
    26: "Fitness Coach",
    34: "Goalkeeping Coach",
    38: "Chief Doctor",
    40: "Head of Sports Science",
    44: "Chief Scout",
    46: "Doctor",
    48: "Sports Scientist",
    50: "Head Physio",
    58: "Recruitment Analyst",
    60: "Performance Analyst",
    62: "Head Performance Analyst",
    64: "Head of Youth Development",
    66: "Owner",
    70: "President",
    86: "Loan Manager",
    88: "Technical Director",
  },

  /** The names of the fields that are not attributes, personality or positions, by key. */
  fields: {
    current_ability: "Current ability",
    potential_ability: "Potential ability",
    height: "Height (cm)",
    date_of_birth: "Date of birth",
    asking_price: "Asking price",
    nation: "Nationality",
    "reputation.home": "Home reputation",
    "reputation.current": "Current reputation",
    "reputation.world": "World reputation",
    "international.caps": "Caps",
    "international.goals": "International goals",
    "international.u21_caps": "U21 caps",
    "international.u21_goals": "U21 goals",
    // What the game changes every day.
    condition: "Energy",
    match_sharpness: "Match sharpness",
    jadedness: "Jadedness",
    morale: "Morale",
    "contract.wage": "Wage per week",
    "contract.loyalty_bonus": "Loyalty bonus per week",
    "contract.happiness": "Happiness",
    "contract.playing_time_happiness": "Playing time happiness",
    "contract.unhappiness": "Reasons to be unhappy",
    "contract.expires": "Contract end",
    "loan.wage": "Loan wage paid by borrower",
    "loan.ends": "Loan end",
    "transfer.joins": "Joins",
    future_transfer: "Future transfer",
    // A loan the game started, which the change log keeps as a change of the player's club for the loan.
    loan: "Loan",
    "contract.squad_number": "Squad number",
    "contract.squad_status": "Squad status",
    "contract.transfer_listed": "Transfer listed",
    "contract.loan_listed": "Loan listed",
    // A member of staff's job, which the change log keeps as a change of its code.
    "contract.job": "Job",
    coaching_licence: "Coaching licence",
    "formation.in_possession": "In possession",
    "formation.out_of_possession": "Out of possession",
    "manager.unsackable": "Unsackable",
    "manager.registration_anytime": "Register squad any time",
    // A player's ties, which the change log keeps as changes of the nation or club (see `ties`).
    "tie.nationality": "Secondary nationality",
    "tie.trainedInNation": "Trained in nation",
    "tie.trainedAtClub": "Trained at club",
    // A person's likes and dislikes, which the change log keeps as changes of their strength (see `lists`).
    "preference.favouredClub": "Favoured club",
    "preference.dislikedClub": "Disliked club",
    "preference.favouredPerson": "Favoured person",
    "preference.dislikedPerson": "Disliked person",
    strength: "Strength",
    // A person's languages, which the change log keeps as changes of their level (see `lists`).
    language: "Language",
    level: "Level",
    // A move to another club, which the change log keeps as a change of the player's club.
    club: "Club",
    // Healing a player, which the change log keeps as a change of his injuries.
    injuries: "Injuries",
    // One injury made longer or shorter, or taken out, which the change log keeps as a change of its days.
    injury: "Injury",
    // A work permit FM gave or took away, which the change log keeps as 0 (none) or 1 (held).
    work_permit: "Work permit",
    // Lifting a player's bans, which the change log keeps as a change of his bans.
    bans: "Bans",
    // Closing a promise, which the change log keeps as a change of the player's promise.
    promise: "Promise",
    // Max cohesion, which the change log keeps as a change of the player's familiarity with his club (0 to 100).
    cohesion: "Club familiarity",
    // Max tactics, which the change log keeps as a change of the player's familiarity with the team's tactic (0 to 100).
    tactics: "Tactical familiarity",
    // Keeping a player from retiring, which the change log keeps as a change of the date he was to retire on.
    retirement: "Retirement",
    // A change to a player's contract clauses, which the change log keeps as a change of the clause's amount.
    clause: "Contract clause",
    "clause.amount": "Clause amount",
    "clause.condition": "Clause condition",
    // Making a player the captain or vice-captain of one of a club's teams, which the change log keeps as a change of
    // the club's captain or vice-captain.
    captain: "Captain",
    vice_captain: "Vice-captain",
    // A club's own reputation, which has no home, current or world.
    reputation: "Reputation",
    "facilities.training": "Training facilities",
    "facilities.youth_facilities": "Youth facilities",
    "facilities.youth_coaching": "Youth coaching",
    "facilities.youth_recruitment": "Youth recruitment",
    "facilities.corporate": "Corporate facilities",
    "finance.balance": "Balance",
    "finance.transfer_budget": "Transfer budget",
    "finance.wage_budget": "Wage budget",
    "finance.total_wage_budget": "Total wage budget",
    "stadium.capacity": "Stadium capacity",
    "stadium.seating": "Seated capacity",
    "stadium.used": "Capacity in use",
    "stadium.expansion": "Expansion capacity",
    // A nation's rules; its reputation is its senior team's.
    population: "Population",
    dual_nationality: "Dual nationality",
    naturalisation: "Years to naturalise",
    youth_rating: "Youth rating",
    "women.reputation": "Women's reputation",
    "women.youth_rating": "Women's youth rating",
    game_importance: "Game importance",
    attendance: "Attendance",
    "women.game_importance": "Women's game importance",
    "women.attendance": "Women's attendance",
    points: "FIFA points",
  },

  profile: {
    close: "Close profile",
    /** The bar of links to the sections of a long profile; its first link goes back to the top. */
    sections: "Sections",
    top: "Top",
    loading: "Loading profile…",
    /** The handle on the left edge of the panel. */
    resize: "Resize the profile panel",
    resizeHint: "Drag to resize. Double-click to reset.",
    /** The button beside Close that widens the panel as far as it goes, then gives it its usual width again. */
    widen: "Widen panel",
    usualWidth: "Reset panel width",
    /** Shown where a value is missing. */
    none: "-",

    // Header
    freeAgent: "Free agent",
    born: "Born",
    height: (cm: number) => `${cm} cm`,
    /** After the input of the height, while the player is edited. */
    heightUnit: "cm",
    uid: "ID",
    currentAbility: "Current ability",
    currentAbilityShort: "CA",
    potentialAbility: "Potential ability",
    potentialAbilityShort: "PA",
    /** Hover text of a potential ability that is set as a range (the game stores it as a negative number). */
    potentialRange: "Potential set as a range",
    /** The group of what the header leaves out: the full name, the birth date, the height and the ID. */
    personalDetails: "Personal details",
    fullNameLabel: "Full name",
    heightLabel: "Height",

    // Attributes
    technical: "Technical",
    goalkeeping: "Goalkeeping",
    mental: "Mental",
    physical: "Physical",
    hidden: "Hidden",
    feet: "Feet",
    personality: "Personality",
    /** Hover text of an attribute: the value as stored, 0–100 unless the game stores it on another scale. */
    raw: (raw: number, scale = 100) => `raw ${raw} / ${scale}`,
    lowerIsBetter: "lower is better",
    age: (age: number) => `age ${age}`,

    // Positions
    positions: "Positions",
    positionsSummary: (best: string) => `Position ratings: ${best}`,
    /** The group of every position's rating, under the pitch. */
    positionRatings: "Position ratings",
    positionTiers: {
      natural: "Natural",
      accomplished: "Accomplished",
      competent: "Competent",
      unconvincing: "Unconvincing",
      ineffective: "Ineffective",
    },
    positionTooltip: (position: string, rating: number, tier: string) => `${position} · ${rating} · ${tier}`,

    // Contract
    contract: "Contract",
    wage: "Wage per week",
    /** The hover text of money the app shows in another currency than the pounds the game keeps. */
    converted: "Converted at FM's exchange rate",
    /** Under a weekly wage FM rounds for display: the figure FM shows for it. */
    fmShowsWage: (amount: string) => `FM shows ${amount}`,
    signed: "Signed",
    expires: "Expires",
    /** A loaned player's loan: the club he is on loan from, what the borrowing club pays, and its dates. */
    loan: "Loan",
    loanFrom: "On loan from",
    loanWage: "Borrower pays per week",
    loanStarts: "Loan began",
    loanEnds: "Loan ends",
    loanFutureFee: "Future fee",
    /** A move FM agreed for a later day: the club he joins, and the day. */
    futureTransfer: "Future transfer",
    futureClub: "Club",
    futureJoins: "Joins",
    /** A player's work permits, one per nation he holds one for: active, or an ESC slot (FM's name) from a day. */
    workPermit: "Work permit",
    permitActive: "Active",
    permitEsc: (date: string) => `ESC slot since ${date}`,
    permitNone: "None",
    permitNotNeeded: "Not needed",
    /** Asks FM to issue a permit under its rules, or takes an existing one away. */
    requestPermit: "Request permit",
    permitNotIssued: "FM did not issue a permit. This player may not need one under the current rules.",
    revokePermit: "Revoke",
    joined: "Joined",
    squadStatus: "Squad status",
    squadStatusName: (status: number) => SQUAD_STATUSES[status] ?? "Unknown status",
    /** A member of staff's coaching licence: 0 none, 1 to 8 FM's levels. */
    qualifications: "Qualifications",
    formations: "Formations",
    coachingLicence: "Coaching licence",
    licenceName: (level: number): string =>
      ({
        1: "Continental Pro Licence",
        2: "Continental A Licence",
        3: "Continental B Licence",
        4: "Continental C Licence",
        5: "National A Licence",
        6: "National B Licence",
        7: "National C Licence",
      })[level] ?? "None",
    squadNumber: "Squad number",
    transferListed: "Transfer listed",
    loanListed: "Loan listed",

    // Career
    career: "Career",
    internationalCaps: "International caps",
    internationalGoals: "International goals",
    u21Caps: "U21 caps",
    u21Goals: "U21 goals",
    transferValue: "Base transfer value",
    transferUnavailable: "Unavailable",
    askingPrice: "Asking price",
    notSet: "Not set",
    reputation: "Reputation",
    reputationHome: "Home",
    reputationCurrent: "Current",
    reputationWorld: "World",
    /** The retirement the game has planned for a player, and the button that keeps him playing. */
    retirement: "Retirement",
    retires: "Plans to retire",
    preferences: "Likes and dislikes",
    languages: "Languages",
    /**
     * How well a person speaks a language (0 to 10), in the words of FM's profile: 7 to 10 fluent (10 too, as for
     * Gyökeres' English), 5 good, 3 and 4 basic. FM leaves out a language at 1.
     */
    languageLevel: (level: number): string =>
      level >= 7 ? "Fluent" : level >= 5 ? "Good" : level >= 2 ? "Basic" : "Does not speak",
    languageLevelTitle: (level: number) => `${level}/10`,
    rivals: "Rivals",
    linkedClubs: "Affiliated clubs",
    preferenceKinds: {
      favouredClub: "Favoured clubs",
      dislikedClub: "Disliked clubs",
      favouredPerson: "Favoured people",
      dislikedPerson: "Disliked people",
    },
    noRetirement: "No retirement planned",
    keepPlaying: "Prevent retirement",
    keepingPlaying: "Preventing…",
    keepPlayingTitle:
      "Cancels his retirement. You can undo it in Changes.",

    // Medical (the group's heading is `medical`, below; the names of its values are in `fields`)
    /** A player's morale, 1–20. */
    morale: (value: number) => `${value} / 20`,
    /** Hover text of his morale: the game shows it as his overall happiness. */
    /** A player's traits (preferred moves): the heading, none, and each one's name by its bit. */
    traits: "Traits",
    noTraits: "No traits",
    traitName: (bit: number) => TRAIT_NAMES_EN[bit] ?? "Unknown trait",
    /** A player's reasons to be unhappy, as FMRTE lists them, and the button that removes them all. */
    unhappiness: "Unhappiness",
    noUnhappiness: "Nothing makes him unhappy",
    removeUnhappiness: "Remove all",
    removingUnhappiness: "Removing…",
    removeUnhappinessTitle: "Clears every reason he's unhappy.",
    concernSince: (date: string) => `since ${date}`,
    concernKind: (kind: number): string => (kind === 1 ? "Concerned" : kind === 2 ? "Internal" : ""),
    concernMotive: (motive: number) => CONCERN_MOTIVES_EN[motive] ?? "Unknown reason",
    /** A contract's clauses and bonuses: the heading, and what each kind the game has is called. */
    clauses: "Bonuses and clauses",
    noClauses: "No bonuses or clauses",
    loyaltyBonus: "Loyalty bonus",
    happiness: "Happiness",
    playingTimeHappiness: "Playing time happiness",
    moodTitle: "From -100 to 100.",
    /** The name of a clause or bonus by its kind; a kind the app does not know yet by its number. */
    clauseName: (kind: number) => CLAUSE_NAMES_EN[kind] ?? "Unknown clause",
    /** What a clause depends on, by kind; null where what it means is not known. */
    clauseCondition: (kind: number, value: number): string | null => {
      if (RELEASE_CLAUSES.has(kind)) {
        return null;
      }
      if (PERCENT_CLAUSES.has(kind)) {
        return `${value}%`;
      }
      switch (kind) {
        case 10:
          return value === 1 ? "1 goal" : `${value} goals`;
        case 40:
          return value === 1 ? "1 assist" : `${value} assists`;
        case 41:
          return `${value} goals and assists`;
        case 11:
        case 13:
          return value === 1 ? "1 league game" : `${value} league games`;
        case 19:
          return value === 1 ? "1 international match" : `${value} international matches`;
        case 22:
          return value === 1 ? "1 year" : `${value} years`;
        default:
          return String(value);
      }
    },
    moraleTitle: "10 is content. 15 and up is extremely happy.",
    /** Jadedness as FM shows it: a player is jaded above 400. */
    jaded: "Jaded",
    /** Hover text of jadedness, with the stored value. */
    jadednessTitle: (stored: string) => `Value ${stored}. Jaded above 400, fully rested at -500.`,
    noInjuries: "No injuries",
    /** The name of an injury the game gave none for. */
    unknownInjury: "Unknown injury",
    unknownClub: "Unknown club",
    unknownNation: "Unknown nation",
    unknownPerson: "Unknown person",
    /** A name the game's lists do not have; the editor never shows a UID in its place. */
    unknownName: "Unknown",
    /** Under the name of an injury: when it began, and when he is expected back (`dates`: one date, or a range). */
    injuryStarted: (date: string) => `Started ${date}`,
    injuryBack: (dates: string) => `Expected back ${dates}`,
    /** Heals every injury of the player at once. */
    heal: "Heal",
    healTitle: "Heal all his injuries",
    /** Has FM give him the injury chosen in the select next to it; the select's label is `injuryKind`. */
    addInjury: "Add injury",
    injuryKind: "Injury",
    noBans: "No bans",
    /** A ban: how many matches the player still has to miss, and under it when it began. */
    banMatches: (matches: number) => (matches === 1 ? "1 match" : `${format(matches)} matches`),
    banStarted: (date: string) => `From ${date}`,
    /** Lifts every ban of the player at once. */
    liftBans: "Lift",
    liftBansTitle: "Lift all his bans",
    /** The group of the promises made to a player; FM's own names for them are in its language files only. */
    promises: "Promises",
    formationName: (id: number) => id === 0 ? "None" : knownFormationName(id) ?? "Unknown formation",
    promiseName: (id: number) => PROMISE_NAMES_EN[id] ?? "Unknown promise",
    promiseMade: (date: string) => `Made ${date}`,
    promiseDue: (date: string) => `Due ${date}`,
    promiseEnded: (date: string) => `Ended ${date}`,
    closePromise: "Close",
    closePromiseTitle: "End this promise without holding it against him",

    // After the attributes, while the profile is read
    /** The button that opens Set all attributes and Freeze attributes. */
    tools: "Tools",
    tabsLabel: "Player sections",
    tabs: { attributes: "Attributes", mood: "Mood", contract: "Contract", medical: "Medical", career: "Career" },
    /** The tabs of a member of staff's profile. */
    staffTabsLabel: "Staff sections",
    staffTabs: { attributes: "Attributes", contract: "Contract", career: "Career" },
    statusLabel: "Status",
    injured: "Injured",
    banned: "Banned",
    concerns: (count: number) => (count === 1 ? "1 concern" : `${format(count)} concerns`),
    contractTo: (date: string) => `Contract to ${date}`,
    moraleAndHappiness: "Morale and happiness",
    fitness: "Fitness",
    international: "International",
    noPromises: "No promises",
    /** Where FM Lens cannot read promises yet. */
    promisesUnavailable: "Not available on Windows yet",
    noContract: "No contract",
    /** Sets every attribute of the player to one value at once: the words before the value, and the button. */
    setAttributes: "Set all attributes to",
    setAttributesButton: "Apply",
    /** What Set all attributes wrote, beside the button that takes it back; then what that undid. */
    setAttributesDone: (count: number, level: number) =>
      count === 0
        ? "Every attribute has that value already"
        : `${changeCount(count)} made. Injury proneness and dirtiness set to ${21 - level}${level === 20 ? ", CA and PA to 200" : ""}.`,
    setAttributesUndone: (count: number) => (count === 0 ? "Nothing was undone" : `Undid ${changeCount(count)}`),
    undoSetAttributes: "Undo",
    undoSetAttributesTitle: "Put his old attributes back",
    /** Freezing his attributes, while the game can be written to, and what that does. */
    freezeAttributes: "Freeze attributes",
    freezeAttributesNote: "His attributes can't drop while FM Lens is connected.",

    // Staff
    /** Badge on the manager the user controls. */
    you: "You",
    youTitle: "The manager you control",
    id: "ID",
    job: "Job",
    /** Giving a member of staff another job at their club, under the job in the contract. */
    changeJob: "Change job",
    changeJobTitle: "Change their job",
    newJob: "New job",
    applyJob: "Apply",
    cancelJob: "Cancel",
    unemployed: "Unemployed",
    /** A national team, as the employer of its manager: "England", "England U21", "England Women". */
    nationalTeam: (nation: string, ageLimit: number | null, women: boolean) =>
      `${nation}${women ? " Women" : ""}${ageLimit === null ? "" : ` U${ageLimit}`}`,
    coaching: "Coaching",
    knowledge: "Knowledge",
    medical: "Medical",
    /** A coaching job held by someone who still plays. */
    playerCoach: (job: string) => `${job} (player-coach)`,
    unknownJob: "Unknown job",
  },

  /** The player list: search, filter bar and columns. */
  playerList: {
    /** The entry in the sidebar. */
    nav: "Players",
    /** In the status line, once connected. */
    count: (total: number) => `${format(total)} ${total === 1 ? "player" : "players"}`,
    search: "Search players by name or ID",
    /**
     * The line beside the search box. `sorted` is the order a column header was clicked for, or null while the
     * list is in its default order (best current ability first); its `by` is a name from `sortNames`.
     */
    summary: (total: number, shown: number, sorted: { by: string; ascending: boolean } | null) => {
      const count = `${format(total)} ${total === 1 ? "player" : "players"}`;
      if (total <= shown) {
        return count;
      }
      return sorted === null
        ? `${count} · Top ${shown} by ability`
        : `${count} · ${shown} shown · ${sorted.by} ${sorted.ascending ? "↑" : "↓"}`;
    },
    /** The message under an empty table; `filtered` is whether any filter is in effect. */
    empty: (query: string, filtered: boolean) => {
      if (query === "") {
        return filtered ? "No players match these filters." : "No players found.";
      }
      return filtered ? `No players match “${query}” with these filters.` : `No players match “${query}”.`;
    },
    columns: {
      name: "Name",
      age: "Age",
      positions: "Positions",
      nation: "Nation",
      club: "Club",
      contractExpires: "Contract",
      born: "Born",
      currentAbility: "CA",
      potentialAbility: "PA",
      uid: "ID",
    } satisfies Record<PlayerSort | "positions" | "born" | "uid", string>,
    /** Hover text of a column header that sorts the list; `by` is a name from `sortNames`. */
    sortBy: (by: string) => `Sort by ${by}`,
    /** The name of each sortable column, as the summary line and the hover text of a header say it. */
    sortNames: {
      currentAbility: "current ability",
      potentialAbility: "potential ability",
      age: "age",
      name: "name",
      nation: "nation",
      club: "club",
      contractExpires: "contract end",
    } satisfies Record<PlayerSort, string>,
    filters: {
      /** The button that shows or hides the filters. */
      toggle: "Filters",
      /** Its name for assistive technology while `count` of the filters are in effect. */
      toggleActive: (count: number) => `Filters, ${count} active`,
      clear: "Clear",
      /** The entry of the position select that is no filter. */
      any: "Any",
      position: "Position",
      age: "Age",
      minAge: "Minimum age",
      maxAge: "Maximum age",
      /** The hint in an empty age input. */
      minPlaceholder: "Min",
      maxPlaceholder: "Max",
      minCurrentAbility: "Min CA",
      minCurrentAbilityTitle: "Minimum current ability",
      minPotentialAbility: "Min PA",
      minPotentialAbilityTitle: "Minimum potential ability",
      /** The hint in an empty ability input: what it accepts. */
      abilityPlaceholder: "1–200",
      nation: "Nation",
      club: "Club",
      freeAgentsOnly: "Free agents only",
      contractEndsBy: "Contract ends by",
      transferListedOnly: "Transfer listed only",
      loanListedOnly: "Loan listed only",
      /** The list of chips of the filters in effect, and the name of a chip's button; `label` is what it says. */
      chips: "Filters in effect",
      removeChip: (label: string) => `Remove ${label}`,
      /** Bounds on attributes, a row each, under the other filters; the staff list has them too. */
      attributes: {
        heading: "Attributes",
        /** The select of a row, for assistive technology, and its entry before an attribute is picked. */
        attribute: "Attribute",
        pick: "Pick an attribute",
        /** The two inputs of a row, for assistive technology; `name` is the attribute, "" before one is picked. */
        min: (name: string) => (name ? `Min ${name}` : "Min"),
        max: (name: string) => (name ? `Max ${name}` : "Max"),
        add: "Add attribute",
        /** The button that takes a row away, for assistive technology and as its hover text. */
        remove: (name: string) => (name ? `Remove ${name}` : "Remove this row"),
      },
      /** Saving the filters in effect, and the sort, under a name of the user's own; the names stay as typed. */
      saved: {
        /** The button that starts saving, and its hover text. */
        save: "Save",
        saveTitle: "Save these filters and sort",
        /** The name input, for assistive technology, and the hint in it while it is empty. */
        name: "Name of the saved filter",
        namePlaceholder: "Filter name",
        ok: "OK",
        cancel: "Cancel",
        /** The select of the saved filters: its name, and what it shows while none is the one in effect. */
        select: "Saved filters",
        delete: "Delete",
        /** The name and hover text of Delete; `name` is the saved filter's. */
        deleteTitle: (name: string) => `Delete ${name}`,
        /** The question when the name is taken; `name` is the one typed. */
        replaceQuestion: (name: string) => `“${name}” already exists. Replace it?`,
        replace: "Replace",
        /** When the name is a new one and `max` filters are saved already. */
        full: (max: number) =>
          `You can save up to ${max} filters. Delete one, or reuse a name to replace it.`,
      },
    },
  },

  /** The staff list. */
  staffList: {
    /** The entry in the sidebar. */
    nav: "Staff",
    /** In the status line, once connected. */
    count: (total: number) => `${format(total)} staff`,
    search: "Search staff by name or ID",
    summary: (total: number, shown: number) =>
      total > shown
        ? `${format(total)} staff · Top ${shown} by ability`
        : `${format(total)} staff`,
    /** The message under an empty table; `filtered` is whether any filter is in effect. */
    empty: (query: string, filtered: boolean) => {
      if (query === "") {
        return filtered ? "No staff match these filters." : "No staff found.";
      }
      return filtered ? `No staff match “${query}” with these filters.` : `No staff match “${query}”.`;
    },
    columns: {
      name: "Name",
      age: "Age",
      job: "Job",
      club: "Club",
      nation: "Nation",
      born: "Born",
      currentAbility: "CA",
      potentialAbility: "PA",
      id: "ID",
    },
    filters: {
      job: "Job",
      /** The entry of the job select that is no filter. */
      anyJob: "Any",
      unemployedOnly: "Unemployed only",
      humanOnly: "Only you",
      age: "Age",
      minAge: "Minimum age",
      maxAge: "Maximum age",
      minPlaceholder: "Min",
      maxPlaceholder: "Max",
      minCurrentAbility: "Min CA",
      minCurrentAbilityTitle: "Minimum current ability",
      minPotentialAbility: "Min PA",
      minPotentialAbilityTitle: "Minimum potential ability",
      abilityPlaceholder: "1–200",
      nation: "Nation",
      club: "Club",
    },
  },

  /** The club profile: what the player and staff panels do not have. */
  clubProfile: {
    // Header
    womensClub: "Women's club",
    /** "Founded 1882", in the line under the name. */
    founded: (year: number) => `Founded ${year}`,
    reputationShort: "REP",
    reputationTitle: "Reputation",

    // The tabs under the header: what the club has, and its squad (see `squad`).
    /** The name of the tabs for assistive technology. */
    tabsLabel: "Club sections",
    tabs: { overview: "Overview", squad: "Squad" },
    /** Hover text of the Squad tab while the club is edited: its values are on the Overview. */
    squadLocked: "Finish editing to open the squad",

    facilities: "Facilities",

    // Supporters
    supporters: "Supporters",
    supporterMix: "Supporter mix",
    /** A share of the supporters; `value` is already a percentage (35 for 35%). */
    percent: (value: number) => `${percents.format(value)}%`,
    /** Hover text of a segment of the supporter-mix bar. */
    mixTooltip: (kind: string, percent: string) => `${kind} · ${percent}`,

    // Finances
    finances: "Finances",
    balance: "Balance",
    transferBudget: "Transfer budget",
    wageBudget: "Wage budget used",
    totalWageBudget: "Total wage budget",
    ticketPrice: "Average ticket price",
    /** After the two wage budgets, which are amounts per week. */
    perWeek: "p/w",
    /** Clubs outside the leagues being played have no finance record in memory. */
    noFinances: "FM only tracks money for clubs in playable leagues.",
    /** Freezing the club's money, while the game can be written to, and what that does. */
    freeze: "Freeze money",
    freezeNote: "The balance can't go down while FM Lens is connected.",

    // Stadium
    stadium: "Stadium",
    capacity: "Capacity",
    seating: "Seated",
    used: "In use",
    /** The capacity in use when the game does not limit it (stored as 0). */
    usedAll: "All of it",
    usedTitle: "How much of the capacity FM lets in. 0 means all of it.",
    expansion: "Can grow to",
    /** When the layout of this build does not know where the stadium is, or the club's stadium did not check out. */
    noStadium: "Couldn't read this club's stadium.",

    // Club info
    info: "Club info",
    seasonTickets: "Season tickets",
    socialMedia: "Social media followers",
  },

  /** The club list, with the sidebar entry and the status-line count that go with it. */
  clubList: {
    /** The entry in the sidebar. */
    nav: "Clubs",
    /** In the status line, once connected. */
    count: (total: number) => `${format(total)} clubs`,
    search: "Search clubs by name or ID",
    summary: (total: number, shown: number) =>
      total > shown
        ? `${format(total)} clubs · Top ${shown} by reputation`
        : `${format(total)} clubs`,
    /** The message under an empty table; `filtered` is whether a filter is in effect. */
    empty: (query: string, filtered: boolean) => {
      if (query === "") {
        return filtered ? "No clubs match these filters." : "No clubs found.";
      }
      return filtered ? `No clubs match “${query}” with these filters.` : `No clubs match “${query}”.`;
    },
    /** The small tag on a women's club. */
    women: "Women",
    columns: {
      name: "Name",
      reputation: "Reputation",
      founded: "Founded",
      uid: "ID",
    },
    filters: {
      /** The name of the select, which has no label of its own. */
      kind: "Clubs to show",
      all: "All clubs",
      men: "Men's clubs",
      women: "Women's clubs",
      reputation: "Reputation",
      minReputation: "Minimum reputation",
      maxReputation: "Maximum reputation",
      minPlaceholder: "Min",
      maxPlaceholder: "Max",
      founded: "Founded",
      foundedFrom: "Founded from",
      foundedTo: "Founded to",
      yearPlaceholder: "Year",
    },
  },

  /** Senior stadiums, one per club, from the fields the club profile already shows. */
  officialList: {
    nav: "Officials",
    search: "Search officials by name or ID",
    summary: (total: number, shown: number) => {
      const count = total === 1 ? "1 official" : `${format(total)} officials`;
      return total > shown ? `${count} · Top ${shown} by ability` : count;
    },
    empty: (query: string, filtered: boolean) => {
      if (query === "" && !filtered) {
        return "Couldn't read any officials on this version of FM.";
      }
      if (query === "") {
        return "No officials match these filters.";
      }
      return filtered
        ? `No officials match “${query}” with these filters.`
        : `No officials match “${query}”.`;
    },
    columns: { name: "Name", nation: "Nation", age: "Age", ca: "CA", pa: "PA", reputation: "Reputation", uid: "ID" },
    filters: {
      age: "Age",
      minAge: "Minimum age",
      maxAge: "Maximum age",
      minCurrentAbility: "Min CA",
      minCurrentAbilityTitle: "Minimum current ability",
      minPotentialAbility: "Min PA",
      minPotentialAbilityTitle: "Minimum potential ability",
      abilityPlaceholder: "1–200",
      nation: "Nation",
    },
    reputation: "Reputation",
  },

  competitionList: {
    nav: "Competitions",
    search: "Search competitions by name or ID",
    summary: (total: number, shown: number) => {
      const count = total === 1 ? "1 competition" : `${format(total)} competitions`;
      return total > shown ? `${count} · Top ${shown} by reputation` : count;
    },
    empty: (query: string, filtered: boolean) => {
      if (query === "" && !filtered) {
        return "Couldn't read any competitions on this version of FM.";
      }
      if (query === "") {
        return "No competitions match these filters.";
      }
      return filtered
        ? `No competitions match “${query}” with these filters.`
        : `No competitions match “${query}”.`;
    },
    columns: { name: "Name", nation: "Nation", continent: "Continent", reputation: "Reputation", uid: "ID" },
    filters: {
      kind: "Competitions to show",
      all: "All",
      men: "Men",
      women: "Women",
      nation: "Nation",
      continent: "Continent",
      reputation: "Reputation",
      minReputation: "Minimum reputation",
      maxReputation: "Maximum reputation",
    },
    shortName: "Short name",
    reputation: "Reputation",
    /** The small tag on a women's competition. */
    women: "Women",
    rules: "Rules",
    /** A competition's rules as FM's own data for it holds them, by the keys FM Lens reads them with. */
    ruleNames: {
      level: "Level",
      max_squad_size: "Max squad size",
      min_squad_size: "Min squad size",
      recommended_squad_size: "Recommended squad size",
      max_prelim_squad_size: "Max preliminary squad",
      min_foreign_players: "Min foreign players",
      max_foreign_players: "Max foreign players",
      foreign_trialists_can_play: "Foreign trialists may play",
      subs_allowed: "Substitutions allowed",
      max_subs: "Substitutes named",
      extended_injury_time: "Extended stoppage time",
      daylight_offside_rule: "Daylight offside",
      yellow_cards_for_fine: "Yellow cards for a fine",
      min_games_for_medal: "Games for a medal",
      number_of_medals: "Medals",
      min_stadium_capacity: "Min stadium capacity",
      min_stadium_seating: "Min seated capacity",
      requires_grass_pitch: "Grass pitch required",
      requires_undersoil_heating: "Undersoil heating required",
    },
  },

  awardList: {
    nav: "Awards",
    search: "Search awards by name, competition or ID",
    summary: (total: number, shown: number) => {
      const count = total === 1 ? "1 award" : `${format(total)} awards`;
      return total > shown ? `${count} · Top ${shown} by prestige` : count;
    },
    empty: (query: string, filtered: boolean) => {
      if (query === "" && !filtered) {
        return "Couldn't read any awards on this version of FM.";
      }
      if (query === "") {
        return "No awards match these filters.";
      }
      return filtered
        ? `No awards match “${query}” with these filters.`
        : `No awards match “${query}”.`;
    },
    columns: { name: "Name", competition: "Competition", nation: "Nation", prestige: "Prestige", uid: "ID" },
    filters: {
      kind: "Awards to show",
      all: "All",
      men: "Men",
      women: "Women",
      nation: "Nation",
      recipients: "Given to",
      anyone: "Anyone",
      prestige: "Prestige",
      minPrestige: "Minimum prestige",
      maxPrestige: "Maximum prestige",
    },
    competition: "Competition",
    prestige: "Prestige",
    /** How often it is given, by FM's code; null for the codes not named yet. */
    period: "Given",
    periodName: (code: number): string | null =>
      ({
        1: "Every week",
        2: "Every month",
        3: "Every season",
        4: "At the end of the competition",
        5: "Every calendar year",
        6: "Every year",
        7: "Every round",
      })[code] ?? null,
    /** Who gets it, by FM's code; null for the codes not named yet. */
    recipients: "Given to",
    recipientName: (code: number): string | null => ({ 1: "A player", 2: "A manager", 7: "A team of players" })[code] ?? null,
    goalkeepersOnly: "Goalkeepers only",
    ageLimit: "Age limit",
    ageLimitValue: (age: number) => `${age} or under`,
    /** The small tag on a women's award. */
    women: "Women",
  },

  stadiumList: {
    nav: "Stadiums",
    search: "Search stadiums by name or club",
    summary: (total: number, shown: number) =>
      total > shown
        ? `${format(total)} stadiums · Top ${shown} by capacity`
        : `${format(total)} stadiums`,
    empty: (query: string, filtered: boolean) => {
      if (query === "" && !filtered) {
        return "Couldn't read any stadiums.";
      }
      if (query === "") {
        return "No stadiums match these filters.";
      }
      return filtered ? `No stadiums match “${query}” with these filters.` : `No stadiums match “${query}”.`;
    },
    columns: {
      name: "Stadium",
      club: "Club",
      capacity: "Capacity",
      seating: "Seated",
      expansion: "Can grow to",
    },
    /** The clubs that play at a stadium, in its profile. */
    clubs: "Clubs",
    filters: {
      kind: "Stadiums to show",
      all: "All",
      men: "Men",
      women: "Women",
      capacity: "Capacity",
      minCapacity: "Minimum capacity",
      maxCapacity: "Maximum capacity",
      minPlaceholder: "Min",
      maxPlaceholder: "Max",
    },
  },

  /** Nations of the people in the save. Not a nation's ranking, rules or kit. */
  nationList: {
    nav: "Nations",
    search: "Search nations by name",
    summary: (total: number, shown: number) => {
      const count = total === 1 ? "1 nation" : `${format(total)} nations`;
      return total > shown ? `${count} · ${shown} shown` : count;
    },
    empty: (query: string, filtered: boolean) => {
      if (query === "") {
        return filtered ? "No nations match these filters." : "No nations found.";
      }
      return filtered
        ? `No nations match “${query}” with these filters.`
        : `No nations match “${query}”.`;
    },
    columns: { name: "Nation", continent: "Continent", uid: "ID" },
    filters: {
      continent: "Continent",
    },
    uid: "ID",
    noUid: "No ID",
    nation: "Nation",
    capital: "Capital",
    population: "Population",
    languages: "Languages",
    dualNationality: "Dual nationality",
    allowed: "Allowed",
    notAllowed: "Not allowed",
    naturalisation: "Years to naturalise",
    never: "Never",
    fifa: "FIFA",
    ranking: "World ranking",
    points: "Points",
    founded: "Association founded",
    joinedFifa: "Joined FIFA",
    joinedContinental: "Joined confederation",
    youthRating: "Youth rating",
    gameImportance: "Game importance",
    attendance: "Attendance",
    women: "Women's football",
    style: "Style",
    womenStyle: "Women's style",
    teamName: (ageLimit: number | null) => (ageLimit === null ? "Senior team" : `Under-${ageLimit}s`),
    womenTeamName: (ageLimit: number | null) =>
      ageLimit === null ? "Women's senior team" : `Women's under-${ageLimit}s`,
    manager: "Manager",
    captain: "Captain",
    viceCaptain: "Vice-captain",
    reputation: "Reputation",
    squad: (count: number) => `Squad (${count})`,
  },

  /** The app around the lists: the sidebar, the status line and the connect panel. */
  app: {
    /** The masthead's menu of the smaller lists: nations, competitions, awards, stadiums and officials. */
    lists: "Lists",
    /** The Settings window the gear at the right of the masthead opens: its name, its sections and its rows. */
    settingsLabel: "Settings",
    general: "General",
    languageLabel: "Language",
    currencyLabel: "Currency",
    theme: "Theme",
    privacy: "Privacy",
    about: "About",
    done: "Done",
    /** The interface scale, separate from the window's own zoom. */
    zoomLabel: "Zoom",
    /** A switch: anonymous counts of launches and edits, sent to PostHog (see `usage.ts`). */
    usageLabel: "Share anonymous usage",
    appearance: "Appearance",
    themes: { system: "System", light: "Light", dark: "Dark" },
    /** Shown once, until it is skipped or finished. It introduces browsing, settings and the editing boundary. */
    tour: {
      label: "Introduction",
      skip: "Skip",
      back: "Back",
      next: "Next",
      done: "Done",
      progress: (step: number, total: number) => `${step} of ${total}`,
      steps: {
        brand: {
          title: "FM Lens",
          body: "See and change everything in your save. Try it on a copy of your save first.",
        },
        tabs: {
          title: "Sections",
          body: "Players, staff and clubs. Nations, stadiums and more under Lists.",
        },
        search: {
          title: "Search and filters",
          body: "Type a name or ID.",
        },
        settings: {
          title: "Settings",
          body: "Language, currency, light or dark mode, and zoom.",
        },
        status: {
          title: "Connection",
          body: "Shows whether you're connected to FM.",
        },
      },
      exercise: {
        list: { title: "Try an edit", body: "Open anyone in the list." },
        edit: { title: "Edit", body: "Press Edit, or click a value." },
        profile: { title: "Change a value", body: "Type a new value." },
        apply: { title: "Apply", body: "Apply puts the change into FM. Discard drops it." },
        changes: { title: "Changes", body: "Every change you applied, ready to undo." },
      },
    },

    // The note at the foot of the sidebar; which one shows depends on the connection (see `ConnectionInfo.editable`).
    /** Connected, and the game was opened for writing. */
    noteEditable: "Editing on",
    /** Connected, but the process was not opened for writing. */
    noteReadOnly: "Read-only",
    /** Read-only because the game is a version FM Lens was not checked with (see `compatibility`). */
    noteUnknownBuild: "Read-only: this FM version isn't supported yet",
    noteReloadRequired: "FM moved its data. Press Reload to edit again.",

    // The status line and the busy texts beside it
    notConnected: "Not connected",
    /** The status line once connected; the app version and game build are under About in Settings. */
    connected: "Connected",
    /** At the foot of the window: opens the Report a problem dialog (see `report`). */
    reportProblem: "Report a problem",
    /** Beside an open profile, the button that holds a list's less common actions (Export, Mass edit, ...). */
    more: "More",
    /** Beside the version in a debug build, which cannot update itself: never a release. */
    debugTag: "DEBUG",
    /** Beside the status line in a plain browser, where fixtures stand in for the game. */
    previewTag: "browser preview · sample data",
    /** In place of the game's date when it could not be read, and the note it shows on hover. */
    noDate: "No in-game date",
    noDateTitle: "Couldn't read the in-game date, so ages are hidden.",
    /** The button that reads the game again, once connected. */
    reload: "Reload",
    detecting: "Looking for Football Manager…",
    connecting: "Loading save…",
    loadingView: "Loading…",
    reloading: "Loading save…",

    /** The notice after connecting to a save in which something was frozen before (`FrozenNotice`). */
    refrozen: {
      title: "Freezes from last time are back on",
      /** When nothing could be frozen again. */
      waitingTitle: "Freezes on hold",
      /** `names` are the players' names, set apart by commas. */
      players: (names: string) => `Attributes: ${names}`,
      clubs: (names: string) => `Money: ${names}`,
      /** After the first few names. */
      more: (count: number) => `and ${format(count)} more`,
      /** What was left for later: an update of the game, say. */
      waiting: (count: number) =>
        `${count === 1 ? "1 freeze is" : `${format(count)} freezes are`} saved but off: FM Lens can't edit ` +
        "this FM version yet.",
      dismiss: "Dismiss",
    },

    /** The panel shown while not connected. */
    /** The screen in place of the app until the user has given an email address (see EmailGate.tsx). */
    email: {
      title: "Enter your email to use FM Lens",
      intro: "FM Lens emails you about updates.",
      button: "Continue",
      /** On the button while the address is sent. */
      sending: "Checking…",
      /** The relay turned the address down. */
      refused: "That did not work. Check the address and try again.",
      /** The address could not be sent, or the relay could not take it now. */
      failed: "That did not work. Check your connection and try again.",
    },

    connect: {
      title: "Connect to Football Manager 27",
      intro: "Load a save in FM, then connect.",
      notRunning: "Football Manager 27 isn't running.",
      /** `error` is the answer of the Rust side, which stays in English. */
      openFailed: (error: string) => `Couldn't open FM: ${error}`,
      /** FM27 is open but has not reached its main menu yet. */
      stillLoading: "FM is still starting. Wait for the main menu.",
      several: "More than one copy of FM is running. Using the first one.",
      button: "Connect",

      /** macOS: the bridge FM27 has to load before the app can reach it, and setting it up. */
      bridge: {
        title: "One-time setup",
        intro: "Save and quit FM, then quit Steam.",
        library: "Helper",
        installed: "Installed",
        missing: "Not installed",
        launchOption: "Steam launch option",
        set: "Set",
        notSet: "Not set",
        steamRunning: "Steam is open. Quit it first, or add the launch option yourself.",
        setUp: "Set up",
        remove: "Remove the helper",
        manual: "Or in Steam, right-click Football Manager 27 › Properties › General › Launch Options and paste:",
        copy: "Copy",
        copied: "Copied",
      },
    },
  },

  /**
   * The notice under the masthead when the game is a version FM Lens has no profile for, or some of the checks
   * it makes before writing did not pass (`CompatibilityNotice`).
   */
  compatibility: {
    /** The headline for a version without a profile; `game` as the status line names it. */
    unknownBuild: (game: string) => `${game} is not supported yet`,
    unknownBuildText: "Values may be wrong, so editing is off.",
    /** Once Edit anyway was pressed. */
    allowedText: "Editing is on where checks passed. Back up your save.",
    /** The headline when checks did not pass on a version the editor knows, and what may help. */
    failedTitle: "Some data looks wrong",
    reloadHint: "If a save was still loading, press Reload.",
    /** The in-game date did not check out: shown apart, as it leaves nothing read-only. */
    noDate: "Couldn't read the in-game date, so ages are hidden.",
    /** The other checks that did not pass, their names joined (see `checks`). */
    failed: (names: string) => `Read-only: ${names}.`,
    /** Joins the names of the checks that did not pass. */
    join: (names: string[]) =>
      names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`,
    allow: "Edit anyway",
    allowTitle: "Back up your save first.",
  },

  /** What each check is about (`CheckKey`), as the notice lists the ones that did not pass and the errors name them. */
  checks: {
    gameDate: "the in-game date",
    players: "players' details",
    positions: "positions",
    attributes: "attributes",
    personality: "personality",
    liveValues: "energy, match sharpness, jadedness and morale",
    contracts: "contracts",
    teams: "teams",
    staff: "staff",
    clubs: "clubs",
    nations: "nations",
    officials: "officials",
  } satisfies Record<CheckKey, string>,

  /** New versions: the notice under the masthead, Relaunch to update at the foot of the window, and Check for Updates. */
  update: {
    /** In the colophon once a newer version is installed, which the app does in the background, without asking. */
    relaunch: "Relaunch to update",
    /** The headline where this copy cannot install it itself (see `can_self_update`), or installing failed. */
    available: (version: string) => `FM Lens ${version} is available`,
    /** Opens the release's page in the browser. */
    download: "Download",
    installFailed: (reason: string) => `Couldn't update: ${reason}. Download it instead.`,
    /** Hides the notice until the app starts again. */
    later: "Later",
    /**
     * In the app menu on macOS, under About FM Lens, and in Settings, About, on Windows: looks for a newer version at
     * once.
     */
    checkForUpdates: "Check for Updates…",
    checking: "Checking for updates…",
    upToDate: "FM Lens is up to date.",
    /** Offline, or the releases could not be read. */
    checkFailed: "Couldn't check for updates.",
    /** After an update, once: the headline of the notice that lists what this version brought (see `changes`). */
    whatsNew: (version: string) => `What's new in FM Lens ${version}`,
    /** Opens this version's release notes in the browser. */
    releaseNotes: "Release notes",
    dismiss: "Dismiss",
    /**
     * What each version brought, as the notice lists it after an update; a version not listed here shows no notice.
     * Releasing adds the new version, in every language (see docs/DEVELOPING.md).
     */
    changes: {
      "0.7.4": [
        "Share a card of any player from the profile: a Post or a Story, to copy or save.",
        "The Contract tab shows a player's base transfer value.",
        "Long careers stay editable: players born after 2020 no longer lock players and staff.",
        "Set a date of birth up to the game's date.",
        "Report a problem sends the checks that did not pass.",
        "FM Lens asks for your email once on each computer.",
      ],
      "0.7.3": ["Works with FM27 27.0.1, the game's first patch: every edit and action is back."],
      "0.7.2": ["On Windows, Transfer, Swap and Loan no longer fail with a LoadLibraryW error."],
      "0.7.1": [
        "Young signings join your senior squad, not the U21s.",
        "Type dates as digits, or pick them from a new calendar that follows the game's date.",
        "Work permit reads Not needed where FM would give none.",
        "Max attributes raises CA and PA to 200.",
        "Changes names squad actions, like Lift bans.",
        "In a profile, Edit reads Done while you edit.",
      ],
      "0.7.0": [
        "Transfer, Swap and Release go through FM itself: real transfers, with fees and transfer history.",
        "Intel Macs get every action that runs inside FM.",
        "On Windows, see and close a player's promises in the Mood tab.",
        "FM's own names for promises, formations and reasons for unhappiness, never numbers.",
        "See every search result, and filter every list.",
        "Freezes hold through long holidays.",
      ],
      "0.6.2": [
        "FM Lens is now on Windows. Download it from getfmlens.com.",
        "On Windows, updates download in the background and install when you press Relaunch to update.",
        "On Windows, Check for Updates is in Settings, About.",
        "Only one FM Lens runs at a time: opening it again brings its window to the front.",
      ],
      "0.6.1": [
        "A new player profile: tabs for Attributes, Mood, Contract, Medical and Career, and status chips under the name that open them.",
        "Settings opens in its own window from the gear or Cmd+,.",
        "Every list has Filters, with a chip for each filter in effect that you can remove.",
        "FM’s own names for staff jobs, Youth Candidates and jadedness, where FM Lens showed numbers.",
        "The Sign dialog warns you when signing a player cancels a move he has agreed.",
      ],
      "0.6.0": [
        "FM Lens updates keep using the helper already running in FM. Supported features keep working without restarting the game.",
        "An older helper may not refresh FM’s screens immediately or support a newly added action. It updates the next time you start FM.",
        "Squad actions and profile tools are easier to find.",
      ],
      "0.5.11": [
        "Likes and dislikes: replace a club or person with another.",
        "If FM was open while FM Lens updated, editing stays off until you restart FM from Steam.",
        "Report files stay private until you send the report, and CSV exports no longer run formulas.",
        "FM Lens now counts anonymous usage, with no names or values from your save. Turn it off in Settings.",
      ],
      "0.5.10": [
        "On Intel Macs, every successful Apply and Undo now asks FM to refresh the edited record and active screens without pressing Continue.",
        "Restart FM once after updating to load the new helper.",
      ],
      "0.5.9": [
        "Report a problem takes screenshots and a video: attach, paste or drop them.",
        "Undo and closing a promise stop if FM has changed it since. A formation FM Lens can't name stays as it is.",
      ],
      "0.5.8": [
        "On Apple Silicon, every successful Apply and Undo asks FM to refresh the edited record and active screens without pressing Continue.",
        "Restart FM once after updating to load the new helper.",
      ],
      "0.5.7": [
        "On Apple Silicon, Apply and Undo refresh FM’s attributes and contract expiry header without pressing Continue.",
        "Restart FM once after updating to load the new helper.",
      ],
      "0.5.6": [
        "Report a problem opens in FM Lens, at the foot of the window. Say what happened and press Send.",
        "Check for Updates… is in the FM Lens menu.",
        "Shorter, plainer text across the app, the move dialogs included.",
      ],
      "0.5.5": [
        "Transfer players out of your own club. FM makes the transfer and moves the fee.",
      ],
      "0.5.4": [
        "Change how long an injury lasts, or take one injury out.",
        "See and change a manager's formations in and out of possession.",
        "See and change a nation's style ratings.",
        "See a competition's rules.",
        "See a player's promises, and close an open one.",
        "Change club: become the manager of another club.",
      ],
      "0.5.3": [
        "Files, settings and the Steam helper now use the FM Lens name. Your setup carried over.",
      ],
      "0.5.2": [
        "Report a problem, in Settings, opens a bug report with your versions and changes filled in.",
        "When FM moves its data, FM Lens reads the game again by itself: no more pressing Reload.",
        "Updates install in the background. Press Relaunch to update, at the foot of the window, when it suits you.",
      ],
    } as Record<string, readonly string[]>,
  },

  /** Editing a person or a club: the Edit button, the inputs, and the footer under the profile. */
  edit: {
    /** The tooltip on a value FM Lens wrote and read back. */
    appliedTitle: "Applied",
    /** A nation field's value whose name the app has not read: one no one in the lists belongs to. */
    unknownNation: "Unknown nation",
    /** The button in the header of a profile that can be edited. */
    edit: "Edit",
    editTitle: "Edit this profile",
    /** Why editing did not start: the field table or the values could not be read. */
    startFailed: (reason: string) => `Couldn't start editing: ${reason}`,
    /** The name of a position's field, e.g. "ST rating"; `position` is its entry in `positions`. */
    positionRating: (position: string) => `${position} rating`,
    /** A women's style rating in the Changes view, e.g. "Women's tempo". */
    womenStyle: (style: string) => `Women's ${style.toLowerCase()}`,
    /** Hover text of a changed input: the value it started from, as shown. */
    was: (value: string) => `was ${value}`,
    /** Hover text of an input that cannot be applied; `min` and `max` are the values it takes, as shown. */
    invalid: (min: number, max: number) => `Enter a whole number from ${min} to ${max}`,
    /** The least and the most an input takes, as shown, beside it while editing. */
    least: (value: string) => `Min: ${value}`,
    most: (value: string) => `Max: ${value}`,
    /** The same for a date input; `from` and `to` are the earliest and the latest date it takes, as dates are shown. */
    invalidDate: (from: string, to: string) => `Enter a date from ${from} to ${to}`,
    /** A date input: the letters that stand for its parts while it is empty, and the name of its calendar button. */
    dateParts: { day: "dd", month: "mm", year: "yyyy" },
    pickDate: "Calendar",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    previousYear: "Previous year",
    nextYear: "Next year",
    /**
     * The same for an amount of money, in whole units of the chosen currency; `from` and `to` are the least and the
     * most it takes, as amounts are shown.
     */
    wageDisplay: (amount: string) => `FM may display about ${amount} p/w; the entered amount will be saved.`,
    invalidMoney: (from: string, to: string) => `Enter a whole amount from ${from} to ${to}`,
    /** The same for a percentage, in whole percent; `from` and `to` are the least and the most it takes, as shown. */
    invalidPercentage: (from: string, to: string) => `Enter a whole percentage from ${from} to ${to}`,
    /** The same for a number with up to two decimal places, such as FIFA points; `from` and `to` as shown. */
    invalidDecimal: (from: string, to: string) => `Enter a number with up to two decimal places from ${from} to ${to}`,
    /** After the input of a percentage: the game shows energy and match sharpness as 0–100%. */
    percent: "%",
    /** The two values of a yes-or-no field, as the lists of changes and the hover text of its checkbox say them. */
    yes: "Yes",
    no: "No",
    /**
     * What an input that may be left empty reads as then, in its hint, the hover text and the lists of changes:
     * "Squad number 20 → none". The profile itself shows a dash for it (`profile.none`).
     */
    none: "none",

    // The footer
    footer: "Editing",
    changes: changeCount,
    /** After the number of changes, while some inputs hold values that cannot be applied. */
    invalidCount: (count: number) => `${count} invalid`,
    /** Opens the list of the changes Apply would write. */
    review: "Review",
    reviewList: "Changes to apply",
    /** Puts the inputs back to the values the game has. */
    discard: "Discard",
    apply: "Apply",
    applying: "Applying…",
    /** Hover text of Apply while an input holds a value that cannot be written. */
    applyBlocked: "Fix the invalid values first",
    /** Leaves edit mode. */
    done: "Done",
    /** Takes the place of the buttons when leaving (Done, close, another row) would lose `count` changes. */
    confirmDiscard: (count: number) => `Discard ${changeCount(count)}?`,
    keepEditing: "Keep editing",

    // After Apply
    /** FM shows written values once it moves on, so the message says how to see them. */
    applied: (count: number) =>
      `${changeCount(count)} applied.`,
    /** Every value asked for was the game's already. */
    nothingToChange: "Nothing to change. FM already has these values.",
    /** A change the game refused; `label` is the field's name (see `fieldLabel`) and `reason` the game's answer. */
    refused: (label: string, reason: string) => `${label}: ${reason}`,
    rereadFailed: (reason: string) => `Couldn't check the new values: ${reason}`,
    dismiss: "Dismiss",
  },

  /** The Changes view: what was written to the game this session. */
  changes: {
    /** The entry in the sidebar. */
    nav: "Changes",
    title: "Changes this session",
    /** Under a move to another club that was a swap: the player who went the other way. */
    swappedWith: (name: string) => `Swapped with ${name}`,
    /** Under a transfer that had a fee: the amount, written out. */
    fee: (amount: string) => `Fee ${amount}`,
    /** Under a signing the game makes on a later day: that day. */
    joins: (date: string) => `Joins ${date}`,
    /** What a heal changed, in the place of its values: `count` is how many injuries the player had. */
    healed: (count: number) => (count === 1 ? "Healed 1 injury" : `Healed ${format(count)} injuries`),
    /** What adding an injury changed, in the place of its values. */
    injuryAdded: "Added an injury",
    /** The same for lifting bans: `count` is how many bans the player had. */
    lifted: (count: number) => (count === 1 ? "Lifted 1 ban" : `Lifted ${format(count)} bans`),
    /** What closing a promise changed, in the place of its values: `id` is FM's number for it. */
    promiseClosed: (name: string) => `Closed promise: ${name}`,
    /** What keeping a player from retiring changed: the date he was to retire on, or none when only his traits changed. */
    keptPlaying: (date: string | null) => (date === null ? "Will play on" : `Retirement on ${date} prevented`),
    /** The line beside the title; `undone` of the `total` changes were undone. */
    count: (total: number, undone: number) => {
      const count = changeCount(total);
      return undone === 0 ? count : `${count} · ${undone} undone`;
    },
    empty: "No changes yet.",
    columns: {
      time: "Time",
      /** The player, member of staff or club the change was made to. */
      name: "Name",
      field: "Field",
      change: "Change",
      status: "Status",
    },
    /** The small tag after a name. */
    kinds: { player: "Player", staff: "Staff", club: "Club", nation: "Nation", official: "Official" } satisfies Record<Entity, string>,
    /** Hover text of a change of an attribute: the values as stored; `change` is from `valueChange`. */
    stored: (change: string) => `stored ${change}`,
    undone: (time: string) => `Undone at ${time}`,
    /** A change made before FM was closed or loaded a save: it can no longer be undone. */
    earlierGame: "Earlier game",
    undo: "Undo",
    /** Hover text of Undo; `label` is the field's name. */
    undoTitle: (label: string) => `Put ${label} back to its old value`,
    /** The small tag after the fields a mass edit changed: a mass edit is one row of the list. */
    batch: "Mass edit",
    /** Under those fields: how many changes the mass edit made, and how many of them are not undone. */
    batchCount: (total: number, remaining: number) =>
      remaining === 0
        ? `${changeCount(total)} · all undone`
        : `${changeCount(total)} · ${format(remaining)} not undone`,
    /** Opens the list of the changes of a mass edit under its row, and closes it again. */
    showChanges: "Show changes",
    hideChanges: "Hide changes",
    /** Undoes the whole mass edit. */
    undoBatch: "Undo mass edit",
    /** Undoes a whole team action from a squad. */
    undoAll: "Undo all",
    /** Hover text of Undo mass edit; `remaining` is how many of its changes are not undone yet. */
    undoBatchTitle: (remaining: number) =>
      `Put back the old values (${format(remaining)} still changed)`,

    // Pages: the list, and the changes of a mass edit that is open, are shown a page at a time.
    /** The names of the two groups of buttons for assistive technology. */
    pages: "Pages of the list",
    batchPages: "Pages of the changes of this mass edit",
    previous: "Previous",
    next: "Next",
    /** Between the buttons: the rows on show and how many there are, e.g. "101–200 of 450". */
    range: (first: number, last: number, total: number) => `${format(first)}–${format(last)} of ${format(total)}`,
  },

  /** Exporting players to a file: the button in the toolbar of the player list and the dialog it opens. */
  export: {
    button: "Export",
    buttonTitle: "Export to CSV or JSON",
    title: "Export players",
    /** What the export covers: everything the list's search and filters select, in its order. */
    scope: (count: number) => (count === 0 ? "No players match your search and filters." : entityCount.player(count)),
    formatLabel: "Format",
    formats: {
      csv: "CSV, comma-separated",
      csvSemicolon: "CSV, semicolon-separated",
      json: "JSON",
    } satisfies Record<ExportFormat, string>,
    contents: "Money is in pounds.",
    export: "Export",
    exporting: "Exporting…",
    /** After the export: what was written, and where. */
    done: (count: number, file: string) => `Exported ${entityCount.player(count)} to ${file}`,
    folder: (folder: string) => `in ${folder}`,
    skipped: (count: number) =>
      `${entityCount.player(count)} changed in FM during the export and ${count === 1 ? "was" : "were"} left out.`,
    open: "Open",
    openTitle: "Open the file",
    show: "Show in folder",
    showTitle: "Show the file in its folder",
    close: "Close",
  },

  /** Sharing a card of a player: the button in his profile and the dialog it opens. */
  share: {
    button: "Share",
    buttonTitle: "Share a card of this player",
    title: "Share card",
    formatLabel: "Size",
    formats: { post: "Post", story: "Story" } satisfies Record<CardFormat, string>,
    showAbility: "Show CA and PA",
    preview: (name: string) => `Card of ${name}`,
    drawFailed: "Could not draw the card.",
    copyImage: "Copy image",
    copied: "Image copied",
    copyFailed: "Could not copy to the clipboard.",
    save: "Save PNG",
    saved: (file: string) => `Saved ${file}`,
    show: "Show in folder",
    copyCaption: "Copy caption",
    captionCopied: "Caption copied",
    close: "Close",
    // On the card
    age: (age: number) => `Age ${age}`,
    value: "Value",
    wage: "Wage",
    perWeek: "p/w",
    footer: "Scouted with FM Lens · getfmlens.com",
    /** The caption, before "#FM27" and the link; `young` for players up to 21. */
    caption: (young: boolean): string => (young ? "Found this wonderkid in my FM27 save" : "Found this player in my FM27 save"),
  },

  /** Mass editing: the button in the toolbar of a list and the dialog it opens. */
  massEdit: {
    /** The button in the toolbar of the player, staff and club lists. */
    button: "Mass edit",
    buttonTitle: "Edit everyone in the list",
    title: {
      player: "Mass edit players",
      staff: "Mass edit staff",
      club: "Mass edit clubs",
    } satisfies Record<MassEntity, string>,

    // What it applies to
    /** `total` is the list's: the search and the filters of the list select them. */
    scope: (entity: MassEntity, total: number) =>
      `All ${entityCount[entity](total)} in the list`,
    scopeNone: (entity: MassEntity) =>
      `No ${entityNouns[entity]} match your search and filters.`,
    /** `limit` is the most one mass edit takes. */
    scopeTooMany: (entity: MassEntity, total: number, limit: number) =>
      `That's ${entityCount[entity](total)}, but one mass edit takes up to ${format(limit)}. ` +
      "Narrow your search or filters.",
    loadingFields: "Loading fields…",
    fieldsFailed: (reason: string) => `Couldn't load the fields: ${reason}`,

    // The fields to change
    /** The groups of the field select, in the order the dialog lists them. */
    groups: {
      ability: "Ability",
      technical: "Technical attributes",
      mental: "Mental attributes",
      physical: "Physical attributes",
      goalkeeping: "Goalkeeping attributes",
      hidden: "Hidden attributes",
      feet: "Feet",
      coaching: "Coaching attributes",
      knowledge: "Knowledge attributes",
      medical: "Medical attributes",
      positions: "Positions",
      personality: "Personality",
      reputation: "Reputation",
      international: "International",
      contract: "Contract",
      facilities: "Facilities",
      finances: "Finances",
      stadium: "Stadium",
      traits: "Traits",
      /** A player's energy, match sharpness and morale: the Medical group of his profile. */
      health: "Medical",
      /** Whatever the other groups do not have, e.g. a player's height. */
      other: "Other",
    },
    fieldsLabel: "Fields to change",
    /** The name of a row of the dialog for assistive technology; `position` counts from 1. */
    row: (position: number) => `Change ${position}`,
    field: "Field",
    operation: "Operation",
    operations: { set: "Set to", add: "Add", scale: "Scale to %" } satisfies Record<MassOperationKind["op"], string>,
    /** The name of the value input, by operation. */
    values: { set: "Value", add: "Amount", scale: "Percent" } satisfies Record<MassOperationKind["op"], string>,
    /** Hover text of the amount of an Add. */
    addTitle: "Use a negative number to subtract.",
    /** The same for a percentage: the amount is in percentage points, not a percent of the value (that is Scale). */
    addPointsTitle: "70% + 10 = 80%. Use a negative number to subtract.",
    /** The hint in an empty value input: what it takes. */
    rangeHint: (min: number, max: number) => `${format(min)}–${format(max)}`,
    /** The same for an amount, which may be negative: up to `max` either way. */
    amountHint: (max: number) => `±${format(max)}`,
    /** After the input of a Scale: the number is a percent of the value the game has now. */
    ofCurrent: "% of current",
    percentTitle: "100 keeps it, 50 halves it",
    /** Hover text of an amount that cannot be applied; `min` and `max` are what it takes. */
    invalidAdd: (min: number, max: number) => `Enter a whole number from ${format(min)} to ${format(max)}`,
    invalidPercent: (min: number, max: number) => `Enter a whole percent from ${min} to ${max}`,
    /** A date cannot be added to or scaled. */
    dateSetOnly: "A date can only be set",
    addField: "Add a field",
    /** Hover text of Add a field when the rows are full; `max` is how many fields one mass edit changes. */
    addFieldFull: (max: number) => `A mass edit changes up to ${max} fields`,
    remove: "Remove this field",
    /** Hover text of Remove on the only row. */
    removeLast: "A mass edit needs at least one field",

    // The preview
    preview: "Preview",
    previewing: "Previewing…",
    /** Beside Preview while it cannot be pressed. */
    previewBlocked: "Fill in every field to preview",
    /** "312 changes for 140 of 237 players · 97 already have these values · 12 values left alone". */
    summary: (entity: MassEntity, preview: MassPreview) =>
      [
        preview.changes === 0
          ? "No changes"
          : `${changeCount(preview.changes)} for ${format(preview.targets - preview.unchanged)} of ` +
            entityCount[entity](preview.targets),
        preview.unchanged > 0 &&
          (preview.unchanged === 1
            ? "1 already has these values"
            : `${format(preview.unchanged)} already have these values`),
        preview.skippedCount > 0 && valuesLeftAlone(preview.skippedCount),
      ]
        .filter(Boolean)
        .join(" · "),
    tableLabel: "Changes the mass edit would make",
    columns: { name: "Name", field: "Field", change: "Change", reason: "Reason" },
    /** Under a table or a list that shows only the first rows; `count` is how many more there are. */
    more: (count: number) => `and ${format(count)} more`,
    /** The line that opens the list of the values left alone. */
    skippedHeading: valuesLeftAlone,
    skippedLabel: "Values the mass edit leaves alone",

    // Apply and undo
    apply: "Apply",
    applying: "Applying…",
    /** Hover text of Apply; `changes` is how many values it writes. */
    applyTitle: (changes: number) => `Apply ${changeCount(changes).toLowerCase()}`,
    applyFirst: "Preview the mass edit first",
    applyNothing: "Nothing to apply",
    applied: (count: number) => (count === 0 ? "Nothing changed" : `${changeCount(count)} applied`),
    /** A change the game refused: who, which field (see `fieldLabel`) and the game's answer. */
    failure: (name: string, label: string, reason: string) => `${name} · ${label}: ${reason}`,
    undo: "Undo this mass edit",
    undoing: "Undoing…",
    undoTitle: "Put back the old values",
    undone: (count: number) => (count === 0 ? "Nothing was undone" : `Undid ${changeCount(count)}`),
    /** A change an undo could not take back: `who` names the person and the field, or the change by its number. */
    undoFailure: (who: string, reason: string) => `${who}: ${reason}`,
    changeNumber: (id: number) => `Change ${id}`,
    close: "Close",
  },

  /** Comparing players: the button in a player's profile, the tray under the player list and the dialog. */
  comparison: {
    /** The button in the header of a player's profile. */
    compare: "Compare",
    /** Hover text of that button while the player is not in the comparison, and while they are. */
    add: "Add to comparison",
    remove: "Remove from comparison",
    /** Hover text of the button while the comparison is full and cannot take this player; `max` is its size. */
    full: (max: number) => `You can compare up to ${max} players. Remove one first.`,

    // The tray under the player list
    trayLabel: "Players to compare",
    /** The name and hover text of the × on a player's chip. */
    removePlayer: (name: string) => `Remove from comparison: ${name}`,
    clear: "Clear",
    /** The button that opens the dialog; `count` is how many players are picked. */
    open: (count: number) => `Compare (${count})`,

    // The dialog
    title: "Comparison",
    /** What the dialog says when fewer than two players are picked. */
    tooFew: "Add at least two players to compare them.",
    loading: "Loading players…",
    tableLabel: "Values of the compared players",
    /** Said after the highlighted value of a row, for assistive technology. */
    highest: "highest",
    lowest: "lowest",
    /** The heading of the rows with the positions, height, reputation and contract. */
    profile: "Profile",
    close: "Close",
  },

  /**
   * Moving a player to another club, or swapping him with a player of another club: the button in his profile and the
   * dialog it opens.
   */
  move: {
    /** The button in the header of a player's profile. */
    button: "Transfer",
    buttonTitle: "Transfer, swap or loan him",

    // The dialog
    title: "Transfer",
    /** The club the player is at, and the club he moves to (or, in a swap, goes to). */
    from: "From",
    to: "To",

    // The switch at the top of the dialog: a move to a club, a swap with one of its players, or a loan.
    /** Its name for assistive technology. */
    modeLabel: "Kind of move",
    modeMove: "Transfer to a club",
    modeSwap: "Swap with a player",
    modeLoan: "Loan to a club",

    // Choosing the club
    /** The name of the search box, and of the list of clubs under it, for assistive technology. */
    searchLabel: "Search for the club to transfer to",
    resultsLabel: "Clubs found",
    searching: "Searching clubs…",
    searchFailed: (reason: string) => `Couldn't search clubs: ${reason}`,
    /** Under the list when the search found more clubs than it lists; `count` is how many more. */
    more: (count: number) => `and ${format(count)} more`,
    /** Takes the place of the search once a club is picked: the button that brings it back. */
    change: "Choose another club",

    // The fee
    feeHeading: "Fee",
    fee: "Transfer fee",
    /** `max` is the most a fee can be, as amounts are shown. */
    feeInvalid: (max: string) => `Enter a whole amount from 0 to ${max}`,
    /**
     * What the fee does to the clubs' money, a line each in the plan. `fee` is the amount, `balance` and `budget` a
     * change written out ("£9,492,232 → £10,726,799"); `budget` is null when the club has no transfer budget set.
     */
    pays: (club: string, fee: string, balance: string, budget: string | null) =>
      `${club} pays ${fee}: balance ${balance}${budget === null ? "" : `, transfer budget ${budget}`}`,
    receives: (club: string, fee: string, balance: string) => `${club} receives ${fee}: balance ${balance}`,
    /** For a transfer FM makes itself, which moves the money by its own rules. */
    gameFee: (buyer: string, seller: string, fee: string) => `${buyer} pays ${seller} ${fee}`,
    /** For a club outside the leagues being played, which the game keeps no finances for. */
    noFinances: (club: string) => `${club} has no finances in FM, so its money won't change`,

    // The contract
    /** Under an input that cannot be sent. */
    wageInvalid: "Enter a whole amount, 0 or more",
    expiresInvalid: "Enter a date",

    // What the dialog says about the move itself
    chooseClub: "Pick a club.",
    fixTerms: "Fix the fee or the contract values first.",
    checking: "Checking the transfer…",
    /** The move can be made; `from` and `to` are the names of the clubs. */
    route: (from: string, to: string) => `${from} → ${to}`,
    /** Under the route when FM makes the change itself, which nothing undoes. */
    permanent: "It can't be undone.",

    // Swapping with a player of the club instead: the title, and the section that picks the player (the club is
    // chosen as for a move).
    swapTitle: "Swap with a player",
    /** The player who goes the other way. */
    swapWith: "Swap with",
    /** The name of the search box of the club's players, its hint, and the name of the list under it. */
    playerSearchLabel: "Search for the player to swap with",
    playerSearch: "Search this club's players by name",
    playersLabel: "Players found",
    playersSearching: "Searching players…",
    playersSearchFailed: (reason: string) => `Couldn't search players: ${reason}`,
    /** Under the list when it is empty: `query` is what was typed. */
    playersEmpty: (query: string) =>
      query === "" ? "This club has no players." : `No players here match “${query}”.`,
    /** Takes the place of the list once a player is picked: the button that brings it back. */
    changePlayer: "Choose another player",

    // What the dialog says about the swap
    /** A swap has no contract terms to set. */
    swapContract: "Both keep their contracts.",
    // Moving a member of staff, who has neither a fee nor terms to set, and no swap.
    staffButtonTitle: "Move them to another club",
    staffChooseClub: "Pick a club.",
    staffContract: "Same job and contract.",
    // Making the human manager another club's manager: the game makes his contract and dismisses the club's manager.
    managerButton: "Change club",
    managerButtonTitle: "Become the manager of another club",
    managerTitle: "Change club",
    managerContract: "The game gives you a manager's contract on its own terms.",
    /** In the plan, under the clubs: `name` is the club's manager now. */
    managerDisplaced: (name: string) => `${name} loses his job`,
    managerMove: "Change club",
    managerMoving: "Changing club…",
    swapChooseClub: "Pick the other player's club.",
    swapChoosePlayer: "Pick the player to swap with.",
    swapChecking: "Checking the swap…",
    /** The swap can be made: who goes where, a line each. `from` is the club of the player, `to` that of the other. */
    swapRoute: (player: string, from: string, to: string, other: string) =>
      `${player}: ${from} → ${to}\n${other}: ${to} → ${from}`,

    // The foot
    move: "Transfer",
    moving: "Transferring…",
    cancel: "Cancel",
    swap: "Swap",
    swapping: "Swapping…",
    // Loaning him to a club instead: FM starts the loan itself (where this version allows it).
    loanTitle: "Loan",
    loanChooseClub: "Pick the club to loan him to.",
    loanEndsAfterToday: "Pick a date after today",
    joinsFromToday: "Pick today or a later date",
    loan: "Loan",
    loaning: "Loaning…",
    // Signing a free agent for a club: FM signs him itself (where this version allows it).
    signButton: "Sign",
    signButtonTitle: "Sign him for a club",
    signTitle: "Sign",
    signChooseClub: "Pick the club to sign him for.",
    sign: "Sign",
    signing: "Signing…",
    /** Under the terms when he has a move FM agreed for a later day: signing him replaces it. */
    replacesMove: (club: string, date: string) => `Replaces his move to ${club} on ${date}`,
  },

  /**
   * A player's ties to nations and clubs: their secondary nationalities, and the nations and clubs they were trained
   * in, which decide whether they count as homegrown under a competition's rules. The group in the profile and its
   * dialog.
   */
  ties: {
    heading: "Nationality and homegrown",
    nationalities: "Secondary nationalities",
    trainedInNation: "Trained in nation",
    trainedAtClub: "Trained at club",
    none: "None",
    /** The game's names of its homegrown rules, by code; `rule` names one it has no name for here. */
    rules: {
      1: "Homegrown 15-21",
      2: "Homegrown 0-21",
      5: "Homegrown 15-21 (excluding loans)",
      10: "Homegrown 0-19 (1 year)",
    } as Readonly<Record<number, string>>,
    rule: (code: number) => `Homegrown rule ${format(code)}`,

    // The button under the group, and the dialog it opens
    change: "Change",
    changeTitle: "Change his other nationalities and homegrown status",
    title: "Nationality and homegrown",
    hint: "Changes go into FM straight away.",
    /** When the player's list has no room for another tie. */
    full: "His list is full, so nothing can be added.",
    /** The control of a row, for assistive technology: `name` is the nation's or club's. */
    nationOf: (name: string) => `Nation instead of ${name}`,
    ruleOf: (name: string) => `Homegrown rule for ${name}`,
    remove: "Remove",
    removeTitle: (name: string) => `Remove ${name}`,
    /** The rows that add a tie, where the list has room. */
    addNationality: "Add a nationality…",
    addNation: "Add a nation…",
    newRule: "Homegrown rule of the new nation",
    add: "Add",
    working: "Saving…",
    close: "Close",
  },

  /** Changing a player's or member of staff's likes and dislikes, and languages: the button under each, and its dialog. */
  lists: {
    likesTitle: "Change the people and clubs he likes and dislikes",
    /** The strength input of a row, for assistive technology: `name` is the person's or club's. */
    strengthOf: (name: string) => `Strength for ${name}`,
    languagesTitle: "Change how well he speaks each language",
    /** The level input of a row, for assistive technology: `name` is the language's. */
    levelOf: (name: string) => `Level of ${name}`,
    /** Under a main language of the country his club is in, which FM raises back if it is set lower. */
    raisedBack: "FM raises it back on its own",
    injuriesTitle: "Change how many days each injury lasts",
    /** The title of the dialog that changes them. */
    daysOut: "Days out",
    /** The days input of a row, for assistive technology: `name` is the injury's. */
    daysOf: (name: string) => `Days out with ${name}`,
    save: "Save",
    /** Points a like or dislike at another club or person. */
    replace: "Replace",
    replaceTitle: (name: string) => `Replace ${name}`,
    /** Over the search that finds the club or person to put in place of `name`. */
    insteadOf: (name: string) => `Instead of ${name}`,
    searchClubs: "Search clubs",
    searchPeople: "Search players and staff",
    searching: "Searching…",
    searchFailed: (reason: string) => `Couldn't search: ${reason}`,
    noMatch: (query: string) => (query === "" ? "None found." : `Nothing matches “${query}”.`),
    /** Leaves the search for the list. */
    back: "Back",
  },

  /** Changing a contract's bonuses and clauses: the button under them in the profile, and the dialog it opens. */
  clauses: {
    change: "Change",
    changeTitle: "Change his bonuses and clauses",
    title: "Bonuses and clauses",
    hint: "Changes go into FM straight away.",
    /** When the contract has no release clause and its list has no room for one. */
    full: "No room for a release clause in this contract.",
    /** The inputs of a row, for assistive technology: `name` is the clause's. */
    amountOf: (name: string) => `Amount of ${name}`,
    conditionOf: (name: string) => `Condition of ${name}`,
    save: "Save",
    remove: "Remove",
    removeTitle: (name: string) => `Remove ${name}`,
    /** The row that adds a release clause, where the list has room and the contract has none. */
    addRelease: "Add a release clause",
    releaseAmount: "Amount of the new release clause",
    add: "Add",
    /** When an amount or condition typed is not a whole number in range: `max` is the most it may be. */
    /** `max` is written out already: an amount as amounts are shown, or a number. */
    outOfRange: (max: string) => `Enter a whole number from 0 to ${max}.`,
    working: "Saving…",
    close: "Close",
  },

  /** Copying a player onto others, and saved player templates: the button in the player list and its dialog. */
  templates: {
    button: "Clone & templates",
    title: "Clone & templates",
    groups: {
      ability: "CA / PA",
      attributes: "Attributes (hidden ones too)",
      personality: "Personality",
      positions: "Positions",
      traits: "Traits",
    },
    copyHeading: "Copy from a player",
    findPlayer: "Find player",
    found: "Players found",
    freeAgent: "Free agent",
    capture: (name: string | null) => (name ? `Copy ${name}` : "Copy player"),
    libraryHeading: "Saved templates",
    library: "Template",
    choose: "Choose a template",
    noneSaved: "No saved templates",
    name: "Name",
    save: "Save",
    remove: "Delete",
    fieldCount: (count: number) => (count === 1 ? "1 field" : `${format(count)} fields`),
    jsonHeading: "Import or export JSON",
    json: "Template JSON",
    loadJson: "Load JSON",
    showJson: "Show JSON",
    importFile: "Import file",
    applyHeading: (total: number, query: string) =>
      `Apply to ${entityCount.player(total)}${query ? ` matching “${query}”` : ""}`,
    limit: "Only these player IDs",
    limitPlaceholder: "All of them",
    preview: "Preview",
    previewLabel: "Template preview",
    summary: (targets: number, changes: number, skipped: number, unchanged: number) =>
      `${entityCount.player(targets)} · ${changeCount(changes)} · ${format(skipped)} skipped · ` +
      `${format(unchanged)} already set`,
    tableLabel: "Changes to apply",
    columns: { player: "Player", uid: "ID", field: "Field", change: "Change" },
    firstRows: (count: number) => `Showing the first ${format(count)} changes.`,
    skipped: "Skipped",
    apply: (count: number) => (count === 0 ? "Apply" : `Apply ${changeCount(count).toLowerCase()}`),
    applied: (count: number) => (count === 0 ? "Nothing changed." : `${changeCount(count)} applied.`),
    undo: "Undo",
    undone: (count: number) => (count === 0 ? "Nothing was undone." : `Undid ${changeCount(count).toLowerCase()}.`),
    working: "Working…",
    close: "Close",
    savedNotice: "Template saved.",
    loadedNotice: "Template loaded. Save it to keep it.",
    removedNotice: "Template deleted.",
    nameTaken: "A template with this name already exists. Pick another name.",
    libraryFull: (max: number) => `You can keep up to ${max} templates. Delete one first.`,
    tooBig: "Template files must be under 128 KB.",
    invalid: "That isn't an FM Lens player template.",
    badIds: "Enter player IDs separated by commas or spaces.",
  },

  /** Report a problem: the dialog the button at the foot of the window opens. Nothing is sent until Send. */
  report: {
    title: "Report a problem",
    what: "What happened?",
    /** Reports are filed where anyone can read them, with the app's version, FM's build, macOS and the recent changes. */
    sentWith: "Posted publicly, with your versions and recent changes.",
    attach: "Attach",
    /** The list of screenshots and videos to send. */
    files: "Files",
    video: "Video",
    remove: (name: string) => `Remove ${name}`,
    fileProblem: {
      type: "Only images and MP4 or MOV videos.",
      count: "Up to 5 images and 1 video.",
      size: "Images up to 10\u00a0MB, videos up to 50\u00a0MB.",
    },
    send: "Send",
    sending: "Sending…",
    cancel: "Cancel",
    sent: "Sent. Thanks.",
    close: "Close",
    tooMany: "Too many reports from here. Try again in an hour.",
    failed: "Couldn't send it. Try again later.",
  },

  /** Releasing a player from their club, which leaves them a free agent: the button beside Transfer and its dialog. */
  release: {
    /** The button in the header of a player's profile, beside Transfer. */
    button: "Release",
    buttonTitle: "Release him. He becomes a free agent.",

    // The dialog
    title: "Release",
    /** The club the player leaves. */
    from: "Leaves",
    checking: "Checking the release…",
    /** The player can be released; `club` is the name of their club. */
    ready: (club: string) => `${club} → free agent`,

    // The foot
    release: "Release",
    releasing: "Releasing…",
    cancel: "Cancel",
  },

  /** Ending a player's loan early: the button beside Transfer and Release on a loaned player's profile, and its dialog. */
  endLoan: {
    button: "End loan",
    buttonTitle: "He goes back to his club.",

    // The dialog
    title: "End loan",
    /** The club the player is on loan at. */
    from: "On loan at",
    checking: "Checking the loan…",
    /** The loan can be ended; `from` is the club he is loaned to and `to` his own. */
    ready: (from: string, to: string) => `${from} → ${to}`,

    // The foot
    end: "End loan",
    ending: "Ending…",
    cancel: "Cancel",
  },

  /** Cancelling the moves FM agreed for a player on a later day: the button beside Transfer, and its dialog. */
  cancelTransfer: {
    button: "Cancel transfer",
    buttonTitle: "Cancel the move FM agreed for a later day.",

    // The dialog
    title: "Cancel transfer",
    /** The club the player was to join. */
    from: "Joins",
    checking: "Checking the transfer…",
    /** The transfer can be cancelled; `dates` are the days he was to join on. */
    ready: (dates: string) => `Due ${dates}`,

    // The foot
    hint: "It can't be undone.",
    confirm: "Cancel transfer",
    cancelling: "Cancelling…",
    cancel: "Keep it",
  },

  /**
   * A club's squad: the tab of the club profile that lists the players of each of its teams, with the actions on a
   * whole team and the captains.
   */
  squad: {
    // The switch between the club's teams
    /** The name of the switch for assistive technology. */
    teamsLabel: "Team",
    /**
     * The names of the teams (see `teamLabel` in labels.ts): the first team, a B team, a team with an age limit, your
     * club's youth candidates, and any other, which is named by its place in the club's list (`place` counts from 1, the first team being the
     * first).
     */
    teams: {
      first: "First team",
      b: "B team",
      age: (limit: number) => `U${limit}`,
      youth: "Youth Candidates",
      other: (place: number) => `Team ${place}`,
    },
    /** When the game lists no team for the club. */
    noTeams: "This club has no teams.",
    loading: "Loading squad…",
    /** The message under an empty table. */
    empty: "No players in this team.",

    // Above the table
    players: (count: number) => (count === 1 ? "1 player" : `${format(count)} players`),
    /** `age` is written out already, with one decimal. */
    averageAge: (age: string) => `average age ${age}`,
    /** `captain` and `viceCaptain` are names, or `profile.none` for nobody. */
    captains: (captain: string, viceCaptain: string) => `Captain: ${captain} · Vice-captain: ${viceCaptain}`,

    // The actions on the whole team
    /** The name of the group of buttons for assistive technology. */
    actionsLabel: "Actions on the whole team",
    /** Heal, Lift bans and Remove unhappiness carry how many players they are for; these name them after the count. */
    healAll: "Heal",
    injuredCount: (injured: number) => `${format(injured)} injured`,
    healAllTitle: "Heal everyone in this team",
    /** Hover text of Heal while nobody in the team is injured. */
    healNone: "Nobody in this team is injured",
    liftAll: "Lift bans",
    bannedCount: (banned: number) => `${format(banned)} banned`,
    liftAllTitle: "Lift every ban in this team",
    /** Hover text of Lift bans while nobody in the team is banned. */
    liftNone: "Nobody in this team is banned",
    refreshAll: "Refresh fitness",
    refreshAllTitle: "Full energy, full match sharpness and fully rested for everyone",
    removeUnhappiness: "Remove unhappiness",
    /** `unhappy` is how many of the team's players have a reason to be unhappy that lasts. */
    unhappyCount: (unhappy: number) => `${format(unhappy)} unhappy`,
    removeUnhappinessTitle: "Clear every reason to be unhappy in this team",
    /** Hover text of Remove unhappiness while nobody in the team is unhappy. */
    unhappyNone: "Nobody in this team is unhappy",
    /** The name of the More menu for assistive technology. */
    moreLabel: "More actions on the whole team",
    maxMorale: "Max morale",
    maxMoraleTitle: "Everyone's morale to the top",
    maxCohesion: "Max cohesion",
    maxCohesionTitle: "Every player fully familiar with the club",
    /** The tag of an action that may not hold in every save. */
    maxTactics: "Max tactics",
    maxTacticsTitle: "Every player fully familiar with the team's tactic",
    maxAll: "Max attributes…",
    maxAllTitle:
      "Every attribute to 20 and CA and PA to 200 for everyone (injury proneness and dirtiness to 1)",
    /** What Max attributes asks first. */
    maxAllAsk: (count: number) => `Max every attribute of ${count === 1 ? "1 player" : `${format(count)} players`}?`,
    maxAllConfirm: "Max attributes",
    cancel: "Cancel",

    // What an action did, under the buttons
    /** `count` is how many values were written. */
    written: (count: number) => `${changeCount(count)} made`,
    /** A change the game refused: `name` is the player's, `reason` the game's answer (it names the value). */
    refused: (name: string, reason: string) => `${name}: ${reason}`,
    /** Takes back what the line beside it says was written. */
    undo: "Undo",
    undoTitle: "Put back the old values",

    // Captains
    /** The badges after the name of the captain and of the vice-captain; their hover texts are the roles' names. */
    captainShort: "C",
    viceCaptainShort: "VC",
    /** The menu button at the end of a row: its name for assistive technology (`name` is the player's), hover text. */
    menuLabel: (name: string) => `Captaincy of ${name}`,
    menuTitle: "Captaincy",
    makeCaptain: "Make captain",
    makeViceCaptain: "Make vice-captain",
    /** Who holds a role now: said after a change, and in the Changes view under a captaincy that moved the other. */
    nowCaptain: (name: string) => `${name} is now captain`,
    nowViceCaptain: (name: string) => `${name} is now vice-captain`,
    /** The same when there was nobody to take the role the new holder left, so that it stands empty. */
    noCaptain: "Nobody is captain now",
    noViceCaptain: "Nobody is vice-captain now",

    // The table
    /** The table's name for assistive technology; `team` is the name of the team. */
    tableLabel: (team: string) => `Players of ${team}`,
    columns: {
      name: "Name",
      position: "Pos",
      age: "Age",
      currentAbility: "CA",
      potentialAbility: "PA",
      condition: "Energy",
      matchSharpness: "Sharpness",
      jadedness: "Jaded.",
      morale: "Morale",
      /** The last column has no heading but this one, for assistive technology: it holds the captaincy menus. */
      actions: "Captaincy",
    } satisfies Record<SquadSort | "actions", string>,
    /** Hover text of a column header that sorts the table; `by` is a name from `sortNames`. */
    sortBy: (by: string) => `Sort by ${by}`,
    sortNames: {
      name: "name",
      position: "position",
      age: "age",
      currentAbility: "current ability",
      potentialAbility: "potential ability",
      condition: "energy",
      matchSharpness: "match sharpness",
      jadedness: "jadedness",
      morale: "morale",
    } satisfies Record<SquadSort, string>,

    // The tags after a name, with what each means as hover text
    injured: "Injured",
    /** `count` is how many injuries he has. */
    injuredTitle: (count: number) => (count === 1 ? "1 injury" : `${format(count)} injuries`),
    banned: "Banned",
    /** `count` is how many bans he has. */
    bannedTitle: (count: number) => (count === 1 ? "1 ban" : `${format(count)} bans`),
    onLoan: "On loan",
    onLoanTitle: "Out on loan to another club",
    loanee: "Loanee",
    loaneeTitle: "Here on loan from another club",
    elsewhere: "Elsewhere",
    elsewhereTitle: "Plays for another team of the club",
  },

  /** The game, as `describeGame` in `format.ts` names it. */
  game: {
    /** The game's name when its edition is not known: "FM27" otherwise. */
    name: "Football Manager",
    storefronts: {
      gamePass: "Game Pass",
      steam: "Steam",
      epic: "Epic Games",
      unknown: "Unknown store",
    } satisfies Record<Storefront, string>,
    /** Steam's build id of the install, e.g. `"build 26227640`". */
    steamBuild: (id: string) => `build ${id}`,
  },

  listFeedback: { failed: "Search failed", searching: "Searching…", retry: "Retry" },

  errors,
};

/** What a dictionary has to provide. */
export type Strings = typeof en;
