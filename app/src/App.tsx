import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { call, inTauri, watchCommands } from "./api";
import { addMenuItems } from "./appMenu";
import { BridgeSetup } from "./BridgeSetup";
import { EmailGate, emailGiven } from "./EmailGate";
import { ChangesView, useChangeLog } from "./ChangesView";
import { CompatibilityNotice } from "./CompatibilityNotice";
import { DropMenu } from "./DropMenu";
import { forgetFieldTables } from "./fieldTables";
import { describeBuild, describeError, formatDate, formatNumber, isFailure } from "./format";
import { FrozenNotice } from "./FrozenNotice";
import { useGraphics } from "./GraphicsStatus";
import { GuidedTour } from "./GuidedTour";
import { isShortcut, MAC, SECTION_SHORTCUTS, shortcutAria, shortcutLabel } from "./keys";
import { ReportDialog, type ReportKind } from "./ReportDialog";
import { Settings } from "./Settings";
import { StarNotice, useStarAsk } from "./StarNotice";
import { SupportDialog, type SupportSource } from "./SupportDialog";
import {
  appText,
  awardListText,
  changesText,
  clubListText,
  competitionListText,
  nationListText,
  officialListText,
  playerListText,
  stadiumListText,
  staffListText,
  supportText,
  updateText,
} from "./labels";
import { PlayerBrowser } from "./PlayerBrowser";
import { restored, useSnapshot } from "./restore";
import { useUpdate } from "./update";
import { UpdateNotice } from "./UpdateNotice";
import { useWhatsNew, WhatsNewNotice } from "./WhatsNew";
import { track, trackOpened } from "./usage";
import type { Reveal } from "./ListBrowser";
import { injuryKinds, massFreeze, standingFields, stands } from "./editing";
import type { BridgeInfo, Career, ConnectionInfo, Detection, FmDate, InjuryKind, Refrozen, ReloadInfo } from "./types";
import lensSymbol from "./assets/brand/fm-lens-symbol-120.png";
import { askToLeave, changesPending, EditorContext, NO_GAME_ACTIONS, StandingFieldsContext } from "./useProfileEditing";
import "./App.css";

const StaffBrowser = lazy(() => import("./StaffBrowser").then((module) => ({ default: module.StaffBrowser })));
const ClubBrowser = lazy(() => import("./ClubBrowser").then((module) => ({ default: module.ClubBrowser })));
const NationBrowser = lazy(() => import("./NationBrowser").then((module) => ({ default: module.NationBrowser })));
const CompetitionBrowser = lazy(() => import("./CompetitionBrowser").then((module) => ({ default: module.CompetitionBrowser })));
const AwardBrowser = lazy(() => import("./AwardBrowser").then((module) => ({ default: module.AwardBrowser })));
const StadiumBrowser = lazy(() => import("./StadiumBrowser").then((module) => ({ default: module.StadiumBrowser })));
const OfficialBrowser = lazy(() => import("./OfficialBrowser").then((module) => ({ default: module.OfficialBrowser })));

type View =
  | "players"
  | "staff"
  | "clubs"
  | "nations"
  | "competitions"
  | "awards"
  | "stadiums"
  | "officials"
  | "changes";

const VIEWS: { id: View; label: string }[] = [
  { id: "players", label: playerListText.nav },
  { id: "staff", label: staffListText.nav },
  { id: "clubs", label: clubListText.nav },
  { id: "nations", label: nationListText.nav },
  { id: "competitions", label: competitionListText.nav },
  { id: "awards", label: awardListText.nav },
  { id: "stadiums", label: stadiumListText.nav },
  { id: "officials", label: officialListText.nav },
  { id: "changes", label: changesText.nav },
];

/** The views of the masthead's Lists menu; the rest are tabs of their own. */
const LISTS: ReadonlySet<View> = new Set(["nations", "competitions", "awards", "stadiums", "officials"]);

/** The view the window was in before the language was switched; the first one when there was no such switch. */
/** How often the app looks at the game: FM may have closed, moved its lists or moved on a day. */
const CHECK_EVERY_MS = 5000;

/** The commands that turn a freeze on or off. */
const FREEZE_COMMANDS: ReadonlySet<string> = new Set([
  "freeze_attributes",
  "freeze_money",
  "freeze_staff_attributes",
]);

const dayKey = ({ year, month, day }: FmDate) => `${year}-${month}-${day}`;

const readView = (value: unknown): View => VIEWS.find(({ id }) => id === value)?.id ?? "players";

/** The app's own football-lens symbol and wordmark. */
function BrandMark() {
  return (
    <h1 className="brand" data-tour="brand" title="FM Lens">
      <img className="brand-symbol" src={lensSymbol} alt="" width="40" height="40" />
      <span className="brand-word">FM Lens</span>
    </h1>
  );
}

/** Load a secondary list on first use, then retain its filters, selection and profile state. */
function DeferredView({ active, label, children }: { active: boolean; label: string; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  // Record the first visit during render so switching away never unmounts the loaded list.
  if (active && !visited) setVisited(true);
  if (!active && !visited) return null;
  return (
    <Suspense fallback={active ? (
      <div className="workspace" role="status" aria-label={label} aria-busy="true">{appText.loadingView}</div>
    ) : null}>
      {children}
    </Suspense>
  );
}

function App() {
  // Asks about the graphics packs, and has pictures asked for too early asked again once they are read.
  useGraphics();
  const [detection, setDetection] = useState<Detection | null>(null);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  // False until the app has asked whether it is connected already (see the effect below): the connect panel would
  // flash up for a moment after the window was reloaded to change the language.
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  // What connecting froze again of what was frozen in the save before, until the notice that says so is dismissed.
  const [refrozen, setRefrozen] = useState<Refrozen | null>(null);
  const [view, setView] = useState<View>(() => restored("view", readView));
  useSnapshot("view", () => view);
  const { log, error: logError, reload: reloadLog } = useChangeLog();
  // The changes of the session that stand, beside Changes.
  const standing = log.filter(stands).length;
  // Their fields, by profile: a profile marks them as applied.
  const standingByProfile = useMemo(() => standingFields(log), [log]);
  const { update, checkNow, relaunch, dismiss: dismissUpdate } = useUpdate();
  const [version, setVersion] = useState<string | null>(null);
  const [debugBuild, setDebugBuild] = useState(false);
  const [reporting, setReporting] = useState<ReportKind | null>(null);
  const [supporting, setSupporting] = useState(false);
  const support = useCallback((from: SupportSource) => {
    track("support_opened", { from });
    setSupporting(true);
  }, []);
  const { whatsNew, dismiss: dismissWhatsNew } = useWhatsNew(version);
  const { asking: askingStar, answer: answerStar } = useStarAsk();
  const [emailAsked, setEmailAsked] = useState(() => !emailGiven());
  useEffect(() => {
    trackOpened();
    // The browser preview stands in for the app with the version in package.json.
    (inTauri ? getVersion() : call<string>("app_version")).then(setVersion).catch(() => {});
    if (inTauri) {
      call<boolean>("debug_build").then(setDebugBuild).catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (inTauri && MAC) {
      // Without it the app menu stays as it was: the checks every four hours carry on.
      addMenuItems({
        check: updateText.checkForUpdates,
        onCheck: () => void checkNow(),
        support: supportText.button,
        onSupport: () => support("menu"),
      }).catch(() => {});
    }
  }, [checkNow, support]);

  const run = useCallback(async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const detect = useCallback(
    () => run(appText.detecting, async () => setDetection(await call<Detection>("detect_game"))),
    [run],
  );

  const connect = () =>
    run(appText.connecting, async () => {
      const { refrozen: again, ...connected } = await call<ConnectionInfo>("connect").catch((e: unknown) => {
        // Only the failure's code, such as `session.noCareer`: its message and parameters can hold paths.
        track("fm_connect_failed", { code: isFailure(e) ? e.code : "unknown" });
        throw e;
      });
      // A new connection lists the changes of the game before, and its field tables may differ.
      forgetFieldTables();
      void reloadLog();
      setConnection(connected);
      setRefrozen(again ?? null);
      track("fm_connected", {
        edition: connected.game.edition,
        storefront: connected.game.storefront,
        fm_build: connected.game.steamBuild ?? connected.game.packageVersion,
        known_build: connected.knownBuild,
        editable: connected.editable,
      });
      setDataVersion((v) => v + 1);
    });

  // The game was read again, by Reload or by the app itself: the lists, the open profile and the log follow.
  const readAgain = useCallback(
    ({ refrozen: again, ...reloaded }: ReloadInfo) => {
      setConnection((c) => c && { ...c, ...reloaded });
      if (again) {
        setRefrozen(again);
      }
      setDataVersion((v) => v + 1);
      void reloadLog();
    },
    [reloadLog],
  );

  const reload = useCallback(
    () =>
      run(appText.reloading, async () => {
        try {
          readAgain(await call<ReloadInfo>("reload"));
        } catch (e) {
          // The Rust side drops the connection when reading fails (e.g. the game was closed).
          setConnection(null);
          void detect();
          throw e;
        }
      }),
    [run, readAgain, detect],
  );

  // To keep what is frozen held, the Rust side reads the game again by itself once FM has moved its lists.
  useEffect(() => {
    if (!inTauri) {
      return;
    }
    let stop: (() => void) | null = null;
    let gone = false;
    listen<ReloadInfo>("game-read-again", (event) => readAgain(event.payload))
      .then((unlisten) => {
        if (gone) {
          unlisten();
        } else {
          stop = unlisten;
        }
      })
      .catch(() => {
        // The next check, or Reload, brings the window up to date instead.
      });
    return () => {
      gone = true;
      stop?.();
    };
  }, [readAgain]);

  // Turning a freeze off leaves the notice of what came back on out of date.
  useEffect(
    () =>
      watchCommands((command, args, result) => {
        if ((FREEZE_COMMANDS.has(command) && args?.frozen === false) || massFreeze(command, result) === false) {
          setRefrozen(null);
        }
      }),
    [],
  );

  // At startup: the Rust side keeps its connection, lists and change log when the window is reloaded (that is how a
  // change of language keeps the connection), so the app first asks for the connection it may have already. With
  // one, it shows the connected app right away, without reading the game again; without one, it looks for the game.
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      let current: ConnectionInfo | null = null;
      try {
        current = await call<ConnectionInfo | null>("current_connection");
      } catch {
        // Not knowing is no reason to stop: looking for the game says what is wrong, if anything is.
      }
      if (cancelled) {
        return;
      }
      if (current) {
        setConnection(current);
        setDataVersion((v) => v + 1);
        void reloadLog();
      } else {
        void detect();
      }
      setChecked(true);
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [detect, reloadLog]);

  // FM may have been closed or restarted meanwhile. Every few seconds, and on coming back to the window, the app
  // checks, and says so and offers to connect again rather than showing a game that has gone. FM may also have moved
  // its lists (on loading a save, and at times as the game goes on), which turns editing off: the app then reads the
  // game again, as Reload does, rather than leaving that to be found at the next Apply. Once the game has moved on a
  // day, the lists and the open profile read it again, unless changes are pending there.
  const attached = connection !== null;
  const idle = busy === null;
  const day = connection?.gameDate ? dayKey(connection.gameDate) : null;
  useEffect(() => {
    if (!attached) {
      return;
    }
    // Reading the game again takes a few seconds and stops editing meanwhile, so the app does it on coming back to
    // the window. While anything is frozen, the Rust side reads it again by itself.
    const check = (focused: boolean) => {
      call<ConnectionInfo | null>("current_connection")
        .then((current) => {
          if (!idle || !current) {
            return;
          }
          if (current.writable && current.knownBuild && !current.editable) {
            if (focused) {
              void reload();
            }
          } else if (current.gameDate && dayKey(current.gameDate) !== day && !changesPending()) {
            setConnection((c) => c && { ...c, gameDate: current.gameDate });
            setDataVersion((v) => v + 1);
          }
        })
        .catch((e: unknown) => {
          setConnection(null);
          // Looking for the game clears the message as it starts, so the message is set after.
          void detect();
          setError(describeError(e));
        });
    };
    const onFocus = () => check(true);
    const timer = window.setInterval(() => check(false), CHECK_EVERY_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [attached, idle, day, detect, reload]);

  // Until connected, the app keeps looking for the game, so starting FM27 or loading a save shows up on its own.
  useEffect(() => {
    if (attached || !checked) {
      return;
    }
    let current = true;
    const look = () => {
      call<Detection>("detect_game")
        .then((found) => current && setDetection(found))
        .catch(() => {
          // The next look tries again; a failure that lasts is shown when Connect is clicked.
        });
    };
    const timer = window.setInterval(look, 3000);
    window.addEventListener("focus", look);
    return () => {
      current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", look);
    };
  }, [attached, checked]);

  // Changes were written or undone: the lists and the open profile read the game again, and so does the log.
  // The lists keep their search, filters, sort and selection when they do.
  const edited = useCallback(() => {
    // Notify FM independently: a screen refresh failure does not mean the successful edit failed.
    void call<void>("refresh_game_ui").catch((e: unknown) => setError(describeError(e)));
    setDataVersion((v) => v + 1);
    void reloadLog();
    // The human manager may have changed clubs. Not knowing leaves the header as it was.
    call<Career | null>("career").then(
      (career) => setConnection((c) => c && { ...c, career }),
      () => {},
    );
  }, [reloadLog]);

  const editable = connection?.editable ?? false;
  // Why nothing can be edited: shown in the colophon (whole in its hover too, should a window be too narrow for it) and
  // as the hover of what that turns off. While editable or not connected (the connect panel says what to do), the
  // colophon shows no note.
  const note =
    !connection || editable
      ? appText.noteEditable
      : connection.writable
        ? connection.knownBuild ? appText.noteReloadRequired : appText.noteUnknownBuild
        : appText.noteReadOnly;
  const gameActions = connection?.gameActions ?? NO_GAME_ACTIONS;
  // The kinds of injury are read once per connection (a reload keeps its actions, and with them the kinds), and read
  // again after a failure.
  const loadInjuryKinds = useMemo(() => {
    let kinds: Promise<InjuryKind[]> | null = null;
    return (): Promise<InjuryKind[]> => {
      kinds ??= injuryKinds().then(
        (list) => [...list].sort((a, b) => a.name.localeCompare(b.name)),
        (e: unknown) => {
          kinds = null;
          throw e;
        },
      );
      return kinds;
    };
  }, [gameActions]);
  const gameDate = connection?.gameDate ?? null;
  // A player asked for from elsewhere (a row of a club's squad): the player list finds him by his ID.
  const [revealPlayer, setRevealPlayer] = useState<Reveal | null>(null);
  const openPlayer = useCallback(
    (uid: number) =>
      askToLeave(() => {
        setView("players");
        setRevealPlayer({ uid, query: String(uid) });
      }),
    [],
  );
  // A member of staff asked for from elsewhere: a row of a club's staff, or your manager from the top bar.
  const [revealStaff, setRevealStaff] = useState<Reveal | null>(null);
  const openStaff = useCallback(
    (uid: number) =>
      askToLeave(() => {
        setView("staff");
        setRevealStaff({ uid, query: String(uid) });
      }),
    [],
  );
  const editor = useMemo(
    () => ({
      editable,
      readOnlyNote: note,
      onEdited: edited,
      gameActions,
      injuryKinds: loadInjuryKinds,
      gameDate,
      openPlayer,
      openStaff,
    }),
    [editable, note, edited, gameActions, loadInjuryKinds, gameDate, openPlayer, openStaff],
  );

  // With edits pending in the open profile, leaving for another view asks first.
  const show = (id: View) => {
    if (id !== view) {
      askToLeave(() => {
        setView(id);
        track("tab_viewed", { tab: id });
      });
    }
  };

  // ⌘1 to ⌘9 open the sections, in the order of the tabs.
  useEffect(() => {
    if (!connection) {
      return;
    }
    const openSection = (event: KeyboardEvent) => {
      const index = SECTION_SHORTCUTS.findIndex((key, i) => i < VIEWS.length && isShortcut(event, key));
      if (index >= 0) {
        event.preventDefault();
        show(VIEWS[index].id);
      }
    };
    window.addEventListener("keydown", openSection);
    return () => window.removeEventListener("keydown", openSection);
  }, [connection, view]);

  // The user's own manager, whose profile holds what only he has (unsackable, registration at any time).
  const openManager = (career: Career) =>
    askToLeave(() => {
      setView("staff");
      setRevealStaff({ uid: career.uid, query: career.manager });
    });
  // The user's own club, which opens on its squad.
  const [revealClub, setRevealClub] = useState<Reveal | null>(null);
  const openClub = ({ club, clubUid }: Career) => {
    if (club !== null && clubUid !== null) {
      askToLeave(() => {
        setView("clubs");
        setRevealClub({ uid: clubUid, query: club });
      });
    }
  };
  const career = connection?.career ?? null;

  // Before anything else, once on each computer. The app is mounted behind it, so it still updates itself.
  if (emailAsked) {
    return (
      <div className="app">
        <header className="masthead">
          <BrandMark />
        </header>
        <EmailGate onGiven={() => setEmailAsked(false)} />
        {/* The menu of the app is there before the email is: what it opens is shown here too. */}
        {supporting && <SupportDialog onClose={() => setSupporting(false)} />}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="masthead">
        <BrandMark />
        {/* The sections only have something to show once connected. */}
        {connection && (
          <nav className="tabs" data-tour="tabs">
            {VIEWS.map(({ id, label }, index) =>
              LISTS.has(id) ? (
                // The lists are one menu, where the first of them would be.
                id === "nations" && (
                  <DropMenu
                    key="lists"
                    label={appText.lists}
                    menuLabel={appText.lists}
                    className={LISTS.has(view) ? "tab active" : "tab"}
                    current={LISTS.has(view)}
                  >
                    {(close) =>
                      VIEWS.map(
                        (list, at) =>
                          LISTS.has(list.id) && (
                            <button
                              key={list.id}
                              type="button"
                              role="menuitemradio"
                              aria-checked={list.id === view}
                              aria-keyshortcuts={shortcutAria(String(at + 1))}
                              tabIndex={-1}
                              onClick={() => {
                                close();
                                show(list.id);
                              }}
                            >
                              {list.label}
                              <kbd>{shortcutLabel(String(at + 1))}</kbd>
                            </button>
                          ),
                      )
                    }
                  </DropMenu>
                )
              ) : (
                <button
                  key={id}
                  type="button"
                  className={id === view ? "tab active" : "tab"}
                  aria-current={id === view ? "page" : undefined}
                  title={shortcutLabel(String(index + 1))}
                  aria-keyshortcuts={shortcutAria(String(index + 1))}
                  data-tour={id === "changes" ? "changes" : undefined}
                  onClick={() => show(id)}
                >
                  {label}
                  {id === "changes" && standing > 0 && <span className="tab-count">{formatNumber(standing)}</span>}
                </button>
              ),
            )}
          </nav>
        )}
        <div className="masthead-side">
          <span className="busy live-region" role="status">
            {busy}
          </span>
          {/* Which career is connected, as FM names a save by default: the manager and his club. */}
          {career && (
            <span className="career">
              <button type="button" className="career-manager" onClick={() => openManager(career)}>
                {career.manager}
              </button>
              {career.club !== null && career.clubUid !== null && (
                <>
                  <span className="career-dot" aria-hidden="true">
                    ·
                  </span>
                  <button type="button" className="career-club" onClick={() => openClub(career)}>
                    {career.club}
                  </button>
                </>
              )}
            </span>
          )}
          {connection &&
            (connection.gameDate ? (
              <span className="game-date">{formatDate(connection.gameDate)}</span>
            ) : (
              <span className="game-date missing" title={appText.noDateTitle}>
                {appText.noDate}
              </span>
            ))}
          {connection && (
            <button onClick={reload} disabled={busy !== null}>
              {appText.reload}
            </button>
          )}
          <span data-tour="settings">
            <Settings
              busy={busy !== null}
              onCheckForUpdates={inTauri && !MAC ? () => void checkNow() : undefined}
              onSupport={() => support("settings")}
              details={[
                `FM Lens${version ? ` ${version}` : ""}`,
                connection
                  ? describeBuild(connection.game)
                  : detection?.games[0]?.info && describeBuild(detection.games[0].info),
              ]
                .filter(Boolean)
                .map((line) => (
                  <p key={line}>{line}</p>
                ))}
            />
          </span>
        </div>
      </header>

      <main className="main">
        {/* The notices share one live region that is always there, so that each is read out when it appears, alone. */}
        <div className="live-region" role="status" aria-atomic="false">
          {update && update.phase !== "ready" && <UpdateNotice update={update} onDismiss={dismissUpdate} />}
          {whatsNew && <WhatsNewNotice version={whatsNew} onDismiss={dismissWhatsNew} />}
          {askingStar && <StarNotice onAnswer={answerStar} />}
          {connection && <CompatibilityNotice connection={connection} />}
          {connection && refrozen && <FrozenNotice refrozen={refrozen} onDismiss={() => setRefrozen(null)} />}
        </div>
        {error && <div className="banner" role="alert">{error}</div>}

        {connection ? (
          // Visited lists stay mounted, so each keeps its search and selection while another is shown.
          <EditorContext.Provider value={editor}>
            <StandingFieldsContext.Provider value={standingByProfile}>
            <div className="views">
              <PlayerBrowser version={dataVersion} active={view === "players"} reveal={revealPlayer} />
              <DeferredView active={view === "staff"} label={staffListText.nav}>
                <StaffBrowser version={dataVersion} active={view === "staff"} reveal={revealStaff} />
              </DeferredView>
              <DeferredView active={view === "clubs"} label={clubListText.nav}>
                <ClubBrowser version={dataVersion} active={view === "clubs"} reveal={revealClub} />
              </DeferredView>
              <DeferredView active={view === "nations"} label={nationListText.nav}>
                <NationBrowser version={dataVersion} active={view === "nations"} />
              </DeferredView>
              <DeferredView active={view === "competitions"} label={competitionListText.nav}>
                <CompetitionBrowser version={dataVersion} active={view === "competitions"} />
              </DeferredView>
              <DeferredView active={view === "awards"} label={awardListText.nav}>
                <AwardBrowser version={dataVersion} active={view === "awards"} />
              </DeferredView>
              <DeferredView active={view === "stadiums"} label={stadiumListText.nav}>
                <StadiumBrowser version={dataVersion} active={view === "stadiums"} />
              </DeferredView>
              <DeferredView active={view === "officials"} label={officialListText.nav}>
                <OfficialBrowser version={dataVersion} active={view === "officials"} />
              </DeferredView>
              {view === "changes" && <ChangesView log={log} error={logError} reload={reloadLog} onUndone={edited} />}
            </div>
            </StandingFieldsContext.Provider>
          </EditorContext.Provider>
        ) : (
          checked && (
            <ConnectPanel
              detection={detection}
              busy={busy !== null}
              onConnect={connect}
              onBridge={(bridge) => setDetection((d) => d && { ...d, bridge })}
            />
          )
        )}
      </main>

      <footer className="colophon">
        <div className="colophon-main">
          <span className="colophon-name">
            FM Lens{version && <span className="colophon-version"> {version}</span>}
          </span>
          {debugBuild && <span className="tag">{appText.debugTag}</span>}
          <span className={`status ${connection ? "on" : ""}`} data-tour="status">
            <span className="dot" />
            <span className="status-text">
              {connection ? appText.connected : appText.notConnected}
            </span>
          </span>
          {!inTauri && <span className="tag">{appText.previewTag}</span>}
          <button type="button" className="colophon-report" onClick={() => setReporting("problem")}>
            {appText.reportProblem}
          </button>
          <button type="button" className="colophon-wishlist" onClick={() => setReporting("wish")}>
            {appText.wishlist}
          </button>
          <button type="button" className="colophon-support" onClick={() => support("footer")}>
            {supportText.button}
          </button>
          {supporting && <SupportDialog onClose={() => setSupporting(false)} />}
          {reporting && (
            <ReportDialog
              kind={reporting}
              facts={{ version, connection, detected: detection?.games[0]?.info ?? null, log }}
              onClose={() => setReporting(null)}
            />
          )}
          {update?.phase === "ready" ? (
            <button type="button" className="relaunch" onClick={() => relaunch(update.version)}>
              {updateText.relaunch}
            </button>
          ) : (
            <button
              type="button"
              className="colophon-update"
              disabled={update?.phase === "checking"}
              onClick={() => void checkNow()}
            >
              {updateText.check}
            </button>
          )}
        </div>
        {connection && !editable && (
          <div className="colophon-notes">
            <p className="sidebar-note" title={note}>
              {note}
            </p>
          </div>
        )}
      </footer>
      <GuidedTour ready={checked} connected={connection !== null} editable={editable} />
    </div>
  );
}

function ConnectPanel(props: {
  detection: Detection | null;
  busy: boolean;
  onConnect: () => void;
  onBridge: (bridge: BridgeInfo) => void;
}) {
  const { detection, busy, onConnect, onBridge } = props;
  const game = detection?.games[0];
  // macOS: the bridge comes first while it is not set up, as nothing connects without it.
  const bridge = detection?.bridge;
  const bridgeSetup = bridge && <BridgeSetup bridge={bridge} busy={busy} onChange={onBridge} />;
  const ready = Boolean(game?.info && game.pluginLoaded);
  const text = appText.connect;

  return (
    <section className="connect">
      <div className="card">
        <h2>{text.title}</h2>
        <p className="muted">{text.intro}</p>
        {bridge && !bridge.ready && bridgeSetup}

        {detection && detection.games.length === 0 && <p className="hint">{text.notRunning}</p>}
        {game && !game.info && <p className="hint error">{text.openFailed(describeError(game.error))}</p>}
        {/* Once the game is ready, the enabled Connect button says so; its version is under App details in Settings. */}
        {game?.info && !game.pluginLoaded && <p className="hint">{text.stillLoading}</p>}
        {detection && detection.games.length > 1 && <p className="hint">{text.several}</p>}

        <button className="primary" onClick={onConnect} disabled={busy || !ready}>
          {text.button}
        </button>
        {bridge?.ready && bridgeSetup}
      </div>
    </section>
  );
}

export default App;
