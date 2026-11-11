// The report relay: Report a problem in FM Lens posts here, and the relay files the report as an issue in the
// fm-lens repository with its own GitHub token, so nobody leaves the app. It keeps nothing: a report is checked,
// sent on to GitHub and forgotten. Each sender may send a few reports an hour and a day, and all of them together two
// hundred an hour and a thousand a day.
//
// It runs as an AWS Lambda function behind a function URL (relay/deploy.sh), and counts reports in a DynamoDB table
// that every instance shares. Environment: GITHUB_TOKEN (a fine-grained token that may write issues in GITHUB_REPO),
// GITHUB_REPO (owner/name, IamDejman/fm-lens by default) and LIMIT_TABLE (fm-lens-report-relay by default).
//
// Screenshots and videos go straight from the app to the S3 bucket UPLOAD_BUCKET, never through the relay: the app asks
// for upload addresses (POST /uploads), puts each file under the private `uploads/`, and sends the report with the
// files' keys. Filing the report copies each file to `reports/`, which the bucket serves publicly and the issue links;
// the bucket drops `uploads/` after a day, so a file no report names is never public (relay/setup-attachments.sh).
// Without UPLOAD_BUCKET, reports without files work as before.
//
// The app's email screen and the site's download page post here too (POST /subscribe): the relay checks the address and
// keeps it in the DynamoDB table SUBSCRIBERS_TABLE (fm-lens-subscribers by default), with a token for its unsubscribe
// link. POST /unsubscribe with an address and its token takes it off the list: the link in every email
// (getfmlens.com/unsubscribe) and email apps' own unsubscribe button (List-Unsubscribe) both post here.
// scripts/send-email.mjs sends the emails, from getfmlens.com with Amazon SES.
//
// Every 15 minutes an EventBridge schedule runs the function with `{ "job": "report-counts" }` (relay/setup-email.sh),
// which sends PostHog the download counts of FM Lens's releases and how many addresses are on the list.

import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

/** The longest each part of a report may be, in characters, and the request as a whole, in bytes. */
export const LIMITS = { what: 5000, line: 200, checks: 2000, changes: 8000, request: 20_000 };

/** The files a report may carry: their types, with the extension each is kept under, and how many and how big. */
export const FILES = {
  "image/png": { ext: "png", kind: "image" },
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/gif": { ext: "gif", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/quicktime": { ext: "mov", kind: "video" },
};
export const FILE_LIMITS = {
  image: { count: 5, bytes: 10 * 1024 * 1024 },
  video: { count: 1, bytes: 50 * 1024 * 1024 },
};

/** How long an upload address works, in seconds. */
const UPLOAD_EXPIRES = 15 * 60;

/** A key the relay hands out for an upload: `uploads/<day>/<uuid>.<ext>`. */
const KEY =
  /^uploads\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|mp4|mov)$/;

/**
 * How many reports one sender may send an hour and a day, and all senders together an hour and a day: no sender can
 * use up the day's reports alone, and the hour's stay well under the 500 issues an hour GitHub lets one token open.
 */
export const PER_ADDRESS_HOUR = 5;
export const PER_ADDRESS_DAY = 10;
export const PER_HOUR = 200;
export const PER_DAY = 1000;

/** How many addresses one sender may subscribe an hour and a day, and all senders together. */
export const SUBSCRIBE_LIMITS = { addressHour: 5, addressDay: 10, hour: 500, day: 3000 };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Who sent a request from `address`, for counting: an IPv4 address as it is, and an IPv6 address by its /64 network,
 * which one subscriber gets whole and may send from any address in.
 */
export function senderOf(address) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) {
    return mapped[1];
  }
  if (!address.includes(":")) {
    return address;
  }
  const groups = (part) => (part === "" ? [] : part.split(":"));
  // An IPv4 address at the end takes two groups.
  const size = (list) => list.reduce((n, group) => n + (group.includes(".") ? 2 : 1), 0);
  const [head, tail] = address.split("::").map(groups);
  const zeros = tail === undefined ? [] : Array(Math.max(0, 8 - size(head) - size(tail))).fill("0");
  const all = [...head, ...zeros, ...(tail ?? [])];
  return `${all
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(":")}::/64`;
}

/**
 * The report in `input`, or why it is turned away. `what` is required; `version`, `fmBuild` and `macos` (the system) are one line
 * each, `checks` lists the checks on the game that did not pass, and `changes` what the user changed before it happened.
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
    // Sent as `macos` by every version, from when FM Lens ran on macOS only.
    system: text("macos", LIMITS.line),
    checks: text("checks", LIMITS.checks),
    changes: text("changes", LIMITS.changes),
  };
  if (Object.values(report).some((value) => value === undefined) || report.what === "") {
    return { error: "invalid" };
  }
  for (const key of ["version", "fmBuild", "system"]) {
    if (/[\r\n]/.test(report[key])) {
      return { error: "invalid" };
    }
  }
  return { report };
}

/**
 * The files asked for in `input` (`{ files: [{ type, size }] }`), or why they are turned away: a type not in `FILES`,
 * more of a kind than `FILE_LIMITS` allows, or one too big.
 */
export function readFiles(input) {
  const files = input?.files;
  if (!Array.isArray(files) || files.length === 0) {
    return { error: "invalid" };
  }
  const counts = { image: 0, video: 0 };
  const read = [];
  for (const file of files) {
    const type = FILES[file?.type];
    if (!type || !Number.isInteger(file.size) || file.size <= 0) {
      return { error: "invalid" };
    }
    const limit = FILE_LIMITS[type.kind];
    counts[type.kind] += 1;
    if (counts[type.kind] > limit.count || file.size > limit.bytes) {
      return { error: "tooLarge" };
    }
    read.push({ type: file.type, size: file.size, ext: type.ext });
  }
  return { files: read };
}

/** The keys in `input.attachments`, or why they are turned away: not ones the relay hands out, or too many. */
export function readAttachments(input) {
  const keys = input?.attachments;
  if (keys === undefined) {
    return { keys: [] };
  }
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string" || !KEY.test(key))) {
    return { error: "invalid" };
  }
  const counts = { image: 0, video: 0 };
  for (const key of keys) {
    const kind = isVideo(key) ? "video" : "image";
    counts[kind] += 1;
    if (counts[kind] > FILE_LIMITS[kind].count) {
      return { error: "invalid" };
    }
  }
  return { keys: [...new Set(keys)] };
}

const isVideo = (key) => /\.(mp4|mov)$/.test(key);

/** The longest address there may be, in characters (RFC 5321). */
const MAX_EMAIL = 254;

/** One address: no spaces, one @, and a domain with a dot and a top-level part of letters. */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;

/** The address in `input` (`{ email }`), trimmed, or why it is turned away. */
export function readEmail(input) {
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  if (email.length > MAX_EMAIL || !EMAIL.test(email)) {
    return { error: "invalid" };
  }
  return { email };
}

/** Where filing a report puts the upload at `key`, which the bucket serves. */
const filedKey = (key) => key.replace(/^uploads\//, "reports/");

/** Where the bucket serves `key`. */
export function publicUrl(bucket, region, key) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodePath(key)}`;
}

/** The issue for `report`, laid out as GitHub lays out its own bug report form (.github/ISSUE_TEMPLATE/bug_report.yml). */
export function issueFor(report, files = []) {
  const firstLine = quiet(report.what.split("\n")[0].trim());
  const title = firstLine.length > 70 ? `${firstLine.slice(0, 69)}…` : firstLine;
  const section = (label, value) => `### ${label}\n\n${value === "" ? "_No response_" : quiet(value)}`;
  const body = [
    section("FM Lens version", report.version),
    section("FM build", report.fmBuild),
    ...(report.checks ? [section("Checks that did not pass", report.checks)] : []),
    section("System", report.system),
    section("What happened", report.what),
    section("What you changed in FM Lens before it happened", report.changes),
    ...(files.length > 0 ? [section("Files", files.map(fileLink).join("\n\n"))] : []),
    "_Sent from Report a problem in FM Lens._",
  ].join("\n\n");
  return { title, body, labels: ["bug"] };
}

/**
 * `text` with its @mentions broken by a zero-width space, so a report, which anyone may send, can't have the relay's
 * token notify people.
 */
export const quiet = (text) => text.replace(/@(?=[\w-])/g, "@\u200b");

/** A screenshot shown in the issue, or a link to a video, which GitHub plays only from its own storage. */
function fileLink(url, index) {
  return isVideo(url) ? `[Video](${url})` : `![Screenshot ${index + 1}](${url})`;
}

/** `value` encoded as SigV4 wants it: everything but A-Z, a-z, 0-9 and -._~. */
function encode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const encodePath = (key) => key.split("/").map(encode).join("/");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();

/**
 * A presigned S3 URL (Signature Version 4, query string) for `method` on `key` in `bucket`. `headers` are signed as
 * well, besides the host, so the request must send them as they are: an upload its Content-Type and Content-Length.
 */
export function presign({
  method,
  bucket,
  region,
  key,
  headers = {},
  credentials,
  expires,
  now = new Date(),
  host = `${bucket}.s3.${region}.amazonaws.com`,
}) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const day = stamp.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const signed = {
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)])),
    host,
  };
  const names = Object.keys(signed).sort();
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${credentials.accessKeyId}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": names.join(";"),
    ...(credentials.sessionToken ? { "X-Amz-Security-Token": credentials.sessionToken } : {}),
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encode(name)}=${encode(query[name])}`)
    .join("&");
  const canonical = [
    method,
    `/${encodePath(key)}`,
    canonicalQuery,
    names.map((name) => `${name}:${signed[name].trim()}\n`).join(""),
    names.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  return `https://${host}/${encodePath(key)}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Counts reports in the DynamoDB table `table`, by sender and in all for each clock hour and day, so every
 * instance of the function sees the same counts. `update` sends one UpdateItem request; each count adds one only while
 * it is under its limit, and DynamoDB drops it a window after its own ends (the table's TTL is on `expires`).
 */
export function createTableLimiter({ table, update, now = Date.now }) {
  const count = async (key, max, expires) => {
    try {
      await update({
        TableName: table,
        Key: { key: { S: key } },
        UpdateExpression: "ADD reports :one SET expires = if_not_exists(expires, :expires)",
        ConditionExpression: "attribute_not_exists(reports) OR reports < :max",
        ExpressionAttributeValues: {
          ":one": { N: "1" },
          ":max": { N: String(max) },
          ":expires": { N: String(Math.floor(expires / 1000)) },
        },
      });
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
        return false;
      }
      throw err;
    }
  };
  return {
    /**
     * Counts one report from `address`, or with `what` "uploads", one request for upload addresses, or with
     * "subscribe", one address to subscribe (`SUBSCRIBE_LIMITS`).
     */
    async allow(address, what = "report") {
      const at = now();
      const hour = Math.floor(at / HOUR);
      const day = Math.floor(at / DAY);
      const prefix = what === "report" ? "" : `${what}#`;
      const max =
        what === "subscribe"
          ? SUBSCRIBE_LIMITS
          : { addressHour: PER_ADDRESS_HOUR, addressDay: PER_ADDRESS_DAY, hour: PER_HOUR, day: PER_DAY };
      return (
        (await count(`${prefix}address#${address}#${hour}`, max.addressHour, (hour + 2) * HOUR)) &&
        (await count(`${prefix}address#${address}#day#${day}`, max.addressDay, (day + 2) * DAY)) &&
        (await count(`${prefix}hour#${hour}`, max.hour, (hour + 2) * HOUR)) &&
        (await count(`${prefix}day#${day}`, max.day, (day + 2) * DAY))
      );
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
 * The list of addresses in the DynamoDB table `table`, one row for each `email`: its `status` ("active", "unsubscribed",
 * or "bounced" or "complained" once SES won't send to it), its `token`, a random secret its unsubscribe link carries,
 * and when it was `subscribed` and `unsubscribed`. `update` sends one UpdateItem request and `scan` one Scan request.
 */
export function createSubscribers({
  table,
  update,
  scan,
  now = () => new Date(),
  newToken = () => randomBytes(16).toString("hex"),
}) {
  const names = { "#status": "status", "#token": "token" };
  return {
    /** Puts `email` on the list, or back on it with the token it had. */
    async add(email) {
      await update({
        TableName: table,
        Key: { email: { S: email } },
        UpdateExpression:
          "SET #status = :active, #token = if_not_exists(#token, :token), subscribed = if_not_exists(subscribed, :now) REMOVE unsubscribed",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: {
          ":active": { S: "active" },
          ":token": { S: newToken() },
          ":now": { S: now().toISOString() },
        },
      });
    },
    /** Takes `email` off the list when `token` is its token. Gives whether it was. */
    async remove(email, token) {
      try {
        await update({
          TableName: table,
          Key: { email: { S: email } },
          UpdateExpression: "SET #status = :unsubscribed, unsubscribed = :now",
          ConditionExpression: "#token = :token",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: {
            ":unsubscribed": { S: "unsubscribed" },
            ":token": { S: token },
            ":now": { S: now().toISOString() },
          },
        });
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
          return false;
        }
        throw err;
      }
    },
    /** How many addresses are on the list. */
    async count() {
      let count = 0;
      let start;
      do {
        const page = await scan({
          TableName: table,
          Select: "COUNT",
          FilterExpression: "#status = :active",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":active": { S: "active" } },
          ...(start ? { ExclusiveStartKey: start } : {}),
        });
        count += page.Count;
        start = page.LastEvaluatedKey;
      } while (start);
      return count;
    },
  };
}

/** An unsubscribe link's token: what `createSubscribers` makes. */
const TOKEN = /^[0-9a-f]{32}$/;

/** Where FM Lens's releases are, and so their download counts. */
const RELEASES = "IamDejman/fm-lens-releases";

/** PostHog's address for one event, and the project's public key, the one the app and the site send with. */
const CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";
const POSTHOG_KEY = "phc_xoND6FWuBkhD46EWt7tr89NnoUQ5yQoHm2QDMrVCjU2q";

/**
 * The download counts over all of `releases` (newest first, as GitHub lists them), as the "FM Lens growth" dashboard
 * reads them:
 * - mac_downloads: the disk images and zips people download;
 * - windows_downloads: the Windows installers, which installed copies on Windows also download to update;
 * - mac_updates: the .app.tar.gz files installed copies on macOS update from;
 * - update_checks: latest.json, which every copy reads when it opens, to look for an update.
 */
export function downloadCounts(releases) {
  const total = (pattern) =>
    releases
      .flatMap((release) => release.assets ?? [])
      .filter((asset) => pattern.test(asset.name))
      .reduce((sum, asset) => sum + asset.download_count, 0);
  return {
    mac_downloads: total(/\.(dmg|zip)$/),
    windows_downloads: total(/-setup\.exe$/),
    mac_updates: total(/\.app\.tar\.gz$/),
    update_checks: total(/^latest\.json$/),
    latest_version: releases[0]?.tag_name ?? null,
  };
}

/**
 * Sends PostHog the download counts (`release_downloads`) and how many addresses are on the list (`email_subscribers`),
 * each as soon as it is known, so one failing doesn't hold back the other. Throws if either fails, after both are tried.
 */
async function reportCounts({ token, subscribers, fetch }) {
  const capture = async (event, distinctId, properties) => {
    const response = await fetch(CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        timestamp: new Date().toISOString(),
        properties: { ...properties, $process_person_profile: false, $geoip_disable: true },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`PostHog answered ${response.status} to ${event}`);
    }
    return properties;
  };
  const downloads = async () => {
    const releases = [];
    for (let page = 1; ; page++) {
      const response = await fetch(`https://api.github.com/repos/${RELEASES}/releases?per_page=100&page=${page}`, {
        headers: {
          Accept: "application/vnd.github+json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "User-Agent": "fm-lens-report-relay",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`GitHub answered ${response.status} for the releases`);
      }
      const batch = await response.json();
      releases.push(...batch);
      if (batch.length < 100) {
        return capture("release_downloads", "github-releases", downloadCounts(releases));
      }
    }
  };
  const list = async () => capture("email_subscribers", "fm-lens-list", { subscribers: await subscribers.count() });
  const [sent, failed] = [[], []];
  for (const result of await Promise.allSettled([downloads(), list()])) {
    if (result.status === "fulfilled") {
      sent.push(result.value);
    } else {
      failed.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }
  if (failed.length > 0) {
    throw new Error(`The counts were not all sent: ${failed.join("; ")}`);
  }
  return Object.assign({}, ...sent);
}

/**
 * The relay's handler for function URL requests, and for the schedule's `{ "job": "report-counts" }`. `token` and `repo`
 * name where issues go, `subscribers` (`createSubscribers`) is the list, and `limiter` counts requests; `fetch` is
 * swapped in by the tests. Requests are counted by the address AWS saw them come from, which a sender can't set, an IPv6
 * one by its network (`senderOf`).
 */
export function createRelay({ token, repo, limiter, uploads, subscribers, fetch = globalThis.fetch }) {
  return async (event) => {
    // Only the schedule sends `job`: a function URL request's event is made by AWS, with the request's body as a string.
    if (event.job === "report-counts") {
      return reportCounts({ token, subscribers, fetch });
    }
    const method = event.requestContext?.http?.method ?? "";
    const path = event.rawPath ?? "/";
    if (method === "OPTIONS") {
      return { statusCode: 204, headers: CORS, body: "" };
    }
    if (method === "GET" && path === "/health") {
      return answer(200, { ok: true });
    }
    if (method !== "POST" || !["/report", "/uploads", "/subscribe", "/unsubscribe"].includes(path)) {
      return answer(404, { error: "notFound" });
    }
    const list = path === "/subscribe" || path === "/unsubscribe";
    const ready = list ? Boolean(subscribers) : Boolean(token) && (path !== "/uploads" || Boolean(uploads));
    if (!ready) {
      return answer(503, { error: "unavailable" });
    }

    // The address and its token come in the link, so the site's unsubscribe page and email apps' unsubscribe button,
    // which posts `List-Unsubscribe=One-Click`, send the same request. Without the token nobody can take an address off.
    if (path === "/unsubscribe") {
      const query = new URLSearchParams(event.rawQueryString ?? "");
      const { email, error } = readEmail({ email: query.get("email") });
      const secret = query.get("token") ?? "";
      if (error || !TOKEN.test(secret)) {
        return answer(400, { error: "invalid" });
      }
      try {
        return (await subscribers.remove(email.toLowerCase(), secret))
          ? answer(200, { unsubscribed: true })
          : answer(400, { error: "invalid" });
      } catch (err) {
        // Never the address: the log keeps none.
        console.error(`An address could not be taken off the list: ${err instanceof Error ? err.message : String(err)}`);
        return answer(502, { error: "notUnsubscribed" });
      }
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
    const address = senderOf(event.requestContext?.http?.sourceIp ?? "unknown");
    const allow = async (what) => {
      try {
        return (await limiter.allow(address, what)) ? null : answer(429, { error: "tooMany" });
      } catch (err) {
        console.error(`The counts could not be read: ${err instanceof Error ? err.message : String(err)}`);
        return answer(503, { error: "unavailable" });
      }
    };

    if (path === "/subscribe") {
      const { email, error } = readEmail(input);
      if (error) {
        return answer(400, { error });
      }
      const refused = await allow("subscribe");
      if (refused) {
        return refused;
      }
      try {
        await subscribers.add(email.toLowerCase());
        return answer(200, { subscribed: true });
      } catch (err) {
        // Never the address: the log keeps none.
        console.error(`An address could not be put on the list: ${err instanceof Error ? err.message : String(err)}`);
        return answer(502, { error: "notSubscribed" });
      }
    }

    if (path === "/uploads") {
      const { files, error } = readFiles(input);
      if (error) {
        return answer(error === "tooLarge" ? 413 : 400, { error });
      }
      const refused = await allow("uploads");
      if (refused) {
        return refused;
      }
      const day = new Date().toISOString().slice(0, 10);
      const credentials = uploads.credentials();
      return answer(200, {
        uploads: files.map((file) => {
          const key = `uploads/${day}/${randomUUID()}.${file.ext}`;
          const url = presign({
            method: "PUT",
            bucket: uploads.bucket,
            region: uploads.region,
            key,
            headers: { "Content-Type": file.type, "Content-Length": file.size },
            credentials,
            expires: UPLOAD_EXPIRES,
          });
          return { key, url };
        }),
      });
    }

    const { report, error } = readReport(input);
    const { keys, error: filesError } = readAttachments(input);
    if (error || filesError || (keys.length > 0 && !uploads)) {
      return answer(400, { error: error ?? filesError ?? "invalid" });
    }
    const refused = await allow("report");
    if (refused) {
      return refused;
    }
    // Each file must be in the bucket, as big as its kind may be at the most. It is then copied where the bucket serves
    // it, for the issue to link.
    const signed = (method, key, headers) =>
      presign({
        method,
        bucket: uploads.bucket,
        region: uploads.region,
        key,
        headers,
        credentials: uploads.credentials(),
        expires: 60,
      });
    let files;
    try {
      const found = await Promise.all(
        keys.map(async (key) => {
          const head = await fetch(signed("HEAD", key), { method: "HEAD", signal: AbortSignal.timeout(10_000) });
          const size = Number(head.headers.get("content-length"));
          return head.ok && size <= FILE_LIMITS[isVideo(key) ? "video" : "image"].bytes;
        }),
      );
      // None is copied unless all may be, so that no file is public without its issue.
      if (found.includes(false)) {
        return answer(400, { error: "invalid" });
      }
      files = await Promise.all(
        keys.map(async (key) => {
          const copySource = { "x-amz-copy-source": `/${uploads.bucket}/${encodePath(key)}` };
          const copy = await fetch(signed("PUT", filedKey(key), copySource), {
            method: "PUT",
            headers: copySource,
            signal: AbortSignal.timeout(30_000),
          });
          // S3 can answer a copy 200 and still say in the body that it failed.
          if (!copy.ok || (await copy.text()).includes("<Error>")) {
            throw new Error(`the bucket answered ${copy.status} to a copy`);
          }
          return publicUrl(uploads.bucket, uploads.region, filedKey(key));
        }),
      );
    } catch (err) {
      console.error(`The files could not be checked: ${err instanceof Error ? err.message : String(err)}`);
      return answer(502, { error: "notFiled" });
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
        body: JSON.stringify(issueFor(report, files)),
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

let relay;

/** The Lambda entry point. The AWS SDK comes with Lambda's Node.js runtime, so it is loaded only there. */
export async function handler(event) {
  if (!relay) {
    const { DynamoDBClient, ScanCommand, UpdateItemCommand } = await import("@aws-sdk/client-dynamodb");
    const client = new DynamoDBClient({});
    relay = createRelay({
      token: process.env.GITHUB_TOKEN,
      repo: process.env.GITHUB_REPO || "IamDejman/fm-lens",
      subscribers: createSubscribers({
        table: process.env.SUBSCRIBERS_TABLE || "fm-lens-subscribers",
        update: (input) => client.send(new UpdateItemCommand(input)),
        scan: (input) => client.send(new ScanCommand(input)),
      }),
      uploads: process.env.UPLOAD_BUCKET
        ? {
            bucket: process.env.UPLOAD_BUCKET,
            region: process.env.AWS_REGION,
            // The function's own role, which may put objects in the bucket.
            credentials: () => ({
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              sessionToken: process.env.AWS_SESSION_TOKEN,
            }),
          }
        : undefined,
      limiter: createTableLimiter({
        table: process.env.LIMIT_TABLE || "fm-lens-report-relay",
        update: (input) => client.send(new UpdateItemCommand(input)),
      }),
    });
  }
  return relay(event);
}
