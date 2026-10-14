import test from "node:test";
import assert from "node:assert/strict";
import { renderMissingReport, reportDataAsOf, lacksPreciseLocation } from "./missing-report.js";

const ev = (over) => ({
  id: "x",
  title: "X",
  wikidata_qid: "Q1",
  date_start: "2000-01-01",
  wikipedia_url: "https://en.wikipedia.org/wiki/X",
  coordinates: null,
  coordinate_source: null,
  location_quality: "none",
  extract_retrieved_at: "2026-10-01",
  ...over,
});

test("lacksPreciseLocation: no coordinates or a capital fallback", () => {
  assert.equal(lacksPreciseLocation(ev({})), true);
  assert.equal(lacksPreciseLocation(ev({ coordinates: { lat: 1, lon: 2 }, coordinate_source: "country-fallback:Iraq" })), true);
  assert.equal(lacksPreciseLocation(ev({ coordinates: { lat: 1, lon: 2 }, coordinate_source: "wikidata" })), false);
});

test("renderMissingReport: sorted by stored sitelinks, curated proposed events listed once, deterministic", () => {
  const curated = [
    ev({ id: "a", title: "A | pipe", wikidata_qid: "Q10", sitelinks_current: 5 }),
    ev({ id: "b", title: "B", wikidata_qid: "Q2", sitelinks_current: 50, coordinates: { lat: 1, lon: 2 }, coordinate_source: "country-fallback:Iraq" }),
    ev({ id: "c", title: "C", wikidata_qid: "Q3", coordinates: { lat: 1, lon: 2 }, coordinate_source: "wikidata", location_quality: "precise" }),
  ];
  const proposed = [
    ev({ id: "a", wikidata_qid: "Q10", sitelinks: 5, retrieved_at: "2026-10-05T10:00:00Z" }), // already curated
    ev({ id: "n", title: "New", wikidata_qid: "Q7", sitelinks: 12, retrieved_at: "2026-10-06T10:00:00Z" }),
  ];
  const r = renderMissingReport({ curated, proposed });
  assert.equal(r.curated, 2);
  assert.equal(r.proposed, 1);
  assert.ok(r.md.indexOf("| 1 | B | 2000-01-01 | 50 | pin at Iraq capital (approximate)") < r.md.indexOf("| 2 | A \\| pipe |"));
  assert.match(r.md, /\| 1 \| New \| 2000-01-01 \| 12 \| no location \|/);
  assert.match(r.md, /data retrieved up to 2026-10-06/);
  assert.equal(renderMissingReport({ curated, proposed }).md, r.md);
  assert.equal(reportDataAsOf([], []), null);
});
