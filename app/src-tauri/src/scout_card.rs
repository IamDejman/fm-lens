//! The in-game scout card (Windows): while FM's own card for a player is open (its (i) button hovered), FM Lens shows
//! its scouting card for him over the game, at his peak while Shift is held. FM's card keeps the player in its Unity
//! layer, reached from one static field (see docs/recon/fm27-scouting-research.md). Only reads the game.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

/// The label of the card's window.
pub(crate) const LABEL: &str = "card";
/// The event that tells the card's window which player to show.
#[cfg_attr(not(windows), allow(dead_code))]
const EVENT: &str = "scout-card";

/// The player the card is for, and whether it shows him at his peak.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Shown {
    uid: u32,
    peak: bool,
}

/// A rectangle on screen, in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(not(windows), allow(dead_code))]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

/// Where FM's card was opened: the pointer, and FM's window.
#[derive(Clone, Copy, Debug)]
#[cfg_attr(not(windows), allow(dead_code))]
struct Spot {
    at: (i32, i32),
    game: Rect,
}

#[derive(Default)]
pub(crate) struct ScoutCard {
    /// Switched off in Settings.
    off: AtomicBool,
    /// The main window has closed: the card is not opened again.
    closing: AtomicBool,
    /// The card's window handle, once it is open (0 before): shown and hidden without waiting on the main thread.
    #[cfg_attr(not(windows), allow(dead_code))]
    window: AtomicUsize,
    /// What the card shows, and where FM's card was opened for it.
    #[cfg_attr(not(windows), allow(dead_code))]
    shown: Mutex<Option<(Shown, Spot)>>,
}

#[tauri::command]
pub(crate) fn set_scout_card(card: State<'_, ScoutCard>, on: bool) {
    card.off.store(!on, Ordering::Relaxed);
}

/// What the card shows now; for its window as it opens, as it may have missed the event.
#[tauri::command]
pub(crate) async fn scout_card_shown(app: AppHandle) -> Option<Shown> {
    app.state::<ScoutCard>().shown.lock().ok().and_then(|shown| shown.map(|(shown, _)| shown))
}

/// The card's window has drawn `uid` at `width` by `height` (CSS pixels): it is shown, if it is still wanted.
#[tauri::command]
pub(crate) async fn scout_card_ready(app: AppHandle, uid: u32, peak: bool, width: f64, height: f64) {
    #[cfg(windows)]
    imp::show(&app, Shown { uid, peak }, (width, height));
    #[cfg(not(windows))]
    let _ = (app, uid, peak, width, height);
}

/// Watches FM's card beside the window.
pub(crate) fn start(app: &AppHandle) {
    #[cfg(windows)]
    {
        let app = app.clone();
        std::thread::spawn(move || imp::watch(&app));
    }
    #[cfg(not(windows))]
    let _ = app;
}

/// The main window has closed: the card's goes too, so the app ends.
pub(crate) fn close(app: &AppHandle) {
    let card = app.state::<ScoutCard>();
    card.closing.store(true, Ordering::Relaxed);
    card.window.store(0, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window(LABEL)
        && let Err(err) = window.destroy()
    {
        eprintln!("FM Lens could not close the scout card: {err}");
    }
}

/// Where the card goes, `size` big, for FM's card opened at `spot`, inside `screen` (the monitor's work area): left
/// of the pointer, as FM opens its card to the right; where there is no room, at the far right of FM's window.
#[cfg_attr(not(windows), allow(dead_code))]
fn place(spot: Spot, size: (i32, i32), screen: Rect, gap: i32) -> (i32, i32) {
    let area = Rect {
        left: spot.game.left.max(screen.left),
        top: spot.game.top.max(screen.top),
        right: spot.game.right.min(screen.right),
        bottom: spot.game.bottom.min(screen.bottom),
    };
    let (width, height) = size;
    let left = spot.at.0 - gap - width;
    let x = if left >= area.left { left } else { area.right - gap - width };
    let y = (spot.at.1 - gap).min(area.bottom - height);
    (x.min(screen.right - width).max(screen.left), y.min(screen.bottom - height).max(screen.top))
}

#[cfg(windows)]
mod imp {
    use std::collections::{HashMap, HashSet};
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};

    use fmlens_mem::{Process, Region, is_user_pointer, regions};
    use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
    use windows_sys::Win32::Foundation::{HWND, POINT, RECT};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_SHIFT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, HWND_TOPMOST, SW_HIDE,
        SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_SHOWWINDOW, SetWindowPos, ShowWindowAsync,
    };

    use super::{EVENT, LABEL, Rect, ScoutCard, Shown, Spot, place};
    use crate::AppState;

    /// How often FM's card is looked at.
    const EVERY: Duration = Duration::from_millis(120);
    /// How long to wait before looking for FM's card again in a game where it was not found.
    const LOOK_AGAIN: Duration = Duration::from_secs(30);
    /// The room between the pointer and the card, in CSS pixels.
    const GAP: f64 = 16.0;

    /// The name of the binding that holds the person FM's card is for, and the key of his UID in it ('unid').
    const PERSON: &str = "personBind";
    const UNID: u32 = 0x756e_6964;

    /// Bounds on what is walked, so a card the game is rebuilding cannot keep the walk going.
    const MAX_ELEMENTS: usize = 20_000;
    const MAX_CHILDREN: usize = 4096;
    const MAX_VARIABLES: usize = 64;
    const MAX_ENTRIES: usize = 64;
    const MAX_KINDS: usize = 4096;
    const CHUNK: usize = 4 << 20;

    pub(super) fn watch(app: &AppHandle) {
        let mut reader: Option<Reader> = None;
        let mut tried: Option<(u32, Instant)> = None;
        let card = app.state::<ScoutCard>();
        while !card.closing.load(Ordering::Relaxed) {
            std::thread::sleep(EVERY);
            let next = look(app, &mut reader, &mut tried);
            follow(app, next);
        }
    }

    /// What the card should show now: none unless FM is in front with its card open for a player.
    fn look(app: &AppHandle, reader: &mut Option<Reader>, tried: &mut Option<(u32, Instant)>) -> Option<Shown> {
        if app.state::<ScoutCard>().off.load(Ordering::Relaxed) {
            return None;
        }
        let pid = connected(app)?;
        if !in_front(pid) {
            return None;
        }
        if reader.as_ref().is_none_or(|reader| reader.process.pid() != pid) {
            *reader = None;
            if tried.is_some_and(|(tried, at)| tried == pid && at.elapsed() < LOOK_AGAIN) {
                return None;
            }
            *tried = Some((pid, Instant::now()));
            let started = Instant::now();
            *reader = Reader::find(pid);
            let ms = started.elapsed().as_millis();
            match reader {
                Some(_) => {
                    eprintln!("FM Lens found FM's player card in {ms} ms");
                    // Opened now, so it is ready by the first hover.
                    open_window(app);
                }
                None => eprintln!("FM Lens could not find FM's player card ({ms} ms)"),
            }
        }
        let uid = reader.as_mut()?.hovered()?;
        is_player(app, uid).then(|| Shown { uid, peak: shift_down() })
    }

    /// Hides the card for another player or none, and tells its window what to show. Only this thread changes what
    /// the card shows; the window is opened, and FM's window read, before the lock is taken.
    fn follow(app: &AppHandle, next: Option<Shown>) {
        let card = app.state::<ScoutCard>();
        let current = |card: &ScoutCard| card.shown.lock().ok().and_then(|shown| *shown);
        let before = current(&card);
        if before.map(|(shown, _)| shown) == next {
            return;
        }
        let window = next.and_then(|_| open_window(app));
        let spot = match (next, before) {
            (Some(next), Some((before, spot))) if before.uid == next.uid => Some(spot),
            (Some(_), _) => spot(),
            (None, _) => None,
        };
        let now = next.zip(window.as_ref().and(spot));
        let Ok(mut shown) = card.shown.lock() else {
            return;
        };
        *shown = now;
        if before.zip(now).is_none_or(|((before, _), (now, _))| before.uid != now.uid) {
            hide(card.window.load(Ordering::Relaxed));
        }
        drop(shown);
        let now = now.map(|(shown, _)| shown);
        if let Some(window) = app.get_webview_window(LABEL)
            && let Err(err) = window.emit_to(LABEL, EVENT, now)
        {
            eprintln!("FM Lens could not update the scout card: {err}");
        }
    }

    /// Shows the card, `size` CSS pixels big, if it is still for `want`.
    pub(super) fn show(app: &AppHandle, want: Shown, size: (f64, f64)) {
        let card = app.state::<ScoutCard>();
        let Some(spot) = card.shown.lock().ok().and_then(|shown| shown.filter(|(shown, _)| *shown == want)) else {
            return;
        };
        let spot = spot.1;
        let Some(window) = app.get_webview_window(LABEL) else {
            return;
        };
        let monitor = match window.monitor_from_point(f64::from(spot.at.0), f64::from(spot.at.1)) {
            Ok(Some(monitor)) => monitor,
            Ok(None) => return,
            Err(err) => {
                eprintln!("FM Lens could not place the scout card: {err}");
                return;
            }
        };
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let screen = Rect {
            left: area.position.x,
            top: area.position.y,
            right: area.position.x.saturating_add(i32::try_from(area.size.width).unwrap_or(i32::MAX)),
            bottom: area.position.y.saturating_add(i32::try_from(area.size.height).unwrap_or(i32::MAX)),
        };
        let pixels = |css: f64| (css * scale).ceil() as i32;
        let size = (pixels(size.0), pixels(size.1));
        let (x, y) = place(spot, size, screen, pixels(GAP));
        let hwnd = card.window.load(Ordering::Relaxed);
        if hwnd == 0 {
            return;
        }
        // Checked again under the lock, which `follow` holds as it hides the card, so a show cannot land after it.
        let Ok(shown) = card.shown.lock() else {
            return;
        };
        if shown.map(|(shown, _)| shown) == Some(want) {
            // Above every window and without taking focus or a click from FM (the window ignores the pointer).
            // SAFETY: a window handle of this app; the call only posts a request to the thread that owns it.
            unsafe {
                SetWindowPos(
                    hwnd as HWND,
                    HWND_TOPMOST,
                    x,
                    y,
                    size.0,
                    size.1,
                    SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_ASYNCWINDOWPOS,
                );
            }
        }
    }

    fn hide(hwnd: usize) {
        if hwnd != 0 {
            // SAFETY: a window handle of this app; the call only posts a request to the thread that owns it.
            unsafe { ShowWindowAsync(hwnd as HWND, SW_HIDE) };
        }
    }

    /// The card's window, opened the first time it is needed: hidden, never focused, and the pointer goes through it.
    fn open_window(app: &AppHandle) -> Option<WebviewWindow> {
        if let Some(window) = app.get_webview_window(LABEL) {
            return Some(window);
        }
        if app.state::<ScoutCard>().closing.load(Ordering::Relaxed) {
            return None;
        }
        let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
            .title("FM Lens")
            .visible(false)
            .focused(false)
            .focusable(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .inner_size(320.0, 240.0)
            .build();
        let window = match built {
            Ok(window) => window,
            Err(err) => {
                eprintln!("FM Lens could not open the scout card: {err}");
                return None;
            }
        };
        let hwnd = window.set_ignore_cursor_events(true).and_then(|()| window.hwnd());
        match hwnd {
            Ok(hwnd) => {
                app.state::<ScoutCard>().window.store(hwnd.0 as usize, Ordering::Relaxed);
                Some(window)
            }
            Err(err) => {
                eprintln!("FM Lens could not let the pointer through the scout card: {err}");
                if let Err(err) = window.destroy() {
                    eprintln!("FM Lens could not close the scout card: {err}");
                }
                None
            }
        }
    }

    /// The process of the connected game.
    fn connected(app: &AppHandle) -> Option<u32> {
        let state = app.state::<AppState>();
        let guard = state.0.lock().ok()?;
        guard.as_ref().map(|connection| connection.session.process.pid())
    }

    /// Whether `uid` is a player of the lists FM Lens has read, and they are still the game's.
    fn is_player(app: &AppHandle, uid: u32) -> bool {
        let state = app.state::<AppState>();
        let Ok(guard) = state.0.lock() else {
            return false;
        };
        guard.as_ref().is_some_and(|connection| connection.players.get(uid).is_some() && !connection.stale())
    }

    /// Whether a window of process `pid` is the one in front.
    fn in_front(pid: u32) -> bool {
        // SAFETY: no arguments; returns null when no window is in front.
        let window = unsafe { GetForegroundWindow() };
        if window.is_null() {
            return false;
        }
        let mut owner = 0u32;
        // SAFETY: a window handle the system gave, and a valid place for the process ID.
        unsafe { GetWindowThreadProcessId(window, &mut owner) };
        owner == pid
    }

    /// The pointer and the window in front (FM's), now.
    fn spot() -> Option<Spot> {
        let mut at = POINT::default();
        // SAFETY: a valid place for the point.
        if unsafe { GetCursorPos(&mut at) } == 0 {
            return None;
        }
        // SAFETY: no arguments; returns null when no window is in front.
        let window = unsafe { GetForegroundWindow() };
        let mut rect = RECT::default();
        // SAFETY: a window handle the system gave (or null, which fails), and a valid place for the rectangle.
        if window.is_null() || unsafe { GetWindowRect(window, &mut rect) } == 0 {
            return None;
        }
        Some(Spot {
            at: (at.x, at.y),
            game: Rect { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        })
    }

    fn shift_down() -> bool {
        // SAFETY: takes a key code only.
        let state = unsafe { GetAsyncKeyState(i32::from(VK_SHIFT)) };
        state < 0
    }

    /// The classes FM Lens looks for in FM's card.
    #[derive(Clone, Copy, PartialEq, Eq)]
    enum Kind {
        Floating,
        Bindings,
        Reference,
        Number,
        Other,
    }

    /// Reads FM's card in one run of the game.
    struct Reader {
        process: Process,
        /// The class `SI.Bindable.Tooltip.Visuals`, whose first static field is FM's floating card.
        visuals: u64,
        /// The kind of each class met, by its address.
        kinds: HashMap<u64, Kind>,
        /// Where the person was found last time: the card's root and target, and the elements from the root down to
        /// him. Looked at first, while each still holds the next: FM swaps the card's content for another player.
        last: Option<(u64, u64, Vec<u64>)>,
    }

    impl Reader {
        fn find(pid: u32) -> Option<Reader> {
            let process = match Process::open_read(pid) {
                Ok(process) => process,
                Err(err) => {
                    eprintln!("FM Lens could not open the game to read its player card: {err}");
                    return None;
                }
            };
            let visuals = find_visuals(&process)?;
            Some(Reader { process, visuals, kinds: HashMap::new(), last: None })
        }

        /// The UID of the person FM's card is open for.
        fn hovered(&mut self) -> Option<u32> {
            let statics = self.word(self.visuals + 0xb8)?;
            let floating = self.word(statics)?;
            if self.kind(floating) != Kind::Floating {
                return None;
            }
            // None while FM's card is closed.
            let target = self.word(floating + 0x68)?;
            let root = self.word(floating + 0x28)?;
            if let Some((at_root, at_target, path)) = self.last.take()
                && (at_root, at_target) == (root, target)
                && path
                    .windows(2)
                    .all(|pair| self.children(pair[0]).is_some_and(|children| children.contains(&pair[1])))
                && let Some(&element) = path.last()
                && self.kind(element) == Kind::Bindings
                && let Some(uid) = self.person(element)
            {
                self.last = Some((root, target, path));
                return Some(uid);
            }
            let mut stack = vec![(root, 0)];
            let mut path = Vec::new();
            let mut walked = 0;
            while let Some((element, depth)) = stack.pop() {
                walked += 1;
                if walked > MAX_ELEMENTS {
                    return None;
                }
                path.truncate(depth);
                path.push(element);
                if self.kind(element) == Kind::Bindings
                    && let Some(uid) = self.person(element)
                {
                    self.last = Some((root, target, path));
                    return Some(uid);
                }
                if let Some(children) = self.children(element) {
                    // The first child is walked first.
                    stack.extend(
                        children
                            .into_iter()
                            .rev()
                            .filter(|&child| is_user_pointer(child))
                            .map(|child| (child, depth + 1)),
                    );
                }
            }
            None
        }

        /// The child elements of an element.
        fn children(&self, element: u64) -> Option<Vec<u64>> {
            self.list(self.word(element + 0x290)?, MAX_CHILDREN)
        }

        /// The UID in an element's "personBind" binding, if it has one.
        fn person(&mut self, element: u64) -> Option<u32> {
            let core = self.word(element + 0x2c8)?;
            let variables = self.word(core + 0x10)?;
            for variable in self.list(variables, MAX_VARIABLES)? {
                if !is_user_pointer(variable)
                    || self.word(variable + 0x10).is_none_or(|name| !self.is_text(name, PERSON))
                {
                    continue;
                }
                let reference = self.word(variable + 0x20).and_then(|scope| self.word(scope + 0x28))?;
                return if self.kind(reference) == Kind::Reference { self.unid(reference) } else { None };
            }
            None
        }

        /// The 'unid' of a `SI.Bindable.DynamicReference`: a dictionary from four-letter keys to typed values.
        fn unid(&mut self, reference: u64) -> Option<u32> {
            let entries = self.word(reference + 0x18)?;
            let count = self.count(reference + 0x20, MAX_ENTRIES)?;
            if self.count(entries + 0x18, usize::MAX)? < count {
                return None;
            }
            let bytes = self.process.read_bytes(entries + 0x20, count * 0x18).ok()?;
            for entry in bytes.as_chunks::<0x18>().0 {
                let int = |at: usize| i32::from_le_bytes([entry[at], entry[at + 1], entry[at + 2], entry[at + 3]]);
                // A free entry has no hash, or a next below -1.
                if int(0) < 0 || int(4) < -1 || int(8).cast_unsigned() != UNID {
                    continue;
                }
                let value = u64::from_le_bytes(entry[0x10..0x18].try_into().ok()?);
                if !is_user_pointer(value) || self.kind(value) != Kind::Number {
                    return None;
                }
                let number = self.process.read_u64(value + 0x18).ok()?;
                return u32::try_from(number).ok().filter(|&uid| uid != 0);
            }
            None
        }

        /// The kind of a managed object, by its class.
        fn kind(&mut self, object: u64) -> Kind {
            let Some(class) = self.word(object) else {
                return Kind::Other;
            };
            if let Some(&kind) = self.kinds.get(&class) {
                return kind;
            }
            let kind = match class_name(&self.process, class) {
                Some((space, name)) => match (space.as_str(), name.as_str()) {
                    ("SI.UI", "FloatingElement") => Kind::Floating,
                    ("SI.Bindable", "BindingVariables") => Kind::Bindings,
                    ("SI.Bindable", "DynamicReference") => Kind::Reference,
                    ("SI.Core", "NumericTypedValue") => Kind::Number,
                    _ => Kind::Other,
                },
                // Not kept: the class may be read next time.
                None => return Kind::Other,
            };
            if self.kinds.len() >= MAX_KINDS {
                self.kinds.clear();
            }
            self.kinds.insert(class, kind);
            kind
        }

        /// A pointer read at `at`, if it is one.
        fn word(&self, at: u64) -> Option<u64> {
            self.process.read_u64(at).ok().filter(|&word| is_user_pointer(word))
        }

        /// A count read at `at`, up to `max`.
        fn count(&self, at: u64, max: usize) -> Option<usize> {
            let count = i32::from_le_bytes(self.process.read_u32(at).ok()?.to_le_bytes());
            usize::try_from(count).ok().filter(|&count| count <= max)
        }

        /// The items of a `List<T>` of references: its array at +0x10, its count at +0x18.
        fn list(&self, list: u64, max: usize) -> Option<Vec<u64>> {
            let items = self.word(list + 0x10)?;
            let count = self.count(list + 0x18, max)?;
            if count == 0 {
                return Some(Vec::new());
            }
            let bytes = self.process.read_bytes(items + 0x20, count * 8).ok()?;
            Some(bytes.as_chunks::<8>().0.iter().map(|word| u64::from_le_bytes(*word)).collect())
        }

        /// Whether the managed string at `string` is `text`: its length at +0x10, UTF-16 from +0x14.
        fn is_text(&self, string: u64, text: &str) -> bool {
            let length = text.encode_utf16().count();
            if self.count(string + 0x10, length) != Some(length) {
                return false;
            }
            let Ok(bytes) = self.process.read_bytes(string + 0x14, length * 2) else {
                return false;
            };
            bytes.as_chunks::<2>().0.iter().map(|unit| u16::from_le_bytes(*unit)).eq(text.encode_utf16())
        }
    }

    /// The namespace and name of the IL2CPP class at `class`: C strings at +0x18 and +0x10; +0x78 points back at it.
    fn class_name(process: &Process, class: u64) -> Option<(String, String)> {
        if process.read_u64(class + 0x78).ok()? != class {
            return None;
        }
        // The names are not aligned: they sit end to end in the metadata.
        let name = c_string(process, process.read_u64(class + 0x10).ok()?)?;
        let space = c_string(process, process.read_u64(class + 0x18).ok()?)?;
        Some((space, name))
    }

    /// A short C string at `at`, read without crossing into a page that may not be there.
    fn c_string(process: &Process, at: u64) -> Option<String> {
        const MAX: u64 = 128;
        if at == 0 {
            return None;
        }
        let first = MAX.min(0x1000 - (at & 0xfff));
        let mut bytes = process.read_bytes(at, first as usize).ok()?;
        if !bytes.contains(&0) && first < MAX {
            bytes.extend(process.read_bytes(at + first, (MAX - first) as usize).ok()?);
        }
        let end = bytes.iter().position(|&byte| byte == 0)?;
        bytes.truncate(end);
        String::from_utf8(bytes).ok()
    }

    /// The class `Visuals` nested in `SI.Bindable.Tooltip`: its name in the game's metadata, then the class that points
    /// at it (its name at +0x10).
    fn find_visuals(process: &Process) -> Option<u64> {
        let all: Vec<Region> = regions(process, 0x1_0000, 0x7FFF_FFFF_0000)
            .into_iter()
            .filter(|region| region.is_readable() && region.size < 1 << 32)
            .collect();
        // The name is in many places; only the class's own copy has the class pointing at it.
        let names = find_text(process, &all, b"\0Visuals\0");
        if names.is_empty() {
            eprintln!("FM Lens did not find the name of FM's player card class");
            return None;
        }
        let (low, high) = (*names.iter().min()?, *names.iter().max()?);
        let mut ordered: Vec<&Region> = all.iter().filter(|region| region.is_private()).collect();
        ordered.extend(all.iter().filter(|region| !region.is_private()));
        let mut buffer = vec![0u8; CHUNK];
        for region in ordered {
            let mut offset = 0;
            while offset < region.size {
                let length = CHUNK.min((region.size - offset) as usize);
                let chunk = &mut buffer[..length];
                if process.read_into(region.base + offset, chunk).is_ok() {
                    for (index, word) in chunk.as_chunks::<8>().0.iter().enumerate() {
                        let word = u64::from_le_bytes(*word);
                        if word < low || word > high || !names.contains(&word) {
                            continue;
                        }
                        let class = region.base + offset + index as u64 * 8 - 0x10;
                        if is_visuals(process, class) {
                            return Some(class);
                        }
                    }
                }
                offset += length as u64;
            }
        }
        eprintln!("FM Lens did not find FM's player card class");
        None
    }

    /// Where `pattern` (a name between two zero bytes) is in `regions`: the address of the name.
    fn find_text(process: &Process, regions: &[Region], pattern: &[u8]) -> HashSet<u64> {
        let finder = memchr::memmem::Finder::new(pattern);
        let overlap = pattern.len() as u64 - 1;
        let mut buffer = vec![0u8; CHUNK];
        let mut found = HashSet::new();
        for region in regions {
            let mut offset = 0;
            while offset < region.size {
                let length = CHUNK.min((region.size - offset) as usize);
                let chunk = &mut buffer[..length];
                if process.read_into(region.base + offset, chunk).is_ok() {
                    for at in finder.find_iter(chunk) {
                        found.insert(region.base + offset + at as u64 + 1);
                    }
                }
                if offset + (length as u64) >= region.size {
                    break;
                }
                offset += length as u64 - overlap;
            }
        }
        found
    }

    fn is_visuals(process: &Process, class: u64) -> bool {
        let declaring = process.read_u64(class + 0x50).ok().filter(|&word| is_user_pointer(word));
        class_name(process, class).is_some_and(|(space, name)| space.is_empty() && name == "Visuals")
            && declaring
                .and_then(|declaring| class_name(process, declaring))
                .is_some_and(|(space, name)| space == "SI.Bindable" && name == "Tooltip")
    }
}

#[cfg(test)]
mod tests {
    use super::{Rect, Spot, place};

    const SCREEN: Rect = Rect { left: 0, top: 0, right: 1920, bottom: 1040 };

    fn spot(x: i32, y: i32) -> Spot {
        Spot { at: (x, y), game: Rect { left: 0, top: 0, right: 1920, bottom: 1080 } }
    }

    #[test]
    fn goes_left_of_the_pointer() {
        assert_eq!(place(spot(1000, 300), (300, 400), SCREEN, 16), (684, 284));
    }

    #[test]
    fn goes_to_the_far_right_without_room_on_the_left() {
        assert_eq!(place(spot(200, 300), (300, 400), SCREEN, 16), (1604, 284));
    }

    #[test]
    fn stays_inside_the_game_and_the_screen() {
        let windowed = Spot { at: (200, 1000), game: Rect { left: 0, top: 0, right: 1024, bottom: 768 } };
        assert_eq!(place(windowed, (300, 400), SCREEN, 16), (708, 368));
        assert_eq!(place(spot(1900, 20), (300, 400), SCREEN, 16), (1584, 4));
        let small = Rect { left: 0, top: 0, right: 200, bottom: 200 };
        assert_eq!(place(spot(100, 100), (300, 400), small, 16), (0, 0));
    }
}
