use std::collections::BTreeMap;
use std::fmt;

use fmlens_mem::{Module, Process};
use serde::{Deserialize, Deserializer};

use crate::game::Storefront;

/// Field offsets inside FM's objects for one edition. They are shared by every
/// storefront build of the same game version, unlike the RVAs in [`BuildProfile`].
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Layout {
    pub edition: u32,
    pub player: PlayerLayout,
    pub contract: ContractLayout,
    pub cluster: ClusterLayout,
    pub staff: StaffLayout,
    pub team: TeamLayout,
    pub club: ClubLayout,
    pub club_info: ClubInfoLayout,
    pub club_finance: ClubFinanceLayout,
    pub nation: NationLayout,
    pub injury: InjuryLayout,
    pub ban: BanLayout,
    pub relation: RelationLayout,
    pub heap: HeapLayout,
    /// A club's stadium; only in the layouts it has been checked in.
    #[serde(default)]
    pub stadium: Option<StadiumLayout>,
    /// The retirements the game has planned; only in the layouts they have been checked in.
    #[serde(default)]
    pub retirement: Option<RetirementLayout>,
    /// A player's familiarity with his clubs and nations; only in the layouts it has been checked in.
    #[serde(default)]
    pub cohesion: Option<CohesionLayout>,
    /// The languages people speak; only in the layouts they have been checked in.
    #[serde(default)]
    pub language: Option<LanguageLayout>,
    /// A nation's own facts and its national team container; only in the layouts they have been checked in.
    #[serde(default)]
    pub national: Option<NationalLayout>,
    /// A promise made to a person; only in the layouts it has been checked in.
    #[serde(default)]
    pub promise: Option<PromiseLayout>,
    /// A team's dynamics record; only in the layouts it has been checked in.
    #[serde(default)]
    pub dynamics: Option<DynamicsLayout>,
    /// A match official; only in the layouts it has been checked in.
    #[serde(default)]
    pub official: Option<OfficialLayout>,
    /// A loaned player's loan contract; only in the layouts it has been checked in.
    #[serde(default)]
    pub loan: Option<LoanLayout>,
    /// The game's list of work permits; only in the layouts it has been checked in.
    #[serde(default)]
    pub work_permit: Option<WorkPermitLayout>,
    /// Competitions and awards; only in the layouts they have been checked in.
    #[serde(default)]
    pub competition: Option<CompetitionLayout>,
    #[serde(default)]
    pub award: Option<AwardLayout>,
    /// The kinds of injury; only in the layouts they have been checked in.
    #[serde(default)]
    pub injury_kind: Option<InjuryKindLayout>,
    /// The object the game's function that starts a loan takes; only in the layouts it has been traced in.
    #[serde(default)]
    pub starting_loan: Option<StartingLoanLayout>,
    /// The transfers the game has agreed for a later day; only in the layouts they have been traced in.
    #[serde(default)]
    pub future_transfer: Option<FutureTransferLayout>,
    /// Players' familiarity with their team's tactic; only in the layouts it has been traced in.
    #[serde(default)]
    pub tactics: Option<TacticsLayout>,
}

/// A player's familiarity with his team's tactic, which the game's editor raises to the most for a team
/// ([`CallRvas::maximise_tactics`]). His pointer at `record` leads to a record with a list of 4-byte entries
/// (begin, end, capacity) at each of `lists`, the familiarity in the low 14 bits of each entry's first u16, and a list
/// of 16-byte entries at `store`, the familiarity the u16 at `store_value`; `dirty` is the byte the game sets once it
/// has changed them. Familiarity runs to 10000. A team's id in the game's teams table is the u32 at `team_id`, and the
/// table's pointer at `teams` leads to its (begin, end) of teams.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TacticsLayout {
    pub record: u64,
    pub lists: Vec<u64>,
    pub store: u64,
    pub store_value: u64,
    pub dirty: u64,
    pub team_id: u64,
    pub teams: u64,
}

/// The transfers `TRANSFER_MANAGER` has agreed for a later day. From the manager: its offers at `offers` and the
/// records of the dated ones at `dated`, each a (begin, end) of pointers, and `dated_owner`, what
/// [`CallRvas::drop_dated_transfer`] takes. A record holds the player at `record_person`, the day (an FM date: day of
/// year, then year) at `record_date` and its offer's id (u32) at `record_offer`. An offer holds its id (u32) at
/// `offer_id`, the player at `offer_person`, the team he joins and the one he leaves at `offer_to_team` and
/// `offer_from_team`, and its status byte at `offer_status`, `pending` until its day. The player is his identity block,
/// or a stand-in the game has not looked up yet: its UID (u32) at `person_uid` is `u32::MAX`, and its u32 at
/// `person_index` is the identity block's.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FutureTransferLayout {
    pub offers: u64,
    pub dated: u64,
    pub dated_owner: u64,
    pub record_person: u64,
    pub record_date: u64,
    pub record_offer: u64,
    pub person_uid: u64,
    pub person_index: u64,
    pub offer_id: u64,
    pub offer_person: u64,
    pub offer_to_team: u64,
    pub offer_from_team: u64,
    pub offer_status: u64,
    pub pending: u8,
}

/// A `STARTING_LOAN`, the `size`-byte object [`CallRvas::start_loan`] takes: the player's identity block at `player`,
/// the borrowing club's team at `club`, the first and last days at `starts` and `ends` (FM dates: day of year, then
/// year), the build's 16 default bytes at `defaults`. The game's editor builds one in its own stack frame, owning
/// nothing.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartingLoanLayout {
    pub size: u64,
    pub player: u64,
    pub club: u64,
    pub starts: u64,
    pub ends: u64,
    pub defaults: u64,
}

/// A competition (`db::COMP`), `size` bytes read from its start. `table_items` is where its database table points at
/// the vector of pointers to the competitions; `index` the u32 place in it each holds. Names are FM string pointers;
/// `nation` (none for an international competition) and `continent` are pointers to places whose name is an FM string
/// at `place_name`. `reputation` is a u16, 0 to 200, and `women` a byte, nonzero for a women's competition.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompetitionLayout {
    pub class: String,
    pub size: u64,
    pub table_items: u64,
    pub index: u64,
    pub uid: u64,
    pub name: u64,
    pub short_name: u64,
    pub continent: u64,
    pub nation: u64,
    pub place_name: u64,
    pub reputation: u64,
    pub women: u64,
    /// Pointer to the competition's loaded rule data (`ACTUAL_COMP`), and in it the `(begin, end, capacity)` vector of
    /// its rules: 16-byte entries of a key (a FourCC in the low 32 bits) and a pointer to a value node, `[type][value]`.
    #[serde(default)]
    pub actual: Option<u64>,
    #[serde(default)]
    pub rules: Option<u64>,
}

/// A kind of injury (`db::INJURY`), read from its database table as a competition is ([`CompetitionLayout`]). Its
/// name is at [`InjuryLayout::kind_name`].
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InjuryKindLayout {
    pub class: String,
    pub size: u64,
    pub table_items: u64,
    pub index: u64,
    pub uid: u64,
    /// The mangled class name of the injury manager, which gives players their injuries.
    pub manager_class: String,
}

/// An award (`db::AWARD`), read as a competition is ([`CompetitionLayout`]); `competition`, `nation` and `continent`
/// are the pointers it is linked by, the rest bytes: `prestige` 0 to 20, `period` and `recipients` codes,
/// `goalkeepers_only` 1 for a goalkeepers' award, `women` 1 for a women's award and `max_age` the oldest a winner may
/// be (0 for any age).
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AwardLayout {
    pub class: String,
    pub size: u64,
    pub table_items: u64,
    pub index: u64,
    pub uid: u64,
    pub name: u64,
    pub continent: u64,
    pub competition: u64,
    pub nation: u64,
    pub goalkeepers_only: u64,
    pub prestige: u64,
    pub period: u64,
    pub women: u64,
    pub recipients: u64,
    pub max_age: u64,
}

/// A loaned player's loan: in the player's person block, a pointer to a slot that points at a contract of the class
/// `class` (as [`crate::rtti::class_of`] names it), laid out as a contract ([`ContractLayout`]).
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoanLayout {
    pub slot: u64,
    pub class: String,
    /// The loan's future fee, a u32 in the contract, `u32::MAX` for none.
    pub future_fee: u64,
}

/// Work permits: the transfer manager the game keeps them in ([`BuildProfile::transfer_manager`]), of class `class`; at
/// `records` its (begin, end) pair of pointers to the records, sorted by the u32 at `record_person`, which is the u32
/// at `person` of a player (from his person block, shifted with it).
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkPermitLayout {
    pub class: String,
    pub records: u64,
    pub person: u64,
    pub record_size: u64,
    pub record_person: u64,
    pub record_esc_since: u64,
    pub record_flags: u64,
}

/// A match official: an object of `size` bytes in the officials array ([`BuildProfile::officials`]).
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OfficialLayout {
    pub size: u64,
    /// Name-table entry pointers, as a person's.
    pub first_name: u64,
    pub last_name: u64,
    pub common_name: u64,
    /// Pointer to the nation.
    pub nation: u64,
    /// `u16` day of the year and `u16` year.
    pub date_of_birth: u64,
    /// `u16` each; reputation 0 to 10000.
    pub current_ability: u64,
    pub potential_ability: u64,
    pub reputation: u64,
    pub uid: u64,
    /// Where the identity block starts, where the layout has to say (Windows: MSVC's vtables keep no offset to it).
    #[serde(default)]
    pub identity: Option<u64>,
}

/// A nation's facts, and the men's national team container it points at (which points back at it): the FIFA
/// ranking, the rivals and the national teams, which are laid out as a club's teams (see [`TeamLayout`]).
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NationalLayout {
    /// In a nation: FM string pointer to the three-letter code; pointers to the capital city and to the continent,
    /// whose names are FM string pointers at `place_name`.
    pub code: u64,
    pub capital: u64,
    pub continent: u64,
    pub place_name: u64,
    /// In a nation: the `(begin, end, capacity)` list of languages, of `entry_size` entries: a pointer to the
    /// language and, at `language_percent`, the `u8` share of people who speak it.
    pub languages: u64,
    pub entry_size: u64,
    pub language_percent: u64,
    /// In a nation: `u32` population; `u8` dual nationality (0 allowed, 2 not); `u8` years of residence that gain
    /// its nationality (255 none do).
    pub population: u64,
    pub dual_nationality: u64,
    pub naturalisation: u64,
    /// In a nation: pointers to the men's and the women's containers, laid out alike. In a container: pointer back
    /// to the nation.
    pub container: u64,
    pub women_container: u64,
    pub container_nation: u64,
    /// In a container: the list of its national teams, its relations (rivals), the `f32` FIFA points, the `u16`
    /// ranking (0 unranked), the `u16` years its association was founded and joined FIFA and its continental body,
    /// and its `i16` youth rating.
    pub teams: u64,
    pub rivals: u64,
    pub points: u64,
    pub ranking: u64,
    pub founded: u64,
    pub joined_fifa: u64,
    pub joined_continental: u64,
    pub youth_rating: u64,
    /// In a container: the `i8` game importance, 0 to 4, and the `u8` attendance, 0 to 16.
    pub game_importance: u64,
    pub attendance: u64,
    /// In a container: twelve `i8` style ratings, 0 to 20, in the order of `national::STYLE`.
    #[serde(default)]
    pub style: Option<u64>,
    /// In a national team: pointer to the manager.
    pub team_manager: u64,
    /// In a national team: `u32` id. The senior team's is the nation's UID.
    pub team_id: u64,
}

impl NationalLayout {
    /// One past the last byte the editor reads of a nation.
    pub fn nation_end(&self) -> u64 {
        [self.code, self.capital, self.continent, self.languages + 16, self.women_container, self.population + 4]
            .into_iter()
            .chain([self.dual_nationality, self.naturalisation])
            .max()
            .unwrap_or(0)
            + 8
    }

    /// One past the last byte the editor reads of a container.
    pub fn container_end(&self) -> u64 {
        [self.points + 4, self.ranking + 2, self.founded + 2, self.joined_fifa + 2, self.joined_continental + 2]
            .into_iter()
            .chain([self.youth_rating + 2, self.game_importance + 1, self.attendance + 1])
            .chain(self.style.map(|offset| offset + crate::national::STYLE.len() as u64))
            .max()
            .unwrap_or(0)
    }
}

/// The languages a person speaks besides, usually, his native one: a `(begin, end, capacity)` list of pointers to
/// 16-byte links, each a pointer to the language and how well he speaks it, 0 to 10.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LanguageLayout {
    /// In a player, and in a member of staff: the list.
    pub player: u64,
    pub staff: u64,
    /// In a link: the pointer to the language, and the `u64` level.
    pub language: u64,
    pub level: u64,
    /// In a language: the FM string pointer to its name.
    pub name: u64,
}

/// A player's familiarity with the clubs and nations he plays for, which the game's team cohesion is made of: the
/// second `(begin, end, capacity)` list of the record his `relations` pointer leads to, of small entries that name a
/// club or nation by its internal id. The game's Max cohesion sets the entry for the team's club to the most.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CohesionLayout {
    /// In the relations record: the list.
    pub list: u64,
    /// In an entry: the `u32` internal id of the club or nation.
    pub id: u64,
    /// In an entry: `u8`, 1 for a club, 2 for a nation.
    pub kind: u64,
    /// In an entry: `u8` familiarity, 0 to 100.
    pub value: u64,
    /// In an entry: `u8`, set on entries the game's action leaves alone.
    pub flag: u64,
    /// Bytes per entry.
    pub size: u64,
    /// In a club: the `u32` internal id its entries name it by.
    pub club_id: u64,
}

/// The retirements the game has planned, which its retirement manager keeps (`RETIREMENT_MANAGER`, one object a
/// static points at, which each build profile places: [`BuildProfile::retirement_manager`]). It lists them twice: as
/// pointers to the entries, and as an index of 16-byte entries (the person id, 4 spare bytes, the pointer) sorted by
/// person id.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RetirementLayout {
    /// In the manager: the `(begin, end, capacity)` list of pointers to the entries.
    pub planned: u64,
    /// In the manager: the `(begin, end, capacity)` index of the entries by person id.
    pub by_person: u64,
    /// In an entry: the `u32` id of the person who retires (`player_person`), and the date he retires.
    pub person: u64,
    pub date: u64,
    /// In a player: the `u32` id the game gives the person.
    pub player_person: u64,
}

/// A stadium, which a club's senior team points at.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StadiumLayout {
    /// In the senior team: the pointer to the stadium.
    pub team_pointer: u64,
    /// FM string pointer.
    pub name: u64,
    /// `u32` capacities: the whole, the seats, the part in use when it is limited (0 when not) and the most it can
    /// be expanded to.
    pub capacity: u64,
    pub seating: u64,
    pub used: u64,
    pub expansion: u64,
    /// Pointer to the club that owns it.
    pub owner: u64,
}

impl StadiumLayout {
    /// One past the last byte of every stadium field.
    pub fn end(&self) -> u64 {
        [self.name + 8, self.capacity + 4, self.seating + 4, self.used + 4, self.expansion + 4, self.owner + 8]
            .into_iter()
            .max()
            .unwrap_or(0)
    }
}

/// One of a person's relations: a 16-byte entry of the list that starts the record his `relations` pointer leads to.
/// It points at its target, a nation, club, person or competition, and then says how he is tied to it.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RelationLayout {
    /// Pointer to the target.
    pub target: u64,
    /// `u8`: 1 for a club, 3 for a person, 8 for a nation.
    pub target_kind: u64,
    /// `u8`: 9 for a nationality, 70 for a nation he was trained in, 72 for a club he was trained at; 1 and 2 for a
    /// favoured and disliked person, 3 and 4 for a favoured and disliked club.
    pub relation: u64,
    /// `u8`: for a training, the homegrown rule it meets; `i8` for a preference, its strength.
    pub value: u64,
    /// Bytes per entry.
    pub size: u64,
}

/// One current injury of a player. A player's `injuries` pointer leads to a record whose
/// first field is the list `(begin, end, capacity)` of these.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InjuryLayout {
    /// Pointer to the kind of injury.
    pub kind: u64,
    /// The team he was with when it happened.
    pub team: u64,
    /// Date.
    pub started: u64,
    /// `u16` days from `started` until he is back at the latest, and at the soonest.
    pub longest: u64,
    pub shortest: u64,
    /// In the kind of injury: its name, an FM string.
    pub kind_name: u64,
}

impl InjuryLayout {
    /// One past the last byte of every injury field.
    pub fn end(&self) -> u64 {
        [self.kind + 8, self.team + 8, self.started + 4, self.longest + 2, self.shortest + 2]
            .into_iter()
            .max()
            .unwrap_or(0)
    }
}

/// A promise made to a person (`INTERACTION_PROMISE`, 0x60 bytes). `list` is in the person block: a pointer to the
/// `(begin, end, capacity)` vector of pointers to his promises. In a promise: `person` points back at him, `made` and
/// `due` are dates (`due` becomes the end date once it closes), `id` is FM's `u16` number for the promise, bit 0 of
/// `closed` marks it ended, `category` is 0 for the promises FM's own Promises page leaves out, and `status` is FM's
/// status code, 0 while open.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PromiseLayout {
    pub list: u64,
    pub person: u64,
    pub made: u64,
    pub due: u64,
    pub id: u64,
    pub closed: u64,
    pub category: u64,
    pub status: u64,
}

impl PromiseLayout {
    /// One past the last byte of every promise field.
    pub fn end(&self) -> u64 {
        [self.person + 8, self.made + 4, self.due + 4, self.id + 2, self.closed + 1, self.category + 1, self.status + 1]
            .into_iter()
            .max()
            .unwrap_or(0)
    }
}

/// A team's dynamics record, which keeps the dressing room atmosphere and the support for the manager as scores from
/// -100 to 100, each with the date the game worked it out. A team points at a `holder`, which points at the `record`;
/// the record points back at its `team`. The game's own logic reuses a score for seven days after its date.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DynamicsLayout {
    pub holder: u64,
    pub record: u64,
    pub team: u64,
    pub atmosphere_date: u64,
    pub support_date: u64,
}

/// One current ban of a player. The record a player's `injuries` pointer leads to holds,
/// after his list of current injuries, the list `(begin, end, capacity)` of his current
/// absences: his bans, and others such as a call-up. Each is a 32-byte entry, and a ban
/// carries `0xFFFF` at `marker`, where the others hold 0.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BanLayout {
    /// Where the list of absences is in the record.
    pub list: u64,
    /// The date the ban began.
    pub started: u64,
    /// `u16`, `0xFFFF` for a ban.
    pub marker: u64,
    /// `u8`: how many matches he still has to miss.
    pub matches: u64,
}

impl BanLayout {
    /// One past the last byte of every field of an entry.
    pub fn end(&self) -> u64 {
        [self.started + 4, self.marker + 2, self.matches + 1].into_iter().max().unwrap_or(0)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlayerLayout {
    pub uid: u64,
    pub full_name: u64,
    pub first_name: u64,
    pub last_name: u64,
    pub common_name: u64,
    pub date_of_birth: u64,
    pub current_ability: u64,
    pub potential_ability: u64,
    pub nation: u64,
    /// Pointer to the record whose first field is the list of his relations; see [`RelationLayout`].
    pub relations: u64,
    pub team: u64,
    /// Start of the person block; fields from here on move with the person-block shift.
    pub person_block: u64,
    /// The block with the UID that contracts and captaincies point at, when it does not
    /// start the person block (on macOS it ends it).
    #[serde(default)]
    pub identity: Option<u64>,
    /// The `ACTUAL_PERSON` the game's signing takes, when it does not start the person block (on Windows it follows
    /// the person block's `PERSON`, which has no virtual-base pointer of its own).
    #[serde(default)]
    pub actual_person: Option<u64>,
    /// Shifts of the person block seen across player classes (player-coaches use 0xF8).
    pub person_block_shifts: Vec<u64>,
    pub height: u64,
    pub asking_price: u64,
    /// Stored base valuation in pounds; separate from asking price and the manager-specific range.
    #[serde(default)]
    pub transfer_value: Option<u64>,
    pub home_reputation: u64,
    pub current_reputation: u64,
    pub world_reputation: u64,
    pub international_caps: u64,
    pub international_goals: u64,
    pub u21_caps: u64,
    pub u21_goals: u64,
    pub contract: u64,
    /// `u16` 0..10000, live values the game changes every day.
    pub match_sharpness: u64,
    pub condition: u64,
    /// `i16`, -500 when rested and higher the more worn out he is by playing.
    pub jadedness: u64,
    /// `u8` 1..20: his morale, which the game shows in words as his overall happiness.
    pub morale: u64,
    /// `u64` bitmask of his traits (preferred moves), in the order of [`crate::TRAITS`].
    pub traits: u64,
    /// Pointer to the injury record; see [`InjuryLayout`].
    pub injuries: u64,
    /// First of the 15 position ratings, in [`crate::POSITIONS`] order.
    pub positions: u64,
    /// First of the 8 personality ratings, in [`crate::PERSONALITY`] order.
    pub personality: u64,
    /// Attribute offsets by key; see [`crate::ATTRIBUTE_GROUPS`].
    pub attributes: BTreeMap<String, u64>,
}

impl PlayerLayout {
    /// Where `offset` lands in an object whose person block is shifted by `shift`.
    pub fn at(&self, offset: u64, shift: u64) -> u64 {
        if offset >= self.person_block { offset + shift } else { offset }
    }

    /// Where the block that contracts and captaincies point at starts, before any shift.
    pub fn identity(&self) -> u64 {
        self.identity.unwrap_or(self.person_block)
    }

    /// Where the `ACTUAL_PERSON` the game's signing takes starts, before any shift.
    pub fn actual_person(&self) -> u64 {
        self.actual_person.unwrap_or(self.person_block)
    }

    /// One past the last byte of every direct player field, before any shift.
    pub fn end(&self) -> u64 {
        let fields = [
            self.uid + 4,
            self.full_name + 8,
            self.first_name + 8,
            self.last_name + 8,
            self.common_name + 8,
            self.date_of_birth + 4,
            self.current_ability + 2,
            self.potential_ability + 2,
            self.nation + 8,
            self.team + 8,
            self.height + 2,
            self.asking_price + 4,
            self.transfer_value.map_or(0, |offset| offset + 4),
            self.world_reputation + 2,
            self.international_goals + 2,
            self.u21_goals + 1,
            self.contract + 8,
            self.match_sharpness + 2,
            self.condition + 2,
            self.jadedness + 2,
            self.morale + 1,
            self.traits + 8,
            self.injuries + 8,
            self.positions + crate::POSITIONS.len() as u64,
            self.personality + crate::PERSONALITY.len() as u64,
        ];
        let attributes = self.attributes.values().map(|offset| offset + 1);
        fields.into_iter().chain(attributes).max().unwrap_or(0)
    }

    /// The largest person-block shift.
    pub fn max_shift(&self) -> u64 {
        self.person_block_shifts.iter().copied().max().unwrap_or(0)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ContractLayout {
    /// Points back at the person block of the player or member of staff the contract belongs to.
    pub owner: u64,
    pub wage: u64,
    pub signed: u64,
    pub expires: u64,
    pub joined: u64,
    pub squad_status: u64,
    pub listing: u64,
    pub squad_number: u64,
    pub team: u64,
    /// The employer's senior team: the same as `team` but for player-coaches.
    pub senior_team: u64,
    pub job: u64,
    /// The list `(begin, end, capacity)` of the contract's clauses and bonuses: 8-byte entries, an amount and a kind.
    pub clauses: u64,
    /// The list of its bonuses for winning competitions: 32-byte entries.
    pub competition_bonuses: u64,
    /// `i32`, pounds per week.
    pub loyalty_bonus: u64,
    /// `i8` each: how happy the player is, and how happy with his playing time, as FMRTE shows them.
    pub happiness: u64,
    pub playing_time_happiness: u64,
    /// Pointer to the record of his reasons to be unhappy: a `u8` count, then a ring of ten pointers to 28-byte
    /// entries and the slot of the oldest (see `details::concern_entries`).
    pub unhappiness: u64,
}

impl ContractLayout {
    /// One past the last byte of every contract field.
    pub fn end(&self) -> u64 {
        [
            self.owner + 8,
            self.wage + 4,
            self.signed + 4,
            self.expires + 4,
            self.joined + 4,
            self.squad_status + 1,
            self.listing + 1,
            self.squad_number + 1,
            self.team + 8,
            self.senior_team + 8,
            self.job + 1,
            self.loyalty_bonus + 4,
            self.happiness + 1,
            self.playing_time_happiness + 1,
            self.unhappiness + 8,
        ]
        .into_iter()
        .max()
        .unwrap_or(0)
    }
}

/// Static values next to the entity arrays, as offsets from the players `(begin, end)` pair.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClusterLayout {
    pub current_date: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StaffLayout {
    /// Pointer to the record of his relations, laid out as a player's; only in the layouts it has been checked in.
    #[serde(default)]
    pub relations: Option<u64>,
    pub uid: u64,
    pub full_name: u64,
    pub first_name: u64,
    pub last_name: u64,
    pub common_name: u64,
    pub nation: u64,
    /// First of the 8 personality ratings, in [`crate::PERSONALITY`] order.
    pub personality: u64,
    pub date_of_birth: u64,
    pub contract: u64,
    pub home_reputation: u64,
    pub current_reputation: u64,
    pub world_reputation: u64,
    pub current_ability: u64,
    pub potential_ability: u64,
    /// Start of the person block; fields from here on move with the person-block shift.
    pub person_block: u64,
    /// The block with the UID that contracts point at, when it does not start the person
    /// block (on macOS it ends it).
    #[serde(default)]
    pub identity: Option<u64>,
    /// The `ACTUAL_PERSON` the game's signing takes, when it does not start the person block (see
    /// [`PlayerLayout::actual_person`]).
    #[serde(default)]
    pub actual_person: Option<u64>,
    /// Shifts of the person block seen across staff classes (the human manager uses 0x340).
    pub person_block_shifts: Vec<u64>,
    /// In the person block: the `i8` coaching licence (see [`crate::staff::licence_level`]); only in the layouts it
    /// has been traced in.
    #[serde(default)]
    pub coaching_licence: Option<u64>,
    /// The `u8` formation ids of his preferred formation in possession and out of possession, the two FM's staff
    /// profile shows; only in the layouts they have been traced in.
    #[serde(default)]
    pub formations: Option<[u64; 2]>,
    /// Attributes stored raw (0..100) by key; see [`crate::STAFF_ATTRIBUTE_GROUPS`].
    pub attributes: BTreeMap<String, u64>,
    /// Ratings stored as shown (1..20) by key.
    pub ratings: BTreeMap<String, u64>,
}

impl StaffLayout {
    /// Where `offset` lands in an object whose person block is shifted by `shift`.
    pub fn at(&self, offset: u64, shift: u64) -> u64 {
        if offset >= self.person_block { offset + shift } else { offset }
    }

    /// Where the block that contracts point at starts, before any shift.
    pub fn identity(&self) -> u64 {
        self.identity.unwrap_or(self.person_block)
    }

    /// Where the `ACTUAL_PERSON` the game's signing takes starts, before any shift.
    pub fn actual_person(&self) -> u64 {
        self.actual_person.unwrap_or(self.person_block)
    }

    /// One past the last byte of every staff field, before any shift.
    pub fn end(&self) -> u64 {
        let fields = [
            self.uid + 4,
            self.full_name + 8,
            self.first_name + 8,
            self.last_name + 8,
            self.common_name + 8,
            self.nation + 8,
            self.personality + crate::PERSONALITY.len() as u64,
            self.date_of_birth + 4,
            self.contract + 8,
            self.world_reputation + 2,
            self.potential_ability + 2,
        ];
        let single_bytes = self
            .attributes
            .values()
            .chain(self.ratings.values())
            .chain(self.coaching_licence.as_ref())
            .chain(self.formations.iter().flatten())
            .map(|offset| offset + 1);
        fields.into_iter().chain(single_bytes).max().unwrap_or(0)
    }

    pub fn max_shift(&self) -> u64 {
        self.person_block_shifts.iter().copied().max().unwrap_or(0)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TeamLayout {
    pub club: u64,
    /// `u8`: the kind of team, 0 for the first team.
    pub kind: u64,
    /// `u8`: the oldest its players may be; 100 for a team without a limit.
    pub age_limit: u64,
    /// The team's player pointers as `(begin, end, capacity)`.
    pub players: u64,
    /// Pointers to the person blocks of the captain and the vice-captain, null for none.
    pub captain: u64,
    pub vice_captain: u64,
    pub reputation: u64,
    /// Pointer to the object of the team's manager, null for none; where it has been traced.
    #[serde(default)]
    pub manager: Option<u64>,
    /// `u8`: 0 for a club's team, otherwise a nation's, whose `club` then points to the nation's teams.
    #[serde(default)]
    pub national: Option<u64>,
}

impl TeamLayout {
    /// One past the last byte of every team field.
    pub fn end(&self) -> u64 {
        [
            self.club + 8,
            self.kind + 1,
            self.age_limit + 1,
            self.players + 24,
            self.captain + 8,
            self.vice_captain + 8,
            self.reputation + 2,
        ]
        .into_iter()
        .max()
        .unwrap_or(0)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClubLayout {
    /// The club's relations, as a person's (see [`RelationLayout`]): a rival is a club it relates to with code 5.
    #[serde(default)]
    pub relations: Option<u64>,
    /// The `(begin, end, capacity)` list of pointers to the club's links with other clubs (affiliations), and in a
    /// link, the pointer to the other club.
    #[serde(default)]
    pub links: Option<u64>,
    #[serde(default)]
    pub link_club: Option<u64>,
    /// Pointers to the club's own nation (Cardiff City: Wales) and to the nation whose league it plays in (England).
    #[serde(default)]
    pub plays_in: Option<u64>,
    #[serde(default)]
    pub nation: Option<u64>,
    pub uid: u64,
    pub name: u64,
    pub short_name: u64,
    pub women: u64,
    pub teams: u64,
    pub info: u64,
    pub finance: u64,
    /// The club's staff by department, each a list of pointers as `(begin, end, capacity)`: the medical team, the
    /// coaches and the scouts.
    pub medical_staff: u64,
    pub coaching_staff: u64,
    pub scouting_staff: u64,
}

impl ClubLayout {
    pub fn end(&self) -> u64 {
        [
            self.uid + 4,
            self.name + 8,
            self.short_name + 8,
            self.women + 1,
            self.teams + 8,
            self.info + 8,
            self.finance + 8,
            self.medical_staff + 24,
            self.coaching_staff + 24,
            self.scouting_staff + 24,
            self.plays_in.map_or(0, |offset| offset + 8),
            self.nation.map_or(0, |offset| offset + 8),
        ]
        .into_iter()
        .max()
        .unwrap_or(0)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClubInfoLayout {
    pub season_tickets: u64,
    pub founded: u64,
    pub social_media: u64,
    /// First of 6 supporter-mix percentages, in [`crate::SUPPORTER_MIX`] order.
    pub supporter_mix: u64,
    /// First of 6 supporter traits (1..20), in [`crate::SUPPORTER_TRAITS`] order.
    pub supporter_traits: u64,
    pub training: u64,
    pub youth_facilities: u64,
    pub youth_coaching: u64,
    pub youth_recruitment: u64,
}

impl ClubInfoLayout {
    pub fn end(&self) -> u64 {
        [
            self.season_tickets + 4,
            self.founded + 2,
            self.social_media + 4,
            self.supporter_mix + 6,
            self.supporter_traits + 6,
            self.training + 1,
            self.youth_facilities + 1,
            self.youth_coaching + 1,
            self.youth_recruitment + 1,
        ]
        .into_iter()
        .max()
        .unwrap_or(0)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClubFinanceLayout {
    pub balance: u64,
    pub transfer_budget: u64,
    pub total_wage_budget: u64,
    pub wage_budget: u64,
    pub ticket_price: u64,
    pub corporate: u64,
}

impl ClubFinanceLayout {
    pub fn end(&self) -> u64 {
        [
            self.balance + 4,
            self.transfer_budget + 4,
            self.total_wage_budget + 4,
            self.wage_budget + 4,
            self.ticket_price + 4,
            self.corporate + 1,
        ]
        .into_iter()
        .max()
        .unwrap_or(0)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NationLayout {
    pub uid: u64,
    pub name: u64,
}

/// What the game's allocator does with the blocks it hands out.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HeapLayout {
    /// Block sizes in bytes, ascending. A buffer of more than the first size and up to the last one sits in
    /// the smallest block at least as large as it; outside that span the block size is not known.
    pub block_sizes: Vec<u64>,
}

impl HeapLayout {
    /// The size of the block that holds a buffer of `bytes`, where that is known.
    pub fn block_size(&self, bytes: u64) -> Option<u64> {
        let (&smallest, sizes) = self.block_sizes.split_first()?;
        if bytes <= smallest {
            return None;
        }
        sizes.iter().copied().find(|&size| size >= bytes)
    }
}

/// Addresses that change with every build of the game plugin.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuildProfile {
    pub name: String,
    pub edition: u32,
    pub storefront: Storefront,
    pub package_version: Option<String>,
    pub plugin: PluginFingerprint,
    pub arrays: ArrayRvas,
    /// RVA in the game plugin of the in-game date, where it is not next to the arrays at
    /// [`ClusterLayout::current_date`]: on macOS, and on Windows since the November 2026 update (Game Pass
    /// 0.9.2409.0, Steam build 26340721), it is a variable of its own.
    pub current_date: Option<u64>,
    /// RVA in the game plugin of the static pointer to the retirement manager ([`RetirementLayout`]). It is not at
    /// the same distance from the arrays in every build: 0xED60 before the players pair on Game Pass, 0xDAC0 on
    /// Steam.
    pub retirement_manager: Option<u64>,
    /// Where the human manager's own flags sit, on the one build where that has been traced. Absent elsewhere,
    /// which leaves the manager-only fields unavailable.
    #[serde(default)]
    pub human_manager: Option<HumanManagerLayout>,
    /// RVA in the game plugin of the `(begin, end)` pair of the match officials' array ([`OfficialLayout`]), on the
    /// one build where it has been read.
    #[serde(default)]
    pub officials: Option<u64>,
    /// RVA in the game plugin of the static pointer to the transfer manager, which keeps the work permits
    /// ([`WorkPermitLayout`]), on the builds where it has been found.
    #[serde(default)]
    pub transfer_manager: Option<u64>,
    /// RVAs in the game plugin of the static pointers to the database tables of competitions ([`CompetitionLayout`])
    /// and awards ([`AwardLayout`]), on the one build where they have been read.
    #[serde(default)]
    pub competitions: Option<u64>,
    #[serde(default)]
    pub awards: Option<u64>,
    /// RVA in the game plugin of the static pointer to the database table of the kinds of injury
    /// ([`InjuryKindLayout`]), on the one build where it has been read.
    #[serde(default)]
    pub injury_kinds: Option<u64>,
    /// RVA in the game plugin of the static pointer to the injury manager (`INJURY_MANAGER`), which gives players
    /// their injuries, on the one build where it has been read.
    #[serde(default)]
    pub injury_manager: Option<u64>,
    /// The game's own functions FM Lens has the game run, through the bridge on macOS, on the builds where their
    /// shapes have been traced.
    #[serde(default)]
    pub calls: Option<CallRvas>,
    /// What a `STARTING_LOAN` for [`CallRvas::start_loan`] starts from, on the one build where it has been traced.
    #[serde(default)]
    pub starting_loan: Option<StartingLoanRvas>,
    /// What the game's own editor actions start from, on the one build where it has been traced.
    #[serde(default)]
    pub editor: Option<EditorRvas>,
    /// The GAME_UI singleton, only where its entity-notification call is traced.
    #[serde(default)]
    pub game_ui: Option<u64>,
    /// What asking whether a player needs a work permit takes, on the builds where it has been traced.
    #[serde(default)]
    pub work_permit_check: Option<WorkPermitCheckRvas>,
}

/// RVAs in the game plugin of what [`CallRvas::needs_work_permit`] takes: the byte that is 1 while work permits are
/// in force (otherwise the game gives none), the static pointer [`CallRvas::work_permit_rules`] takes first, and the
/// date the game passes for none (1 January 1900).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkPermitCheckRvas {
    pub enabled: u64,
    pub rules: u64,
    pub no_date: u64,
}

/// RVAs in the game plugin of the static pointers to the registry of the game's Value types (an integer Value is the
/// registry's entry at `integer_type` and the number) and to the database table of teams ([`TacticsLayout`]), and of
/// the byte the game's editor actions check is 1 before they do anything.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EditorRvas {
    pub value_types: u64,
    pub integer_type: u64,
    pub teams: u64,
    pub enabled: u64,
}

/// RVAs in the game plugin of what the game's editor builds a `STARTING_LOAN` from ([`StartingLoanLayout`]): its
/// vtable, and the 16 bytes it copies to [`StartingLoanLayout::defaults`].
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartingLoanRvas {
    pub vtable: u64,
    pub defaults: u64,
}

/// RVAs in the game plugin of the functions FM Lens has the game run ([`fmlens_mem::call`]). The bridge runs these
/// and no others for the build: fmlens-bridge/build.rs reads them from the same table.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CallRvas {
    /// GAME_UI::entity_changed(ui, identity): invalidates views of this entity.
    pub entity_changed: Option<u64>,
    /// Broadcast rfui to active views, with an entity-reference vector and optional panel IDs.
    pub refresh_views: Option<u64>,
    /// `INJURY_MANAGER::add_injury(manager, player, kind index, cause, 0, 0, 0, 0, [news byte, 0, 0])`: gives the
    /// player an injury of the kind and returns it, or null when it does not.
    pub add_injury: Option<u64>,
    /// `TRANSFER_MANAGER::set_work_permit(manager, identity block, club team, force, esc)`: makes the player a work
    /// permit record for the club's country, an ESC slot or not, or takes the slot away. Unforced, it does so only
    /// where the game's rules say he needs a permit. Returns nothing.
    pub set_work_permit: Option<u64>,
    /// `TRANSFER_MANAGER::find_work_permit(manager, identity block, club team)`: the place in the manager's list of the
    /// player's record for the club's country, as an int, or -1. Only reads.
    pub find_work_permit: Option<u64>,
    /// `TRANSFER_MANAGER::remove_work_permit(manager, identity block, record)`: takes the record out of the manager's
    /// lists and frees it. Returns nothing.
    pub remove_work_permit: Option<u64>,
    /// `TRANSFER_MANAGER::start_loan(manager, STARTING_LOAN*, 1)`: loans the player to the club team the object names,
    /// between its dates. Returns nothing.
    pub start_loan: Option<u64>,
    /// `TRANSFER_MANAGER::sign_free_agent(manager, person block, club team, terms map*, references*, 0)`: signs a
    /// free agent for the club team on the terms in the map, the game's own where it has none. Returns a bool.
    pub sign_free_agent: Option<u64>,
    /// Builds an empty terms map in three qwords; returns it.
    pub map_new: Option<u64>,
    /// Destroys a terms map [`CallRvas::map_new`] built.
    pub map_drop: Option<u64>,
    /// Destroys the list of entity references [`CallRvas::sign_free_agent`] fills, three qwords from zero.
    pub refs_drop: Option<u64>,
    /// `TRANSFER_MANAGER::end_contract(manager, player object, contract, kind, team or 0, 1, 0, 0, [0, 0])`: ends the
    /// contract, as the game's daily check does once a loan runs out (the player goes back to his club) and its editor
    /// calls on a player's own contract, which leaves him at his club with none. The kind only picks the news.
    /// Returns nothing.
    pub end_contract: Option<u64>,
    /// `TRANSFER_MANAGER::withdraw_offers(manager, identity block, 1, 0, 0, 0, 0)`: withdraws the offers clubs have made
    /// for the person, as the game's editor does before it releases a player. Returns nothing.
    pub withdraw_offers: Option<u64>,
    /// `TRANSFER_MANAGER::leave_team(manager, identity block, team, reason, 0, 0, 0, 1, [1, 0])`: has the person leave
    /// the team that employs him. Reason 9 is a release, as the game's editor does it: he becomes a free agent.
    /// Returns nothing.
    pub leave_team: Option<u64>,
    /// The type of a date Value; takes nothing.
    pub date_type: Option<u64>,
    /// `(type, Value*, raw date*)`: makes the Value of the date, 16 bytes.
    pub date_value: Option<u64>,
    /// `(map*, key, Value*)`: puts a copy of the Value in a terms map under the four-letter key.
    pub map_insert: Option<u64>,
    /// Destroys a Value.
    pub value_drop: Option<u64>,
    /// `TRANSFER_MANAGER::cancel_offer(manager, slot*, team, 2 or 0, 0, 0, 0, 1, [0, 0])`: cancels the offer the
    /// slot holds a reference to, for the team the player joins (2) or the one he leaves (0). Returns nothing.
    pub cancel_offer: Option<u64>,
    /// `(manager + dated_owner, offer, identity block)`: drops the manager's record of a transfer agreed for a later
    /// day, as the game's editor does once it has cancelled the offer.
    pub drop_dated_transfer: Option<u64>,
    /// `(slot*, slot*)`: copies a {pointer, u32} slot, taking a reference to the object (count at +0x08).
    pub ref_copy: Option<u64>,
    /// `(object)`: gives back a reference to the object, destroying it with the last.
    pub ref_drop: Option<u64>,
    /// `(slot*, slot*)`: makes the first {pointer, u32} slot hold what the second does, giving back its reference to
    /// the object it held. For builds without `ref_drop`: an empty second slot gives the reference back.
    pub ref_assign: Option<u64>,
    /// `(Value*, map*)`: makes the Value of a struct, moving the map's entries into it.
    pub struct_value: Option<u64>,
    /// The game's editor action that makes every player of a team fully familiar with its tactic: `(map*)`, the map
    /// holding under 'dref' a struct whose own map holds the team's reference under 'dref'. Returns nothing.
    pub maximise_tactics: Option<u64>,
    /// `(rules root, nation, women's)`: the work permit rules of the nation, for its men's or women's football, or
    /// the game's default ones. Only reads.
    pub work_permit_rules: Option<u64>,
    /// `(rules, identity block, club team, 1, 0, 6, 0, no date*, no date*, null)`: whether the rules say the player
    /// needs a work permit to play for the team, as a bool. The game asks it before it gives a permit, and its screens
    /// ask it too. Only reads.
    pub needs_work_permit: Option<u64>,
}

impl CallRvas {
    /// Every function listed.
    pub fn all(&self) -> Vec<u64> {
        [
            self.entity_changed,
            self.refresh_views,
            self.add_injury,
            self.set_work_permit,
            self.find_work_permit,
            self.remove_work_permit,
            self.start_loan,
            self.sign_free_agent,
            self.map_new,
            self.map_drop,
            self.refs_drop,
            self.end_contract,
            self.withdraw_offers,
            self.leave_team,
            self.date_type,
            self.date_value,
            self.map_insert,
            self.value_drop,
            self.cancel_offer,
            self.drop_dated_transfer,
            self.ref_copy,
            self.ref_drop,
            self.ref_assign,
            self.struct_value,
            self.maximise_tactics,
            self.work_permit_rules,
            self.needs_work_permit,
        ]
        .into_iter()
        .flatten()
        .collect()
    }
}

/// The human manager's flags word, traced statically on the arm64 half of Steam build 26340721: the
/// `become_unsackable` action toggles bit 1 of the u32 at `flags` from the start of a `db::HUMAN_NON_PLAYER`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HumanManagerLayout {
    /// Offset of the flags word from the start of the object, not shifted with the person block.
    pub flags: u64,
    /// The shift of the person block of a human manager on this build: the only one the flags were traced at.
    pub person_shift: u64,
    /// The mangled class name a human manager's vtable resolves to.
    pub class: String,
    /// Where in the object the vtable that names the class is: 0 on macOS, the person block on Windows.
    #[serde(default)]
    pub class_at: u64,
}

/// Identifies a build of the game plugin from its headers as mapped in memory.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(untagged, deny_unknown_fields)]
pub enum PluginFingerprint {
    /// `game_plugin.dll` on Windows: two values of its PE header.
    Pe { size_of_image: u32, link_timestamp: u32 },
    /// `game_plugin` on macOS: its `LC_UUID`. The arm64 and the Intel half of the universal
    /// binary have one each, so a build has a profile per architecture.
    MachO {
        #[serde(deserialize_with = "uuid_from_text")]
        uuid: [u8; 16],
    },
}

impl PluginFingerprint {
    /// Reads the fingerprint of the game plugin `plugin` from the headers mapped in `process`.
    #[cfg(windows)]
    pub fn read(process: &Process, plugin: &Module) -> fmlens_mem::Result<Self> {
        let image = fmlens_mem::PeImage::read(process, plugin.base)?;
        Ok(Self::Pe { size_of_image: image.size_of_image, link_timestamp: image.timestamp })
    }

    /// Reads the fingerprint of the game plugin `plugin` from the headers mapped in `process`.
    #[cfg(target_os = "macos")]
    pub fn read(process: &Process, plugin: &Module) -> fmlens_mem::Result<Self> {
        let image = fmlens_mem::MachImage::read(process, plugin.base)?;
        let uuid = image.uuid.ok_or(fmlens_mem::Error::InvalidMachO { base: plugin.base, reason: "no LC_UUID" })?;
        Ok(Self::MachO { uuid })
    }
}

impl fmt::Display for PluginFingerprint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PluginFingerprint::Pe { size_of_image, link_timestamp } => {
                write!(f, "size of image {size_of_image:#x}, link timestamp {link_timestamp:#010x}")
            }
            PluginFingerprint::MachO { uuid } => {
                let hex = |bytes: &[u8]| bytes.iter().map(|b| format!("{b:02X}")).collect::<String>();
                let (a, b, c, d, e) = (&uuid[..4], &uuid[4..6], &uuid[6..8], &uuid[8..10], &uuid[10..]);
                write!(f, "UUID {}-{}-{}-{}-{}", hex(a), hex(b), hex(c), hex(d), hex(e))
            }
        }
    }
}

/// A UUID as macOS writes it, e.g. "9E8E47DE-F704-314C-917D-C32D12637678".
fn uuid_from_text<'de, D: Deserializer<'de>>(deserializer: D) -> Result<[u8; 16], D::Error> {
    let text = String::deserialize(deserializer)?;
    let hex: String = text.chars().filter(|&c| c != '-').collect();
    let bytes: Option<Vec<u8>> = (0..hex.len())
        .step_by(2)
        .map(|i| hex.get(i..i + 2).and_then(|pair| u8::from_str_radix(pair, 16).ok()))
        .collect();
    bytes.and_then(|bytes| bytes.try_into().ok()).ok_or_else(|| serde::de::Error::custom(format!("not a UUID: {text}")))
}

/// RVAs in the game plugin of the `(begin, end)` pairs of the entity arrays.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArrayRvas {
    pub players: u64,
    pub staff: u64,
    pub clubs: u64,
}

#[cfg(windows)]
const LAYOUTS: &[&str] = &[include_str!("../../../profiles/fm27/layout.toml")];

/// On macOS the game is built with clang, which lays some of its classes out otherwise.
#[cfg(target_os = "macos")]
const LAYOUTS: &[&str] = &[include_str!("../../../profiles/fm27/layout-macos.toml")];

const BUILDS: &[&str] = &[
    include_str!("../../../profiles/fm27/gamepass-0.9.2355.0.toml"),
    include_str!("../../../profiles/fm27/gamepass-0.9.2409.0.toml"),
    include_str!("../../../profiles/fm27/steam-26227640.toml"),
    include_str!("../../../profiles/fm27/steam-26340721.toml"),
    include_str!("../../../profiles/fm27/steam-26385295.toml"),
    include_str!("../../../profiles/fm27/steam-26577676.toml"),
    include_str!("../../../profiles/fm27/steam-26227640-macos-x86_64.toml"),
    include_str!("../../../profiles/fm27/steam-26227640-macos-arm64.toml"),
    include_str!("../../../profiles/fm27/steam-26340721-macos-x86_64.toml"),
    include_str!("../../../profiles/fm27/steam-26340721-macos-arm64.toml"),
    include_str!("../../../profiles/fm27/steam-26385295-macos-x86_64.toml"),
    include_str!("../../../profiles/fm27/steam-26385295-macos-arm64.toml"),
    include_str!("../../../profiles/fm27/steam-26577676-macos-x86_64.toml"),
    include_str!("../../../profiles/fm27/steam-26577676-macos-arm64.toml"),
];

/// The built-in object layout for `edition`, if there is one.
pub fn layout_for(edition: u32) -> Option<Layout> {
    LAYOUTS.iter().map(|text| parse::<Layout>(text)).find(|layout| layout.edition == edition)
}

/// The built-in build profile matching `fingerprint`, if there is one.
pub fn profile_for(fingerprint: PluginFingerprint) -> Option<BuildProfile> {
    BUILDS.iter().map(|text| parse::<BuildProfile>(text)).find(|profile| profile.plugin == fingerprint)
}

fn parse<T: serde::de::DeserializeOwned>(text: &str) -> T {
    toml::from_str(text).expect("built-in profiles are checked by the unit tests")
}

#[cfg(test)]
mod tests {
    use super::*;

    const WINDOWS: &str = include_str!("../../../profiles/fm27/layout.toml");
    const MACOS: &str = include_str!("../../../profiles/fm27/layout-macos.toml");

    /// A like or dislike keeps a person as his identity block and reads its UID where a club's record keeps one, so
    /// pointing one at a player or member of staff needs both layouts to agree.
    #[test]
    fn a_persons_identity_block_holds_the_uid_where_a_club_does() {
        for text in [WINDOWS, MACOS] {
            let layout = parse::<Layout>(text);
            assert_eq!(layout.player.uid - layout.player.identity(), layout.club.uid);
            assert_eq!(layout.staff.uid - layout.staff.identity(), layout.club.uid);
        }
    }

    #[test]
    fn attribute_groups_cover_the_layout() {
        for text in [WINDOWS, MACOS] {
            let layout: Layout = parse(text);
            let mut grouped: Vec<&str> =
                crate::ATTRIBUTE_GROUPS.iter().flat_map(|(_, keys)| keys.iter().copied()).collect();
            grouped.sort_unstable();
            let mut mapped: Vec<&str> = layout.player.attributes.keys().map(String::as_str).collect();
            mapped.sort_unstable();
            assert_eq!(grouped, mapped);
        }
    }

    #[test]
    fn the_mac_layout_follows_the_windows_one() {
        let (windows, mac): (Layout, Layout) = (parse(WINDOWS), parse(MACOS));
        assert_eq!(windows.player.identity(), windows.player.person_block);
        assert_eq!(windows.staff.identity(), windows.staff.person_block);
        // MSVC puts the signing's ACTUAL_PERSON after the person block's PERSON; on macOS they start together.
        assert_eq!(windows.player.actual_person(), windows.player.person_block + 0x28);
        assert_eq!(windows.staff.actual_person(), windows.staff.person_block + 0x28);
        assert_eq!(
            (mac.player.actual_person(), mac.staff.actual_person()),
            (mac.player.person_block, mac.staff.person_block)
        );

        // The player's own fields sit 8 bytes earlier, the person's 0x40, the identity block 0x100 later.
        for (key, &offset) in &windows.player.attributes {
            assert_eq!(mac.player.attributes[key], offset - 8, "{key}");
        }
        assert_eq!(
            (mac.player.positions, mac.player.morale, mac.player.jadedness),
            (windows.player.positions - 8, windows.player.morale - 8, windows.player.jadedness - 8)
        );
        assert_eq!(mac.player.date_of_birth, windows.player.date_of_birth - 0x40);
        assert_eq!(mac.player.traits, windows.player.traits - 0x40);
        assert_eq!(mac.player.relations, windows.player.relations - 0x40);
        assert_eq!(mac.player.international_caps, windows.player.international_caps - 0x40);
        assert_eq!(mac.player.identity(), windows.player.identity() + 0x100);
        assert_eq!(mac.player.uid - mac.player.identity(), windows.player.uid - windows.player.identity());
        // Paul Ifill, a player-coach: his UID at 0x48C.
        assert_eq!(mac.player.at(mac.player.uid, 0xF8), 0x48C);
        assert_eq!(mac.player.at(mac.player.team, 0xF8), mac.player.team);

        // Staff keep their own fields where they are; their identity block also ends the person.
        assert_eq!(mac.staff.attributes, windows.staff.attributes);
        assert_eq!(mac.staff.current_ability, windows.staff.current_ability);
        assert_eq!(mac.staff.uid - mac.staff.identity(), windows.staff.uid - windows.staff.identity());
        assert_eq!(mac.player.identity() - mac.player.person_block, mac.staff.identity() - mac.staff.person_block);

        // The records the people point at are laid out alike.
        assert_eq!(mac.contract.end(), windows.contract.end());
        assert_eq!(mac.team.end(), windows.team.end());
        assert_eq!(mac.club_finance.end(), windows.club_finance.end());
        assert_eq!(
            (mac.ban.list, mac.ban.started, mac.ban.marker, mac.ban.matches),
            (windows.ban.list, windows.ban.started, windows.ban.marker, windows.ban.matches)
        );
        let relation = |l: &Layout| {
            let r = &l.relation;
            (r.target, r.target_kind, r.relation, r.value, r.size)
        };
        assert_eq!(relation(&mac), relation(&windows));
        let stadium = |l: &Layout| {
            let s = l.stadium.as_ref().expect("stadiums");
            (s.team_pointer, s.name, s.capacity, s.seating, s.used, s.expansion, s.owner)
        };
        assert_eq!(stadium(&mac), stadium(&windows));
        // The retirement manager's lists and entries too; a player keeps the game's id 8 bytes into his identity
        // block. The static pointer to the manager is placed by the build profiles.
        let retirement = |l: &Layout| {
            let r = l.retirement.as_ref().expect("planned retirements");
            (r.planned, r.by_person, r.person, r.date, r.player_person - l.player.identity())
        };
        assert_eq!(retirement(&mac), retirement(&windows));
        // The game's own allocator, with the same size classes on both systems.
        assert_eq!(mac.heap.block_sizes, windows.heap.block_sizes);
    }

    #[test]
    fn fingerprints_parse() {
        let pe: PluginFingerprint = toml::from_str("size_of_image = 0x10\nlink_timestamp = 0x20").expect("PE");
        assert_eq!(pe, PluginFingerprint::Pe { size_of_image: 0x10, link_timestamp: 0x20 });
        let mach_o: PluginFingerprint =
            toml::from_str(r#"uuid = "9E8E47DE-F704-314C-917D-C32D12637678""#).expect("Mach-O");
        assert_eq!(mach_o.to_string(), "UUID 9E8E47DE-F704-314C-917D-C32D12637678");
        assert!(toml::from_str::<PluginFingerprint>(r#"uuid = "9E8E47DE-F704""#).is_err());
        assert!(toml::from_str::<PluginFingerprint>("size_of_image = 1\nlink_timestamp = 2\nuuid = 3").is_err());
    }

    #[test]
    fn built_in_profiles_parse() {
        assert!(layout_for(27).is_some());
        let layout: Layout = parse(WINDOWS);
        assert_eq!(layout.player.uid, 0x294);
        assert_eq!(layout.player.at(layout.player.uid, 0xF8), 0x38C);
        assert_eq!(layout.player.at(layout.player.team, 0xF8), 0x130);

        // Lists measured on the test save: 19 pointers in 160 bytes, 29 in 256, 33 to 36 in 288, 41 in 384.
        assert_eq!(layout.heap.block_size(19 * 8), Some(160));
        assert_eq!(layout.heap.block_size(29 * 8), Some(256));
        assert_eq!(layout.heap.block_size(33 * 8), Some(288));
        assert_eq!(layout.heap.block_size(36 * 8), Some(288));
        assert_eq!(layout.heap.block_size(41 * 8), Some(384));
        assert_eq!(layout.heap.block_size(18 * 8), None);
        assert_eq!(layout.heap.block_size(65 * 8), None);

        let fingerprint = PluginFingerprint::Pe { size_of_image: 0x1943_6000, link_timestamp: 0x6ADF_B161 };
        let profile = profile_for(fingerprint).expect("Game Pass 0.9.2355.0 profile");
        assert_eq!(profile.storefront, Storefront::GamePass);
        assert_eq!(profile.arrays.players, 0x568_1DC0);
        assert_eq!(profile.edition, layout.edition);
        // The static pointer to the retirement manager, 0xED60 before the players pair on this build.
        assert_eq!(profile.retirement_manager, Some(0x567_3060));

        // The Game Pass update of November 2026: everything 0x2000 further, and the in-game date apart from the arrays.
        let fingerprint = PluginFingerprint::Pe { size_of_image: 0x175D_A000, link_timestamp: 0x6AE5_63A1 };
        let profile = profile_for(fingerprint).expect("Game Pass 0.9.2409.0 profile");
        assert_eq!(profile.storefront, Storefront::GamePass);
        assert_eq!(profile.package_version.as_deref(), Some("0.9.2409.0"));
        assert_eq!(
            (profile.arrays.players, profile.arrays.staff, profile.arrays.clubs),
            (0x568_3DC0, 0x568_3E08, 0x568_3F78)
        );
        assert_eq!(profile.current_date, Some(0x562_57C8));
        assert_eq!(profile.retirement_manager, Some(profile.arrays.players - 0xED60));

        // The same version on Steam, packaged differently: another fingerprint and other RVAs, the manager's static
        // 0xDAC0 before the players pair.
        let fingerprint = PluginFingerprint::Pe { size_of_image: 0x19E6_9000, link_timestamp: 0x6ADF_B11C };
        let profile = profile_for(fingerprint).expect("Steam build 26227640 profile");
        assert_eq!(profile.storefront, Storefront::Steam);
        assert_eq!(profile.arrays.players, 0x570_37D0);
        assert_eq!(profile.edition, layout.edition);
        assert_eq!(profile.retirement_manager, Some(0x56F_5D10));

        // 27.0.0 on Steam (build 26340721): moved as Game Pass 0.9.2409.0 did, the date apart from the arrays.
        let fingerprint = PluginFingerprint::Pe { size_of_image: 0x1821_C000, link_timestamp: 0x6AE5_65AF };
        let profile = profile_for(fingerprint).expect("Steam build 26340721 profile");
        assert_eq!(profile.storefront, Storefront::Steam);
        assert_eq!(
            (profile.arrays.players, profile.arrays.staff, profile.arrays.clubs),
            (0x570_57D0, 0x570_5818, 0x570_5988)
        );
        assert_eq!(profile.current_date, Some(0x56A_F378));
        assert_eq!(profile.retirement_manager, Some(profile.arrays.players - 0xDAC0));

        // On macOS, the Intel half of the same build: told apart by its LC_UUID.
        let uuid = [0x22, 0xCF, 0xE5, 0xC3, 0xB5, 0xCF, 0x3C, 0x00, 0x80, 0x43, 0x1E, 0xA1, 0x90, 0xA6, 0x9B, 0x89];
        let profile = profile_for(PluginFingerprint::MachO { uuid }).expect("Steam build 26227640 on macOS profile");
        assert_eq!(profile.storefront, Storefront::Steam);
        assert_eq!(profile.arrays.players, 0x5C8_91C8);
        assert_eq!((profile.arrays.staff, profile.arrays.clubs), (0x5C8_9210, 0x5C8_9380));
        assert_eq!(profile.retirement_manager, Some(0x5C5_FEF0));

        // Its arm64 half, which Apple silicon runs natively: other RVAs, and the date apart.
        let uuid = [0x9E, 0x8E, 0x47, 0xDE, 0xF7, 0x04, 0x31, 0x4C, 0x91, 0x7D, 0xC3, 0x2D, 0x12, 0x63, 0x76, 0x78];
        let profile = profile_for(PluginFingerprint::MachO { uuid }).expect("the arm64 half's profile");
        assert_eq!(profile.arrays.players, 0x56D_2E18);
        assert_eq!(profile.current_date, Some(0x56B_1DB8));
        assert_eq!(profile.retirement_manager, Some(0x56A_82A8));

        // 27.0.0 (Steam build 26340721): new UUIDs for both halves, the Launch Preview's RVAs.
        let uuid = [0xF4, 0x54, 0x03, 0x55, 0x21, 0x86, 0x39, 0xCB, 0x91, 0x19, 0xC7, 0x06, 0xA6, 0xA3, 0x53, 0x46];
        let profile = profile_for(PluginFingerprint::MachO { uuid }).expect("27.0.0's arm64 half");
        assert_eq!(profile.arrays.players, 0x56D_2E18);
        assert_eq!(profile.current_date, Some(0x56B_1DB8));
        let uuid = [0x09, 0x81, 0xAB, 0x31, 0xAC, 0x3B, 0x3D, 0x93, 0x94, 0x4F, 0x47, 0xFE, 0x4B, 0x59, 0xCD, 0x9E];
        let profile = profile_for(PluginFingerprint::MachO { uuid }).expect("27.0.0's Intel half");
        assert_eq!(profile.arrays.players, 0x5C8_91C8);
        assert_eq!(profile.current_date, Some(0x5C6_9700));

        // On Windows the Launch Preview's date sits with the arrays.
        let fingerprint = PluginFingerprint::Pe { size_of_image: 0x19E6_9000, link_timestamp: 0x6ADF_B11C };
        assert_eq!(profile_for(fingerprint).and_then(|profile| profile.current_date), None);
    }

    #[test]
    fn only_the_traced_builds_know_the_human_manager() {
        let arm64 = [0xF4, 0x54, 0x03, 0x55, 0x21, 0x86, 0x39, 0xCB, 0x91, 0x19, 0xC7, 0x06, 0xA6, 0xA3, 0x53, 0x46];
        let intel = [0x09, 0x81, 0xAB, 0x31, 0xAC, 0x3B, 0x3D, 0x93, 0x94, 0x4F, 0x47, 0xFE, 0x4B, 0x59, 0xCD, 0x9E];
        // 27.0.1 carries the layout across.
        let arm64_1 = [0x2A, 0x2D, 0x0E, 0xD6, 0x32, 0x4E, 0x3D, 0x0D, 0xA2, 0x7D, 0x10, 0xAE, 0xDB, 0xD0, 0xE2, 0x70];
        let intel_1 = [0x94, 0xCD, 0xDC, 0x80, 0x84, 0x74, 0x32, 0x7A, 0x85, 0xE0, 0xE4, 0xFF, 0x95, 0xDC, 0x68, 0x93];
        // Build 26577676 is 27.0.1 with the same functions and statics.
        let arm64_2 = [0xA8, 0x55, 0x0B, 0x47, 0xFD, 0xE0, 0x3D, 0x0D, 0xA6, 0xCB, 0x1B, 0x63, 0xDE, 0xE8, 0xDA, 0x19];
        let intel_2 = [0xDD, 0x0E, 0xE1, 0x57, 0x4C, 0x9C, 0x31, 0xA7, 0x81, 0xDD, 0x0D, 0x11, 0x22, 0xE6, 0x2F, 0xC7];
        let traced = [arm64, intel, arm64_1, intel_1, arm64_2, intel_2].map(|uuid| PluginFingerprint::MachO { uuid });
        for plugin in &traced {
            let profile = profile_for(*plugin).expect("27.0.0 or 27.0.1 on macOS");
            assert_eq!(
                profile.human_manager,
                Some(HumanManagerLayout {
                    flags: 0x3FC,
                    person_shift: 0x340,
                    class: "N2db16HUMAN_NON_PLAYERE".to_owned(),
                    class_at: 0
                })
            );
        }
        let windows = PluginFingerprint::Pe { size_of_image: 0x1821_C000, link_timestamp: 0x6AE5_65AF };
        assert_eq!(
            profile_for(windows).expect("27.0.0 on Windows").human_manager,
            Some(HumanManagerLayout {
                flags: 0x3FC,
                person_shift: 0x340,
                class: ".?AVHUMAN_NON_PLAYER@db@@".to_owned(),
                class_at: 0x440
            })
        );
        let windows_1 = PluginFingerprint::Pe { size_of_image: 0x17CB_9000, link_timestamp: 0x6AE8_B5A4 };
        assert_eq!(
            profile_for(windows_1).expect("27.0.1 on Windows").human_manager,
            profile_for(windows).expect("27.0.0 on Windows").human_manager
        );
        let windows_2 = PluginFingerprint::Pe { size_of_image: 0x185F_A000, link_timestamp: 0x6AF3_8E5C };
        assert_eq!(
            profile_for(windows_2).expect("build 26577676 on Windows").human_manager,
            profile_for(windows).expect("27.0.0 on Windows").human_manager
        );
        for text in BUILDS {
            let profile: BuildProfile = parse(text);
            if !traced.contains(&profile.plugin) && ![windows, windows_1, windows_2].contains(&profile.plugin) {
                assert!(profile.human_manager.is_none(), "{}", profile.name);
            }
        }
    }

    /// 27.0.1 (Steam build 26385295) moved every static and every function; its macOS profiles carry 27.0.0's values
    /// across, the block of table pointers moved as one.
    #[test]
    fn steam_27_0_1_on_macos_carries_27_0_0_across() {
        let old_arm64 =
            [0xF4, 0x54, 0x03, 0x55, 0x21, 0x86, 0x39, 0xCB, 0x91, 0x19, 0xC7, 0x06, 0xA6, 0xA3, 0x53, 0x46];
        let old_intel =
            [0x09, 0x81, 0xAB, 0x31, 0xAC, 0x3B, 0x3D, 0x93, 0x94, 0x4F, 0x47, 0xFE, 0x4B, 0x59, 0xCD, 0x9E];
        let arm64 = [0x2A, 0x2D, 0x0E, 0xD6, 0x32, 0x4E, 0x3D, 0x0D, 0xA2, 0x7D, 0x10, 0xAE, 0xDB, 0xD0, 0xE2, 0x70];
        let intel = [0x94, 0xCD, 0xDC, 0x80, 0x84, 0x74, 0x32, 0x7A, 0x85, 0xE0, 0xE4, 0xFF, 0x95, 0xDC, 0x68, 0x93];
        let profile = |uuid| profile_for(PluginFingerprint::MachO { uuid }).expect("27.0.0 or 27.0.1 on macOS");
        for (new, old, moved, date) in
            [(arm64, old_arm64, 0x9_C038, 0x574_DDB8), (intel, old_intel, 0x7_A020, 0x5CE_3700)]
        {
            let (new, old) = (profile(new), profile(old));
            assert_eq!(new.storefront, Storefront::Steam);
            assert_eq!(new.current_date, Some(date));
            assert_eq!(
                (new.arrays.players, new.arrays.staff, new.arrays.clubs),
                (old.arrays.players + moved, old.arrays.staff + moved, old.arrays.clubs + moved)
            );
            assert_eq!(new.officials, old.officials.map(|rva| rva + moved));
            assert_eq!(new.awards, old.awards.map(|rva| rva + moved));
            assert_eq!(new.competitions, old.competitions.map(|rva| rva + moved));
            assert_eq!(new.injury_kinds, old.injury_kinds.map(|rva| rva + moved));
            assert_eq!(new.human_manager, old.human_manager);
            assert_eq!(new.work_permit_check.is_some(), old.work_permit_check.is_some());
            let count = |calls: Option<CallRvas>| calls.map(|calls| calls.all().len());
            assert_eq!(count(new.calls), count(old.calls));
        }
    }

    /// The update of 12 November 2026 (Steam build 26577676) rebuilt game_plugin. On macOS every function and static
    /// FM Lens uses is where build 26385295 has it; the two constants it reads from `__TEXT`, the loan's default bytes
    /// and the date for none, sit 0x30 further in both halves.
    #[test]
    fn steam_26577676_on_macos_is_26385295_with_two_constants_moved() {
        let old_arm64 =
            [0x2A, 0x2D, 0x0E, 0xD6, 0x32, 0x4E, 0x3D, 0x0D, 0xA2, 0x7D, 0x10, 0xAE, 0xDB, 0xD0, 0xE2, 0x70];
        let old_intel =
            [0x94, 0xCD, 0xDC, 0x80, 0x84, 0x74, 0x32, 0x7A, 0x85, 0xE0, 0xE4, 0xFF, 0x95, 0xDC, 0x68, 0x93];
        let arm64 = [0xA8, 0x55, 0x0B, 0x47, 0xFD, 0xE0, 0x3D, 0x0D, 0xA6, 0xCB, 0x1B, 0x63, 0xDE, 0xE8, 0xDA, 0x19];
        let intel = [0xDD, 0x0E, 0xE1, 0x57, 0x4C, 0x9C, 0x31, 0xA7, 0x81, 0xDD, 0x0D, 0x11, 0x22, 0xE6, 0x2F, 0xC7];
        let profile = |uuid| profile_for(PluginFingerprint::MachO { uuid }).expect("27.0.1 on macOS");
        for (new, old) in [(arm64, old_arm64), (intel, old_intel)] {
            let (mut new, old) = (profile(new), profile(old));
            assert!(new.name.contains("26577676"), "{}", new.name);
            new.name.clone_from(&old.name);
            new.plugin = old.plugin;
            let loan = new.starting_loan.as_mut().expect("starting loan");
            assert_eq!(Some(loan.defaults), old.starting_loan.as_ref().map(|loan| loan.defaults + 0x30));
            loan.defaults -= 0x30;
            let check = new.work_permit_check.as_mut().expect("the work permit check");
            assert_eq!(Some(check.no_date), old.work_permit_check.as_ref().map(|check| check.no_date + 0x30));
            check.no_date -= 0x30;
            assert_eq!(format!("{new:?}"), format!("{old:?}"));
        }
    }

    /// The same update on Windows: another DLL (size and link time), every value where build 26385295 has it.
    #[test]
    fn steam_26577676_on_windows_is_26385295_under_another_fingerprint() {
        let old = PluginFingerprint::Pe { size_of_image: 0x17CB_9000, link_timestamp: 0x6AE8_B5A4 };
        let new = PluginFingerprint::Pe { size_of_image: 0x185F_A000, link_timestamp: 0x6AF3_8E5C };
        let (old, mut new) = (profile_for(old).expect("27.0.1"), profile_for(new).expect("build 26577676"));
        assert!(new.name.contains("26577676"), "{}", new.name);
        new.name.clone_from(&old.name);
        new.plugin = old.plugin;
        assert_eq!(format!("{new:?}"), format!("{old:?}"));
    }

    /// 27.0.1 on Windows: another DLL (size and link time), every static in the block of table pointers 0x11B040 further.
    #[test]
    fn steam_27_0_1_on_windows_carries_27_0_0_across() {
        let old = PluginFingerprint::Pe { size_of_image: 0x1821_C000, link_timestamp: 0x6AE5_65AF };
        let new = PluginFingerprint::Pe { size_of_image: 0x17CB_9000, link_timestamp: 0x6AE8_B5A4 };
        let (old, new) = (profile_for(old).expect("27.0.0"), profile_for(new).expect("27.0.1"));
        let moved = 0x11_B040;
        assert_eq!(new.storefront, Storefront::Steam);
        assert_eq!(new.current_date, old.current_date.map(|rva| rva + moved));
        assert_eq!(
            (new.arrays.players, new.arrays.staff, new.arrays.clubs),
            (old.arrays.players + moved, old.arrays.staff + moved, old.arrays.clubs + moved)
        );
        assert_eq!(new.officials, old.officials.map(|rva| rva + moved));
        assert_eq!(new.transfer_manager, old.transfer_manager.map(|rva| rva + moved));
        assert_eq!(new.retirement_manager, Some(new.arrays.players - 0xDAC0));
        let calls = new.calls.expect("27.0.1's calls");
        assert_eq!((calls.withdraw_offers, calls.leave_team), (Some(0xB3_3630), Some(0xB2_CFB0)));
        assert_eq!(calls.all().len(), old.calls.expect("27.0.0's calls").all().len());
    }

    #[test]
    fn both_halves_of_27_0_0_on_macos_find_the_officials() {
        let arm64 = [0xF4, 0x54, 0x03, 0x55, 0x21, 0x86, 0x39, 0xCB, 0x91, 0x19, 0xC7, 0x06, 0xA6, 0xA3, 0x53, 0x46];
        let intel = [0x09, 0x81, 0xAB, 0x31, 0xAC, 0x3B, 0x3D, 0x93, 0x94, 0x4F, 0x47, 0xFE, 0x4B, 0x59, 0xCD, 0x9E];
        let officials = |uuid| profile_for(PluginFingerprint::MachO { uuid }).and_then(|profile| profile.officials);
        assert_eq!(officials(arm64), Some(0x56D_2E90));
        assert_eq!(officials(intel), Some(0x5C8_9240));
    }

    #[test]
    fn both_halves_of_27_0_0_on_macos_have_work_permits() {
        let arm64 = [0xF4, 0x54, 0x03, 0x55, 0x21, 0x86, 0x39, 0xCB, 0x91, 0x19, 0xC7, 0x06, 0xA6, 0xA3, 0x53, 0x46];
        let intel = [0x09, 0x81, 0xAB, 0x31, 0xAC, 0x3B, 0x3D, 0x93, 0x94, 0x4F, 0x47, 0xFE, 0x4B, 0x59, 0xCD, 0x9E];
        let permits = |uuid| {
            let profile = profile_for(PluginFingerprint::MachO { uuid }).expect("27.0.0 on macOS");
            let calls = profile.calls.unwrap_or_default();
            (profile.transfer_manager, calls.set_work_permit, calls.find_work_permit, calls.remove_work_permit)
        };
        assert_eq!(permits(arm64), (Some(0x56A_49F8), Some(0x2D8_5294), Some(0x2DD_D12C), Some(0x2DC_0210)));
        assert_eq!(permits(intel), (Some(0x5C5_DE80), Some(0x309_A010), Some(0x30F_C8E0), Some(0x30D_8D20)));
        let intel = profile_for(PluginFingerprint::MachO { uuid: intel }).and_then(|profile| profile.calls);
        assert_eq!(intel.map(|calls| calls.all().len()), Some(26), "the traced Intel game calls");
    }

    #[test]
    fn both_halves_of_27_0_0_on_macos_refresh_fm() {
        let arm64 = [0xF4, 0x54, 0x03, 0x55, 0x21, 0x86, 0x39, 0xCB, 0x91, 0x19, 0xC7, 0x06, 0xA6, 0xA3, 0x53, 0x46];
        let intel = [0x09, 0x81, 0xAB, 0x31, 0xAC, 0x3B, 0x3D, 0x93, 0x94, 0x4F, 0x47, 0xFE, 0x4B, 0x59, 0xCD, 0x9E];
        let refresh = |uuid| {
            let profile = profile_for(PluginFingerprint::MachO { uuid }).expect("27.0.0 on macOS");
            let calls = profile.calls.unwrap_or_default();
            (profile.game_ui, calls.entity_changed, calls.refresh_views)
        };
        assert_eq!(refresh(arm64), (Some(0x56D_48B8), Some(0x3_0B50), Some(0x2_FC20)));
        assert_eq!(refresh(intel), (Some(0x5C8_AC88), Some(0x3_08A0), Some(0x2_FA70)));
    }

    /// Static Intel twins of the ARM64 functions. This pins mapping, not live behavior.
    #[test]
    fn steam_27_0_0_on_intel_finds_what_was_traced() {
        let uuid = [0x09, 0x81, 0xAB, 0x31, 0xAC, 0x3B, 0x3D, 0x93, 0x94, 0x4F, 0x47, 0xFE, 0x4B, 0x59, 0xCD, 0x9E];
        let profile = profile_for(PluginFingerprint::MachO { uuid }).expect("27.0.0 on Intel");
        assert_eq!((profile.awards, profile.competitions), (Some(0x5C8_90C8), Some(0x5C8_90E0)));
        assert_eq!((profile.injury_kinds, profile.injury_manager), (Some(0x5C8_9108), Some(0x5C5_FEE0)));
        let editor = profile.editor.expect("Intel editor tables");
        assert_eq!(
            (editor.value_types, editor.integer_type, editor.teams, editor.enabled),
            (0x5CF_1DC8, 0x28, 0x5C8_9160, 0x5C8_9890)
        );
        let loan = profile.starting_loan.expect("Intel starting loan");
        assert_eq!((loan.vtable, loan.defaults), (0x5B7_71C0, 0x596_4E20));
        let manager = profile.human_manager.expect("Intel human manager");
        assert_eq!(
            (manager.flags, manager.person_shift, manager.class.as_str()),
            (0x3FC, 0x340, "N2db16HUMAN_NON_PLAYERE")
        );
        let calls = profile.calls.expect("Intel game actions");
        assert_eq!(
            calls,
            CallRvas {
                entity_changed: Some(0x3_08A0),
                refresh_views: Some(0x2_FA70),
                add_injury: Some(0x293_F740),
                set_work_permit: Some(0x309_A010),
                find_work_permit: Some(0x30F_C8E0),
                remove_work_permit: Some(0x30D_8D20),
                start_loan: Some(0x312_D0E0),
                sign_free_agent: Some(0x312_1760),
                map_new: Some(0x48F_4260),
                map_drop: Some(0x48F_4300),
                refs_drop: Some(0x48F_B750),
                end_contract: Some(0x305_C2E0),
                withdraw_offers: Some(0x306_08D0),
                leave_team: Some(0x305_9A20),
                date_type: Some(0x47E_C450),
                date_value: Some(0x47E_C640),
                map_insert: Some(0x48F_4910),
                value_drop: Some(0x490_0410),
                cancel_offer: Some(0x302_5BE0),
                drop_dated_transfer: Some(0x197_5560),
                ref_copy: Some(0x7A_20C0),
                ref_drop: Some(0x502_2660),
                ref_assign: None,
                struct_value: Some(0x490_0DF0),
                maximise_tactics: Some(0x256_C7C0),
                work_permit_rules: Some(0x471_8EB0),
                needs_work_permit: Some(0x1DD_B6B0),
            }
        );
        assert_eq!(calls.all().len(), 26);
        let arm: BuildProfile =
            toml::from_str(include_str!("../../../profiles/fm27/steam-26340721-macos-arm64.toml")).unwrap();
        assert_eq!(calls.all().len(), arm.calls.unwrap().all().len());
    }

    /// 27.0.0 on Windows: the statics and the game's own functions traced on the Steam test save (see
    /// docs/EDITING-VALIDATION.md, "Windows reads" and "Windows game actions").
    #[test]
    fn steam_27_0_0_on_windows_finds_what_was_traced() {
        let windows = PluginFingerprint::Pe { size_of_image: 0x1821_C000, link_timestamp: 0x6AE5_65AF };
        let profile = profile_for(windows).expect("27.0.0 on Windows");
        assert_eq!(
            (profile.game_ui, profile.officials, profile.transfer_manager, profile.awards, profile.competitions),
            (Some(0x570_1B50), Some(0x570_5848), Some(0x56F_3A18), Some(0x570_56D0), Some(0x570_56E8))
        );
        assert_eq!((profile.injury_kinds, profile.injury_manager), (Some(0x570_5710), Some(0x56F_7D08)));
        let calls = profile.calls.expect("the game's own actions");
        assert_eq!((calls.entity_changed, calls.refresh_views), (Some(0x1D_81B0), Some(0x1D_73D0)));
        assert_eq!(
            (calls.set_work_permit, calls.find_work_permit, calls.remove_work_permit),
            (Some(0xB5_0C80), Some(0xBB_10C0), Some(0xB8_F540))
        );
        assert_eq!(
            (calls.add_injury, calls.start_loan, calls.sign_free_agent, calls.maximise_tactics),
            (Some(0x2DA_8370), Some(0xBD_F080), Some(0xBD_6270), Some(0x31A_B350))
        );
        assert_eq!((calls.withdraw_offers, calls.leave_team), (Some(0xB1_7790), Some(0xB1_1110)));
        assert_eq!(calls.all().len(), 26, "every call but ref_drop");
    }

    /// What asking whether a player needs a work permit takes, as each build's set_work_permit reads it.
    #[test]
    fn steam_27_0_0_asks_for_work_permits_as_the_game_does() {
        let arm64 = [0xF4, 0x54, 0x03, 0x55, 0x21, 0x86, 0x39, 0xCB, 0x91, 0x19, 0xC7, 0x06, 0xA6, 0xA3, 0x53, 0x46];
        let intel = [0x09, 0x81, 0xAB, 0x31, 0xAC, 0x3B, 0x3D, 0x93, 0x94, 0x4F, 0x47, 0xFE, 0x4B, 0x59, 0xCD, 0x9E];
        let windows = PluginFingerprint::Pe { size_of_image: 0x1821_C000, link_timestamp: 0x6AE5_65AF };
        let check = |fingerprint| {
            let profile = profile_for(fingerprint).expect("27.0.0");
            let calls = profile.calls.unwrap_or_default();
            let rvas = profile.work_permit_check.expect("the work permit check");
            (calls.work_permit_rules, calls.needs_work_permit, rvas.enabled, rvas.rules, rvas.no_date)
        };
        assert_eq!(
            check(PluginFingerprint::MachO { uuid: arm64 }),
            (Some(0x422_4DF4), Some(0x1C3_2B9C), 0x56D_499A, 0x56D_57D0, 0x52E_FDF0)
        );
        assert_eq!(
            check(PluginFingerprint::MachO { uuid: intel }),
            (Some(0x471_8EB0), Some(0x1DD_B6B0), 0x5C8_AD6A, 0x5C8_BBD8, 0x58B_A950)
        );
        assert_eq!(check(windows), (Some(0x182_B490), Some(0x240_C760), 0x570_135A, 0x570_B280, 0x4AF_D81C));
    }
}
