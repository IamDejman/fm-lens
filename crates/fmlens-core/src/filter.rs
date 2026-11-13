use std::cmp::Ordering;
use std::collections::HashMap;
use std::sync::LazyLock;

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
pub(crate) fn player_attribute(key: &str) -> Option<usize> {
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
    /// A [`POSITIONS`] key; matches players rated [`PLAYABLE_RATING`] or more there.
    pub position: Option<String>,
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
    /// Part of the nation's name, accents and case ignored.
    pub nation: Option<String>,
    /// Part of the club's name, accents and case ignored.
    pub club: Option<String>,
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
}

impl PlayerFilter {
    pub fn matches(&self, p: &PlayerSummary) -> bool {
        let position = match self.position.as_deref() {
            Some(key) => {
                POSITIONS.iter().position(|&k| k == key).is_some_and(|i| p.position_ratings[i] >= PLAYABLE_RATING)
            }
            None => true,
        };
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
            && contains(p.nation.as_deref(), self.nation.as_deref())
            && contains(p.club.as_deref(), self.club.as_deref())
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
    }
}

/// Whether `text` contains `needle`, ignoring accents and case; an empty needle matches anything.
fn contains(text: Option<&str>, needle: Option<&str>) -> bool {
    match needle.map(str::trim).filter(|n| !n.is_empty()) {
        Some(needle) => text.is_some_and(|text| fold(text).contains(&fold(needle))),
        None => true,
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
    enum Folded {
        Text(String),
        Number(i64),
        Unknown,
    }
    // Fold each distinct text once rather than on every comparison.
    let mut folded: HashMap<&str, String> = HashMap::new();
    let mut keyed: Vec<(Folded, &S::Row)> = rows
        .iter()
        .map(|&row| {
            let key = match order.by.key(row) {
                SortKey::Text(Some(text)) => Folded::Text(folded.entry(text).or_insert_with(|| fold(text)).clone()),
                SortKey::Number(Some(number)) => Folded::Number(number),
                SortKey::Text(None) | SortKey::Number(None) => Folded::Unknown,
            };
            (key, row)
        })
        .collect();
    keyed.sort_by(|(a, _), (b, _)| {
        let known = match (a, b) {
            (Folded::Text(a), Folded::Text(b)) => a.cmp(b),
            (Folded::Number(a), Folded::Number(b)) => a.cmp(b),
            (Folded::Unknown, Folded::Unknown) => return Ordering::Equal,
            (Folded::Unknown, _) => return Ordering::Greater,
            (_, Folded::Unknown) => return Ordering::Less,
            // A column is all text or all numbers.
            (Folded::Text(_), Folded::Number(_)) | (Folded::Number(_), Folded::Text(_)) => Ordering::Equal,
        };
        if order.ascending { known } else { known.reverse() }
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

/// Columns the player list can be sorted by.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlayerSort {
    #[default]
    CurrentAbility,
    PotentialAbility,
    Age,
    Name,
    Nation,
    Club,
    ContractExpires,
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
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayerOrder {
    pub by: PlayerSort,
    pub ascending: bool,
}

/// Sorts `players` by `order` (see [`sort_rows`]).
pub fn sort_players(players: &mut [&PlayerSummary], order: PlayerOrder) {
    sort_rows(players, Order { by: order.by, ascending: order.ascending });
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
    pub nation: Option<String>,
    /// Part of the employer's name, accents and case ignored.
    pub club: Option<String>,
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
            && contains(s.nation.as_deref(), self.nation.as_deref())
            && (contains(s.club.as_deref(), self.club.as_deref())
                || s.national.as_ref().is_some_and(|job| contains(Some(&job.nation), self.club.as_deref())))
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
    pub nation: Option<String>,
}

impl ClubFilter {
    pub fn matches(&self, c: &ClubSummary) -> bool {
        self.women.is_none_or(|women| c.women == women)
            && self.min_reputation.is_none_or(|min| c.reputation.is_some_and(|reputation| reputation >= min))
            && self.max_reputation.is_none_or(|max| c.reputation.is_some_and(|reputation| reputation <= max))
            && self.founded_from.is_none_or(|from| c.founded.is_some_and(|year| year >= from))
            && self.founded_to.is_none_or(|to| c.founded.is_some_and(|year| year <= to))
            && contains(c.nation.as_deref(), self.nation.as_deref())
    }
}

/// Filters for the competitions list.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CompetitionFilter {
    /// `Some(true)` for women's competitions only, `Some(false)` for men's only.
    pub women: Option<bool>,
    /// Part of the nation's name, accents and case ignored. An international competition has no nation.
    pub nation: Option<String>,
    /// Part of the continent's name, accents and case ignored.
    pub continent: Option<String>,
    /// 0–200.
    pub min_reputation: Option<u16>,
    pub max_reputation: Option<u16>,
}

impl CompetitionFilter {
    pub fn matches(&self, c: &CompetitionSummary) -> bool {
        self.women.is_none_or(|women| c.women == women)
            && contains(c.nation.as_deref(), self.nation.as_deref())
            && contains(c.continent.as_deref(), self.continent.as_deref())
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
    pub nation: Option<String>,
    /// FM's code for who gets it (see [`AwardSummary::recipients`]).
    pub recipients: Option<u8>,
    /// 0–20.
    pub min_prestige: Option<u8>,
    pub max_prestige: Option<u8>,
}

impl AwardFilter {
    pub fn matches(&self, a: &AwardSummary) -> bool {
        self.women.is_none_or(|women| a.women == women)
            && contains(a.nation.as_deref(), self.nation.as_deref())
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
    pub nation: Option<String>,
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
            && contains(o.nation.as_deref(), self.nation.as_deref())
    }
}

/// Filters for the nations list.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NationFilter {
    /// Part of the continent's name, accents and case ignored. A nation whose continent was not read matches none.
    pub continent: Option<String>,
}

impl NationFilter {
    pub fn matches(&self, n: &NationSummary) -> bool {
        contains(n.continent.as_deref(), self.continent.as_deref())
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
            personality: [10; 8],
            traits: 0,
            address: 0,
            shift: 0,
        }
    }

    fn bound(key: &str, min: Option<u8>, max: Option<u8>) -> AttributeBound {
        AttributeBound { key: key.to_owned(), min, max }
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
            position: Some("st".to_owned()),
            max_age: Some(21),
            min_current_ability: Some(120),
            nation: Some("turkiye".to_owned()),
            club: Some("fenerbahce".to_owned()),
            contract_expires_by: Some(FmDate { year: 2027, month: 12, day: 31 }),
            ..PlayerFilter::default()
        };
        assert!(filter.matches(&striker));
        assert!(!PlayerFilter { position: Some("gk".to_owned()), ..PlayerFilter::default() }.matches(&striker));
        assert!(!PlayerFilter { free_agents: true, ..PlayerFilter::default() }.matches(&striker));
        assert!(!PlayerFilter { min_age: Some(20), ..PlayerFilter::default() }.matches(&striker));
        let no_age = player("Unknown", None, 100, None, 1);
        assert!(!PlayerFilter { max_age: Some(30), ..PlayerFilter::default() }.matches(&no_age));
        assert!(PlayerFilter { free_agents: true, ..PlayerFilter::default() }.matches(&no_age));
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
            nation: Some("turkiye".to_owned()),
            club: Some("fenerbahce".to_owned()),
            job: Some(2),
            ..StaffFilter::default()
        };
        assert!(filter.matches(&coach));
        assert!(!StaffFilter { max_age: Some(30), ..StaffFilter::default() }.matches(&coach));
        assert!(!StaffFilter { unemployed: true, ..StaffFilter::default() }.matches(&coach));
        let unknown = staff(None, 100, None, None, None);
        assert!(!StaffFilter { min_age: Some(20), ..StaffFilter::default() }.matches(&unknown));
        assert!(StaffFilter { unemployed: true, ..StaffFilter::default() }.matches(&unknown));
        assert!(!StaffFilter { nation: Some("spain".to_owned()), ..StaffFilter::default() }.matches(&unknown));
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
        assert!(StaffFilter { club: Some("turkiye".to_owned()), ..StaffFilter::default() }.matches(&national));
        assert!(!StaffFilter { club: Some("italy".to_owned()), ..StaffFilter::default() }.matches(&national));
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
        let at = |club: &str| StaffFilter { club: Some(club.to_owned()), ..humans.clone() };
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
            nation: Some("turkiye".to_owned()),
        };
        assert!(filter.matches(&mens));
        assert!(!ClubFilter { nation: Some("spain".to_owned()), ..ClubFilter::default() }.matches(&mens));
        // A club whose nation was not read matches no nation.
        let nowhere = ClubSummary { nation: None, ..mens.clone() };
        assert!(!ClubFilter { nation: Some("turkiye".to_owned()), ..ClubFilter::default() }.matches(&nowhere));
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
            nation: Some("turkiye".to_owned()),
            continent: Some("eur".to_owned()),
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
            nation: Some("espana".to_owned()),
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
            nation: Some("ital".to_owned()),
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
        assert!(NationFilter { continent: Some("asia".to_owned()) }.matches(&nation));
        assert!(!NationFilter { continent: Some("europe".to_owned()) }.matches(&nation));
        let unread = NationSummary { continent: None, ..nation.clone() };
        assert!(!NationFilter { continent: Some("asia".to_owned()) }.matches(&unread));
        assert!(NationFilter::default().matches(&unread));
    }
}
