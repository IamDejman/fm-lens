import { useCallback, useEffect, useMemo, useState } from "react";
import { call, inTauri } from "./api";
import { ChangesView, useChangeLog } from "./ChangesView";
import { ClubBrowser } from "./ClubBrowser";
import { forgetFieldTables } from "./fieldTables";
import { describeGame, formatDate } from "./format";
import { LanguageSwitch } from "./LanguageSwitch";
import { appText, changesText, clubListText, playerListText, staffListText } from "./labels";
import { PlayerBrowser } from "./PlayerBrowser";
import { StaffBrowser } from "./StaffBrowser";
import type { ConnectionInfo, Detection, ReloadInfo } from "./types";
import { askToLeave, EditorContext } from "./useProfileEditing";
import "./App.css";

type View = "players" | "staff" | "clubs" | "changes";

const VIEWS: { id: View; label: string }[] = [
  { id: "players", label: playerListText.nav },
  { id: "staff", label: staffListText.nav },
  { id: "clubs", label: clubListText.nav },
  { id: "changes", label: changesText.nav },
];

function App() {
  const [detection, setDetection] = useState<Detection | null>(null);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  // False until the app has asked whether it is connected already (see the effect below): the connect panel would
  // flash up for a moment after the window was reloaded to change the language.
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [view, setView] = useState<View>("players");
  const { log, error: logError, reload: reloadLog, clear: clearLog } = useChangeLog();

  const run = useCallback(async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(String(e));
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
      const connected = await call<ConnectionInfo>("connect");
      // A new connection has an empty change log, and its field tables may differ.
      forgetFieldTables();
      clearLog();
      setConnection(connected);
      setDataVersion((v) => v + 1);
    });

  const reload = () =>
    run(appText.reloading, async () => {
      try {
        const reloaded = await call<ReloadInfo>("reload");
        setConnection((c) => c && { ...c, ...reloaded });
        setDataVersion((v) => v + 1);
      } catch (e) {
        // The Rust side drops the connection when reading fails (e.g. the game was closed).
        setConnection(null);
        void detect();
        throw e;
      }
    });

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

  // Changes were written or undone: the lists and the open profile read the game again, and so does the log.
  // The lists keep their search, filters, sort and selection when they do.
  const edited = useCallback(() => {
    setDataVersion((v) => v + 1);
    void reloadLog();
  }, [reloadLog]);

  const editable = connection?.editable ?? false;
  const editor = useMemo(() => ({ editable, onEdited: edited }), [editable, edited]);

  // With edits pending in the open profile, leaving for another view asks first.
  const show = (id: View) => {
    if (id !== view) {
      askToLeave(() => setView(id));
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">FL</span>
          <div>
            <strong>FMLibreEditor</strong>
            <span>{appText.stage}</span>
          </div>
        </div>
        <nav>
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={id === view ? "nav-item active" : "nav-item"}
              aria-current={id === view ? "page" : undefined}
              onClick={() => show(id)}
            >
              {label}
              {id === "changes" && log.length > 0 && <small>{log.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p className="sidebar-note">
            {connection ? (editable ? appText.noteEditable : appText.noteReadOnly) : appText.noteNotConnected}
          </p>
          <LanguageSwitch busy={busy !== null} />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className={`status ${connection ? "on" : ""}`}>
            <span className="dot" />
            {connection
              ? [
                  describeGame(connection.game),
                  connection.gameDate && formatDate(connection.gameDate),
                  playerListText.count(connection.players),
                  staffListText.count(connection.staff),
                  clubListText.count(connection.clubs),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : appText.notConnected}
          </span>
          {!inTauri && <span className="tag">{appText.previewTag}</span>}
          <span className="spacer" />
          {busy && <span className="busy">{busy}</span>}
          {connection ? (
            <button onClick={reload} disabled={busy !== null}>
              {appText.reload}
            </button>
          ) : (
            <button onClick={detect} disabled={busy !== null}>
              {appText.refresh}
            </button>
          )}
        </header>

        {error && <div className="banner">{error}</div>}

        {connection ? (
          // All the lists stay mounted, so each keeps its search and selection while another is shown.
          <EditorContext.Provider value={editor}>
            <div className="views">
              <PlayerBrowser version={dataVersion} active={view === "players"} />
              <StaffBrowser version={dataVersion} active={view === "staff"} />
              <ClubBrowser version={dataVersion} active={view === "clubs"} />
              {view === "changes" && <ChangesView log={log} error={logError} reload={reloadLog} onUndone={edited} />}
            </div>
          </EditorContext.Provider>
        ) : (
          checked && <ConnectPanel detection={detection} busy={busy !== null} onConnect={connect} />
        )}
      </div>
    </div>
  );
}

function ConnectPanel(props: { detection: Detection | null; busy: boolean; onConnect: () => void }) {
  const { detection, busy, onConnect } = props;
  const game = detection?.games[0];
  const ready = Boolean(game?.info && game.pluginLoaded);
  const text = appText.connect;

  return (
    <section className="connect">
      <div className="card">
        <h2>{text.title}</h2>
        <p className="muted">{text.intro}</p>

        {detection && detection.games.length === 0 && <p className="hint">{text.notRunning}</p>}
        {game && !game.info && <p className="hint error">{text.openFailed(game.error ?? "")}</p>}
        {game?.info && (
          <dl className="facts">
            <dt>{text.game}</dt>
            <dd>{describeGame(game.info)}</dd>
            <dt>{text.gameData}</dt>
            <dd>{game.pluginLoaded ? text.loaded : text.stillLoading}</dd>
            <dt>{text.process}</dt>
            <dd>{text.pid(game.info.pid)}</dd>
          </dl>
        )}
        {detection && detection.games.length > 1 && <p className="hint">{text.several}</p>}

        <button className="primary" onClick={onConnect} disabled={busy || !ready}>
          {text.button}
        </button>
      </div>
    </section>
  );
}

export default App;
