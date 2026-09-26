import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// worker/src/logic.js and server/index.js carry the same request-parsing /
// query-building / shaping code; this fails if they drift apart.
const block = (file, name) => {
  const src = readFileSync(new URL(file, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const m = src.match(new RegExp(`// BEGIN SHARED ${name}\\n([\\s\\S]*?)// END SHARED ${name}`));
  assert.ok(m, `${file} has no shared-${name} block`);
  return m[1].replace(/^export /gm, "");
};

for (const name of ["LOGIC", "CORS"]) {
  test(`server/index.js shared ${name} is identical to worker/src/logic.js`, () => {
    assert.equal(block("../../server/index.js", name), block("../src/logic.js", name));
  });
}
