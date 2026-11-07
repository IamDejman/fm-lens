import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FILE_LIMITS,
  PER_ADDRESS_HOUR,
  PER_DAY,
  createRelay,
  createTableLimiter,
  issueFor,
  presign,
  publicUrl,
  readAttachments,
  readFiles,
  readReport,
} from "./index.js";

const REPORT = {
  what: "Apply failed on a wage\nIt said the value didn't stick.",
  version: "0.5.6",
  fmBuild: "FM27 Steam 26340721, editing on",
  macos: "macOS 27.2, Apple Silicon",
  changes: "Kabia (player 2000216551): contract.wage 2000 → 7045",
};

/** Sends the relay `body` at `path` as a function URL request from `sourceIp`, and returns the status and JSON answer. */
async function post(options, body, { path = "/report", sourceIp = "203.0.113.9", method = "POST" } = {}) {
  const relay = createRelay({ limiter: createTableLimiter({ table: "t", update: table().update }), ...options });
  const response = await relay({
    rawPath: path,
    requestContext: { http: { method, sourceIp } },
    body: typeof body === "string" ? body : JSON.stringify(body),
    isBase64Encoded: false,
  });
  return {
    status: response.statusCode,
    json: response.body === "" ? null : JSON.parse(response.body),
    cors: response.headers["Access-Control-Allow-Origin"],
  };
}

/** A stand-in for GitHub that records the issues it is sent and answers with `status`. */
function github(status = 201) {
  const sent = [];
  const fetch = async (url, init) => {
    sent.push({ url, init, issue: JSON.parse(init.body) });
    return new Response("{}", { status });
  };
  return { fetch, sent };
}

test("a report becomes an issue laid out like the bug report form", () => {
  const { report } = readReport(REPORT);
  const issue = issueFor(report);
  assert.equal(issue.title, "Apply failed on a wage");
  assert.deepEqual(issue.labels, ["bug"]);
  assert.match(issue.body, /### FM Lens version\n\n0\.5\.6/);
  assert.match(issue.body, /### What happened\n\nApply failed on a wage\nIt said/);
  assert.match(issue.body, /### What you changed in FM Lens before it happened\n\nKabia/);
});

test("empty parts read as no response, and a long first line is cut for the title", () => {
  const { report } = readReport({ what: "x".repeat(100) });
  const issue = issueFor(report);
  assert.equal(issue.title.length, 70);
  assert.match(issue.body, /### FM build\n\n_No response_/);
});

test("reports without what happened, with the wrong types, or too long are turned away", () => {
  assert.deepEqual(readReport({ ...REPORT, what: "" }), { error: "invalid" });
  assert.deepEqual(readReport({ ...REPORT, what: undefined }), { error: "invalid" });
  assert.deepEqual(readReport({ ...REPORT, version: 5 }), { error: "invalid" });
  assert.deepEqual(readReport({ ...REPORT, macos: "a\nb" }), { error: "invalid" });
  assert.deepEqual(readReport({ ...REPORT, what: "x".repeat(5001) }), { error: "invalid" });
  assert.deepEqual(readReport([REPORT]), { error: "invalid" });
});

test("the relay files a report in the repository with its token", async () => {
  const { fetch, sent } = github();
  const answer = await post({ token: "test-token", repo: "owner/name", fetch }, REPORT);
  assert.deepEqual(answer, { status: 201, json: { sent: true }, cors: "*" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://api.github.com/repos/owner/name/issues");
  assert.equal(sent[0].init.headers.Authorization, "Bearer test-token");
  assert.equal(sent[0].issue.title, "Apply failed on a wage");
});

test("the relay says so when GitHub doesn't file it, or when it has no token", async () => {
  assert.equal((await post({ token: "t", repo: "o/n", fetch: github(403).fetch }, REPORT)).status, 502);
  const failing = async () => {
    throw new Error("offline");
  };
  assert.equal((await post({ token: "t", repo: "o/n", fetch: failing }, REPORT)).status, 502);
  const { fetch, sent } = github();
  assert.equal((await post({ token: undefined, repo: "o/n", fetch }, REPORT)).status, 503);
  assert.equal(sent.length, 0);
});

test("bad requests are turned away before GitHub is asked", async () => {
  const { fetch, sent } = github();
  const options = { token: "t", repo: "o/n", fetch };
  assert.equal((await post(options, "not json")).status, 400);
  assert.equal((await post(options, { what: "" })).status, 400);
  assert.equal((await post(options, { what: "x".repeat(30_000) })).status, 413);
  assert.equal((await post(options, REPORT, { path: "/other" })).status, 404);
  assert.equal(sent.length, 0);
});

test("the relay counts reports by the address AWS saw, and answers the preflight", async () => {
  const { fetch } = github();
  const limiter = createTableLimiter({ table: "t", update: table().update });
  const options = { token: "t", repo: "o/n", fetch, limiter };
  for (let i = 0; i < PER_ADDRESS_HOUR; i++) {
    assert.equal((await post(options, REPORT)).status, 201);
  }
  assert.equal((await post(options, REPORT)).status, 429);
  assert.equal((await post(options, REPORT, { sourceIp: "198.51.100.4" })).status, 201);
  assert.deepEqual(await post(options, "", { method: "OPTIONS" }), { status: 204, json: null, cors: "*" });
});

/** A stand-in for the DynamoDB table: UpdateItem with the conditional ADD the table limiter sends. */
function table() {
  const items = new Map();
  const update = async (input) => {
    const key = input.Key.key.S;
    const max = Number(input.ExpressionAttributeValues[":max"].N);
    const item = items.get(key) ?? { reports: 0 };
    if (item.reports >= max) {
      throw Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });
    }
    items.set(key, {
      reports: item.reports + 1,
      expires: item.expires ?? Number(input.ExpressionAttributeValues[":expires"].N),
    });
  };
  return { update, items };
}

test("the table counts by address for the hour and in all for the day", async () => {
  let now = Date.UTC(2026, 10, 6, 12);
  const { update, items } = table();
  const limiter = createTableLimiter({ table: "t", update, now: () => now });
  for (let i = 0; i < PER_ADDRESS_HOUR; i++) {
    assert.equal(await limiter.allow("a"), true);
  }
  assert.equal(await limiter.allow("a"), false);
  assert.equal(await limiter.allow("b"), true);
  now += 60 * 60 * 1000;
  assert.equal(await limiter.allow("a"), true);
  assert.ok([...items.values()].every((item) => item.expires * 1000 > now));

  for (let i = 0; items.get(`day#${Math.floor(now / 86_400_000)}`).reports < PER_DAY; i++) {
    await limiter.allow(`address-${i}`);
  }
  assert.equal(await limiter.allow("another"), false);
});

test("the relay turns reports away when it can't count them", async () => {
  const { fetch, sent } = github();
  const limiter = {
    allow: async () => {
      throw new Error("throttled");
    },
  };
  assert.equal((await post({ token: "t", repo: "o/n", fetch, limiter }, REPORT)).status, 503);
  assert.equal(sent.length, 0);
});

const UPLOADS = {
  bucket: "fm-lens-reports",
  region: "us-east-1",
  credentials: () => ({
    accessKeyId: "AKID",
    secretAccessKey: "secret",
    sessionToken: "session",
  }),
};
const KEY = "reports/2026-11-06/0b7c2f4e-9d1a-4c3b-8e5f-1a2b3c4d5e6f.png";
const VIDEO = "reports/2026-11-06/1b7c2f4e-9d1a-4c3b-8e5f-1a2b3c4d5e6f.mov";

test("presigning matches AWS's own example", () => {
  // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
  const url = presign({
    method: "GET",
    bucket: "examplebucket",
    region: "us-east-1",
    host: "examplebucket.s3.amazonaws.com",
    key: "test.txt",
    credentials: {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    },
    expires: 86400,
    now: new Date(Date.UTC(2013, 4, 24)),
  });
  assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
});

test("files are turned away by type, count and size", () => {
  const image = { type: "image/png", size: 1000 };
  assert.deepEqual(readFiles({ files: [image] }).files, [{ ...image, ext: "png" }]);
  assert.equal(readFiles({ files: [] }).error, "invalid");
  assert.equal(readFiles({ files: [{ type: "text/html", size: 10 }] }).error, "invalid");
  assert.equal(readFiles({ files: [{ type: "image/png", size: 0 }] }).error, "invalid");
  assert.equal(readFiles({ files: Array(6).fill(image) }).error, "tooLarge");
  assert.equal(
    readFiles({
      files: [{ type: "image/png", size: FILE_LIMITS.image.bytes + 1 }],
    }).error,
    "tooLarge",
  );
  const video = { type: "video/quicktime", size: 1000 };
  assert.equal(readFiles({ files: [video, video] }).error, "tooLarge");
  assert.equal(readFiles({ files: [...Array(5).fill(image), video] }).files.length, 6);
});

test("only keys the relay hands out are linked", () => {
  assert.deepEqual(readAttachments({}), { keys: [] });
  assert.deepEqual(readAttachments({ attachments: [KEY, VIDEO] }), {
    keys: [KEY, VIDEO],
  });
  assert.equal(readAttachments({ attachments: ["../secret.png"] }).error, "invalid");
  assert.equal(readAttachments({ attachments: [`${KEY}?x`] }).error, "invalid");
  assert.equal(readAttachments({ attachments: [VIDEO, VIDEO.replace("1b", "2b")] }).error, "invalid");
});

test("the relay hands out upload addresses signed for each file's type and size", async () => {
  const answer = await post(
    { token: "t", repo: "o/n", uploads: UPLOADS, fetch: github().fetch },
    { files: [{ type: "image/png", size: 1234 }] },
    { path: "/uploads" },
  );
  assert.equal(answer.status, 200);
  const [{ key, url }] = answer.json.uploads;
  assert.match(key, /^reports\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.png$/);
  assert.ok(url.startsWith(`https://fm-lens-reports.s3.us-east-1.amazonaws.com/${key}?`));
  assert.match(url, /X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost/);
  assert.match(url, /X-Amz-Security-Token=session/);
  const bad = await post({ token: "t", repo: "o/n", uploads: UPLOADS }, { files: [] }, { path: "/uploads" });
  assert.equal(bad.status, 400);
  const off = await post(
    { token: "t", repo: "o/n" },
    { files: [{ type: "image/png", size: 1 }] },
    { path: "/uploads" },
  );
  assert.equal(off.status, 503);
});

/** GitHub, and the bucket answering HEAD with `size` for the files in `stored`. */
function githubAndBucket(stored, size = 1000) {
  const { fetch: issues, sent } = github();
  const fetch = async (url, init) => {
    if (init.method === "HEAD") {
      const found = stored.some((key) => url === publicUrl(UPLOADS.bucket, UPLOADS.region, key));
      return new Response(null, {
        status: found ? 200 : 403,
        headers: { "content-length": String(size) },
      });
    }
    return issues(url, init);
  };
  return { fetch, sent };
}

test("a report links its files: screenshots shown, a video as a link", async () => {
  const { fetch, sent } = githubAndBucket([KEY, VIDEO]);
  const options = { token: "t", repo: "o/n", uploads: UPLOADS, fetch };
  const answer = await post(options, { ...REPORT, attachments: [KEY, VIDEO] });
  assert.equal(answer.status, 201);
  const url = publicUrl(UPLOADS.bucket, UPLOADS.region, KEY);
  assert.match(sent[0].issue.body, /### Files\n\n!\[Screenshot 1\]\(https:\/\/fm-lens-reports\.s3/);
  assert.ok(sent[0].issue.body.includes(`![Screenshot 1](${url})`));
  assert.match(sent[0].issue.body, /\[Video\]\(https:\/\/[^)]+\.mov\)/);
});

test("a report whose files aren't in the bucket, or are too big, isn't filed", async () => {
  const missing = githubAndBucket([]);
  assert.equal(
    (await post({ token: "t", repo: "o/n", uploads: UPLOADS, fetch: missing.fetch }, { ...REPORT, attachments: [KEY] }))
      .status,
    400,
  );
  assert.equal(missing.sent.length, 0);
  const big = githubAndBucket([KEY], FILE_LIMITS.image.bytes + 1);
  assert.equal(
    (await post({ token: "t", repo: "o/n", uploads: UPLOADS, fetch: big.fetch }, { ...REPORT, attachments: [KEY] }))
      .status,
    400,
  );
  const noBucket = githubAndBucket([KEY]);
  assert.equal(
    (await post({ token: "t", repo: "o/n", fetch: noBucket.fetch }, { ...REPORT, attachments: [KEY] })).status,
    400,
  );
  assert.equal(issueFor(readReport(REPORT).report).body.includes("### Files"), false);
});
