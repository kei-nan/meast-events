import test from "node:test";
import assert from "node:assert/strict";
import { MIN_YEAR, MAX_YEAR } from "./years.js";

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
