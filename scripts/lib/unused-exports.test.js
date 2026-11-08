import test from "node:test";
import assert from "node:assert/strict";
import { exportedNames, unusedExports } from "./unused-exports.js";

test("exportedNames: declarations and export lists, not re-exports", () => {
  const src = [
    "export function a() {}",
    "export async function b() {}",
    "export const c = 1;",
    "export class D {}",
    "const e = 1, f = 2;",
    "export { e, f as g };",
    'export { h } from "./other.js";',
    "function local() {}",
    "export default local;",
  ].join("\n");
  assert.deepEqual(exportedNames(src), ["a", "b", "c", "D", "e", "g"]);
});

test("unusedExports: a name another file mentions is used; tests count, the file itself does not", () => {
  const files = {
    "lib/a.js": "export function used() {}\nexport function testedOnly() {}\nexport function dead() { dead(); }\nexport const $x = 1;",
    "lib/b.js": 'import { used } from "./a.js";\nused();',
    "lib/a.test.js": 'import { testedOnly } from "./a.js";',
    "lib/hooks.mjs": "export function initialize() {}",
  };
  const read = (f) => files[f];
  assert.deepEqual(unusedExports(Object.keys(files), read), ["lib/a.js: dead", "lib/a.js: $x", "lib/hooks.mjs: initialize"]);
  // a runtime-called name can be allowed
  assert.deepEqual(unusedExports(Object.keys(files), read, new Set(["lib/hooks.mjs:initialize"])), ["lib/a.js: dead", "lib/a.js: $x"]);
});

test("unusedExports: whole words only (usedLater does not count as used)", () => {
  const files = { "a.js": "export const used = 1;", "b.js": "const usedLater = 2; const xused = 3;" };
  assert.deepEqual(unusedExports(Object.keys(files), (f) => files[f]), ["a.js: used"]);
});
