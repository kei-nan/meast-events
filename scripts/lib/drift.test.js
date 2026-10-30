import test from "node:test";
import assert from "node:assert/strict";
import { driftFor, renderDriftReport } from "./drift.js";

// Fixtures modelled on the curated data and the Wikidata items as read on 2026-10-30 (no network in tests).
const entity = (over = {}) => ({
  qid: "Q1",
  redirected: false,
  p31: [],
  p585: [],
  p580: [],
  p582: [],
  p625: null,
  ...over,
});
const ev = (over = {}) => ({
  id: "x",
  wikidata_qid: "Q1",
  date_start: "1990-08-02",
  date_end: null,
  coordinates: null,
  coordinate_source: null,
  location_quality: "none",
  wikidata_classes: [],
  sitelinks: 12,
  ...over,
});

test("driftFor: an event without a pin whose item now has coordinates (operation-tariq-al-quds, Q1382298)", () => {
  const e = ev({ id: "operation-tariq-al-quds", wikidata_qid: "Q1382298", date_start: "1981-12-07", wikidata_classes: ["military operation", "battle"] });
  const w = entity({ qid: "Q1382298", p31: ["Q645883", "Q178561"], p585: [{ time: "1981-12-07", precision: 11 }], p625: { lat: 31.7315, lon: 48.0418 } });
  const { rows, explained } = driftFor(e, w, { Q645883: "military operation", Q178561: "battle" });
  assert.deepEqual(rows, [{ field: "coordinates", stored: "none", wikidata: "P625: 31.7315, 48.0418" }]);
  assert.deepEqual(explained, []);
});

test("driftFor: a stored start that is no longer any Wikidata P585/P580 value (german-ottoman-alliance, Q261982)", () => {
  const e = ev({ id: "german-ottoman-alliance", wikidata_qid: "Q261982", date_start: "1914-08-02" });
  const { rows } = driftFor(e, entity({ p585: [{ time: "1914-07-20", precision: 11 }] }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].field, "date_start");
  assert.equal(rows[0].wikidata, "P585: 1914-07-20 (precision 11); P580: none");
  // A start equal to a P580, or to a coarse value stored as its first day ("1917-00-00" -> 1917-01-01): no drift.
  assert.deepEqual(driftFor(ev({ date_start: "1914-08-02" }), entity({ p580: [{ time: "1914-08-02", precision: 11 }] })).rows, []);
  assert.deepEqual(driftFor(ev({ date_start: "1917-01-01" }), entity({ p585: [{ time: "1917-00-00", precision: 9 }] })).rows, []);
});

test("driftFor: end dates, both ways", () => {
  // A stored end Wikidata no longer has, and a missing end Wikidata now has (syrian-civil-war: P582 2024-12-08).
  const w = entity({ p585: [{ time: "1990-08-02", precision: 11 }], p582: [{ time: "2024-12-08", precision: 11 }] });
  assert.deepEqual(driftFor(ev(), w).rows, [{ field: "date_end", stored: "none", wikidata: "P582: 2024-12-08 (precision 11)" }]);
  assert.deepEqual(driftFor(ev({ date_end: "2024-12-08" }), w).rows, []);
  assert.equal(driftFor(ev({ date_end: "2024-12-09" }), w).rows[0].field, "date_end");
});

test("driftFor: coordinates from Wikidata that moved or were removed; other sources are not compared", () => {
  const start = { p585: [{ time: "1990-08-02", precision: 11 }] };
  const pinned = ev({ coordinates: { lat: 29.37, lon: 47.97 }, coordinate_source: "wikidata", location_quality: "precise" });
  assert.deepEqual(driftFor(pinned, entity({ ...start, p625: { lat: 29.37, lon: 47.97 } })).rows, []);
  assert.deepEqual(driftFor(pinned, entity({ ...start, p625: { lat: 29.3700004, lon: 47.97 } })).rows, []); // below 6 dp
  assert.equal(driftFor(pinned, entity({ ...start, p625: { lat: 29.4, lon: 47.97 } })).rows[0].wikidata, "P625: 29.4, 47.97");
  assert.equal(driftFor(pinned, entity(start)).rows[0].wikidata, "P625: none");
  // A Wikipedia pin is not checked against Wikidata's P625.
  assert.deepEqual(driftFor({ ...pinned, coordinate_source: "wikipedia" }, entity({ ...start, p625: { lat: 1, lon: 2 } })).rows, []);
});

test("driftFor: classes - new and dropped P31 labels; a discovery class matched by subclass is not drift", () => {
  const start = { p585: [{ time: "1990-08-02", precision: 11 }] };
  const e = ev({ wikidata_classes: ["military operation", "European Union Naval Forces", "battle"] });
  const w = entity({ ...start, p31: ["Q645883", "Q9"] });
  const { rows } = driftFor(e, w, { Q645883: "military operation", Q9: "European Naval Force Operation" });
  assert.deepEqual(rows, [
    {
      field: "classes",
      stored: "military operation, European Union Naval Forces, battle",
      wikidata: "new P31: European Naval Force Operation; no longer P31: European Union Naval Forces",
    },
  ]);
  // A class without an English label shows its QID, as lib/v21.js stores it.
  assert.deepEqual(driftFor(ev({ wikidata_classes: ["Q77"] }), entity({ ...start, p31: ["Q77"] }), {}).rows, []);
});

test("driftFor: a field the fix ledger sets is explained, not listed; a missing or redirected item is listed", () => {
  const e = ev({ date_start: "1916-06-10" });
  const w = entity({ p580: [{ time: "1916-06-00", precision: 10 }] });
  assert.deepEqual(driftFor(e, w, {}, { ref: "F14", set: { date_precision: "day" } }), { rows: [], explained: ["date_start (F14)"] });
  assert.deepEqual(driftFor(ev(), null).rows[0].field, "item");
  const moved = driftFor(ev(), entity({ qid: "Q2", redirected: true, p585: [{ time: "1990-08-02", precision: 11 }] })).rows;
  assert.deepEqual(moved, [{ field: "item", stored: "Q1", wikidata: "now redirects to Q2" }]);
});

test("renderDriftReport: grouped tables, ledger-explained count, kind column; pipes escaped", () => {
  const results = [
    { event: ev({ id: "a" }), rows: [{ field: "date_end", stored: "none", wikidata: "P582: 2024-12-08 (precision 11)" }], explained: [] },
    { event: ev({ id: "b", sitelinks: undefined }), rows: [{ field: "classes", stored: "x|y", wikidata: "new P31: z" }], explained: ["date_start (F14)"] },
  ];
  const md = renderDriftReport(results, { checked: 2, noQid: ["c"] });
  assert.match(md, /^## Wikidata drift \(report only\)/);
  assert.match(md, /Checked 2 events with a Wikidata item: 2 difference\(s\) in 2 event\(s\)\./);
  assert.match(md, /Not listed: 1 difference\(s\) the fix ledger explains \(b: date_start \(F14\)\)/);
  assert.match(md, /Not checked \(no wikidata_qid\): c\./);
  assert.match(md, /### date_end \(1\)[\s\S]*\| a \| discovered \| \[Q1\]\(https:\/\/www\.wikidata\.org\/wiki\/Q1\) \| none \|/);
  assert.match(md, /\| b \| seed \| .* \| x\\\|y \| new P31: z \|/);
  assert.doesNotMatch(md, /### coordinates/);
  // Nothing to report: the summary line only.
  assert.match(renderDriftReport([], { checked: 5 }), /Checked 5 events with a Wikidata item: 0 difference\(s\) in 0 event\(s\)\.\n$/);
});
