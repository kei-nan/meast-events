import { test } from "node:test";
import assert from "node:assert/strict";
import { FULL_BUCKETS, fullBucket } from "./fullBucket.js";

test("fullBucket is deterministic and within range", () => {
  assert.equal(fullBucket("young-turk-revolution"), fullBucket("young-turk-revolution"));
  for (const id of ["a", "", "battle-of-x", "événement-é", "😀"]) {
    const b = fullBucket(id);
    assert.ok(Number.isInteger(b) && b >= 0 && b < FULL_BUCKETS, id);
  }
});

test("fullBucket known values (guards writer/reader agreement)", () => {
  // FNV-1a 32-bit of "a" is 0xe40c292c
  assert.equal(fullBucket("a"), 0xe40c292c % FULL_BUCKETS);
});

test("fullBucket spreads ids over most buckets", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(fullBucket(`event-${i}`));
  assert.ok(seen.size > FULL_BUCKETS * 0.9);
});
