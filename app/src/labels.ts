// Text of the player profile. Keys of the game data map to the names FM uses; every other
// string of the panel is in `profileText`. A translation only has to replace the values here.

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
  /** Hover text of an attribute: the value as stored, 0–100. */
  raw: (raw: number) => `raw ${raw} / 100`,
  lowerIsBetter: "lower is better",

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
};
