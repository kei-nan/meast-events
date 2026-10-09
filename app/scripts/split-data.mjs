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
// BOUNDARIES are split per decade (boundaries/<decade>.json): the map needs only
// the year shown. MIN_YEAR/MAX_YEAR (src/lib/years.js, shared with the app) bound
// which decade chunks are ever requested.
//
// data/selection-funnel.json (written by the data pipeline) is copied to
// public/data/ for the "About the data" page; missing is a warning, not an error.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { fullBucket, fullBucketCount } from "../src/lib/fullBucket.js";
import { MAP_EXTENT, NEAR_LAND_EXTENT } from "../src/lib/mapExtent.js";
import { resolvePartOf } from "../src/lib/partOf.js";
import { MAX_YEAR, MIN_YEAR } from "../src/lib/years.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "..", "src", "data"); // land.json
// ATLAS_DATA_DIR overrides the repo-root data/ (e.g. a scratch copy for tests).
const ROOT_DATA_DIR = process.env.ATLAS_DATA_DIR
  ? path.resolve(process.env.ATLAS_DATA_DIR)
  : path.join(__dirname, "..", "..", "data");
const EVENTS_FILE = path.join(ROOT_DATA_DIR, "events.json"); // repo-root source of truth
const BOUNDARIES_FILE = path.join(ROOT_DATA_DIR, "boundaries.json");
const OUT_DIR = process.env.SPLIT_OUT_DIR
  ? path.resolve(process.env.SPLIT_OUT_DIR)
  : path.join(__dirname, "..", "public", "data");
const MAX_FULL_BYTES = Number(process.env.MAX_FULL_BYTES) || 1024 * 1024;
// About 10,000 events at today's ~100 compressed bytes per lite record. Past it the
// next step is to split the lite file (see docs/SCALING.md), not to raise this.
const MAX_LITE_GZIP_BYTES = Number(process.env.MAX_LITE_GZIP_BYTES) || 1024 * 1024;
const SNIPPET_LENGTH = 160;
// Multi-decade boundary geometries at least this large are stored once (see splitBoundaries).
const SHARED_GEOMETRY_MIN_BYTES = 32 * 1024;
// Geometries too heavy for a first visit, loaded only once the map is zoomed in
// over them (src/lib/deferredBoundaries.js). OCHA's West Bank Areas A/B/C are
// ~3 MB raw (~1 MB brotli), half of what a first visit to the default 2020s
// view downloaded. Until they load, the map draws `placeholder`: an existing
// source geometry for the same ground (CShapes' West Bank record, as drawn for
// 1967-1999), never a simplified copy of the areas. The Borders list and the
// popup still describe the members, whose properties ship in the chunk.
const DEFERRED_GROUPS = [
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

const DECADE_SIZE = 10;

function decadeFloor(year) {
  return Math.floor(year / DECADE_SIZE) * DECADE_SIZE;
}

const MIN_DECADE = decadeFloor(MIN_YEAR);
const MAX_DECADE = decadeFloor(MAX_YEAR);

// All decade bucket keys a [startYear, endYear] span touches, clamped to the
// [MIN_DECADE, MAX_DECADE] window the app ever asks for (years outside
// [MIN_YEAR, MAX_YEAR] can't be reached via the timeline, so they don't need
// their own chunk - a feature that starts in 1886 just also lives in the 1900
// chunk, since that's the earliest chunk anyone will ever fetch).
function decadesFor(startYear, endYear) {
  const s = Math.max(MIN_DECADE, decadeFloor(Math.min(startYear, endYear)));
  const e = Math.min(MAX_DECADE, decadeFloor(Math.min(Math.max(startYear, endYear), MAX_YEAR)));
  const decades = [];
  for (let d = s; d <= e; d += DECADE_SIZE) decades.push(d);
  // Guard against an entirely-out-of-window span (shouldn't happen in this
  // dataset, but fall back to the nearest edge chunk rather than dropping data).
  if (decades.length === 0) decades.push(s <= MIN_DECADE ? MIN_DECADE : MAX_DECADE);
  return decades;
}

function hasRealCoordinates(event) {
  const c = event.coordinates;
  return (
    !!c &&
    typeof c.lon === "number" && Number.isFinite(c.lon) && Math.abs(c.lon) <= 180 &&
    typeof c.lat === "number" && Number.isFinite(c.lat) && Math.abs(c.lat) <= 90
  );
}

// First 160 characters (code points, never splitting a surrogate pair).
function makeSnippet(extract) {
  if (!extract) return "";
  return extract.length <= SNIPPET_LENGTH ? extract : Array.from(extract).slice(0, SNIPPET_LENGTH).join("");
}

function locationQuality(event) {
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
function publicEvent(e) {
  const quality = locationQuality(e);
  return {
    id: e.id,
    title: e.title,
    date_start: e.date_start,
    date_end: e.date_end,
    countries: e.countries,
    category: e.category_group || e.category,
    snippet: makeSnippet(e.extract),
    coordinates: quality === "none" ? null : e.coordinates,
    location_quality: quality,
    // Wikidata sitelink count (all projects), for the default "most covered" order.
    sitelinks: Number.isFinite(e.sitelinks_current) ? e.sitelinks_current : null,
  };
}

// wikidata_classes are Wikidata's own labels, shown as-is.
function detailFields(e) {
  return {
    wikipedia_url: e.wikipedia_url,
    wikidata_qid: e.wikidata_qid,
    wikidata_classes: strings(e.wikidata_classes),
    date_flags: strings(e.date_flags),
    coordinate_source: e.coordinate_source ?? null,
  };
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeJSON(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data));
}

// DEFERRED_GROUPS resolved against the source: each member feature with its
// zoom threshold and bbox, and one placeholder feature per group. A name that no
// longer matches fails the build, so a renamed area can't silently ship eagerly
// or lose its placeholder.
function deferredBoundaryGroups(features) {
  const byName = (name) => {
    const hits = features.filter((f) => f.properties.name === name);
    if (hits.length !== 1) throw new Error(`DEFERRED_GROUPS: expected one boundary named "${name}", found ${hits.length}`);
    return hits[0];
  };
  const members = new Map(); // feature -> {minzoom, bbox}
  const placeholders = [];
  for (const group of DEFERRED_GROUPS) {
    const feats = group.members.map(byName);
    const { start_year, end_year } = feats[0].properties;
    if (feats.some((f) => f.properties.start_year !== start_year || f.properties.end_year !== end_year)) {
      throw new Error(`DEFERRED_GROUPS: the members of "${group.placeholder.name}" must share their years`);
    }
    for (const f of feats) members.set(f, { minzoom: group.minzoom, bbox: geometryBbox(f.geometry) });
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

  // A large geometry that spans several decades is written ONCE, to
  // boundaries/shared/<content hash>.json, and each decade chunk points to it
  // (geometry_ref) instead of repeating it: the map loads the shown decade and
  // prefetches its neighbours, which would otherwise download the same geometry
  // (e.g. OCHA's West Bank areas, ~2.9 MB, in 2000, 2010 and 2020) up to three
  // times. The geometry is the source's, byte for byte; dataClient.js puts it
  // back before the map sees the feature.
  // Deferred geometries (DEFERRED_GROUPS) are always shared, whatever their span.
  const deferred = deferredBoundaryGroups(raw.features);
  const sharedRefs = new Map(); // feature -> hash
  let sharedBytes = 0;
  for (const feature of raw.features) {
    const { start_year, end_year } = feature.properties;
    const json = JSON.stringify(feature.geometry);
    const large = decadesFor(start_year, end_year).length >= 2 && json.length >= SHARED_GEOMETRY_MIN_BYTES;
    if (!large && !deferred.members.has(feature)) continue;
    const hash = createHash("sha256").update(json).digest("hex").slice(0, 12);
    sharedRefs.set(feature, hash);
    await writeFile(path.join(await ensureDir(path.join(OUT_DIR, "boundaries", "shared")), `${hash}.json`), json);
    sharedBytes += json.length;
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
        const ref = { type: "Feature", properties: f.properties, geometry: null, geometry_ref: sharedRefs.get(f) };
        // `bbox` is GeoJSON's own member; `minzoom` is ours (src/lib/deferredBoundaries.js).
        const lazy = deferred.members.get(f);
        return lazy ? { ...ref, bbox: lazy.bbox, minzoom: lazy.minzoom } : ref;
      }),
    };
    const filePath = path.join(OUT_DIR, "boundaries", `${decade}.json`);
    await writeJSON(filePath, fc);
    totalBytes += JSON.stringify(fc).length;
  }
  totalBytes += sharedBytes;

  await writeJSON(path.join(OUT_DIR, "boundaries", "meta.json"), {
    decadeSize: DECADE_SIZE,
    decades: [...byDecade.keys()].sort((a, b) => a - b),
    minYear: MIN_YEAR,
    maxYear: MAX_YEAR,
  });

  console.log(
    `boundaries: ${raw.features.length} features -> ${byDecade.size} decade chunks + ${sharedRefs.size} shared geometries, ` +
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

function framingFor(review, e) {
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
    return { guideline: x.guideline, guideline_name: g.name, shortcut: g.shortcut, url: g.url, phrase: x.phrase, note: x.note };
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
  // Wikidata "part of" (P361) and its reverse, only for the detail view (see lib/partOf.js).
  const relations = resolvePartOf(allEvents);

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
      ...detailFields(e),
      // Wikidata's precision of date_start ("day", "month", "year", "decade").
      date_precision: e.date_precision ?? null,
      framing_review: framing,
    };
    // Only on events that have them, so the buckets stay small.
    const rel = relations.get(e.id);
    if (rel?.part_of.length) record.part_of = rel.part_of;
    if (rel?.includes.length) record.includes = rel.includes;
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
        "// buckets (see lib/dataClient.js and lib/fullBucket.js).\n" +
        `export const DATA_VERSION = ${JSON.stringify(version)};\n` +
        `export const FULL_BUCKETS = ${bucketCount};\n`
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
function geometryBbox(geometry) {
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

// The source covers the whole world (scripts/ingest-boundaries.js reads it as
// such), but the map never shows land outside MAP_EXTENT. Polygons entirely
// outside it are dropped from the shipped copy; polygons that cross the edge
// are kept whole and unmodified, so every coordinate drawn is the source's own.
// The kept polygons are split, whole, into land.json (touching
// NEAR_LAND_EXTENT, needed by the first view) and land-far.json (the rest).
async function copyLand() {
  const raw = JSON.parse(await readFile(path.join(SRC_DIR, "land.json"), "utf8"));
  const touches = (b, [minLon, minLat, maxLon, maxLat]) =>
    b[2] >= minLon && b[0] <= maxLon && b[3] >= minLat && b[1] <= maxLat;
  const near = [];
  const far = [];
  for (const f of raw.features) {
    const b = geometryBbox(f.geometry);
    if (!touches(b, MAP_EXTENT)) continue;
    (touches(b, NEAR_LAND_EXTENT) ? near : far).push(f);
  }
  await writeJSON(path.join(OUT_DIR, "land.json"), { ...raw, features: near });
  await writeJSON(path.join(OUT_DIR, "land-far.json"), { ...raw, features: far });
  console.log(
    `land: ${near.length + far.length} of ${raw.features.length} polygons inside MAP_EXTENT: ` +
      `${near.length} in land.json, ${far.length} in land-far.json`
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
  console.log(`\nWrote chunked data to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
