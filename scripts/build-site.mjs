#!/usr/bin/env node
// Builds the website for publishing: copies site/ into the folder given, then writes into the copy what a search
// engine or a reader without scripts would otherwise miss.
// - The release notes, from the releases in IamDejman/fm-lens-releases, go into releases/index.html. The page in site/
//   fetches them in the browser, and still does when GitHub has a newer release than the page was published with.
// - Each page's last change goes into sitemap.xml: the day its file last changed in git, and for the release notes the
//   day of the latest release when that is later. Git needs the whole history for this, not a shallow clone.
//
// Usage: node scripts/build-site.mjs <folder>
// GITHUB_TOKEN, when set, goes to GitHub, which then answers more often. It stops when GitHub does not answer, or when
// a page no longer has the place it writes into.

import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseNotes, releaseNotesHtml } from "../site/release.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
/** The places in site/releases/index.html the notes are written into. */
const LIST = /<div id="releases" class="releases"><\/div>/;
const STATUS = /^ *<p id="status" role="status">[^<]*<\/p>\n/m;

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** The text with its one match of `place` replaced, stopping when it has none or several. */
function written(text, place, replacement, file) {
  const matches = text.match(new RegExp(place.source, `${place.flags}g`))?.length ?? 0;
  if (matches !== 1) {
    fail(`${file} has ${matches} of ${place}, where the build expects one.`);
  }
  return text.replace(place, () => replacement);
}

/** The day (2026-11-12) the file last changed in git, or null when git does not know the file. */
function lastChanged(file) {
  try {
    const day = execFileSync("git", ["-C", ROOT, "log", "-1", "--format=%cs", "--", file], { encoding: "utf8" });
    return day.trim() || null;
  } catch {
    return null;
  }
}

if (!process.argv[2]) {
  fail("Usage: node scripts/build-site.mjs <folder>");
}
const out = path.resolve(process.argv[2]);
if (out === SITE || out.startsWith(SITE + path.sep)) {
  fail("Build into a folder outside site/.");
}

const releases = await releaseNotes(process.env.GITHUB_TOKEN);
if (!releases || releases.length === 0) {
  fail("GitHub did not answer with the releases, so the site is not built.");
}
cpSync(SITE, out, { recursive: true });

const notesFile = path.join(out, "releases", "index.html");
let notes = readFileSync(notesFile, "utf8");
notes = written(notes, STATUS, "", "site/releases/index.html");
notes = written(
  notes,
  LIST,
  `<div id="releases" class="releases" data-latest="${releases[0].version}">\n${releaseNotesHtml(releases)}\n</div>`,
  "site/releases/index.html",
);
writeFileSync(notesFile, notes);

const latestRelease = releases[0].published.slice(0, 10);
const sitemapFile = path.join(out, "sitemap.xml");
const sitemap = readFileSync(sitemapFile, "utf8").replace(
  /<loc>https:\/\/getfmlens\.com(\/[^<]*)<\/loc>/g,
  (loc, page) => {
    let day = lastChanged(path.join("site", page, "index.html"));
    if (page === "/releases/" && (!day || latestRelease > day)) {
      day = latestRelease;
    }
    return day ? `${loc}<lastmod>${day}</lastmod>` : loc;
  },
);
writeFileSync(sitemapFile, sitemap);

console.log(`Built ${out} with the release notes up to FM Lens ${releases[0].version}.`);
