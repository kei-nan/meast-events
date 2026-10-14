import test from "node:test";
import assert from "node:assert/strict";
import { predecessorStates, predecessorCountryTags, presentDayCountryIndex, predecessorItemsQuery, predecessorStatesQuery } from "./predecessor.js";
import { finalizeEvent, PREDECESSOR_FLAG } from "./v21.js";

// Real Wikidata QIDs, used only as identifiers here.
const Q = {
  ottoman: "Q12560", kingdomEgypt: "Q124943", mandatoryPalestine: "Q193714", // predecessors (Q193714 is also tracked)
  turkey: "Q43", egypt: "Q79", greece: "Q41", northMacedonia: "Q221",
  sivasProvince: "Q483100", erzurumVilayet: "Q1366246", westAsia: "Q27293", monastirVilayet: "Q2121602",
};

const preds = predecessorStates([
  { pred: Q.ottoman, label: "Ottoman Empire", country: "Turkey" },
  { pred: Q.kingdomEgypt, label: "Kingdom of Egypt", country: "Egypt" },
  { pred: Q.erzurumVilayet, label: "Erzurum vilayet", country: "Turkey" },
  { pred: Q.monastirVilayet, label: "Monastir vilayet", country: "Turkey" },
  { pred: Q.mandatoryPalestine, label: "Mandatory Palestine", country: "Israel/Palestine" },
]);

test("predecessorStates: one entry per state with its successors; a tracked QID is never a predecessor", () => {
  assert.deepEqual(preds.get(Q.ottoman), { label: "Ottoman Empire", successors: ["Turkey"] });
  assert.equal(preds.has(Q.mandatoryPalestine), false);
  const twice = predecessorStates([
    { pred: "Q170468", label: "United Arab Republic", country: "Syria" },
    { pred: "Q170468", label: "United Arab Republic", country: "Egypt" },
    { pred: "Q170468", label: "United Arab Republic", country: "Egypt" },
  ]);
  assert.deepEqual(twice.get("Q170468").successors, ["Syria", "Egypt"]);
});

test("queries name the predecessor link and the date superset", () => {
  assert.match(predecessorStatesQuery(), /wdt:P1366/);
  assert.match(predecessorStatesQuery(), /wdt:P1365/);
  const q = predecessorItemsQuery([Q.ottoman, Q.kingdomEgypt]);
  assert.match(q, /VALUES \?pred \{ wd:Q12560 wd:Q124943 \}/);
  assert.match(q, /YEAR\(\?date\) >= 1900/);
});

// A stand-in for presentDayCountryIndex: a point east of 30E is "in Turkey".
const countriesAt = ({ lon }) => (lon > 30 ? ["Turkey"] : []);

test("rule: a P276 place's present-day tracked country counts (Koçgiri Rebellion: Sivas Province)", () => {
  const places = new Map([[Q.sivasProvince, { p17: [Q.turkey] }]]);
  const r = predecessorCountryTags({ p17: [Q.ottoman], p276: [Q.sivasProvince], p625: null }, places, preds, countriesAt);
  assert.deepEqual(r, { countries: ["Turkey"], predecessors: [Q.ottoman], via: [{ property: "P276", value: Q.sivasProvince, countries: ["Turkey"] }] });
});

test("rule: the item's own P625 counts when it lies in a tracked country", () => {
  const r = predecessorCountryTags({ p17: [Q.ottoman], p276: [], p625: { lat: 38.49, lon: 43.38 } }, new Map(), preds, countriesAt);
  assert.deepEqual(r.countries, ["Turkey"]);
  assert.equal(r.via[0].property, "P625");
});

test("rule (strict): no tag without a located P625 or a present-day place country", () => {
  // Sayfo: P17 Ottoman Empire, P276 West Asia (no P17), no P625.
  const sayfo = predecessorCountryTags({ p17: [Q.ottoman], p276: [Q.westAsia], p625: null }, new Map([[Q.westAsia, { p17: [] }]]), preds, countriesAt);
  assert.deepEqual(sayfo.countries, []);
  // Bergmann Offensive: P276 Erzurum vilayet, whose own P17 is the Ottoman Empire - a predecessor, not a present-day country.
  const places = new Map([[Q.erzurumVilayet, { p17: [Q.ottoman] }]]);
  assert.deepEqual(predecessorCountryTags({ p17: [Q.ottoman], p276: [Q.erzurumVilayet], p625: null }, places, preds, countriesAt).countries, []);
  // Battle of Monastir: P625 outside every tracked country (North Macedonia).
  assert.deepEqual(predecessorCountryTags({ p17: [Q.ottoman, Q.northMacedonia], p276: [], p625: { lat: 41.03, lon: 21.34 } }, new Map(), preds, countriesAt).countries, []);
  // A place listing Mandatory Palestine (tracked, but itself a predecessor) does not lend a present-day country:
  const mp = predecessorStates([{ pred: Q.ottoman, country: "Turkey" }]);
  mp.set(Q.mandatoryPalestine, { label: "Mandatory Palestine", successors: ["Israel/Palestine"] });
  assert.deepEqual(predecessorCountryTags({ p17: [Q.ottoman], p276: ["Q1"], p625: null }, new Map([["Q1", { p17: [Q.mandatoryPalestine] }]]), mp, countriesAt).countries, []);
});

test("rule: an item whose P17 names no predecessor state is not this rule's business", () => {
  assert.equal(predecessorCountryTags({ p17: [Q.turkey], p276: [], p625: null }, new Map(), preds, countriesAt), null);
  assert.equal(predecessorCountryTags({ p17: [Q.greece], p276: [], p625: { lat: 40, lon: 35 } }, new Map(), preds, countriesAt), null);
});

const turf = await import("@turf/turf").catch(() => null);
test("presentDayCountryIndex: strict point-in-shape against the map's present-day shapes", { skip: !turf && "needs root npm ci" }, () => {
  const square = (name, x0, y0, x1, y1) => ({
    type: "Feature",
    properties: { name, start_year: 1924, end_year: 9999 },
    geometry: { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
  });
  const at = presentDayCountryIndex({ features: [square("Turkey", 26, 36, 45, 42), square("Egypt", 25, 22, 35, 31.5)] }, turf, 2026);
  assert.deepEqual(at({ lat: 37.58, lon: 36.93 }), ["Turkey"]); // Marash
  assert.deepEqual(at({ lat: 30.04, lon: 31.24 }), ["Egypt"]);
  assert.deepEqual(at({ lat: 41.03, lon: 21.34 }), []); // Monastir/Bitola: outside
  assert.deepEqual(presentDayCountryIndex({ features: [square("Turkey", 26, 36, 45, 42)] }, turf, 1900)({ lat: 37.58, lon: 36.93 }), [], "only shapes drawn in that year");
});

test("finalizeEvent: predecessor-rule tags are supported by Wikidata and flagged with their evidence", () => {
  const ev = {
    id: "kocgiri-rebellion", title: "Koçgiri Rebellion", wikidata_qid: "Q1758033", wikipedia_url: "https://en.wikipedia.org/wiki/Ko%C3%A7giri_Rebellion",
    date_start: "1921-06-17", countries: ["Turkey"], category: "rebellion", category_group: "uprising", wikidata_classes: ["rebellion"],
    extract: "The Koçgiri rebellion was a Kurdish uprising in 1921.", extract_retrieved_at: "2026-10-15", sitelinks: 14,
    review_reasons: [], predecessor_rule: { predecessors: [Q.ottoman], via: [{ property: "P276", value: Q.sivasProvince, countries: ["Turkey"] }] },
  };
  const ctx = {
    leads: new Map(), entities: new Map([["Q1758033", { p31: ["Q6107280"], p17: [Q.ottoman], p276: [Q.sivasProvince], p131: [] }]]),
    places: new Map([[Q.sivasProvince, { p17: [Q.turkey] }]]), labels: { [Q.ottoman]: "Ottoman Empire", Q6107280: "rebellion" },
    matched: new Map([["Q1758033", ["rebellion"]]]), sovereign: new Set([Q.turkey]), reconcileDates: false,
  };
  finalizeEvent(ev, ctx);
  assert.equal(ev.review_reasons.filter((r) => r.startsWith("country_not_supported_by_wikidata")).length, 0);
  const flag = ev.review_reasons.find((r) => r.startsWith(PREDECESSOR_FLAG));
  assert.match(flag, /Ottoman Empire \(Q12560\)/);
  assert.match(flag, /P276 Q483100 -> Turkey/);
  finalizeEvent(ev, ctx);
  assert.equal(ev.review_reasons.filter((r) => r.startsWith(PREDECESSOR_FLAG)).length, 1, "re-runs do not stack the flag");
});
