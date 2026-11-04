# FM Lens mapped editing fields

This catalog contains field definitions, not a claim that every operation has
passed in-game save/reload validation. See ROADMAP.md and PERSONAL-SCOUT.md.

The current FM27 Apple Silicon layout defines 167 player fields, 37 staff fields
and 14 club fields. A missing record, unsupported build, changed career storage,
failed layout check, stale value or invalid current/new value prevents a write.
Fields use stored scales; the interface converts attributes and percentages.

Player templates accept CA/PA, attributes (including hidden values and feet),
personality, positions and traits only. Identity, nationality, contracts and club
records cannot be imported through a template.

## Players

| Field | Storage | Scale | Writable range |
| --- | --- | --- | --- |
| `current_ability` | u16 | plain | 1–200 |
| `potential_ability` | i16 | plain | 1–200 |
| `height` | u16 | plain | 140–220 |
| `nation` | pointer | plain | 65536–140737488355327 |
| `date_of_birth` | date | plain | 1940-01-01–2020-12-31 |
| `asking_price` | i32 | plain | 0–2000000000 |
| `reputation.home` | u16 | plain | 0–10000 |
| `reputation.current` | u16 | plain | 0–10000 |
| `reputation.world` | u16 | plain | 0–10000 |
| `international.caps` | u16 | plain | 0–1000 |
| `international.goals` | u16 | plain | 0–1000 |
| `international.u21_caps` | u8 | plain | 0–255 |
| `international.u21_goals` | u8 | plain | 0–255 |
| `condition` | u16 | percent | 0 (0%)–10000 (100%) |
| `match_sharpness` | u16 | percent | 0 (0%)–10000 (100%) |
| `jadedness` | i16 | plain | -500–1000 |
| `morale` | u8 | plain | 1–20 |
| `attribute.corners` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.crossing` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.dribbling` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.finishing` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.first_touch` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.free_kicks` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.heading` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.long_shots` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.long_throws` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.marking` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.passing` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.penalty_taking` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.tackling` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.technique` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.aggression` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.anticipation` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.bravery` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.composure` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.concentration` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.decisions` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.determination` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.flair` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.leadership` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.off_the_ball` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.positioning` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.teamwork` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.vision` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.work_rate` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.acceleration` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.agility` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.balance` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.jumping_reach` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.natural_fitness` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.pace` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.stamina` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.strength` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.aerial_reach` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.command_of_area` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.communication` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.eccentricity` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.handling` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.kicking` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.one_on_ones` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.punching` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.reflexes` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.rushing_out` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.throwing` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.consistency` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.dirtiness` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.important_matches` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.injury_proneness` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.versatility` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.left_foot` | u8 | attribute | 1 (1)–100 (20) |
| `attribute.right_foot` | u8 | attribute | 1 (1)–100 (20) |
| `position.gk` | u8 | plain | 1–20 |
| `position.dl` | u8 | plain | 1–20 |
| `position.dc` | u8 | plain | 1–20 |
| `position.dr` | u8 | plain | 1–20 |
| `position.dm` | u8 | plain | 1–20 |
| `position.ml` | u8 | plain | 1–20 |
| `position.mc` | u8 | plain | 1–20 |
| `position.mr` | u8 | plain | 1–20 |
| `position.aml` | u8 | plain | 1–20 |
| `position.amc` | u8 | plain | 1–20 |
| `position.amr` | u8 | plain | 1–20 |
| `position.st` | u8 | plain | 1–20 |
| `position.wbl` | u8 | plain | 1–20 |
| `position.wbr` | u8 | plain | 1–20 |
| `personality.adaptability` | u8 | plain | 1–20 |
| `personality.ambition` | u8 | plain | 1–20 |
| `personality.loyalty` | u8 | plain | 1–20 |
| `personality.pressure` | u8 | plain | 1–20 |
| `personality.professionalism` | u8 | plain | 1–20 |
| `personality.sportsmanship` | u8 | plain | 1–20 |
| `personality.temperament` | u8 | plain | 1–20 |
| `personality.controversy` | u8 | plain | 1–20 |
| `contract.wage` | i32 | plain | 0–10000000 |
| `contract.expires` | date | plain | 2000-01-01–2100-12-31 |
| `contract.squad_number` | u8 | plain | 1–99 |
| `contract.squad_status` | u8 | plain | 1–40 |
| `contract.transfer_listed` | flag | plain | 0–1 |
| `contract.loan_listed` | flag | plain | 0–1 |
| `contract.loyalty_bonus` | i32 | plain | 0–10000000 |
| `contract.happiness` | i8 | plain | -100–100 |
| `contract.playing_time_happiness` | i8 | plain | -100–100 |
| `contract.unhappiness` | u32 | plain | 0–0 |
| `trait.0` | flag | plain | 0–1 |
| `trait.1` | flag | plain | 0–1 |
| `trait.2` | flag | plain | 0–1 |
| `trait.3` | flag | plain | 0–1 |
| `trait.4` | flag | plain | 0–1 |
| `trait.5` | flag | plain | 0–1 |
| `trait.6` | flag | plain | 0–1 |
| `trait.7` | flag | plain | 0–1 |
| `trait.8` | flag | plain | 0–1 |
| `trait.9` | flag | plain | 0–1 |
| `trait.10` | flag | plain | 0–1 |
| `trait.11` | flag | plain | 0–1 |
| `trait.12` | flag | plain | 0–1 |
| `trait.13` | flag | plain | 0–1 |
| `trait.14` | flag | plain | 0–1 |
| `trait.15` | flag | plain | 0–1 |
| `trait.16` | flag | plain | 0–1 |
| `trait.17` | flag | plain | 0–1 |
| `trait.18` | flag | plain | 0–1 |
| `trait.19` | flag | plain | 0–1 |
| `trait.20` | flag | plain | 0–1 |
| `trait.21` | flag | plain | 0–1 |
| `trait.22` | flag | plain | 0–1 |
| `trait.23` | flag | plain | 0–1 |
| `trait.24` | flag | plain | 0–1 |
| `trait.25` | flag | plain | 0–1 |
| `trait.26` | flag | plain | 0–1 |
| `trait.27` | flag | plain | 0–1 |
| `trait.28` | flag | plain | 0–1 |
| `trait.29` | flag | plain | 0–1 |
| `trait.30` | flag | plain | 0–1 |
| `trait.31` | flag | plain | 0–1 |
| `trait.32` | flag | plain | 0–1 |
| `trait.33` | flag | plain | 0–1 |
| `trait.34` | flag | plain | 0–1 |
| `trait.35` | flag | plain | 0–1 |
| `trait.36` | flag | plain | 0–1 |
| `trait.37` | flag | plain | 0–1 |
| `trait.38` | flag | plain | 0–1 |
| `trait.39` | flag | plain | 0–1 |
| `trait.40` | flag | plain | 0–1 |
| `trait.41` | flag | plain | 0–1 |
| `trait.42` | flag | plain | 0–1 |
| `trait.43` | flag | plain | 0–1 |
| `trait.44` | flag | plain | 0–1 |
| `trait.45` | flag | plain | 0–1 |
| `trait.46` | flag | plain | 0–1 |
| `trait.47` | flag | plain | 0–1 |
| `trait.48` | flag | plain | 0–1 |
| `trait.49` | flag | plain | 0–1 |
| `trait.50` | flag | plain | 0–1 |
| `trait.51` | flag | plain | 0–1 |
| `trait.52` | flag | plain | 0–1 |
| `trait.53` | flag | plain | 0–1 |
| `trait.54` | flag | plain | 0–1 |
| `trait.55` | flag | plain | 0–1 |
| `trait.56` | flag | plain | 0–1 |
| `trait.57` | flag | plain | 0–1 |
| `trait.58` | flag | plain | 0–1 |
| `trait.59` | flag | plain | 0–1 |
| `trait.60` | flag | plain | 0–1 |
| `trait.61` | flag | plain | 0–1 |
| `trait.62` | flag | plain | 0–1 |
| `trait.63` | flag | plain | 0–1 |

## Staff

| Field | Storage | Scale | Writable range |
| --- | --- | --- | --- |
| `current_ability` | u16 | plain | 1–200 |
| `potential_ability` | i16 | plain | 1–200 |
| `reputation.home` | u16 | plain | 0–10000 |
| `reputation.current` | u16 | plain | 0–10000 |
| `reputation.world` | u16 | plain | 0–10000 |
| `nation` | pointer | plain | 65536–140737488355327 |
| `attribute.attacking` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.defending` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.fitness` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.goalkeeping` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.possession` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.set_pieces` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.tactical` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.technical` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.working_with_youngsters` | u8 | plain | 1–20 |
| `attribute.authority` | u8 | plain | 1–20 |
| `attribute.determination` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.motivating` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.people_management` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.data_analysis` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.judging_ability` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.judging_potential` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.judging_staff` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.negotiating` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.tactical_knowledge` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.physiotherapy` | u8 | attribute | 0 (1)–100 (20) |
| `attribute.sports_science` | u8 | attribute | 0 (1)–100 (20) |
| `personality.adaptability` | u8 | plain | 1–20 |
| `personality.ambition` | u8 | plain | 1–20 |
| `personality.loyalty` | u8 | plain | 1–20 |
| `personality.pressure` | u8 | plain | 1–20 |
| `personality.professionalism` | u8 | plain | 1–20 |
| `personality.sportsmanship` | u8 | plain | 1–20 |
| `personality.temperament` | u8 | plain | 1–20 |
| `personality.controversy` | u8 | plain | 1–20 |
| `contract.wage` | i32 | plain | 0–10000000 |
| `contract.expires` | date | plain | 2000-01-01–2100-12-31 |

## Clubs

| Field | Storage | Scale | Writable range |
| --- | --- | --- | --- |
| `reputation` | u16 | plain | 0–10000 |
| `facilities.training` | u8 | plain | 1–20 |
| `facilities.youth_facilities` | u8 | plain | 1–20 |
| `facilities.youth_coaching` | u8 | plain | 1–20 |
| `facilities.youth_recruitment` | u8 | plain | 1–20 |
| `facilities.corporate` | u8 | plain | 1–20 |
| `finance.balance` | i32 | plain | -2000000000–2000000000 |
| `finance.transfer_budget` | i32 | plain | 0–2000000000 |
| `finance.wage_budget` | i32 | plain | 0–100000000 |
| `finance.total_wage_budget` | i32 | plain | 0–100000000 |
| `stadium.capacity` | u32 | plain | 0–250000 |
| `stadium.seating` | u32 | plain | 0–250000 |
| `stadium.used` | u32 | plain | 0–250000 |
| `stadium.expansion` | u32 | plain | 0–250000 |

## Unsupported systems

Nations, competitions, awards, officials, promises and youth-intake records do
not yet have validated editing layouts in this fork. Complete loans/transfers,
manager protections, work permits, languages, ownership, kits and competition
rule behavior also remain research work. These cannot be enabled by adding
inputs or reusing a Windows offset on macOS.
