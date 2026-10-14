import test from "node:test";
import assert from "node:assert/strict";
import { importOr, isLoadFailure } from "./importOr.js";

const Fallback = () => null;
const Real = () => null;
const offline = () => new TypeError("Failed to fetch dynamically imported module: https://x/assets/A-12345678.js");

test("a chunk that loads is used, with one download", async () => {
  let calls = 0;
  const mod = await importOr(() => (calls++, Promise.resolve({ default: Real })), Fallback, { delay: 0 });
  assert.equal(mod.default, Real);
  assert.equal(calls, 1);
});

test("a failed download is retried once, and the retry's chunk is used", async () => {
  let calls = 0;
  const load = () => (++calls === 1 ? Promise.reject(offline()) : Promise.resolve({ default: Real }));
  const mod = await importOr(load, Fallback, { delay: 0 });
  assert.equal(mod.default, Real);
  assert.equal(calls, 2);
});

test("two failed downloads resolve to the fallback instead of rejecting", async () => {
  let calls = 0;
  const mod = await importOr(() => (calls++, Promise.reject(offline())), Fallback, { delay: 0 });
  assert.equal(mod.default, Fallback);
  assert.equal(calls, 2);
});

test("an error from running the module is rethrown, not retried or hidden", async () => {
  let calls = 0;
  const bug = new ReferenceError("x is not defined");
  await assert.rejects(importOr(() => (calls++, Promise.reject(bug)), Fallback, { delay: 0 }), bug);
  assert.equal(calls, 1);
});

test("isLoadFailure knows each engine's message and nothing else", () => {
  assert.ok(isLoadFailure(offline()));
  assert.ok(isLoadFailure(new TypeError("error loading dynamically imported module: https://x/a.js")));
  assert.ok(isLoadFailure(new TypeError("Importing a module script failed.")));
  assert.ok(!isLoadFailure(new TypeError("Cannot read properties of undefined (reading 'map')")));
  assert.ok(!isLoadFailure(new Error("Failed to fetch dynamically imported module")));
  assert.ok(!isLoadFailure(undefined));
});
