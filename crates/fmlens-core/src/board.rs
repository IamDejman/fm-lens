//! A club's board, and two of its members, or of two clubs' boards, swapping seats.
//!
//! A club keeps its owner, chairperson, president, managing director and directors in one list of pointers to their
//! staff objects, in ascending order of their ids (see [`BoardLayout`]). A seat is a place in that list and a short
//! contract: the contract points back at whoever holds it and at the club's senior team, and carries the seat's wage
//! and job. The holder points at the contract, and repeats its wage and the club's id.
//!
//! A swap leaves both seats where they are and exchanges who holds them. Each takes the other's place on the board,
//! the lists kept in order of id, the other's contract with its wage and job, and the other's copies. Nothing is
//! allocated or freed, so a seat is neither added nor removed, and only someone who holds a seat already can take one.
//!
//! [`BoardLayout`]: crate::profile::BoardLayout

use fmlens_mem::is_user_pointer;
use serde::Serialize;

use crate::clubs::ClubSummary;
use crate::rtti::class_of;
use crate::session::Session;
use crate::staff::StaffSummary;
use crate::staff_move::DEPARTMENTS;
use crate::transfer::{MoveError, Patch, Patches, PointerList};

/// The jobs of a board's seats, by contract code (see [`crate::job_name`]), the most senior first: owner,
/// chairperson, president, managing director, director.
pub const SEAT_JOBS: [u8; 5] = [66, 4, 70, 8, 6];

/// The most members a board is read with; the longest seen has 15.
const MOST_SEATS: u64 = 60;

/// A member of a club's board.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct BoardSeat {
    pub member: u32,
    /// The seat's job, one of [`SEAT_JOBS`].
    pub job: u8,
}

/// A swap of two board members' seats, worked out from the game as it is now and ready to be written.
#[derive(Debug, Clone)]
pub struct BoardPlan {
    pub member: u32,
    pub other: u32,
    /// The club `member` leaves and the one he joins, which `other` leaves; the same for a swap within a board.
    pub from_club: u32,
    pub to_club: u32,
    /// The job `member` has, and the one he takes from `other`.
    pub job: (u8, u8),
    patches: Vec<Patch>,
}

/// A swap that was written: what undoing it takes.
#[derive(Debug, Clone)]
pub struct BoardSwap {
    pub member: u32,
    pub other: u32,
    pub from_club: u32,
    pub to_club: u32,
    pub job: (u8, u8),
    patches: Vec<Patch>,
}

/// A seat and who holds it, checked.
struct Seat {
    object: u64,
    uid: u32,
    contract: u64,
    job: u8,
    /// The holder's copies of the seat's wage and of the club's id, as read.
    wage_copy: [u8; 4],
    club_copy: [u8; 4],
}

/// A club's board, checked: every member holds a seat at this club, and they are in order of id.
struct Board {
    club: u64,
    club_uid: u32,
    list: PointerList,
    seats: Vec<Seat>,
}

/// The vtables the contracts and the person blocks of a board's members were found to have, so that each class is
/// named once.
#[derive(Default)]
struct Classes {
    contract: Option<u64>,
    member: Option<u64>,
}

impl Session {
    /// The board of `club`, the most senior seats first. Only reads memory.
    pub fn board(&self, club: &ClubSummary) -> Result<Vec<BoardSeat>, MoveError> {
        if self.process.read_u32(club.address + self.layout.club.uid)? != club.uid {
            return Err(MoveError::NotAClub { uid: club.uid });
        }
        let mut seats: Vec<BoardSeat> = self
            .board_of(club.address)?
            .seats
            .iter()
            .map(|seat| BoardSeat { member: seat.uid, job: seat.job })
            .collect();
        seats.sort_by_key(|seat| SEAT_JOBS.iter().position(|&job| job == seat.job));
        Ok(seats)
    }

    /// Whether `member` holds a seat that [`Session::plan_board_swap`] may swap: where the layout places boards, a
    /// contract of the board's class with a seat's job. Only reads memory.
    pub fn holds_board_seat(&self, member: &StaffSummary) -> bool {
        let (Some(b), s) = (&self.layout.board, &self.layout.staff) else {
            return false;
        };
        if member.is_human || member.shift != 0 {
            return false;
        }
        let Ok(contract) = self.process.read_u64(member.address + s.contract) else {
            return false;
        };
        is_user_pointer(contract)
            && class_of(&self.process, &self.plugin, contract).as_deref() == Some(b.class.as_str())
            && self
                .process
                .read_bytes(contract + self.layout.contract.job, 1)
                .is_ok_and(|job| SEAT_JOBS.contains(&job[0]))
    }

    /// Works out `member` and `other` swapping seats: each takes the other's place on the board, job and wage. Nothing
    /// is written.
    pub fn plan_board_swap(&self, member: &StaffSummary, other: &StaffSummary) -> Result<BoardPlan, MoveError> {
        let (process, layout) = (&self.process, &self.layout);
        let (s, c) = (&layout.staff, &layout.contract);
        let b = layout.board.as_ref().ok_or(MoveError::NoBoards)?;
        if member.uid == other.uid {
            return Err(MoveError::UnusualBoard);
        }
        let (from, mine) = self.seat_of(member)?;
        let (to, theirs) = self.seat_of(other)?;
        let (mine, theirs) = (&from.seats[mine], &to.seats[theirs]);
        let women = |club: u64| process.read_bytes(club + layout.club.women, 1).map(|b| b[0]);
        if women(from.club)? != women(to.club)? {
            return Err(MoveError::MenAndWomen);
        }

        let mut patches = Patches::default();
        if from.club != to.club {
            list_patches(&from, mine, theirs, &mut patches);
            list_patches(&to, theirs, mine, &mut patches);
        }
        let person = |seat: &Seat| (seat.object + s.identity()).to_le_bytes();
        for (seat, taker) in [(mine, theirs), (theirs, mine)] {
            patches.push(seat.contract + c.owner, person(seat), person(taker));
        }
        for (seat, taker) in [(mine, theirs), (theirs, mine)] {
            patches.push(seat.object + s.contract, seat.contract.to_le_bytes(), taker.contract.to_le_bytes());
            patches.push(seat.object + b.wage_copy, seat.wage_copy, taker.wage_copy);
            patches.push(seat.object + b.club_copy, seat.club_copy, taker.club_copy);
        }
        Ok(BoardPlan {
            member: member.uid,
            other: other.uid,
            from_club: from.club_uid,
            to_club: to.club_uid,
            job: (mine.job, theirs.job),
            patches: patches.0,
        })
    }

    /// Writes a plan, each write over the bytes it expects, after checking them all.
    pub fn apply_board_plan(&self, plan: &BoardPlan) -> Result<BoardSwap, MoveError> {
        self.apply_patches(&plan.patches)?;
        let BoardPlan { member, other, from_club, to_club, job, ref patches } = *plan;
        Ok(BoardSwap { member, other, from_club, to_club, job, patches: patches.clone() })
    }

    /// Puts both back in their own seats, provided memory still holds everything the swap wrote.
    pub fn undo_board_swap(&self, done: &BoardSwap) -> Result<(), MoveError> {
        self.undo_patches(&done.patches)
    }

    /// The board `member` sits on, and where on it he is: he is in its list once, in none of the club's staff lists,
    /// and neither the club nor its teams point at him.
    fn seat_of(&self, member: &StaffSummary) -> Result<(Board, usize), MoveError> {
        let (process, layout) = (&self.process, &self.layout);
        let (s, c) = (&layout.staff, &layout.contract);
        if member.is_human || member.shift != 0 {
            return Err(MoveError::You);
        }
        let object = member.address;
        if process.read_u32(object + s.uid)? != member.uid {
            return Err(MoveError::Moved { uid: member.uid });
        }
        if !self.holds_board_seat(member) {
            return Err(MoveError::NotOnBoard);
        }
        let contract = process.read_u64(object + s.contract)?;
        let senior = process.read_u64(contract + c.senior_team)?;
        let club = if is_user_pointer(senior) { process.read_u64(senior + layout.team.club)? } else { 0 };
        if !is_user_pointer(club) {
            return Err(MoveError::UnusualBoard);
        }
        let board = self.board_of(club)?;
        let held: Vec<usize> =
            board.seats.iter().enumerate().filter(|(_, seat)| seat.object == object).map(|(i, _)| i).collect();
        let [index] = held[..] else {
            return Err(MoveError::UnusualBoard);
        };
        for department in DEPARTMENTS {
            if self.department_list(club, department).is_ok_and(|(_, staff)| staff.contains(&object)) {
                return Err(MoveError::UnusualBoard);
            }
        }
        self.check_unheld(club, object, object + s.identity(), object + s.person_block, None)?;
        Ok((board, index))
    }

    /// The board of the club at `club`, checked: the club's senior team points back at it, the list holds 1 to
    /// [`MOST_SEATS`] members in ascending order of id, and each holds a seat at this club.
    fn board_of(&self, club: u64) -> Result<Board, MoveError> {
        let (process, layout) = (&self.process, &self.layout);
        let b = layout.board.as_ref().ok_or(MoveError::NoBoards)?;
        let club_uid = process.read_u32(club + layout.club.uid)?;
        let senior = match PointerList::read(process, club + layout.club.teams)? {
            Some(teams) if teams.len() > 0 => process.read_u64(teams.begin_address())?,
            _ => 0,
        };
        if !is_user_pointer(senior) || process.read_u64(senior + layout.team.club)? != club {
            return Err(MoveError::UnusualBoard);
        }
        let block = process.read_u64(club + b.list)?;
        if !is_user_pointer(block) {
            return Err(MoveError::UnusualBoard);
        }
        let list = PointerList::read_up_to(process, block, MOST_SEATS)?.ok_or(MoveError::UnusualBoard)?;
        let members = list.elements(process)?;
        let mut classes = Classes::default();
        let seats =
            members.iter().map(|&object| self.seat(object, senior, &mut classes)).collect::<Result<Vec<_>, _>>()?;
        if seats.is_empty() || !seats.is_sorted_by(|a, b| a.uid < b.uid) {
            return Err(MoveError::UnusualBoard);
        }
        Ok(Board { club, club_uid, list, seats })
    }

    /// The seat the staff object at `object` holds on the board of the club whose senior team is `senior`: he is a
    /// plain member of staff with his id written twice, and his contract is the board's kind, points back at him and
    /// at the senior team twice, and has a seat's job with nothing after it.
    fn seat(&self, object: u64, senior: u64, classes: &mut Classes) -> Result<Seat, MoveError> {
        let (process, layout) = (&self.process, &self.layout);
        let (s, c) = (&layout.staff, &layout.contract);
        let b = layout.board.as_ref().ok_or(MoveError::NoBoards)?;
        let is_class = |at: u64, known: &mut Option<u64>, class: &str| -> Result<bool, MoveError> {
            let vtable = process.read_u64(at)?;
            if *known == Some(vtable) {
                return Ok(true);
            }
            let named = class_of(process, &self.plugin, at).as_deref() == Some(class);
            if named {
                *known = Some(vtable);
            }
            Ok(named)
        };
        if !is_user_pointer(object) || !is_class(object + s.person_block, &mut classes.member, &b.member_class)? {
            return Err(MoveError::UnusualBoard);
        }
        let ids = process.read_bytes(object + s.uid, 8)?;
        let uid = u32::from_le_bytes(ids[..4].try_into().expect("4 bytes"));
        if uid == u32::MAX || ids[..4] != ids[4..] {
            return Err(MoveError::UnusualBoard);
        }
        let contract = process.read_u64(object + s.contract)?;
        if !is_user_pointer(contract) || !is_class(contract, &mut classes.contract, &b.class)? {
            return Err(MoveError::UnusualBoard);
        }
        let record = process.read_bytes(contract, b.record as usize)?;
        let word =
            |offset: u64| u64::from_le_bytes(record[offset as usize..offset as usize + 8].try_into().expect("8 bytes"));
        let job = record[c.job as usize];
        let plain = word(c.owner) == object + s.identity()
            && word(c.team) == senior
            && word(c.senior_team) == senior
            && SEAT_JOBS.contains(&job)
            && record[c.job as usize + 1..].iter().all(|&byte| byte == 0);
        if !plain {
            return Err(MoveError::UnusualBoard);
        }
        let copy = |offset: u64| -> Result<[u8; 4], MoveError> {
            Ok(process.read_bytes(object + offset, 4)?.try_into().expect("4 bytes"))
        };
        Ok(Seat { object, uid, contract, job, wage_copy: copy(b.wage_copy)?, club_copy: copy(b.club_copy)? })
    }
}

/// On `board`, `taker` takes the place of `leaver`: the members between where the one was and where the other goes
/// move one place, so the list stays in order of id. One write, of the places that change.
fn list_patches(board: &Board, leaver: &Seat, taker: &Seat, patches: &mut Patches) {
    let before: Vec<(u32, u64)> = board.seats.iter().map(|seat| (seat.uid, seat.object)).collect();
    let after = reseated(&before, leaver.uid, (taker.uid, taker.object));
    let changed: Vec<usize> = (0..before.len()).filter(|&i| before[i] != after[i]).collect();
    let (Some(&first), Some(&last)) = (changed.first(), changed.last()) else {
        return;
    };
    let bytes = |seats: &[(u32, u64)]| seats.iter().flat_map(|&(_, object)| object.to_le_bytes()).collect::<Vec<u8>>();
    patches.push(
        board.list.begin_address() + first as u64 * 8,
        bytes(&before[first..=last]),
        bytes(&after[first..=last]),
    );
}

/// `members`, each an id and what stands for him, in ascending order of id, with `leaver` taken out and `taker` put
/// where his id sorts.
fn reseated<T: Copy>(members: &[(u32, T)], leaver: u32, taker: (u32, T)) -> Vec<(u32, T)> {
    let mut after: Vec<(u32, T)> = members.iter().copied().filter(|&(uid, _)| uid != leaver).collect();
    let place = after.partition_point(|&(uid, _)| uid < taker.0);
    after.insert(place, taker);
    after
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(members: &[(u32, char)]) -> Vec<u32> {
        members.iter().map(|&(uid, _)| uid).collect()
    }

    #[test]
    fn a_taker_whose_id_sorts_in_the_same_place_changes_one_slot() {
        let board = [(10, 'a'), (20, 'b'), (30, 'c')];
        assert_eq!(reseated(&board, 20, (25, 'x')), [(10, 'a'), (25, 'x'), (30, 'c')]);
    }

    #[test]
    fn a_taker_whose_id_sorts_elsewhere_moves_the_members_between() {
        // The second trial: the leaver was second of the list and the taker's id sorts seventh.
        let board: Vec<(u32, char)> = (1..=9).map(|i| (i * 10, 'm')).collect();
        let after = reseated(&board, 20, (75, 'x'));
        assert_eq!(ids(&after), [10, 30, 40, 50, 60, 70, 75, 80, 90]);
        assert_eq!(after[6], (75, 'x'));
        let down = reseated(&board, 80, (5, 'x'));
        assert_eq!(ids(&down), [5, 10, 20, 30, 40, 50, 60, 70, 90]);
    }

    #[test]
    fn a_board_of_one_takes_any_id() {
        assert_eq!(reseated(&[(7, 'a')], 7, (900, 'x')), [(900, 'x')]);
        assert_eq!(reseated(&[(7, 'a')], 7, (1, 'x')), [(1, 'x')]);
    }

    #[test]
    fn the_seats_are_ranked_from_the_owner_down() {
        let names: Vec<_> = SEAT_JOBS.iter().map(|&job| crate::job_name(job)).collect();
        assert_eq!(
            names,
            [Some("Owner"), Some("Chairperson"), Some("President"), Some("Managing Director"), Some("Director")]
        );
    }
}
