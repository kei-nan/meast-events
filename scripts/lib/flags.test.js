import test from "node:test";
import assert from "node:assert/strict";
import {
  firstSentence,
  exactDaysIn,
  monthPrecisionDayFlag,
  MONTH_DAY_FLAG,
  leadStartDayFlag,
  LEAD_DAY_FLAG,
  pruneDuplicateHints,
  titleYears,
  titleYearsFlag,
  TITLE_YEARS_FLAG,
  lowPrecisionCoordinateFlag,
  LOW_PRECISION_FLAG,
} from "./flags.js";

test("titleYears: single years, ranges, two-digit ends and 'present'", () => {
  assert.deepEqual(titleYears("2009 Iranian presidential election protests"), [2009]);
  assert.deepEqual(titleYears("Egyptian Crisis (2011–2014)"), [2011, 2014]);
  assert.deepEqual(titleYears("Battle of Ras al-Ayn (2012–13)"), [2012, 2013]);
  assert.deepEqual(titleYears("Hezbollah–Israel conflict (2023–present)"), [2023]);
  assert.deepEqual(titleYears("2015-2018 Iraqi protests"), [2015, 2018]);
  // Not years: other numbers, and years before 1900.
  assert.deepEqual(titleYears("Resolution 242"), []);
  assert.deepEqual(titleYears("Iran Air Flight 655"), []);
  assert.deepEqual(titleYears("Treaty of 1839 and Flight 12345"), []);
});

test("titleYearsFlag: a title year outside the stored dates, flag only", () => {
  const f = titleYearsFlag({ title: "War in Iraq (2013–2017)", date_start: "2014-01-01", date_end: "2017-12-09" });
  assert.equal(f, `${TITLE_YEARS_FLAG}: the title names 2013, outside the stored dates (2014-01-01 to 2017-12-09); dates and title are kept as the sources give them`);
  assert.match(titleYearsFlag({ title: "Anglo-Iraqi Treaty of 1930", date_start: "1932-10-03", date_end: null }), /names 1930, .*no end date/);
  assert.equal(titleYearsFlag({ title: "Raqqa campaign (2016–2017)", date_start: "2016-11-06", date_end: null }), null);
  assert.equal(titleYearsFlag({ title: "Six-Day War", date_start: "1967-06-05", date_end: "1967-06-10" }), null);
  assert.equal(titleYearsFlag({ title: "1990 thing", date_start: null }), null);
});

test("lowPrecisionCoordinateFlag: precise pins with at most one decimal place", () => {
  const anfal = { location_quality: "precise", coordinates: { lat: 33, lon: 43 }, coordinate_source: "wikidata" };
  assert.ok(lowPrecisionCoordinateFlag(anfal).startsWith(`${LOW_PRECISION_FLAG}: the wikidata coordinates (33, 43)`));
  assert.equal(lowPrecisionCoordinateFlag({ ...anfal, coordinates: { lat: 33.3, lon: 43.25 } }), null);
  assert.equal(lowPrecisionCoordinateFlag({ ...anfal, location_quality: "approximate" }), null);
  assert.equal(lowPrecisionCoordinateFlag({ location_quality: "none", coordinates: null }), null);
});

const OCT7 =
  "On October 7, 2023, a series of coordinated armed incursions from the blockaded Gaza Strip into the Gaza envelope of " +
  "southern Israel were carried out by Hamas. In response, Israel launched a major military operation in Gaza on 8 October 2023.";

test("firstSentence / exactDaysIn: both date styles, ranges, first sentence only", () => {
  assert.match(firstSentence(OCT7), /^On October 7, 2023, .* Hamas\.$/);
  assert.deepEqual(exactDaysIn(firstSentence(OCT7)), ["2023-10-07"]);
  assert.deepEqual(exactDaysIn("fought 13–26 May 2015 and from October 7–8, 2023"), ["2015-05-13", "2023-10-07"]);
  assert.deepEqual(exactDaysIn("in May 2015, in 1948"), []);
  assert.equal(firstSentence("First para.\n\nSecond para."), "First para.");
});

test("monthPrecisionDayFlag: month-precision date with an exact day of that month in the first sentence", () => {
  const f = monthPrecisionDayFlag({ date_start: "2023-10-01", date_precision: "month", extract: OCT7 });
  assert.ok(f.startsWith(`${MONTH_DAY_FLAG}: date_start 2023-10-01`));
  assert.match(f, /names 2023-10-07/);
  // day precision, another month, a day only after the first sentence, or no extract: no flag
  assert.equal(monthPrecisionDayFlag({ date_start: "2023-10-07", date_precision: "day", extract: OCT7 }), null);
  assert.equal(monthPrecisionDayFlag({ date_start: "2023-11-01", date_precision: "month", extract: OCT7 }), null);
  assert.equal(
    monthPrecisionDayFlag({ date_start: "2023-10-01", date_precision: "month", extract: "The war began in October 2023. It escalated on 8 October 2023." }),
    null
  );
  assert.equal(monthPrecisionDayFlag({ date_start: "2023-10-01", date_precision: "month", extract: null }), null);
});

test("pruneDuplicateHints: drops hints (and their review notes) to ids that are not published", () => {
  const ev = {
    id: "october-7-attacks",
    possible_duplicates: [
      { id: "ein-hashlosha-massacre", title: "Ein HaShlosha massacre", reason: "same Wikidata item (QID / resolved QID)" },
      { id: "gaza-war", title: "Gaza war", reason: "similar title" },
    ],
    review_reasons: [
      "part_of: x",
      'possible_duplicate: possible duplicate of "Ein HaShlosha massacre" (ein-hashlosha-massacre) - same Wikidata item (QID / resolved QID)',
      'possible_duplicate: possible duplicate of "Gaza war" (gaza-war) - similar title',
    ],
  };
  assert.deepEqual(pruneDuplicateHints(ev, new Set(["october-7-attacks", "gaza-war"])), ["ein-hashlosha-massacre"]);
  assert.deepEqual(ev.possible_duplicates.map((h) => h.id), ["gaza-war"]);
  assert.deepEqual(ev.review_reasons, ["part_of: x", 'possible_duplicate: possible duplicate of "Gaza war" (gaza-war) - similar title']);
  // nothing dangling: untouched; another reasons key (enrich-candidates keeps them in `_review`)
  const before = JSON.stringify(ev);
  assert.deepEqual(pruneDuplicateHints(ev, new Set(["gaza-war"])), []);
  assert.equal(JSON.stringify(ev), before);
  const r = { possible_duplicates: [{ id: "a" }], _review: ['possible_duplicate: possible duplicate of "A" (a) - x'] };
  pruneDuplicateHints(r, new Set(), "_review");
  assert.deepEqual(r, { possible_duplicates: [], _review: [] });
});

test("leadStartDayFlag: a day-precision start the first sentence does not name, next to another day that year", () => {
  // Battle of Gaza (2007): stored 2007-06-10 (Wikidata P580); the lead's first sentence says "from 7 to 15 June 2007".
  const gaza = "The Battle of Gaza, also known as the Gaza civil war, was a brief civil war between Fatah and Hamas that took place in the Gaza Strip from 7 to 15 June 2007. It was a prominent event.";
  const f = leadStartDayFlag({ date_start: "2007-06-10", date_end: "2007-06-15", date_precision: "day", extract: gaza });
  assert.ok(f.startsWith(`${LEAD_DAY_FLAG}: date_start 2007-06-10`), f);
  assert.match(f, /names 2007-06-07;/, "the range's first day; the end day 15 June is not listed");
  // Named start, the end day only, another year only, or a coarser precision: no flag.
  assert.equal(leadStartDayFlag({ date_start: "2007-06-07", date_end: "2007-06-15", date_precision: "day", extract: gaza }), null);
  const endOnly = "The battle ended on 30 December 1917 with the capture of the city.";
  assert.equal(leadStartDayFlag({ date_start: "1917-11-17", date_end: "1917-12-30", date_precision: "day", extract: endOnly }), null);
  assert.equal(leadStartDayFlag({ date_start: "2008-06-10", date_precision: "day", extract: gaza }), null);
  assert.equal(leadStartDayFlag({ date_start: "2007-06-01", date_precision: "month", extract: gaza }), null);
  assert.equal(leadStartDayFlag({ date_start: "2007-06-10", date_precision: "day", extract: "" }), null);
});
