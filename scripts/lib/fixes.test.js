import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA_FIXES, applyDataFix, reconcileStartDate, keptDatePrecision, keptEndPrecision, lastDayOfPeriod } from "./fixes.js";

test("applyDataFix F7: October 7 attacks start = Wikidata P580, end untouched", () => {
  const ev = { id: "october-7-attacks", wikidata_qid: "Q122976243", date_start: "2023-10-01", date_end: "2023-10-09", review_reasons: [] };
  assert.deepEqual(applyDataFix(ev), ["date_start"]);
  assert.equal(ev.date_start, "2023-10-07");
  assert.equal(ev.date_end, "2023-10-09");
  assert.match(ev.review_reasons[0], /^data_fix F7:/);
});

test("applyDataFix F11: a borrowed pin becomes the event's own P625 and its distance flag is recomputed", () => {
  const ev = {
    id: "operation-marg-bar-sarmachar", wikidata_qid: "Q124309366", countries: ["Iran"],
    coordinates: { lat: 27.16666667, lon: 64.26666667 }, coordinate_source: "wikipedia", location_quality: "precise",
    needs_manual_coordinates: false,
    review_reasons: ["coordinate_far_from_countries: point is 1544 km from the nearest tagged country's reference point (Iran)"],
  };
  assert.deepEqual(applyDataFix(ev), ["coordinates", "coordinate_source"]);
  assert.deepEqual(ev.coordinates, { lat: 27.370833333333334, lon: 62.3325 });
  assert.equal(ev.coordinate_source, "wikidata");
  assert.equal(ev.review_reasons.some((r) => r.startsWith("coordinate_far_from_countries")), false);
  assert.match(ev.review_reasons.at(-1), /^data_fix F11:/);
});

test("applyDataFix F11: no own location means no pin", () => {
  const ev = {
    id: "operation-guardian-of-the-walls", wikidata_qid: "Q106786309", countries: ["Israel/Palestine"],
    coordinates: { lat: 31, lon: 35 }, coordinate_source: "wikidata", location_quality: "precise", needs_manual_coordinates: false,
  };
  applyDataFix(ev);
  assert.equal(ev.coordinates, null);
  assert.equal(ev.coordinate_source, null);
  assert.equal(ev.location_quality, "none");
});

test("keptDatePrecision: precision of the date actually kept, not of a discarded one", () => {
  // 1948 Arab-Israeli War: decade-precision P585 "1940" was replaced by P580 1948-05-15
  const war = { p585: [{ time: "1940-00-00", precision: 8 }], p580: [{ time: "1948-05-15", precision: 11 }] };
  assert.deepEqual(keptDatePrecision(war, "1948-05-15"), { code: 11, name: "day", property: "P580" });
  assert.equal(keptDatePrecision(war, "1940-01-01").name, "decade", "the stored 1940-01-01 is Wikidata's 1940-00-00");
  // October 7 attacks: month-precision P585 2023-10 vs day-precision P580 2023-10-07
  const oct7 = { p585: [{ time: "2023-10-00", precision: 10 }], p580: [{ time: "2023-10-07", precision: 11 }] };
  assert.equal(keptDatePrecision(oct7, "2023-10-01").name, "month");
  assert.equal(keptDatePrecision(oct7, "2023-10-07").name, "day");
  // an exact match beats a normalised one; P585 first among equals (the discovery COALESCE order)
  const both = { p585: [{ time: "2020-01-00", precision: 10 }], p580: [{ time: "2020-01-01", precision: 11 }] };
  assert.equal(keptDatePrecision(both, "2020-01-01").property, "P580");
  const same = { p585: [{ time: "2020-01-01", precision: 11 }], p580: [{ time: "2020-01-01", precision: 9 }] };
  assert.equal(keptDatePrecision(same, "2020-01-01").property, "P585");
  // a date that is no P585/P580 value of the item (e.g. taken from the Wikipedia infobox) has no derivable precision
  assert.equal(keptDatePrecision(war, "1949-03-10"), null);
  assert.equal(keptDatePrecision(null, "1948-05-15"), null);
  assert.equal(keptDatePrecision(war, null), null);
});

test("ledger: one entry per QID, each ref documented in docs/data-fixes.md", () => {
  const qids = DATA_FIXES.map((f) => f.qid);
  assert.equal(new Set(qids).size, qids.length, "a repeated QID would be silently dropped by FIXES_BY_QID");
  const doc = readFileSync(new URL("../../docs/data-fixes.md", import.meta.url), "utf8");
  for (const { ref } of DATA_FIXES) assert.match(doc, new RegExp(`^## ${ref} - `, "m"), `${ref} has no section`);
});

test("ledger: `from` (what Wikidata gave when the fix was written) names only fields the fix sets, never the fixed value", () => {
  for (const f of DATA_FIXES.filter((x) => x.from)) {
    for (const [field, was] of Object.entries(f.from)) {
      assert.ok(field in f.set, `${f.ref} ${f.qid}: from.${field} but the fix does not set ${field}`);
      assert.notEqual(was, f.set[field], `${f.ref} ${f.qid}: from.${field} equals the fixed value`);
      if (was != null && field.startsWith("date_")) assert.match(was, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test("F16: the Iraqi invasion of Kuwait starts on 2 August 1990, and the flags of the wrong date are gone", () => {
  // Re-running the pipeline on the discovery record (data/event-candidates.json: start 2009-08-02) gives the same date.
  const ev = { id: "x", wikidata_qid: "Q856650", date_start: "2009-08-02", date_end: "1990-08-04" };
  assert.deepEqual(applyDataFix(ev), ["date_start"]);
  assert.equal(ev.date_start, "1990-08-02");
  assert.equal(ev.date_end, "1990-08-04");
  assert.match(ev.review_reasons[0], /^data_fix F16:/);

  const data = (f) => readFileSync(new URL(`../../data/${f}`, import.meta.url), "utf8");
  const stored = JSON.parse(data("events.json")).find((e) => e.id === "iraqi-invasion-of-kuwait");
  assert.equal(stored.date_start, "1990-08-02");
  assert.equal(stored.date_end, "1990-08-04");
  assert.equal(stored.date_flags, undefined);
  assert.equal(stored.wikipedia_lead_dates, undefined);
  assert.ok(stored.review_reasons.some((r) => r.startsWith("data_fix F16:")));
  assert.ok(!stored.review_reasons.some((r) => r.startsWith("category_year_mismatch")));
  assert.deepEqual(applyDataFix(stored), [], "the stored record is what the ledger gives");
  assert.equal(JSON.parse(data("framing-review.json")).events["iraqi-invasion-of-kuwait"].data_note, undefined);
  assert.doesNotMatch(data("wikidata-date-suggestions.tsv"), /Q856650/);
});

test("applyDataFix: sets the listed fields once, with one review reason", () => {
  const ev = { id: "x", wikidata_qid: "Q17286795", date_start: "2014-07-21", date_end: "2014-06-30", review_reasons: ["other"] };
  assert.deepEqual(applyDataFix(ev), ["date_start", "date_end"]);
  assert.equal(ev.date_start, "2014-06-26");
  assert.equal(ev.date_end, "2014-07-21");
  assert.equal(ev.needs_review, true);
  assert.equal(ev.review_reasons.filter((r) => r.startsWith("data_fix F6:")).length, 1);
  assert.deepEqual(applyDataFix(ev), [], "second run changes nothing");
  assert.equal(ev.review_reasons.length, 2);
});

test("applyDataFix: an unlisted QID is left alone", () => {
  const ev = { id: "y", wikidata_qid: "Q1", date_start: "2000-01-01" };
  assert.deepEqual(applyDataFix(ev), []);
  assert.deepEqual(ev, { id: "y", wikidata_qid: "Q1", date_start: "2000-01-01" });
});

test("reconcileStartDate: P585 equal to the end time -> P580", () => {
  const entity = {
    p585: [{ time: "1918-11-11", precision: 11 }],
    p580: [{ time: "1914-07-28", precision: 11 }],
    p582: [{ time: "1918-11-11", precision: 11 }],
  };
  assert.equal(reconcileStartDate("1918-11-11", entity).date_start, "1914-07-28");
});

test("reconcileStartDate: decade-precision P585 -> year-or-finer P580", () => {
  const entity = { p585: [{ time: "1940-00-00", precision: 8 }], p580: [{ time: "1948-05-15", precision: 11 }] };
  assert.equal(reconcileStartDate("1940-01-01", entity).date_start, "1948-05-15");
});

test("reconcileStartDate: P585 strictly between P580 and P582 -> P580", () => {
  // 2009 Iranian presidential election protests (Q854206), live 2026-10-29.
  const protests = {
    p585: [{ time: "2010-02-11", precision: 11 }],
    p580: [{ time: "2009-06-13", precision: 11 }],
    p582: [{ time: "2010-12-07", precision: 11 }],
  };
  const r = reconcileStartDate("2010-02-11", protests);
  assert.equal(r.date_start, "2009-06-13");
  assert.match(r.reason, /strictly between .*P580 2009-06-13.*P582 2010-12-07/);
  // A month-precision P580 is stored as the 1st, like the discovery date.
  const month = { ...protests, p580: [{ time: "2009-06-00", precision: 10 }] };
  assert.equal(reconcileStartDate("2010-02-11", month).date_start, "2009-06-01");
  // Not inside: P585 on the start day, before it, after the end (the F6 pattern stays a flag), or no end at all.
  assert.equal(reconcileStartDate("2009-06-13", { ...protests, p585: [{ time: "2009-06-13", precision: 11 }] }), null);
  assert.equal(reconcileStartDate("2009-01-01", { ...protests, p585: [{ time: "2009-01-01", precision: 11 }] }), null);
  assert.equal(reconcileStartDate("2011-01-01", { ...protests, p585: [{ time: "2011-01-01", precision: 11 }] }), null);
  assert.equal(reconcileStartDate("2010-02-11", { ...protests, p582: [] }), null);
  // A decade-or-coarser P580 is no better a start.
  assert.equal(reconcileStartDate("2010-02-11", { ...protests, p580: [{ time: "2000-00-00", precision: 8 }] }), null);
});

test("reconcileStartDate: a year-precision P585 yields to a finer P580 within that year (case d)", () => {
  // 2014 Gaza War (Q17324420), live 2026-11-14: P585 +2014 (year), P580 2014-07-08, P582 2014-08-26.
  const gaza = {
    p585: [{ time: "2014-00-00", precision: 9 }],
    p580: [{ time: "2014-07-08", precision: 11 }],
    p582: [{ time: "2014-08-26", precision: 11 }],
  };
  const r = reconcileStartDate("2014-01-01", gaza);
  assert.equal(r.date_start, "2014-07-08");
  assert.equal(r.rule, "year");
  assert.equal(r.precision, 11);
  assert.match(r.reason, /P585 2014-00-00 is only year precision .*P580 2014-07-08, day precision.*; used P580 start time 2014-07-08$/);
  // No end needed (2026 Iran war, Q138503695: P585 +2026, P580 2026-02-28, no P582).
  assert.equal(reconcileStartDate("2026-01-01", { p585: [{ time: "2026-00-00", precision: 9 }], p580: [{ time: "2026-02-28", precision: 11 }] }).date_start, "2026-02-28");
  // A month-precision P580 is stored as the 1st (Iraqi Revolt, Q616851: P585 +1920, P580 1920-05).
  const revolt = { p585: [{ time: "1920-00-00", precision: 9 }], p580: [{ time: "1920-05-00", precision: 10 }], p582: [{ time: "1920-10-00", precision: 10 }] };
  assert.deepEqual(
    [reconcileStartDate("1920-01-01", revolt).date_start, reconcileStartDate("1920-01-01", revolt).precision],
    ["1920-05-01", 10]
  );
  // Not applied: a P580 in another year (the two disagree; without a P582, so case (c) does not apply either), a
  // P580 no finer than the year, a stored start that is not the P585, or a day-precision P585.
  assert.equal(reconcileStartDate("2014-01-01", { ...gaza, p580: [{ time: "2013-12-30", precision: 11 }], p582: [] }), null);
  assert.equal(reconcileStartDate("2014-01-01", { ...gaza, p580: [{ time: "2015-02-01", precision: 11 }], p582: [] }), null);
  assert.equal(reconcileStartDate("2014-01-01", { ...gaza, p580: [{ time: "2014-00-00", precision: 9 }] }), null);
  assert.equal(reconcileStartDate("2014-07-08", gaza), null);
  assert.equal(reconcileStartDate("2014-01-01", { ...gaza, p585: [{ time: "2014-01-01", precision: 11 }] }), null);
});

test("reconcileStartDate: names the case it applied", () => {
  const p580 = [{ time: "1948-05-15", precision: 11 }];
  assert.equal(reconcileStartDate("1940-01-01", { p585: [{ time: "1940-00-00", precision: 8 }], p580 }).rule, "coarse");
  assert.equal(reconcileStartDate("1949-03-10", { p585: [{ time: "1949-03-10", precision: 11 }], p580, p582: [{ time: "1949-03-10", precision: 11 }] }).rule, "end");
  assert.equal(reconcileStartDate("1948-12-01", { p585: [{ time: "1948-12-01", precision: 11 }], p580, p582: [{ time: "1949-03-10", precision: 11 }] }).rule, "inside");
});

test("reconcileStartDate: leaves ordinary dates alone", () => {
  const entity = { p585: [{ time: "1967-06-05", precision: 11 }], p580: [{ time: "1967-06-05", precision: 11 }] };
  assert.equal(reconcileStartDate("1967-06-05", entity), null);
  assert.equal(reconcileStartDate("1967-06-05", null), null);
});

test("keptEndPrecision: precision of the P582 statement behind date_end", () => {
  // Passover massacre (Q2660905), live 2026-10-14: P582 +2002-00-00, precision 9 (year).
  const passover = { p582: [{ time: "2002-00-00", precision: 9 }] };
  assert.deepEqual(keptEndPrecision(passover, "2002-01-01"), { code: 9, name: "year", property: "P582" });
  assert.equal(keptEndPrecision(passover, "2003-01-01"), null);
  assert.equal(keptEndPrecision(null, "2002-01-01"), null);
  assert.equal(keptEndPrecision(passover, null), null);
});

test("lastDayOfPeriod: the end of the period a coarse Wikidata date stands for", () => {
  assert.equal(lastDayOfPeriod("2002-03-27", 11), "2002-03-27");
  assert.equal(lastDayOfPeriod("2024-02-01", 10), "2024-02-29");
  assert.equal(lastDayOfPeriod("2002-01-01", 9), "2002-12-31");
  assert.equal(lastDayOfPeriod("1940-01-01", 8), "1949-12-31");
  // Wikibase centuries run 1901-2000: +2000 and +1901 at precision 7 are both "20. century".
  assert.equal(lastDayOfPeriod("2000-01-01", 7), "2000-12-31");
  assert.equal(lastDayOfPeriod("1901-01-01", 7), "2000-12-31");
  assert.equal(lastDayOfPeriod("2001-01-01", 7), "2100-12-31");
  assert.equal(lastDayOfPeriod("not a date", 9), null);
  assert.equal(lastDayOfPeriod("2000-01-01", 3), null);
});
