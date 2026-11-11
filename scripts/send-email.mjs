#!/usr/bin/env node
// Sends an email to everyone on FM Lens's list, from news@getfmlens.com with Amazon SES. The list is the DynamoDB table
// fm-lens-subscribers that the report relay keeps (relay/index.js); relay/setup-email.sh sets the list and SES up.
//
// Usage: AWS_PROFILE=<the relay's account> node scripts/send-email.mjs <email file> [--test <address> | --send]
// - With neither, it changes nothing: it says how many it would send to and prints the email.
// - --test sends it to <address> alone.
// - --send sends it to everyone on the list. Each address it sends to is added to <email file>.sent, so running it
//   again after it stops sends only to the rest.
//
// The email file is plain text: the subject on the first line, a blank line, then the email, with a blank line between
// paragraphs. Links are made clickable. Every email ends with a link to unsubscribe, and carries the headers that let
// email apps show their own unsubscribe button. Addresses SES won't send to, after a bounce or a complaint, are skipped
// and marked so on the list.

import { execFile } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const FROM = "FM Lens <news@getfmlens.com>";
const TABLE = "fm-lens-subscribers";
const LIST_REGION = "us-east-1";
const SES_REGION = "eu-west-1";
/** The report relay, as in app/src/report.ts: email apps' unsubscribe button posts to it. */
const RELAY = "https://5om2ly4fvanjhg425jlb7s26dm0etzak.lambda-url.us-east-1.on.aws";
/** How many emails are sent at once: SES lets this account send 14 a second. */
const AT_ONCE = 5;

const run = promisify(execFile);

/** Runs the AWS CLI with `args` and gives its JSON answer. */
async function aws(...args) {
  const { stdout } = await run("aws", [...args, "--output", "json"], { maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim() === "" ? {} : JSON.parse(stdout);
}

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const linked = (html) =>
  html.replace(/https?:\/\/[^\s<]*[^\s<.,:;!?)]/g, (url) => `<a href="${url}" style="color:#5b3fd1">${url}</a>`);

/** The email in `file`: its subject and its paragraphs. */
function readEmailFile(file) {
  const [subject, blank, ...rest] = readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
  const paragraphs = rest
    .join("\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!subject?.trim() || blank?.trim() !== "" || paragraphs.length === 0) {
    throw new Error(`${file} needs the subject on its first line, a blank line, then the email.`);
  }
  return { subject: subject.trim(), paragraphs };
}

/** The email for `to`, whose unsubscribe link carries `token`, as SES's SendEmail takes it. */
function emailFor({ subject, paragraphs }, to, token) {
  const query = `email=${encodeURIComponent(to)}&token=${token}`;
  const unsubscribe = `https://getfmlens.com/unsubscribe/?${query}`;
  const text = `${paragraphs.join("\n\n")}\n\n--\nUnsubscribe: ${unsubscribe}\n`;
  const html = [
    '<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff">',
    '<div style="max-width:560px;margin:0 auto;font:16px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f">',
    ...paragraphs.map((paragraph) => `<p>${linked(escape(paragraph)).replace(/\n/g, "<br>")}</p>`),
    `<p style="margin-top:32px;font-size:13px"><a href="${escape(unsubscribe)}" style="color:#6e6e73">Unsubscribe</a></p>`,
    "</div></body></html>",
  ].join("\n");
  const utf8 = (Data) => ({ Data, Charset: "UTF-8" });
  return {
    FromEmailAddress: FROM,
    Destination: { ToAddresses: [to] },
    ConfigurationSetName: "fm-lens",
    Content: {
      Simple: {
        Subject: utf8(subject),
        Body: { Text: utf8(text), Html: utf8(html) },
        Headers: [
          { Name: "List-Unsubscribe", Value: `<${RELAY}/unsubscribe?${query}>` },
          { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
        ],
      },
    },
  };
}

/** Everyone on the list, as `{ email, status, token }`. */
async function readList() {
  const { Items = [] } = await aws("dynamodb", "scan", "--table-name", TABLE, "--region", LIST_REGION);
  return Items.map((item) => ({ email: item.email.S, status: item.status?.S, token: item.token?.S }));
}

/** The addresses SES won't send to, with why: "BOUNCE" or "COMPLAINT". */
async function readSuppressed() {
  const { SuppressedDestinationSummaries = [] } = await aws(
    "sesv2",
    "list-suppressed-destinations",
    "--region",
    SES_REGION,
  );
  return new Map(SuppressedDestinationSummaries.map((row) => [row.EmailAddress.toLowerCase(), row.Reason]));
}

/** Marks `email` on the list as one SES won't send to. */
async function markSuppressed(email, reason) {
  await aws(
    "dynamodb",
    "update-item",
    "--region",
    LIST_REGION,
    "--table-name",
    TABLE,
    "--key",
    JSON.stringify({ email: { S: email } }),
    "--update-expression",
    "SET #status = :reason",
    "--expression-attribute-names",
    JSON.stringify({ "#status": "status" }),
    "--expression-attribute-values",
    JSON.stringify({ ":reason": { S: reason === "COMPLAINT" ? "complained" : "bounced" } }),
  );
}

async function send(email) {
  await aws("sesv2", "send-email", "--region", SES_REGION, "--cli-input-json", JSON.stringify(email));
}

async function main() {
  const [file, flag, address] = process.argv.slice(2);
  if (!file || (flag && !["--test", "--send"].includes(flag)) || (flag === "--test" && !address)) {
    throw new Error("Usage: node scripts/send-email.mjs <email file> [--test <address> | --send]");
  }
  const email = readEmailFile(file);
  const list = await readList();

  if (flag === "--test") {
    const to = address.trim().toLowerCase();
    const row = list.find((entry) => entry.email === to);
    if (!row) {
      console.warn(`${to} is not on the list, so its unsubscribe link won't work.`);
    }
    await send(emailFor(email, to, row?.token ?? "0".repeat(32)));
    console.log(`Sent "${email.subject}" to ${to}.`);
    return;
  }

  const log = `${file}.sent`;
  const sent = new Set(existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []);
  const suppressed = await readSuppressed();
  const active = list.filter((entry) => entry.status === "active");
  const blocked = active.filter((entry) => suppressed.has(entry.email));
  const to = active.filter((entry) => !suppressed.has(entry.email) && !sent.has(entry.email));
  console.log(
    `"${email.subject}": ${to.length} to send to, of ${active.length} on the list` +
      (sent.size > 0 ? `, ${sent.size} sent already` : "") +
      (blocked.length > 0 ? `, ${blocked.length} SES won't send to` : "") +
      ".",
  );

  if (flag !== "--send") {
    console.log(`\n${emailFor(email, "you@example.com", "0".repeat(32)).Content.Simple.Body.Text.Data}`);
    console.log("Nothing sent. --test <address> sends it to one address, --send to everyone.");
    return;
  }

  for (const entry of blocked) {
    await markSuppressed(entry.email, suppressed.get(entry.email));
  }
  const failed = [];
  let next = 0;
  const worker = async () => {
    while (next < to.length) {
      const entry = to[next++];
      try {
        await send(emailFor(email, entry.email, entry.token));
        appendFileSync(log, `${entry.email}\n`);
      } catch (err) {
        failed.push(`${entry.email}: ${err instanceof Error ? err.message.trim() : String(err)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  console.log(`Sent to ${to.length - failed.length}.`);
  if (failed.length > 0) {
    console.error(`Not sent to ${failed.length}; run it again to try them:\n${failed.join("\n")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
