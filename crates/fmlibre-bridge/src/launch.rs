//! `fmlibre-launch`: how Steam starts Football Manager on macOS with the bridge.
//!
//! Steam on macOS runs no shell for a launch option: it starts the option's first word as a
//! program, with `%command%`, the game's app bundle, among its arguments. So FM27's launch
//! option is `'…/fmlibre-launch' %command%`. This program puts the bridge beside it in front
//! of the libraries named in `DYLD_INSERT_LIBRARIES`, keeping those Steam names, and then
//! becomes the game, so that Steam goes on following the process it started. When the bridge
//! is not beside it, the game starts as it is.
//!
//! Steam starts a launch option as Intel code, under Rosetta on Apple silicon, and a program
//! that merely `exec`s a universal game would keep it there. So the game is started with the
//! Mac's own architecture first, as Steam starts it without a launch option.

#[cfg(not(target_os = "macos"))]
fn main() {}

#[cfg(target_os = "macos")]
fn main() -> std::process::ExitCode {
    use std::path::Path;

    let mut args = std::env::args_os().skip(1);
    let Some(program) = args.next() else {
        eprintln!("usage: fmlibre-launch <app or program> [arguments]");
        return std::process::ExitCode::FAILURE;
    };
    let program = mac::executable(Path::new(&program));
    // Only returns when the game could not be started.
    let err = mac::become_program(&program, args.collect(), mac::libraries());
    eprintln!("fmlibre-launch: could not start {}: {err}", program.display());
    std::process::ExitCode::FAILURE
}

#[cfg(target_os = "macos")]
mod mac {
    use std::ffi::{CString, OsString, c_char, c_int};
    use std::os::unix::ffi::{OsStrExt, OsStringExt};
    use std::path::{Path, PathBuf};

    const INSERT: &str = "DYLD_INSERT_LIBRARIES";

    const BRIDGE_FILE: &str = "libfmlibre_bridge.dylib";

    /// `cpu_type_t` of arm64 and x86_64, in the order the game's architecture is chosen.
    const NATIVE_FIRST: [c_int; 2] = [0x0100_000C, 0x0100_0007];

    /// The bridge beside this program first, then the libraries the environment names already.
    pub fn libraries() -> Option<OsString> {
        let bridge = std::env::current_exe().ok()?.parent()?.join(BRIDGE_FILE);
        if !bridge.is_file() {
            return None;
        }
        let mut libraries = bridge.into_os_string();
        if let Some(others) = std::env::var_os(INSERT).filter(|others| !others.is_empty()) {
            libraries.push(":");
            libraries.push(others);
        }
        Some(libraries)
    }

    /// The executable of an app bundle; any other path as it is.
    pub fn executable(path: &Path) -> PathBuf {
        if path.extension().is_some_and(|extension| extension == "app")
            && let Some(name) = bundle_executable(path)
        {
            return path.join("Contents/MacOS").join(name);
        }
        path.to_owned()
    }

    /// The `CFBundleExecutable` of `app`'s Info.plist, or the only file in `Contents/MacOS`.
    fn bundle_executable(app: &Path) -> Option<OsString> {
        let named = std::fs::read_to_string(app.join("Contents/Info.plist")).ok().and_then(|text| {
            let after = &text[text.find("<key>CFBundleExecutable</key>")?..];
            let start = after.find("<string>")? + "<string>".len();
            let end = start + after[start..].find("</string>")?;
            Some(OsString::from(after[start..end].trim()))
        });
        named.or_else(|| {
            let mut files = std::fs::read_dir(app.join("Contents/MacOS")).ok()?.flatten();
            let only = files.next()?;
            files.next().is_none().then(|| only.file_name())
        })
    }

    /// Replaces this process with `program`, as `exec` does, but the Mac's own architecture
    /// first, with `libraries` in `DYLD_INSERT_LIBRARIES` when there are any. Returns only on
    /// failure.
    pub fn become_program(program: &Path, args: Vec<OsString>, libraries: Option<OsString>) -> std::io::Error {
        let c_string = |text: OsString| CString::new(text.into_vec()).map_err(std::io::Error::other);
        let mut words = vec![program.as_os_str().to_owned()];
        words.extend(args);
        let mut environment: Vec<OsString> = std::env::vars_os()
            .filter(|(key, _)| libraries.is_none() || key != INSERT)
            .map(|(key, value)| [key, OsString::from("="), value].into_iter().collect())
            .collect();
        if let Some(libraries) = libraries {
            environment.push([OsString::from(INSERT), OsString::from("="), libraries].into_iter().collect());
        }
        let (path, argv, envp) = match (
            CString::new(program.as_os_str().as_bytes()).map_err(std::io::Error::other),
            words.into_iter().map(c_string).collect::<Result<Vec<_>, _>>(),
            environment.into_iter().map(c_string).collect::<Result<Vec<_>, _>>(),
        ) {
            (Ok(path), Ok(argv), Ok(envp)) => (path, argv, envp),
            (Err(err), ..) | (_, Err(err), _) | (.., Err(err)) => return err,
        };
        let pointers = |strings: &[CString]| -> Vec<*mut c_char> {
            strings.iter().map(|s| s.as_ptr().cast_mut()).chain(std::iter::once(std::ptr::null_mut())).collect()
        };
        let (argv, envp) = (pointers(&argv), pointers(&envp));

        let mut attributes: libc::posix_spawnattr_t = std::ptr::null_mut();
        let code = unsafe { libc::posix_spawnattr_init(&mut attributes) };
        if code != 0 {
            return std::io::Error::from_raw_os_error(code);
        }
        let mut preference = NATIVE_FIRST;
        let mut taken = 0;
        let code = unsafe {
            libc::posix_spawnattr_setflags(&mut attributes, libc::POSIX_SPAWN_SETEXEC as libc::c_short);
            libc::posix_spawnattr_setbinpref_np(&mut attributes, preference.len(), preference.as_mut_ptr(), &mut taken);
            let mut pid = 0;
            libc::posix_spawn(&mut pid, path.as_ptr(), std::ptr::null(), &attributes, argv.as_ptr(), envp.as_ptr())
        };
        unsafe { libc::posix_spawnattr_destroy(&mut attributes) };
        std::io::Error::from_raw_os_error(code)
    }
}
