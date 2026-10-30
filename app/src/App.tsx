import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { call, inTauri } from "./api";
import { describeGame, formatDate } from "./format";
import type { ConnectionInfo, Detection, PlayerPage } from "./types";
import "./App.css";

/** Rows shown at once; the best players by current ability come first. */
const ROW_LIMIT = 200;

function App() {
  const [detection, setDetection] = useState<Detection | null>(null);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

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
    run("Reading players…", async () => {
      setConnection(await call<ConnectionInfo>("connect"));
      setDataVersion((v) => v + 1);
    });

  const reload = () =>
    run("Reloading players…", async () => {
      try {
        await call<number>("reload_players");
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
          <a className="active">Players</a>
          <a className="disabled" aria-disabled="true">
            Staff <small>soon</small>
          </a>
          <a className="disabled" aria-disabled="true">
            Clubs <small>soon</small>
          </a>
        </nav>
        <p className="sidebar-note">Read-only for now: nothing in the game is changed.</p>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className={`status ${connection ? "on" : ""}`}>
            <span className="dot" />
            {connection
              ? `${describeGame(connection.game)} · ${connection.players.toLocaleString()} players`
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
          <PlayerBrowser version={dataVersion} />
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
          Connect and read players
        </button>
      </div>
    </section>
  );
}

function PlayerBrowser({ version }: { version: number }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<PlayerPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        try {
          const result = await call<PlayerPage>("search_players", { query, limit: ROW_LIMIT });
          if (!cancelled) {
            setPage(result);
            setError(null);
          }
        } catch (e) {
          if (!cancelled) {
            setError(String(e));
          }
        }
      },
      query ? 150 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, version]);

  const summary = page
    ? page.total > page.rows.length
      ? `${page.total.toLocaleString()} players · showing the top ${page.rows.length} by current ability`
      : `${page.total.toLocaleString()} players`
    : "";

  return (
    <section className="players">
      <div className="toolbar">
        <label className="search">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4.5 4.5" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search players by name or UID"
            spellCheck={false}
          />
        </label>
        <span className="count">{summary}</span>
      </div>
      {error && <div className="banner">{error}</div>}

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Nation</th>
              <th>Club</th>
              <th>Born</th>
              <th className="num">CA</th>
              <th className="num">PA</th>
              <th className="num">UID</th>
            </tr>
          </thead>
          <tbody>
            {page?.rows.map((p) => (
              <tr key={p.uid}>
                <td>
                  <div className="name">{p.name}</div>
                  {p.fullName && p.fullName !== p.name && <div className="sub">{p.fullName}</div>}
                </td>
                <td>{p.nation ?? "—"}</td>
                <td>{p.club ?? <span className="muted">Free agent</span>}</td>
                <td className="date">{formatDate(p.dateOfBirth)}</td>
                <td className="num">
                  <Ability value={p.currentAbility} />
                </td>
                <td className="num">
                  <Ability value={p.potentialAbility} />
                </td>
                <td className="num uid">{p.uid}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {page && page.rows.length === 0 && <p className="empty">No players match “{query}”.</p>}
      </div>
    </section>
  );
}

/** Current or potential ability (1–200) with a bar; negative potentials are ranges. */
function Ability({ value }: { value: number }) {
  if (value < 0) {
    return (
      <span className="ability range" title="Potential set as a range">
        {value}
      </span>
    );
  }
  const style = { "--fill": `${Math.min(100, value / 2)}%` } as CSSProperties;
  return (
    <span className="ability" style={style}>
      {value}
    </span>
  );
}

export default App;
