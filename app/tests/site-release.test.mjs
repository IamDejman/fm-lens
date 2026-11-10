import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../../site/release.js", import.meta.url), "utf8");
const { release } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const script = readFileSync(new URL("../../scripts/release.sh", import.meta.url), "utf8");
const releases = "https://github.com/IamDejman/fm-lens-releases/releases";
const latest = {
  version: null,
  downloads: {
    mac: `${releases}/latest/download/FM-Lens-macos-universal.dmg`,
    windows: `${releases}/latest/download/FM-Lens-windows-x64-setup.exe`,
  },
};

test("the site offers the latest downloads when GitHub refuses or cannot be reached", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 403 }));
  assert.deepEqual(await release(), latest);
  globalThis.fetch.mock.mockImplementation(async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.deepEqual(await release(), latest);
});

test("every release carries the downloads under the names the site falls back to", () => {
  for (const url of Object.values(latest.downloads)) {
    const name = url.split("/").pop();
    assert.ok(script.includes(`="${name}"`), `scripts/release.sh publishes ${name}`);
  }
  assert.match(script, /gh release create [^\n]*(\\\n[^\n]*)*"\$OUT\/\$MAC_LATEST" "\$OUT\/\$WINDOWS_LATEST"/);
});

test("the site offers GitHub's latest release when it answers", async (t) => {
  const asset = (name) => ({ name, browser_download_url: `${releases}/download/v9.9.9/${name}` });
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({
      tag_name: "v9.9.9",
      assets: [asset("FM-Lens-9.9.9-macos-universal.dmg"), asset("FM-Lens-9.9.9-windows-x64-setup.exe"), asset("latest.json")],
    }),
  }));
  assert.deepEqual(await release(), {
    version: "9.9.9",
    downloads: {
      mac: `${releases}/download/v9.9.9/FM-Lens-9.9.9-macos-universal.dmg`,
      windows: `${releases}/download/v9.9.9/FM-Lens-9.9.9-windows-x64-setup.exe`,
    },
  });
});

test("the site asks GitHub for the version a download names", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ tag_name: "v0.7.2", assets: [] }) }));
  const api = "https://api.github.com/repos/IamDejman/fm-lens-releases/releases";
  assert.equal((await release("0.7.2")).version, "0.7.2");
  assert.equal(globalThis.fetch.mock.calls[0].arguments[0], `${api}/tags/v0.7.2`);
  await release("../../other");
  assert.equal(globalThis.fetch.mock.calls[1].arguments[0], `${api}/latest`);
});
