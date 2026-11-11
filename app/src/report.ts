// A problem report: what the user writes in Report a problem, sent with what FM Lens knows (its version, the FM build,
// the checks on the game that did not pass, the Mac and the changes written while it has been open) to the report relay (relay/), which files it as an issue in
// the fm-lens repository. A wish from the wishlist goes the same way with only the version, as a feature request.
// Nothing leaves the app until the user presses Send. The facts are written in English, as the
// issues are. Screenshots and videos go straight to the relay's bucket, at addresses the relay hands out, and the issue
// links them.

import { call, inTauri } from "./api";
import { track } from "./usage";
import type { ConnectionInfo, GameInfo, LoggedChange, Storefront } from "./types";

/** The report relay's address (see docs/DEVELOPING.md, The report relay). */
export const RELAY = "https://5om2ly4fvanjhg425jlb7s26dm0etzak.lambda-url.us-east-1.on.aws";

/** The most the relay takes for the changes, in characters: the oldest are left out past it. */
const MAX_CHANGES = 8000;

/** How long sending may take, in milliseconds, and putting one file in the bucket. */
const SEND_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 180_000;

/** The files a report may carry, as the relay takes them (relay/index.js, FILES and FILE_LIMITS). */
const FILE_TYPES: Record<string, "image" | "video"> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
};
const TYPES_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};
const FILE_LIMITS = {
  image: { count: 5, bytes: 10 * 1024 * 1024 },
  video: { count: 1, bytes: 50 * 1024 * 1024 },
};

/** What the file picker offers. */
export const ACCEPTED_FILES = Object.keys(FILE_TYPES).join(",");

/** A file to send with a report, with the type the relay knows it by. */
export interface Attachment {
  file: File;
  type: string;
  kind: "image" | "video";
}

/** Why a file was not added: a type the relay doesn't take, one too many of its kind, or too big. */
export type AttachProblem = "type" | "count" | "size";

/** `current` with what of `added` the relay takes, and why any was left out. */
export function attach(current: Attachment[], added: File[]): { files: Attachment[]; problem: AttachProblem | null } {
  const files = [...current];
  let problem: AttachProblem | null = null;
  for (const file of added) {
    const type = FILE_TYPES[file.type]
      ? file.type
      : TYPES_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""];
    const kind = type ? FILE_TYPES[type] : undefined;
    if (!type || !kind) {
      problem = "type";
    } else if (files.filter((f) => f.kind === kind).length >= FILE_LIMITS[kind].count) {
      problem = "count";
    } else if (file.size === 0 || file.size > FILE_LIMITS[kind].bytes) {
      problem = "size";
    } else {
      files.push({ file, type, kind });
    }
  }
  return { files, problem };
}

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

/**
 * The checks on the game that did not pass, which leave what they cover read-only, one a line:
 * "players: 1840 of 2000 fit; 1960 of 1990 within their potential, 40 of them at it".
 */
export function describeChecks(connection: Pick<ConnectionInfo, "health"> | null): string {
  return (connection?.health.results ?? [])
    .filter((result) => !result.passed)
    .map(({ check, fit, sampled, note }) => `${check}: ${fit} of ${sampled} fit${note === "" ? "" : `; ${note}`}`)
    .join("\n");
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

/** Thrown when the relay turns a request away for now. */
class TooMany extends Error {}

/** Puts `files` in the relay's bucket, and returns their keys. */
async function upload(files: Attachment[]): Promise<string[]> {
  const response = await fetch(`${RELAY}/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: files.map(({ file, type }) => ({ type, size: file.size })),
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (response.status === 429) {
    throw new TooMany();
  }
  if (!response.ok) {
    throw new Error(`The relay answered ${response.status}`);
  }
  const { uploads } = (await response.json()) as {
    uploads: { key: string; url: string }[];
  };
  await Promise.all(
    uploads.map(async ({ url }, i) => {
      const put = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": files[i].type },
        body: files[i].file,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      if (!put.ok) {
        throw new Error(`The bucket answered ${put.status}`);
      }
    }),
  );
  return uploads.map(({ key }) => key);
}

/** Posts `body` to the relay at `path`, with `files` put in its bucket first. The browser preview sends nothing. */
async function post(path: "/report" | "/wish", body: () => Promise<object>, files: Attachment[]): Promise<SendResult> {
  if (!inTauri) {
    return "sent";
  }
  try {
    const sent = {
      ...(await body()),
      ...(files.length > 0 ? { attachments: await upload(files) } : {}),
    };
    const response = await fetch(`${RELAY}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sent),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (response.ok) {
      return "sent";
    }
    return response.status === 429 ? "tooMany" : "failed";
  } catch (err) {
    return err instanceof TooMany ? "tooMany" : "failed";
  }
}

/** Sends `what` and `files` with `facts` to the relay, which files them as a bug. */
export async function sendReport(facts: ReportFacts, what: string, files: Attachment[] = []): Promise<SendResult> {
  const result = await post(
    "/report",
    async () => ({
      what,
      version: facts.version ?? "",
      fmBuild: describeGame(facts),
      checks: describeChecks(facts.connection),
      // The relay's name for the system, from when FM Lens ran on macOS only.
      macos: await systemVersion(),
      changes: describeChanges(facts.log),
    }),
    files,
  );
  if (result === "sent" && inTauri) {
    track("report_sent", { attachments: files.length });
  }
  return result;
}

/** Sends a wish, `what` and `files`, to the relay with FM Lens's version, which files it as a feature request. */
export async function sendWish(facts: ReportFacts, what: string, files: Attachment[] = []): Promise<SendResult> {
  const result = await post("/wish", async () => ({ what, version: facts.version ?? "" }), files);
  if (result === "sent" && inTauri) {
    track("wish_sent", { attachments: files.length });
  }
  return result;
}
