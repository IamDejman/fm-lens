//! FM Lens's scouting estimates (see the fmlens-scout crate) for the players the editor has read: role ratings and
//! likeness in the player list, a profile's scouting report, and the lists of top players. They are worked out from
//! what the lists already hold; nothing here reads the game again.

use std::cmp::Reverse;
use std::collections::{BTreeMap, HashMap};

use fmlens_scout::peak::shown;
use fmlens_scout::{ATTRIBUTES, Player, development, peak_attributes, resolved_potential, role};
use serde::{Deserialize, Serialize};

pub use fmlens_scout::history;
pub use fmlens_scout::{Development, Likeness, ROLES, WITHIN};

use crate::players::PlayerSummary;
use crate::text::fold;

impl PlayerSummary {
    /// The player as the estimates see him.
    pub fn scouted(&self) -> Player<'_> {
        Player {
            age: self.age,
            current_ability: self.current_ability,
            potential_ability: self.potential_ability,
            attributes: &self.attributes,
            personality: &self.personality,
            positions: &self.position_ratings,
        }
    }

    /// Who he is, to find him in the record of another career: a hash of his name and birth date.
    pub fn identity(&self) -> u32 {
        let born = self.date_of_birth.map(|d| format!("{}-{}-{}", d.year, d.month, d.day)).unwrap_or_default();
        history::fnv1a(&format!("{} {born}", fold(&self.name)))
    }

    /// His attributes at his potential, as FM shows attributes (1–20), in the order of his `attributes`.
    pub fn peak_shown(&self) -> Vec<u8> {
        shown(&peak_attributes(&self.scouted()))
    }
}

/// The player a list is compared with.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarTo {
    pub uid: u32,
    /// Both at their potential, rather than as they are today.
    #[serde(default)]
    pub peak: bool,
}

/// The scores a player list shows beside a player: the app puts them in its rows.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scores {
    /// How like the player the list is compared with he is, 0 to 100.
    pub similarity: Option<u8>,
    /// The chance, in percent, that he comes within [`WITHIN`] of his potential during his career.
    pub development: Option<u8>,
    /// The ability he is expected to gain over the next two years, as a rate in half stars (0 to 10).
    pub progress: Option<u8>,
    /// His rating (0 to 100) in each role the list shows, by role id.
    pub roles: BTreeMap<String, u8>,
    /// His place in a list of top players, from 1.
    pub rank: Option<u32>,
}

/// The scores of `player`, rated in `roles` (role ids; an unknown one is left out) and compared with `similar`.
pub fn scores(player: &PlayerSummary, roles: &[String], similar: Option<&Likeness>, rank: Option<u32>) -> Scores {
    let scouted = player.scouted();
    let estimate = development(&scouted);
    let values = scouted.values();
    Scores {
        similarity: similar.map(|likeness| likeness.score(&scouted)),
        development: estimate.map(|d| d.probability),
        progress: estimate.map(|d| d.half_stars),
        roles: roles
            .iter()
            .filter_map(|id| role(id).map(|role| (id.clone(), role.rating(&values, &player.position_ratings))))
            .collect(),
        rank,
    }
}

/// How many roles a scouting report lists.
pub const REPORT_ROLES: usize = 6;

/// What a player's profile shows of the estimates.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutReport {
    /// His potential ability as the estimates take it: for one of FM's ranges, its middle.
    pub potential: Option<u16>,
    /// His attributes at his potential, as FM shows attributes (1–20), by key.
    pub peak: BTreeMap<&'static str, u8>,
    pub development: Option<Development>,
    /// The roles he suits best, today or at his potential, best first.
    pub roles: Vec<RoleRating>,
}

/// A player's rating in a role, today and at his potential.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleRating {
    pub role: String,
    pub today: u8,
    pub peak: u8,
}

/// The scouting report of `player`.
pub fn scout_report(player: &PlayerSummary) -> ScoutReport {
    let scouted = player.scouted();
    let (today, peak) = (scouted.values(), peak_attributes(&scouted));
    let mut roles: Vec<RoleRating> = ROLES
        .iter()
        .map(|role| RoleRating {
            role: role.id(),
            today: role.rating(&today, &player.position_ratings),
            peak: role.rating(&peak, &player.position_ratings),
        })
        .collect();
    roles.sort_by_key(|rating| (Reverse(rating.today.max(rating.peak)), Reverse(rating.today)));
    roles.truncate(REPORT_ROLES);
    ScoutReport {
        potential: resolved_potential(player.potential_ability),
        peak: ATTRIBUTES.iter().copied().zip(shown(&peak)).filter(|&(_, value)| value > 0).collect(),
        development: development(&scouted),
        roles,
    }
}

/// Which players a list of top players ranks.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TopKind {
    /// Everyone, by current ability.
    #[default]
    Best,
    /// Players up to [`PROMISING_AGE`], by potential ability.
    Promising,
}

/// Where the players of a list of top players play. With neither a nation nor a continent, the whole world.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TopScope {
    /// Players of women's clubs rather than men's.
    pub women: bool,
    /// The continent's name, as [`top_places`] gives it.
    pub continent: Option<String>,
    /// The UID of the country their club is in.
    pub nation: Option<u32>,
    /// The UID of the division their club plays in.
    pub division: Option<u32>,
}

/// How many players a list of top players holds.
pub const TOP_COUNT: usize = 100;

/// The oldest a player is for the list of the most promising.
pub const PROMISING_AGE: u16 = 21;

/// The players of `scope` ranked by `kind`, at most [`TOP_COUNT`], first first. A player whose club is not known plays
/// nowhere, so only lists of the whole world have free agents; a promising player needs a known age.
pub fn top_players<'a>(
    players: impl IntoIterator<Item = &'a PlayerSummary>,
    kind: TopKind,
    scope: &TopScope,
) -> Vec<&'a PlayerSummary> {
    let in_scope = |p: &PlayerSummary| {
        p.base.women == scope.women
            && scope.nation.is_none_or(|uid| p.base.nation_uid == Some(uid))
            && scope.continent.as_deref().is_none_or(|continent| p.base.continent.as_deref() == Some(continent))
            && scope.division.is_none_or(|uid| p.base.division.as_ref().is_some_and(|division| division.uid == uid))
    };
    let mut ranked: Vec<&PlayerSummary> = players
        .into_iter()
        .filter(|p| in_scope(p))
        .filter(|p| kind == TopKind::Best || p.age.is_some_and(|age| age <= PROMISING_AGE))
        .collect();
    let potential = |p: &PlayerSummary| resolved_potential(p.potential_ability).unwrap_or(0);
    match kind {
        TopKind::Best => ranked.sort_by_key(|p| (Reverse(p.current_ability), Reverse(potential(p)), p.uid)),
        TopKind::Promising => ranked.sort_by_key(|p| (Reverse(potential(p)), Reverse(p.current_ability), p.uid)),
    }
    ranked.truncate(TOP_COUNT);
    ranked
}

/// The continents, countries and divisions players play in, for the lists of top players.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopPlaces {
    /// By name.
    pub continents: Vec<String>,
    /// By name, accents and case ignored.
    pub nations: Vec<Place>,
    /// The best known first. Empty where the build does not place a club's division.
    pub divisions: Vec<League>,
}

/// A division players play in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct League {
    pub uid: u32,
    pub name: String,
    /// The UID of the country its clubs are in.
    pub nation: Option<u32>,
    pub women: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub uid: u32,
    pub name: String,
    pub continent: Option<String>,
}

/// Every continent, country and division `players` play in, each once.
pub fn top_places<'a>(players: impl IntoIterator<Item = &'a PlayerSummary>) -> TopPlaces {
    let mut nations: HashMap<u32, Place> = HashMap::new();
    let mut divisions: HashMap<u32, (u16, League)> = HashMap::new();
    for p in players {
        if let Some(division) = &p.base.division {
            divisions.entry(division.uid).or_insert_with(|| {
                let league = League {
                    uid: division.uid,
                    name: division.name.clone(),
                    nation: p.base.nation_uid,
                    women: p.base.women,
                };
                (division.reputation, league)
            });
        }
        if let (Some(uid), Some(name)) = (p.base.nation_uid, p.base.nation.as_ref()) {
            nations.entry(uid).or_insert_with(|| Place {
                uid,
                name: name.clone(),
                continent: p.base.continent.clone(),
            });
        }
    }
    let mut continents: Vec<String> = nations.values().filter_map(|place| place.continent.clone()).collect();
    continents.sort_by_cached_key(|name| fold(name));
    continents.dedup();
    let mut nations: Vec<Place> = nations.into_values().collect();
    nations.sort_by_cached_key(|place| (fold(&place.name), place.uid));
    let mut divisions: Vec<(u16, League)> = divisions.into_values().collect();
    divisions.sort_by_cached_key(|(reputation, league)| (Reverse(*reputation), fold(&league.name), league.uid));
    TopPlaces { continents, nations, divisions: divisions.into_iter().map(|(_, league)| league).collect() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::players::{Base, Division};
    use crate::{ATTRIBUTE_GROUPS, FmDate, PERSONALITY, POSITIONS};

    pub(crate) fn player(uid: u32, age: u16, ca: u16, pa: i16, base: Base) -> PlayerSummary {
        let mut position_ratings = [1u8; 15];
        position_ratings[12] = 20;
        PlayerSummary {
            uid,
            name: format!("Player {uid}"),
            full_name: None,
            date_of_birth: Some(FmDate { year: 2027 - age, month: 1, day: 1 }),
            age: Some(age),
            nation: None,
            nation_uid: None,
            nation_address: 0,
            club: None,
            club_uid: None,
            positions: vec!["st"],
            contract_expires: None,
            current_ability: ca,
            potential_ability: pa,
            position_ratings,
            attributes: vec![(ca / 12) as u8; ATTRIBUTES.len()],
            base,
            transfer_listed: false,
            loan_listed: false,
            height_cm: 180,
            wage: None,
            transfer_value: None,
            current_reputation: 0,
            personality: [10; 8],
            traits: 0,
            address: 0,
            shift: 0,
        }
    }

    fn based(nation: u32, continent: &str) -> Base {
        Base {
            women: false,
            nation: Some(format!("Nation {nation}")),
            nation_uid: Some(nation),
            continent: Some(continent.to_owned()),
            division: None,
        }
    }

    fn league(uid: u32, reputation: u16, base: Base) -> Base {
        Base { division: Some(Division { uid, name: format!("Division {uid}"), reputation }), ..base }
    }

    #[test]
    fn the_estimates_read_the_lists_in_the_same_order() {
        let keys: Vec<&str> = crate::filter::attribute_keys(ATTRIBUTE_GROUPS).collect();
        assert_eq!(keys, ATTRIBUTES);
        assert_eq!(PERSONALITY, fmlens_scout::PERSONALITY);
        assert_eq!(POSITIONS, fmlens_scout::POSITIONS);
    }

    #[test]
    fn rows_carry_the_scores_asked_for() {
        let striker = player(1, 19, 120, 165, Base::default());
        let likeness = Likeness::new(&striker.scouted(), false);
        let roles = ["poacher.attack".to_owned(), "nothing.attack".to_owned()];
        let row = scores(&striker, &roles, Some(&likeness), Some(3));
        assert_eq!(row.similarity, Some(100));
        assert_eq!(row.roles.keys().collect::<Vec<_>>(), ["poacher.attack"]);
        assert!(row.development.is_some() && row.progress.is_some());
        assert_eq!(row.rank, Some(3));
        let json = serde_json::to_value(&row).expect("json");
        assert_eq!(json["roles"]["poacher.attack"], row.roles["poacher.attack"]);

        let report = scout_report(&striker);
        assert_eq!(report.roles.len(), REPORT_ROLES);
        assert!(report.roles.iter().all(|r| r.peak >= r.today));
        assert!(report.peak["finishing"] > 10, "{}", report.peak["finishing"]);
        assert_eq!(report.potential, Some(165));
        assert_ne!(striker.identity(), player(1, 20, 120, 165, Base::default()).identity());
    }

    #[test]
    fn top_lists_rank_within_their_scope() {
        let players = [
            player(1, 30, 170, 170, league(11, 190, based(765, "Europe"))),
            player(2, 19, 120, 185, league(12, 160, based(765, "Europe"))),
            player(3, 25, 180, 180, league(40, 170, based(1649, "South America"))),
            player(4, 18, 100, -10, based(1649, "South America")),
            player(5, 20, 150, 175, Base { women: true, ..based(765, "Europe") }),
            player(6, 24, 175, 176, Base::default()),
        ];
        let uids =
            |kind, scope: &TopScope| top_players(&players, kind, scope).iter().map(|p| p.uid).collect::<Vec<_>>();
        assert_eq!(uids(TopKind::Best, &TopScope::default()), [3, 6, 1, 2, 4]);
        assert_eq!(uids(TopKind::Promising, &TopScope::default()), [2, 4], "-10 is 170 to 200");
        let europe = TopScope { continent: Some("Europe".to_owned()), ..TopScope::default() };
        assert_eq!(uids(TopKind::Best, &europe), [1, 2]);
        assert_eq!(uids(TopKind::Best, &TopScope { nation: Some(1649), ..TopScope::default() }), [3, 4]);
        assert_eq!(uids(TopKind::Best, &TopScope { women: true, ..TopScope::default() }), [5]);
        assert_eq!(uids(TopKind::Best, &TopScope { division: Some(12), ..TopScope::default() }), [2]);
        assert_eq!(uids(TopKind::Best, &TopScope { division: Some(99), ..TopScope::default() }), [0u32; 0]);

        let places = top_places(&players);
        assert_eq!(places.continents, ["Europe", "South America"]);
        assert_eq!(places.nations.iter().map(|n| n.uid).collect::<Vec<_>>(), [1649, 765]);
        assert_eq!(
            places.divisions.iter().map(|d| (d.uid, d.nation)).collect::<Vec<_>>(),
            [(11, Some(765)), (40, Some(1649)), (12, Some(765))]
        );
    }
}
