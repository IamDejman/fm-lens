import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { call, inTauri } from "./api";
import { addCheckForUpdates } from "./appMenu";
import { BridgeSetup } from "./BridgeSetup";
import { ChangesView, useChangeLog } from "./ChangesView";
import { ClubBrowser } from "./ClubBrowser";
import { CompatibilityNotice } from "./CompatibilityNotice";
import { forgetFieldTables } from "./fieldTables";
import { describeBuild, describeError, formatDate } from "./format";
import { FrozenNotice } from "./FrozenNotice";
import { useGraphics } from "./GraphicsStatus";
import { GuidedTour } from "./GuidedTour";
import { isShortcut, MAC, shortcutAria, shortcutLabel } from "./keys";
import { ReportDialog } from "./ReportDialog";
import { SettingsMenu } from "./SettingsMenu";
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
  updateText,
} from "./labels";
import { NationBrowser } from "./NationBrowser";
import { OfficialBrowser } from "./OfficialBrowser";
import { AwardBrowser } from "./AwardBrowser";
import { CompetitionBrowser } from "./CompetitionBrowser";
import { StadiumBrowser } from "./StadiumBrowser";
import { PlayerBrowser } from "./PlayerBrowser";
import { restored, useSnapshot } from "./restore";
import { StaffBrowser } from "./StaffBrowser";
import { useUpdate } from "./update";
import { UpdateNotice } from "./UpdateNotice";
import { useWhatsNew, WhatsNewNotice } from "./WhatsNew";
import type { Reveal } from "./ListBrowser";
import { injuryKinds } from "./editing";
import type { BridgeInfo, Career, ConnectionInfo, Detection, InjuryKind, Refrozen, ReloadInfo } from "./types";
import lensSymbol from "./assets/brand/fm-lens-symbol.png";
import { askToLeave, EditorContext, NO_GAME_ACTIONS } from "./useProfileEditing";
import "./App.css";

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

/** The view the window was in before the language was switched; the first one when there was no such switch. */
const readView = (value: unknown): View => VIEWS.find(({ id }) => id === value)?.id ?? "players";

/** The app's own football-lens symbol and wordmark. */
function BrandMark() {
  return (
    <span className="brand" data-tour="brand" title="FM Lens">
      <img className="brand-symbol" src={lensSymbol} alt="" width="40" height="40" />
      <span className="brand-word">FM Lens</span>
    </span>
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
  const { update, checkNow, relaunch, dismiss: dismissUpdate } = useUpdate();
  const [version, setVersion] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const { whatsNew, dismiss: dismissWhatsNew } = useWhatsNew(version);
  useEffect(() => {
    // The browser preview stands in for the app with the version in package.json.
    (inTauri ? getVersion() : call<string>("app_version")).then(setVersion).catch(() => {});
  }, []);
  useEffect(() => {
    if (inTauri && MAC) {
      // Without it the app menu stays as it was: the checks every four hours carry on.
      addCheckForUpdates(updateText.checkForUpdates, () => void checkNow()).catch(() => {});
    }
  }, [checkNow]);

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
      const { refrozen: again, ...connected } = await call<ConnectionInfo>("connect");
      // A new connection lists the changes of the game before, and its field tables may differ.
      forgetFieldTables();
      void reloadLog();
      setConnection(connected);
      setRefrozen(again ?? null);
      setDataVersion((v) => v + 1);
    });

  const reload = useCallback(
    () =>
      run(appText.reloading, async () => {
        try {
          const { refrozen: again, ...reloaded } = await call<ReloadInfo>("reload");
          setConnection((c) => c && { ...c, ...reloaded });
          if (again) {
            setRefrozen(again);
          }
          setDataVersion((v) => v + 1);
          void reloadLog();
        } catch (e) {
          // The Rust side drops the connection when reading fails (e.g. the game was closed).
          setConnection(null);
          void detect();
          throw e;
        }
      }),
    [run, reloadLog, detect],
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

  // FM may have been closed or restarted while the app was in the background. On coming back, the app checks, and
  // says so and offers to connect again rather than showing a game that has gone. FM may also have moved its lists (on
  // loading a save, and at times as the game goes on), which turns editing off: the app then reads the game again, as
  // Reload does, rather than leaving that to be found at the next Apply.
  const attached = connection !== null;
  const idle = busy === null;
  useEffect(() => {
    if (!attached) {
      return;
    }
    const check = () => {
      call<ConnectionInfo | null>("current_connection")
        .then((current) => {
          if (idle && current?.writable && current.knownBuild && !current.editable) {
            void reload();
          }
        })
        .catch((e: unknown) => {
          setConnection(null);
          // Looking for the game clears the message as it starts, so the message is set after.
          void detect();
          setError(describeError(e));
        });
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [attached, idle, detect, reload]);

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
  const editor = useMemo(
    () => ({ editable, readOnlyNote: note, onEdited: edited, gameActions, injuryKinds: loadInjuryKinds, gameDate }),
    [editable, note, edited, gameActions, loadInjuryKinds, gameDate],
  );

  // With edits pending in the open profile, leaving for another view asks first.
  const show = (id: View) => {
    if (id !== view) {
      askToLeave(() => setView(id));
    }
  };

  // ⌘1 to ⌘9 open the sections, in the order of the tabs.
  useEffect(() => {
    if (!connection) {
      return;
    }
    const openSection = (event: KeyboardEvent) => {
      const index = VIEWS.findIndex((_, i) => isShortcut(event, String(i + 1)));
      if (index >= 0) {
        event.preventDefault();
        show(VIEWS[index].id);
      }
    };
    window.addEventListener("keydown", openSection);
    return () => window.removeEventListener("keydown", openSection);
  }, [connection, view]);

  // The user's own manager, whose profile holds what only he has (unsackable, registration at any time).
  const [revealStaff, setRevealStaff] = useState<Reveal | null>(null);
  const openManager = (career: Career) =>
    askToLeave(() => {
      setView("staff");
      setRevealStaff({ uid: career.uid, query: career.manager });
    });

  return (
    <div className="app">
      <header className="masthead">
        <BrandMark />
        {/* The sections only have something to show once connected. */}
        {connection && (
          <nav className="tabs" data-tour="tabs">
            {VIEWS.map(({ id, label }, index) => (
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
              </button>
            ))}
          </nav>
        )}
        <div className="masthead-side">
          {busy && <span className="busy">{busy}</span>}
          {/* Which career is connected, as FM names a save by default: the manager and his club. */}
          {connection?.career && (
            <button type="button" className="career" onClick={() => connection.career && openManager(connection.career)}>
              {[connection.career.manager, connection.career.club].filter(Boolean).join(" · ")}
            </button>
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
            <SettingsMenu
              busy={busy !== null}
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

      <div className="main">
        {update && update.phase !== "ready" && <UpdateNotice update={update} onDismiss={dismissUpdate} />}
        {whatsNew && <WhatsNewNotice version={whatsNew} onDismiss={dismissWhatsNew} />}
        {connection && <CompatibilityNotice connection={connection} />}
        {connection && refrozen && <FrozenNotice refrozen={refrozen} onDismiss={() => setRefrozen(null)} />}
        {error && <div className="banner" role="alert">{error}</div>}

        {connection ? (
          // All the lists stay mounted, so each keeps its search and selection while another is shown.
          <EditorContext.Provider value={editor}>
            <div className="views">
              <PlayerBrowser version={dataVersion} active={view === "players"} />
              <StaffBrowser version={dataVersion} active={view === "staff"} reveal={revealStaff} />
              <ClubBrowser version={dataVersion} active={view === "clubs"} />
              <NationBrowser version={dataVersion} active={view === "nations"} />
              <CompetitionBrowser version={dataVersion} active={view === "competitions"} />
              <AwardBrowser version={dataVersion} active={view === "awards"} />
              <StadiumBrowser version={dataVersion} active={view === "stadiums"} />
              <OfficialBrowser version={dataVersion} active={view === "officials"} />
              {view === "changes" && <ChangesView log={log} error={logError} reload={reloadLog} onUndone={edited} />}
            </div>
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
      </div>

      <footer className="colophon">
        <div className="colophon-main">
          <span className="colophon-name">
            FM Lens{version && <span className="colophon-version"> {version}</span>}
          </span>
          <span className={`status ${connection ? "on" : ""}`} data-tour="status">
            <span className="dot" />
            <span className="status-text">
              {connection ? appText.connected : appText.notConnected}
            </span>
          </span>
          {!inTauri && <span className="tag">{appText.previewTag}</span>}
          <button type="button" className="colophon-report" onClick={() => setReporting(true)}>
            {appText.reportProblem}
          </button>
          {reporting && (
            <ReportDialog
              facts={{ version, connection, detected: detection?.games[0]?.info ?? null, log }}
              onClose={() => setReporting(false)}
            />
          )}
          {update?.phase === "ready" && (
            <button type="button" className="relaunch" onClick={() => relaunch(update.version)}>
              {updateText.relaunch}
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
