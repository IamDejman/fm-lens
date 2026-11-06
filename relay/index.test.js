import assert from "node:assert/strict";
import { test } from "node:test";
import { PER_ADDRESS_HOUR, PER_DAY, createRelay, createTableLimiter, issueFor, readReport } from "./index.js";

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
