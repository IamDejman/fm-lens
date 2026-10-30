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
    pub staff: StaffLayout,
    pub team: TeamLayout,
    pub club: ClubLayout,
    pub nation: NationLayout,
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
    pub wage: u64,
    pub signed: u64,
    pub expires: u64,
    pub joined: u64,
    pub squad_status: u64,
    pub listing: u64,
    pub squad_number: u64,
}

impl ContractLayout {
    /// One past the last byte of every contract field.
    pub fn end(&self) -> u64 {
        [
            self.wage + 4,
            self.signed + 4,
            self.expires + 4,
            self.joined + 4,
            self.squad_status + 1,
            self.listing + 1,
            self.squad_number + 1,
        ]
        .into_iter()
        .max()
        .unwrap_or(0)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StaffLayout {
    pub full_name: u64,
    pub first_name: u64,
    pub last_name: u64,
    pub common_name: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TeamLayout {
    pub club: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClubLayout {
    pub name: u64,
    pub short_name: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NationLayout {
    pub name: u64,
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

        let fingerprint = PluginFingerprint { size_of_image: 0x1943_6000, link_timestamp: 0x6ADF_B161 };
        let profile = profile_for(fingerprint).expect("Game Pass 0.9.2355.0 profile");
        assert_eq!(profile.storefront, Storefront::GamePass);
        assert_eq!(profile.arrays.players, 0x568_1DC0);
        assert_eq!(profile.edition, layout.edition);
    }
}
