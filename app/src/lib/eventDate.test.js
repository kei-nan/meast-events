import test from "node:test";
import assert from "node:assert/strict";
import { formatEventDate } from "./eventDate.js";

test("start follows its recorded precision", () => {
  assert.equal(formatEventDate("1978-09-17", null, { precision: "day" }), "17 September 1978");
  assert.equal(formatEventDate("1909-04-01", null, { precision: "month" }), "April 1909");
  assert.equal(formatEventDate("1915-01-01", null, { precision: "year" }), "1915");
  assert.equal(formatEventDate("1948-05-15", null, { precision: "decade" }), "1948");
});

test("missing precision shows the year only", () => {
  assert.equal(formatEventDate("1967-06-05", "1967-06-10"), "1967");
  assert.equal(formatEventDate("1967-08-29", "1968-09-01"), "1967–1968");
});

test("keeps a recorded 1st of the month", () => {
  assert.equal(formatEventDate("1918-10-01", null, { precision: "day" }), "1 October 1918");
});

test("the end shows as a year only", () => {
  assert.equal(formatEventDate("2003-03-20", "2011-12-15", { precision: "day" }), "20 March 2003 – 2011");
  assert.equal(formatEventDate("1967-06-05", "1967-06-10", { precision: "day" }), "5 June 1967 (ended 1967)");
  assert.equal(formatEventDate("1915-07-01", "1916-08-01", { precision: "month" }), "July 1915 – 1916");
  assert.equal(formatEventDate("1915-01-01", "1917-01-01", { precision: "year" }), "1915–1917");
  assert.equal(formatEventDate("1915-01-01", "1915-07-31", { precision: "year" }), "1915");
});

test("an end equal to the start is a single date", () => {
  assert.equal(formatEventDate("1978-09-17", "1978-09-17", { precision: "day" }), "17 September 1978");
});

test("yearOnly, or an end before the start, shows only the years in the order given", () => {
  assert.equal(formatEventDate("1921-04-01", "1921-03-31", { precision: "day", yearOnly: true }), "1921");
  assert.equal(formatEventDate("2009-08-02", "1990-08-04", { precision: "day", yearOnly: true }), "2009–1990");
  assert.equal(formatEventDate("2009-08-02", "1990-08-04", { precision: "day" }), "2009–1990");
});
