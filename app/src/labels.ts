// Text of the player and staff profiles. Keys of the game data map to the names FM uses; every
// other string of the panels is in `profileText`, and those of the staff list in `staffListText`.
// A translation only has to replace the values here.

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

/** The staff list. */
export const staffListText = {
  search: "Search staff by name or ID",
  summary: (total: number, shown: number) =>
    total > shown
      ? `${total.toLocaleString()} staff · showing the top ${shown} by current ability`
      : `${total.toLocaleString()} staff`,
  empty: (query: string) => `No staff match “${query}”.`,
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
};
