import test from "node:test";
import assert from "node:assert/strict";
import { importOr } from "./importOr.js";

const Fallback = () => null;
const Real = () => null;

test("a chunk that loads is used", async () => {
  const mod = await importOr(() => Promise.resolve({ default: Real }), Fallback);
  assert.equal(mod.default, Real);
});

test("a failed download resolves to the fallback instead of rejecting", async () => {
  const mod = await importOr(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")), Fallback);
  assert.equal(mod.default, Fallback);
});
