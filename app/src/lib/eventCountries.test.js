import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COUNTRY_SHAPES,
  countryHighlightFeatures,
  countryShading,
  eventBorderYear,
  featuresBbox,
  needsCountryShading,
  shapeNamesFor,
} from "./eventCountries.js";
import { MAX_YEAR, MIN_YEAR } from "./years.js";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");
const boundaries = JSON.parse(readFileSync(path.join(DATA_DIR, "boundaries.json"), "utf8")).features;
const events = JSON.parse(readFileSync(path.join(DATA_DIR, "events.json"), "utf8"));

const activeNames = (year) =>
  new Set(boundaries.filter((f) => f.properties.start_year <= year && year <= f.properties.end_year).map((f) => f.properties.name));
const years = [];
for (let y = MIN_YEAR; y <= MAX_YEAR; y++) years.push(y);

// Shapes used for only part of the years they are drawn (see eventCountries.js).
const PARTIAL = { Turkey: ["Ottoman Empire"] };

test("every country name used by the events has a reviewed entry", () => {
  const vocab = new Set(events.flatMap((e) => e.countries ?? []));
  for (const c of vocab) assert.ok(Object.hasOwn(COUNTRY_SHAPES, c), `no COUNTRY_SHAPES entry for "${c}"`);
});

test("every mapped shape is drawn in boundaries.json in every year the table claims", () => {
  for (const y of years) {
    const active = activeNames(y);
    for (const [country, entries] of Object.entries(COUNTRY_SHAPES)) {
      for (const [name, from, to] of entries) {
        if (from <= y && y <= to) assert.ok(active.has(name), `${country}: "${name}" is not drawn in ${y}`);
      }
    }
  }
});

test("a mapped shape is used in every year it is drawn (no silent gaps), except listed partial ones", () => {
  for (const y of years) {
    const active = activeNames(y);
    for (const [country, entries] of Object.entries(COUNTRY_SHAPES)) {
      for (const name of new Set(entries.map(([n]) => n))) {
        if ((PARTIAL[country] ?? []).includes(name) || !active.has(name)) continue;
        assert.ok(shapeNamesFor(country, y).includes(name), `${country}: "${name}" is drawn in ${y} but not mapped`);
      }
    }
  }
});

test("pre-1920 Ottoman Empire (which spans several present-day countries) is never shaded", () => {
  for (const c of Object.keys(COUNTRY_SHAPES)) {
    for (let y = MIN_YEAR; y < 1920; y++) assert.ok(!shapeNamesFor(c, y).includes("Ottoman Empire"), `${c} ${y}`);
  }
});

test("shapeNamesFor / countryShading: by year, unknown and 'regional' shade nothing", () => {
  assert.deepEqual(shapeNamesFor("Iraq", 1937), ["Kingdom of Iraq"]);
  assert.deepEqual(shapeNamesFor("Iraq", 1915), []);
  assert.deepEqual(shapeNamesFor("Kuwait", 1990), ["Kuwait (annexed by Iraq)"]);
  assert.deepEqual(shapeNamesFor("regional", 2000), []);
  assert.deepEqual(shapeNamesFor("Atlantis", 2000), []);
  assert.deepEqual(shapeNamesFor("toString", 2000), []);
  const s = countryShading(["Israel/Palestine", "Saudi Arabia", "regional"], 1925);
  assert.deepEqual(s.shaded, ["Israel/Palestine"]);
  assert.deepEqual(s.unshaded, ["Saudi Arabia", "regional"]);
  assert.deepEqual([...s.names], ["Mandatory Palestine"]);
  assert.deepEqual(countryShading(undefined, 2000).shaded, []);
});

test("needsCountryShading: only approximate and none", () => {
  assert.equal(needsCountryShading({ location_quality: "approximate" }), true);
  assert.equal(needsCountryShading({ location_quality: "none" }), true);
  assert.equal(needsCountryShading({ location_quality: "precise" }), false);
  assert.equal(needsCountryShading(null), false);
});

test("eventBorderYear: start year, clamped to the timeline", () => {
  assert.equal(eventBorderYear({ date_start: "1937-07-07", date_end: "1937-07-07" }, 1900, 2026), 1937);
  assert.equal(eventBorderYear({ date_start: "1975-04-13", date_end: "1990-10-13" }, 1900, 2026), 1975);
  assert.equal(eventBorderYear({ date_start: "1896-01-01" }, 1900, 2026), 1900);
  assert.equal(eventBorderYear({}, 1900, 2026), null);
  assert.equal(eventBorderYear(null, 1900, 2026), null);
});

test("countryHighlightFeatures: exact name AND active in the year", () => {
  const sq = (x) => ({ type: "Polygon", coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] });
  const f = (name, s, e, x) => ({ type: "Feature", properties: { name, start_year: s, end_year: e }, geometry: sq(x) });
  const feats = [f("Iraq", 1959, 1981, 0), f("Iraq", 1982, 9999, 5), f("Iraq (old)", 1950, 9999, 9), f("Kuwait", 1992, 9999, 20)];
  const out = countryHighlightFeatures({ countries: ["Iraq", "Kuwait"] }, 2003, feats);
  assert.deepEqual(out.features.map((x) => x.geometry.coordinates[0][0][0]), [5, 20]);
  assert.deepEqual(featuresBbox(out), [5, 0, 21, 1]);
  assert.equal(countryHighlightFeatures({ countries: ["regional"] }, 2003, feats).features.length, 0);
  assert.equal(countryHighlightFeatures(null, 2003, feats).features.length, 0);
  assert.equal(featuresBbox({ features: [] }), null);
});

test("countryHighlightFeatures: a placeholder outline shades for the areas it stands for", () => {
  const geometry = { type: "Polygon", coordinates: [[[35, 31], [35.5, 31], [35.5, 32], [35, 31]]] };
  const outline = {
    type: "Feature",
    properties: { name: "West Bank", start_year: 2000, end_year: 9999, placeholder_for: ["West Bank Area A (Palestinian Authority)"] },
    geometry,
  };
  const out = countryHighlightFeatures({ countries: ["Israel/Palestine"] }, 2010, [outline]);
  assert.deepEqual(out.features, [outline]);
  assert.equal(countryHighlightFeatures({ countries: ["Jordan"] }, 2010, [outline]).features.length, 0);
});

test("geometry is passed through untouched (same objects as the loaded borders)", () => {
  const out = countryHighlightFeatures({ countries: ["Egypt"] }, 2000, boundaries);
  assert.equal(out.features.length, 1);
  assert.ok(boundaries.includes(out.features[0]));
});

// Coverage of the events this is for, at each event's own (start) year.
test("coverage report: approximate/none events at their start year", (t) => {
  const target = events.filter((e) => {
    const c = e.coordinates;
    const hasCoords = c && Number.isFinite(c.lon) && Number.isFinite(c.lat);
    const q = !hasCoords ? "none" : e.location_quality === "approximate" || String(e.coordinate_source ?? "").startsWith("country-fallback") ? "approximate" : "precise";
    return q !== "precise";
  });
  let all = 0;
  let some = 0;
  const missing = new Map();
  for (const e of target) {
    const y = eventBorderYear(e, MIN_YEAR, MAX_YEAR);
    const s = countryShading(e.countries, y);
    // Every name the table yields for the event's year must exist in that year's data.
    const active = activeNames(y);
    for (const n of s.names) assert.ok(active.has(n), `${e.id}: ${n} not drawn in ${y}`);
    if (s.shaded.length && !s.unshaded.length) all++;
    else if (s.shaded.length) some++;
    for (const c of s.unshaded) {
      const key = c === "regional" ? "regional" : `${c} (${y < 1920 ? "before 1920" : y})`;
      missing.set(key, (missing.get(key) ?? 0) + 1);
    }
  }
  const none = target.length - all - some;
  t.diagnostic(`${target.length} approximate/none events: ${all} fully shaded, ${some} partly, ${none} not shaded`);
  t.diagnostic(`unshaded country labels: ${[...missing].map(([k, n]) => `${k} x${n}`).join("; ")}`);
  assert.ok(all + some > 0);
});
