// The report relay: Report a problem in FM Lens posts here, and the relay files the report as an issue in the
// fm-lens repository with its own GitHub token, so nobody leaves the app. It keeps nothing: a report is checked,
// sent on to GitHub and forgotten. Each address may send a few reports an hour, and all of them together a few a day.
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

import { createHash, createHmac, randomUUID } from "node:crypto";

/** The longest each part of a report may be, in characters, and the request as a whole, in bytes. */
export const LIMITS = { what: 5000, line: 200, changes: 8000, request: 20_000 };

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
    section("macOS", report.macos),
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
 * Counts reports in the DynamoDB table `table`, by address for each clock hour and in all for each day, so every
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
    /** Counts one report from `address`, or with `what` "uploads", one request for upload addresses. */
    async allow(address, what = "report") {
      const at = now();
      const hour = Math.floor(at / HOUR);
      const day = Math.floor(at / DAY);
      const prefix = what === "uploads" ? "uploads#" : "";
      return (
        (await count(`${prefix}address#${address}#${hour}`, PER_ADDRESS_HOUR, (hour + 2) * HOUR)) &&
        (await count(`${prefix}day#${day}`, PER_DAY, (day + 2) * DAY))
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
 * The relay's handler for function URL requests. `token` and `repo` name where issues go, and `limiter` counts reports;
 * `fetch` is swapped in by the tests. Reports are counted by the address AWS saw the request come from, which a sender
 * can't set.
 */
export function createRelay({ token, repo, limiter, uploads, fetch = globalThis.fetch }) {
  return async (event) => {
    const method = event.requestContext?.http?.method ?? "";
    const path = event.rawPath ?? "/";
    if (method === "OPTIONS") {
      return { statusCode: 204, headers: CORS, body: "" };
    }
    if (method === "GET" && path === "/health") {
      return answer(200, { ok: true });
    }
    if (method !== "POST" || (path !== "/report" && path !== "/uploads")) {
      return answer(404, { error: "notFound" });
    }
    if (!token || (path === "/uploads" && !uploads)) {
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
    const address = event.requestContext?.http?.sourceIp ?? "unknown";
    const allow = async (what) => {
      try {
        return (await limiter.allow(address, what)) ? null : answer(429, { error: "tooMany" });
      } catch (err) {
        console.error(`The counts could not be read: ${err instanceof Error ? err.message : String(err)}`);
        return answer(503, { error: "unavailable" });
      }
    };

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
    const { DynamoDBClient, UpdateItemCommand } = await import("@aws-sdk/client-dynamodb");
    const client = new DynamoDBClient({});
    relay = createRelay({
      token: process.env.GITHUB_TOKEN,
      repo: process.env.GITHUB_REPO || "IamDejman/fm-lens",
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
