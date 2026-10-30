import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type Storefront = "gamePass" | "steam" | "epic" | "unknown";

interface GameInfo {
  pid: number;
  exePath: string;
  storefront: Storefront;
  edition: number | null;
  packageFullName: string | null;
  packageVersion: string | null;
}

interface DetectedGame {
  pid: number;
  info: GameInfo | null;
  pluginLoaded: boolean;
  error: string | null;
}

interface Detection {
  elevated: boolean;
  games: DetectedGame[];
}

const STOREFRONTS: Record<Storefront, string> = {
  gamePass: "Game Pass / Microsoft Store",
  steam: "Steam",
  epic: "Epic Games Store",
  unknown: "Unknown",
};

function App() {
  const [detection, setDetection] = useState<Detection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setDetection(await invoke<Detection>("detect_game"));
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="shell">
      <header className="topbar">
        <h1>FMLibreEditor</h1>
        <span className="tag">pre-alpha</span>
        <button onClick={refresh} disabled={busy}>
          {busy ? "Checking…" : "Refresh"}
        </button>
      </header>

      <section className="panel">
        <h2>Game connection</h2>
        {error && <p className="error">{error}</p>}
        {detection?.games.length === 0 && (
          <p className="muted">Football Manager 27 is not running. Start it, load a save and press Refresh.</p>
        )}
        {detection?.games.map((game) => <GameCard key={game.pid} game={game} />)}
        {detection && !detection.elevated && (
          <p className="muted small">Running without administrator rights.</p>
        )}
      </section>
    </main>
  );
}

function GameCard({ game }: { game: DetectedGame }) {
  if (!game.info) {
    return (
      <div className="card bad">
        <strong>fm.exe (pid {game.pid}) could not be opened</strong>
        <p>{game.error}</p>
      </div>
    );
  }
  const { info } = game;
  return (
    <div className="card good">
      <dl>
        <dt>Edition</dt>
        <dd>{info.edition ? `FM${info.edition}` : "Unknown"}</dd>
        <dt>Storefront</dt>
        <dd>{STOREFRONTS[info.storefront]}</dd>
        {info.packageVersion && (
          <>
            <dt>Version</dt>
            <dd>{info.packageVersion}</dd>
          </>
        )}
        <dt>Game core</dt>
        <dd>{game.pluginLoaded ? "game_plugin.dll loaded" : "Not loaded yet"}</dd>
        <dt>Process</dt>
        <dd>pid {info.pid}</dd>
      </dl>
    </div>
  );
}

export default App;
