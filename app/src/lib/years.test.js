import test from "node:test";
import assert from "node:assert/strict";
import { MIN_YEAR, MAX_YEAR, lastYear } from "./years.js";

// Imports a fresh copy of years.js (a new module URL) with `new Date()` pinned to `iso`.
async function yearsAt(iso, tag) {
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [iso]));
    }
  };
  try {
    return await import(`./years.js?at=${tag}`);
  } finally {
    globalThis.Date = RealDate;
  }
}

test("the timeline starts in 1900 and ends in the current UTC year", () => {
  assert.equal(MIN_YEAR, 1900);
  assert.equal(MAX_YEAR, new Date().getUTCFullYear());
  assert.ok(Number.isInteger(MAX_YEAR) && MAX_YEAR > MIN_YEAR);
});

test("MAX_YEAR follows the clock: the timeline grows on 1 January without a code change", async () => {
  assert.equal((await yearsAt("2031-01-01T00:00:00Z", "a")).MAX_YEAR, 2031);
  assert.equal((await yearsAt("2030-12-31T23:59:59Z", "b")).MAX_YEAR, 2030);
});

test("MAX_YEAR uses UTC, not the local time zone", async () => {
  // 00:30 on 1 January in UTC+2 is still 31 December in UTC.
  assert.equal((await yearsAt("2031-01-01T00:30:00+02:00", "c")).MAX_YEAR, 2030);
  // 23:30 on 31 December in UTC-5 is already 1 January in UTC.
  assert.equal((await yearsAt("2030-12-31T23:30:00-05:00", "d")).MAX_YEAR, 2031);
});

test("lastYear: no build year known (the build, tests) -> the clock's year", () => {
  assert.equal(lastYear(2026, null), 2026);
  assert.equal(lastYear(2031, undefined), 2031);
});

test("lastYear: a clock behind the build keeps the build's years", () => {
  assert.equal(lastYear(2024, 2026), 2026);
  assert.equal(lastYear(1999, 2026), 2026);
});

test("lastYear: grows with the clock within the build's decade, never into an unbuilt one", () => {
  assert.equal(lastYear(2027, 2026), 2027);
  assert.equal(lastYear(2029, 2026), 2029);
  // 1 January 2030 before a rebuild: boundaries/2030.json was not written.
  assert.equal(lastYear(2030, 2026), 2029);
  assert.equal(lastYear(2045, 2026), 2029);
  assert.equal(lastYear(2030, 2030), 2030);
  assert.equal(lastYear(2035, 2030), 2035);
});

test("MAX_YEAR in a bundle: the visitor's clock clamped to the build's year (__DATA_MAX_YEAR__)", async () => {
  globalThis.__DATA_MAX_YEAR__ = 2026;
  try {
    assert.equal((await yearsAt("2030-01-01T00:00:00Z", "e")).MAX_YEAR, 2029);
    assert.equal((await yearsAt("2025-06-01T00:00:00Z", "f")).MAX_YEAR, 2026);
    assert.equal((await yearsAt("2027-06-01T00:00:00Z", "g")).MAX_YEAR, 2027);
  } finally {
    delete globalThis.__DATA_MAX_YEAR__;
  }
});
