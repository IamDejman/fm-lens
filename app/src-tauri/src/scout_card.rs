//! The in-game card: while the pointer rests on a player's, a member of staff's or a club's name in FM, or FM's own
//! card for a player is open (its (i) button hovered), FM Lens shows its short card for them over the game; a
//! player's at his peak while Shift is held. The card stays while the pointer is on it, and a click on it opens them
//! in FM Lens. FM's Unity layer keeps what the pointer is on and FM's card, each reached from one static field (see
//! docs/recon/fm27-scouting-research.md). Only reads the game.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

/// The label of the card's window.
pub(crate) const LABEL: &str = "card";
/// The event that tells the card's window which player to show.
const EVENT: &str = "scout-card";
/// The event that tells the main window to open a player: the card was clicked.
const OPEN: &str = "scout-card-open";
/// How long after FM's card closes the pointer may take to reach the card.
const REACH: Duration = Duration::from_millis(800);

/// What a card is for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Subject {
    Player,
    Staff,
    Club,
}

/// Who the card is for, and whether it shows a player at his peak.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Shown {
    kind: Subject,
    uid: u32,
    peak: bool,
}

impl Shown {
    fn same_one(self, other: Shown) -> bool {
        (self.kind, self.uid) == (other.kind, other.uid)
    }
}

/// What the main window opens: the card was clicked.
#[derive(Clone, Serialize)]
struct Open {
    kind: Subject,
    uid: u32,
    name: String,
}

/// A rectangle on screen: in physical pixels on Windows, in points on macOS.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

impl Rect {
    fn holds(self, at: (i32, i32)) -> bool {
        (self.left..self.right).contains(&at.0) && (self.top..self.bottom).contains(&at.1)
    }

    /// The rectangle grown to hold `at` too.
    fn with(self, at: (i32, i32)) -> Rect {
        Rect {
            left: self.left.min(at.0),
            top: self.top.min(at.1),
            right: self.right.max(at.0 + 1),
            bottom: self.bottom.max(at.1 + 1),
        }
    }
}

/// Where FM's card was opened: the pointer, and FM's window.
#[derive(Clone, Copy, Debug)]
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
    #[cfg(windows)]
    window: std::sync::atomic::AtomicUsize,
    /// What the card shows, and where FM's card was opened for it.
    shown: Mutex<Option<(Shown, Spot)>>,
    /// Where the card is, once it is shown.
    placed: Mutex<Option<Rect>>,
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

/// The card's window has drawn its card at `width` by `height` (CSS pixels): it is shown, if it is still wanted.
#[tauri::command]
pub(crate) async fn scout_card_ready(app: AppHandle, kind: Subject, uid: u32, peak: bool, width: f64, height: f64) {
    imp::show(&app, Shown { kind, uid, peak }, (width, height));
}

/// The card was clicked: the main window comes to the front and opens who it is for.
#[tauri::command]
pub(crate) async fn scout_card_open(app: AppHandle, kind: Subject, uid: u32, name: String) {
    crate::show_main_window(&app);
    if let Err(err) = app.emit_to("main", OPEN, Open { kind, uid, name }) {
        eprintln!("FM Lens could not open the scout card's {kind:?}: {err}");
    }
}

/// Watches FM's card beside the window.
pub(crate) fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || imp::watch(&app));
}

/// The main window has closed: the card's goes too, so the app ends.
pub(crate) fn close(app: &AppHandle) {
    let card = app.state::<ScoutCard>();
    card.closing.store(true, Ordering::Relaxed);
    #[cfg(windows)]
    card.window.store(0, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window(LABEL)
        && let Err(err) = window.destroy()
    {
        eprintln!("FM Lens could not close the scout card: {err}");
    }
}

/// Where the card goes, `size` big, for FM's card opened at `spot`, inside `screen` (the monitor's work area): left
/// of the pointer, as FM opens its card to the right; where there is no room, at the far right of FM's window.
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

/// Whether the card, at `card`, stays once FM's card (opened with the pointer at `from`) has been closed for
/// `closed`: while the pointer `at` is on the card, or between where it was and the card soon after.
fn stays(card: Rect, from: (i32, i32), at: (i32, i32), closed: Duration) -> bool {
    card.holds(at) || (closed < REACH && card.with(from).holds(at))
}

mod imp {
    use std::collections::{HashMap, HashSet};
    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};

    use fmlens_mem::{Process, Region, is_user_pointer, regions};
    use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

    use super::{EVENT, LABEL, Rect, ScoutCard, Shown, Subject, place, stays};
    use crate::AppState;

    /// How often FM is looked at.
    const EVERY: Duration = Duration::from_millis(120);
    /// How long to wait before looking for FM's classes again in a game where they were not found.
    const LOOK_AGAIN: Duration = Duration::from_secs(30);
    /// How long to wait before looking again for FM's card class, which the game makes the first time it needs it.
    const LOOK_FOR_CARD_AGAIN: Duration = Duration::from_secs(60);
    /// How long the pointer rests on a name before its card shows.
    const DWELL: Duration = Duration::from_millis(300);
    /// The room between the pointer and the card, in CSS pixels.
    const GAP: f64 = 16.0;

    /// The name of the binding that holds the person FM's card is for, and the key of his UID in it ('unid').
    const PERSON: &str = "personBind";
    const UNID: u32 = 0x756e_6964;
    /// In a link's record, the key of what it links to ('111 '); in what it links to, the key of the game's own
    /// reference ('dref'): the kind of thing in the top byte, its index below.
    const LINKED: u32 = 0x3131_3120;
    const DREF: u32 = 0x6472_6566;
    const DREF_PERSON: u32 = 0x01;
    const DREF_CLUB: u32 = 0x03;
    const DREF_TEAM: u32 = 0x18;
    /// The first four bytes of IL2CPP's metadata, which holds the names of the game's classes.
    const METADATA: u32 = 0xFAB1_1BAF;

    /// Bounds on what is walked, so a screen the game is rebuilding cannot keep the walk going.
    const MAX_ELEMENTS: usize = 20_000;
    const MAX_CHILDREN: usize = 4096;
    const MAX_VARIABLES: usize = 64;
    const MAX_ENTRIES: usize = 64;
    const MAX_KINDS: usize = 4096;
    const MAX_PANELS: usize = 64;
    const MAX_ANCESTORS: usize = 8;
    const MAX_LINKS: usize = 256;
    const MAX_PARENTS: usize = 16;
    const MAX_FIELDS: u64 = 2048;
    const CHUNK: usize = 4 << 20;

    /// What the pointer is on in FM: FM's card for a person (his UID), or a link to a person, a club or a team (the
    /// game's index of it).
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum Target {
        Person(u32),
        PersonIndex(u32),
        Club(u32),
        Team(u32),
    }

    /// What `look` keeps from one look to the next.
    #[derive(Default)]
    struct Looking {
        reader: Option<Reader>,
        /// The game last looked in for FM's classes, and when.
        tried: Option<(u32, Instant)>,
        /// When the card the pointer has left was last seen to be left.
        closed: Option<Instant>,
        /// The link the pointer is on, and since when.
        resting: Option<(Target, Instant)>,
        /// Who the last target was found to be.
        found: Option<(Target, (Subject, u32))>,
    }

    pub(super) fn watch(app: &AppHandle) {
        let mut looking = Looking::default();
        let card = app.state::<ScoutCard>();
        while !card.closing.load(Ordering::Relaxed) {
            std::thread::sleep(EVERY);
            let next = look(app, &mut looking);
            follow(app, next);
            // FM Lens is not the app in front, so macOS does not tell the card's window the pointer is on it.
            #[cfg(target_os = "macos")]
            if pointed(app) {
                sys::hand(app);
            }
        }
    }

    /// What the card should show now: none unless FM is in front with the pointer resting on a name or FM's card
    /// open for a player, or the pointer has gone from there to the card.
    fn look(app: &AppHandle, looking: &mut Looking) -> Option<Shown> {
        if app.state::<ScoutCard>().off.load(Ordering::Relaxed) {
            return None;
        }
        let pid = connected(app)?;
        if !sys::in_front(pid) {
            return None;
        }
        if looking.reader.as_ref().is_none_or(|reader| reader.process.pid() != pid) {
            looking.reader = None;
            looking.found = None;
            if looking.tried.is_some_and(|(tried, at)| tried == pid && at.elapsed() < LOOK_AGAIN) {
                return None;
            }
            looking.tried = Some((pid, Instant::now()));
            let started = Instant::now();
            looking.reader = Reader::find(pid);
            let ms = started.elapsed().as_millis();
            match &looking.reader {
                Some(reader) => {
                    let card = if reader.visuals.is_some() { "" } else { ", not yet its player card" };
                    eprintln!("FM Lens found what FM's pointer is on in {ms} ms{card}");
                    // Opened now, so it is ready by the first hover.
                    open_window(app);
                }
                None => eprintln!("FM Lens could not find what FM's pointer is on ({ms} ms)"),
            }
        }
        let reader = looking.reader.as_mut()?;
        reader.find_card_class();
        let target = match reader.card() {
            Some(uid) => {
                looking.resting = None;
                Some(Target::Person(uid))
            }
            None => rested(reader.link(), &mut looking.resting),
        };
        let shown = target.and_then(|target| match looking.found {
            Some((found, who)) if found == target => Some(who),
            _ => {
                let who = who(app, target)?;
                looking.found = Some((target, who));
                Some(who)
            }
        });
        let (kind, uid) = match shown {
            Some(who) => {
                looking.closed = None;
                who
            }
            None => kept(app, &mut looking.closed)?,
        };
        Some(Shown { kind, uid, peak: kind == Subject::Player && sys::shift_down() })
    }

    /// The link the pointer has rested on for `DWELL`, so moving across names does not open a card for each.
    fn rested(link: Option<Target>, resting: &mut Option<(Target, Instant)>) -> Option<Target> {
        let Some(link) = link else {
            *resting = None;
            return None;
        };
        match *resting {
            Some((target, since)) if target == link => (since.elapsed() >= DWELL).then_some(link),
            _ => {
                *resting = Some((link, Instant::now()));
                None
            }
        }
    }

    /// Who the card for `target` is for, of those FM Lens has read: a player before a member of staff, as a
    /// player-coach is both. A team's card is its club's.
    fn who(app: &AppHandle, target: Target) -> Option<(Subject, u32)> {
        let state = app.state::<AppState>();
        let guard = state.0.lock().ok()?;
        let connection = guard.as_ref()?;
        let person = |found: Option<u32>, staff: Option<u32>| {
            found.map(|uid| (Subject::Player, uid)).or_else(|| staff.map(|uid| (Subject::Staff, uid)))
        };
        match target {
            Target::Person(uid) => person(
                connection.players.get(uid).map(|player| player.uid),
                connection.staff.get(uid).map(|member| member.uid),
            ),
            Target::PersonIndex(index) => person(
                connection.players.iter().find(|player| player.index == index).map(|player| player.uid),
                connection.staff.iter().find(|member| member.index == index).map(|member| member.uid),
            ),
            Target::Club(index) => {
                connection.clubs.iter().find(|club| club.index == index).map(|club| (Subject::Club, club.uid))
            }
            Target::Team(id) => {
                let club = match connection.session.club_of_team_id(id) {
                    Ok(club) => club?,
                    Err(err) => {
                        eprintln!("FM Lens could not find the club of team {id}: {err}");
                        return None;
                    }
                };
                connection.clubs.iter().find(|found| found.address == club).map(|club| (Subject::Club, club.uid))
            }
        }
    }

    /// Who the card stays on though the pointer has left what opened it.
    fn kept(app: &AppHandle, closed: &mut Option<Instant>) -> Option<(Subject, u32)> {
        let card = app.state::<ScoutCard>();
        let (shown, spot) = card.shown.lock().ok().and_then(|shown| *shown)?;
        let placed = card.placed.lock().ok().and_then(|placed| *placed)?;
        let closed = closed.get_or_insert_with(Instant::now).elapsed();
        stays(placed, spot.at, sys::pointer()?, closed).then_some((shown.kind, shown.uid))
    }

    /// Whether the pointer is on the card.
    #[cfg(target_os = "macos")]
    fn pointed(app: &AppHandle) -> bool {
        let placed = app.state::<ScoutCard>().placed.lock().ok().and_then(|placed| *placed);
        placed.zip(sys::pointer()).is_some_and(|(placed, at)| placed.holds(at))
    }

    /// Hides the card for another one or none, and tells its window what to show. Only this thread changes what the
    /// card shows; the window is opened, and FM's window read, before the lock is taken.
    fn follow(app: &AppHandle, next: Option<Shown>) {
        let card = app.state::<ScoutCard>();
        let current = |card: &ScoutCard| card.shown.lock().ok().and_then(|shown| *shown);
        let before = current(&card);
        if before.map(|(shown, _)| shown) == next {
            return;
        }
        let window = next.and_then(|_| open_window(app));
        let spot = match (next, before) {
            (Some(next), Some((before, spot))) if before.same_one(next) => Some(spot),
            (Some(_), _) => sys::spot(),
            (None, _) => None,
        };
        let now = next.zip(window.as_ref().and(spot));
        let Ok(mut shown) = card.shown.lock() else {
            return;
        };
        *shown = now;
        if before.zip(now).is_none_or(|((before, _), (now, _))| !before.same_one(now)) {
            sys::hide(app);
            if let Ok(mut placed) = card.placed.lock() {
                *placed = None;
            }
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
        let (screen, scale) = match sys::screen(&window, spot) {
            Ok(Some(screen)) => screen,
            Ok(None) => return,
            Err(err) => {
                eprintln!("FM Lens could not place the scout card: {err}");
                return;
            }
        };
        let pixels = |css: f64| (css * scale).ceil() as i32;
        let size = (pixels(size.0), pixels(size.1));
        let at = place(spot, size, screen, pixels(GAP));
        // Checked again under the lock, which `follow` holds as it hides the card, so a show cannot land after it.
        let Ok(shown) = card.shown.lock() else {
            return;
        };
        if shown.map(|(shown, _)| shown) == Some(want) {
            sys::put(app, at, size);
            if let Ok(mut placed) = card.placed.lock() {
                *placed = Some(Rect { left: at.0, top: at.1, right: at.0 + size.0, bottom: at.1 + size.1 });
            }
        }
    }

    /// The card's window, opened the first time it is needed: hidden and never focused. A click on it reaches it
    /// though FM is the app in front.
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
            .accept_first_mouse(true)
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
        match sys::opened(app, &window) {
            Ok(()) => Some(window),
            Err(err) => {
                eprintln!("FM Lens could not set up the scout card: {err}");
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

    /// The classes FM Lens looks for in FM's Unity layer.
    #[derive(Clone, Copy, PartialEq, Eq)]
    enum Class {
        Floating,
        Bindings,
        Reference,
        Number,
        Link,
        Text,
        PersonLink,
        ClubLink,
        TeamLink,
        Other,
    }

    /// Reads what the pointer is on in one run of the game.
    struct Reader {
        process: Process,
        /// The class `UnityEngine.UIElements.UIElementsUtility`, whose statics hold the game's panels.
        utility: u64,
        /// The class `SI.Bindable.Tooltip.Visuals`, whose first static field is FM's floating card; and when it was
        /// last looked for, while the game has not made it.
        visuals: Option<u64>,
        visuals_tried: Instant,
        /// The kind of each class met, by its address.
        kinds: HashMap<u64, Class>,
        /// The offset of each field read, by its class and name.
        offsets: HashMap<(u64, &'static str), u64>,
        /// Where the person was found last time: the card's root and target, and the elements from the root down to
        /// him. Looked at first, while each still holds the next: FM swaps the card's content for another player.
        last: Option<(u64, u64, Vec<u64>)>,
    }

    impl Reader {
        fn find(pid: u32) -> Option<Reader> {
            let process = match Process::open_read(pid) {
                Ok(process) => process,
                Err(err) => {
                    eprintln!("FM Lens could not open the game to read what its pointer is on: {err}");
                    return None;
                }
            };
            let (utility, visuals) = find_classes(&process, true);
            Some(Reader {
                utility: utility?,
                visuals,
                visuals_tried: Instant::now(),
                process,
                kinds: HashMap::new(),
                offsets: HashMap::new(),
                last: None,
            })
        }

        /// Looks again for FM's card class, now and then, until the game has made it.
        fn find_card_class(&mut self) {
            if self.visuals.is_some() || self.visuals_tried.elapsed() < LOOK_FOR_CARD_AGAIN {
                return;
            }
            self.visuals_tried = Instant::now();
            self.visuals = find_classes(&self.process, false).1;
            if self.visuals.is_some() {
                eprintln!("FM Lens found FM's player card");
            }
        }

        /// What the link the pointer is on links to, in any of the game's panels.
        fn link(&mut self) -> Option<Target> {
            let statics = self.word(self.utility + 0xb8)?;
            let cache = self.word(statics + static_offset(&self.process, self.utility, "s_UIElementsCache")?)?;
            // A Dictionary<int, Panel>: its entries at +0x18, its count at +0x20; each entry 0x18 bytes, the panel last.
            let entries = self.word(cache + 0x18)?;
            let count = self.count(cache + 0x20, MAX_PANELS)?;
            if self.count(entries + 0x18, usize::MAX)? < count {
                return None;
            }
            for index in 0..count as u64 {
                let entry = entries + 0x20 + index * 0x18;
                if self.count(entry, usize::MAX).is_none() {
                    continue;
                }
                let Some(panel) = self.word(entry + 0x10) else {
                    continue;
                };
                // The elements under each pointer, the mouse's first.
                let Some(element) = self
                    .field(panel, "m_TopElementUnderPointers")
                    .and_then(|under| self.field(under, "m_TopElementUnderPointer"))
                    .and_then(|elements| self.word(elements + 0x20))
                else {
                    continue;
                };
                if let Some(target) = self.link_at(element) {
                    return Some(target);
                }
            }
            None
        }

        /// What the link at `element` or one of its nearest parents links to: a whole link's first, or the one the
        /// pointer is on in a text.
        fn link_at(&mut self, mut element: u64) -> Option<Target> {
            for _ in 0..MAX_ANCESTORS {
                let found = match self.kind(element) {
                    Class::Link => return self.field(element, "m_linkText").and_then(|text| self.linked(text, true)),
                    Class::Text => self.linked(element, false),
                    _ => None,
                };
                if found.is_some() {
                    return found;
                }
                element = self.field(element, "m_PhysicalParent")?;
            }
            None
        }

        /// What the text `text` links to where the pointer is; for a `whole` link, its first link when the pointer
        /// is on none of them.
        fn linked(&mut self, text: u64, whole: bool) -> Option<Target> {
            let hovered = self.offset(text, "m_hoveredLinkID").and_then(|at| self.process.read_u32(text + at).ok());
            let hovered = i32::from_le_bytes(hovered?.to_le_bytes());
            let at = match usize::try_from(hovered) {
                Ok(at) => at,
                Err(_) if whole => 0,
                Err(_) => return None,
            };
            let records = self.field(text, "m_embeddedData").and_then(|data| self.list(data, MAX_LINKS))?;
            let record = *records.get(at)?;
            let value = self.entry(record, LINKED)?;
            let reference = self.field(value, "m_value")?;
            let kind = self.kind(reference);
            let dref = self.dref(reference)?;
            let (of, index) = (dref >> 24, dref & 0xFF_FFFF);
            match (kind, of) {
                (Class::PersonLink, DREF_PERSON) => Some(Target::PersonIndex(index)),
                (Class::ClubLink, DREF_CLUB) => Some(Target::Club(index)),
                (Class::TeamLink, DREF_TEAM) => Some(Target::Team(index)),
                _ => None,
            }
        }

        /// The 'dref' of one of the game's references: a list of (key, value) pairs of u32 at `m_id`.
        fn dref(&mut self, reference: u64) -> Option<u32> {
            let id = self.field(reference, "m_id")?;
            let items = self.word(id + 0x10)?;
            let count = self.count(id + 0x18, MAX_ENTRIES)?;
            if self.count(items + 0x18, usize::MAX)? < count {
                return None;
            }
            let bytes = self.process.read_bytes(items + 0x20, count * 8).ok()?;
            bytes.as_chunks::<8>().0.iter().find_map(|pair| {
                let key = u32::from_le_bytes([pair[0], pair[1], pair[2], pair[3]]);
                (key == DREF).then(|| u32::from_le_bytes([pair[4], pair[5], pair[6], pair[7]]))
            })
        }

        /// The UID of the person FM's card is open for.
        fn card(&mut self) -> Option<u32> {
            let statics = self.word(self.visuals? + 0xb8)?;
            let floating = self.word(statics)?;
            if self.kind(floating) != Class::Floating {
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
                && self.kind(element) == Class::Bindings
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
                if self.kind(element) == Class::Bindings
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
                return if self.kind(reference) == Class::Reference { self.unid(reference) } else { None };
            }
            None
        }

        /// The 'unid' of a `SI.Bindable.DynamicReference`.
        fn unid(&mut self, reference: u64) -> Option<u32> {
            let value = self.entry(reference, UNID)?;
            if self.kind(value) != Class::Number {
                return None;
            }
            let number = self.process.read_u64(value + 0x18).ok()?;
            u32::try_from(number).ok().filter(|&uid| uid != 0)
        }

        /// The value under `key` in a `SI.Core.Record` or a `SI.Bindable.DynamicReference`: dictionaries from
        /// four-letter keys to typed values, their entries at +0x18 and their count at +0x20.
        fn entry(&self, record: u64, key: u32) -> Option<u64> {
            let entries = self.word(record + 0x18)?;
            let count = self.count(record + 0x20, MAX_ENTRIES)?;
            if self.count(entries + 0x18, usize::MAX)? < count {
                return None;
            }
            let bytes = self.process.read_bytes(entries + 0x20, count * 0x18).ok()?;
            for entry in bytes.as_chunks::<0x18>().0 {
                let int = |at: usize| i32::from_le_bytes([entry[at], entry[at + 1], entry[at + 2], entry[at + 3]]);
                // A free entry has no hash, or a next below -1.
                if int(0) < 0 || int(4) < -1 || int(8).cast_unsigned() != key {
                    continue;
                }
                let value = u64::from_le_bytes(entry[0x10..0x18].try_into().ok()?);
                return is_user_pointer(value).then_some(value);
            }
            None
        }

        /// The kind of a managed object, by its class or the nearest of its parents FM Lens knows.
        fn kind(&mut self, object: u64) -> Class {
            let Some(class) = self.word(object) else {
                return Class::Other;
            };
            if let Some(&kind) = self.kinds.get(&class) {
                return kind;
            }
            let mut at = class;
            let mut kind = None;
            for _ in 0..MAX_PARENTS {
                // Not kept when a name cannot be read: the class may be read next time.
                let Some((space, name)) = class_name(&self.process, at) else {
                    return Class::Other;
                };
                let known = match (space.as_str(), name.as_str()) {
                    ("SI.UI", "FloatingElement") => Some(Class::Floating),
                    ("SI.Bindable", "BindingVariables") => Some(Class::Bindings),
                    ("SI.Bindable", "DynamicReference") => Some(Class::Reference),
                    ("SI.Core", "NumericTypedValue") => Some(Class::Number),
                    ("SI.Bindable", "NavigableLink") => Some(Class::Link),
                    ("SI.Bindable", "SIText") => Some(Class::Text),
                    ("FM.UI", "PersonReference") => Some(Class::PersonLink),
                    ("FM.UI", "ClubReference") => Some(Class::ClubLink),
                    ("FM.UI", "TeamReference") => Some(Class::TeamLink),
                    _ => None,
                };
                if known.is_some() {
                    kind = known;
                    break;
                }
                match self.word(at + 0x58) {
                    Some(parent) if parent != at => at = parent,
                    _ => break,
                }
            }
            let kind = kind.unwrap_or(Class::Other);
            if self.kinds.len() >= MAX_KINDS {
                self.kinds.clear();
            }
            self.kinds.insert(class, kind);
            kind
        }

        /// The offset of the instance field `name` of `object`, from its class or its parents.
        fn offset(&mut self, object: u64, name: &'static str) -> Option<u64> {
            let class = self.word(object)?;
            if let Some(&at) = self.offsets.get(&(class, name)) {
                return Some(at);
            }
            let at = field_offset(&self.process, class, name, false)?;
            if self.offsets.len() >= MAX_KINDS {
                self.offsets.clear();
            }
            self.offsets.insert((class, name), at);
            Some(at)
        }

        /// The pointer in the field `name` of `object`.
        fn field(&mut self, object: u64, name: &'static str) -> Option<u64> {
            let at = self.offset(object, name)?;
            self.word(object + at)
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

    /// The offset of the field `name` of the IL2CPP class at `class` or one of its parents (at +0x58): its fields at
    /// +0x80, each 0x20 bytes: the name, the type (its attributes at +8, 0x10 for a static field), the class and the
    /// offset. A static field's is from the class's statics, at +0xB8.
    fn field_offset(process: &Process, class: u64, name: &str, is_static: bool) -> Option<u64> {
        let mut at = class;
        for _ in 0..MAX_PARENTS {
            if process.read_u64(at + 0x78).ok()? != at {
                return None;
            }
            if let Some(fields) = process.read_u64(at + 0x80).ok().filter(|&fields| is_user_pointer(fields)) {
                for index in 0..MAX_FIELDS {
                    let field = fields + index * 0x20;
                    if process.read_u64(field + 0x10).ok()? != at {
                        break;
                    }
                    let attributes = process.read_u64(field + 8).ok().and_then(|ty| process.read_u32(ty + 8).ok())?;
                    if (attributes & 0x10 != 0) == is_static
                        && c_string(process, process.read_u64(field).ok()?).is_some_and(|found| found == name)
                    {
                        let offset = i32::from_le_bytes(process.read_u32(field + 0x18).ok()?.to_le_bytes());
                        return u64::try_from(offset).ok();
                    }
                }
            }
            match process.read_u64(at + 0x58).ok().filter(|&parent| is_user_pointer(parent)) {
                Some(parent) if parent != at => at = parent,
                _ => return None,
            }
        }
        None
    }

    /// The offset of the static field `name` of the class at `class`, in its statics.
    fn static_offset(process: &Process, class: u64, name: &str) -> Option<u64> {
        field_offset(process, class, name, true)
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

    /// The classes `UnityEngine.UIElements.UIElementsUtility` (when `utility`) and `Visuals` nested in
    /// `SI.Bindable.Tooltip`: their names in IL2CPP's metadata, then the classes that point at them (the name at
    /// +0x10). The game makes a class the first time it needs it.
    fn find_classes(process: &Process, utility: bool) -> (Option<u64>, Option<u64>) {
        let all: Vec<Region> = regions(process, 0x1_0000, 0x7FFF_FFFF_0000)
            .into_iter()
            .filter(|region| region.is_readable() && region.size < 1 << 32)
            .collect();
        // The names are in the metadata, a file the game maps whole; else looked for everywhere.
        let metadata: Vec<Region> = all
            .iter()
            .filter(|region| {
                region.size >= 1 << 20 && process.read_u32(region.base).is_ok_and(|magic| magic == METADATA)
            })
            .cloned()
            .collect();
        let named = if metadata.is_empty() { &all } else { &metadata };
        let mut names = find_text(process, named, b"\0Visuals\0");
        if utility {
            names.extend(find_text(process, named, b"\0UIElementsUtility\0"));
        }
        if names.is_empty() {
            eprintln!("FM Lens did not find the names of FM's classes");
            return (None, None);
        }
        let (low, high) = (*names.iter().min().unwrap_or(&0), *names.iter().max().unwrap_or(&0));
        let (mut found_utility, mut found_visuals) = (None, None);
        let mut buffer = vec![0u8; CHUNK];
        // The game makes its classes in its own memory; the rest is looked in only for the panels' class, which the
        // game always has.
        let mut ordered: Vec<&Region> = all.iter().filter(|region| region.is_private()).collect();
        let private = ordered.len();
        ordered.extend(all.iter().filter(|region| !region.is_private()));
        for (at, region) in ordered.into_iter().enumerate() {
            if at >= private && (found_utility.is_some() || !utility) {
                break;
            }
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
                        if found_visuals.is_none() && is_visuals(process, class) {
                            found_visuals = Some(class);
                        } else if utility && found_utility.is_none() && is_utility(process, class) {
                            found_utility = Some(class);
                        }
                        if found_visuals.is_some() && (found_utility.is_some() || !utility) {
                            return (found_utility, found_visuals);
                        }
                    }
                }
                offset += length as u64;
            }
        }
        if utility && found_utility.is_none() {
            eprintln!("FM Lens did not find the class of FM's panels");
        }
        (found_utility, found_visuals)
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

    fn is_utility(process: &Process, class: u64) -> bool {
        class_name(process, class)
            .is_some_and(|(space, name)| space == "UnityEngine.UIElements" && name == "UIElementsUtility")
    }

    /// The card's window and what FM's card was opened on, on Windows.
    #[cfg(windows)]
    mod sys {
        use std::sync::atomic::Ordering;

        use tauri::{AppHandle, Manager, WebviewWindow};
        use windows_sys::Win32::Foundation::{HWND, POINT, RECT};
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_SHIFT};
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetCursorPos, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, HWND_TOPMOST, SW_HIDE,
            SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_SHOWWINDOW, SetWindowPos, ShowWindowAsync,
        };

        use super::super::{Rect, ScoutCard, Spot};

        /// The card's window is open: its handle is kept.
        pub(super) fn opened(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
            let hwnd = window.hwnd()?;
            app.state::<ScoutCard>().window.store(hwnd.0 as usize, Ordering::Relaxed);
            Ok(())
        }

        /// The work area of the monitor FM's card was opened on, and its pixels to a CSS pixel.
        pub(super) fn screen(window: &WebviewWindow, spot: Spot) -> tauri::Result<Option<(Rect, f64)>> {
            let Some(monitor) = window.monitor_from_point(f64::from(spot.at.0), f64::from(spot.at.1))? else {
                return Ok(None);
            };
            let area = monitor.work_area();
            let screen = Rect {
                left: area.position.x,
                top: area.position.y,
                right: area.position.x.saturating_add(i32::try_from(area.size.width).unwrap_or(i32::MAX)),
                bottom: area.position.y.saturating_add(i32::try_from(area.size.height).unwrap_or(i32::MAX)),
            };
            Ok(Some((screen, monitor.scale_factor())))
        }

        /// Shows the card at `at`, `size` big.
        pub(super) fn put(app: &AppHandle, at: (i32, i32), size: (i32, i32)) {
            let hwnd = app.state::<ScoutCard>().window.load(Ordering::Relaxed);
            if hwnd == 0 {
                return;
            }
            // Above every window and without taking focus from FM.
            // SAFETY: a window handle of this app; the call only posts a request to the thread that owns it.
            unsafe {
                SetWindowPos(
                    hwnd as HWND,
                    HWND_TOPMOST,
                    at.0,
                    at.1,
                    size.0,
                    size.1,
                    SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_ASYNCWINDOWPOS,
                );
            }
        }

        pub(super) fn hide(app: &AppHandle) {
            let hwnd = app.state::<ScoutCard>().window.load(Ordering::Relaxed);
            if hwnd != 0 {
                // SAFETY: a window handle of this app; the call only posts a request to the thread that owns it.
                unsafe { ShowWindowAsync(hwnd as HWND, SW_HIDE) };
            }
        }

        /// Whether a window of process `pid` is the one in front.
        pub(super) fn in_front(pid: u32) -> bool {
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

        pub(super) fn pointer() -> Option<(i32, i32)> {
            let mut at = POINT::default();
            // SAFETY: a valid place for the point.
            (unsafe { GetCursorPos(&mut at) } != 0).then_some((at.x, at.y))
        }

        /// The pointer and the window in front (FM's), now.
        pub(super) fn spot() -> Option<Spot> {
            let at = pointer()?;
            // SAFETY: no arguments; returns null when no window is in front.
            let window = unsafe { GetForegroundWindow() };
            let mut rect = RECT::default();
            // SAFETY: a window handle the system gave (or null, which fails), and a valid place for the rectangle.
            if window.is_null() || unsafe { GetWindowRect(window, &mut rect) } == 0 {
                return None;
            }
            Some(Spot { at, game: Rect { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } })
        }

        pub(super) fn shift_down() -> bool {
            // SAFETY: takes a key code only.
            let state = unsafe { GetAsyncKeyState(i32::from(VK_SHIFT)) };
            state < 0
        }
    }

    /// The card's window and what FM's card was opened on, on macOS. Places are in points, which are CSS pixels.
    #[cfg(target_os = "macos")]
    mod sys {
        use core_foundation::base::{CFType, CFTypeRef, TCFType};
        use core_foundation::boolean::CFBoolean;
        use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
        use core_foundation::number::CFNumber;
        use core_foundation::string::{CFString, CFStringRef};
        use core_graphics::event::{CGEvent, CGEventFlags};
        use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
        use core_graphics::geometry::CGRect;
        use core_graphics::window::{
            copy_window_info, kCGNullWindowID, kCGWindowBounds, kCGWindowLayer, kCGWindowListExcludeDesktopElements,
            kCGWindowListOptionOnScreenOnly, kCGWindowOwnerPID,
        };
        use objc2::rc::autoreleasepool;
        use objc2_app_kit::{NSCursor, NSWindow, NSWindowCollectionBehavior, NSWorkspace};
        use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewWindow};

        use super::super::{LABEL, Rect, Spot};

        /// The card's window is open: it is let onto the space of a full screen FM, and FM Lens may set the pointer
        /// though it is not the app in front.
        pub(super) fn opened(_app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
            let card = window.clone();
            window.run_on_main_thread(move || match card.ns_window() {
                Ok(ns_window) => {
                    background_pointer();
                    let spaces = NSWindowCollectionBehavior::CanJoinAllSpaces
                        | NSWindowCollectionBehavior::FullScreenAuxiliary
                        | NSWindowCollectionBehavior::Transient
                        | NSWindowCollectionBehavior::IgnoresCycle;
                    // SAFETY: the card's own window, alive while `card` is, on the main thread.
                    unsafe { (*ns_window.cast::<NSWindow>()).setCollectionBehavior(spaces) };
                }
                Err(err) => eprintln!("FM Lens could not let the scout card over a full screen FM: {err}"),
            })
        }

        /// The work area of the monitor FM's card was opened on: a monitor's pixels over its scale.
        pub(super) fn screen(window: &WebviewWindow, spot: Spot) -> tauri::Result<Option<(Rect, f64)>> {
            let points = |left: i32, top: i32, width: u32, height: u32, scale: f64| {
                let point = |pixels: f64| (pixels / scale).round() as i32;
                Rect {
                    left: point(f64::from(left)),
                    top: point(f64::from(top)),
                    right: point(f64::from(left) + f64::from(width)),
                    bottom: point(f64::from(top) + f64::from(height)),
                }
            };
            Ok(window.available_monitors()?.iter().find_map(|monitor| {
                let scale = monitor.scale_factor();
                let (at, size) = (monitor.position(), monitor.size());
                let whole = points(at.x, at.y, size.width, size.height, scale);
                let area = monitor.work_area();
                let holds =
                    (whole.left..whole.right).contains(&spot.at.0) && (whole.top..whole.bottom).contains(&spot.at.1);
                holds.then(|| (points(area.position.x, area.position.y, area.size.width, area.size.height, scale), 1.0))
            }))
        }

        /// Shows the card at `at`, `size` big. Asked of the main thread, as hiding is, so the two keep their order.
        pub(super) fn put(app: &AppHandle, at: (i32, i32), size: (i32, i32)) {
            let handle = app.clone();
            let asked = app.run_on_main_thread(move || {
                let Some(window) = handle.get_webview_window(LABEL) else {
                    return;
                };
                let placed = window
                    .set_size(LogicalSize::new(size.0, size.1))
                    .and_then(|()| window.set_position(LogicalPosition::new(at.0, at.1)))
                    .and_then(|()| window.ns_window());
                match placed {
                    // In front of FM without taking focus from it.
                    // SAFETY: the card's own window, alive while `window` is, on the main thread.
                    Ok(ns_window) => unsafe { (*ns_window.cast::<NSWindow>()).orderFrontRegardless() },
                    Err(err) => eprintln!("FM Lens could not show the scout card: {err}"),
                }
            });
            if let Err(err) = asked {
                eprintln!("FM Lens could not show the scout card: {err}");
            }
        }

        /// Shows a hand for the pointer, which is on the card.
        pub(super) fn hand(app: &AppHandle) {
            if let Err(err) = app.run_on_main_thread(|| NSCursor::pointingHandCursor().set()) {
                eprintln!("FM Lens could not show a hand on the scout card: {err}");
            }
        }

        /// Lets FM Lens set the pointer while another app is in front. The system keeps this to itself, so its two
        /// routines are looked up by name: without them the pointer stays an arrow on the card.
        fn background_pointer() {
            type Connection = unsafe extern "C" fn() -> i32;
            type SetProperty = unsafe extern "C" fn(i32, i32, CFStringRef, CFTypeRef) -> i32;
            // SAFETY: looks up two names among the libraries the app has loaded; null when one is not there.
            let (connection, set) = unsafe {
                (
                    libc::dlsym(libc::RTLD_DEFAULT, c"_CGSDefaultConnection".as_ptr()),
                    libc::dlsym(libc::RTLD_DEFAULT, c"CGSSetConnectionProperty".as_ptr()),
                )
            };
            if connection.is_null() || set.is_null() {
                return;
            }
            let key = CFString::from_static_string("SetsCursorInBackground");
            // SAFETY: the two routines of the window server's library, called as it declares them, with a string
            // and a boolean that outlive the call.
            unsafe {
                let connection = std::mem::transmute::<*mut libc::c_void, Connection>(connection)();
                let set = std::mem::transmute::<*mut libc::c_void, SetProperty>(set);
                set(connection, connection, key.as_concrete_TypeRef(), CFBoolean::true_value().as_CFTypeRef());
            }
        }

        pub(super) fn hide(app: &AppHandle) {
            if let Some(window) = app.get_webview_window(LABEL)
                && let Err(err) = window.hide()
            {
                eprintln!("FM Lens could not hide the scout card: {err}");
            }
        }

        /// The process of the app in front.
        fn front() -> Option<u32> {
            autoreleasepool(|_| {
                let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
                u32::try_from(app.processIdentifier()).ok()
            })
        }

        /// Whether process `pid` is the app in front.
        pub(super) fn in_front(pid: u32) -> bool {
            front() == Some(pid)
        }

        pub(super) fn pointer() -> Option<(i32, i32)> {
            let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
            let at = CGEvent::new(source).ok()?.location();
            Some((at.x.round() as i32, at.y.round() as i32))
        }

        /// The pointer and the window of the app in front (FM's), now.
        pub(super) fn spot() -> Option<Spot> {
            let at = pointer()?;
            let pid = i64::from(front()?);
            let options = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
            let windows = copy_window_info(options, kCGNullWindowID)?;
            // The first is the one in front; layer 0 holds ordinary windows.
            let game = windows.iter().find_map(|window| {
                // SAFETY: the list holds a dictionary for each window, alive while the list is.
                let window: CFDictionary<CFString, CFType> =
                    unsafe { CFDictionary::wrap_under_get_rule(*window as CFDictionaryRef) };
                let number = |key: CFStringRef| window.find(key)?.downcast::<CFNumber>()?.to_i64();
                // SAFETY: the keys are constants of the system.
                let (owner, layer, bounds) = unsafe { (kCGWindowOwnerPID, kCGWindowLayer, kCGWindowBounds) };
                if number(owner) != Some(pid) || number(layer) != Some(0) {
                    return None;
                }
                CGRect::from_dict_representation(&window.find(bounds)?.downcast::<CFDictionary>()?)
            })?;
            let point = |at: f64| at.round() as i32;
            Some(Spot {
                at,
                game: Rect {
                    left: point(game.origin.x),
                    top: point(game.origin.y),
                    right: point(game.origin.x + game.size.width),
                    bottom: point(game.origin.y + game.size.height),
                },
            })
        }

        pub(super) fn shift_down() -> bool {
            // SAFETY: takes the ID of the keyboard state to read only.
            let flags = unsafe { CGEventSourceFlagsState(CGEventSourceStateID::CombinedSessionState) };
            flags & CGEventFlags::CGEventFlagShift.bits() != 0
        }

        #[link(name = "CoreGraphics", kind = "framework")]
        unsafe extern "C" {
            fn CGEventSourceFlagsState(state: CGEventSourceStateID) -> u64;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::{REACH, Rect, Spot, place, stays};

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

    #[test]
    fn stays_while_the_pointer_is_on_it_or_on_its_way() {
        let card = Rect { left: 684, top: 284, right: 984, bottom: 684 };
        let from = (1000, 300);
        let late = REACH + Duration::from_millis(1);
        assert!(stays(card, from, (700, 500), late));
        assert!(stays(card, from, (992, 296), Duration::ZERO));
        assert!(!stays(card, from, (992, 296), late));
        assert!(!stays(card, from, (1010, 300), Duration::ZERO));
        assert!(!stays(card, from, (984, 500), late));
    }
}
