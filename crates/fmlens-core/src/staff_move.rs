//! Moving a member of staff to another club, and giving him another job at his club.
//!
//! A club keeps its staff in three department lists of pointers (see [`ClubLayout`]): the medical team, the coaches
//! and the scouts; a fitness coach may be in the first two. A member of staff's contract points at the team he works
//! for and at the club's senior team. A move takes him out of every department list of his old club that holds him,
//! puts him in the same departments of the new club, and points his contract at its senior team, dated from today. A
//! new job changes his contract's job code, and moves him between his club's departments as the job needs.
//!
//! A Director of Football is in no department: his club points at him itself, and has one at most. He moves from his
//! club's pointer to the new club's, and where it has a director already, the two change places. Taking the job puts
//! a member of staff in that pointer and out of the lists; leaving it does the reverse.
//!
//! Like a player's move, it allocates nothing: a list must have room in the block it has. And only staff whom neither
//! the club nor its teams point at directly, but for that pointer, are moved or given a new job: a team's manager, for
//! one, is held by his team, and is left to the game.
//!
//! Where a list has no room, or he has no club to move from, the game is asked to sign him itself (see
//! [`Session::plan_staff_signing`]): it makes his contract and grows the list, and nothing undoes it.
//!
//! [`ClubLayout`]: crate::ClubLayout

use fmlens_mem::is_user_pointer;

use crate::clubs::ClubSummary;
use crate::edit::Kind;
use crate::profile::Layout;
use crate::session::Session;
use crate::staff::StaffSummary;
use crate::transfer::{MoveError, Patch, Patches, PointerList, removal_patches};

/// A department of a club's staff.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Department {
    Medical,
    Coaching,
    Scouting,
}

impl Department {
    pub fn name(self) -> &'static str {
        match self {
            Department::Medical => "medical",
            Department::Coaching => "coaching",
            Department::Scouting => "scouting",
        }
    }

    /// Where the club keeps the list of this department.
    fn offset(self, layout: &Layout) -> u64 {
        match self {
            Department::Medical => layout.club.medical_staff,
            Department::Coaching => layout.club.coaching_staff,
            Department::Scouting => layout.club.scouting_staff,
        }
    }
}

pub(crate) const DEPARTMENTS: [Department; 3] = [Department::Medical, Department::Coaching, Department::Scouting];

/// The jobs the editor gives and takes away, by contract code (see [`crate::job_name`]), with the department each
/// belongs to. A manager, the board, the directors and jobs the editor cannot name are left as they are.
pub const STAFF_JOBS: [(u8, Department); 14] = [
    (2, Department::Coaching),  // Coach
    (20, Department::Coaching), // Assistant Manager
    (22, Department::Coaching), // Set Piece Coach
    (26, Department::Coaching), // Fitness Coach, some of whom the medical team lists too
    (34, Department::Coaching), // Goalkeeping Coach
    (60, Department::Coaching), // Performance Analyst
    (64, Department::Coaching), // Head of Youth Development
    (12, Department::Medical),  // Physio
    (40, Department::Medical),  // Head of Sports Science
    (48, Department::Medical),  // Sports Scientist
    (50, Department::Medical),  // Head Physio
    (14, Department::Scouting), // Scout
    (44, Department::Scouting), // Chief Scout
    (58, Department::Scouting), // Recruitment Analyst
];

/// The Director of Football's job, by contract code: the editor gives and takes it away too, where the layout says how
/// a club holds its director (see [`ClubLayout::director_of_football`]). It has no department.
///
/// [`ClubLayout::director_of_football`]: crate::ClubLayout::director_of_football
pub const DIRECTOR_JOB: u8 = 10;

/// The department of a job the editor gives and takes away.
pub fn department_of(job: u8) -> Option<Department> {
    STAFF_JOBS.iter().find(|&&(code, _)| code == job).map(|&(_, department)| department)
}

/// How many bytes of a club, and of each of its teams, are looked through for a pointer to a member of staff.
const CLUB_BYTES: usize = 0x170;
const TEAM_BYTES: usize = 0x800;

/// A move of a member of staff, or a new job, worked out from the game as it is now and ready to be written.
#[derive(Debug, Clone)]
pub struct StaffPlan {
    pub member: u32,
    pub from_club: u32,
    /// The club he moves to; his own for a new job.
    pub to_club: u32,
    /// The job he has, and the one he will have (the same for a move).
    pub job: (u8, u8),
    /// For a Director of Football's move, the director of the club he moves to, who takes his place at the club he
    /// leaves.
    pub displaced: Option<u32>,
    patches: Vec<Patch>,
}

/// A move or a new job that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct StaffChange {
    pub member: u32,
    pub from_club: u32,
    pub to_club: u32,
    pub job: (u8, u8),
    pub displaced: Option<u32>,
    patches: Vec<Patch>,
}

/// A signing of a member of staff that the game is to make itself, worked out from the game as it is now.
#[derive(Debug, Clone)]
pub struct StaffSigning {
    pub member: u32,
    /// The club he leaves; none for a member of staff without one.
    pub from_club: Option<u32>,
    pub to_club: u32,
    /// The job he has, if he has one, and the one he signs for.
    pub job: (Option<u8>, u8),
    /// The club's Director of Football, whom the game releases when it signs another.
    pub displaced: Option<u32>,
    object: u64,
    senior: u64,
    /// The contract he has, as his object points at it: nothing for a member of staff without a club.
    contract: u64,
}

/// A signing the game made: nothing undoes it.
#[derive(Debug, Clone, Copy)]
pub struct SignedStaff {
    pub member: u32,
    pub from_club: Option<u32>,
    pub to_club: u32,
    pub job: (Option<u8>, u8),
    pub displaced: Option<u32>,
}

/// What ties a member of staff to his club, checked.
struct Holder {
    object: u64,
    contract: u64,
    /// The contract's bytes, as read.
    record: Vec<u8>,
    club: u64,
    club_uid: u32,
    /// The senior team of his club, as his contract has it.
    senior: u64,
    job: u8,
    /// For the club's Director of Football, where the club points at him.
    director: Option<u64>,
    /// Each department list of the club that holds him: the department, the list, where in it he is, what it holds.
    lists: Vec<(Department, PointerList, usize, Vec<u64>)>,
}

impl Session {
    /// Works out moving `member` to `club`, in the departments he works in, on his contract dated from today. Nothing
    /// is written.
    pub fn plan_staff_move(&self, member: &StaffSummary, club: &ClubSummary) -> Result<StaffPlan, MoveError> {
        let (process, layout) = (&self.process, &self.layout);
        let holder = self.staff_holder(member)?;
        if process.read_u32(club.address + layout.club.uid)? != club.uid {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        if club.address == holder.club {
            return Err(MoveError::SameClub);
        }
        let women = |address: u64| process.read_bytes(address + layout.club.women, 1).map(|b| b[0]);
        if women(holder.club)? != women(club.address)? {
            return Err(MoveError::MenAndWomen);
        }
        // The new club's senior team must point back at it.
        let senior = match PointerList::read(process, club.address + layout.club.teams)? {
            Some(teams) if teams.len() > 0 => process.read_u64(teams.begin_address())?,
            _ => 0,
        };
        if !is_user_pointer(senior) || process.read_u64(senior + layout.team.club)? != club.address {
            return Err(MoveError::NotAClub { uid: club.uid });
        }

        let mut patches = Patches::default();
        for (department, list, index, elements) in &holder.lists {
            let joining = self.department_list(club.address, *department)?;
            if joining.1.contains(&holder.object) {
                return Err(MoveError::NotInDepartment);
            }
            self.check_room(&joining.0, *department)?;
            self.append_patches(&joining.0, holder.object, &mut patches)?;
            removal_patches(list, *index, elements, &mut patches);
        }
        let mut displaced = None;
        if let Some(slot) = holder.director {
            // The new club's director, if it has one, takes his place: each keeps his own contract.
            let joining = club.address + (slot - holder.club);
            let incumbent = process.read_u64(joining)?;
            if incumbent != 0 {
                if !is_user_pointer(incumbent) {
                    return Err(MoveError::StaffRole);
                }
                let uid = process.read_u32(incumbent + layout.staff.uid)?;
                let other = self.holder_at(incumbent, uid)?;
                if other.director != Some(joining) {
                    return Err(MoveError::StaffRole);
                }
                self.staff_contract_patches(&other, Some(holder.senior), other.job, &mut patches);
                displaced = Some(uid);
            }
            patches.push(slot, holder.object.to_le_bytes(), incumbent.to_le_bytes());
            patches.push(joining, incumbent.to_le_bytes(), holder.object.to_le_bytes());
        }
        self.staff_contract_patches(&holder, Some(senior), holder.job, &mut patches);
        Ok(StaffPlan {
            member: member.uid,
            from_club: holder.club_uid,
            to_club: club.uid,
            job: (holder.job, holder.job),
            displaced,
            patches: patches.0,
        })
    }

    /// Works out giving `member` the job `job` at his club: he leaves the departments the job is not in, and joins
    /// the one it is in. A Director of Football is in none: the club points at him, and must have no other. Nothing
    /// is written.
    pub fn plan_staff_job(&self, member: &StaffSummary, job: u8) -> Result<StaffPlan, MoveError> {
        let holder = self.staff_holder(member)?;
        if holder.director.is_none() {
            department_of(holder.job).ok_or(MoveError::UnusualJob { job: holder.job })?;
        }
        // Where the new job puts him: the club's pointer to its director, or a department.
        let slot = self.layout.club.director_of_football.filter(|_| job == DIRECTOR_JOB).map(|at| holder.club + at);
        let department = match slot {
            Some(_) => None,
            None => Some(department_of(job).ok_or(MoveError::UnusualJob { job })?),
        };

        let mut patches = Patches::default();
        if job != holder.job {
            for (from, list, index, elements) in &holder.lists {
                if Some(*from) != department {
                    removal_patches(list, *index, elements, &mut patches);
                }
            }
            if let Some(department) = department.filter(|to| !holder.lists.iter().any(|(from, ..)| from == to)) {
                let (list, _) = self.department_list(holder.club, department)?;
                self.check_room(&list, department)?;
                self.append_patches(&list, holder.object, &mut patches)?;
            }
            let (object, none) = (holder.object.to_le_bytes(), 0u64.to_le_bytes());
            if let Some(slot) = holder.director {
                patches.push(slot, object, none);
            }
            if let Some(slot) = slot {
                if self.process.read_u64(slot)? != 0 {
                    return Err(MoveError::DirectorTaken);
                }
                patches.push(slot, none, object);
            }
            self.staff_contract_patches(&holder, None, job, &mut patches);
        }
        Ok(StaffPlan {
            member: member.uid,
            from_club: holder.club_uid,
            to_club: holder.club_uid,
            job: (holder.job, job),
            displaced: None,
            patches: patches.0,
        })
    }

    /// Works out having the game sign `member` for the senior team of `club` in the job `job`, or the one he has: the
    /// way into a department with no room, and the only one for a member of staff without a club. The game ends the
    /// contract he has and makes another, puts him among the club's staff, and for a Director of Football releases
    /// the one the club has. Nothing is written.
    pub fn plan_staff_signing(
        &self,
        member: &StaffSummary,
        club: &ClubSummary,
        job: Option<u8>,
    ) -> Result<StaffSigning, MoveError> {
        if member.is_human || member.shift != 0 {
            return Err(MoveError::You);
        }
        let (process, layout) = (&self.process, &self.layout);
        self.staff_signing_ready()?;
        if process.read_u32(member.address + layout.staff.uid)? != member.uid {
            return Err(MoveError::Moved { uid: member.uid });
        }
        if process.read_u32(club.address + layout.club.uid)? != club.uid {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        let senior = self.senior_team(club)?;
        let contract = process.read_u64(member.address + layout.staff.contract)?;
        let (from_club, had) = if is_user_pointer(contract) {
            let holder = self.holder_at(member.address, member.uid)?;
            let women = |address: u64| process.read_bytes(address + layout.club.women, 1).map(|b| b[0]);
            if women(holder.club)? != women(club.address)? {
                return Err(MoveError::MenAndWomen);
            }
            (Some(holder.club_uid), Some(holder.job))
        } else {
            (None, None)
        };
        let job = job.or(had).ok_or(MoveError::Unemployed)?;
        let slot = layout.club.director_of_football.filter(|_| job == DIRECTOR_JOB).map(|at| club.address + at);
        if slot.is_none() && department_of(job).is_none() {
            return Err(MoveError::UnusualJob { job });
        }
        if from_club == Some(club.uid) && had == Some(job) {
            return Err(MoveError::SameClub);
        }
        let displaced = match slot.map(|slot| process.read_u64(slot)).transpose()? {
            Some(sitting) if sitting != 0 && sitting != member.address => {
                if !is_user_pointer(sitting) {
                    return Err(MoveError::StaffRole);
                }
                Some(process.read_u32(sitting + layout.staff.uid)?)
            }
            _ => None,
        };
        Ok(StaffSigning {
            member: member.uid,
            from_club,
            to_club: club.uid,
            job: (had, job),
            displaced,
            object: member.address,
            senior,
            contract,
        })
    }

    /// Has the game make a signing, and reads his new contract back to tell. Where he had a contract, the new one
    /// keeps its wage and the day it ends; and for a new job at his club, the days it was signed and he joined.
    pub fn sign_staff(&self, signing: &StaffSigning) -> Result<SignedStaff, MoveError> {
        let (process, layout) = (&self.process, &self.layout);
        let (s, c) = (&layout.staff, &layout.contract);
        let StaffSigning { member, from_club, to_club, job, displaced, object, senior, contract } = *signing;
        if process.read_u32(object + s.uid)? != member || process.read_u64(object + s.contract)? != contract {
            return Err(MoveError::Moved { uid: member });
        }
        let stays = from_club == Some(to_club);
        let kept: Vec<(u64, Vec<u8>)> = [(c.wage, true), (c.expires, true), (c.signed, stays), (c.joined, stays)]
            .into_iter()
            .filter(|&(_, keep)| keep && is_user_pointer(contract))
            .filter_map(|(offset, _)| Some((offset, process.read_bytes(contract + offset, 4).ok()?)))
            .collect();
        let signed = self.run_staff_signing(object + s.actual_person(), senior, job.1)?;

        let made = process.read_u64(object + s.contract)?;
        if !signed
            || !is_user_pointer(made)
            || process.read_u64(made + c.team)? != senior
            || process.read_bytes(made + c.job, 1)?[0] != job.1
        {
            return Err(MoveError::CallDeclined);
        }
        let mut patches = Patches::default();
        for (offset, was) in kept {
            if let Ok(now) = process.read_bytes(made + offset, 4) {
                patches.push(made + offset, now, was);
            }
        }
        // The signing is made whatever comes of his old terms.
        let _ = self.apply_patches(&patches.0);
        Ok(SignedStaff { member, from_club, to_club, job, displaced })
    }

    /// Writes a plan, each write over the bytes it expects, after checking them all.
    pub fn apply_staff_plan(&self, plan: &StaffPlan) -> Result<StaffChange, MoveError> {
        self.apply_patches(&plan.patches)?;
        let StaffPlan { member, from_club, to_club, job, displaced, ref patches } = *plan;
        Ok(StaffChange { member, from_club, to_club, job, displaced, patches: patches.clone() })
    }

    /// Puts the member of staff back as he was, provided memory still holds everything the change wrote.
    pub fn undo_staff_change(&self, done: &StaffChange) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// Checks what ties `member` to his club, and finds every department list of it that holds him.
    fn staff_holder(&self, member: &StaffSummary) -> Result<Holder, MoveError> {
        if member.is_human || member.shift != 0 {
            return Err(MoveError::You);
        }
        self.holder_at(member.address, member.uid)
    }

    /// As [`Session::staff_holder`], for the member of staff `uid` whose object is at `object`.
    fn holder_at(&self, object: u64, uid: u32) -> Result<Holder, MoveError> {
        let (process, layout) = (&self.process, &self.layout);
        let (s, c) = (&layout.staff, &layout.contract);
        if process.read_u32(object + s.uid)? != uid {
            return Err(MoveError::Moved { uid });
        }
        let contract = process.read_u64(object + s.contract)?;
        if !is_user_pointer(contract) {
            return Err(MoveError::Unemployed);
        }
        let record = process.read_bytes(contract, c.end() as usize)?;
        let word =
            |offset: u64| u64::from_le_bytes(record[offset as usize..offset as usize + 8].try_into().expect("8 bytes"));
        let job = record[c.job as usize];
        let (team, senior) = (word(c.team), word(c.senior_team));
        if word(c.owner) != object + s.identity() || !is_user_pointer(team) || !is_user_pointer(senior) {
            return Err(MoveError::UnusualContract);
        }
        // A player, or a player-coach (a coaching job's code plus one), is moved as a player or not at all.
        if job == 1 || (job > 1 && job % 2 == 1) {
            return Err(MoveError::PlayerCoach);
        }
        let club = process.read_u64(senior + layout.team.club)?;
        if !is_user_pointer(club) || process.read_u64(team + layout.team.club)? != club {
            return Err(MoveError::UnusualContract);
        }
        let club_uid = process.read_u32(club + layout.club.uid)?;

        let mut lists = Vec::new();
        for department in DEPARTMENTS {
            let Ok((list, elements)) = self.department_list(club, department) else {
                continue;
            };
            let held: Vec<usize> = elements.iter().enumerate().filter(|&(_, &e)| e == object).map(|(i, _)| i).collect();
            match held[..] {
                [] => {}
                [index] => lists.push((department, list, index, elements)),
                _ => return Err(MoveError::NotInDepartment),
            }
        }
        // A Director of Football is in none of them: the club points at him.
        let director = match layout.club.director_of_football.map(|at| club + at) {
            Some(slot) if job == DIRECTOR_JOB && lists.is_empty() && process.read_u64(slot)? == object => Some(slot),
            _ => None,
        };
        if lists.is_empty() && director.is_none() {
            // Nor is a manager or a board member: his job, not the lists, is why he stays.
            return Err(match department_of(job) {
                Some(_) => MoveError::NotInDepartment,
                None => MoveError::UnusualJob { job },
            });
        }
        self.check_unheld(club, object, object + s.identity(), object + s.person_block, director)?;
        Ok(Holder { object, contract, record, club, club_uid, senior, job, director, lists })
    }

    /// The club's list of `department`, and what it holds.
    pub(crate) fn department_list(
        &self,
        club: u64,
        department: Department,
    ) -> Result<(PointerList, Vec<u64>), MoveError> {
        let list = PointerList::read(&self.process, club + department.offset(&self.layout))?
            .ok_or(MoveError::DepartmentFull { department: department.name(), staff: 0 })?;
        let elements = list.elements(&self.process)?;
        Ok((list, elements))
    }

    fn check_room(&self, list: &PointerList, department: Department) -> Result<(), MoveError> {
        if list.len() + 1 > list.room(&self.process, &self.layout.heap)? {
            return Err(MoveError::DepartmentFull { department: department.name(), staff: list.len() });
        }
        Ok(())
    }

    /// Fails when the club or one of its teams points at the member of staff (his object, identity or person block)
    /// itself, rather than through a department list: such a role is the game's to move. The pointer at `except`,
    /// the club's to its Director of Football, is not counted.
    pub(crate) fn check_unheld(
        &self,
        club: u64,
        object: u64,
        identity: u64,
        person: u64,
        except: Option<u64>,
    ) -> Result<(), MoveError> {
        let process = &self.process;
        let mut places = vec![(club, CLUB_BYTES)];
        if let Some(teams) = PointerList::read(process, club + self.layout.club.teams)? {
            places
                .extend(teams.elements(process)?.into_iter().filter(|&t| is_user_pointer(t)).map(|t| (t, TEAM_BYTES)));
        }
        for (address, len) in places {
            let bytes = process.read_bytes(address, len)?;
            let held = bytes
                .as_chunks::<8>()
                .0
                .iter()
                .zip((address..).step_by(8))
                .filter(|&(_, at)| Some(at) != except)
                .map(|(w, _)| u64::from_le_bytes(*w))
                .any(|w| w == object || w == identity || w == person);
            if held {
                return Err(MoveError::StaffRole);
            }
        }
        Ok(())
    }

    /// The contract of the member of staff `holder` describes: his new club's senior team from today, for a move;
    /// the job `job`.
    fn staff_contract_patches(&self, holder: &Holder, senior: Option<u64>, job: u8, patches: &mut Patches) {
        let c = &self.layout.contract;
        let Holder { contract, ref record, .. } = *holder;
        let at = |offset: u64, len: usize| &record[offset as usize..offset as usize + len];
        if let Some(senior) = senior {
            for offset in [c.team, c.senior_team] {
                patches.push(contract + offset, at(offset, 8), senior.to_le_bytes());
            }
            if let Some(today) = self.game_date() {
                for offset in [c.signed, c.joined] {
                    // A date the game has not set stays unset.
                    if Kind::Date.decode(at(offset, 4)) != 0 {
                        patches.push(
                            contract + offset,
                            at(offset, 4),
                            Kind::Date.encode(today.to_number(), at(offset, 4)),
                        );
                    }
                }
            }
        }
        patches.push(contract + c.job, at(c.job, 1), [job]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_job_has_one_department_and_none_is_a_player_coach() {
        for (i, &(code, _)) in STAFF_JOBS.iter().enumerate() {
            assert!(code > 1 && code % 2 == 0, "{code}");
            assert!(crate::job_name(code).is_some(), "{code}");
            assert!(!STAFF_JOBS[i + 1..].iter().any(|&(other, _)| other == code), "{code}");
        }
        assert_eq!(department_of(26), Some(Department::Coaching));
        assert_eq!(department_of(16), None, "a manager is left as he is");
        assert_eq!(department_of(DIRECTOR_JOB), None, "a Director of Football is in no department");
        assert_eq!(crate::job_name(DIRECTOR_JOB), Some("Director of Football"));
    }
}
