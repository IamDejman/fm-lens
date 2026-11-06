// The report relay: Report a problem in FM Lens posts here, and the relay files the report as an issue in the
// fm-lens repository with its own GitHub token, so nobody leaves the app. It keeps nothing: a report is checked,
// sent on to GitHub and forgotten. Each address may send a few reports an hour, and all of them together a few a day.
//
// Environment: GITHUB_TOKEN (a fine-grained token that may write issues in GITHUB_REPO), GITHUB_REPO (owner/name,
// IamDejman/fm-lens by default) and PORT.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

/** The longest each part of a report may be, in characters, and the request as a whole, in bytes. */
export const LIMITS = { what: 5000, line: 200, changes: 8000, request: 20_000 };

/** How many reports one address may send an hour, and all addresses together a day. */
export const PER_ADDRESS_HOUR = 5;
export const PER_DAY = 100;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * The report in `input`, or why it is turned away. `what` is required; `version`, `fmBuild` and `macos` are one line
 * each, and `changes` lists what the user changed before it happened.
 */
export function readReport(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { error: "invalid" };
  }
  const text = (key, max, required = false) => {
    const value = input[key];
    if (value === undefined || value === null || value === "") {
      return required ? undefined : "";
    }
    if (typeof value !== "string" || value.length > max) {
      return undefined;
    }
    return value.trim();
  };
  const report = {
    what: text("what", LIMITS.what, true),
    version: text("version", LIMITS.line),
    fmBuild: text("fmBuild", LIMITS.line),
    macos: text("macos", LIMITS.line),
    changes: text("changes", LIMITS.changes),
  };
  if (Object.values(report).some((value) => value === undefined) || report.what === "") {
    return { error: "invalid" };
  }
  for (const key of ["version", "fmBuild", "macos"]) {
    if (/[\r\n]/.test(report[key])) {
      return { error: "invalid" };
    }
  }
  return { report };
}

/** The issue for `report`, laid out as GitHub lays out its own bug report form (.github/ISSUE_TEMPLATE/bug_report.yml). */
export function issueFor(report) {
  const firstLine = report.what.split("\n")[0].trim();
  const title = firstLine.length > 70 ? `${firstLine.slice(0, 69)}…` : firstLine;
  const section = (label, value) => `### ${label}\n\n${value === "" ? "_No response_" : value}`;
  const body = [
    section("FM Lens version", report.version),
    section("FM build", report.fmBuild),
    section("macOS", report.macos),
    section("What happened", report.what),
    section("What you changed in FM Lens before it happened", report.changes),
    "_Sent from Report a problem in FM Lens._",
  ].join("\n\n");
  return { title, body, labels: ["bug"] };
}

/** Counts reports, by address for the hour and in all for the day. */
export function createLimiter(now = Date.now) {
  const byAddress = new Map();
  let day = [];
  return {
    /** Whether `address` may send a report now; if so, it is counted. */
    allow(address) {
      const at = now();
      day = day.filter((time) => at - time < DAY);
      const recent = (byAddress.get(address) ?? []).filter((time) => at - time < HOUR);
      if (recent.length >= PER_ADDRESS_HOUR || day.length >= PER_DAY) {
        byAddress.set(address, recent);
        return false;
      }
      recent.push(at);
      byAddress.set(address, recent);
      day.push(at);
      // Addresses with nothing in the last hour are dropped, so the map stays small.
      for (const [key, times] of byAddress) {
        if (times.every((time) => at - time >= HOUR)) {
          byAddress.delete(key);
        }
      }
      return true;
    },
  };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function send(res, status, body) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Reads the request's body, up to `max` bytes; null when it is longer. */
async function readBody(req, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) {
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The address a request came from: Railway's proxy puts the client's first in X-Forwarded-For. */
function addressOf(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const first = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "";
  return first || req.socket.remoteAddress || "unknown";
}

/**
 * The relay's request handler. `token` and `repo` name where issues go; `fetch` and `limiter` are swapped in by the
 * tests.
 */
export function createRelay({ token, repo, fetch = globalThis.fetch, limiter = createLimiter() }) {
  return async (req, res) => {
    const path = new URL(req.url ?? "/", "http://relay").pathname;
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    if (req.method === "GET" && path === "/health") {
      send(res, 200, { ok: true });
      return;
    }
    if (req.method !== "POST" || path !== "/report") {
      send(res, 404, { error: "notFound" });
      return;
    }
    if (!token) {
      send(res, 503, { error: "unavailable" });
      return;
    }
    const raw = await readBody(req, LIMITS.request);
    if (raw === null) {
      send(res, 413, { error: "tooLong" });
      return;
    }
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      send(res, 400, { error: "invalid" });
      return;
    }
    const { report, error } = readReport(input);
    if (error) {
      send(res, 400, { error });
      return;
    }
    if (!limiter.allow(addressOf(req))) {
      send(res, 429, { error: "tooMany" });
      return;
    }
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "fm-lens-report-relay",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify(issueFor(report)),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        console.error(`GitHub answered ${response.status}`);
        send(res, 502, { error: "notFiled" });
        return;
      }
      send(res, 201, { sent: true });
    } catch (err) {
      console.error(`GitHub could not be reached: ${err instanceof Error ? err.message : String(err)}`);
      send(res, 502, { error: "notFiled" });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.env.GITHUB_REPO || "IamDejman/fm-lens";
  const relay = createRelay({ token: process.env.GITHUB_TOKEN, repo });
  const port = Number(process.env.PORT) || 8080;
  createServer((req, res) => {
    relay(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        send(res, 500, { error: "failed" });
      }
    });
  }).listen(port, () => {
    console.log(`Report relay on port ${port}, filing in ${repo}${process.env.GITHUB_TOKEN ? "" : " (no GITHUB_TOKEN yet)"}`);
  });
}
