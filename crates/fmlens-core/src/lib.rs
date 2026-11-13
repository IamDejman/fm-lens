//! Football Manager specific logic shared by the probe and the app: recognising a
//! running game, locating its entity arrays, decoding what they hold and changing it.

#![cfg(any(windows, target_os = "macos"))]

pub mod best;
#[cfg(target_os = "macos")]
pub mod bridge_setup;
mod calibrate;
mod clauses;
mod clubs;
mod coded;
mod cohesion;
mod competitions;
mod date;
mod details;
mod edit;
mod export;
mod filter;
mod game;
mod game_calls;
mod graphics;
mod health;
mod index;
mod languages;
mod loans;
mod mass;
mod medical;
mod mood;
mod national;
mod officials;
mod players;
mod profile;
mod promises;
mod refresh;
mod relations;
mod retirement;
pub mod rtti;
mod scan;
mod scouting;
mod session;
mod squad;
mod staff;
mod staff_move;
mod tactics;
mod template;
mod text;
mod transfer;
mod work_permits;

pub use best::{BestFor, Fit, Weight, board_job};
pub use calibrate::{ArrayRef, EntityArrays, calibrate};
pub use clauses::{ClausePlan, ClauseSet, MOST_CLAUSE_AMOUNT, MOST_CLAUSE_CONDITION, RELEASE_CLAUSE};
pub use clubs::{
    ClubDetails, ClubIndex, ClubSummary, Finances, SUPPORTER_MIX, SUPPORTER_TRAITS, StadiumClub, StadiumFilter,
    StadiumSummary, read_club_details, read_clubs, read_stadiums, stadium_owner,
};
pub use coded::Coded;
pub use cohesion::{Cohered, CohesionPlan, MOST_FAMILIARITY};
pub use competitions::{AwardSummary, CompetitionRule, CompetitionSummary, RuleValue};
pub use date::FmDate;
pub use details::{
    ATTRIBUTE_GROUPS, Attribute, Clause, CompetitionBonus, Contract, International, PERSONALITY, POSITIONS,
    PlayerDetails, Reputation, read_player_details,
};
pub use edit::{Change, EditError, Entity, Field, Kind, Scale, Target, fields};
pub use export::{ExportFormat, ExportHeader, Exported};
pub use filter::{
    AttributeBound, AwardFilter, AwardSort, ClubFilter, ClubSort, CompetitionFilter, CompetitionSort, NationFilter,
    NationSort, Needle, OfficialFilter, OfficialSort, Order, PlayerFilter, PlayerOrder, PlayerSort, RoleBound,
    SortColumn, SortKey, StadiumSort, StaffFilter, StaffSort, player_attribute, sort_by_likeness, sort_players,
    sort_rows,
};
pub use game::{GAME_EXE, GAME_PLUGIN, GameInfo, Storefront};
pub use game_calls::{
    AddedInjury, AgreedSigning, EndedLoan, FutureTransfer, GameActions, GameRelease, InjuryKind, MANAGER_JOB,
    ManagerPlan, MovedManager, PermitChange, SignedPlayer, StartedLoan, TransferredPlayer,
};
pub use graphics::{GraphicsCounts, GraphicsIndex, Picture};
pub use health::{Check, CheckResult, Health, Lock, STRUCTURE};
pub use index::{Listed, SearchIndex};
pub use languages::{LEAST_LEVEL, Language, LanguagePlan, LanguageSet, MOST_LEVEL};
pub use loans::LoanTerms;
pub use mass::{Operation, Plan, Planned, Skipped};
pub use medical::{Ban, HealPlan, Healed, Injury, InjuryPlan, InjurySet, LiftPlan, Lifted};
pub use mood::{ConcernsEnded, ConcernsPlan, HappinessHold};
pub use national::{NationDetails, NationLanguage, NationalJob, NationalTeam, Person, WomenFootball};
pub use officials::OfficialSummary;
pub use players::{
    Base, Nation, NationSummary, PLAYABLE_RATING, PlayerIndex, PlayerSummary, nation_summaries, nations, read_players,
};
pub use profile::{
    ArrayRvas, BuildProfile, ContractLayout, Layout, PlayerLayout, PluginFingerprint, StaffLayout, layout_for,
    profile_for,
};
pub use promises::{Promise, PromiseClosed, PromisePlan};
pub use relations::{
    HOMEGROWN_RULES, MOST_STRENGTH, PersonRef, Preference, PreferenceKind, PreferencePlan, PreferenceSet,
    PreferenceTarget, Related, Relation, RelationPlan, RelationSet, Tie, TieTarget,
};
pub use retirement::{PlannedRetirement, RetirementPlan, RetirementSet};
pub use scan::{ArrayCandidate, ScanOptions, VtableCount, scan_object_arrays};
pub use scouting::{
    Development, Likeness, PROMISING_AGE, Place, REPORT_ROLES, ROLES, RoleRating, Scores, ScoutReport, SimilarTo,
    TOP_COUNT, TopKind, TopPlaces, TopScope, WITHIN, history, scores, scout_report, top_places, top_players,
};
pub use session::{ArraySource, Session, SessionError, find_game};
pub use squad::{CaptainPlan, CaptainRole, CaptainSet, ClubTeam, Loan, SquadMember, TeamId};
pub use staff::{
    STAFF_ATTRIBUTE_GROUPS, StaffContract, StaffDetails, StaffIndex, StaffSummary, job_name, read_staff,
    read_staff_details,
};
pub use staff_move::{Department, STAFF_JOBS, StaffChange, StaffPlan, department_of};
pub use tactics::{PlayerTactics, RaisedTactics, TeamTactics};
pub use template::{PlayerTemplate, TemplateError, TemplateGroup};
pub use text::{fold, is_name_like, read_fm_string, read_name_entry};
pub use transfer::{
    Amounts, ClubMoney, ClubMove, FeePlan, MAX_FEE, MoveError, MovePlan, MoveTerms, Paid, TransferPlan,
};
pub use work_permits::WorkPermit;
