import test from "node:test";
import assert from "node:assert/strict";
import { decadeFloor, eventOverlapsRange, eventYearRange, rawEventYears } from "./eventYears.js";

test("decadeFloor: the decade a year falls in", () => {
  assert.equal(decadeFloor(1900), 1900);
  assert.equal(decadeFloor(1909), 1900);
  assert.equal(decadeFloor(1910), 1910);
  assert.equal(decadeFloor(2026), 2020);
});

test("eventYearRange: start and end years, end defaults to start", () => {
  assert.deepEqual(eventYearRange({ date_start: "1948-05-15", date_end: "1949-07-20" }), [1948, 1949]);
  assert.deepEqual(eventYearRange({ date_start: "1967-06-05" }), [1967, 1967]);
  assert.deepEqual(eventYearRange({ date_start: "1967-06-05", date_end: null }), [1967, 1967]);
});

test("eventYearRange: an end date before the start date gives the span between them", () => {
  // As in the data (Wikidata) for iraqi-invasion-of-kuwait and arab-cold-war.
  const kuwait = { date_start: "2009-08-02", date_end: "1990-08-04" };
  assert.deepEqual(eventYearRange(kuwait), [1990, 2009]);
  // The raw order is kept for labels.
  assert.deepEqual(rawEventYears(kuwait), [2009, 1990]);
});

test("eventOverlapsRange: inclusive overlap", () => {
  const e = { date_start: "1980-09-22", date_end: "1988-08-20" };
  assert.equal(eventOverlapsRange(e, 1988, 1990), true);
  assert.equal(eventOverlapsRange(e, 1970, 1980), true);
  assert.equal(eventOverlapsRange(e, 1989, 2000), false);
  assert.equal(eventOverlapsRange(e, 1900, 1979), false);
});

test("eventOverlapsRange: reversed dates still match every year they span", () => {
  const e = { date_start: "1979-02-11", date_end: "1970-01-01" };
  assert.equal(eventOverlapsRange(e, 1970, 1970), true);
  assert.equal(eventOverlapsRange(e, 1975, 1975), true);
  assert.equal(eventOverlapsRange(e, 1979, 1985), true);
  assert.equal(eventOverlapsRange(e, 1960, 1969), false);
  assert.equal(eventOverlapsRange(e, 1980, 2026), false);
});
