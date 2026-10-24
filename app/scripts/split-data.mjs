// Splits the monolithic boundaries and the curated events (both in data/ at the
// repo root, the single source of truth) into static files under public/data/,
// so the app fetches only what it needs instead of bundling the JSON.
//
// Run via `npm run build` (wired in as a "prebuild" step) or `node scripts/split-data.mjs`
// directly during development. Safe to re-run any time the inputs change -
// it fully regenerates public/data/ (override the output dir with SPLIT_OUT_DIR).
//
// EVENTS: everything lives in ONE versioned folder, events/v.<version>/, where
// <version> is a hash of every file in it. The app bundles the version
// (src/lib/dataVersion.js), so the folder can be cached immutably and a page can
// never mix files from two builds. events/meta.json (the one mutable file) names
// the current folder, for a page whose bundle is older than the deployed data.
//
//   events/v.<version>/all.json         the whole LITE set (every event,
//       coordinate-less included): only the fields the lists, filters and map
//       need. The app loads it once and does range/viewport/filter/area/
//       title-snippet matching locally. This is the file that grows with the
//       dataset and is on the critical path, so it carries nothing the list does
//       not show (see publicEvent) and its compressed size has a budget
//       (MAX_LITE_GZIP_BYTES, the build fails above it).
//   events/v.<version>/full/<b>.json    everything only the detail view needs
//       (full lead, Wikipedia link, Wikidata classes and QID, date flags, framing
//       review, part of / includes), bucketed by a hash of the id
//       (src/lib/fullBucket.js). The bucket count grows with the dataset
//       (fullBucketCount), so opening an event always fetches one small file.
//
// Events without real numeric coordinates are KEPT (data shape v2.1): they get
// location_quality "none" and coordinates null, and simply never become map
// markers. Every event carries location_quality ("none" | "approximate" iff
// coordinate_source starts with "country-fallback" | "precise"; an explicit
// value in the data wins).
//
// Sizes are bounded: the build fails if any full file exceeds MAX_FULL_BYTES
// (default 1 MB) or the gzipped lite file exceeds MAX_LITE_GZIP_BYTES (default 1 MB).
//
// BOUNDARIES are split per decade (boundaries/<decade>.tbin): the map needs only
// the year shown. MIN_YEAR/MAX_YEAR (src/lib/years.js, shared with the app) bound
// which decade chunks are ever requested.
//
// GEOMETRY files (boundaries and land) are written in the binary topology format of
// src/lib/geoCodec.js (.tbin), not JSON: about half the bytes for the same vertices.
// Every coordinate is rounded to 6 decimal places (~10 cm; a few hundred source
// values carried more), nothing else changes: no vertex is moved, dropped or
// reordered. writeGeo decodes each file it writes and fails the build unless that
// gives back the source document exactly (every key, property and vertex, with
// coordinates compared as doubles).
//
// data/selection-funnel.json (written by the data pipeline) is copied to
// public/data/ for the "About the data" page; missing is a warning, not an error.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { topology } from "topojson-server";
import { fullBucket, fullBucketCount } from "../src/lib/fullBucket.js";
import { countPositions, decodeGeo, encodeGeo, forEachCoordinate, geoMismatch, MAX_SCALE, roundedTo6 } from "../src/lib/geoCodec.js";
import { MAP_EXTENT, NEAR_LAND_EXTENT } from "../src/lib/mapExtent.js";
import { otherArticleTitle } from "../src/lib/otherArticle.js";
import { resolvePartOf } from "../src/lib/partOf.js";
import { resolveRelated } from "../src/lib/related.js";
import { DECADE_SIZE, decadeFloor } from "../src/lib/eventYears.js";
import { MAX_YEAR, MIN_YEAR } from "../src/lib/years.js";
import { isLowPrecisionPin } from "../src/lib/coordPrecision.js";
import { dataFixAnchors, dataFixRefs } from "../src/lib/dataFixes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "..", "src", "data"); // land.json
// ATLAS_DATA_DIR overrides the repo-root data/ (e.g. a scratch copy for tests).
const ROOT_DATA_DIR = process.env.ATLAS_DATA_DIR
  ? path.resolve(process.env.ATLAS_DATA_DIR)
  : path.join(__dirname, "..", "..", "data");
const EVENTS_FILE = path.join(ROOT_DATA_DIR, "events.json"); // repo-root source of truth
// The log of documented corrections, for the anchors of its "## Fn" entries (src/lib/dataFixes.js).
const DATA_FIXES_FILE = path.join(__dirname, "..", "..", "docs", "data-fixes.md");
const BOUNDARIES_FILE = path.join(ROOT_DATA_DIR, "boundaries.json");
const OUT_DIR = process.env.SPLIT_OUT_DIR
  ? path.resolve(process.env.SPLIT_OUT_DIR)
  : path.join(__dirname, "..", "public", "data");
const MAX_FULL_BYTES = Number(process.env.MAX_FULL_BYTES) || 1024 * 1024;
// About 10,000 events at today's ~100 compressed bytes per lite record. Past it the
// next step is to split the lite file (see docs/SCALING.md), not to raise this.
const MAX_LITE_GZIP_BYTES = Number(process.env.MAX_LITE_GZIP_BYTES) || 1024 * 1024;
const SNIPPET_LENGTH = 160;
// Geometries too heavy for a first visit, loaded only once the map is zoomed in
// over them (src/lib/deferredBoundaries.js). OCHA's West Bank Areas A/B/C are
// ~3 MB raw (~1 MB brotli), half of what a first visit to the default 2020s
// view downloaded. Until they load, the map draws `placeholder`: an existing
// source geometry for the same ground (CShapes' West Bank record, as drawn for
// 1967-1999), never a simplified copy of the areas. The Borders list and the
// popup still describe the members, whose properties ship in the chunk.
export const DEFERRED_GROUPS = [
  {
    members: [
      "West Bank Area A (Palestinian Authority)",
      "West Bank Area B (Palestinian civil, joint security)",
      "West Bank Area C (Israeli control)",
    ],
    // Map zoom from which the members load (the West Bank is ~130 px wide at 7).
    minzoom: 7,
    placeholder: {
      geometryFrom: "West Bank (Israeli occupation, phased Oslo transfers)",
      name: "West Bank",
      note:
        "At this zoom the map draws only the West Bank's outline. Zoom in to draw the " +
        "Oslo II Areas A, B and C it is divided into; each is described in this card.",
    },
  },
];

const MIN_DECADE = decadeFloor(MIN_YEAR);
const MAX_DECADE = decadeFloor(MAX_YEAR);

// All decade bucket keys a [startYear, endYear] span touches, clamped to the
// [MIN_DECADE, MAX_DECADE] window the app ever asks for (years outside
// [MIN_YEAR, MAX_YEAR] can't be reached via the timeline, so they don't need
// their own chunk - a feature that starts in 1886 just also lives in the 1900
// chunk, since that's the earliest chunk anyone will ever fetch).
export function decadesFor(startYear, endYear) {
  const s = Math.max(MIN_DECADE, decadeFloor(Math.min(startYear, endYear)));
  const e = Math.min(MAX_DECADE, decadeFloor(Math.min(Math.max(startYear, endYear), MAX_YEAR)));
  const decades = [];
  for (let d = s; d <= e; d += DECADE_SIZE) decades.push(d);
  // Guard against an entirely-out-of-window span (shouldn't happen in this
  // dataset, but fall back to the nearest edge chunk rather than dropping data).
  if (decades.length === 0) decades.push(s <= MIN_DECADE ? MIN_DECADE : MAX_DECADE);
  return decades;
}

export function hasRealCoordinates(event) {
  const c = event.coordinates;
  return (
    !!c &&
    typeof c.lon === "number" && Number.isFinite(c.lon) && Math.abs(c.lon) <= 180 &&
    typeof c.lat === "number" && Number.isFinite(c.lat) && Math.abs(c.lat) <= 90
  );
}

// First 160 characters (code points, never splitting a surrogate pair).
export function makeSnippet(extract) {
  if (!extract) return "";
  return extract.length <= SNIPPET_LENGTH ? extract : Array.from(extract).slice(0, SNIPPET_LENGTH).join("");
}

export function locationQuality(event) {
  if (!hasRealCoordinates(event)) return "none";
  if (event.location_quality === "precise" || event.location_quality === "approximate") return event.location_quality;
  return String(event.coordinate_source || "").startsWith("country-fallback") ? "approximate" : "precise";
}

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

// Only the fields the lists, filters and map need (no full lead). category = our
// coarse grouping (colour/filter; category_group is the pre-v2.1 spelling).
// Fields only the detail view shows (Wikipedia link, Wikidata classes and QID,
// date flags, coordinate source) are in the full record instead (detailFields),
// which the app merges over this one when an event is opened.
//
// A precise pin rounded to at most one decimal place (src/lib/coordPrecision.js,
// e.g. Al-Anfal campaign 33, 43) marks an area, not a site: it is published as
// "approximate" with approximate_reason "rounded", so the site gives it the
// approximate treatment (hollow ring, tag, no drawn-area match, country shading)
// with its own note. The coordinates are the source's, unchanged.
export function publicEvent(e) {
  const quality = locationQuality(e);
  const rounded = isLowPrecisionPin({ ...e, location_quality: quality });
  return {
    id: e.id,
    title: e.title,
    date_start: e.date_start,
    date_end: e.date_end,
    countries: e.countries,
    category: e.category_group || e.category,
    snippet: makeSnippet(e.extract),
    coordinates: quality === "none" ? null : e.coordinates,
    location_quality: rounded ? "approximate" : quality,
    ...(rounded ? { approximate_reason: "rounded" } : {}),
    // Wikidata sitelink count (all projects), for the default "most covered" order.
    sitelinks: Number.isFinite(e.sitelinks_current) ? e.sitelinks_current : null,
  };
}

// wikidata_classes are Wikidata's own labels, shown as-is. `fixAnchors`: Map
// ref -> heading anchor in docs/data-fixes.md (src/lib/dataFixes.js dataFixAnchors).
export function detailFields(e, fixAnchors = new Map()) {
  const fixes = dataFixRefs(e.review_reasons).map((ref) => ({ ref, anchor: fixAnchors.get(ref) ?? null }));
  return {
    // The documented corrections applied to this event (only on those 18 or so events).
    ...(fixes.length ? { data_fixes: fixes } : {}),
    wikipedia_url: e.wikipedia_url,
    wikidata_qid: e.wikidata_qid,
    wikidata_classes: strings(e.wikidata_classes),
    date_flags: strings(e.date_flags),
    // Dates the Wikipedia lead gives, set only next to a date_order_invalid flag.
    wikipedia_lead_dates: strings(e.wikipedia_lead_dates),
    coordinate_source: e.coordinate_source ?? null,
    // Set when the text is the article of another Wikidata item (no article of its own).
    text_from_article: otherArticleTitle(e),
  };
}

async function writeJSON(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data));
}

// Totals over every .tbin written, for the summary line.
const geoTotals = { files: 0, positions: 0, rounded: 0, jsonBytes: 0, bytes: 0 };

// `doc` (a FeatureCollection) as .tbin bytes (src/lib/geoCodec.js), checked: the
// build fails unless decoding them gives back `doc` with its coordinates rounded to
// 6 decimal places, compared exactly (keys, properties, array lengths and every
// number as a double), with the same number of vertices.
export function encodeGeoChecked(name, doc) {
  const bytes = encodeGeo(doc, { topology });
  let back;
  try {
    back = decodeGeo(bytes);
  } catch (err) {
    throw new Error(`${name}: the encoded file does not decode (${err.message})`);
  }
  const diff = geoMismatch(roundedTo6(doc), back);
  if (diff) throw new Error(`${name}: decoding does not give the source back: ${diff}`);
  const positions = countPositions(doc);
  if (countPositions(back) !== positions) throw new Error(`${name}: vertex count changed`);
  let rounded = 0;
  forEachCoordinate(doc, (v) => {
    if (Math.round(v * MAX_SCALE) / MAX_SCALE !== v) rounded++;
  });
  return { bytes, positions, rounded };
}

async function writeGeo(filePath, doc, encoded = encodeGeoChecked(path.relative(OUT_DIR, filePath), doc)) {
  const { bytes, positions, rounded } = encoded;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
  geoTotals.files++;
  geoTotals.positions += positions;
  geoTotals.rounded += rounded;
  geoTotals.jsonBytes += Buffer.byteLength(JSON.stringify(doc));
  geoTotals.bytes += bytes.length;
  return bytes;
}

// DEFERRED_GROUPS resolved against the source: each member feature with its
// zoom threshold and bbox, and one placeholder feature per group. A name that no
// longer matches fails the build, so a renamed area can't silently ship eagerly
// or lose its placeholder.
export function deferredBoundaryGroups(features, groups = DEFERRED_GROUPS) {
  const byName = (name) => {
    const hits = features.filter((f) => f.properties.name === name);
    if (hits.length !== 1) throw new Error(`DEFERRED_GROUPS: expected one boundary named "${name}", found ${hits.length}`);
    return hits[0];
  };
  const members = new Map(); // feature -> {minzoom, bbox, group: index in groups}
  const placeholders = [];
  for (const [index, group] of groups.entries()) {
    const feats = group.members.map(byName);
    const { start_year, end_year } = feats[0].properties;
    if (feats.some((f) => f.properties.start_year !== start_year || f.properties.end_year !== end_year)) {
      throw new Error(`DEFERRED_GROUPS: the members of "${group.placeholder.name}" must share their years`);
    }
    for (const f of feats) members.set(f, { minzoom: group.minzoom, bbox: geometryBbox(f.geometry), group: index });
    const from = byName(group.placeholder.geometryFrom);
    placeholders.push({
      type: "Feature",
      properties: {
        name: group.placeholder.name,
        start_year,
        end_year,
        status: null,
        source: from.properties.source,
        note: group.placeholder.note,
        placeholder_for: group.members,
      },
      geometry: from.geometry,
    });
  }
  return { members, placeholders };
}

async function splitBoundaries() {
  const raw = JSON.parse(await readFile(BOUNDARIES_FILE, "utf8"));
  const byDecade = new Map();
  for (const feature of raw.features) {
    const { start_year, end_year } = feature.properties;
    for (const decade of decadesFor(start_year, end_year)) {
      if (!byDecade.has(decade)) byDecade.set(decade, []);
      byDecade.get(decade).push(feature);
    }
  }

  // The geometries of each deferred group (DEFERRED_GROUPS) are written together,
  // ONCE, to boundaries/shared/<hash of the file>.tbin, and each decade chunk names
  // its member as geometry_ref "<hash>#<index in the file>" instead of carrying it:
  // the map loads them only when zoomed in over them (lib/deferredBoundaries.js
  // waits for every member, so they come in one request), and 2000, 2010 and 2020
  // share the one file. The name hashes the encoded bytes, so a format change is a
  // new name, never a stale immutable copy.
  // Every other geometry is in each decade chunk that shows it. Storing the other
  // multi-decade ones once too (Jordan and Israel 2000-2020, the Ottoman Empire
  // 1900-1910) saved 15 KB over a scrub through all 13 decades (452 vs 467 KB
  // brotli), but cost the opening 2020 view 10 KB (53 vs 43 KB: in the chunk, the
  // edges they share with their neighbours are stored once) and a second request
  // that could only start once the chunk had arrived (October 2026).
  const deferred = deferredBoundaryGroups(raw.features);
  const sharedRefs = new Map(); // feature -> "<hash>#<index>"
  let sharedBytes = 0;
  const groups = new Map(); // group index -> its member features
  for (const [f, { group }] of deferred.members) (groups.get(group) ?? groups.set(group, []).get(group)).push(f);
  for (const feats of groups.values()) {
    const doc = { type: "FeatureCollection", features: feats.map((f) => ({ type: "Feature", properties: {}, geometry: f.geometry })) };
    const encoded = encodeGeoChecked(`the deferred group of ${feats[0].properties.name}`, doc);
    const hash = createHash("sha256").update(encoded.bytes).digest("hex").slice(0, 12);
    await writeGeo(path.join(OUT_DIR, "boundaries", "shared", `${hash}.tbin`), doc, encoded);
    feats.forEach((f, i) => sharedRefs.set(f, `${hash}#${i}`));
    sharedBytes += encoded.bytes.length;
  }

  for (const placeholder of deferred.placeholders) {
    const { start_year, end_year } = placeholder.properties;
    for (const decade of decadesFor(start_year, end_year)) byDecade.get(decade).push(placeholder);
  }

  let totalBytes = 0;
  for (const [decade, features] of byDecade) {
    const fc = {
      type: "FeatureCollection",
      features: features.map((f) => {
        if (!sharedRefs.has(f)) return f;
        // `bbox` is GeoJSON's own member; `minzoom` is ours (src/lib/deferredBoundaries.js).
        const lazy = deferred.members.get(f);
        return { type: "Feature", properties: f.properties, geometry: null, geometry_ref: sharedRefs.get(f), bbox: lazy.bbox, minzoom: lazy.minzoom };
      }),
    };
    totalBytes += (await writeGeo(path.join(OUT_DIR, "boundaries", `${decade}.tbin`), fc)).length;
  }
  totalBytes += sharedBytes;

  await writeJSON(path.join(OUT_DIR, "boundaries", "meta.json"), {
    decadeSize: DECADE_SIZE,
    decades: [...byDecade.keys()].sort((a, b) => a - b),
    minYear: MIN_YEAR,
    maxYear: MAX_YEAR,
  });

  console.log(
    `boundaries: ${raw.features.length} features -> ${byDecade.size} decade chunks + ${groups.size} deferred group file(s) ` +
      `(${sharedRefs.size} geometries), ` +
      `${(totalBytes / 1024).toFixed(0)}KB total (source was ${(
        (await readFile(BOUNDARIES_FILE)).length / 1024
      ).toFixed(0)}KB)`
  );
}

// data/framing-review.json is our own reading of each summary (docs/framing-review.md).
// It rides along with the full lead and is never merged into the Wikipedia fields.
// `stale` is true when the stored lead is no longer the exact text that was reviewed.
async function loadFramingReview() {
  const file = path.join(ROOT_DATA_DIR, "framing-review.json");
  let doc;
  try {
    doc = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  return doc;
}

// Anchors of the "## Fn" entries of docs/data-fixes.md. Missing file: a warning, and the
// event panel links to the log itself (src/lib/dataFixes.js dataFixUrl).
async function loadDataFixAnchors() {
  try {
    return dataFixAnchors(await readFile(DATA_FIXES_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    console.warn(`warning: ${DATA_FIXES_FILE} missing; data-fix notes link to the log without an anchor`);
    return new Map();
  }
}

// The guideline section as it read in the revision the reviews applied (the same link as
// permalink() in scripts/lib/guidelines.js, which records `reviewed_revision`).
export function guidelineVersionUrl(url, revid) {
  const u = new URL(url);
  const title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""));
  return `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&oldid=${revid}${u.hash}`;
}

export function framingFor(review, e) {
  const r = review?.events?.[e.id];
  if (!r) return null;
  const text = e.extract ?? "";
  const sha1 = createHash("sha1").update(text).digest("hex").slice(0, 12);
  const stale = r.text_sha1 !== sha1;
  // Two review types, shown in separate tabs: "fairness" is the reviewer's judgement of
  // emphasis, balance and omissions; "wording" findings each cite a Wikipedia guideline.
  const wording = (r.wording ?? []).map((x) => {
    const g = review.guidelines[x.guideline];
    if (!g) throw new Error(`framing review ${e.id}: unknown guideline ${x.guideline}`);
    const rev = g.reviewed_revision;
    return {
      guideline: x.guideline,
      guideline_name: g.name,
      shortcut: g.shortcut,
      url: rev ? guidelineVersionUrl(g.url, rev.revid) : g.url,
      phrase: x.phrase,
      note: x.note,
    };
  });
  // Phrases are only marked in the exact text that was reviewed.
  const marks = (list) => (stale ? [] : list.filter((p) => text.includes(p)));
  const fairnessMarks = marks(r.fairness?.phrases ?? []);
  const wordingMarks = marks(wording.map((x) => x.phrase));
  return {
    fairness: { found: !!r.fairness, note: r.fairness?.note ?? null, highlights: fairnessMarks },
    wording: { found: wording.length > 0, findings: wording, highlights: wordingMarks },
    highlights: [...fairnessMarks.map((t) => ({ text: t, kind: "fairness" })), ...wordingMarks.map((t) => ({ text: t, kind: "wording" }))],
    category_note: r.category_note ?? null,
    data_note: r.data_note ?? null,
    disclosure: r.disclosure ?? null,
    reviewed_on: review.reviewed_on,
    stale,
  };
}

async function splitEvents() {
  const allEvents = JSON.parse(await readFile(EVENTS_FILE, "utf8"));
  const events = allEvents.map(publicEvent);
  const noLocation = events.filter((e) => e.location_quality === "none").length;
  // The map cannot pan past MAP_EXTENT (MapView maxBounds), so a marker outside
  // it could never be seen: widen the extent instead of shipping that.
  const [minLon, minLat, maxLon, maxLat] = MAP_EXTENT;
  const outside = events.filter(
    (e) => e.coordinates && (e.coordinates.lon < minLon || e.coordinates.lon > maxLon || e.coordinates.lat < minLat || e.coordinates.lat > maxLat)
  );
  if (outside.length) {
    throw new Error(`events outside MAP_EXTENT (src/lib/mapExtent.js): ${outside.map((e) => e.id).join(", ")}`);
  }
  const review = await loadFramingReview();
  const fixAnchors = await loadDataFixAnchors();
  // Wikidata "part of" (P361) and its reverse, only for the detail view (see lib/partOf.js).
  const relations = resolvePartOf(allEvents);
  // Related events (lib/related.js), on the public location (an approximate or
  // missing one never counts as nearby) and the raw date precision and flags.
  const related = resolveRelated(
    allEvents.map((e, i) => ({ ...events[i], wikidata_qid: e.wikidata_qid, part_of: e.part_of, date_precision: e.date_precision, date_flags: e.date_flags })),
    relations
  );

  // Detail records, bucketed by id hash (see header comment).
  const bucketCount = fullBucketCount(allEvents.length);
  const fullBuckets = Array.from({ length: bucketCount }, () => ({}));
  const framingCounts = { guideline: {}, fairness: 0, with_wording: 0, with_findings: 0, stale: 0, missing: 0 };
  for (const e of allEvents) {
    const framing = framingFor(review, e);
    if (review && !framing) framingCounts.missing++;
    if (framing) {
      for (const x of framing.wording.findings) framingCounts.guideline[x.guideline] = (framingCounts.guideline[x.guideline] ?? 0) + 1;
      if (framing.fairness.found) framingCounts.fairness++;
      if (framing.wording.found) framingCounts.with_wording++;
      if (framing.fairness.found || framing.wording.found) framingCounts.with_findings++;
      if (framing.stale) framingCounts.stale++;
    }
    const record = {
      extract: e.extract ?? "",
      extract_retrieved_at: e.extract_retrieved_at ?? null,
      ...detailFields(e, fixAnchors),
      // Wikidata's precision of date_start ("day", "month", "year", "decade").
      date_precision: e.date_precision ?? null,
      framing_review: framing,
    };
    // Only on events that have them, so the buckets stay small.
    const rel = relations.get(e.id);
    if (rel?.part_of.length) record.part_of = rel.part_of;
    if (rel?.includes.length) record.includes = rel.includes;
    if (related.has(e.id)) record.related = related.get(e.id);
    fullBuckets[fullBucket(e.id, bucketCount)][e.id] = record;
  }
  {
    let withParent = 0;
    let curatedParent = 0;
    let parents = 0;
    for (const r of relations.values()) {
      if (r.part_of.length) withParent++;
      if (r.part_of.some((p) => p.id)) curatedParent++;
      if (r.includes.length) parents++;
    }
    console.log(`part of: ${withParent} events name a parent, ${curatedParent} of them a curated event; ${parents} curated parents`);
    const count = (k) => [...related.values()].filter((g) => g[k]).length;
    console.log(
      `related: ${related.size} events list some (${count("shared_parent")} a shared parent, ${count("nearby")} nearby, ${count("same_time")} same time)`
    );
  }
  if (review) {
    await writeJSON(path.join(OUT_DIR, "framing-review.json"), {
      reviewer: review.reviewer,
      reviewed_on: review.reviewed_on,
      updated_on: review.updated_on ?? null,
      rubric_version: review.rubric_version,
      total: allEvents.length,
      guidelines: review.guidelines,
      counts: framingCounts,
    });
    console.log(
      `framing review: ${allEvents.length - framingCounts.missing} of ${allEvents.length} events reviewed, ` +
        `${framingCounts.stale} with text changed since review`
    );
  }
  // Every file of the versioned folder, serialized once: the version is a hash
  // over all of them, so it changes whenever anything a page can load changes.
  const allJson = JSON.stringify(events);
  const fullJson = fullBuckets.map((b) => JSON.stringify(b));
  const hash = createHash("sha256").update(allJson);
  for (const j of fullJson) hash.update("\0").update(j);
  const version = hash.digest("hex").slice(0, 12);
  const dir = `v.${version}`;

  const allBytes = Buffer.byteLength(allJson);
  const allGzip = gzipSync(allJson, { level: 9 }).length;
  if (allGzip > MAX_LITE_GZIP_BYTES) {
    throw new Error(
      `events/${dir}/all.json is ${allGzip} bytes gzipped (budget ${MAX_LITE_GZIP_BYTES}) for ${events.length} events: ` +
        "split the lite file before raising the budget (docs/SCALING.md)"
    );
  }
  await mkdir(path.join(OUT_DIR, "events", dir), { recursive: true });
  await writeFile(path.join(OUT_DIR, "events", dir, "all.json"), allJson);

  let fullTotal = 0;
  let fullMax = 0;
  for (let i = 0; i < bucketCount; i++) {
    const bytes = Buffer.byteLength(fullJson[i]);
    if (bytes > MAX_FULL_BYTES) {
      throw new Error(`events/${dir}/full/${i}.json is ${bytes} bytes (limit ${MAX_FULL_BYTES}); lower EVENTS_PER_BUCKET (src/lib/fullBucket.js)`);
    }
    await mkdir(path.join(OUT_DIR, "events", dir, "full"), { recursive: true });
    await writeFile(path.join(OUT_DIR, "events", dir, "full", `${i}.json`), fullJson[i]);
    fullTotal += bytes;
    fullMax = Math.max(fullMax, bytes);
  }

  if (!process.env.SPLIT_OUT_DIR) {
    await writeFile(
      path.join(__dirname, "..", "src", "lib", "dataVersion.js"),
      "// GENERATED by scripts/split-data.mjs - do not edit. Names the versioned data folder\n" +
        "// events/v.<DATA_VERSION>/ the app loads on start and its number of full-record\n" +
        "// buckets (see lib/dataClient.js and lib/fullBucket.js), and the last year the\n" +
        "// data was split for (vite.config.js hands it to lib/years.js).\n" +
        `export const DATA_VERSION = ${JSON.stringify(version)};\n` +
        `export const FULL_BUCKETS = ${bucketCount};\n` +
        `export const MAX_YEAR = ${MAX_YEAR};\n`
    );
  }

  // The one mutable file: names the current folder, for pages whose bundle is
  // older than the deployed data (dataClient.js falls back to it).
  await writeJSON(path.join(OUT_DIR, "events", "meta.json"), {
    minYear: MIN_YEAR,
    maxYear: MAX_YEAR,
    version,
    dir,
    fullBuckets: bucketCount,
    totalEvents: events.length,
    withoutLocation: noLocation,
    allBytes,
    allGzipBytes: allGzip,
    maxFullBytes: fullMax,
  });

  const rounded = events.filter((e) => e.approximate_reason === "rounded").length;
  const fixed = allEvents.filter((e) => dataFixRefs(e.review_reasons).length).length;
  console.log(`locations: ${rounded} rounded precise pins shown as approximate; data fixes: ${fixed} events note a documented correction`);
  console.log(
    `events/${dir}/all.json: ${events.length} lite records (${noLocation} without coordinates, kept), ` +
      `${(allBytes / 1024).toFixed(0)}KB, ${(allGzip / 1024).toFixed(0)}KB gzipped (${Math.round(allGzip / Math.max(1, events.length))} B/event; ` +
      `budget ${(MAX_LITE_GZIP_BYTES / 1024).toFixed(0)}KB)`
  );
  console.log(
    `events/${dir}/full: ${bucketCount} files, ${(fullTotal / 1024).toFixed(0)}KB total, largest ${(fullMax / 1024).toFixed(0)}KB ` +
      `(source was ${((await readFile(EVENTS_FILE)).length / 1024).toFixed(0)}KB)`
  );
}

// Polygon bbox, [minLon, minLat, maxLon, maxLat].
export function geometryBbox(geometry) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === "number") {
      b[0] = Math.min(b[0], c[0]);
      b[1] = Math.min(b[1], c[1]);
      b[2] = Math.max(b[2], c[0]);
      b[3] = Math.max(b[3], c[1]);
    } else c.forEach(walk);
  };
  walk(geometry.coordinates);
  return b;
}

// The light land (src/data/land.json, built by scripts/build-land.js) covers the whole
// world, but the map never shows land outside MAP_EXTENT. Polygons entirely outside it
// are dropped from the shipped copy; the rest are split, whole, into land.json (touching
// NEAR_LAND_EXTENT, needed by the first view) and land-far.json. land.json also carries
// the list of Middle East cells, whose Natural Earth 1:10m files (src/data/land-cells/)
// are written as they are to data/land-cells/<cell>.tbin (lib/landStore.js). All of
// them are .tbin (writeGeo), as land.tbin and land-far.tbin are; land-far's
// 2-decimal source fits the codec's scale 100 exactly.
async function copyLand() {
  const { features, ...manifest } = JSON.parse(await readFile(path.join(SRC_DIR, "land.json"), "utf8"));
  const cellsOut = path.join(OUT_DIR, "land-cells");
  await rm(cellsOut, { recursive: true, force: true });
  await mkdir(cellsOut, { recursive: true });
  for (const cell of manifest.cells) {
    const fc = JSON.parse(await readFile(path.join(SRC_DIR, "land-cells", `${cell}.json`), "utf8"));
    await writeGeo(path.join(cellsOut, `${cell}.tbin`), fc);
  }
  const touches = (b, [minLon, minLat, maxLon, maxLat]) =>
    b[2] >= minLon && b[0] <= maxLon && b[3] >= minLat && b[1] <= maxLat;
  const near = [];
  const far = [];
  for (const f of features) {
    const b = geometryBbox(f.geometry);
    if (!touches(b, MAP_EXTENT)) continue;
    (touches(b, NEAR_LAND_EXTENT) ? near : far).push(f);
  }
  await writeGeo(path.join(OUT_DIR, "land.tbin"), { ...manifest, features: near });
  await writeGeo(path.join(OUT_DIR, "land-far.tbin"), { type: "FeatureCollection", features: far });
  console.log(
    `land: ${near.length + far.length} of ${features.length} polygons inside MAP_EXTENT: ` +
      `${near.length} in land.tbin, ${far.length} in land-far.tbin; ${manifest.cells.length} 1:10m cells`
  );
}

async function copyFunnel() {
  const src = path.join(ROOT_DATA_DIR, "selection-funnel.json");
  let raw;
  try {
    raw = JSON.parse(await readFile(src, "utf8"));
  } catch (err) {
    console.warn(`selection-funnel.json: not copied (${err.code ?? err.message}); the About page will say the funnel is unavailable`);
    return;
  }
  await writeJSON(path.join(OUT_DIR, "selection-funnel.json"), raw);
  console.log("selection-funnel.json: copied for the About the data page");
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await splitBoundaries();
  await splitEvents();
  await copyLand();
  await copyFunnel();
  const t = geoTotals;
  console.log(
    `geometry: ${t.files} .tbin files, ${t.positions} vertices, each file decoded and identical to its source ` +
      `(${t.rounded} coordinate values rounded to 6 decimals); ${(t.bytes / 1024).toFixed(0)}KB (${(t.jsonBytes / 1024).toFixed(0)}KB as JSON)`
  );
  console.log(`\nWrote chunked data to ${path.relative(process.cwd(), OUT_DIR)}`);
}

// The pure helpers above are exported for scripts/split-data.test.mjs; the split
// itself runs only when this file is the command (node scripts/split-data.mjs).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
