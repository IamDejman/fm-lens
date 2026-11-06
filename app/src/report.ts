// A problem report: GitHub's form for a bug report (.github/ISSUE_TEMPLATE/bug_report.yml), opened in the browser with
// what FM Lens knows filled in. The user reads it and submits it there; the app sends nothing itself. The facts are
// written in English, as the form is.

import { openUrl } from "@tauri-apps/plugin-opener";
import { call, inTauri } from "./api";
import type { ConnectionInfo, GameInfo, LoggedChange, Storefront } from "./types";

/** The form's address (see capabilities/default.json, which lets the app open it). */
const NEW_ISSUE = "https://github.com/IamDejman/fm-lens/issues/new";

/** The longest address the report makes: GitHub turns away much longer ones, so the oldest changes are left out. */
const MAX_LENGTH = 7000;

const STOREFRONTS: Record<Storefront, string> = { steam: "Steam", gamePass: "Game Pass", epic: "Epic", unknown: "Unknown" };

export interface ReportFacts {
  /** FM Lens's version; null in the browser preview. */
  version: string | null;
  connection: ConnectionInfo | null;
  /** The game found running, when not connected. */
  detected: GameInfo | null;
  /** The changes written while FM Lens has been open, newest first (see `change_log`). */
  log: LoggedChange[];
}

/** "FM27 Steam 26340721, editing on" */
function describeGame({ connection, detected }: ReportFacts): string {
  const game = connection?.game ?? detected;
  const build = game
    ? [game.edition ? `FM${game.edition}` : "FM", STOREFRONTS[game.storefront], game.steamBuild ?? game.packageVersion]
        .filter(Boolean)
        .join(" ")
    : null;
  const state = !connection
    ? "not connected"
    : connection.editable
      ? "editing on"
      : connection.knownBuild
        ? "read-only"
        : "read-only, unsupported build";
  return build ? `${build}, ${state}` : state;
}

/** "Erling Haaland (player 7458500): ability.potential 195 → 200, undone" */
function describeChange(change: LoggedChange): string {
  const notes = [
    change.undoneAt !== null && "undone",
    change.earlierGame && "earlier game",
    change.permanent && "cannot be undone",
  ].filter(Boolean);
  const line = `${change.name} (${change.entity} ${change.uid}): ${change.field} ${change.old} → ${change.new}`;
  return notes.length > 0 ? `${line}, ${notes.join(", ")}` : line;
}

/**
 * The address of the form with `facts` and `system` filled in. As many changes as fit go in, newest first, and a last
 * line says how many older ones were left out.
 */
export function reportUrl(facts: ReportFacts, system: string): string {
  const url = new URL(NEW_ISSUE);
  url.searchParams.set("template", "bug_report.yml");
  url.searchParams.set("version", facts.version ?? "-");
  url.searchParams.set("fm-build", describeGame(facts));
  url.searchParams.set("macos", system);
  if (facts.log.length === 0) {
    return url.toString();
  }

  // Room for the changes, less what the parameter's name and the last line take.
  let room = MAX_LENGTH - url.toString().length - "&changes=".length - 120;
  const lines: string[] = [];
  for (const change of facts.log) {
    const line = describeChange(change);
    // Its length in the address, or a little more: the address writes a space as "+", not "%20".
    const length = encodeURIComponent(`${line}\n`).length;
    if (length > room) {
      break;
    }
    lines.push(line);
    room -= length;
  }
  const left = facts.log.length - lines.length;
  if (left > 0) {
    lines.push(`... and ${left} older ${left === 1 ? "change" : "changes"}`);
  }
  url.searchParams.set("changes", lines.join("\n"));
  return url.toString();
}

/** The system FM Lens runs on (see `system_version`): "macOS 27.2, Apple Silicon"; a hyphen when it cannot tell. */
async function systemVersion(): Promise<string> {
  try {
    return await call<string>("system_version");
  } catch {
    return "-";
  }
}

/** Opens the form in the browser; the browser preview opens it in a new tab. Fails when the browser cannot be opened. */
export async function openReport(facts: ReportFacts): Promise<void> {
  const url = reportUrl(facts, await systemVersion());
  if (inTauri) {
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
