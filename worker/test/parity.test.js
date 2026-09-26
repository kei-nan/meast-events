import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// worker/src/logic.js and server/index.js carry the same request-parsing /
// query-building / shaping code; this fails if they drift apart.
const block = (file) => {
  const src = readFileSync(new URL(file, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const m = src.match(/\/\/ BEGIN SHARED LOGIC\n([\s\S]*?)\/\/ END SHARED LOGIC/);
  assert.ok(m, `${file} has no shared-logic block`);
  return m[1].replace(/^export /gm, "");
};

test("server/index.js shared logic is identical to worker/src/logic.js", () => {
  assert.equal(block("../../server/index.js"), block("../src/logic.js"));
});
