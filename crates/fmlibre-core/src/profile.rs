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
    fn built_in_profiles_parse() {
        let layout = layout_for(27).expect("FM27 layout");
        assert_eq!(layout.player.uid, 0x294);

        let fingerprint = PluginFingerprint { size_of_image: 0x1943_6000, link_timestamp: 0x6ADF_B161 };
        let profile = profile_for(fingerprint).expect("Game Pass 0.9.2355.0 profile");
        assert_eq!(profile.storefront, Storefront::GamePass);
        assert_eq!(profile.arrays.players, 0x568_1DC0);
        assert_eq!(profile.edition, layout.edition);
    }
}
