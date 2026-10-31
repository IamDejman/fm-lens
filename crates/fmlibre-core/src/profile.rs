use std::collections::BTreeMap;

use fmlibre_mem::PeImage;
use serde::Deserialize;

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
    pub heap: HeapLayout,
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
    pub team: u64,
    /// Start of the person block; fields from here on move with the person-block shift.
    pub person_block: u64,
    /// Shifts of the person block seen across player classes (player-coaches use 0xF8).
    pub person_block_shifts: Vec<u64>,
    pub height: u64,
    pub asking_price: u64,
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
    /// `u8` 0..20: how happy the player is, which the game shows in words.
    pub happiness: u64,
    /// `u8` 1..20: his morale, which the game shows in words too.
    pub morale: u64,
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
            self.world_reputation + 2,
            self.international_goals + 2,
            self.u21_goals + 1,
            self.contract + 8,
            self.match_sharpness + 2,
            self.condition + 2,
            self.happiness + 1,
            self.morale + 1,
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
    /// Shifts of the person block seen across staff classes (the human manager uses 0x340).
    pub person_block_shifts: Vec<u64>,
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
        let single_bytes = self.attributes.values().chain(self.ratings.values()).map(|offset| offset + 1);
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
    pub uid: u64,
    pub name: u64,
    pub short_name: u64,
    pub women: u64,
    pub teams: u64,
    pub info: u64,
    pub finance: u64,
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

/// Addresses that change with every build of `game_plugin.dll`.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuildProfile {
    pub name: String,
    pub edition: u32,
    pub storefront: Storefront,
    pub package_version: Option<String>,
    pub plugin: PluginFingerprint,
    pub arrays: ArrayRvas,
}

/// Identifies a build of `game_plugin.dll` from its headers as mapped in memory.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginFingerprint {
    pub size_of_image: u32,
    pub link_timestamp: u32,
}

impl PluginFingerprint {
    pub fn of(image: &PeImage) -> Self {
        Self { size_of_image: image.size_of_image, link_timestamp: image.timestamp }
    }
}

/// RVAs in `game_plugin.dll` of the `(begin, end)` pairs of the entity arrays.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArrayRvas {
    pub players: u64,
    pub staff: u64,
    pub clubs: u64,
}

const LAYOUTS: &[&str] = &[include_str!("../../../profiles/fm27/layout.toml")];

const BUILDS: &[&str] = &[include_str!("../../../profiles/fm27/gamepass-0.9.2355.0.toml")];

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

    #[test]
    fn attribute_groups_cover_the_layout() {
        let layout = layout_for(27).expect("FM27 layout");
        let mut grouped: Vec<&str> =
            crate::ATTRIBUTE_GROUPS.iter().flat_map(|(_, keys)| keys.iter().copied()).collect();
        grouped.sort_unstable();
        let mut mapped: Vec<&str> = layout.player.attributes.keys().map(String::as_str).collect();
        mapped.sort_unstable();
        assert_eq!(grouped, mapped);
    }

    #[test]
    fn built_in_profiles_parse() {
        let layout = layout_for(27).expect("FM27 layout");
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

        let fingerprint = PluginFingerprint { size_of_image: 0x1943_6000, link_timestamp: 0x6ADF_B161 };
        let profile = profile_for(fingerprint).expect("Game Pass 0.9.2355.0 profile");
        assert_eq!(profile.storefront, Storefront::GamePass);
        assert_eq!(profile.arrays.players, 0x568_1DC0);
        assert_eq!(profile.edition, layout.edition);
    }
}
