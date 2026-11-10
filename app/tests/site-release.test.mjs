import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../../site/release.js", import.meta.url), "utf8");
const { VERSION, latestRelease } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const app = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")).version;
const files = "https://github.com/IamDejman/fm-lens-releases/releases/download";

test("the site names the app's version for when GitHub does not answer", () => {
  assert.equal(VERSION, app);
});

test("the site offers the version it names when GitHub refuses or cannot be reached", async (t) => {
  const known = {
    version: app,
    downloads: {
      mac: `${files}/v${app}/FM-Lens-${app}-macos-universal.dmg`,
      windows: `${files}/v${app}/FM-Lens-${app}-windows-x64-setup.exe`,
    },
  };
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 403 }));
  assert.deepEqual(await latestRelease(), known);
  globalThis.fetch.mock.mockImplementation(async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.deepEqual(await latestRelease(), known);
});

test("the site offers GitHub's latest release when it answers", async (t) => {
  const asset = (name) => ({ name, browser_download_url: `${files}/v9.9.9/${name}` });
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v9.9.9",
      assets: [asset("FM-Lens-9.9.9-macos-universal.dmg"), asset("FM-Lens-9.9.9-windows-x64-setup.exe"), asset("latest.json")],
    }),
  }));
  assert.deepEqual(await latestRelease(), {
    version: "9.9.9",
    downloads: {
      mac: `${files}/v9.9.9/FM-Lens-9.9.9-macos-universal.dmg`,
      windows: `${files}/v9.9.9/FM-Lens-9.9.9-windows-x64-setup.exe`,
    },
  });
});
