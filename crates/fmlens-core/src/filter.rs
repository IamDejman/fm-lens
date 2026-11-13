use std::cmp::Ordering;
use std::collections::HashMap;
use std::sync::LazyLock;

use fmlens_scout::{Likeness, ROLES, development, role};

use serde::Deserialize;

use crate::clubs::{ClubSummary, StadiumSummary};
use crate::competitions::{AwardSummary, CompetitionSummary};
use crate::date::FmDate;
use crate::details::{ATTRIBUTE_GROUPS, PERSONALITY, POSITIONS};
use crate::game_calls::MANAGER_JOB;
use crate::officials::OfficialSummary;
use crate::players::{NationSummary, PLAYABLE_RATING, PlayerSummary};
use crate::staff::{STAFF_ATTRIBUTE_GROUPS, StaffSummary};
use crate::text::fold;

/// The attribute keys of `groups`, group after group: the order of the summaries' `attributes`.
pub(crate) fn attribute_keys(
    groups: &'static [(&'static str, &'static [&'static str])],
) -> impl Iterator<Item = &'static str> {
    groups.iter().flat_map(|(_, keys)| keys.iter().copied())
}

/// Where each attribute sits in [`PlayerSummary::attributes`] and in [`StaffSummary::attributes`].
static PLAYER_ATTRIBUTES: LazyLock<HashMap<&'static str, usize>> =
    LazyLock::new(|| attribute_keys(ATTRIBUTE_GROUPS).enumerate().map(|(i, key)| (key, i)).collect());
static STAFF_ATTRIBUTES: LazyLock<HashMap<&'static str, usize>> =
    LazyLock::new(|| attribute_keys(STAFF_ATTRIBUTE_GROUPS).enumerate().map(|(i, key)| (key, i)).collect());

/// Where the attribute `key` sits in [`PlayerSummary::attributes`].
pub fn player_attribute(key: &str) -> Option<usize> {
    PLAYER_ATTRIBUTES.get(key).copied()
}

/// Where the attribute `key` sits in [`StaffSummary::attributes`].
pub(crate) fn staff_attribute(key: &str) -> Option<usize> {
    STAFF_ATTRIBUTES.get(key).copied()
}

/// A bound on one attribute as FM shows it (1–20): at least `min` and at most `max`, either of which may be unset.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AttributeBound {
    /// An attribute key of the list's entity, e.g. "finishing" for players or "tactical" for staff.
    pub key: String,
    pub min: Option<u8>,
    pub max: Option<u8>,
}

impl AttributeBound {
    /// Whether `values`, a summary's attributes, keep to the bound. An attribute the entity does not have, or one the
    /// game's layout does not place (0), keeps to no bound: a mass edit must never widen to everyone over it.
    fn holds(&self, index: &HashMap<&'static str, usize>, values: &[u8]) -> bool {
        self.holds_value(index.get(self.key.as_str()).and_then(|&i| values.get(i)).copied())
    }

    /// Whether `value`, the rating the bound's key names, keeps to the bound; none, or 0, keeps to no bound.
    fn holds_value(&self, value: Option<u8>) -> bool {
        match value {
            Some(value) if value > 0 => {
                self.min.is_none_or(|min| value >= min) && self.max.is_none_or(|max| value <= max)
            }
            _ => false,
        }
    }
}

/// Whether `value` is known and within `min` and `max`, either of which may be unset; with neither set it need not be
/// known.
fn within<T: PartialOrd + Copy>(value: Option<T>, min: Option<T>, max: Option<T>) -> bool {
    (min.is_none() && max.is_none())
        || value.is_some_and(|value| min.is_none_or(|min| value >= min) && max.is_none_or(|max| value <= max))
}

/// Filters the player list applies on top of a name search. Unset fields match everyone.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayerFilter {
    /// [`POSITIONS`] keys; matches players rated [`PLAYABLE_RATING`] or more in any of them. A key that is no
    /// position matches no one.
    pub positions: Vec<String>,
    pub min_age: Option<u16>,
    pub max_age: Option<u16>,
    pub min_current_ability: Option<u16>,
    pub max_current_ability: Option<u16>,
    pub min_potential_ability: Option<i16>,
    /// A potential the game keeps as a range (a negative number) keeps to no upper bound.
    pub max_potential_ability: Option<i16>,
    /// Centimetres. A player whose height is not set keeps to no bound.
    pub min_height: Option<u16>,
    pub max_height: Option<u16>,
    /// Pounds per week. A player without a contract keeps to no bound.
    pub min_wage: Option<i32>,
    pub max_wage: Option<i32>,
    /// Pounds, the stored base valuation. A player the game has not valued keeps to no bound.
    pub min_value: Option<i32>,
    pub max_value: Option<i32>,
    /// 0–10000, of his current reputation.
    pub min_reputation: Option<u16>,
    pub max_reputation: Option<u16>,
    /// Part of the nation's name, accents and case ignored.
    pub nation: Needle,
    /// Part of the club's name, accents and case ignored.
    pub club: Needle,
    /// Only players of the club with this UID, e.g. those a player can swap with.
    pub club_uid: Option<u32>,
    /// Only players without a club.
    pub free_agents: bool,
    /// Only players whose contract ends on or before this date.
    pub contract_expires_by: Option<FmDate>,
    /// Only players their club has put on the transfer list, and on the loan list.
    pub transfer_listed: bool,
    pub loan_listed: bool,
    /// Bounds on attributes, every one of which must hold.
    pub attributes: Vec<AttributeBound>,
    /// Bounds on personality ratings, by [`PERSONALITY`] key, every one of which must hold.
    pub personality: Vec<AttributeBound>,
    /// Trait bits (0 to 63): only players who have every one of them.
    pub traits: Vec<u8>,
    /// Bounds on his attributes at his potential, as FM Lens projects them (see [`PlayerSummary::peak_shown`]).
    pub potential_attributes: Vec<AttributeBound>,
    /// Roles the list rates him in; each with a least rating must hold.
    pub roles: Vec<RoleBound>,
    /// The least chance, in percent, that he comes within 7 of his potential, and the least progress rate, in half
    /// stars (see [`fmlens_scout::development`]).
    pub min_development: Option<u8>,
    pub min_progress: Option<u8>,
    /// Part of the name of the country his club is in, accents and case ignored.
    pub based_in: Needle,
}

/// A role the list rates players in (see [`fmlens_scout::Role::id`]), and the least rating (0–100) they must have in it.
/// Without a least rating it holds for everyone: the role is only shown.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RoleBound {
    pub role: String,
    pub min: Option<u8>,
}

impl RoleBound {
    /// Whether `p` keeps to the bound. An unknown role with a least rating keeps to no bound.
    fn holds(&self, p: &PlayerSummary) -> bool {
        let Some(min) = self.min else {
            return true;
        };
        role(&self.role).is_some_and(|role| role.rating(&p.scouted().values(), &p.position_ratings) >= min)
    }
}

impl PlayerFilter {
    /// Whether the scouting bounds hold for `p`: worked out only when one is set.
    fn scouting_holds(&self, p: &PlayerSummary) -> bool {
        if !self.potential_attributes.is_empty() {
            let peak = p.peak_shown();
            if !self.potential_attributes.iter().all(|bound| bound.holds(&PLAYER_ATTRIBUTES, &peak)) {
                return false;
            }
        }
        if self.min_development.is_some() || self.min_progress.is_some() {
            let Some(estimate) = development(&p.scouted()) else {
                return false;
            };
            if self.min_development.is_some_and(|min| estimate.probability < min)
                || self.min_progress.is_some_and(|min| estimate.half_stars < min)
            {
                return false;
            }
        }
        self.roles.iter().all(|bound| bound.holds(p))
    }

    pub fn matches(&self, p: &PlayerSummary) -> bool {
        let position = self.positions.is_empty()
            || self.positions.iter().any(|key| {
                POSITIONS.iter().position(|&k| k == key).is_some_and(|i| p.position_ratings[i] >= PLAYABLE_RATING)
            });
        position
            && self.min_age.is_none_or(|min| p.age.is_some_and(|age| age >= min))
            && self.max_age.is_none_or(|max| p.age.is_some_and(|age| age <= max))
            && self.min_current_ability.is_none_or(|min| p.current_ability >= min)
            && self.max_current_ability.is_none_or(|max| p.current_ability <= max)
            && self.min_potential_ability.is_none_or(|min| p.potential_ability >= min)
            && self.max_potential_ability.is_none_or(|max| p.potential_ability > 0 && p.potential_ability <= max)
            && within(Some(p.height_cm).filter(|&cm| cm > 0), self.min_height, self.max_height)
            && within(p.wage, self.min_wage, self.max_wage)
            && within(p.transfer_value, self.min_value, self.max_value)
            && within(Some(p.current_reputation), self.min_reputation, self.max_reputation)
            && self.nation.found_in(p.nation.as_deref())
            && self.club.found_in(p.club.as_deref())
            && self.club_uid.is_none_or(|uid| p.club_uid == Some(uid))
            && (!self.free_agents || p.club.is_none())
            && self.contract_expires_by.is_none_or(|by| p.contract_expires.is_some_and(|end| end <= by))
            && (!self.transfer_listed || p.transfer_listed)
            && (!self.loan_listed || p.loan_listed)
            && self.attributes.iter().all(|bound| bound.holds(&PLAYER_ATTRIBUTES, &p.attributes))
            && self.personality.iter().all(|bound| {
                bound.holds_value(PERSONALITY.iter().position(|&key| key == bound.key).map(|i| p.personality[i]))
            })
            && self.traits.iter().all(|&bit| bit < 64 && p.traits >> bit & 1 == 1)
            && self.based_in.found_in(p.base.nation.as_deref())
            && self.scouting_holds(p)
    }
}

/// Part of a name a filter looks for, accents and case ignored: folded once, however many rows it is looked for in.
/// An empty one is found in anything.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Needle(Option<String>);

impl Needle {
    pub fn new(text: &str) -> Self {
        let text = text.trim();
        Self((!text.is_empty()).then(|| fold(text)))
    }

    /// Whether `text` contains it; a text that is not known contains none but the empty one.
    fn found_in(&self, text: Option<&str>) -> bool {
        let Some(needle) = &self.0 else {
            return true;
        };
        text.is_some_and(|text| {
            if text.is_ascii() {
                // Folding plain letters only lowers them: most names are compared as they are, with nothing copied.
                let (text, needle) = (text.as_bytes(), needle.as_bytes());
                needle.is_ascii() && text.windows(needle.len()).any(|part| part.eq_ignore_ascii_case(needle))
            } else {
                fold(text).contains(needle.as_str())
            }
        })
    }
}

impl From<&str> for Needle {
    fn from(text: &str) -> Self {
        Self::new(text)
    }
}

impl From<Option<String>> for Needle {
    fn from(text: Option<String>) -> Self {
        text.map_or_else(Self::default, |text| Self::new(&text))
    }
}

impl<'de> Deserialize<'de> for Needle {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(Option::<String>::deserialize(deserializer)?.into())
    }
}

/// What a row is sorted by: a text, compared without accents or case, or a number. A row without the value goes
/// last, whichever way the list is sorted.
pub enum SortKey<'a> {
    Text(Option<&'a str>),
    Number(Option<i64>),
}

/// A column a list can be sorted by: what each row has in it.
pub trait SortColumn: Copy {
    type Row;
    fn key(self, row: &Self::Row) -> SortKey<'_>;
}

/// How a list is sorted: by one of its columns, upwards or downwards.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Order<S> {
    pub by: S,
    #[serde(default)]
    pub ascending: bool,
}

/// Sorts `rows` by `order`; unknown values go last either way. Text compares without accents or case. The sort is
/// stable: equal rows keep their order, which after a search is best first.
pub fn sort_rows<S: SortColumn>(rows: &mut [&S::Row], order: Order<S>) {
    let keys: Vec<SortKey<'_>> = rows.iter().map(|&row| order.by.key(row)).collect();
    // Each distinct text is folded once and stands for its place among the others, so the rows compare as numbers.
    let mut texts: Vec<&str> =
        keys.iter().filter_map(|key| if let SortKey::Text(text) = key { *text } else { None }).collect();
    texts.sort_unstable();
    texts.dedup();
    let mut folded: Vec<(String, &str)> = texts.into_iter().map(|text| (fold(text), text)).collect();
    folded.sort_unstable_by(|a, b| a.0.cmp(&b.0));
    let mut places: HashMap<&str, i64> = HashMap::with_capacity(folded.len());
    let mut place = 0;
    for (i, (text, original)) in folded.iter().enumerate() {
        if i > 0 && folded[i - 1].0 != *text {
            place += 1;
        }
        places.insert(original, place);
    }
    let mut keyed: Vec<(Option<i64>, &S::Row)> = rows
        .iter()
        .zip(keys)
        .map(|(&row, key)| {
            let value = match key {
                SortKey::Number(number) => number,
                SortKey::Text(text) => text.and_then(|text| places.get(text).copied()),
            };
            (value, row)
        })
        .collect();
    keyed.sort_by(|(a, _), (b, _)| match (a, b) {
        (Some(a), Some(b)) if order.ascending => a.cmp(b),
        (Some(a), Some(b)) => b.cmp(a),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    });
    for (slot, (_, row)) in rows.iter_mut().zip(keyed) {
        *slot = row;
    }
}

/// A whole number as a sort key.
fn number(value: impl Into<i64>) -> SortKey<'static> {
    SortKey::Number(Some(value.into()))
}

/// A number that may be unknown as a sort key.
fn known_number(value: Option<impl Into<i64>>) -> SortKey<'static> {
    SortKey::Number(value.map(Into::into))
}

/// Columns the player list can be sorted by. On the wire each is its name in camel case; an attribute is
/// "attribute.finishing".
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum PlayerSort {
    #[default]
    CurrentAbility,
    PotentialAbility,
    Age,
    Name,
    Nation,
    Club,
    ContractExpires,
    Value,
    Wage,
    Reputation,
    /// An attribute, by its place in [`PlayerSummary::attributes`].
    Attribute(usize),
    /// How like the player the list is compared with (see [`sort_by_likeness`]); no player has a value of his own.
    Similarity,
    /// The chance he comes within 7 of his potential.
    Development,
    /// The ability he is expected to gain over two years.
    Progress,
    /// His rating in a role, by its place in [`ROLES`]; "role.anchor.defend" on the wire.
    Role(usize),
}

impl PlayerSort {
    /// The sort `name` stands for on the wire.
    pub fn named(name: &str) -> Option<Self> {
        Some(match name {
            "currentAbility" => Self::CurrentAbility,
            "potentialAbility" => Self::PotentialAbility,
            "age" => Self::Age,
            "name" => Self::Name,
            "nation" => Self::Nation,
            "club" => Self::Club,
            "contractExpires" => Self::ContractExpires,
            "value" => Self::Value,
            "wage" => Self::Wage,
            "reputation" => Self::Reputation,
            "similarity" => Self::Similarity,
            "development" => Self::Development,
            "progress" => Self::Progress,
            other => match other.split_once('.')? {
                ("attribute", key) => Self::Attribute(player_attribute(key)?),
                ("role", id) => Self::Role(ROLES.iter().position(|role| role.id() == id)?),
                _ => return None,
            },
        })
    }
}

impl<'de> Deserialize<'de> for PlayerSort {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let name = String::deserialize(deserializer)?;
        Self::named(&name).ok_or_else(|| serde::de::Error::custom(format!("unknown player sort {name}")))
    }
}

impl SortColumn for PlayerSort {
    type Row = PlayerSummary;

    fn key(self, p: &PlayerSummary) -> SortKey<'_> {
        match self {
            Self::CurrentAbility => number(p.current_ability),
            Self::PotentialAbility => number(p.potential_ability),
            Self::Age => known_number(p.age),
            Self::Name => SortKey::Text(Some(&p.name)),
            Self::Nation => SortKey::Text(p.nation.as_deref()),
            Self::Club => SortKey::Text(p.club.as_deref()),
            Self::ContractExpires => known_number(p.contract_expires.map(FmDate::to_number)),
            Self::Value => known_number(p.transfer_value),
            Self::Wage => known_number(p.wage),
            Self::Reputation => number(p.current_reputation),
            // One the layout does not place (0) is not known.
            Self::Attribute(i) => known_number(p.attributes.get(i).copied().filter(|&value| value > 0)),
            Self::Similarity => SortKey::Number(None),
            Self::Development => known_number(development(&p.scouted()).map(|d| d.probability)),
            // The gain to a hundredth of a point, so that two players a fraction apart keep their order.
            Self::Progress => known_number(development(&p.scouted()).map(|d| (f64::from(d.gain) * 100.0) as i64)),
            Self::Role(i) => {
                known_number(ROLES.get(i).map(|role| role.rating(&p.scouted().values(), &p.position_ratings)))
            }
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayerOrder {
    pub by: PlayerSort,
    pub ascending: bool,
}

/// Sorts `players` by `order` (see [`sort_rows`]). [`PlayerSort::Similarity`] needs the player they are compared with:
/// see [`sort_by_likeness`].
pub fn sort_players(players: &mut [&PlayerSummary], order: PlayerOrder) {
    sort_rows(players, Order { by: order.by, ascending: order.ascending });
}

/// Sorts `players` by how like the player of `likeness` they are, the most alike first unless `ascending`. Stable, as
/// [`sort_rows`] is.
pub fn sort_by_likeness(players: &mut [&PlayerSummary], likeness: &Likeness, ascending: bool) {
    let mut keyed: Vec<(u8, &PlayerSummary)> = players.iter().map(|&p| (likeness.score(&p.scouted()), p)).collect();
    keyed.sort_by(|(a, _), (b, _)| if ascending { a.cmp(b) } else { b.cmp(a) });
    for (slot, (_, player)) in players.iter_mut().zip(keyed) {
        *slot = player;
    }
}

/// Columns the staff list can be sorted by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StaffSort {
    Name,
    Age,
    /// The employer: the club, or the nation of the national team they manage.
    Club,
    Nation,
    CurrentAbility,
    PotentialAbility,
}

impl SortColumn for StaffSort {
    type Row = StaffSummary;

    fn key(self, s: &StaffSummary) -> SortKey<'_> {
        match self {
            Self::Name => SortKey::Text(Some(&s.name)),
            Self::Age => known_number(s.age),
            Self::Club => SortKey::Text(s.club.as_deref().or(s.national.as_ref().map(|job| job.nation.as_str()))),
            Self::Nation => SortKey::Text(s.nation.as_deref()),
            Self::CurrentAbility => number(s.current_ability),
            Self::PotentialAbility => number(s.potential_ability),
        }
    }
}

/// Columns the club list can be sorted by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClubSort {
    Name,
    Nation,
    Reputation,
    Founded,
}

impl SortColumn for ClubSort {
    type Row = ClubSummary;

    fn key(self, c: &ClubSummary) -> SortKey<'_> {
        match self {
            Self::Name => SortKey::Text(Some(&c.name)),
            Self::Nation => SortKey::Text(c.nation.as_deref()),
            Self::Reputation => known_number(c.reputation),
            Self::Founded => known_number(c.founded),
        }
    }
}

/// Columns the stadium list can be sorted by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StadiumSort {
    Name,
    Capacity,
    Seating,
    Expansion,
}

impl SortColumn for StadiumSort {
    type Row = StadiumSummary;

    fn key(self, s: &StadiumSummary) -> SortKey<'_> {
        match self {
            Self::Name => SortKey::Text(Some(crate::index::Listed::display_name(s))),
            Self::Capacity => number(s.capacity),
            Self::Seating => number(s.seating),
            Self::Expansion => number(s.expansion),
        }
    }
}

/// Columns the nation list can be sorted by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NationSort {
    Name,
    Continent,
}

impl SortColumn for NationSort {
    type Row = NationSummary;

    fn key(self, n: &NationSummary) -> SortKey<'_> {
        match self {
            Self::Name => SortKey::Text(Some(&n.name)),
            Self::Continent => SortKey::Text(n.continent.as_deref()),
        }
    }
}

/// Columns the match officials list can be sorted by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OfficialSort {
    Name,
    Age,
    Nation,
    Reputation,
    CurrentAbility,
    PotentialAbility,
}

impl SortColumn for OfficialSort {
    type Row = OfficialSummary;

    fn key(self, o: &OfficialSummary) -> SortKey<'_> {
        match self {
            Self::Name => SortKey::Text(Some(&o.name)),
            Self::Age => known_number(o.age),
            Self::Nation => SortKey::Text(o.nation.as_deref()),
            Self::Reputation => number(o.reputation),
            Self::CurrentAbility => number(o.current_ability),
            Self::PotentialAbility => number(o.potential_ability),
        }
    }
}

/// Columns the competition list can be sorted by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CompetitionSort {
    Name,
    Nation,
    Continent,
    Reputation,
}

impl SortColumn for CompetitionSort {
    type Row = CompetitionSummary;

    fn key(self, c: &CompetitionSummary) -> SortKey<'_> {
        match self {
            Self::Name => SortKey::Text(Some(&c.name)),
            Self::Nation => SortKey::Text(c.nation.as_deref()),
            Self::Continent => SortKey::Text(c.continent.as_deref()),
            Self::Reputation => number(c.reputation),
        }
    }
}

/// Columns the award list can be sorted by.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AwardSort {
    Name,
    Competition,
    Nation,
    Prestige,
}

impl SortColumn for AwardSort {
    type Row = AwardSummary;

    fn key(self, a: &AwardSummary) -> SortKey<'_> {
        match self {
            Self::Name => SortKey::Text(Some(&a.name)),
            Self::Competition => SortKey::Text(a.competition.as_deref()),
            Self::Nation => SortKey::Text(a.nation.as_deref()),
            Self::Prestige => number(a.prestige),
        }
    }
}

/// Filters for the staff list.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StaffFilter {
    /// FM job code; a player-coach variant (code + 1) matches too.
    pub job: Option<u8>,
    /// Only staff without a contract.
    pub unemployed: bool,
    /// Only the career's human managers.
    pub human_only: bool,
    pub min_age: Option<u16>,
    pub max_age: Option<u16>,
    pub min_current_ability: Option<u16>,
    pub max_current_ability: Option<u16>,
    pub min_potential_ability: Option<i16>,
    /// A potential the game keeps as a range (a negative number) keeps to no upper bound.
    pub max_potential_ability: Option<i16>,
    /// Part of the nation's name, accents and case ignored.
    pub nation: Needle,
    /// Part of the employer's name, accents and case ignored.
    pub club: Needle,
    /// Bounds on attributes, every one of which must hold.
    pub attributes: Vec<AttributeBound>,
}

impl StaffFilter {
    pub fn matches(&self, s: &StaffSummary) -> bool {
        self.job.is_none_or(|job| {
            s.job.is_some_and(|code| code == job || code == job + 1) || (job == MANAGER_JOB && s.national.is_some())
        }) && (!self.unemployed || (s.job.is_none() && s.national.is_none()))
            && (!self.human_only || s.is_human)
            && self.min_age.is_none_or(|min| s.age.is_some_and(|age| age >= min))
            && self.max_age.is_none_or(|max| s.age.is_some_and(|age| age <= max))
            && self.min_current_ability.is_none_or(|min| s.current_ability >= min)
            && self.max_current_ability.is_none_or(|max| s.current_ability <= max)
            && self.min_potential_ability.is_none_or(|min| s.potential_ability >= min)
            && self.max_potential_ability.is_none_or(|max| s.potential_ability > 0 && s.potential_ability <= max)
            && self.nation.found_in(s.nation.as_deref())
            && (self.club.found_in(s.club.as_deref())
                || s.national.as_ref().is_some_and(|job| self.club.found_in(Some(&job.nation))))
            && self.attributes.iter().all(|bound| bound.holds(&STAFF_ATTRIBUTES, &s.attributes))
    }
}

/// Filters for the club list.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClubFilter {
    /// `Some(true)` for women's clubs only, `Some(false)` for men's clubs only.
    pub women: Option<bool>,
    /// 0–10000, from the senior team. A club with no reputation keeps to no bound.
    pub min_reputation: Option<u16>,
    pub max_reputation: Option<u16>,
    /// A club with no founded year keeps to no bound.
    pub founded_from: Option<u16>,
    pub founded_to: Option<u16>,
    /// Part of the name of the nation the club is from, accents and case ignored.
    pub nation: Needle,
}

impl ClubFilter {
    pub fn matches(&self, c: &ClubSummary) -> bool {
        self.women.is_none_or(|women| c.women == women)
            && self.min_reputation.is_none_or(|min| c.reputation.is_some_and(|reputation| reputation >= min))
            && self.max_reputation.is_none_or(|max| c.reputation.is_some_and(|reputation| reputation <= max))
            && self.founded_from.is_none_or(|from| c.founded.is_some_and(|year| year >= from))
            && self.founded_to.is_none_or(|to| c.founded.is_some_and(|year| year <= to))
            && self.nation.found_in(c.nation.as_deref())
    }
}

/// Filters for the competitions list.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CompetitionFilter {
    /// `Some(true)` for women's competitions only, `Some(false)` for men's only.
    pub women: Option<bool>,
    /// Part of the nation's name, accents and case ignored. An international competition has no nation.
    pub nation: Needle,
    /// Part of the continent's name, accents and case ignored.
    pub continent: Needle,
    /// 0–200.
    pub min_reputation: Option<u16>,
    pub max_reputation: Option<u16>,
}

impl CompetitionFilter {
    pub fn matches(&self, c: &CompetitionSummary) -> bool {
        self.women.is_none_or(|women| c.women == women)
            && self.nation.found_in(c.nation.as_deref())
            && self.continent.found_in(c.continent.as_deref())
            && self.min_reputation.is_none_or(|min| c.reputation >= min)
            && self.max_reputation.is_none_or(|max| c.reputation <= max)
    }
}

/// Filters for the awards list.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AwardFilter {
    /// `Some(true)` for women's awards only, `Some(false)` for men's only.
    pub women: Option<bool>,
    /// Part of the nation's name, accents and case ignored.
    pub nation: Needle,
    /// FM's code for who gets it (see [`AwardSummary::recipients`]).
    pub recipients: Option<u8>,
    /// 0–20.
    pub min_prestige: Option<u8>,
    pub max_prestige: Option<u8>,
}

impl AwardFilter {
    pub fn matches(&self, a: &AwardSummary) -> bool {
        self.women.is_none_or(|women| a.women == women)
            && self.nation.found_in(a.nation.as_deref())
            && self.recipients.is_none_or(|code| a.recipients == code)
            && self.min_prestige.is_none_or(|min| a.prestige >= min)
            && self.max_prestige.is_none_or(|max| a.prestige <= max)
    }
}

/// Filters for the match officials list.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OfficialFilter {
    pub min_age: Option<u16>,
    pub max_age: Option<u16>,
    pub min_current_ability: Option<u16>,
    pub max_current_ability: Option<u16>,
    pub min_potential_ability: Option<u16>,
    pub max_potential_ability: Option<u16>,
    /// 0–10000.
    pub min_reputation: Option<u16>,
    pub max_reputation: Option<u16>,
    /// Part of the nation's name, accents and case ignored.
    pub nation: Needle,
}

impl OfficialFilter {
    pub fn matches(&self, o: &OfficialSummary) -> bool {
        self.min_age.is_none_or(|min| o.age.is_some_and(|age| age >= min))
            && self.max_age.is_none_or(|max| o.age.is_some_and(|age| age <= max))
            && self.min_current_ability.is_none_or(|min| o.current_ability >= min)
            && self.max_current_ability.is_none_or(|max| o.current_ability <= max)
            && self.min_potential_ability.is_none_or(|min| o.potential_ability >= min)
            && self.max_potential_ability.is_none_or(|max| o.potential_ability <= max)
            && self.min_reputation.is_none_or(|min| o.reputation >= min)
            && self.max_reputation.is_none_or(|max| o.reputation <= max)
            && self.nation.found_in(o.nation.as_deref())
    }
}

/// Filters for the nations list.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NationFilter {
    /// Part of the continent's name, accents and case ignored. A nation whose continent was not read matches none.
    pub continent: Needle,
}

impl NationFilter {
    pub fn matches(&self, n: &NationSummary) -> bool {
        self.continent.found_in(n.continent.as_deref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn player(name: &str, age: Option<u16>, ca: u16, club: Option<&str>, st: u8) -> PlayerSummary {
        let mut position_ratings = [1u8; 15];
        position_ratings[12] = st;
        PlayerSummary {
            uid: 1,
            name: name.to_owned(),
            full_name: None,
            date_of_birth: None,
            age,
            nation: Some("Türkiye".to_owned()),
            nation_uid: None,
            club: club.map(str::to_owned),
            club_uid: None,
            positions: Vec::new(),
            contract_expires: Some(FmDate { year: 2027, month: 6, day: 30 }),
            current_ability: ca,
            potential_ability: ca as i16 + 10,
            position_ratings,
            nation_address: 0,
            attributes: vec![10; PLAYER_ATTRIBUTES.len()],
            transfer_listed: false,
            loan_listed: false,
            height_cm: 180,
            wage: Some(50_000),
            transfer_value: Some(20_000_000),
            current_reputation: 7000,
            personality: [10; 8],
            traits: 0,
            base: crate::players::Base::default(),
            address: 0,
            shift: 0,
        }
    }

    fn bound(key: &str, min: Option<u8>, max: Option<u8>) -> AttributeBound {
        AttributeBound { key: key.to_owned(), min, max }
    }

    #[test]
    fn scouting_filters_and_sorts() {
        let mut young = player("Young", Some(18), 100, Some("A"), 20);
        young.potential_ability = 170;
        let mut veteran = player("Veteran", Some(32), 150, Some("B"), 20);
        veteran.potential_ability = 150;
        veteran.attributes[PLAYER_ATTRIBUTES["finishing"]] = 18;
        veteran.base.nation = Some("España".to_owned());

        let by_potential =
            PlayerFilter { potential_attributes: vec![bound("passing", Some(14), None)], ..PlayerFilter::default() };
        assert!(by_potential.matches(&young) && !by_potential.matches(&veteran));
        let developing = PlayerFilter { min_development: Some(10), min_progress: Some(4), ..PlayerFilter::default() };
        assert!(developing.matches(&young) && !developing.matches(&veteran));
        let poacher = |min| PlayerFilter {
            roles: vec![RoleBound { role: "poacher.attack".to_owned(), min }],
            ..PlayerFilter::default()
        };
        assert!(poacher(None).matches(&young), "a role without a bound is only a column");
        assert!(poacher(Some(55)).matches(&veteran) && !poacher(Some(55)).matches(&young));
        let unknown = PlayerFilter {
            roles: vec![RoleBound { role: "nothing".to_owned(), min: Some(1) }],
            ..PlayerFilter::default()
        };
        assert!(!unknown.matches(&young));
        let based = PlayerFilter { based_in: Needle::new("espana"), ..PlayerFilter::default() };
        assert!(based.matches(&veteran) && !based.matches(&young));

        let mut list = vec![&veteran, &young];
        sort_players(&mut list, PlayerOrder { by: PlayerSort::Progress, ascending: false });
        assert_eq!(list[0].name, "Young");
        let poaching = PlayerSort::named("role.poacher.attack").expect("a role sort");
        assert_eq!(poaching, PlayerSort::Role(ROLES.iter().position(|r| r.id() == "poacher.attack").expect("a role")));
        sort_players(&mut list, PlayerOrder { by: poaching, ascending: false });
        assert_eq!(list[0].name, "Veteran");
        assert_eq!(PlayerSort::named("role.nothing.attack"), None);
        assert_eq!(PlayerSort::named("similarity"), Some(PlayerSort::Similarity));
        sort_by_likeness(&mut list, &Likeness::new(&young.scouted(), false), false);
        assert_eq!(list[0].name, "Young");
    }

    #[test]
    fn attribute_bounds_and_listings() {
        let mut striker = player("Arda", Some(19), 140, Some("Fenerbahçe"), 18);
        striker.attributes[PLAYER_ATTRIBUTES["finishing"]] = 17;
        striker.attributes[PLAYER_ATTRIBUTES["injury_proneness"]] = 4;
        let with = |attributes| PlayerFilter { attributes, ..PlayerFilter::default() };
        assert!(with(vec![bound("finishing", Some(15), None)]).matches(&striker));
        assert!(
            with(vec![bound("finishing", Some(15), None), bound("injury_proneness", None, Some(5))]).matches(&striker)
        );
        assert!(!with(vec![bound("finishing", Some(18), None)]).matches(&striker));
        assert!(!with(vec![bound("injury_proneness", None, Some(3))]).matches(&striker));
        // A key players do not have, or an attribute the layout does not place, matches no one.
        assert!(!with(vec![bound("tactical", None, None)]).matches(&striker));
        striker.attributes[PLAYER_ATTRIBUTES["flair"]] = 0;
        assert!(!with(vec![bound("flair", None, Some(20))]).matches(&striker));

        assert!(!PlayerFilter { transfer_listed: true, ..PlayerFilter::default() }.matches(&striker));
        striker.transfer_listed = true;
        assert!(PlayerFilter { transfer_listed: true, ..PlayerFilter::default() }.matches(&striker));
        assert!(!PlayerFilter { loan_listed: true, ..PlayerFilter::default() }.matches(&striker));
    }

    #[test]
    fn filters_combine() {
        let striker = player("Arda", Some(19), 140, Some("Fenerbahçe"), 18);
        let filter = PlayerFilter {
            positions: vec!["gk".to_owned(), "st".to_owned()],
            max_age: Some(21),
            min_current_ability: Some(120),
            nation: "turkiye".into(),
            club: "fenerbahce".into(),
            contract_expires_by: Some(FmDate { year: 2027, month: 12, day: 31 }),
            ..PlayerFilter::default()
        };
        assert!(filter.matches(&striker));
        assert!(!PlayerFilter { positions: vec!["gk".to_owned()], ..PlayerFilter::default() }.matches(&striker));
        assert!(!PlayerFilter { free_agents: true, ..PlayerFilter::default() }.matches(&striker));
        assert!(!PlayerFilter { min_age: Some(20), ..PlayerFilter::default() }.matches(&striker));
        let no_age = player("Unknown", None, 100, None, 1);
        assert!(!PlayerFilter { max_age: Some(30), ..PlayerFilter::default() }.matches(&no_age));
        assert!(PlayerFilter { free_agents: true, ..PlayerFilter::default() }.matches(&no_age));
    }

    #[test]
    fn a_name_is_looked_for_without_accents_or_case() {
        let found = |needle: &str, text: &str| Needle::new(needle).found_in(Some(text));
        // Plain names, compared as they are, and names with accents, folded.
        assert!(found("ARSE", "Arsenal") && found(" nal ", "Arsenal") && !found("arsenic", "Arsenal"));
        assert!(found("Türk", "Turkiye") && found("turk", "Türkiye") && found("BAHCE", "Fenerbahçe"));
        // A letter that folding leaves as it is has no place in a plain name; one longer than the name neither.
        assert!(found("é", "Arsenal") && !found("ж", "Arsenal") && !found("arsenal fc", "Arsenal"));
        // An empty one is found in anything, a name that is not known included; any other in none.
        assert!(Needle::new("  ").found_in(None) && Needle::default().found_in(None));
        assert!(!Needle::new("a").found_in(None));
        let wire: PlayerFilter = serde_json::from_str(r#"{"nation":" Türk ","club":null}"#).expect("wire filter");
        assert_eq!((wire.nation, wire.club), (Needle::new("turk"), Needle::default()));
    }

    #[test]
    fn several_positions_reputation_and_the_new_sorts() {
        let striker = player("Arda", Some(19), 140, Some("Fenerbahçe"), 18);
        // A player who can play any of the positions matches; a key that is no position matches no one.
        assert!(
            PlayerFilter { positions: vec!["gk".to_owned(), "st".to_owned()], ..PlayerFilter::default() }
                .matches(&striker)
        );
        assert!(!PlayerFilter { positions: vec!["cf".to_owned()], ..PlayerFilter::default() }.matches(&striker));
        assert!(PlayerFilter { min_reputation: Some(7000), ..PlayerFilter::default() }.matches(&striker));
        assert!(!PlayerFilter { max_reputation: Some(6999), ..PlayerFilter::default() }.matches(&striker));

        let mut a = player("A", Some(30), 100, Some("X"), 1);
        let mut b = player("B", Some(30), 120, None, 1);
        let c = player("C", Some(30), 110, Some("Y"), 1);
        (a.transfer_value, b.transfer_value, b.wage) = (Some(5), None, None);
        a.attributes[PLAYER_ATTRIBUTES["finishing"]] = 18;
        b.attributes[PLAYER_ATTRIBUTES["finishing"]] = 0;
        let mut list = vec![&a, &b, &c];
        let names = |list: &[&PlayerSummary]| list.iter().map(|p| p.name.clone()).collect::<String>();
        sort_players(&mut list, PlayerOrder { by: PlayerSort::Value, ascending: false });
        assert_eq!(names(&list), "CAB");
        // No contract, no wage: last either way.
        sort_players(&mut list, PlayerOrder { by: PlayerSort::Wage, ascending: true });
        assert_eq!(names(&list)[2..], *"B");
        let finishing: PlayerOrder = serde_json::from_str(r#"{"by":"attribute.finishing","ascending":false}"#).unwrap();
        sort_players(&mut list, finishing);
        assert_eq!(names(&list), "ACB");
        assert!(serde_json::from_str::<PlayerOrder>(r#"{"by":"attribute.tactical"}"#).is_err());
        assert_eq!(serde_json::from_str::<PlayerOrder>(r#"{"by":"wage"}"#).unwrap().by, PlayerSort::Wage);
    }

    #[test]
    fn sorting_puts_unknowns_last() {
        let a = player("A", Some(30), 100, Some("X"), 1);
        let b = player("B", None, 120, Some("Y"), 1);
        let c = player("C", Some(20), 110, None, 1);
        let mut list = vec![&a, &b, &c];
        sort_players(&mut list, PlayerOrder { by: PlayerSort::Age, ascending: true });
        assert_eq!(list.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["C", "A", "B"]);
        sort_players(&mut list, PlayerOrder { by: PlayerSort::Age, ascending: false });
        assert_eq!(list.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["A", "C", "B"]);
        sort_players(&mut list, PlayerOrder { by: PlayerSort::CurrentAbility, ascending: false });
        assert_eq!(list.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["B", "C", "A"]);
    }

    #[test]
    fn text_sorts_ignore_accents_and_keep_ties_in_order() {
        let ozil = player("Özil", Some(30), 150, Some("Fenerbahçe"), 1);
        let pele = player("pelé", Some(30), 160, Some("Santos"), 1);
        let zico = player("Zico", Some(30), 140, Some("Flamengo"), 1);
        let mut list = vec![&zico, &pele, &ozil];
        sort_players(&mut list, PlayerOrder { by: PlayerSort::Name, ascending: true });
        assert_eq!(list.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["Özil", "pelé", "Zico"]);
        sort_players(&mut list, PlayerOrder { by: PlayerSort::Club, ascending: true });
        assert_eq!(list.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["Özil", "Zico", "pelé"]);
        // Same age: the incoming order (here by club) decides.
        sort_players(&mut list, PlayerOrder { by: PlayerSort::Age, ascending: true });
        assert_eq!(list.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["Özil", "Zico", "pelé"]);
    }

    #[test]
    fn ability_height_wage_and_value_ranges() {
        let striker = player("Arda", Some(19), 140, Some("Fenerbahçe"), 18);
        let with = |change: fn(&mut PlayerFilter)| {
            let mut filter = PlayerFilter::default();
            change(&mut filter);
            filter.matches(&player("Arda", Some(19), 140, Some("Fenerbahçe"), 18))
        };
        // The fixture: CA 140, PA 150, 180 cm, 50,000 a week, valued at 20,000,000.
        assert!(with(|f| f.max_current_ability = Some(140)) && !with(|f| f.max_current_ability = Some(139)));
        assert!(with(|f| f.max_potential_ability = Some(150)) && !with(|f| f.max_potential_ability = Some(149)));
        assert!(with(|f| (f.min_height, f.max_height) = (Some(180), Some(180))));
        assert!(!with(|f| f.min_height = Some(181)) && !with(|f| f.max_height = Some(179)));
        assert!(with(|f| (f.min_wage, f.max_wage) = (Some(50_000), Some(50_000))));
        assert!(!with(|f| f.min_wage = Some(50_001)) && !with(|f| f.max_wage = Some(49_999)));
        assert!(with(|f| (f.min_value, f.max_value) = (Some(20_000_000), Some(20_000_000))));
        assert!(!with(|f| f.min_value = Some(20_000_001)) && !with(|f| f.max_value = Some(19_999_999)));

        // What is not known keeps to no bound, upper ones included: a filter never widens to everyone over it.
        let unknown =
            PlayerSummary { height_cm: 0, wage: None, transfer_value: None, potential_ability: -9, ..striker };
        let fails = |filter: PlayerFilter| !filter.matches(&unknown);
        assert!(fails(PlayerFilter { max_height: Some(250), ..PlayerFilter::default() }));
        assert!(fails(PlayerFilter { max_wage: Some(i32::MAX), ..PlayerFilter::default() }));
        assert!(fails(PlayerFilter { min_value: Some(0), ..PlayerFilter::default() }));
        assert!(fails(PlayerFilter { max_potential_ability: Some(200), ..PlayerFilter::default() }));
        assert!(PlayerFilter::default().matches(&unknown));
    }

    #[test]
    fn personality_bounds_and_traits() {
        let mut leader = player("Arda", Some(19), 140, Some("Fenerbahçe"), 18);
        leader.personality[PERSONALITY.iter().position(|&key| key == "professionalism").unwrap()] = 18;
        leader.traits = 1 << 7 | 1 << 49;
        let personality = |personality| PlayerFilter { personality, ..PlayerFilter::default() };
        assert!(personality(vec![bound("professionalism", Some(15), None)]).matches(&leader));
        assert!(!personality(vec![bound("professionalism", Some(19), None)]).matches(&leader));
        assert!(!personality(vec![bound("ambition", None, Some(9))]).matches(&leader));
        // A key that is no personality rating, and a rating the game has not set, match no one.
        assert!(!personality(vec![bound("finishing", None, None)]).matches(&leader));
        leader.personality[0] = 0;
        assert!(!personality(vec![bound(PERSONALITY[0], None, Some(20))]).matches(&leader));

        let traits = |traits| PlayerFilter { traits, ..PlayerFilter::default() };
        assert!(traits(vec![7]).matches(&leader) && traits(vec![7, 49]).matches(&leader));
        assert!(!traits(vec![7, 10]).matches(&leader));
        // A bit the mask does not have matches no one, rather than everyone or a panic.
        assert!(!traits(vec![64]).matches(&leader) && !traits(vec![255]).matches(&leader));

        let wire: PlayerFilter = serde_json::from_str(
            r#"{"maxCurrentAbility":150,"minWage":1000,"maxValue":5000000,"minHeight":185,
                "personality":[{"key":"ambition","min":15}],"traits":[7]}"#,
        )
        .expect("wire filter");
        assert_eq!((wire.max_current_ability, wire.min_wage, wire.max_value), (Some(150), Some(1000), Some(5_000_000)));
        assert_eq!((wire.min_height, wire.personality.len(), wire.traits.as_slice()), (Some(185), 1, &[7u8][..]));
    }

    #[test]
    fn every_list_sorts_by_its_columns_with_unknowns_last() {
        fn names<S: SortColumn>(rows: &[&S::Row], by: S, ascending: bool, name: fn(&S::Row) -> &str) -> Vec<String> {
            let mut rows = rows.to_vec();
            sort_rows(&mut rows, Order { by, ascending });
            rows.into_iter().map(|row| name(row).to_owned()).collect()
        }

        let ada =
            StaffSummary { name: "Ada".to_owned(), ..staff(Some(50), 120, Some("Türkiye"), Some("Özspor"), None) };
        let bo = StaffSummary { name: "Bo".to_owned(), ..staff(None, 150, None, None, None) };
        let cy = StaffSummary {
            name: "Cy".to_owned(),
            national: Some(crate::national::NationalJob {
                nation: "Peru".to_owned(),
                nation_uid: None,
                age_limit: None,
                women: false,
            }),
            ..staff(Some(40), 100, Some("Peru"), None, None)
        };
        let all = [&ada, &bo, &cy];
        let name: fn(&StaffSummary) -> &str = |s| s.name.as_str();
        assert_eq!(names(&all, StaffSort::CurrentAbility, false, name), ["Bo", "Ada", "Cy"]);
        assert_eq!(names(&all, StaffSort::Age, true, name), ["Cy", "Ada", "Bo"]);
        assert_eq!(names(&all, StaffSort::Age, false, name), ["Ada", "Cy", "Bo"]);
        // The employer is the club or the national team; accents do not move "Özspor" past "Peru".
        assert_eq!(names(&all, StaffSort::Club, true, name), ["Ada", "Cy", "Bo"]);
        assert_eq!(names(&all, StaffSort::Nation, false, name), ["Ada", "Cy", "Bo"]);
        assert_eq!(names(&all, StaffSort::Name, false, name), ["Cy", "Bo", "Ada"]);

        let old = ClubSummary {
            name: "Old".to_owned(),
            nation: Some("Chile".to_owned()),
            ..club(false, Some(9000), Some(1880))
        };
        let new = ClubSummary { name: "New".to_owned(), nation: None, ..club(false, None, Some(1999)) };
        let mid =
            ClubSummary { name: "Mid".to_owned(), nation: Some("Brazil".to_owned()), ..club(true, Some(5000), None) };
        let all = [&old, &new, &mid];
        let name: fn(&ClubSummary) -> &str = |c| c.name.as_str();
        assert_eq!(names(&all, ClubSort::Reputation, true, name), ["Mid", "Old", "New"]);
        assert_eq!(names(&all, ClubSort::Founded, false, name), ["New", "Old", "Mid"]);
        assert_eq!(names(&all, ClubSort::Nation, true, name), ["Mid", "Old", "New"]);
        assert_eq!(names(&all, ClubSort::Name, true, name), ["Mid", "New", "Old"]);

        let ground = |name: Option<&str>, club: &str, capacity: u32, seating: u32| StadiumSummary {
            uid: capacity,
            clubs: vec![crate::clubs::StadiumClub { uid: 1, name: club.to_owned(), women: false }],
            name: name.map(str::to_owned),
            capacity,
            seating,
            used: 0,
            expansion: capacity * 2,
            owner: None,
        };
        // A ground without a name of its own is listed, and sorted, by its club.
        let (park, lane, unnamed) = (
            ground(Some("Park"), "City", 40_000, 30_000),
            ground(Some("Lane"), "Town", 9_000, 9_000),
            ground(None, "Amber", 20_000, 1_000),
        );
        let all = [&park, &lane, &unnamed];
        let name: fn(&StadiumSummary) -> &str = |s| crate::index::Listed::display_name(s);
        assert_eq!(names(&all, StadiumSort::Name, true, name), ["Amber", "Lane", "Park"]);
        assert_eq!(names(&all, StadiumSort::Capacity, false, name), ["Park", "Amber", "Lane"]);
        assert_eq!(names(&all, StadiumSort::Seating, true, name), ["Amber", "Lane", "Park"]);
        assert_eq!(names(&all, StadiumSort::Expansion, true, name), ["Lane", "Amber", "Park"]);

        let nation = |name: &str, continent: Option<&str>| NationSummary {
            uid: 1,
            nation_uid: None,
            name: name.to_owned(),
            continent: continent.map(str::to_owned),
        };
        let (japan, peru, unread) =
            (nation("Japan", Some("Asia")), nation("Peru", Some("South America")), nation("Åland", None));
        let all = [&japan, &peru, &unread];
        let name: fn(&NationSummary) -> &str = |n| n.name.as_str();
        assert_eq!(names(&all, NationSort::Name, true, name), ["Åland", "Japan", "Peru"]);
        assert_eq!(names(&all, NationSort::Continent, false, name), ["Peru", "Japan", "Åland"]);

        let wire: Order<OfficialSort> = serde_json::from_str(r#"{"by":"potentialAbility"}"#).expect("wire order");
        assert!(wire.by == OfficialSort::PotentialAbility && !wire.ascending);
        let wire: Order<AwardSort> = serde_json::from_str(r#"{"by":"prestige","ascending":true}"#).expect("wire order");
        assert!(wire.by == AwardSort::Prestige && wire.ascending);
        assert!(serde_json::from_str::<Order<CompetitionSort>>(r#"{"by":"prestige"}"#).is_err());
    }

    fn staff(age: Option<u16>, ca: u16, nation: Option<&str>, club: Option<&str>, job: Option<u8>) -> StaffSummary {
        StaffSummary {
            uid: 1,
            name: "Ada".to_owned(),
            full_name: None,
            date_of_birth: None,
            age,
            nation: nation.map(str::to_owned),
            nation_uid: None,
            nation_address: 0,
            club: club.map(str::to_owned),
            club_uid: None,
            team: None,
            job,
            national: None,
            current_ability: ca,
            potential_ability: ca as i16 + 10,
            is_human: false,
            attributes: Vec::new(),
            address: 0,
            shift: 0,
        }
    }

    #[test]
    fn staff_filters_use_decoded_list_fields() {
        let coach = staff(Some(42), 140, Some("Türkiye"), Some("Fenerbahçe"), Some(2));
        let filter = StaffFilter {
            min_age: Some(40),
            max_age: Some(45),
            min_current_ability: Some(120),
            min_potential_ability: Some(145),
            nation: "turkiye".into(),
            club: "fenerbahce".into(),
            job: Some(2),
            ..StaffFilter::default()
        };
        assert!(filter.matches(&coach));
        assert!(!StaffFilter { max_age: Some(30), ..StaffFilter::default() }.matches(&coach));
        assert!(!StaffFilter { unemployed: true, ..StaffFilter::default() }.matches(&coach));
        let unknown = staff(None, 100, None, None, None);
        assert!(!StaffFilter { min_age: Some(20), ..StaffFilter::default() }.matches(&unknown));
        assert!(StaffFilter { unemployed: true, ..StaffFilter::default() }.matches(&unknown));
        assert!(!StaffFilter { nation: "spain".into(), ..StaffFilter::default() }.matches(&unknown));
    }

    #[test]
    fn a_national_team_manager_is_a_manager_not_unemployed() {
        let national = StaffSummary {
            national: Some(crate::national::NationalJob {
                nation: "Türkiye".to_owned(),
                nation_uid: None,
                age_limit: None,
                women: false,
            }),
            ..staff(Some(52), 150, Some("Italy"), None, None)
        };
        assert!(!StaffFilter { unemployed: true, ..StaffFilter::default() }.matches(&national));
        assert!(StaffFilter { job: Some(MANAGER_JOB), ..StaffFilter::default() }.matches(&national));
        assert!(!StaffFilter { job: Some(2), ..StaffFilter::default() }.matches(&national));
        // The team is the employer the club filter searches.
        assert!(StaffFilter { club: "turkiye".into(), ..StaffFilter::default() }.matches(&national));
        assert!(!StaffFilter { club: "italy".into(), ..StaffFilter::default() }.matches(&national));
    }

    #[test]
    fn human_only_keeps_the_career_s_managers() {
        let human = StaffSummary { is_human: true, ..staff(Some(40), 48, Some("England"), Some("Arsenal"), Some(16)) };
        // The manager of another club has the same job code, but is not the human.
        let ai = staff(Some(55), 150, Some("Spain"), Some("Real Madrid"), Some(16));
        let humans = StaffFilter { human_only: true, ..StaffFilter::default() };
        assert!(humans.matches(&human) && !humans.matches(&ai));
        // No filter by default.
        assert!(!StaffFilter::default().human_only);
        assert!(StaffFilter::default().matches(&human) && StaffFilter::default().matches(&ai));
        // A human between jobs.
        let unemployed = StaffSummary { is_human: true, ..staff(Some(40), 48, None, None, None) };
        assert!(StaffFilter { unemployed: true, ..humans.clone() }.matches(&unemployed));
        assert!(!StaffFilter { unemployed: true, ..humans.clone() }.matches(&human));
        // Alongside the other filters.
        let at = |club: &str| StaffFilter { club: club.into(), ..humans.clone() };
        assert!(at("arsenal").matches(&human) && !at("real").matches(&ai) && !at("real").matches(&human));
        assert!(!StaffFilter { min_current_ability: Some(100), ..humans.clone() }.matches(&human));
        assert!(StaffFilter { job: Some(16), ..humans.clone() }.matches(&human));
        let wire: StaffFilter = serde_json::from_str(r#"{"humanOnly":true}"#).expect("wire filter");
        assert!(wire.human_only);
    }

    fn club(women: bool, reputation: Option<u16>, founded: Option<u16>) -> ClubSummary {
        ClubSummary {
            uid: 1,
            name: "Northbridge".to_owned(),
            short_name: None,
            women,
            reputation,
            founded,
            nation: Some("Türkiye".to_owned()),
            nation_uid: None,
            address: 0,
        }
    }

    #[test]
    fn club_filters_use_decoded_list_fields() {
        let mens = club(false, Some(8000), Some(1886));
        let filter = ClubFilter {
            women: Some(false),
            min_reputation: Some(7000),
            max_reputation: Some(9000),
            founded_from: Some(1880),
            founded_to: Some(1900),
            nation: "turkiye".into(),
        };
        assert!(filter.matches(&mens));
        assert!(!ClubFilter { nation: "spain".into(), ..ClubFilter::default() }.matches(&mens));
        // A club whose nation was not read matches no nation.
        let nowhere = ClubSummary { nation: None, ..mens.clone() };
        assert!(!ClubFilter { nation: "turkiye".into(), ..ClubFilter::default() }.matches(&nowhere));
        assert!(ClubFilter::default().matches(&nowhere));
        assert!(!ClubFilter { women: Some(true), ..ClubFilter::default() }.matches(&mens));
        assert!(!ClubFilter { max_reputation: Some(1000), ..ClubFilter::default() }.matches(&mens));
        let unknown = club(true, None, None);
        assert!(!ClubFilter { min_reputation: Some(1), ..ClubFilter::default() }.matches(&unknown));
        assert!(!ClubFilter { founded_from: Some(1900), ..ClubFilter::default() }.matches(&unknown));
        assert!(ClubFilter { women: Some(true), ..ClubFilter::default() }.matches(&unknown));
    }

    #[test]
    fn competition_award_official_and_nation_filters() {
        let league = CompetitionSummary {
            uid: 1,
            name: "Süper Lig".to_owned(),
            short_name: None,
            nation: Some("Türkiye".to_owned()),
            nation_uid: None,
            continent: Some("Europe".to_owned()),
            reputation: 150,
            women: false,
            address: 0,
            nation_address: 0,
        };
        let cup = CompetitionSummary { nation: None, continent: Some("Asia".to_owned()), ..league.clone() };
        let filter = CompetitionFilter {
            women: Some(false),
            nation: "turkiye".into(),
            continent: "eur".into(),
            min_reputation: Some(100),
            max_reputation: Some(150),
        };
        assert!(filter.matches(&league));
        // An international competition has no nation to match.
        assert!(!filter.matches(&cup));
        assert!(!CompetitionFilter { women: Some(true), ..CompetitionFilter::default() }.matches(&league));
        assert!(!CompetitionFilter { min_reputation: Some(151), ..CompetitionFilter::default() }.matches(&league));

        let award = AwardSummary {
            uid: 2,
            name: "Player of the Year".to_owned(),
            competition: None,
            competition_uid: None,
            nation: Some("España".to_owned()),
            nation_uid: None,
            continent: None,
            prestige: 12,
            period: 3,
            women: true,
            recipients: 1,
            goalkeepers_only: false,
            max_age: None,
        };
        let filter = AwardFilter {
            women: Some(true),
            nation: "espana".into(),
            recipients: Some(1),
            min_prestige: Some(10),
            max_prestige: Some(12),
        };
        assert!(filter.matches(&award));
        assert!(!AwardFilter { recipients: Some(2), ..AwardFilter::default() }.matches(&award));
        assert!(!AwardFilter { max_prestige: Some(11), ..AwardFilter::default() }.matches(&award));
        assert!(!AwardFilter { women: Some(false), ..AwardFilter::default() }.matches(&award));

        let referee = OfficialSummary {
            uid: 3,
            address: 0,
            name: "Ref".to_owned(),
            nation: Some("Italia".to_owned()),
            nation_uid: None,
            date_of_birth: None,
            age: Some(40),
            current_ability: 150,
            potential_ability: 160,
            reputation: 5000,
        };
        let filter = OfficialFilter {
            min_age: Some(35),
            max_age: Some(45),
            min_current_ability: Some(150),
            max_current_ability: Some(150),
            min_potential_ability: Some(160),
            max_potential_ability: Some(170),
            min_reputation: Some(5000),
            max_reputation: Some(6000),
            nation: "ital".into(),
        };
        assert!(filter.matches(&referee));
        assert!(!OfficialFilter { max_current_ability: Some(149), ..OfficialFilter::default() }.matches(&referee));
        assert!(!OfficialFilter { max_potential_ability: Some(159), ..OfficialFilter::default() }.matches(&referee));
        assert!(!OfficialFilter { min_reputation: Some(5001), ..OfficialFilter::default() }.matches(&referee));
        assert!(!OfficialFilter { max_reputation: Some(4999), ..OfficialFilter::default() }.matches(&referee));
        assert!(!OfficialFilter { min_current_ability: Some(151), ..OfficialFilter::default() }.matches(&referee));
        assert!(!OfficialFilter { max_age: Some(30), ..OfficialFilter::default() }.matches(&referee));
        let unknown_age = OfficialSummary { age: None, ..referee.clone() };
        assert!(!OfficialFilter { min_age: Some(20), ..OfficialFilter::default() }.matches(&unknown_age));

        let nation =
            NationSummary { uid: 4, nation_uid: None, name: "Japan".to_owned(), continent: Some("Asia".to_owned()) };
        assert!(NationFilter { continent: "asia".into() }.matches(&nation));
        assert!(!NationFilter { continent: "europe".into() }.matches(&nation));
        let unread = NationSummary { continent: None, ..nation.clone() };
        assert!(!NationFilter { continent: "asia".into() }.matches(&unread));
        assert!(NationFilter::default().matches(&unread));
    }
}
