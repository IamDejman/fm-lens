import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../../site/release.js", import.meta.url), "utf8");
const { VERSION, latestRelease } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const script = readFileSync(new URL("../../scripts/release.sh", import.meta.url), "utf8");
const files = "https://github.com/IamDejman/fm-lens-releases/releases/download";

test("the site offers the version it names when GitHub refuses or cannot be reached", async (t) => {
  const known = {
    version: VERSION,
    downloads: {
      mac: `${files}/v${VERSION}/FM-Lens-${VERSION}-macos-universal.dmg`,
      windows: `${files}/v${VERSION}/FM-Lens-${VERSION}-windows-x64-setup.exe`,
    },
  };
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 403 }));
  assert.deepEqual(await latestRelease(), known);
  globalThis.fetch.mock.mockImplementation(async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.deepEqual(await latestRelease(), known);
});

test("every release also carries its downloads under names without the version", () => {
  for (const name of ["FM-Lens-macos-universal.dmg", "FM-Lens-windows-x64-setup.exe"]) {
    assert.ok(script.includes(`="${name}"`), `scripts/release.sh names ${name}`);
  }
  assert.ok(script.includes('"$OUT/$MAC_LATEST" "$OUT/$WINDOWS_LATEST"\n'), "scripts/release.sh publishes them");
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
