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
  MAX_END_YEAR,
  eventIdProblem,
  checkShapeNamesFor,
} from "./validate.js";
import { shapeNamesFor } from "../../app/src/lib/eventCountries.js";
import { isValidEventId } from "../../app/src/lib/urlState.js";
import { MIN_YEAR as APP_MIN_YEAR, MAX_YEAR as APP_MAX_YEAR } from "../../app/src/lib/years.js";
import { CATEGORY_LABELS, CLASS_GROUPS } from "../../app/src/lib/categoryLabels.js";
import { EVENT_CLASSES } from "./event-classes.js";

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
  coordinates: { lat: 31.25, lon: 34.25 },
  coordinate_source: "wikipedia",
  date_precision: "day",
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
  const r = validateEvents([
    event(),
    event({ coordinates: null, coordinate_source: null, location_quality: "none", wikidata_qid: "Q2", wikipedia_url: "https://en.wikipedia.org/wiki/Two" }),
    event({ id: "b", wikipedia_url: "https://en.wikipedia.org/wiki/B" }),
  ]);
  assert.equal(r.errors.length, 2, r.errors.join("\n")); // duplicate id, duplicate QID
  const none = validateEvents([event({ location_quality: "none" })]);
  assert.match(none.errors[0], /requires coordinates: null/);
});

test("validateEvents: an event needs a tracked country", () => {
  assert.match(validateEvents([event({ countries: ["France"] })]).errors[0], /no tracked country/);
});

test("isRealDate: years from the app's first to its last timeline year", () => {
  // The same bounds as the app's timeline (outside a Vite bundle its last year is the UTC year).
  assert.equal(MIN_YEAR, APP_MIN_YEAR);
  assert.equal(MAX_YEAR, APP_MAX_YEAR);
  assert.equal(MIN_YEAR, 1900);
  assert.equal(MAX_YEAR, new Date().getUTCFullYear());
  assert.equal(MAX_END_YEAR, MAX_YEAR + 1);
  assert.equal(isRealDate("1900-01-01"), true);
  assert.equal(isRealDate("1899-12-31"), false);
  assert.equal(isRealDate(`${MAX_YEAR}-12-31`), true);
  assert.equal(isRealDate(`${MAX_YEAR + 1}-01-01`), false);
  assert.equal(isRealDate(`${MAX_YEAR + 1}-01-01`, MAX_END_YEAR), true);
  assert.match(validateEvents([event({ date_start: "1067-06-05", date_end: null })]).errors[0], /date_start invalid/);
  // A start next year would never show on the timeline; a scheduled end next year is fine.
  assert.match(validateEvents([event({ date_start: `${MAX_YEAR + 1}-01-05`, date_end: null })]).errors[0], /date_start invalid/);
  const scheduledEnd = event({ date_start: `${MAX_YEAR}-01-05`, date_end: `${MAX_YEAR + 1}-03-01`, extract_retrieved_at: `${MAX_YEAR}-12-31` });
  assert.deepEqual(validateEvents([scheduledEnd]).errors, []);
  assert.match(validateEvents([event({ date_end: `${MAX_YEAR + 2}-01-01` })]).errors[0], /date_end invalid/);
});

test("validateEvents: ids the app can link to, never a reserved file name", () => {
  for (const bad of ["-war", "Six-Day-War", "six_day_war", "six:day", "a.b", "", "a".repeat(121), 42, null, "index", "con", "nul", "com1", "lpt9", "aux"]) {
    assert.ok(eventIdProblem(bad), `expected ${JSON.stringify(bad)} to be rejected`);
    assert.equal(validateEvents([event({ id: bad })]).errors.length, 1, JSON.stringify(bad));
  }
  for (const good of ["six-day-war", "1967", "a".repeat(120), "com10", "con-1", "index-of-x"]) {
    assert.equal(eventIdProblem(good), null, good);
    assert.equal(isValidEventId(good), true, good);
  }
});

test("validateEvents: every id the validator accepts is one the app accepts", () => {
  // A sample around the edges of both checks: the validator never passes an id the app drops.
  const samples = ["a", "-", "0-", "a-", "-a", "A", "a.", "~a", "a~", "a".repeat(120), "a".repeat(121), "ab c", "é"];
  for (const id of samples) if (!eventIdProblem(id)) assert.equal(isValidEventId(id), true, id);
});

test("validateEvents: extract_retrieved_at must name a real day", () => {
  assert.deepEqual(validateEvents([event({ extract_retrieved_at: "2026-02-28" })]).errors, []);
  for (const bad of ["2026-02-30T00:00:00Z", "2026-13-01", "2026-00-10", "1899-12-31", "26-01-01", "", null]) {
    assert.match(validateEvents([event({ extract_retrieved_at: bad })]).errors.join("\n"), /extract_retrieved_at must be an ISO date/, String(bad));
  }
});

test("validateEvents: wikipedia_revid (a positive integer) and its timestamp, both or neither", () => {
  const ts = "2026-10-15T19:38:37Z";
  assert.deepEqual(validateEvents([event({ wikipedia_revid: 1234567, wikipedia_revid_timestamp: ts })]).errors, []);
  for (const bad of [0, -1, 1.5, "123", null]) {
    assert.match(validateEvents([event({ wikipedia_revid: bad, wikipedia_revid_timestamp: ts })]).errors[0], /wikipedia_revid must be a positive integer/);
  }
  for (const bad of ["2026-10-15", "yesterday", null]) {
    assert.match(validateEvents([event({ wikipedia_revid: 1, wikipedia_revid_timestamp: bad })]).errors[0], /wikipedia_revid_timestamp must be a UTC timestamp/);
  }
  assert.match(validateEvents([event({ wikipedia_revid: 1 })]).errors[0], /present together or not at all/);
  assert.match(validateEvents([event({ wikipedia_revid_timestamp: ts })]).errors[0], /present together or not at all/);
});

test("validateEvents: category and category_group come from the pipeline's fixed set", () => {
  // The app labels exactly the groups the pipeline can assign.
  assert.deepEqual([...CATEGORIES].sort(), Object.keys(CATEGORY_LABELS).sort());
  // The app's copy of the class table (it names the deciding class in the event header) is the pipeline's, in order.
  assert.deepEqual(CLASS_GROUPS, EVENT_CLASSES.map((c) => [c.label, c.category, c.qid]));
  assert.match(validateEvents([event({ category: "battle" })]).errors[0], /category must be one of/);
  assert.match(validateEvents([event({ category_group: "battle" })]).errors[0], /category_group must be one of/);
  assert.match(validateEvents([event({ category_group: "treaty" })]).errors[0], /differs from category/);
  assert.deepEqual(validateEvents([event({ category_group: "war" })]).errors, []);
  // The group must be what the grouping rule gives: none is kept by hand.
  assert.match(validateEvents([event({ category: "political", category_group: "political" })]).errors[0], /not what the grouping rule gives/);
  const none = event({ wikidata_classes: ["regime change"], category: "unclassified", category_group: "unclassified" });
  assert.deepEqual(validateEvents([none]).errors, []);
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
  // Each with its own article (a shared wikipedia_url would be an error of its own).
  const own = (id) => ({ id, wikipedia_url: `https://en.wikipedia.org/wiki/${id.toUpperCase()}` });
  const ok = [
    event(),
    event({ ...own("b"), wikidata_qid: "Q2", coordinate_source: "manual-override" }),
    event({ ...own("c"), wikidata_qid: "Q3", location_quality: "approximate", coordinate_source: "country-fallback:Israel/Palestine" }),
    event({ ...own("d"), wikidata_qid: "Q4", location_quality: "none", coordinates: null, coordinate_source: null }),
  ];
  assert.deepEqual(validateEvents(ok).errors, []);
  const bad = [
    event({ coordinate_source: "country-fallback:Iraq" }),
    event({ ...own("b"), wikidata_qid: "Q2", location_quality: "approximate", coordinate_source: "wikipedia" }),
    event({ ...own("c"), wikidata_qid: "Q3", location_quality: "approximate", coordinate_source: "country-fallback:France" }),
    event({ ...own("d"), wikidata_qid: "Q4", location_quality: "none", coordinates: null, coordinate_source: "wikidata" }),
    event({ ...own("e"), wikidata_qid: "Q5", coordinate_source: null }),
  ];
  const r = validateEvents(bad);
  assert.equal(r.errors.length, 5, r.errors.join("\n"));
});

test("validateEvents: dangling possible_duplicates, short extract and QID/article mismatch are warnings", () => {
  const r = validateEvents([
    event({ possible_duplicates: [{ id: "gone", title: "Gone", reason: "x" }, { id: "six-day-war" }] }),
    event({ id: "b", wikidata_qid: "Q2", extract: "Too short.", wikipedia_url: "https://en.wikipedia.org/wiki/B" }),
    event({ id: "c", wikidata_qid: "Q3", resolved_qid: "Q9" }),
    event({ id: "d", wikidata_qid: "Q4", resolved_qid: "Q4", wikipedia_url: "https://en.wikipedia.org/wiki/D", extract: "D ".repeat(100) }),
  ]);
  assert.deepEqual(r.errors, []);
  // 3, plus c sharing six-day-war's article (listed on both, naming the other).
  assert.equal(r.warnings.length, 5, r.warnings.join("\n"));
  assert.ok(r.warnings.some((w) => /c: same wikipedia_url and the same extract as six-day-war/.test(w)));
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
  const scheduled = event({ date_start: "2026-10-27", date_end: null, wikidata_classes: ["battle"], extract_retrieved_at: "2026-10-06T20:35:50Z" });
  const r = validateEvents([scheduled]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /date_start \(2026-10-27\) is after the day its data was retrieved \(2026-10-06\)/);
  // Same day, or earlier: nothing.
  assert.deepEqual(validateEvents([event({ date_start: "2026-10-06", date_end: null, wikidata_classes: ["battle"], extract_retrieved_at: "2026-10-06" })]).warnings, []);
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
  // The test points are whole degrees; their coordinate_low_precision warning is tested on its own below.
  const pinOnly = (r) => ({ ...r, warnings: r.warnings.filter((w) => !/coordinate_low_precision/.test(w)) });
  const validate = (events, o) => pinOnly(validateEvents(events, o));
  const opts = { boundaries, turf };
  const at = (lat, lon, over = {}) => event({ date_start: "1990-01-01", date_end: null, wikidata_classes: ["battle"], coordinates: { lat, lon }, ...over });
  // Inside, and just outside the edge (within the 5 km tolerance): fine.
  assert.deepEqual(validate([at(30, 30)], opts).warnings, []);
  assert.deepEqual(validate([at(25, 35.04)], opts).warnings, []); // ~4 km east of the edge
  // Outside Egypt by tens of km: warned, with the distance.
  const off = validate([at(32, 30)], opts).warnings;
  assert.equal(off.length, 1);
  assert.match(off[0], /precise pin \(32, 30\) is [4-6]\d km outside the 1990 border shapes of every tagged country \(Egypt; tolerance 5 km/);
  // Inside ANY tagged country is enough.
  assert.deepEqual(validate([at(39, 35, { countries: ["Egypt", "Turkey"] })], opts).warnings, []);
  // The year matters: Turkey's shape starts in 1924, so a 1915 Turkey pin cannot be checked.
  assert.deepEqual(validate([at(39, 30, { countries: ["Turkey"], date_start: "1915-01-01" })], opts).warnings, []);
  // A tagged country without a shape that year, or "regional": not checkable, no warning.
  assert.deepEqual(validate([at(39, 30, { countries: ["Egypt", "Kuwait"] })], opts).warnings, []);
  assert.deepEqual(validate([at(39, 30, { countries: ["regional"] })], opts).warnings, []);
  // Approximate pins and points outside the Middle East box (already warned) are not checked again.
  const capital = at(32, 30, { location_quality: "approximate", coordinate_source: "country-fallback:Egypt" });
  assert.deepEqual(validate([capital], opts).warnings, []);
  assert.equal(validate([at(38.9, -77.03)], opts).warnings.length, 1);
  // Without boundaries/turf the check is off.
  assert.deepEqual(validate([at(32, 30)]).warnings, []);
});

test("validateEvents: before 1920 a pin tagged with an Ottoman-ruled country is checked against the Ottoman shape", needsTurf, () => {
  const boundaries = {
    type: "FeatureCollection",
    features: [
      box("Ottoman Empire", 1915, 1917, [26, 29, 48, 42]),
      box("Ottoman Empire", 1920, 1921, [26, 36, 44.8, 42]),
      box("Turkey", 1924, 9999, [26, 36, 44.8, 42]),
    ],
  };
  const opts = { boundaries, turf };
  const pinOnly = (events) => validateEvents(events, opts).warnings.filter((w) => !/coordinate_low_precision/.test(w));
  const at = (lat, lon, over = {}) =>
    event({ date_start: "1915-04-25", date_end: null, wikidata_classes: ["battle"], countries: ["Turkey"], coordinates: { lat, lon }, ...over });
  // Inside the 1915 Ottoman shape: fine, for Turkey and for Iraq (Kut, 32.5N 45.8E).
  assert.deepEqual(pinOnly([at(40, 30)]), []);
  assert.deepEqual(pinOnly([at(32.5, 45.8, { countries: ["Iraq"] })]), []);
  // Outside it (Kars in the Russian Empire's shape-less area, here east of the box): one warning naming the shape.
  const off = pinOnly([at(40.6, 49)]);
  assert.equal(off.length, 1);
  assert.match(off[0], /is \d+ km outside the 1915 border shapes of every tagged country \(Turkey; .*before 1920 checked against the Ottoman Empire shape\)/);
  // Countries not Ottoman-ruled then (Kuwait), and years with no Ottoman shape in the data (1918 here), stay unchecked.
  assert.deepEqual(pinOnly([at(40.6, 49, { countries: ["Kuwait"] })]), []);
  assert.deepEqual(pinOnly([at(40.6, 49, { date_start: "1918-01-01" })]), []);
  // From 1920 the map's own table applies (the 1920 Ottoman shape is Turkey's): no "before 1920" note.
  const later = pinOnly([at(40.6, 49, { date_start: "1920-06-01" })]);
  assert.equal(later.length, 1);
  assert.doesNotMatch(later[0], /before 1920/);
});

test("checkShapeNamesFor: the map's own shapes first; the Ottoman shape only before 1920 and only for the check", () => {
  assert.deepEqual(checkShapeNamesFor("Turkey", 1930), { names: ["Turkey"], wide: false });
  assert.deepEqual(checkShapeNamesFor("Iraq", 1916), { names: ["Ottoman Empire"], wide: true });
  assert.deepEqual(checkShapeNamesFor("Egypt", 1916), { names: ["Egypt"], wide: false });
  assert.deepEqual(checkShapeNamesFor("Kuwait", 1916), { names: [], wide: false });
  assert.deepEqual(checkShapeNamesFor("Iraq", 1885), { names: [], wide: false });
  // The app's display table is unchanged: no Ottoman shape for Iraq in 1916.
  assert.deepEqual(shapeNamesFor("Iraq", 1916), []);
});

test("validateEvents: no date_end on a title saying 'present' or on a durative class is a warning", () => {
  const w = (over) => validateEvents([event({ wikipedia_url: "https://en.wikipedia.org/wiki/T", ...over })]).warnings;
  // As in the data: yemeni-civil-war-2014-present (classes civil war, war; no end).
  const yemen = w({ title: "Yemeni civil war (2014–present)", date_start: "2014-09-16", date_end: null, wikidata_classes: ["civil war", "war"] });
  assert.equal(yemen.length, 2, yemen.join("\n"));
  assert.match(yemen[0], /title_present_no_end: the title says the event is ongoing/);
  assert.match(yemen[1], /durative_class_no_end: Wikidata class civil war, war describes a span of time/);
  // With an end date: neither (2024-israel-hezbollah-conflict ends 2024-11-27).
  assert.deepEqual(w({ title: "Hezbollah–Israel conflict (2023–present)", date_start: "2023-10-08", date_end: "2024-11-27" }), []);
  // A class that also labels single-day events (battle, armed conflict, protest): not flagged.
  assert.deepEqual(w({ date_end: null, wikidata_classes: ["battle", "armed conflict", "protest"] }), []);
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

// Discovered events carry `sitelinks` (the count discovery saw); the fixture above is a hand-picked one.
const found = (over = {}) => event({ sitelinks: 12, sitelinks_current: 12, date_precision: "day", ...over });

test("validateEvents: inclusion-rule warnings for discovered events; hand-picked seed events are exempt", () => {
  const r = validateEvents([
    found({ id: "low", wikidata_qid: "Q1", sitelinks: 9, wikipedia_url: "https://en.wikipedia.org/wiki/Low", extract: "L ".repeat(90) }),
    found({ id: "fell", wikidata_qid: "Q2", sitelinks_current: 8, wikipedia_url: "https://en.wikipedia.org/wiki/Fell", extract: "F ".repeat(90) }),
    found({ id: "fr", wikidata_qid: "Q3", wikipedia_url: "https://fr.wikipedia.org/wiki/Guerre_des_Six_Jours", extract: "G ".repeat(90) }),
    found({ id: "noprec", wikidata_qid: "Q4", date_precision: undefined, wikipedia_url: "https://en.wikipedia.org/wiki/N", extract: "N ".repeat(90) }),
    found({ id: "badprec", wikidata_qid: "Q5", date_precision: "fortnight", wikipedia_url: "https://en.wikipedia.org/wiki/P", extract: "P ".repeat(90) }),
    // seed event: no sitelinks key, low current count - none of the above applies
    event({ id: "seed", wikidata_qid: "Q6", sitelinks_current: 8, wikipedia_url: "https://en.wikipedia.org/wiki/S", extract: "S ".repeat(90) }),
  ].map((e) => {
    if (e.id === "noprec") delete e.date_precision;
    return e;
  }));
  assert.deepEqual(r.errors, []);
  const w = (id) => r.warnings.filter((x) => x.includes(` ${id}: `));
  assert.match(w("low").join(), /sitelinks at discovery \(9\) below the inclusion threshold of 10/);
  assert.match(w("fell").join(), /sitelinks_current \(8\) has fallen below/);
  assert.match(w("fr").join(), /not an English Wikipedia article/);
  assert.match(w("noprec").join(), /date_precision missing/);
  assert.match(w("badprec").join(), /"fortnight" is not a Wikidata precision name/);
  assert.deepEqual(w("seed"), []);
  assert.equal(r.warnings.length, 5, r.warnings.join("\n"));
  // null precision (a ledger date that is no Wikidata value) is allowed
  assert.deepEqual(validateEvents([found({ date_precision: null })]).warnings, []);
});

test("validateEvents: a seed event without date_precision is a warning (its date shows as the year only)", () => {
  const seed = event();
  delete seed.date_precision;
  const r = validateEvents([seed]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1, r.warnings.join("\n"));
  assert.match(r.warnings[0], /six-day-war: date_precision missing \(hand-picked seed event; its date shows as the year only/);
  // null is a recorded value (no Wikidata precision for the kept date), not a missing one.
  assert.deepEqual(validateEvents([event({ date_precision: null })]).warnings, []);
});

test("validateEvents: years in the title outside the dates are a warning; the dates are not judged otherwise", () => {
  const w = (over) => validateEvents([event({ wikipedia_url: "https://en.wikipedia.org/wiki/T", ...over })]).warnings;
  // As in the data: 2009-iranian-presidential-election-protests (Wikidata 2010-02-11 to 2010-12-07).
  const protests = w({ title: "2009 Iranian presidential election protests", date_start: "2010-02-11", date_end: "2010-12-07" });
  assert.equal(protests.length, 1);
  assert.match(protests[0], /title_years_outside_dates: the title names 2009, outside the stored dates \(2010-02-11 to 2010-12-07\)/);
  // A range: israeli-occupation-of-southern-lebanon-1982-2000 (1985-02-16 to 2000-05-25).
  assert.match(w({ title: "Israeli occupation of Southern Lebanon (1982–2000)", date_start: "1985-02-16", date_end: "2000-05-25" }).join(), /names 1982,/);
  // "present": 2024-israel-hezbollah-conflict (2024-09-23 to 2024-11-27).
  assert.match(w({ title: "Hezbollah–Israel conflict (2023–present)", date_start: "2024-09-23", date_end: "2024-11-27" }).join(), /names 2023,/);
  // No end date: only years before the start are outside (2015-2018-iraqi-protests, start 2018-09-07).
  assert.match(w({ title: "2015–2018 Iraqi protests", date_start: "2018-09-07", date_end: null, wikidata_classes: ["battle"] }).join(), /names 2015, outside the stored dates \(2018-09-07, no end date\)/);
  assert.deepEqual(w({ title: "2018–2019 Gaza border protests", date_start: "2018-03-30", date_end: null, wikidata_classes: ["battle"] }), []);
  // Inside the dates, a two-digit range end, reversed dates (lower to higher year): nothing.
  assert.deepEqual(w({ title: "Six-Day War of 1967", date_start: "1967-06-05", date_end: "1967-06-10" }), []);
  assert.deepEqual(w({ title: "Battle of Ras al-Ayn (2012–13)", date_start: "2012-11-08", date_end: "2013-07-17" }), []);
  assert.match(w({ title: "Battle of Ras al-Ayn (2012–14)", date_start: "2012-11-08", date_end: "2013-07-17" }).join(), /names 2014,/);
  const kuwait = { title: "Iraqi invasion of Kuwait 1990", date_start: "2009-08-02", date_end: "1990-08-04", date_flags: ["date_order_invalid: x"] };
  assert.doesNotMatch(w(kuwait).join(), /title_years/);
});

test("validateEvents: a precise pin with at most one decimal place is a warning (the site shows it as approximate)", () => {
  // As in the data: al-anfal-campaign 33, 43 (Wikidata), siege-of-basra 30.5, 47.8 (Wikipedia).
  const anfal = validateEvents([event({ coordinates: { lat: 33, lon: 43 }, coordinate_source: "wikidata" })]).warnings;
  assert.equal(anfal.length, 1, anfal.join("\n"));
  assert.match(anfal[0], /coordinate_low_precision: the wikidata coordinates \(33, 43\) have at most one decimal place.*approximate location/);
  assert.equal(validateEvents([event({ coordinates: { lat: 30.5, lon: 47.8 } })]).warnings.length, 1);
  // Two decimals in either coordinate: not flagged (october-7-attacks 31.36, 34.51; adana-massacre 37, 35.32133).
  assert.deepEqual(validateEvents([event({ coordinates: { lat: 31.36, lon: 34.51 } })]).warnings, []);
  assert.deepEqual(validateEvents([event({ coordinates: { lat: 37, lon: 35.32133 } })]).warnings, []);
  // A capital fallback is already approximate: not flagged.
  const capital = event({ coordinates: { lat: 33, lon: 44 }, location_quality: "approximate", coordinate_source: "country-fallback:Iraq" });
  assert.deepEqual(validateEvents([capital]).warnings, []);
});

test("validateEvents: a decade/century start without an end, and >= 8 countries, are warnings", () => {
  const century = found({ date_start: "2000-01-01", date_end: null, wikidata_classes: ["battle"], date_precision: "century" });
  assert.match(validateEvents([century]).warnings.join(), /only century precision and there is no date_end: .*century ending 2000/);
  assert.deepEqual(validateEvents([found({ date_start: "1940-01-01", date_end: "1949-05-01", date_precision: "decade" })]).warnings, []);
  assert.deepEqual(validateEvents([found({ date_start: "1948-01-01", date_end: null, wikidata_classes: ["battle"], date_precision: "year" })]).warnings, []);
  const many = ["Turkey", "Iran", "Iraq", "Syria", "Lebanon", "Jordan", "Egypt", "Yemen"];
  assert.match(validateEvents([found({ countries: many })]).warnings.join(), /tagged with 8 countries/);
  assert.deepEqual(validateEvents([found({ countries: many.slice(0, 7) })]).warnings, []);
});

test("validateEvents: a coarse end that reaches the start is a warning only with its flag, and only if true", () => {
  // Passover massacre: P585 2002-03-27 (day), P582 "2002" (year precision, stored as 2002-01-01).
  const passover = found({ date_start: "2002-03-27", date_end: "2002-01-01" });
  assert.equal(validateEvents([passover]).errors.length, 1);
  const flag = "date_end_precision_coarse: Wikidata end time 2002-01-01 has only year precision (the year runs to 2002-12-31), so it is not before the start (2002-03-27); stored as Wikidata gives it";
  const ok = validateEvents([{ ...passover, date_flags: [flag] }]);
  assert.deepEqual(ok.errors, []);
  assert.match(ok.warnings.join(), /coarse Wikidata end \(year precision\) that reaches date_start/);
  // The flag cannot excuse a real reversal (Arab Cold War: start 1979-02-11, end "1970", year precision).
  const real = found({ date_start: "1979-02-11", date_end: "1970-01-01", date_flags: [flag.replace(/2002/g, "1970")] });
  assert.equal(validateEvents([real]).errors.length, 1);
});

test("validateEvents: the curated records whose end is before their start are each caught", async () => {
  const { readFile } = await import("node:fs/promises");
  const curated = JSON.parse(await readFile(new URL("../../data/events.json", import.meta.url), "utf-8"));
  const expected = {
    "iraqi-invasion-of-kuwait": /date_end \(1990-08-04\) precedes date_start \(2009-08-02\) - flagged in date_flags/,
    "arab-cold-war": /date_end \(1970-01-01\) precedes date_start \(1979-02-11\) - flagged in date_flags/,
    "passover-massacre": /date_end \(2002-01-01\) is a coarse Wikidata end \(year precision\) that reaches date_start \(2002-03-27\)/,
  };
  for (const [id, re] of Object.entries(expected)) {
    const e = curated.find((x) => x.id === id);
    assert.ok(e, `${id} is in data/events.json`);
    const r = validateEvents([e], { lenient: true });
    assert.deepEqual(r.errors, [], id);
    assert.ok(r.warnings.some((w) => re.test(w)), `${id}: ${r.warnings.join("\n")}`);
  }
  // Every reversed record in the file is caught one way or the other (warned when flagged, an error otherwise).
  const all = validateEvents(curated, { lenient: true });
  for (const e of curated.filter((x) => x.date_end && x.date_end < x.date_start)) {
    assert.ok([...all.warnings, ...all.errors].some((w) => w.includes(` ${e.id}: date_end (${e.date_end})`)), e.id);
  }
});

test("validateEvents: shared wikipedia_url or extract is a warning naming the other event, explained or not", () => {
  const a = found({ id: "a", wikidata_qid: "Q1" });
  // b's title redirects into a's article (resolved_qid = a's item): the documented case (as
  // ein-hashlosha-massacre / october-7-attacks). Each is listed once, naming the other.
  const b = found({ id: "b", wikidata_qid: "Q2", resolved_qid: "Q1", coordinate_source: "wikidata" });
  const explained = validateEvents([a, b]).warnings;
  assert.equal(explained.length, 3, explained.join("\n"));
  assert.ok(explained.some((w) => /b: wikipedia_url .* belongs to Q1/.test(w)));
  assert.ok(explained.some((w) => /a: same wikipedia_url and the same extract as b: this is the article's own event/.test(w)));
  assert.ok(explained.some((w) => /b: same wikipedia_url and the same extract as a: this event has no English article of its own \(the article belongs to Q1\)/.test(w)));
  assert.ok(!explained.some((w) => /not explained/.test(w)));
  // Neither is the article's own item (june-2025-israeli-strikes-on-iran / june-2025-iranian-strikes-on-israel).
  const n1 = found({ id: "n1", wikidata_qid: "Q5", resolved_qid: "Q9", coordinate_source: "wikidata" });
  const n2 = found({ id: "n2", wikidata_qid: "Q6", resolved_qid: "Q9", coordinate_source: "wikidata", extract: a.extract + " More." });
  const both = validateEvents([n1, n2]).warnings.filter((w) => /same wikipedia_url/.test(w));
  assert.equal(both.length, 2, both.join("\n"));
  assert.match(both[0], /n1: same wikipedia_url as n2: this event has no English article of its own/);
  // Two events that are each the article's own item: an ERROR for the shared wikipedia_url (one of them would show
  // another item's text with no note), a warning for the shared extract.
  const c = found({ id: "c", wikidata_qid: "Q3" });
  const rc = validateEvents([a, c]);
  assert.equal(rc.errors.filter((w) => /same wikipedia_url as .*not explained/.test(w)).length, 2, rc.errors.join("\n"));
  assert.ok(rc.errors.some((w) => /\ba: same wikipedia_url as c\b/.test(w)));
  const r = rc.warnings;
  assert.equal(r.filter((w) => /same wikipedia_url as/.test(w)).length, 0);
  assert.equal(r.filter((w) => /same extract as/.test(w)).length, 2);
  // Marking the second as an event without an article of its own (resolved_qid = a's item) explains it.
  assert.deepEqual(validateEvents([a, { ...c, resolved_qid: "Q1", coordinate_source: "wikidata" }]).errors, []);
  // Same text under different URLs: listed.
  const d = found({ id: "d", wikidata_qid: "Q4", wikipedia_url: "https://en.wikipedia.org/wiki/Other" });
  assert.match(validateEvents([a, d]).warnings.join("\n"), /same extract as d \(different wikipedia_url\)/);
});

test("validateEvents: an entry typed as a person, organisation, state or country history is warned about (not an error)", () => {
  const { errors, warnings } = validateEvents([event({ wikidata_classes: ["history of a country or state", "war"] })]);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /not an event by its Wikidata classes \(history of a country or state\)/);
  assert.deepEqual(validateEvents([event({ wikidata_classes: ["military operation", "revolt"] })]).warnings, []);
});

test("validateEvents: wikidata_aliases is absent or a non-empty array of non-empty strings", () => {
  assert.deepEqual(validateEvents([event({ wikidata_aliases: ["July War", "2006 Lebanon war"] })]).errors, []);
  assert.deepEqual(validateEvents([event()]).errors, []);
  for (const bad of [[], ["July War", ""], "July War", [1]]) {
    assert.match(validateEvents([event({ wikidata_aliases: bad })]).errors.join("\n"), /wikidata_aliases must be/);
  }
});
