import test from "node:test";
import assert from "node:assert/strict";
import {
  decadeFloor,
  eventOverlapsRange,
  eventSpanYears,
  eventYearRange,
  eventYearsText,
  ongoingNote,
  ongoingSignal,
  rawEventYears,
  yearsReversed,
} from "./eventYears.js";
import { MAX_YEAR } from "./years.js";

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

// Ongoing events (docs/DATA_POLICY.md, "Ongoing events"). Records as in data/events.json.
const yemen = { title: "Yemeni civil war (2014–present)", date_start: "2014-09-16", date_end: null };
const syria = { title: "Syrian civil war", date_start: "2011-03-15", date_end: null };
const hezbollah = { title: "Hezbollah–Israel conflict (2023–present)", date_start: "2023-10-08", date_end: "2024-11-27" };
const kuwait = { title: "Iraqi invasion of Kuwait", date_start: "2009-08-02", date_end: "1990-08-04" };

test("ongoingSignal: a title saying present, or a Wikidata end time of no value / unknown value; nothing else", () => {
  assert.equal(ongoingSignal(yemen), "title");
  assert.equal(ongoingSignal({ ...yemen, title: "Iraqi insurgency (2017 - present)" }), "title");
  assert.equal(ongoingSignal({ ...syria, date_end_open: "wikidata_novalue" }), "wikidata_novalue");
  assert.equal(ongoingSignal({ ...syria, date_end_open: "wikidata_somevalue" }), "wikidata_somevalue");
  // No end date alone is not "still going on".
  assert.equal(ongoingSignal(syria), null);
  assert.equal(ongoingSignal({ ...syria, date_end_open: "something-else" }), null);
  // "present" not as the end of a span ("Presentation", "the present day") does not count.
  assert.equal(ongoingSignal({ ...syria, title: "Presentation of the plan" }), null);
  // An end date wins: the title's "present" and a stray date_end_open are not read.
  assert.equal(ongoingSignal(hezbollah), null);
  assert.equal(ongoingSignal({ ...hezbollah, date_end_open: "wikidata_novalue" }), null);
  assert.equal(ongoingSignal(kuwait), null);
  assert.equal(ongoingSignal({ title: "X (2014–present)", date_start: null }), null);
  assert.equal(ongoingSignal(null), null);
});

test("ongoing: counts in every year from its start to the current year (MAX_YEAR), never before its start", () => {
  assert.deepEqual(eventSpanYears(yemen), [2014, MAX_YEAR]);
  assert.deepEqual(eventSpanYears(yemen, 2020), [2014, 2020]);
  assert.deepEqual(eventSpanYears(yemen, 2010), [2014, 2014]); // a clock before the start: the start year
  assert.deepEqual(eventYearRange(yemen), [2014, MAX_YEAR]);
  assert.equal(eventOverlapsRange(yemen, 2018, 2020), true);
  assert.equal(eventOverlapsRange(yemen, MAX_YEAR, MAX_YEAR), true);
  assert.equal(eventOverlapsRange(yemen, 2000, 2013), false);
  // rawEventYears (labels) is unchanged: the dates as given.
  assert.deepEqual(rawEventYears(yemen), [2014, 2014]);
});

test("no end date and no signal: still its start year only", () => {
  assert.deepEqual(eventSpanYears(syria), [2011, 2011]);
  assert.equal(eventOverlapsRange(syria, 2018, 2020), false);
  assert.equal(eventOverlapsRange(syria, 2011, 2011), true);
});

test("records with an end date are unchanged, reversed ones included (Kuwait: 1990 and 2009 only)", () => {
  assert.deepEqual(eventSpanYears(hezbollah), [2023, 2024]);
  assert.equal(eventOverlapsRange(hezbollah, 2025, 2026), false);
  assert.deepEqual(eventSpanYears(kuwait), [2009, 1990]);
  assert.equal(yearsReversed(kuwait), true);
  assert.equal(eventOverlapsRange(kuwait, 2000, 2005), false);
  assert.equal(eventOverlapsRange(kuwait, 1990, 1990), true);
  assert.equal(eventOverlapsRange(kuwait, 2009, 2009), true);
  assert.equal(eventOverlapsRange(kuwait, 2010, MAX_YEAR), false);
});

test("eventOverlapsRange: a changed title or date_end_open is read again (the year cache)", () => {
  const e = { ...syria };
  assert.equal(eventOverlapsRange(e, 2018, 2020), false);
  e.date_end_open = "wikidata_somevalue";
  assert.equal(eventOverlapsRange(e, 2018, 2020), true);
  delete e.date_end_open;
  e.title = "Syrian civil war (2011–present)";
  assert.equal(eventOverlapsRange(e, 2018, 2020), true);
  e.title = "Syrian civil war";
  assert.equal(eventOverlapsRange(e, 2018, 2020), false);
});

test("eventYearsText and ongoingNote name the reading and its source", () => {
  assert.equal(eventYearsText(yemen), "2014–ongoing");
  assert.equal(eventYearsText(syria), "2011");
  assert.equal(eventYearsText(hezbollah), "2023–2024");
  assert.equal(eventYearsText(kuwait), "2009–1990");
  assert.equal(eventYearsText({ title: "x" }), "");
  assert.match(ongoingNote(yemen), /Wikipedia article title says “present”/);
  assert.match(ongoingNote({ ...syria, date_end_open: "wikidata_novalue" }), /Wikidata gives its end time as “no value”/);
  assert.match(ongoingNote({ ...syria, date_end_open: "wikidata_somevalue" }), /“unknown value”/);
  assert.equal(ongoingNote(syria), null);
});
