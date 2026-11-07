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
/// back `rax`. The bridge refuses a step with an indirect result here.
///
/// # Safety
/// `address` must be a function of the game plugin that takes these arguments.
#[cfg(all(target_arch = "x86_64", not(windows)))]
unsafe fn invoke(address: u64, registers: &[u64; 8], _: u64, stack: &[u64; 4]) -> u64 {
    let spilled = [registers[6], registers[7], stack[0], stack[1], stack[2], stack[3]];
    let result: u64;
    unsafe {
        // Six slots keep the stack 16-byte aligned at the call, as it is on entry to the block.
        std::arch::asm!(
            "sub rsp, 48",
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
            "call {function}",
            "add rsp, 48",
            function = in(reg) address,
            spilled = in(reg) spilled.as_ptr(),
            inout("rdi") registers[0] => _,
            inout("rsi") registers[1] => _,
            inout("rdx") registers[2] => _,
            inout("rcx") registers[3] => _,
            inout("r8") registers[4] => _,
            inout("r9") registers[5] => _,
            out("rax") result,
            clobber_abi("C"),
        );
    }
    result
}

/// Calls the function at `address` with the same twelve arguments the Windows x64 way: the first four of `registers`
/// in `rcx`, `rdx`, `r8` and `r9`, the rest on the stack above the space the callee may spill them to, and gives back
/// `rax`. The bridge refuses a step with an indirect result here.
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
}
