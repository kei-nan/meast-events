import test from "node:test";
import assert from "node:assert/strict";
import { missingReferencePoints, assertEnoughReferencePoints } from "./border-check.js";

test("missingReferencePoints: a measured baseline point the check no longer has", () => {
  assert.deepEqual(missingReferencePoints({ a: 1.5, b: 0 }, {}), ["a", "b"]);
  assert.deepEqual(missingReferencePoints({ a: 1.5, b: 0 }, { a: 2, b: null }), []);
});

test("missingReferencePoints: a point with no border near it in the baseline proves nothing", () => {
  assert.deepEqual(missingReferencePoints({ a: null }, {}), []);
  assert.deepEqual(missingReferencePoints(undefined, { a: 1 }), []);
});

test("assertEnoughReferencePoints: refuses an empty or much smaller fetch", () => {
  assert.throws(() => assertEnoughReferencePoints(0, 0), /returned 0/);
  assert.throws(() => assertEnoughReferencePoints(0, 280), /returned 0/);
  assert.throws(() => assertEnoughReferencePoints(251, 280), /--allow-fewer/);
  assert.doesNotThrow(() => assertEnoughReferencePoints(252, 280));
  assert.doesNotThrow(() => assertEnoughReferencePoints(300, 280));
});
