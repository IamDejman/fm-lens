//! Portable player snapshots. Never serialize addresses, identity, contracts or club records.

use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::{Entity, Field, Operation, Session, Target};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TemplateGroup {
    Ability,
    Attributes,
    Personality,
    Positions,
    Traits,
}

impl TemplateGroup {
    fn includes(self, key: &str) -> bool {
        match self {
            Self::Ability => matches!(key, "current_ability" | "potential_ability"),
            Self::Attributes => key.starts_with("attribute."),
            Self::Personality => key.starts_with("personality."),
            Self::Positions => key.starts_with("position."),
            Self::Traits => key.starts_with("trait."),
        }
    }
}

const GROUPS: [TemplateGroup; 5] = [
    TemplateGroup::Ability,
    TemplateGroup::Attributes,
    TemplateGroup::Personality,
    TemplateGroup::Positions,
    TemplateGroup::Traits,
];

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerTemplate {
    pub format: String,
    pub version: u32,
    pub name: String,
    /// Values use FM's stored scales, independent of display rounding and currency.
    pub values: BTreeMap<String, i64>,
}

#[derive(Debug)]
pub struct TemplateError(String);

impl fmt::Display for TemplateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for TemplateError {}

impl PlayerTemplate {
    /// Revalidate against the destination build. No unrecognized field is silently dropped.
    pub fn operations(&self, fields: &[Field]) -> Result<Vec<(Field, Operation)>, TemplateError> {
        if self.format != "fm-lens-player" || self.version != 1 {
            return Err(TemplateError("Unsupported player template format or version.".into()));
        }
        if self.name.trim().is_empty() || self.name.chars().count() > 80 || self.name.chars().any(char::is_control) {
            return Err(TemplateError(
                "Template names must contain 1–80 characters without control characters.".into(),
            ));
        }
        if self.values.is_empty() || self.values.len() > 256 {
            return Err(TemplateError("A template must contain 1–256 player fields.".into()));
        }
        self.values
            .iter()
            .map(|(key, &value)| {
                let field = fields
                    .iter()
                    .find(|field| {
                        field.entity == Entity::Player
                            && field.mass
                            && field.key == *key
                            && GROUPS.iter().any(|group| group.includes(key))
                    })
                    .ok_or_else(|| TemplateError(format!("Unsupported template field: {key}")))?;
                let operation = Operation::Set { value };
                operation.check(field).map_err(|err| TemplateError(err.to_string()))?;
                Ok((field.clone(), operation))
            })
            .collect()
    }
}

impl Session {
    /// Capture only explicitly chosen groups, rejecting unreadable or nonportable values.
    pub fn capture_player_template(
        &self,
        target: &Target,
        name: String,
        groups: &[TemplateGroup],
    ) -> Result<PlayerTemplate, TemplateError> {
        if target.entity != Entity::Player {
            return Err(TemplateError("Only players can be captured.".into()));
        }
        let fields: Vec<_> = self
            .fields(Entity::Player)
            .into_iter()
            .filter(|field| field.mass && groups.iter().any(|group| group.includes(&field.key)))
            .collect();
        let read = self.read_fields(target, &fields).map_err(|err| TemplateError(err.to_string()))?;
        let mut values = BTreeMap::new();
        for (field, value) in fields.iter().zip(read) {
            let value = value.ok_or_else(|| TemplateError(format!("Cannot read {} from this player.", field.key)))?;
            values.insert(field.key.clone(), value);
        }
        let template = PlayerTemplate { format: "fm-lens-player".into(), version: 1, name, values };
        template.operations(&fields)?;
        Ok(template)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{fields, layout_for};

    fn template(values: &[(&str, i64)]) -> PlayerTemplate {
        PlayerTemplate {
            format: "fm-lens-player".into(),
            version: 1,
            name: "Test".into(),
            values: values.iter().map(|(key, value)| ((*key).into(), *value)).collect(),
        }
    }

    #[test]
    fn portable_fields_resolve_on_the_destination_layout() {
        let table = fields(&layout_for(27).unwrap(), Entity::Player);
        let values = template(&[("current_ability", 185), ("attribute.finishing", 95), ("trait.0", 1)]);
        let operations = values.operations(&table).unwrap();
        assert_eq!(operations.len(), 3);
        assert!(operations.iter().all(|(field, _)| field.entity == Entity::Player));
    }

    #[test]
    fn imported_templates_cannot_write_identity_contracts_or_unknown_fields() {
        let table = fields(&layout_for(27).unwrap(), Entity::Player);
        for key in ["nation", "contract.wage", "height", "uid", "attribute.made_up", "0x1234"] {
            assert!(template(&[(key, 1)]).operations(&table).is_err(), "{key}");
        }
        for (key, value) in [("current_ability", 201), ("attribute.finishing", 101), ("trait.0", 2)] {
            assert!(template(&[(key, value)]).operations(&table).is_err(), "{key}");
        }
        let mut future = template(&[("current_ability", 100)]);
        future.version = 2;
        assert!(future.operations(&table).is_err());
        assert!(template(&[]).operations(&table).is_err());
    }
}
