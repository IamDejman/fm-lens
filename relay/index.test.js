import assert from "node:assert/strict";
import { test } from "node:test";
import { PER_ADDRESS_HOUR, PER_DAY, createLimiter, createRelay, issueFor, readReport } from "./index.js";

const REPORT = {
  what: "Apply failed on a wage\nIt said the value didn't stick.",
  version: "0.5.6",
  fmBuild: "FM27 Steam 26340721, editing on",
  macos: "macOS 27.2, Apple Silicon",
  changes: "Kabia (player 2000216551): contract.wage 2000 → 7045",
};

/** Sends the relay `body` at `path` as a function URL request from `sourceIp`, and returns the status and JSON answer. */
async function post(options, body, { path = "/report", sourceIp = "203.0.113.9", method = "POST" } = {}) {
  const relay = createRelay(options);
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

test("one address may send a few reports an hour, and all of them a few a day", () => {
  let now = 0;
  const limiter = createLimiter(() => now);
  for (let i = 0; i < PER_ADDRESS_HOUR; i++) {
    assert.equal(limiter.allow("a"), true);
  }
  assert.equal(limiter.allow("a"), false);
  assert.equal(limiter.allow("b"), true);
  now += 60 * 60 * 1000;
  assert.equal(limiter.allow("a"), true);

  const day = createLimiter(() => now);
  for (let i = 0; i < PER_DAY; i++) {
    assert.equal(day.allow(`address-${i}`), true);
  }
  assert.equal(day.allow("another"), false);
});

test("the relay counts reports by the address AWS saw, and answers the preflight", async () => {
  const { fetch } = github();
  const limiter = createLimiter();
  const options = { token: "t", repo: "o/n", fetch, limiter };
  for (let i = 0; i < PER_ADDRESS_HOUR; i++) {
    assert.equal((await post(options, REPORT)).status, 201);
  }
  assert.equal((await post(options, REPORT)).status, 429);
  assert.equal((await post(options, REPORT, { sourceIp: "198.51.100.4" })).status, 201);
  assert.deepEqual(await post(options, "", { method: "OPTIONS" }), { status: 204, json: null, cors: "*" });
});

test("turned-away addresses aren't kept, so the limiter stays small", () => {
  let now = 0;
  const limiter = createLimiter(() => now);
  for (let i = 0; i < PER_DAY; i++) {
    limiter.allow(`address-${i}`);
  }
  for (let i = 0; i < 10_000; i++) {
    assert.equal(limiter.allow(`flood-${i}`), false);
  }
  now += 60 * 60 * 1000;
  assert.equal(limiter.allow("flood-0"), false);
  now += 24 * 60 * 60 * 1000;
  assert.equal(limiter.allow("flood-0"), true);
});
