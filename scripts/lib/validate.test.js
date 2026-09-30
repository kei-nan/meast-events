import test from "node:test";
import assert from "node:assert/strict";
import { isRealDate, validateEvents } from "./validate.js";

const event = (over = {}) => ({
  id: "six-day-war",
  title: "Six-Day War",
  wikidata_qid: "Q49077",
  date_start: "1967-06-05",
  date_end: "1967-06-10",
  countries: ["Egypt"],
  category: "war",
  extract: "The Six-Day War ...",
  wikidata_classes: ["war"],
  extract_retrieved_at: "2026-09-26T00:00:00Z",
  location_quality: "precise",
  coordinates: { lat: 31, lon: 34 },
  wikipedia_url: "https://en.wikipedia.org/wiki/Six-Day_War",
  ...over,
});

test("isRealDate: calendar-aware", () => {
  assert.equal(isRealDate("2024-02-29"), true);
  assert.equal(isRealDate("2023-02-29"), false);
  assert.equal(isRealDate("1990-13-01"), false);
  assert.equal(isRealDate("1990-8-2"), false);
});

test("validateEvents: a well-formed event passes", () => {
  assert.deepEqual(validateEvents([event()]), { errors: [], warnings: [] });
});

test("validateEvents: end before start is an error unless flagged date_order_invalid", () => {
  const bad = event({ date_start: "2009-08-02", date_end: "1990-08-04" });
  assert.equal(validateEvents([bad]).errors.length, 1);
  const flagged = { ...bad, date_flags: ["date_order_invalid: shown as Wikidata gives them"] };
  const r = validateEvents([flagged]);
  assert.equal(r.errors.length, 0);
  assert.equal(r.warnings.length, 1);
});

test("validateEvents: duplicate ids and QIDs, invented coordinates", () => {
  const r = validateEvents([event(), event({ coordinates: null, location_quality: "none", wikidata_qid: "Q2" }), event({ id: "b" })]);
  assert.equal(r.errors.length, 2, r.errors.join("\n")); // duplicate id, duplicate QID
  const none = validateEvents([event({ location_quality: "none" })]);
  assert.match(none.errors[0], /requires coordinates: null/);
});

test("validateEvents: an event needs a tracked country", () => {
  assert.match(validateEvents([event({ countries: ["France"] })]).errors[0], /no tracked country/);
});
