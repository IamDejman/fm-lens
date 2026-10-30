use fmlibre_mem::{Module, Process, is_user_pointer};
use serde::Serialize;

use crate::profile::{ArrayRvas, Layout};
use crate::scan::{ScanOptions, scan_object_arrays};
use crate::text::{is_name_like, read_fm_string, read_name_entry};

/// Elements sampled per array when checking what it holds.
const SAMPLES: u64 = 64;

/// Share of sampled elements that must decode before an array is accepted.
const MIN_CONFIDENCE: f32 = 0.9;

/// Where an entity array's `(begin, end)` pair lives in `game_plugin.dll`. Read the pair
/// again before each use: the game may reallocate the array.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrayRef {
    pub pair_rva: u64,
    pub count: u64,
    /// Share of sampled elements that decoded as the expected entity.
    pub confidence: f32,
}

impl ArrayRef {
    /// Reads the current `(begin, end)` pair; returns `begin` and the element count.
    pub fn locate(&self, process: &Process, module: &Module) -> fmlibre_mem::Result<(u64, u64)> {
        let begin = process.read_u64(module.base + self.pair_rva)?;
        let end = process.read_u64(module.base + self.pair_rva + 8)?;
        Ok((begin, end.saturating_sub(begin) / 8))
    }
}

/// The entity arrays of a running game.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityArrays {
    pub players: Option<ArrayRef>,
    pub staff: Option<ArrayRef>,
    pub clubs: Option<ArrayRef>,
    /// True when the arrays came from a built-in build profile rather than a scan.
    pub from_profile: bool,
}

#[derive(Debug, Clone, Copy)]
enum Kind {
    Player,
    Staff,
    Club,
}

/// Finds the player, staff and club arrays. Uses the build profile's RVAs when they
/// check out and falls back to scanning the module otherwise. Only reads memory.
pub fn calibrate(process: &Process, module: &Module, layout: &Layout, hint: Option<&ArrayRvas>) -> EntityArrays {
    if let Some(hint) = hint {
        let players = check(process, module, layout, Kind::Player, hint.players);
        let staff = check(process, module, layout, Kind::Staff, hint.staff);
        let clubs = check(process, module, layout, Kind::Club, hint.clubs);
        if players.is_some() && staff.is_some() && clubs.is_some() {
            return EntityArrays { players, staff, clubs, from_profile: true };
        }
    }

    let candidates = scan_object_arrays(process, module, &ScanOptions::default());
    let best = |kind| {
        candidates
            .iter()
            .filter_map(|candidate| check(process, module, layout, kind, *candidate.pair_rvas.first()?))
            .max_by(|a, b| {
                // Most confident first, then the largest, then the lowest RVA.
                a.confidence.total_cmp(&b.confidence).then(a.count.cmp(&b.count)).then(b.pair_rva.cmp(&a.pair_rva))
            })
    };
    EntityArrays { players: best(Kind::Player), staff: best(Kind::Staff), clubs: best(Kind::Club), from_profile: false }
}

/// Samples the array whose pair is at `pair_rva` and accepts it when enough elements decode as `kind`.
fn check(process: &Process, module: &Module, layout: &Layout, kind: Kind, pair_rva: u64) -> Option<ArrayRef> {
    let probe = ArrayRef { pair_rva, count: 0, confidence: 0.0 };
    let (begin, count) = probe.locate(process, module).ok()?;
    if count == 0 || !is_user_pointer(begin) {
        return None;
    }
    let samples = count.min(SAMPLES);
    let good = (0..samples)
        .filter(|k| {
            let index = k * count / samples;
            process
                .read_u64(begin + index * 8)
                .is_ok_and(|element| is_user_pointer(element) && looks_like(process, layout, kind, element))
        })
        .count();
    let confidence = good as f32 / samples as f32;
    (confidence >= MIN_CONFIDENCE).then_some(ArrayRef { pair_rva, count, confidence })
}

fn looks_like(process: &Process, layout: &Layout, kind: Kind, object: u64) -> bool {
    let pointer_at = |offset: u64| process.read_u64(object + offset).unwrap_or(0);
    let named = |text: Option<String>| text.is_some_and(|t| is_name_like(&t));
    match kind {
        Kind::Player => {
            let p = &layout.player;
            process.read_u32(object + p.uid).is_ok_and(|uid| uid != 0)
                && (named(read_fm_string(process, pointer_at(p.full_name)))
                    || named(read_name_entry(process, pointer_at(p.last_name))))
        }
        Kind::Staff => {
            let s = &layout.staff;
            named(read_name_entry(process, pointer_at(s.last_name)))
                || named(read_fm_string(process, pointer_at(s.full_name)))
        }
        Kind::Club => named(read_fm_string(process, pointer_at(layout.club.name))),
    }
}
