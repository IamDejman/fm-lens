//! Calls into the game's own functions, made for the editor by the bridge library inside the game.
//!
//! Some edits are more than a few bytes: a transfer writes a contract, the club's history and its
//! finances. The editor has the game make those itself. It sends a short [`Step`] program to the
//! bridge, which runs the steps one after another on the game's main thread, where the game's own
//! screens run them, and answers with what each returned. The bridge runs only functions the build
//! profiles of the running build name, checked by the game plugin's UUID.
//!
//! The types here are plain data, laid out the same in the editor and in the bridge.

/// The most steps one call may have.
pub const MAX_STEPS: usize = 12;

/// The bytes of memory the bridge lends a call for objects it builds, such as a terms map: zeroed
/// before the first step, and sent back with the answer.
pub const SCRATCH_SIZE: usize = 1024;

/// What a step passes in one argument register or stack slot.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Arg {
    pub kind: u32,
    pub reserved: u32,
    pub value: u64,
}

impl Arg {
    /// `value` itself.
    pub const VALUE: u32 = 0;
    /// The address of the scratch memory plus `value`.
    pub const SCRATCH: u32 = 1;
    /// What the step numbered `value`, an earlier one, returned in `x0`.
    pub const RESULT: u32 = 2;

    pub const fn value(value: u64) -> Self {
        Self { kind: Self::VALUE, reserved: 0, value }
    }

    pub const fn scratch(offset: usize) -> Self {
        Self { kind: Self::SCRATCH, reserved: 0, value: offset as u64 }
    }

    pub const fn result(step: usize) -> Self {
        Self { kind: Self::RESULT, reserved: 0, value: step as u64 }
    }
}

/// One call of a function of the game plugin, with the arguments of the arm64 calling convention:
/// `x0` to `x7`, the indirect result register `x8`, and two 8-byte stack slots.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Step {
    /// The function's address relative to the start of the game plugin.
    pub rva: u64,
    pub flags: u32,
    pub reserved: u32,
    pub registers: [Arg; 8],
    pub indirect: Arg,
    pub stack: [Arg; 2],
}

impl Step {
    /// Stop when the function returns false (zero in `w0`): later steps run only if they clean up.
    pub const STOP_IF_FALSE: u32 = 1;
    /// Run even after a step stopped the call, as a destructor of something built earlier must.
    pub const CLEANUP: u32 = 2;

    /// A call of the function at `rva` with up to ten arguments, in registers first and then on the stack.
    pub fn new(rva: u64, args: &[Arg]) -> Self {
        assert!(args.len() <= 10, "a step takes at most ten arguments");
        let mut step = Step { rva, ..Step::default() };
        for (index, arg) in args.iter().enumerate() {
            match index {
                0..8 => step.registers[index] = *arg,
                _ => step.stack[index - 8] = *arg,
            }
        }
        step
    }

    /// Has the function write the object it returns to `place`, through `x8`.
    pub fn returning_into(mut self, place: Arg) -> Self {
        self.indirect = place;
        self
    }

    pub fn stop_if_false(mut self) -> Self {
        self.flags |= Self::STOP_IF_FALSE;
        self
    }

    pub fn cleanup(mut self) -> Self {
        self.flags |= Self::CLEANUP;
        self
    }

    fn args(&self) -> impl Iterator<Item = &Arg> {
        self.registers.iter().chain(std::iter::once(&self.indirect)).chain(&self.stack)
    }
}

/// Why a program may not be run; `None` when it may. Both sides check: the editor before it
/// asks, the bridge before it runs anything.
pub fn refusal(steps: &[Step], allowed: impl Fn(u64) -> bool) -> Option<&'static str> {
    if steps.is_empty() || steps.len() > MAX_STEPS {
        return Some("a call needs one to twelve steps");
    }
    for (index, step) in steps.iter().enumerate() {
        if !allowed(step.rva) {
            return Some("it names a function the build profile does not list");
        }
        if step.flags & !(Step::STOP_IF_FALSE | Step::CLEANUP) != 0 || step.reserved != 0 {
            return Some("a step has flags this bridge does not know");
        }
        for arg in step.args() {
            let fits = match arg.kind {
                Arg::VALUE => true,
                Arg::SCRATCH => arg.value < SCRATCH_SIZE as u64,
                Arg::RESULT => arg.value < index as u64,
                _ => false,
            };
            if !fits || arg.reserved != 0 {
                return Some("an argument points outside the call");
            }
        }
    }
    None
}

/// How a call ended, as the bridge reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum Status {
    /// Every step ran.
    Done = 0,
    /// A step returned false and the rest, other than clean-ups, did not run.
    Stopped = 1,
    /// The asking process belongs to another user.
    Refused = 2,
    /// The game plugin is not the build the editor named.
    WrongBuild = 3,
    /// The program failed the bridge's own check.
    NotAllowed = 4,
    /// The game's main thread did not get to the call in time; nothing ran.
    Busy = 5,
    /// This bridge cannot make calls on this architecture.
    Unsupported = 6,
}

impl Status {
    pub fn from_u32(value: u32) -> Option<Self> {
        Some(match value {
            0 => Status::Done,
            1 => Status::Stopped,
            2 => Status::Refused,
            3 => Status::WrongBuild,
            4 => Status::NotAllowed,
            5 => Status::Busy,
            6 => Status::Unsupported,
            _ => return None,
        })
    }
}

/// What a call that ran returned.
#[derive(Debug, Clone)]
pub struct Outcome {
    /// Whether every step ran, or a step returned false.
    pub completed: bool,
    /// How many steps ran, clean-ups included.
    pub steps_run: usize,
    /// What each step returned in `x0`; zero for steps that did not run.
    pub results: Vec<u64>,
    /// The scratch memory as the last step left it.
    pub scratch: Box<[u8; SCRATCH_SIZE]>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_programs() {
        let allowed = |rva| rva == 0x100;
        let ok = Step::new(0x100, &[Arg::value(1), Arg::scratch(8)]);
        assert_eq!(refusal(&[ok], allowed), None);
        assert!(refusal(&[], allowed).is_some());
        assert!(refusal(&[Step::new(0x200, &[])], allowed).is_some());
        assert!(refusal(&[Step::new(0x100, &[Arg::scratch(SCRATCH_SIZE)])], allowed).is_some());
        // A step may only use what an earlier one returned.
        assert!(refusal(&[Step::new(0x100, &[Arg::result(0)])], allowed).is_some());
        assert_eq!(refusal(&[ok, Step::new(0x100, &[Arg::result(0)])], allowed), None);
        assert!(refusal(&[Step { flags: 4, ..ok }], allowed).is_some());
    }

    #[test]
    fn places_arguments() {
        let args: Vec<Arg> = (0..10).map(Arg::value).collect();
        let step = Step::new(0x100, &args).returning_into(Arg::scratch(0)).stop_if_false();
        assert_eq!(step.registers[7], Arg::value(7));
        assert_eq!(step.stack, [Arg::value(8), Arg::value(9)]);
        assert_eq!(step.indirect, Arg::scratch(0));
        assert_eq!(step.flags, Step::STOP_IF_FALSE);
    }
}
