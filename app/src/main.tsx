// First: settings saved under earlier names move before any module reads them.
import "./migrateStorage";
import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import ReactDOM from "react-dom/client";
// Archivo, with its width axis: the app's one typeface, bundled so Windows and macOS read alike (SIL OFL 1.1).
import "@fontsource-variable/archivo/wdth.css";
import { inTauri } from "./api";
import "./appearance";

// The in-game scout card has a window of its own (see scout_card.rs), which loads only the card.
const card = inTauri && getCurrentWindow().label === "card";

async function start() {
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  if (card) {
    document.documentElement.classList.add("card-window");
    const { ScoutCard } = await import("./ScoutCard");
    root.render(
      <React.StrictMode>
        <ScoutCard />
      </React.StrictMode>,
    );
    return;
  }
  const [{ default: App }, { applyScoutCard }] = await Promise.all([import("./App"), import("./scoutCardSetting")]);
  applyScoutCard();
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

start().catch((error: unknown) => console.error("FM Lens could not start:", error));
