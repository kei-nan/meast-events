import test from "node:test";
import assert from "node:assert/strict";
import { decadeFloor, eventOverlapsRange, eventYearRange, rawEventYears, yearsReversed } from "./eventYears.js";

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

test("eventYearRange: an end date before the start date gives its two years, lower first", () => {
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

test("eventOverlapsRange: reversed dates match only the two years they name, not the years between", () => {
  // arab-cold-war as in the data: start 1979-02-11, end 1970-01-01 (flagged date_order_invalid).
  const e = { date_start: "1979-02-11", date_end: "1970-01-01" };
  assert.equal(yearsReversed(e), true);
  assert.equal(eventOverlapsRange(e, 1970, 1970), true);
  assert.equal(eventOverlapsRange(e, 1979, 1985), true);
  assert.equal(eventOverlapsRange(e, 1975, 1975), false);
  assert.equal(eventOverlapsRange(e, 1971, 1978), false);
  assert.equal(eventOverlapsRange(e, 1960, 1969), false);
  assert.equal(eventOverlapsRange(e, 1980, 2026), false);
  assert.equal(eventOverlapsRange(e, 1900, 2026), true);
  // iraqi-invasion-of-kuwait: 2009-08-02 to 1990-08-04 was listed in every year 1990-2009.
  const kuwait = { date_start: "2009-08-02", date_end: "1990-08-04" };
  const listedIn = [];
  for (let y = 1985; y <= 2015; y++) if (eventOverlapsRange(kuwait, y, y)) listedIn.push(y);
  assert.deepEqual(listedIn, [1990, 2009]);
  // An end earlier in the same year (passover-massacre: 2002-03-27, coarse end 2002-01-01) is not reversed by year.
  const passover = { date_start: "2002-03-27", date_end: "2002-01-01" };
  assert.equal(yearsReversed(passover), false);
  assert.equal(eventOverlapsRange(passover, 2002, 2002), true);
  // In-order and open-ended records are unchanged.
  assert.equal(yearsReversed({ date_start: "1980-09-22", date_end: "1988-08-20" }), false);
  assert.equal(yearsReversed({ date_start: "1980-09-22", date_end: null }), false);
});
