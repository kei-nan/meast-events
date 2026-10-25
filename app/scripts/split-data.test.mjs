// Tests for split-data.mjs: its pure helpers, and the build-failing guards of the
// CLI run against small fixtures in a temp dir (ATLAS_DATA_DIR in, SPLIT_OUT_DIR
// out, so the real public/data/ and src/lib/dataVersion.js are never touched).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFERRED_GROUPS,
  decadesFor,
  deferredBoundaryGroups,
  detailFields,
  encodeGeoChecked,
  framingFor,
  geometryBbox,
  guidelineVersionUrl,
  locationQuality,
  makeSnippet,
  publicEvent,
} from "./split-data.mjs";
import { MAX_YEAR, MIN_YEAR } from "../src/lib/years.js";
import { decadeFloor } from "../src/lib/eventYears.js";
import { decodeGeo } from "../src/lib/geoCodec.js";

const SCRIPT = fileURLToPath(new URL("./split-data.mjs", import.meta.url));

test("importing split-data.mjs does not run the split", () => {
  // The import above would have thrown or written files if main() ran; it exports helpers only.
  assert.equal(typeof decadesFor, "function");
});

test("decadesFor: every decade a span touches, clamped to the years the app shows", () => {
  assert.deepEqual(decadesFor(1948, 1967), [1940, 1950, 1960]);
  assert.deepEqual(decadesFor(1967, 1948), [1940, 1950, 1960]); // reversed span
  assert.deepEqual(decadesFor(1886, decadeFloor(MIN_YEAR)), [decadeFloor(MIN_YEAR)]);
  assert.equal(decadesFor(1990, 9999).at(-1), decadeFloor(MAX_YEAR));
  // Entirely outside the window: falls back to the nearest edge chunk, never drops the feature.
  assert.deepEqual(decadesFor(1700, 1710), [decadeFloor(MIN_YEAR)]);
});

test("locationQuality: none without real coordinates; explicit value wins; else by coordinate_source", () => {
  assert.equal(locationQuality({ coordinates: null }), "none");
  assert.equal(locationQuality({ coordinates: { lon: 200, lat: 10 } }), "none");
  assert.equal(locationQuality({ coordinates: { lon: "35", lat: 31 } }), "none");
  assert.equal(locationQuality({ coordinates: { lon: 35, lat: NaN } }), "none");
  // An explicit "precise" or "approximate" in the data wins; any other value is ignored.
  assert.equal(locationQuality({ coordinates: { lon: 35, lat: 31 }, location_quality: "approximate" }), "approximate");
  assert.equal(locationQuality({ coordinates: { lon: 35, lat: 31 }, location_quality: "none" }), "precise");
  assert.equal(locationQuality({ coordinates: { lon: 35, lat: 31 }, coordinate_source: "country-fallback:IL" }), "approximate");
  assert.equal(locationQuality({ coordinates: { lon: 35, lat: 31 }, coordinate_source: "wikidata-P625" }), "precise");
  assert.equal(locationQuality({ coordinates: { lon: 35, lat: 31 }, location_quality: "precise", coordinate_source: "country-fallback" }), "precise");
});

test("makeSnippet: at most 160 code points, never splitting a surrogate pair", () => {
  assert.equal(makeSnippet(""), "");
  assert.equal(makeSnippet(undefined), "");
  assert.equal(makeSnippet("short"), "short");
  const astral = "𝔸".repeat(100); // 200 UTF-16 units, 100 code points: kept whole
  assert.equal(makeSnippet(astral), astral);
  const long = "𝔸".repeat(200);
  assert.equal(Array.from(makeSnippet(long)).length, 160);
  assert.ok(!/[\uD800-\uDBFF]$/.test(makeSnippet(long)));
});

test("publicEvent: lite record nulls coordinates without a location and prefers category_group", () => {
  const e = publicEvent({ id: "a", title: "A", date_start: "1956", countries: ["Egypt"], category: "x", category_group: "conflict", coordinates: { lon: 999, lat: 0 }, extract: "text", sitelinks_current: 12, wikipedia_url: "u" });
  assert.equal(e.coordinates, null);
  assert.equal(e.location_quality, "none");
  assert.equal(e.category, "conflict");
  assert.equal(e.snippet, "text");
  assert.equal(e.sitelinks, 12);
  assert.equal("wikipedia_url" in e, false); // detail-only fields stay out of the lite list
  assert.equal(publicEvent({ id: "b", sitelinks_current: "12" }).sitelinks, null);
});

test("publicEvent: Wikidata aliases as-is under `aliases`, absent when the event has none", () => {
  assert.deepEqual(publicEvent({ id: "a", wikidata_aliases: ["July War", "Second Lebanon War"] }).aliases, ["July War", "Second Lebanon War"]);
  assert.equal("aliases" in publicEvent({ id: "b" }), false);
  assert.equal("aliases" in publicEvent({ id: "c", wikidata_aliases: [] }), false);
});

test("publicEvent: a precise pin rounded to one decimal place is published as approximate, coordinates unchanged", () => {
  // As in the data: al-anfal-campaign, Wikidata P625 33, 43.
  const anfal = { id: "al-anfal-campaign", location_quality: "precise", coordinate_source: "wikidata", coordinates: { lat: 33, lon: 43 } };
  const e = publicEvent(anfal);
  assert.equal(e.location_quality, "approximate");
  assert.equal(e.approximate_reason, "rounded");
  assert.deepEqual(e.coordinates, { lat: 33, lon: 43 });
  // Finer coordinates, a capital fallback, no location: no reason added.
  const fine = publicEvent({ ...anfal, coordinates: { lat: 31.36, lon: 34.51 } });
  assert.equal(fine.location_quality, "precise");
  assert.equal("approximate_reason" in fine, false);
  const capital = publicEvent({ ...anfal, location_quality: "approximate", coordinate_source: "country-fallback:Iraq", coordinates: { lat: 33.3152, lon: 44.3661 } });
  assert.equal("approximate_reason" in capital, false);
  assert.equal("approximate_reason" in publicEvent({ id: "n", location_quality: "none", coordinates: null }), false);
});

test("detailFields: the documented data fixes of an event, with their anchors", () => {
  const anchors = new Map([["F7", "f7---october-7-attacks"]]);
  const oct7 = { review_reasons: ["part_of: x", "data_fix F7: October 7 attacks: ... (fields: date_start; see docs/data-fixes.md)"] };
  assert.deepEqual(detailFields(oct7, anchors).data_fixes, [{ ref: "F7", anchor: "f7---october-7-attacks" }]);
  assert.deepEqual(detailFields({ review_reasons: ["data_fix F99: x"] }, anchors).data_fixes, [{ ref: "F99", anchor: null }]);
  assert.equal("data_fixes" in detailFields({ review_reasons: ["part_of: x"] }, anchors), false);
});

test("detailFields: hand_picked on the seed events, those without a discovery sitelinks count", () => {
  assert.equal(detailFields({ id: "six-day-war" }).hand_picked, true);
  assert.equal("hand_picked" in detailFields({ id: "x", sitelinks: 12 }), false);
});

const square = (x, y, d = 0.1) => ({ type: "Polygon", coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
const boundary = (name, start_year, end_year, geometry = square(35, 31)) => ({
  type: "Feature",
  properties: { name, start_year, end_year, status: null, source: `src:${name}`, note: null },
  geometry,
});
// Every boundary DEFERRED_GROUPS names, as the real data has them.
const deferredFixture = () =>
  DEFERRED_GROUPS.flatMap((g) => [...g.members.map((m) => boundary(m, 2000, 9999)), boundary(g.placeholder.geometryFrom, 1967, 1999)]);

test("geometryBbox: [minLon, minLat, maxLon, maxLat] over polygons and multipolygons", () => {
  assert.deepEqual(geometryBbox(square(35, 31, 1)), [35, 31, 36, 32]);
  assert.deepEqual(geometryBbox({ type: "MultiPolygon", coordinates: [square(0, 0, 1).coordinates, square(-5, 10, 1).coordinates] }), [-5, 0, 1, 11]);
});

test("deferredBoundaryGroups: resolves members (zoom, bbox) and one placeholder per group", () => {
  const { members, placeholders } = deferredBoundaryGroups(deferredFixture());
  assert.equal(members.size, DEFERRED_GROUPS.reduce((n, g) => n + g.members.length, 0));
  for (const v of members.values()) {
    assert.equal(v.minzoom, DEFERRED_GROUPS[0].minzoom);
    assert.deepEqual(v.bbox.map((x) => Math.round(x * 10) / 10), [35, 31, 35.1, 31.1]);
  }
  assert.equal(placeholders.length, DEFERRED_GROUPS.length);
  assert.deepEqual(placeholders[0].properties.placeholder_for, DEFERRED_GROUPS[0].members);
  assert.equal(placeholders[0].properties.start_year, 2000);
});

test("deferredBoundaryGroups: fails on a renamed, a missing or a duplicated member", () => {
  const renamed = deferredFixture();
  renamed[0].properties.name += " (renamed)";
  assert.throws(() => deferredBoundaryGroups(renamed), /expected one boundary named ".*", found 0/);
  const noPlaceholderSource = deferredFixture().filter((f) => f.properties.name !== DEFERRED_GROUPS[0].placeholder.geometryFrom);
  assert.throws(() => deferredBoundaryGroups(noPlaceholderSource), /found 0/);
  const dup = deferredFixture();
  dup.push(structuredClone(dup[0]));
  assert.throws(() => deferredBoundaryGroups(dup), /found 2/);
});

test("deferredBoundaryGroups: fails when the members of a group differ in years", () => {
  const f = deferredFixture();
  f[1].properties.end_year = 2010;
  assert.throws(() => deferredBoundaryGroups(f), /must share their years/);
});

test("encodeGeoChecked: bytes that decode to the source; fails, naming the file, on what it cannot store", () => {
  const doc = { type: "FeatureCollection", features: [boundary("A", 2000, 2010, square(35.1234567, 31))] };
  const { bytes, positions, rounded } = encodeGeoChecked("x.tbin", doc);
  assert.equal(positions, 5);
  assert.equal(rounded, 5); // the western x (in three vertices) and the eastern one (in two)
  assert.equal(decodeGeo(bytes).features[0].geometry.coordinates[0][0][0], 35.123457);
  const bad = { type: "FeatureCollection", features: [boundary("B", 2000, 2010, { type: "GeometryCollection", geometries: [] })] };
  assert.throws(() => encodeGeoChecked("y.tbin", bad), /unsupported geometry/);
});

test("guidelineVersionUrl: the permalink of the reviewed revision, keeping the section", () => {
  assert.equal(
    guidelineVersionUrl("https://en.wikipedia.org/wiki/Wikipedia:Neutral_point_of_view#Due_and_undue_weight", 123),
    "https://en.wikipedia.org/w/index.php?title=Wikipedia%3ANeutral_point_of_view&oldid=123#Due_and_undue_weight"
  );
});

test("framingFor: none without a review; stale text marks nothing; an unknown guideline fails", async () => {
  const { createHash } = await import("node:crypto");
  const sha = (t) => createHash("sha1").update(t).digest("hex").slice(0, 12);
  const text = "A was attacked by B.";
  const review = {
    reviewed_on: "2026-09-01",
    guidelines: { words: { name: "Words to watch", shortcut: "WP:WTW", url: "https://en.wikipedia.org/wiki/Wikipedia:Words_to_watch" } },
    events: {
      a: { text_sha1: sha(text), fairness: { note: "n", phrases: ["attacked", "not in text"] }, wording: [{ guideline: "words", phrase: "attacked", note: "w" }] },
      stale: { text_sha1: "000000000000", fairness: { note: "n", phrases: ["attacked"] } },
      bad: { text_sha1: sha(text), wording: [{ guideline: "nope", phrase: "x" }] },
    },
  };
  assert.equal(framingFor(null, { id: "a" }), null);
  assert.equal(framingFor(review, { id: "unreviewed" }), null);
  const ok = framingFor(review, { id: "a", extract: text });
  assert.equal(ok.stale, false);
  assert.deepEqual(ok.fairness.highlights, ["attacked"]);
  assert.equal(ok.wording.findings[0].url, review.guidelines.words.url); // no reviewed_revision: the live page
  const stale = framingFor(review, { id: "stale", extract: text });
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.highlights, []);
  assert.throws(() => framingFor(review, { id: "bad", extract: text }), /unknown guideline nope/);
});

// --- the CLI on fixtures ---------------------------------------------------

const event = (id, extra = {}) => ({
  id,
  title: `Event ${id}`,
  date_start: "1956-10-29",
  date_end: null,
  countries: ["Egypt"],
  category: "conflict",
  extract: `The lead of ${id}.`,
  coordinates: { lon: 32.5, lat: 30 },
  coordinate_source: "wikidata-P625",
  ...extra,
});

function runSplit(events, { boundaries = deferredFixture(), env = {} } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "split-data-test-"));
  const data = path.join(tmp, "data");
  const out = path.join(tmp, "out");
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, "events.json"), JSON.stringify(events));
  fs.writeFileSync(path.join(data, "boundaries.json"), JSON.stringify({ type: "FeatureCollection", features: boundaries }));
  const res = spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, ATLAS_DATA_DIR: data, SPLIT_OUT_DIR: out, MAX_FULL_BYTES: "", MAX_LITE_GZIP_BYTES: "", ...env },
    encoding: "utf8",
  });
  return { ...res, out, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

test("CLI: a valid fixture splits into the versioned folder and meta.json", () => {
  const r = runSplit([event("a"), event("b", { coordinates: null })]);
  try {
    assert.equal(r.status, 0, r.stderr);
    const meta = JSON.parse(fs.readFileSync(path.join(r.out, "events", "meta.json"), "utf8"));
    assert.match(meta.dir, /^v\.[0-9a-f]{12}$/);
    assert.equal(meta.totalEvents, 2);
    assert.equal(meta.withoutLocation, 1);
    const all = JSON.parse(fs.readFileSync(path.join(r.out, "events", meta.dir, "all.json"), "utf8"));
    assert.deepEqual(all.map((e) => e.id), ["a", "b"]);
    // The decade chunks are in one versioned folder that boundaries/meta.json names.
    const bmeta = JSON.parse(fs.readFileSync(path.join(r.out, "boundaries", "meta.json"), "utf8"));
    assert.match(bmeta.version, /^[0-9a-f]{12}$/);
    assert.equal(bmeta.dir, `v.${bmeta.version}`);
    assert.deepEqual(fs.readdirSync(path.join(r.out, "boundaries")).sort(), [bmeta.dir, "meta.json", "shared"].sort());
    assert.deepEqual(fs.readdirSync(path.join(r.out, "boundaries", bmeta.dir)).sort(), bmeta.decades.map((d) => `${d}.tbin`).sort());
    assert.ok(Array.isArray(decodeGeo(fs.readFileSync(path.join(r.out, "land.tbin"))).cells));
    // Geometry is .tbin only; a deferred group's members are one shared file, "<hash>#<index>".
    const files = fs.readdirSync(r.out, { recursive: true }).filter((p) => /^(land|boundaries)/.test(p) && fs.statSync(path.join(r.out, p)).isFile());
    assert.deepEqual(files.filter((p) => !p.endsWith(".tbin")), [path.join("boundaries", "meta.json")]);
    const chunk = decodeGeo(fs.readFileSync(path.join(r.out, "boundaries", bmeta.dir, "2020.tbin")));
    const members = chunk.features.filter((f) => f.geometry_ref);
    assert.equal(members.length, DEFERRED_GROUPS[0].members.length);
    const [hash] = members[0].geometry_ref.split("#");
    assert.deepEqual(members.map((f) => f.geometry_ref), members.map((_, i) => `${hash}#${i}`));
    assert.ok(members.every((f) => f.geometry === null && f.minzoom === DEFERRED_GROUPS[0].minzoom && f.bbox.length === 4));
    const shared = decodeGeo(fs.readFileSync(path.join(r.out, "boundaries", "shared", `${hash}.tbin`)));
    assert.deepEqual(shared.features.map((f) => f.geometry), members.map(() => square(35, 31)));
  } finally {
    r.cleanup();
  }
});

test("CLI: the boundaries folder's version changes when only a shared geometry does", () => {
  const version = (boundaries) => {
    const r = runSplit([event("a")], { boundaries });
    try {
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(fs.readFileSync(path.join(r.out, "boundaries", "meta.json"), "utf8")).version;
    } finally {
      r.cleanup();
    }
  };
  // Same bbox, one more vertex on an edge: only the deferred group's shared file changes.
  const changed = deferredFixture();
  changed[0].geometry = { type: "Polygon", coordinates: [[[35, 31], [35.05, 31], [35.1, 31], [35.1, 31.1], [35, 31.1], [35, 31]]] };
  const before = version(deferredFixture());
  assert.equal(version(deferredFixture()), before);
  assert.notEqual(version(changed), before);
});

test("CLI: fails on an event the map can never show (outside MAP_EXTENT)", () => {
  const r = runSplit([event("a"), event("far-away", { coordinates: { lon: 170, lat: 0 } })]);
  try {
    assert.equal(r.status, 1);
    assert.match(r.stderr, /events outside MAP_EXTENT \(src\/lib\/mapExtent\.js\): far-away/);
  } finally {
    r.cleanup();
  }
});

test("CLI: fails when the gzipped lite list is over its budget", () => {
  const r = runSplit([event("a"), event("b")], { env: { MAX_LITE_GZIP_BYTES: "50" } });
  try {
    assert.equal(r.status, 1);
    assert.match(r.stderr, /all\.json is \d+ bytes gzipped \(budget 50\) for 2 events/);
  } finally {
    r.cleanup();
  }
});

test("CLI: fails when a full-record bucket is over its size limit", () => {
  const r = runSplit([event("a", { extract: "x".repeat(5000) })], { env: { MAX_FULL_BYTES: "1000" } });
  try {
    assert.equal(r.status, 1);
    assert.match(r.stderr, /full\/\d+\.json is \d+ bytes \(limit 1000\); lower EVENTS_PER_BUCKET/);
  } finally {
    r.cleanup();
  }
});

test("CLI: fails when a deferred boundary group no longer matches the data", () => {
  const r = runSplit([event("a")], { boundaries: deferredFixture().slice(1) });
  try {
    assert.equal(r.status, 1);
    assert.match(r.stderr, /DEFERRED_GROUPS: expected one boundary named/);
  } finally {
    r.cleanup();
  }
});
