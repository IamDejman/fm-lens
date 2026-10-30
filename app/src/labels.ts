// Text of the player, staff and club profiles and lists. Keys of the game data map to the names FM uses;
// every other string of the panels is in `profileText` (those only the club panel has, in
// `clubProfileText`), and those of the player, staff and club lists in `playerListText`, `staffListText`
// and `clubListText`.
// A translation only has to replace the values here.

import type { PlayerSort } from "./types";

export const ATTRIBUTE_LABELS = {
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
} as const;

export type AttributeKey = keyof typeof ATTRIBUTE_LABELS;

export const STAFF_ATTRIBUTE_LABELS = {
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
} as const;

export type StaffAttributeKey = keyof typeof STAFF_ATTRIBUTE_LABELS;

export const PERSONALITY_LABELS = {
  adaptability: "Adaptability",
  ambition: "Ambition",
  loyalty: "Loyalty",
  pressure: "Pressure",
  professionalism: "Professionalism",
  sportsmanship: "Sportsmanship",
  temperament: "Temperament",
  controversy: "Controversy",
} as const;

export type PersonalityKey = keyof typeof PERSONALITY_LABELS;

export const POSITION_LABELS = {
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
} as const;

export type PositionKey = keyof typeof POSITION_LABELS;

export const CLUB_FACILITY_LABELS = {
  training: "Training",
  youth_facilities: "Youth Facilities",
  youth_coaching: "Youth Coaching",
  youth_recruitment: "Youth Recruitment",
  /** Only a club with finances has it. */
  corporate: "Corporate",
} as const;

export const SUPPORTER_TRAIT_LABELS = {
  loyalty: "Loyalty",
  passion: "Passion",
  patience: "Patience",
  affluence: "Affluence",
  temperament: "Temperament",
  expectations: "Expectations",
} as const;

/** The kinds of supporters, in the order of the supporter-mix bar. */
export const SUPPORTER_MIX_LABELS = {
  hardcore: "Hardcore",
  core: "Core",
  family: "Family",
  fair_weather: "Fair-weather",
  casual: "Casual",
  other: "Other",
} as const;

export type SupporterMixKey = keyof typeof SUPPORTER_MIX_LABELS;

const SQUAD_STATUSES: Partial<Record<number, string>> = {
  1: "Star player",
  2: "Important player",
  5: "Impact sub",
};

/** FM's job codes as stored in contracts. */
const JOB_LABELS: Partial<Record<number, string>> = {
  1: "Player",
  2: "Coach",
  4: "Chairperson",
  6: "Director",
  12: "Physio",
  14: "Scout",
  16: "Manager",
  20: "Assistant Coach",
  22: "Set Piece Coach",
  26: "Fitness Coach",
  34: "Goalkeeping Coach",
  40: "Head of Sports Science",
  44: "Chief Scout",
  48: "Sports Scientist",
  50: "Head Physio",
  58: "Recruitment Analyst",
  60: "Performance Analyst",
  64: "Head of Youth Development",
  70: "President",
  86: "Loan Manager",
  88: "Technical Director",
};

export const profileText = {
  close: "Close profile",
  loading: "Loading profile…",
  /** Shown where a value is missing. */
  none: "—",

  // Header
  freeAgent: "Free agent",
  born: "Born",
  height: (cm: number) => `${cm} cm`,
  uid: "UID",
  currentAbility: "Current ability",
  currentAbilityShort: "CA",
  potentialAbility: "Potential ability",
  potentialAbilityShort: "PA",

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
  wageNote: "stored in pounds; FM shows your chosen currency",
  signed: "Signed",
  expires: "Expires",
  joined: "Joined",
  squadStatus: "Squad status",
  squadStatusName: (status: number) => SQUAD_STATUSES[status] ?? `Status ${status}`,
  squadNumber: "Squad number",
  transferListed: "Transfer listed",
  loanListed: "Loan listed",

  // Career
  career: "Career",
  internationalCaps: "International caps",
  internationalGoals: "International goals",
  u21Caps: "U21 caps",
  u21Goals: "U21 goals",
  askingPrice: "Asking price",
  notSet: "Not set",
  reputation: "Reputation",
  reputationHome: "Home",
  reputationCurrent: "Current",
  reputationWorld: "World",

  // Staff
  /** Badge on the manager the user controls. */
  you: "You",
  youTitle: "The manager you control in this save",
  id: "ID",
  job: "Job",
  unemployed: "Unemployed",
  coaching: "Coaching",
  knowledge: "Knowledge",
  medical: "Medical",
  /** A coaching job held by someone who still plays. */
  playerCoach: (job: string) => `${job} (player-coach)`,
  unknownJob: (code: number) => `Job ${code}`,
};

/**
 * The name of a job code from a contract. An odd code above 1 is the player-coach variant of the
 * code below it. A person without a contract (`null`) has no job; codes the table does not know
 * are shown as they are.
 */
export function jobLabel(code: number | null): string {
  if (code === null) {
    return profileText.none;
  }
  const label = JOB_LABELS[code];
  if (label !== undefined) {
    return label;
  }
  const coach = code > 1 && code % 2 === 1 ? JOB_LABELS[code - 1] : undefined;
  return coach !== undefined ? profileText.playerCoach(coach) : profileText.unknownJob(code);
}

/**
 * The jobs the staff list can be filtered by, one entry each, in the order of their names. The odd codes
 * (player-coaches) are left out: a filter on a coaching job finds them too. So is "Player" (code 1), which
 * is no job of a member of staff and, with the next code added, would match the coaches.
 */
export const JOB_FILTER_OPTIONS: readonly { code: number; label: string }[] = Object.keys(JOB_LABELS)
  .map(Number)
  .filter((code) => code > 1)
  .map((code) => ({ code, label: jobLabel(code) }))
  .sort((a, b) => a.label.localeCompare(b.label));

/** The player list: search, filter bar and columns. */
export const playerListText = {
  search: "Search players by name or UID",
  /**
   * The line beside the search box. `sorted` is the order a column header was clicked for, or null while the
   * list is in its default order (best current ability first); its `by` is a name from `sortNames`.
   */
  summary: (total: number, shown: number, sorted: { by: string; ascending: boolean } | null) => {
    const count = `${total.toLocaleString()} players`;
    if (total <= shown) {
      return count;
    }
    return sorted === null
      ? `${count} · showing the top ${shown} by current ability`
      : `${count} · showing the first ${shown} by ${sorted.by}, ${sorted.ascending ? "ascending" : "descending"}`;
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
    uid: "UID",
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
  },
};

/** The staff list. */
export const staffListText = {
  search: "Search staff by name or ID",
  summary: (total: number, shown: number) =>
    total > shown
      ? `${total.toLocaleString()} staff · showing the top ${shown} by current ability`
      : `${total.toLocaleString()} staff`,
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
  },
};

/** The club profile: what the player and staff panels do not have. */
export const clubProfileText = {
  // Header
  womensClub: "Women's club",
  /** "Founded 1882", in the line under the name. */
  founded: (year: number) => `Founded ${year}`,
  reputationShort: "REP",
  reputationTitle: "Reputation",

  facilities: "Facilities",

  // Supporters
  supporters: "Supporters",
  supporterMix: "Supporter mix",
  /** A share of the supporters; `value` is already a percentage (35 for 35%). */
  percent: (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`,
  /** Hover text of a segment of the supporter-mix bar. */
  mixTooltip: (kind: string, percent: string) => `${kind} · ${percent}`,

  // Finances
  finances: "Finances",
  balance: "Balance",
  transferBudget: "Transfer budget",
  wageBudget: "Wage budget (spending)",
  totalWageBudget: "Total wage budget",
  ticketPrice: "Average ticket price",
  /** Under the labels of the two wage budgets, which are amounts per week. */
  perWeek: "per week",
  /** Clubs outside the leagues being played have no finance record in memory. */
  noFinances: "FM keeps finances only for clubs in the leagues being played.",

  // Club info
  info: "Club info",
  seasonTickets: "Season tickets",
  socialMedia: "Social media followers",
};

/** The club list, with the sidebar entry and the status-line count that go with it. */
export const clubListText = {
  /** The entry in the sidebar. */
  nav: "Clubs",
  /** In the status line, once connected. */
  count: (total: number) => `${total.toLocaleString()} clubs`,
  search: "Search clubs by name or UID",
  summary: (total: number, shown: number) =>
    total > shown
      ? `${total.toLocaleString()} clubs · showing the top ${shown} by reputation`
      : `${total.toLocaleString()} clubs`,
  /** The message under an empty table; `filtered` is whether a filter is in effect. */
  empty: (query: string, filtered: boolean) => {
    if (query === "") {
      return filtered ? "No clubs match this filter." : "No clubs found.";
    }
    return filtered ? `No clubs match “${query}” with this filter.` : `No clubs match “${query}”.`;
  },
  /** The small tag on a women's club. */
  women: "Women",
  columns: {
    name: "Name",
    reputation: "Reputation",
    founded: "Founded",
    uid: "UID",
  },
  filters: {
    /** The name of the select, which has no label of its own. */
    kind: "Clubs to show",
    all: "All clubs",
    men: "Men's clubs",
    women: "Women's clubs",
  },
};
