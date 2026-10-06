import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENTS_PER_BUCKET, MIN_BUCKETS, fullBucket, fullBucketCount } from "./fullBucket.js";

test("fullBucket is deterministic and within range", () => {
  assert.equal(fullBucket("young-turk-revolution", 64), fullBucket("young-turk-revolution", 64));
  for (const n of [1, 64, 1024]) {
    for (const id of ["a", "", "battle-of-x", "événement-é", "😀"]) {
      const b = fullBucket(id, n);
      assert.ok(Number.isInteger(b) && b >= 0 && b < n, `${id} / ${n}`);
    }
  }
});

test("fullBucket known values (guards writer/reader agreement)", () => {
  // FNV-1a 32-bit of "a" is 0xe40c292c
  assert.equal(fullBucket("a", 64), 0xe40c292c % 64);
  assert.equal(fullBucket("a", 1024), 0xe40c292c % 1024);
});

test("fullBucket refuses a missing or bad bucket count", () => {
  assert.throws(() => fullBucket("a"));
  assert.throws(() => fullBucket("a", 0));
  assert.throws(() => fullBucket("a", 2.5));
});

test("fullBucket spreads ids over most buckets", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(fullBucket(`event-${i}`, 64));
  assert.ok(seen.size > 64 * 0.9);
});

test("fullBucketCount: at least MIN_BUCKETS, a power of two, ~EVENTS_PER_BUCKET per bucket", () => {
  assert.equal(fullBucketCount(0), MIN_BUCKETS);
  assert.equal(fullBucketCount(571), 64);
  assert.equal(fullBucketCount(64 * EVENTS_PER_BUCKET), 64);
  assert.equal(fullBucketCount(64 * EVENTS_PER_BUCKET + 1), 128);
  for (const n of [900, 5000, 20000, 100000]) {
    const b = fullBucketCount(n);
    assert.equal(b & (b - 1), 0, `${b} is a power of two`);
    assert.ok(n / b <= EVENTS_PER_BUCKET && (b === MIN_BUCKETS || n / (b / 2) > EVENTS_PER_BUCKET), `${n} -> ${b}`);
  }
});
