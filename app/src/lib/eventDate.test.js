import test from "node:test";
import assert from "node:assert/strict";
import { coarsePeriodLabel, formatEventDate } from "./eventDate.js";

test("start follows its recorded precision", () => {
  assert.equal(formatEventDate("1978-09-17", null, { precision: "day" }), "17 September 1978");
  assert.equal(formatEventDate("1909-04-01", null, { precision: "month" }), "April 1909");
  assert.equal(formatEventDate("1915-01-01", null, { precision: "year" }), "1915");
  assert.equal(formatEventDate("1948-05-15", null, { precision: "decade" }), "1948");
});

test("a century-precision start shows as its century, never as the year it is stored under", () => {
  // israeli-lebanese-conflict (Q3241199): Wikidata P580 +2000 at century precision = the 20th century (1901-2000).
  assert.equal(formatEventDate("2000-01-01", null, { precision: "century" }), "20th century");
  assert.equal(formatEventDate("2000-01-01", null, { precision: "century", ongoing: true }), "20th century – ongoing (per source)");
  assert.equal(formatEventDate("1901-01-01", null, { precision: "century" }), "20th century");
  assert.equal(formatEventDate("1900-01-01", null, { precision: "century" }), "19th century");
  assert.equal(formatEventDate("2100-01-01", null, { precision: "century" }), "21st century");
  assert.equal(formatEventDate("2000-01-01", null, { precision: "millennium" }), "2nd millennium");
});

test("coarsePeriodLabel: only century and millennium precision; ordinals", () => {
  assert.equal(coarsePeriodLabel("2000-01-01", "decade"), null);
  assert.equal(coarsePeriodLabel("2000-01-01", "year"), null);
  assert.equal(coarsePeriodLabel(null, "century"), null);
  assert.equal(coarsePeriodLabel("1101-01-01", "century"), "12th century");
  assert.equal(coarsePeriodLabel("1200-01-01", "century"), "12th century");
  assert.equal(coarsePeriodLabel("1300-01-01", "century"), "13th century");
  assert.equal(coarsePeriodLabel("2200-01-01", "century"), "22nd century");
  assert.equal(coarsePeriodLabel("3000-01-01", "millennium"), "3rd millennium");
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

test("ongoing (a source says it is still going on): '– ongoing (per source)' after the start, only without an end", () => {
  assert.equal(formatEventDate("2014-09-16", null, { precision: "day", ongoing: true }), "16 September 2014 – ongoing (per source)");
  assert.equal(formatEventDate("2014-09-16", null, { precision: "month", ongoing: true }), "September 2014 – ongoing (per source)");
  assert.equal(formatEventDate("2014-09-16", null, { precision: "day", yearOnly: true, ongoing: true }), "2014–ongoing (per source)");
  assert.equal(formatEventDate("2023-10-08", "2024-11-27", { precision: "day", ongoing: true }), "8 October 2023 – 2024");
  assert.equal(formatEventDate("2011-03-15", null, { precision: "day" }), "15 March 2011");
});

test("with the end's own precision the end shows to it, a shared year (and month) said once", () => {
  const day = { precision: "day", endPrecision: "day" };
  assert.equal(formatEventDate("1956-10-29", "1956-11-07", day), "29 October – 7 November 1956");
  assert.equal(formatEventDate("1967-06-05", "1967-06-10", day), "5–10 June 1967");
  assert.equal(formatEventDate("2003-03-20", "2011-12-18", day), "20 March 2003 – 18 December 2011");
  assert.equal(formatEventDate("1915-07-01", "1915-09-01", { precision: "month", endPrecision: "month" }), "July – September 1915");
  assert.equal(formatEventDate("1915-07-01", "1915-07-01", { precision: "month", endPrecision: "month" }), "July 1915");
  assert.equal(formatEventDate("1915-07-01", "1915-07-31", { precision: "month", endPrecision: "month" }), "July 1915");
  assert.equal(formatEventDate("1967-06-05", "1967-06-01", { precision: "day", endPrecision: "month" }), "1967");
  assert.equal(formatEventDate("1967-06-05", "1967-08-01", { precision: "day", endPrecision: "month" }), "5 June – August 1967");
  assert.equal(formatEventDate("1915-07-01", "1916-08-01", { precision: "month", endPrecision: "month" }), "July 1915 – August 1916");
});

test("a year-precision or unknown end, or a year-only start, keeps the year-only end", () => {
  assert.equal(formatEventDate("1956-10-29", "1956-11-07", { precision: "day", endPrecision: "year" }), "29 October 1956 (ended 1956)");
  assert.equal(formatEventDate("1956-10-29", "1956-11-07", { precision: "day", endPrecision: null }), "29 October 1956 (ended 1956)");
  assert.equal(formatEventDate("1915-01-01", "1917-03-04", { precision: "year", endPrecision: "day" }), "1915–1917");
  assert.equal(formatEventDate("1956-10-29", "1956-11-07", { precision: "day", endPrecision: "day", yearOnly: true }), "1956");
});
