import test from "node:test";
import assert from "node:assert/strict";
import {
  isRealDate,
  validateEvents,
  checkFramingCoverage,
  textSha1,
  findClashes,
  CATEGORIES,
  MIN_YEAR,
  MAX_YEAR,
} from "./validate.js";
import { CATEGORY_LABELS } from "../../app/src/lib/categoryLabels.js";

const event = (over = {}) => ({
  id: "six-day-war",
  title: "Six-Day War",
  wikidata_qid: "Q49077",
  date_start: "1967-06-05",
  date_end: "1967-06-10",
  countries: ["Egypt"],
  category: "war",
  extract:
    "The Six-Day War, also known as the June War, 1967 Arab-Israeli War or Third Arab-Israeli War, was fought between Israel and a coalition of Arab states from 5 to 10 June 1967.",
  wikidata_classes: ["war"],
  extract_retrieved_at: "2026-09-26T00:00:00Z",
  location_quality: "precise",
  coordinates: { lat: 31, lon: 34 },
  coordinate_source: "wikipedia",
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
  const r = validateEvents([event(), event({ coordinates: null, coordinate_source: null, location_quality: "none", wikidata_qid: "Q2" }), event({ id: "b" })]);
  assert.equal(r.errors.length, 2, r.errors.join("\n")); // duplicate id, duplicate QID
  const none = validateEvents([event({ location_quality: "none" })]);
  assert.match(none.errors[0], /requires coordinates: null/);
});

test("validateEvents: an event needs a tracked country", () => {
  assert.match(validateEvents([event({ countries: ["France"] })]).errors[0], /no tracked country/);
});

test("isRealDate: years 1900 to next year only", () => {
  assert.equal(MIN_YEAR, 1900);
  assert.equal(MAX_YEAR, new Date().getUTCFullYear() + 1);
  assert.equal(isRealDate("1900-01-01"), true);
  assert.equal(isRealDate("1899-12-31"), false);
  assert.equal(isRealDate(`${MAX_YEAR}-12-31`), true);
  assert.equal(isRealDate(`${MAX_YEAR + 1}-01-01`), false);
  assert.match(validateEvents([event({ date_start: "1067-06-05", date_end: null })]).errors[0], /date_start invalid/);
});

test("validateEvents: category and category_group come from the pipeline's fixed set", () => {
  // The app labels exactly the groups the pipeline can assign.
  assert.deepEqual([...CATEGORIES].sort(), Object.keys(CATEGORY_LABELS).sort());
  assert.match(validateEvents([event({ category: "battle" })]).errors[0], /category must be one of/);
  assert.match(validateEvents([event({ category_group: "battle" })]).errors[0], /category_group must be one of/);
  assert.match(validateEvents([event({ category_group: "treaty" })]).errors[0], /differs from category/);
  assert.deepEqual(validateEvents([event({ category_group: "war" })]).errors, []);
});

test("validateEvents: coordinates abroad are a warning, a lat/lon swap is an error", () => {
  const dc = validateEvents([event({ coordinates: { lat: 38.895, lon: -77.0367 }, coordinate_source: "wikidata" })]);
  assert.equal(dc.errors.length, 0);
  assert.match(dc.warnings[0], /outside the Middle East box/);
  // Baghdad is (33.31, 44.36); exchanged it lands outside the box, but swapping back fits.
  const swapped = validateEvents([event({ coordinates: { lat: 44.36 + 1, lon: 33.31 } })]);
  assert.match(swapped.errors[0], /look swapped/);
  // A point checked against both sources (fixes.js CHECKED_COORDINATES, F9) is only a warning,
  // and only for that exact item and point.
  const theatre = { wikidata_qid: "Q696817", coordinates: { lat: 35, lon: 18 }, coordinate_source: "wikipedia" };
  const checked = validateEvents([event(theatre)]);
  assert.equal(checked.errors.length, 0);
  assert.match(checked.warnings[0], /not swapped \(docs\/data-fixes\.md F9\)/);
  assert.match(validateEvents([event({ ...theatre, coordinates: { lat: 35, lon: 18.5 } })]).errors[0], /look swapped/);
  assert.match(validateEvents([event({ ...theatre, wikidata_qid: "Q49077" })]).errors[0], /look swapped/);
});

test("validateEvents: location_quality and coordinate_source must agree", () => {
  const ok = [
    event(),
    event({ id: "b", wikidata_qid: "Q2", coordinate_source: "manual-override" }),
    event({ id: "c", wikidata_qid: "Q3", location_quality: "approximate", coordinate_source: "country-fallback:Israel/Palestine" }),
    event({ id: "d", wikidata_qid: "Q4", location_quality: "none", coordinates: null, coordinate_source: null }),
  ];
  assert.deepEqual(validateEvents(ok).errors, []);
  const bad = [
    event({ coordinate_source: "country-fallback:Iraq" }),
    event({ id: "b", wikidata_qid: "Q2", location_quality: "approximate", coordinate_source: "wikipedia" }),
    event({ id: "c", wikidata_qid: "Q3", location_quality: "approximate", coordinate_source: "country-fallback:France" }),
    event({ id: "d", wikidata_qid: "Q4", location_quality: "none", coordinates: null, coordinate_source: "wikidata" }),
    event({ id: "e", wikidata_qid: "Q5", coordinate_source: null }),
  ];
  const r = validateEvents(bad);
  assert.equal(r.errors.length, 5, r.errors.join("\n"));
});

test("validateEvents: dangling possible_duplicates, short extract and QID/article mismatch are warnings", () => {
  const r = validateEvents([
    event({ possible_duplicates: [{ id: "gone", title: "Gone", reason: "x" }, { id: "six-day-war" }] }),
    event({ id: "b", wikidata_qid: "Q2", extract: "Too short." }),
    event({ id: "c", wikidata_qid: "Q3", resolved_qid: "Q9" }),
    event({ id: "d", wikidata_qid: "Q4", resolved_qid: "Q4" }),
  ]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 3, r.warnings.join("\n"));
  assert.ok(r.warnings.some((w) => /possible_duplicates names "gone"/.test(w)));
  assert.ok(r.warnings.some((w) => /b: extract is only 10 characters/.test(w)));
  assert.ok(r.warnings.some((w) => /c: .*belongs to Q9/.test(w)));
  // A hint pointing into the curated file resolves when its ids are passed in.
  const other = validateEvents([event({ possible_duplicates: [{ id: "gone" }] })], { otherIds: new Set(["gone"]) });
  assert.deepEqual(other.warnings, []);
});

test("checkFramingCoverage: missing, stale and orphaned reviews are reported", () => {
  const a = event({ id: "a" });
  const b = event({ id: "b", extract: "New text" });
  const c = event({ id: "c" });
  const review = {
    events: {
      a: { text_sha1: textSha1(a.extract) },
      b: { text_sha1: textSha1("Old text") },
      zombie: { text_sha1: "000000000000" },
    },
  };
  const r = checkFramingCoverage([a, b, c], review);
  assert.deepEqual([r.missing, r.stale, r.orphans], [1, 1, 1]);
  assert.equal(r.warnings.length, 3);
  assert.equal(textSha1("abc"), "a9993e364706"); // sha1("abc") = a9993e36 4706816a ...
});

test("validateEvents: a start date after the data was retrieved is a warning, not an error", () => {
  const scheduled = event({ date_start: "2026-10-27", date_end: null, extract_retrieved_at: "2026-10-06T20:35:50Z" });
  const r = validateEvents([scheduled]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /date_start \(2026-10-27\) is after the day its data was retrieved \(2026-10-06\)/);
  // Same day, or earlier: nothing.
  assert.deepEqual(validateEvents([event({ date_start: "2026-10-06", date_end: null, extract_retrieved_at: "2026-10-06" })]).warnings, []);
  // No fetch date: compared with opts.today instead.
  const undated = { ...scheduled, extract_retrieved_at: undefined };
  assert.ok(validateEvents([undated], { lenient: true, today: "2026-10-01" }).warnings.some((w) => /was validated \(2026-10-01\)/.test(w)));
  assert.ok(!validateEvents([undated], { lenient: true, today: "2026-11-01" }).warnings.some((w) => /after the day/.test(w)));
});

test("validateEvents: borrowed coordinates are one warning, merged with the article mismatch", () => {
  const borrowed = event({ resolved_qid: "Q9", coordinate_source: "redirect_target" });
  const r = validateEvents([borrowed]);
  assert.deepEqual(r.errors, []); // redirect_target is an allowed precise source
  assert.equal(r.warnings.length, 1, r.warnings.join("\n"));
  assert.match(r.warnings[0], /coordinates are borrowed from another item \(coordinate_source "redirect_target"\).*belongs to Q9/);
  // Older records: Wikipedia coordinates of an article that belongs to another item.
  assert.match(validateEvents([event({ resolved_qid: "Q9" })]).warnings[0], /borrowed .*"wikipedia"/);
  // Wikidata coordinates with another resolved item: ambiguous, only the article mismatch.
  const wd = validateEvents([event({ resolved_qid: "Q9", coordinate_source: "wikidata" })]).warnings;
  assert.equal(wd.length, 1);
  assert.doesNotMatch(wd[0], /borrowed/);
  // No coordinates: nothing borrowed.
  const none = event({ resolved_qid: "Q9", location_quality: "none", coordinates: null, coordinate_source: null });
  assert.doesNotMatch(validateEvents([none]).warnings[0], /borrowed/);
});

// Pin-in-country check: needs @turf/turf (repo-root devDependency), skipped without it as in
// boundary-checks.test.js.
const turf = await import("@turf/turf").catch(() => null);
const needsTurf = { skip: !turf && "@turf/turf not installed (run npm ci at the repo root)" };
const box = (name, from, to, [w, s, e, n]) => ({
  type: "Feature",
  properties: { name, start_year: from, end_year: to },
  geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
});

test("validateEvents: a precise pin outside every tagged country's shape is one warning", needsTurf, () => {
  const boundaries = {
    type: "FeatureCollection",
    features: [
      box("Egypt", 1899, 9999, [25, 22, 35, 31.5]),
      box("Israel", 1948, 9999, [34.3, 29.5, 35.9, 33.3]),
      box("Turkey", 1924, 9999, [26, 36, 44.8, 42]),
    ],
  };
  const opts = { boundaries, turf };
  const at = (lat, lon, over = {}) => event({ date_start: "1990-01-01", date_end: null, coordinates: { lat, lon }, ...over });
  // Inside, and just outside the edge (within the 5 km tolerance): fine.
  assert.deepEqual(validateEvents([at(30, 30)], opts).warnings, []);
  assert.deepEqual(validateEvents([at(25, 35.04)], opts).warnings, []); // ~4 km east of the edge
  // Outside Egypt by tens of km: warned, with the distance.
  const off = validateEvents([at(32, 30)], opts).warnings;
  assert.equal(off.length, 1);
  assert.match(off[0], /precise pin \(32, 30\) is [4-6]\d km outside the 1990 border shapes of every tagged country \(Egypt; tolerance 5 km/);
  // Inside ANY tagged country is enough.
  assert.deepEqual(validateEvents([at(39, 35, { countries: ["Egypt", "Turkey"] })], opts).warnings, []);
  // The year matters: Turkey's shape starts in 1924, so a 1915 Turkey pin cannot be checked.
  assert.deepEqual(validateEvents([at(39, 30, { countries: ["Turkey"], date_start: "1915-01-01" })], opts).warnings, []);
  // A tagged country without a shape that year, or "regional": not checkable, no warning.
  assert.deepEqual(validateEvents([at(39, 30, { countries: ["Egypt", "Kuwait"] })], opts).warnings, []);
  assert.deepEqual(validateEvents([at(39, 30, { countries: ["regional"] })], opts).warnings, []);
  // Approximate pins and points outside the Middle East box (already warned) are not checked again.
  const capital = at(32, 30, { location_quality: "approximate", coordinate_source: "country-fallback:Egypt" });
  assert.deepEqual(validateEvents([capital], opts).warnings, []);
  assert.equal(validateEvents([at(38.9, -77.03)], opts).warnings.length, 1);
  // Without boundaries/turf the check is off.
  assert.deepEqual(validateEvents([at(32, 30)]).warnings, []);
});

test("findClashes: id and QID clashes with the base set, each reason listed", () => {
  const base = [event({ id: "a", wikidata_qid: "Q1" }), event({ id: "b", wikidata_qid: null })];
  const incoming = [
    event({ id: "a", wikidata_qid: "Q7" }), // id only
    event({ id: "x", wikidata_qid: "Q1" }), // QID only
    event({ id: "a", wikidata_qid: "Q1" }), // both
    event({ id: "y", wikidata_qid: "Q8" }), // new
    event({ id: "z", wikidata_qid: null }), // no QID never clashes on QID (base has a null one)
  ];
  const r = findClashes(base, incoming);
  assert.deepEqual(
    r.map((c) => [c.event.id, c.event.wikidata_qid, c.reasons]),
    [
      ["a", "Q7", ["id"]],
      ["x", "Q1", ["wikidata_qid"]],
      ["a", "Q1", ["id", "wikidata_qid"]],
    ]
  );
  assert.deepEqual(findClashes([], incoming), []);
  assert.deepEqual(findClashes(base, []), []);
});
