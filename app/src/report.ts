// A problem report: what the user writes in Report a problem, sent with what FM Lens knows (its version, the FM build,
// the Mac and the changes written while it has been open) to the report relay (relay/), which files it as an issue in
// the fm-lens repository. Nothing leaves the app until the user presses Send. The facts are written in English, as the
// issues are.

import { call, inTauri } from "./api";
import type { ConnectionInfo, GameInfo, LoggedChange, Storefront } from "./types";

/** The report relay's address (see docs/DEVELOPING.md, The report relay). */
const RELAY = "https://5om2ly4fvanjhg425jlb7s26dm0etzak.lambda-url.us-east-1.on.aws/report";

/** The most the relay takes for the changes, in characters: the oldest are left out past it. */
const MAX_CHANGES = 8000;

/** How long sending may take, in milliseconds. */
const SEND_TIMEOUT_MS = 20_000;

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

/** The changes, newest first, as many as the relay takes; a last line says how many older ones were left out. */
function describeChanges(log: LoggedChange[]): string {
  // Room for the changes, less what the last line takes.
  let room = MAX_CHANGES - 40;
  const lines: string[] = [];
  for (const change of log) {
    const line = describeChange(change);
    if (line.length + 1 > room) {
      break;
    }
    lines.push(line);
    room -= line.length + 1;
  }
  const left = log.length - lines.length;
  if (left > 0) {
    lines.push(`... and ${left} older ${left === 1 ? "change" : "changes"}`);
  }
  return lines.join("\n");
}

/** The system FM Lens runs on (see `system_version`): "macOS 27.2, Apple Silicon"; a hyphen when it cannot tell. */
async function systemVersion(): Promise<string> {
  try {
    return await call<string>("system_version");
  } catch {
    return "-";
  }
}

/** How sending went: sent, turned away for now (too many reports from this address), or not sent. */
export type SendResult = "sent" | "tooMany" | "failed";

/** Sends `what` with `facts` to the relay. The browser preview sends nothing and says it was sent. */
export async function sendReport(facts: ReportFacts, what: string): Promise<SendResult> {
  if (!inTauri) {
    return "sent";
  }
  const report = {
    what,
    version: facts.version ?? "",
    fmBuild: describeGame(facts),
    macos: await systemVersion(),
    changes: describeChanges(facts.log),
  };
  try {
    const response = await fetch(RELAY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (response.ok) {
      return "sent";
    }
    return response.status === 429 ? "tooMany" : "failed";
  } catch {
    return "failed";
  }
}
