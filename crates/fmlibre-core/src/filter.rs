use std::cmp::Ordering;
use std::collections::HashMap;

use serde::Deserialize;

use crate::clubs::ClubSummary;
use crate::date::FmDate;
use crate::details::POSITIONS;
use crate::players::{PLAYABLE_RATING, PlayerSummary};
use crate::staff::StaffSummary;
use crate::text::fold;

/// Filters the player list applies on top of a name search. Unset fields match everyone.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayerFilter {
    /// A [`POSITIONS`] key; matches players rated [`PLAYABLE_RATING`] or more there.
    pub position: Option<String>,
    pub min_age: Option<u16>,
    pub max_age: Option<u16>,
    pub min_current_ability: Option<u16>,
    pub min_potential_ability: Option<i16>,
    /// Part of the nation's name, accents and case ignored.
    pub nation: Option<String>,
    /// Part of the club's name, accents and case ignored.
    pub club: Option<String>,
    /// Only players without a club.
    pub free_agents: bool,
    /// Only players whose contract ends on or before this date.
    pub contract_expires_by: Option<FmDate>,
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
            && self.min_potential_ability.is_none_or(|min| p.potential_ability >= min)
            && contains(p.nation.as_deref(), self.nation.as_deref())
            && contains(p.club.as_deref(), self.club.as_deref())
            && (!self.free_agents || p.club.is_none())
            && self.contract_expires_by.is_none_or(|by| p.contract_expires.is_some_and(|end| end <= by))
    }
}

/// Whether `text` contains `needle`, ignoring accents and case; an empty needle matches anything.
fn contains(text: Option<&str>, needle: Option<&str>) -> bool {
    match needle.map(str::trim).filter(|n| !n.is_empty()) {
        Some(needle) => text.is_some_and(|text| fold(text).contains(&fold(needle))),
        None => true,
    }
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

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayerOrder {
    pub by: PlayerSort,
    pub ascending: bool,
}

/// Sorts `players` by `order`; unknown values go last either way. Text compares without
/// accents or case. The sort is stable: equal players keep their order, which after a
/// search is best first.
pub fn sort_players(players: &mut [&PlayerSummary], order: PlayerOrder) {
    // Fold each distinct text once rather than on every comparison.
    let mut folded: HashMap<&str, String> = HashMap::new();
    let mut keyed: Vec<(Option<String>, &PlayerSummary)> = players
        .iter()
        .map(|&p| (sort_text(p, order.by).map(|text| folded.entry(text).or_insert_with(|| fold(text)).clone()), p))
        .collect();
    keyed.sort_by(|(a_text, a), (b_text, b)| {
        let primary = match order.by {
            PlayerSort::CurrentAbility => Some(a.current_ability.cmp(&b.current_ability)),
            PlayerSort::PotentialAbility => Some(a.potential_ability.cmp(&b.potential_ability)),
            PlayerSort::Age => known(a.age, b.age),
            PlayerSort::Name | PlayerSort::Nation | PlayerSort::Club => known(a_text.as_ref(), b_text.as_ref()),
            PlayerSort::ContractExpires => known(a.contract_expires, b.contract_expires),
        };
        match primary {
            Some(ordering) if order.ascending => ordering,
            Some(ordering) => ordering.reverse(),
            None => unknown_last(a, b, order.by),
        }
    });
    for (slot, (_, player)) in players.iter_mut().zip(keyed) {
        *slot = player;
    }
}

/// The text a player is sorted by, for the text columns.
fn sort_text(p: &PlayerSummary, by: PlayerSort) -> Option<&str> {
    match by {
        PlayerSort::Name => Some(&p.name),
        PlayerSort::Nation => p.nation.as_deref(),
        PlayerSort::Club => p.club.as_deref(),
        _ => None,
    }
}

/// Compares two optional values, or `None` when either is unknown.
fn known<T: Ord>(a: Option<T>, b: Option<T>) -> Option<Ordering> {
    Some(a.as_ref()?.cmp(b.as_ref()?))
}

fn unknown_last(a: &PlayerSummary, b: &PlayerSummary, by: PlayerSort) -> Ordering {
    let has = |p: &PlayerSummary| match by {
        PlayerSort::Age => p.age.is_some(),
        PlayerSort::Nation => p.nation.is_some(),
        PlayerSort::Club => p.club.is_some(),
        PlayerSort::ContractExpires => p.contract_expires.is_some(),
        _ => true,
    };
    has(b).cmp(&has(a))
}

/// Filters for the staff list.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StaffFilter {
    /// FM job code; a player-coach variant (code + 1) matches too.
    pub job: Option<u8>,
    /// Only staff without a contract.
    pub unemployed: bool,
}

impl StaffFilter {
    pub fn matches(&self, s: &StaffSummary) -> bool {
        self.job.is_none_or(|job| s.job.is_some_and(|code| code == job || code == job + 1))
            && (!self.unemployed || s.job.is_none())
    }
}

/// Filters for the club list.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClubFilter {
    /// `Some(true)` for women's clubs only, `Some(false)` for men's clubs only.
    pub women: Option<bool>,
}

impl ClubFilter {
    pub fn matches(&self, c: &ClubSummary) -> bool {
        self.women.is_none_or(|women| c.women == women)
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
            club: club.map(str::to_owned),
            positions: Vec::new(),
            contract_expires: Some(FmDate { year: 2027, month: 6, day: 30 }),
            current_ability: ca,
            potential_ability: ca as i16 + 10,
            position_ratings,
            address: 0,
            shift: 0,
        }
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
}
