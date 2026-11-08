import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("every formation the editor offers has FM's name", () => {
  const named = new Set([...read("../src/formationNames.ts").matchAll(/^\s+(\d+): "/gm)].map((m) => Number(m[1])));
  const lists = [...read("../../crates/fmlens-core/src/edit.rs").matchAll(/_FORMATIONS: \[i64; \d+\] = \[([^\]]+)\]/g)];
  assert.equal(lists.length, 2);
  for (const [, ids] of lists) {
    for (const id of ids.split(",").map(Number)) assert.ok(named.has(id), `formation ${id} has no name`);
  }
});
