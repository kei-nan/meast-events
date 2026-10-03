import test from "node:test";
import assert from "node:assert/strict";
import { formatEventDate } from "./eventDate.js";

test("collapses a range within one month", () => {
  assert.equal(formatEventDate("1967-06-05", "1967-06-10"), "5–10 June 1967");
});

test("a single day, or an end equal to the start", () => {
  assert.equal(formatEventDate("1978-09-17", null), "17 September 1978");
  assert.equal(formatEventDate("1978-09-17", "1978-09-17"), "17 September 1978");
});

test("shares the year across months", () => {
  assert.equal(formatEventDate("1967-06-05", "1967-07-10"), "5 June – 10 July 1967");
});

test("1 January reads as year only, the 1st of a month as month only", () => {
  assert.equal(formatEventDate("1948-05-15", "1949-01-01"), "15 May 1948 – 1949");
  assert.equal(formatEventDate("1967-07-01", "1970-08-07"), "July 1967 – 7 August 1970");
  assert.equal(formatEventDate("1915-01-01", "1917-01-01"), "1915–1917");
  assert.equal(formatEventDate("1909-04-01", null), "April 1909");
  assert.equal(formatEventDate("1999-12-01", "1999-12-31"), "December 1999 – 31 December 1999");
  assert.equal(formatEventDate("1949-06-01", "1949-09-01"), "June – September 1949");
});

test("handles Wikidata's zero-padded coarse dates", () => {
  assert.equal(formatEventDate("1940-00-00", null), "1940");
  assert.equal(formatEventDate("1940-05-00", null), "May 1940");
});

test("yearOnly shows only the years, in the order given", () => {
  assert.equal(formatEventDate("1921-04-01", "1921-03-31", { yearOnly: true }), "1921");
  assert.equal(formatEventDate("2009-08-02", "1990-08-04", { yearOnly: true }), "2009–1990");
});
