import { useCallback, useEffect, useState } from "react";
import { call, inTauri } from "./api";
import { ClubBrowser } from "./ClubBrowser";
import { describeGame, formatDate } from "./format";
import { clubListText } from "./labels";
import { PlayerBrowser } from "./PlayerBrowser";
import { StaffBrowser } from "./StaffBrowser";
import type { ConnectionInfo, Detection, ReloadInfo } from "./types";
import "./App.css";

type View = "players" | "staff" | "clubs";

const VIEWS: { id: View; label: string }[] = [
  { id: "players", label: "Players" },
  { id: "staff", label: "Staff" },
  { id: "clubs", label: clubListText.nav },
];

function App() {
  const [detection, setDetection] = useState<Detection | null>(null);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [view, setView] = useState<View>("players");

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
    () => run("Looking for Football Manager…", async () => setDetection(await call<Detection>("detect_game"))),
    [run],
  );

  const connect = () =>
    run("Reading players, staff and clubs…", async () => {
      setConnection(await call<ConnectionInfo>("connect"));
      setDataVersion((v) => v + 1);
    });

  const reload = () =>
    run("Reloading players, staff and clubs…", async () => {
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

  useEffect(() => {
    void detect();
  }, [detect]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">FL</span>
          <div>
            <strong>FMLibreEditor</strong>
            <span>pre-alpha</span>
          </div>
        </div>
        <nav>
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={id === view ? "nav-item active" : "nav-item"}
              aria-current={id === view ? "page" : undefined}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <p className="sidebar-note">Read-only for now: nothing in the game is changed.</p>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className={`status ${connection ? "on" : ""}`}>
            <span className="dot" />
            {connection
              ? [
                  describeGame(connection.game),
                  connection.gameDate && formatDate(connection.gameDate),
                  `${connection.players.toLocaleString()} players`,
                  `${connection.staff.toLocaleString()} staff`,
                  clubListText.count(connection.clubs),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Not connected"}
          </span>
          {!inTauri && <span className="tag">browser preview · sample data</span>}
          <span className="spacer" />
          {busy && <span className="busy">{busy}</span>}
          {connection ? (
            <button onClick={reload} disabled={busy !== null}>
              Reload data
            </button>
          ) : (
            <button onClick={detect} disabled={busy !== null}>
              Refresh
            </button>
          )}
        </header>

        {error && <div className="banner">{error}</div>}

        {connection ? (
          // All the lists stay mounted, so each keeps its search and selection while another is shown.
          <div className="views">
            <PlayerBrowser version={dataVersion} active={view === "players"} />
            <StaffBrowser version={dataVersion} active={view === "staff"} />
            <ClubBrowser version={dataVersion} active={view === "clubs"} />
          </div>
        ) : (
          <ConnectPanel detection={detection} busy={busy !== null} onConnect={connect} />
        )}
      </div>
    </div>
  );
}

function ConnectPanel(props: { detection: Detection | null; busy: boolean; onConnect: () => void }) {
  const { detection, busy, onConnect } = props;
  const game = detection?.games[0];
  const ready = Boolean(game?.info && game.pluginLoaded);

  return (
    <section className="connect">
      <div className="card">
        <h2>Connect to Football Manager 27</h2>
        <p className="muted">
          FMLibreEditor reads the game's memory while it runs. Start the game and load a save, then connect.
        </p>

        {detection && detection.games.length === 0 && <p className="hint">Football Manager 27 is not running.</p>}
        {game && !game.info && <p className="hint error">Could not open the game: {game.error}</p>}
        {game?.info && (
          <dl className="facts">
            <dt>Game</dt>
            <dd>{describeGame(game.info)}</dd>
            <dt>Game data</dt>
            <dd>{game.pluginLoaded ? "Loaded" : "Still loading; wait for the main menu"}</dd>
            <dt>Process</dt>
            <dd>pid {game.info.pid}</dd>
          </dl>
        )}
        {detection && detection.games.length > 1 && (
          <p className="hint">Several copies of the game are running; the first one is used.</p>
        )}

        <button className="primary" onClick={onConnect} disabled={busy || !ready}>
          Connect and read players, staff and clubs
        </button>
      </div>
    </section>
  );
}

export default App;
