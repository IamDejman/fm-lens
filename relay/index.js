// The report relay: Report a problem in FM Lens posts here, and the relay files the report as an issue in the
// fm-lens repository with its own GitHub token, so nobody leaves the app. It keeps nothing: a report is checked,
// sent on to GitHub and forgotten. Each address may send a few reports an hour, and all of them together a few a day.
//
// It runs as an AWS Lambda function behind a function URL (relay/deploy.sh). Environment: GITHUB_TOKEN (a
// fine-grained token that may write issues in GITHUB_REPO) and GITHUB_REPO (owner/name, IamDejman/fm-lens by default).

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

/**
 * Counts reports, by address for the hour and in all for the day. Only reports let through are kept, so it holds at
 * most PER_DAY times, whatever is sent to it. Each function instance counts on its own.
 */
export function createLimiter(now = Date.now) {
  const byAddress = new Map();
  let day = [];
  return {
    /** Whether `address` may send a report now; if so, it is counted. */
    allow(address) {
      const at = now();
      day = day.filter((time) => at - time < DAY);
      for (const [key, times] of byAddress) {
        const recent = times.filter((time) => at - time < HOUR);
        if (recent.length === 0) {
          byAddress.delete(key);
        } else {
          byAddress.set(key, recent);
        }
      }
      const recent = byAddress.get(address) ?? [];
      if (recent.length >= PER_ADDRESS_HOUR || day.length >= PER_DAY) {
        return false;
      }
      byAddress.set(address, [...recent, at]);
      day.push(at);
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

function answer(statusCode, body) {
  return { statusCode, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/**
 * The relay's handler for function URL requests. `token` and `repo` name where issues go; `fetch` and `limiter` are
 * swapped in by the tests. Reports are counted by the address AWS saw the request come from, which a sender can't set.
 */
export function createRelay({ token, repo, fetch = globalThis.fetch, limiter = createLimiter() }) {
  return async (event) => {
    const method = event.requestContext?.http?.method ?? "";
    const path = event.rawPath ?? "/";
    if (method === "OPTIONS") {
      return { statusCode: 204, headers: CORS, body: "" };
    }
    if (method === "GET" && path === "/health") {
      return answer(200, { ok: true });
    }
    if (method !== "POST" || path !== "/report") {
      return answer(404, { error: "notFound" });
    }
    if (!token) {
      return answer(503, { error: "unavailable" });
    }
    const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : (event.body ?? "");
    if (Buffer.byteLength(raw, "utf8") > LIMITS.request) {
      return answer(413, { error: "tooLong" });
    }
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return answer(400, { error: "invalid" });
    }
    const { report, error } = readReport(input);
    if (error) {
      return answer(400, { error });
    }
    if (!limiter.allow(event.requestContext?.http?.sourceIp ?? "unknown")) {
      return answer(429, { error: "tooMany" });
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
        return answer(502, { error: "notFiled" });
      }
      return answer(201, { sent: true });
    } catch (err) {
      console.error(`GitHub could not be reached: ${err instanceof Error ? err.message : String(err)}`);
      return answer(502, { error: "notFiled" });
    }
  };
}

/** The Lambda entry point. */
export const handler = createRelay({
  token: process.env.GITHUB_TOKEN,
  repo: process.env.GITHUB_REPO || "IamDejman/fm-lens",
});
