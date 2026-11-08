import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/keys.ts", import.meta.url), "utf8");
for (const platform of ["MacIntel", "Win32"]) {
  test(`modal interception covers every navigation shortcut on ${platform}`, () => {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText, { exports, navigator: { platform } });
    const { isAppShortcut, isShortcut, SECTION_SHORTCUTS } = exports;
    const event = (key, overrides = {}) => ({
      key, metaKey: platform === "MacIntel", ctrlKey: platform !== "MacIntel",
      altKey: false, shiftKey: false, isComposing: false, ...overrides,
    });
    assert.equal(SECTION_SHORTCUTS.length, 9);
    for (const key of SECTION_SHORTCUTS) {
      assert.equal(isShortcut(event(key), key), true);
      assert.equal(isAppShortcut(event(key)), true, `modal must intercept ${key}`);
      for (const overrides of [{ altKey: true }, { shiftKey: true }, { isComposing: true },
        { metaKey: false, ctrlKey: false }, { metaKey: true, ctrlKey: true }]) {
        assert.equal(isAppShortcut(event(key, overrides)), false);
      }
    }
    for (const key of ["f", "s", ","]) assert.equal(isAppShortcut(event(key)), true);
    for (const key of ["0", "a", "c", "v"]) assert.equal(isAppShortcut(event(key)), false);
  });
}
