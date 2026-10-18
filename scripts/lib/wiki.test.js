import test from "node:test";
import assert from "node:assert/strict";
import { datePrecisionFor, precisionCode, precisionName, yearOf, yearsIn } from "./wiki.js";

// The shape fetchEntity returns: pit (P585) and start (P580) as {date, precision}.
const entity = (pit = [], start = []) => ({ pit, start, end: [] });

test("datePrecisionFor: no entity or no candidate dates gives null", () => {
  assert.equal(datePrecisionFor(null, "1956-10-29"), null);
  assert.equal(datePrecisionFor(undefined, "1956-10-29"), null);
  assert.equal(datePrecisionFor(entity(), "1956-10-29"), null);
});

test("datePrecisionFor: matches the stored date among the point-in-time values", () => {
  const e = entity([
    { date: "1956-01-01", precision: 9 },
    { date: "1956-10-29", precision: 11 },
  ]);
  assert.deepEqual(datePrecisionFor(e, "1956-10-29"), { code: 11, name: "day" });
});

test("datePrecisionFor: falls back to the first value when no date matches", () => {
  const e = entity([
    { date: "1956-10-01", precision: 10 },
    { date: "1956-10-29", precision: 11 },
  ]);
  assert.deepEqual(datePrecisionFor(e, "1957-03-07"), { code: 10, name: "month" });
});

test("datePrecisionFor: P585 wins over P580; P580 is used only when P585 is empty", () => {
  const both = entity([{ date: "1967-06-05", precision: 9 }], [{ date: "1967-06-05", precision: 11 }]);
  assert.deepEqual(datePrecisionFor(both, "1967-06-05"), { code: 9, name: "year" });
  const startOnly = entity([], [{ date: "1960-01-01", precision: 8 }]);
  assert.deepEqual(datePrecisionFor(startOnly, "1960-01-01"), { code: 8, name: "decade" });
});

test("datePrecisionFor: an unknown precision code keeps its code with a null name", () => {
  assert.deepEqual(datePrecisionFor(entity([{ date: "2000-01-01", precision: 42 }]), "2000-01-01"), { code: 42, name: null });
});

test("precisionName and precisionCode are inverses for Wikidata's codes", () => {
  for (const code of [0, 7, 8, 9, 10, 11, 14]) assert.equal(precisionCode(precisionName(code)), code);
  assert.equal(precisionName(15), null);
  assert.equal(precisionCode("fortnight"), null);
});

test("yearsIn: distinct four-digit years in [1000, 2099], in order of first appearance", () => {
  assert.deepEqual(yearsIn("The war of 1948 (1948–1949) ended in 1949."), [1948, 1949]);
  assert.deepEqual(yearsIn("In 2099, 2100 and 0999 and 999."), [2099]);
  assert.deepEqual(yearsIn("Founded 1187; rebuilt 2003"), [1187, 2003]);
});

test("yearsIn: only whole words, so longer numbers and codes are not years", () => {
  assert.deepEqual(yearsIn("Population 19480 and ID A1948B and 12345"), []);
  assert.deepEqual(yearsIn("1956-10-29"), [1956]);
});

test("yearsIn: min and max narrow the window", () => {
  assert.deepEqual(yearsIn("1900 1950 2000", { min: 1920, max: 1990 }), [1950]);
  assert.deepEqual(yearsIn("1900 1950 2000", { min: 1950 }), [1950, 2000]);
});

test("yearsIn: empty or missing text gives []", () => {
  assert.deepEqual(yearsIn(""), []);
  assert.deepEqual(yearsIn(null), []);
  assert.deepEqual(yearsIn(undefined), []);
  assert.deepEqual(yearsIn("no years here"), []);
});

test("yearOf: the leading year of an ISO-like date, BCE included", () => {
  assert.equal(yearOf("1956-10-29"), 1956);
  assert.equal(yearOf("1956"), 1956);
  assert.equal(yearOf("0632-06-08"), 632);
  assert.equal(yearOf("-0331-10-01"), -331);
});

test("yearOf: missing or non-numeric input gives null", () => {
  assert.equal(yearOf(null), null);
  assert.equal(yearOf(""), null);
  assert.equal(yearOf("circa 1950"), null);
});
