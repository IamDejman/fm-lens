// Text of the player, staff and club profiles and lists. Keys of the game data map to the names FM uses;
// every other string of the panels is in `profileText` (those only the club panel has, in
// `clubProfileText`), and those of the player, staff and club lists in `playerListText`, `staffListText`
// and `clubListText`. Editing has `editText` (and `fieldLabel` for the names of the fields), the Changes
// view `changesText`, mass editing `massEditText`, and the sidebar `appText`.
// A translation only has to replace the values here.

import type { Entity, MassOperationKind, MassPreview, PlayerSort } from "./types";

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

/** The note at the foot of the sidebar; which one shows depends on the connection (see `ConnectionInfo.editable`). */
export const appText = {
  /** Connected, and the game was opened for writing. */
  noteEditable: "Edits reach the game only when you apply them. Back up your save first.",
  /** Connected, but Windows did not allow writing. */
  noteReadOnly: "Read-only: Windows did not let FMLibreEditor write to the game.",
  noteNotConnected: "Nothing in the game changes until you edit and apply.",
};

/** "No changes", "1 change", "3 changes", "12,345 changes". */
const changeCount = (count: number) =>
  count === 0 ? "No changes" : count === 1 ? "1 change" : `${count.toLocaleString()} changes`;

/** Editing a person or a club: the Edit button, the inputs, and the footer under the profile. */
export const editText = {
  /** The button in the header of a profile that can be edited. */
  edit: "Edit",
  editTitle: "Change this profile's values in the game",
  /** Why editing did not start: the field table or the values could not be read. */
  startFailed: (reason: string) => `Could not start editing: ${reason}`,
  /** The group of current and potential ability, above the attributes. */
  ability: "Ability",
  /** The grid of inputs under the pitch. */
  positionRatings: "Position ratings",
  /** The name of a position's field, e.g. "ST rating"; `position` is its entry in `POSITION_LABELS`. */
  positionRating: (position: string) => `${position} rating`,
  /** Hover text of a changed input: the value it started from, as shown. */
  was: (value: string) => `was ${value}`,
  /** Hover text of an input that cannot be applied; `min` and `max` are the values it takes, as shown. */
  invalid: (min: number, max: number) => `Enter a whole number from ${min} to ${max}`,
  /** The same for a date input; `from` and `to` are the earliest and the latest date it takes, as dates are shown. */
  invalidDate: (from: string, to: string) => `Enter a date from ${from} to ${to}`,
  /** The same for an amount of money, in whole pounds; `from` and `to` are the least and the most it takes. */
  invalidMoney: (from: string, to: string) => `Enter a whole number of pounds from ${from} to ${to}`,
  /** Before the input of an amount of money: the game stores pounds. */
  pounds: "£",

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
  applied: (count: number) => `Applied ${changeCount(count)}`,
  /** Every value asked for was the game's already. */
  nothingToChange: "Nothing to change: the game already has these values.",
  /** A change the game refused; `label` is the field's name (see `fieldLabel`) and `reason` the game's answer. */
  refused: (label: string, reason: string) => `${label}: ${reason}`,
  rereadFailed: (reason: string) => `Could not read the values back: ${reason}`,
  dismiss: "Dismiss",
};

/** The Changes view: what was written to the game this session. */
export const changesText = {
  /** The entry in the sidebar. */
  nav: "Changes",
  title: "Changes this session",
  hint: "Newest first. A change can be undone only while the game still holds the value it wrote.",
  /** The line beside the title; `undone` of the `total` changes were undone. */
  count: (total: number, undone: number) => {
    const count = changeCount(total);
    return undone === 0 ? count : `${count} · ${undone} undone`;
  },
  empty: "No changes yet. Open a player, a member of staff or a club and choose Edit, or use Mass edit in a list.",
  columns: {
    time: "Time",
    /** The player, member of staff or club the change was made to. */
    name: "Name",
    field: "Field",
    change: "Change",
    status: "Status",
  },
  /** The small tag after a name. */
  kinds: { player: "Player", staff: "Staff", club: "Club" } satisfies Record<Entity, string>,
  /** Hover text of a change of an attribute: the values as stored; `change` is from `valueChange`. */
  stored: (change: string) => `stored ${change}`,
  undone: (time: string) => `Undone at ${time}`,
  undo: "Undo",
  /** Hover text of Undo; `label` is the field's name. */
  undoTitle: (label: string) => `Write the old value of ${label} back to the game`,
  /** The small tag after the name of a change that was part of a mass edit. */
  batch: "Mass edit",
  /** Hover text of that tag; `count` is how many changes the mass edit made. */
  batchTitle: (count: number) => `Part of a mass edit of ${changeCount(count)}`,
  /** Undoes the whole mass edit; it sits on the newest change of the mass edit. */
  undoBatch: "Undo mass edit",
  /** Hover text of Undo mass edit; `remaining` is how many of its changes are not undone yet. */
  undoBatchTitle: (remaining: number) =>
    `Write the old values of this mass edit back to the game (${remaining.toLocaleString()} still in place)`,
};

/** "1 value left alone", "12 values left alone". */
const valuesLeftAlone = (count: number) =>
  count === 1 ? "1 value left alone" : `${count.toLocaleString()} values left alone`;

/** "237 players", "1 player", "237 staff", "1 member of staff", "12 clubs", "1 club". */
const entityCount: Record<Entity, (count: number) => string> = {
  player: (count) => (count === 1 ? "1 player" : `${count.toLocaleString()} players`),
  staff: (count) => (count === 1 ? "1 member of staff" : `${count.toLocaleString()} staff`),
  club: (count) => (count === 1 ? "1 club" : `${count.toLocaleString()} clubs`),
};

/** What each list holds, in the plural. */
const entityNouns: Record<Entity, string> = { player: "players", staff: "staff", club: "clubs" };

/** Mass editing: the button in the toolbar of a list and the dialog it opens. */
export const massEditText = {
  /** The button in the toolbar of the player, staff and club lists. */
  button: "Mass edit",
  buttonTitle: "Change values of everything the list shows, with a preview first",
  title: {
    player: "Mass edit players",
    staff: "Mass edit staff",
    club: "Mass edit clubs",
  } satisfies Record<Entity, string>,

  // What it applies to
  /** `total` is the list's: the search and the filters of the list select them. */
  scope: (entity: Entity, total: number) => `The ${entityCount[entity](total)} the list shows now (search and filters)`,
  /** After the scope, when the list shows only the first `shown` rows of its `total`. */
  scopeAll: (shown: number) => `That is every match, not only the first ${shown.toLocaleString()} rows on screen.`,
  scopeNone: (entity: Entity) =>
    `No ${entityNouns[entity]} match the search and filters, so there is nothing to change.`,
  /** `limit` is the most one mass edit takes. */
  scopeTooMany: (entity: Entity, total: number, limit: number) =>
    `The ${entityCount[entity](total)} the list shows are more than one mass edit takes (${limit.toLocaleString()}). ` +
    "Narrow the search or the filters first.",
  loadingFields: "Reading the fields…",
  fieldsFailed: (reason: string) => `Could not read the fields: ${reason}`,

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
  addTitle: "Added to every value as shown; a negative number takes away",
  /** The hint in an empty value input: what it takes. */
  rangeHint: (min: number, max: number) => `${min.toLocaleString()}–${max.toLocaleString()}`,
  /** The same for an amount, which may be negative: up to `max` either way. */
  amountHint: (max: number) => `±${max.toLocaleString()}`,
  /** After the input of a Scale: the number is a percent of the value the game has now. */
  ofCurrent: "% of current",
  percentTitle: "A percent of the current value: 100 keeps it, 110 raises it by a tenth, 50 halves it",
  /** Hover text of an amount that cannot be applied; `min` and `max` are what it takes. */
  invalidAdd: (min: number, max: number) =>
    `Enter a whole number from ${min.toLocaleString()} to ${max.toLocaleString()}`,
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
  previewBlocked: "Fill in every field with a valid value to preview",
  /** "312 changes for 140 of 237 players · 97 already have these values · 12 values left alone". */
  summary: (entity: Entity, preview: MassPreview) =>
    [
      preview.changes === 0
        ? "No changes"
        : `${changeCount(preview.changes)} for ${(preview.targets - preview.unchanged).toLocaleString()} of ` +
          entityCount[entity](preview.targets),
      preview.unchanged > 0 &&
        (preview.unchanged === 1
          ? "1 already has these values"
          : `${preview.unchanged.toLocaleString()} already have these values`),
      preview.skippedCount > 0 && valuesLeftAlone(preview.skippedCount),
    ]
      .filter(Boolean)
      .join(" · "),
  tableLabel: "Changes the mass edit would make",
  columns: { name: "Name", field: "Field", change: "Change", reason: "Reason" },
  /** Under a table or a list that shows only the first rows; `count` is how many more there are. */
  more: (count: number) => `and ${count.toLocaleString()} more`,
  /** The line that opens the list of the values left alone. */
  skippedHeading: valuesLeftAlone,
  skippedLabel: "Values the mass edit leaves alone",

  // Apply and undo
  apply: "Apply",
  applying: "Applying…",
  /** Hover text of Apply; `changes` is how many values it writes. */
  applyTitle: (changes: number) => `Write ${changeCount(changes)} to the game`,
  applyFirst: "Preview the mass edit first",
  applyNothing: "The preview has no changes to write",
  /** Nothing changes in the game until Apply. */
  hint: "Nothing changes in the game until you apply.",
  applied: (count: number) => (count === 0 ? "No changes were written" : `Applied ${changeCount(count)}`),
  /** A change the game refused: who, which field (see `fieldLabel`) and the game's answer. */
  failure: (name: string, label: string, reason: string) => `${name} · ${label}: ${reason}`,
  undo: "Undo this mass edit",
  undoing: "Undoing…",
  undoTitle: "Write the old values of this mass edit back to the game",
  undone: (count: number) => (count === 0 ? "Nothing was undone" : `Undid ${changeCount(count)}`),
  /** A change an undo could not take back: `who` names the person and the field, or the change by its number. */
  undoFailure: (who: string, reason: string) => `${who}: ${reason}`,
  changeNumber: (id: number) => `Change ${id}`,
  close: "Close",
};

const asText = (value: number | string) => (typeof value === "number" ? value.toLocaleString() : value);

/**
 * "17 → 20": a value before and after a change, as shown. A number gets the reader's thousands separators; text,
 * such as a date or an amount of money already written out (see `valueText` in editDraft.ts), is used as it is.
 */
export const valueChange = (from: number | string, to: number | string) => `${asText(from)} → ${asText(to)}`;

/** The text of `table` for `key`; nothing for a key the table lacks, however it is spelled (e.g. "constructor"). */
function labelIn(table: object, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? (table as Record<string, string>)[key] : undefined;
}

/** The names of the fields that are not attributes, personality or positions, by key. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  current_ability: "Current ability",
  potential_ability: "Potential ability",
  height: "Height (cm)",
  "reputation.home": "Home reputation",
  "reputation.current": "Current reputation",
  "reputation.world": "World reputation",
  "international.caps": "Caps",
  "international.goals": "International goals",
  "international.u21_caps": "U21 caps",
  "international.u21_goals": "U21 goals",
  "contract.wage": "Wage per week",
  "contract.expires": "Contract end",
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
};

/**
 * The name of an editable field, from the key `edit_fields` gives it ("current_ability", "attribute.finishing",
 * "position.st", "contract.wage", "finance.balance", …). A key it does not know is returned as it is.
 */
export function fieldLabel(entity: Entity, key: string): string {
  const fixed = labelIn(FIELD_LABELS, key);
  if (fixed !== undefined) {
    return fixed;
  }
  const [group, name = ""] = key.split(".");
  switch (group) {
    case "attribute":
      return labelIn(entity === "staff" ? STAFF_ATTRIBUTE_LABELS : ATTRIBUTE_LABELS, name) ?? key;
    case "personality":
      return labelIn(PERSONALITY_LABELS, name) ?? key;
    case "position": {
      const position = labelIn(POSITION_LABELS, name);
      return position === undefined ? key : editText.positionRating(position);
    }
    default:
      return key;
  }
}
