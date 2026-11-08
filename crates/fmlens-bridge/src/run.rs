//! Runs the steps of a call ([`fmlens_mem::call`]) on the thread it is on: in the game, its main thread.

use fmlens_mem::call::{Arg, MAX_STEPS, Step};

/// How a call ran.
pub(crate) struct Ran {
    /// Whether a step returned false.
    pub stopped: bool,
    pub steps_run: u32,
    /// What each step returned; zero for the steps that did not run.
    pub results: [u64; MAX_STEPS],
}

/// Runs `steps` in order with the game plugin at `base` and the call's scratch memory at `scratch`. After a step that
/// stops the call, only clean-ups run.
pub(crate) fn execute(base: u64, steps: &[Step], scratch: u64) -> Ran {
    let mut results = [0u64; MAX_STEPS];
    let (mut stopped, mut steps_run) = (false, 0);
    for (index, step) in steps.iter().enumerate() {
        if stopped && step.flags & Step::CLEANUP == 0 {
            continue;
        }
        let value = |arg: &Arg| match arg.kind {
            Arg::SCRATCH => scratch.wrapping_add(arg.value),
            Arg::RESULT => results[arg.value as usize],
            _ => arg.value,
        };
        let registers = step.registers.each_ref().map(value);
        let stack = step.stack.each_ref().map(value);
        let result = unsafe { invoke(base.wrapping_add(step.rva), &registers, value(&step.indirect), &stack) };
        results[index] = result;
        steps_run += 1;
        // A C++ bool comes back in the low byte of w0 (al on x86_64).
        if step.flags & Step::STOP_IF_FALSE != 0 && result & 0xFF == 0 {
            stopped = true;
        }
    }
    Ran { stopped, steps_run, results }
}

/// Calls the function at `address` with `x0` to `x7` from `registers`, `x8` set to `indirect` and
/// `stack` in the first four stack slots, and gives back `x0`.
///
/// # Safety
/// `address` must be a function of the game plugin that takes these arguments.
#[cfg(target_arch = "aarch64")]
unsafe fn invoke(address: u64, registers: &[u64; 8], indirect: u64, stack: &[u64; 4]) -> u64 {
    let result: u64;
    unsafe {
        std::arch::asm!(
            "sub sp, sp, #32",
            "stp {first}, {second}, [sp]",
            "stp {third}, {fourth}, [sp, #16]",
            "blr {function}",
            "add sp, sp, #32",
            function = in(reg) address,
            first = in(reg) stack[0],
            second = in(reg) stack[1],
            third = in(reg) stack[2],
            fourth = in(reg) stack[3],
            inout("x0") registers[0] => result,
            inout("x1") registers[1] => _,
            inout("x2") registers[2] => _,
            inout("x3") registers[3] => _,
            inout("x4") registers[4] => _,
            inout("x5") registers[5] => _,
            inout("x6") registers[6] => _,
            inout("x7") registers[7] => _,
            inout("x8") indirect => _,
            clobber_abi("C"),
        );
    }
    result
}

/// Calls the function at `address` with the same twelve arguments the System V way: the first six of `registers` in
/// `rdi`, `rsi`, `rdx`, `rcx`, `r8` and `r9`, the other two and then `stack` in the first six stack slots, and gives
/// back `rax`.
///
/// A nonzero `indirect` is the place for an object the function returns in memory. System V takes it as a hidden
/// first argument in `rdi`, so every other argument moves up one slot: `registers[0]` to `registers[4]` go in `rsi`
/// to `r9` and the rest spill to the stack in order. The function hands the place back in `rax`.
///
/// # Safety
/// `address` must be a function of the game plugin that takes these arguments.
#[cfg(all(target_arch = "x86_64", not(windows)))]
unsafe fn invoke(address: u64, registers: &[u64; 8], indirect: u64, stack: &[u64; 4]) -> u64 {
    let [r0, r1, r2, r3, r4, r5, r6, r7] = *registers;
    let [s0, s1, s2, s3] = *stack;
    // The last slot is padding: eight keep the stack 16-byte aligned at the call, as it is on entry to the block.
    let (first, spilled) = if indirect == 0 {
        ([r0, r1, r2, r3, r4, r5], [r6, r7, s0, s1, s2, s3, 0, 0])
    } else {
        ([indirect, r0, r1, r2, r3, r4], [r5, r6, r7, s0, s1, s2, s3, 0])
    };
    let result: u64;
    unsafe {
        std::arch::asm!(
            "sub rsp, 64",
            "mov rax, [{spilled}]",
            "mov [rsp], rax",
            "mov rax, [{spilled} + 8]",
            "mov [rsp + 8], rax",
            "mov rax, [{spilled} + 16]",
            "mov [rsp + 16], rax",
            "mov rax, [{spilled} + 24]",
            "mov [rsp + 24], rax",
            "mov rax, [{spilled} + 32]",
            "mov [rsp + 32], rax",
            "mov rax, [{spilled} + 40]",
            "mov [rsp + 40], rax",
            "mov rax, [{spilled} + 48]",
            "mov [rsp + 48], rax",
            "mov rax, [{spilled} + 56]",
            "mov [rsp + 56], rax",
            "call {function}",
            "add rsp, 64",
            function = in(reg) address,
            spilled = in(reg) spilled.as_ptr(),
            inout("rdi") first[0] => _,
            inout("rsi") first[1] => _,
            inout("rdx") first[2] => _,
            inout("rcx") first[3] => _,
            inout("r8") first[4] => _,
            inout("r9") first[5] => _,
            out("rax") result,
            clobber_abi("C"),
        );
    }
    result
}

/// Calls the function at `address` with the same twelve arguments the Windows x64 way: the first four of `registers`
/// in `rcx`, `rdx`, `r8` and `r9`, the rest on the stack above the space the callee may spill them to, and gives back
/// `rax`. The bridge refuses a step with an indirect result here (see `windows.rs`).
///
/// # Safety
/// `address` must be a function of the game plugin that takes these arguments.
#[cfg(all(target_arch = "x86_64", windows))]
unsafe fn invoke(address: u64, registers: &[u64; 8], _: u64, stack: &[u64; 4]) -> u64 {
    type Function = unsafe extern "win64" fn(u64, u64, u64, u64, u64, u64, u64, u64, u64, u64, u64, u64) -> u64;
    let function = unsafe { std::mem::transmute::<usize, Function>(address as usize) };
    let [a, b, c, d, e, f, g, h] = *registers;
    let [i, j, k, l] = *stack;
    unsafe { function(a, b, c, d, e, f, g, h, i, j, k, l) }
}

#[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
unsafe fn invoke(_: u64, _: &[u64; 8], _: u64, _: &[u64; 4]) -> u64 {
    // The bridge refuses every call on other architectures first.
    0
}

#[cfg(all(test, any(target_arch = "aarch64", target_arch = "x86_64")))]
mod tests {
    use super::invoke;

    /// Each argument is one hex digit of the answer, so one out of place changes it.
    extern "C" fn digits(
        a: u64,
        b: u64,
        c: u64,
        d: u64,
        e: u64,
        f: u64,
        g: u64,
        h: u64,
        i: u64,
        j: u64,
        k: u64,
        l: u64,
    ) -> u64 {
        [a, b, c, d, e, f, g, h, i, j, k, l].iter().fold(0, |number, digit| number * 16 + digit)
    }

    #[test]
    fn a_call_gets_its_twelve_arguments_in_order() {
        let result = unsafe { invoke(digits as *const () as u64, &[1, 2, 3, 4, 5, 6, 7, 8], 0, &[9, 10, 11, 12]) };
        assert_eq!(result, 0x1234_5678_9ABC);
    }

    #[cfg(not(windows))]
    #[repr(C)]
    struct Object {
        low: u64,
        high: u64,
        marker: u64,
    }

    /// Too big for registers, so every C ABI returns it through a place the caller passes. The twelve ordinary
    /// arguments are hex digits as above, split over the object's two halves.
    #[cfg(not(windows))]
    extern "C" fn object(
        a: u64,
        b: u64,
        c: u64,
        d: u64,
        e: u64,
        f: u64,
        g: u64,
        h: u64,
        i: u64,
        j: u64,
        k: u64,
        l: u64,
    ) -> Object {
        let fold = |digits: &[u64]| digits.iter().fold(0, |number, digit| number * 16 + digit);
        Object { low: fold(&[a, b, c, d, e, f]), high: fold(&[g, h, i, j, k, l]), marker: 0xFEED }
    }

    /// The hidden result place and all twelve arguments arrive in order, on both Mac ABIs and for a result that
    /// does not fit in registers.
    #[cfg(not(windows))]
    #[test]
    fn an_object_returned_in_memory_gets_its_place_and_every_argument() {
        let mut place = Object { low: 0, high: 0, marker: 0 };
        let place_address = &mut place as *mut Object as u64;
        let result =
            unsafe { invoke(object as *const () as u64, &[1, 2, 3, 4, 5, 6, 7, 8], place_address, &[9, 10, 11, 12]) };
        if cfg!(target_arch = "x86_64") {
            assert_eq!(result, place_address, "System V gives the place back in rax");
        }
        assert_eq!((place.low, place.high, place.marker), (0x12_3456, 0x78_9ABC, 0xFEED));
    }

    /// The same through a step, with the place in the call's scratch memory and the result of the call unused.
    #[cfg(not(windows))]
    #[test]
    fn a_step_returning_into_scratch_fills_it() {
        use fmlens_mem::call::{Arg, Program, Step};

        let mut program = Program::new();
        let args: Vec<Arg> = (1u64..=12).map(Arg::value).collect();
        program.push(Step::new(object as *const () as u64, &args).returning_into(Arg::scratch(16)));
        let mut scratch = program.scratch;
        let ran = super::execute(0, &program.steps, scratch.as_mut_ptr() as u64);
        let word = |at: usize| u64::from_le_bytes(scratch[at..at + 8].try_into().unwrap());
        assert_eq!((ran.stopped, ran.steps_run), (false, 1));
        assert_eq!((word(16), word(24), word(32)), (0x12_3456, 0x78_9ABC, 0xFEED));
    }

    /// Date Values and maps use explicit output pointers on both Mac ABIs. Exercise
    /// scratch pointers, a result used by the next step, and cleanup after refusal.
    #[test]
    fn explicit_outputs_and_cleanup_use_the_scalar_call_path() {
        use fmlens_mem::call::{Arg, Program, Step};

        extern "C" fn kind() -> u64 {
            0x28
        }
        unsafe extern "C" fn value(kind: u64, output: *mut u64, raw: *const u64) -> u64 {
            unsafe {
                output.write_unaligned(kind);
                output.add(1).write_unaligned(raw.read_unaligned());
            }
            0 // Simulate a declined game action after producing output.
        }
        unsafe extern "C" fn mark(output: *mut u64, marker: u64) -> u64 {
            unsafe { output.write_unaligned(marker) };
            1
        }
        let mut program = Program::new();
        program.write_u64(0, 0x07EB_0159);
        let first = program.push(Step::new(kind as *const () as u64, &[]));
        program.push(
            Step::new(value as *const () as u64, &[Arg::result(first), Arg::scratch(16), Arg::scratch(0)])
                .stop_if_false(),
        );
        program.push(Step::new(mark as *const () as u64, &[Arg::scratch(32), Arg::value(99)]));
        program.push(Step::new(mark as *const () as u64, &[Arg::scratch(40), Arg::value(7)]).cleanup());
        let mut scratch = program.scratch;
        let ran = super::execute(0, &program.steps, scratch.as_mut_ptr() as u64);
        let word = |at| u64::from_le_bytes(scratch[at..at + 8].try_into().unwrap());
        assert!(ran.stopped);
        assert_eq!(ran.steps_run, 3);
        assert_eq!((word(16), word(24), word(32), word(40)), (0x28, 0x07EB_0159, 0, 7));
    }
}
