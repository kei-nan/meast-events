// Splits the monolithic boundaries and the curated events (both in data/ at the
// repo root, the single source of truth) into small per-decade
// chunks under public/data/, so the app can fetch() only the time range it
// currently needs instead of bundling ~2MB of JSON into the JS bundle.
//
// Run via `npm run build` (wired in as a "prebuild" step) or `node scripts/split-data.mjs`
// directly during development. Safe to re-run any time the inputs change -
// it fully regenerates public/data/ (override the output dir with SPLIT_OUT_DIR).
//
// Events without real numeric coordinates are KEPT (data shape v2.1): they get
// location_quality "none" and coordinates null, and simply never become map
// markers. Every event carries location_quality ("none" | "approximate" iff
// coordinate_source starts with "country-fallback" | "precise"; an explicit
// value in the data wins). events/ids.json maps event id -> the decade chunk
// that holds it (for deep links), using the first decade of the event's span.
//
// FULL LEADS ARE NOT IN THE DECADE CHUNKS. A full lead is up to ~10 KB, and the
// lite list must never download them. Decade chunks carry a 160-char snippet
// (no `extract`); the full lead + extract_retrieved_at live in
// events/full/<bucket>.json ({id: {extract, extract_retrieved_at}}), 64 buckets
// chosen by a hash of the id (src/lib/fullBucket.js, shared with the client),
// fetched lazily when an event is opened. Offline text search therefore matches
// title + snippet only.
//
// events/all.<hash>.json is the whole lite set (every event, coordinate-less
// included) in ONE file: the app loads it once and does range/viewport/filter/
// area/title-snippet matching locally, so a default page load makes no API call.
// The file name carries a content hash (also written to events/meta.json as
// `allFile`/`version` and to src/lib/dataVersion.js, which the app bundles), so
// it can be cached immutably and can never be stale: changed data = new name.
// Decade chunks are kept for deep-link resolution (ids.json) and as a fallback.
//
// Sizes are bounded: the build fails if any events chunk exceeds MAX_CHUNK_BYTES
// (default 1 MB) or any full file exceeds MAX_FULL_BYTES (default 1 MB).
//
// data/selection-funnel.json (written by the data pipeline) is copied to
// public/data/ for the "About the data" page; missing is a warning, not an error.
//
// MIN_YEAR/MAX_YEAR (src/lib/years.js, shared with the app) bound which decade
// chunks are ever requested by the app, so a feature/event active only outside
// this window doesn't need its own chunk.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FULL_BUCKETS, fullBucket } from "../src/lib/fullBucket.js";
import { MAP_EXTENT } from "../src/lib/mapExtent.js";
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
const MAX_CHUNK_BYTES = Number(process.env.MAX_CHUNK_BYTES) || 1024 * 1024;
const MAX_FULL_BYTES = Number(process.env.MAX_FULL_BYTES) || 1024 * 1024;
const SNIPPET_LENGTH = 160;

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

// Only the fields the lists and map need (no full lead). category = our coarse
// grouping (colour/filter; category_group is the pre-v2.1 spelling);
// wikidata_classes are Wikidata's own labels, shown as-is.
function publicEvent(e) {
  const quality = locationQuality(e);
  return {
    id: e.id,
    title: e.title,
    date_start: e.date_start,
    date_end: e.date_end,
    countries: e.countries,
    category: e.category_group || e.category,
    wikidata_classes: strings(e.wikidata_classes),
    date_flags: strings(e.date_flags),
    wikidata_qid: e.wikidata_qid,
    wikipedia_url: e.wikipedia_url,
    snippet: makeSnippet(e.extract),
    coordinates: quality === "none" ? null : e.coordinates,
    coordinate_source: e.coordinate_source,
    location_quality: quality,
  };
}

async function writeJSON(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data));
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

  let totalBytes = 0;
  for (const [decade, features] of byDecade) {
    const fc = { type: "FeatureCollection", features };
    const filePath = path.join(OUT_DIR, "boundaries", `${decade}.json`);
    await writeJSON(filePath, fc);
    totalBytes += JSON.stringify(fc).length;
  }

  await writeJSON(path.join(OUT_DIR, "boundaries", "meta.json"), {
    decadeSize: DECADE_SIZE,
    decades: [...byDecade.keys()].sort((a, b) => a - b),
    minYear: MIN_YEAR,
    maxYear: MAX_YEAR,
  });

  console.log(
    `boundaries: ${raw.features.length} features -> ${byDecade.size} decade chunks, ` +
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

  // Full leads, bucketed by id hash (see header comment).
  const fullBuckets = Array.from({ length: FULL_BUCKETS }, () => ({}));
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
    fullBuckets[fullBucket(e.id)][e.id] = {
      extract: e.extract ?? "",
      extract_retrieved_at: e.extract_retrieved_at ?? null,
      // Also here (they are in the chunks too): lite API records lack them, and
      // the detail view merges this file over whichever record it has.
      wikidata_classes: strings(e.wikidata_classes),
      date_flags: strings(e.date_flags),
      framing_review: framing,
    };
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
  let fullTotal = 0;
  let fullMax = 0;
  for (let i = 0; i < FULL_BUCKETS; i++) {
    const bytes = Buffer.byteLength(JSON.stringify(fullBuckets[i]));
    if (bytes > MAX_FULL_BYTES) {
      throw new Error(`events/full/${i}.json is ${bytes} bytes (limit ${MAX_FULL_BYTES}); raise MAX_FULL_BYTES or use more buckets`);
    }
    await writeJSON(path.join(OUT_DIR, "events", "full", `${i}.json`), fullBuckets[i]);
    fullTotal += bytes;
    fullMax = Math.max(fullMax, bytes);
  }

  function yearRange(e) {
    const start = Number(e.date_start.slice(0, 4));
    const end = e.date_end ? Number(e.date_end.slice(0, 4)) : start;
    return [start, end];
  }

  const byDecade = new Map();
  const ids = {};
  for (const event of events) {
    const [start, end] = yearRange(event);
    const decades = decadesFor(start, end);
    ids[event.id] = decades[0];
    for (const decade of decades) {
      if (!byDecade.has(decade)) byDecade.set(decade, []);
      byDecade.get(decade).push(event);
    }
  }

  let totalBytes = 0;
  let maxBytes = 0;
  for (const [decade, decadeEvents] of byDecade) {
    const filePath = path.join(OUT_DIR, "events", `${decade}.json`);
    const bytes = Buffer.byteLength(JSON.stringify(decadeEvents));
    if (bytes > MAX_CHUNK_BYTES) {
      throw new Error(
        `events chunk ${decade}.json is ${bytes} bytes (limit ${MAX_CHUNK_BYTES}); raise MAX_CHUNK_BYTES or chunk finer`
      );
    }
    await writeJSON(filePath, decadeEvents);
    totalBytes += bytes;
    maxBytes = Math.max(maxBytes, bytes);
  }

  // The whole lite set in one immutable, content-hashed file (see header).
  const allJson = JSON.stringify(events);
  const version = createHash("sha256").update(allJson).digest("hex").slice(0, 12);
  const allFile = `all.${version}.json`;
  await mkdir(path.join(OUT_DIR, "events"), { recursive: true });
  await writeFile(path.join(OUT_DIR, "events", allFile), allJson);
  if (!process.env.SPLIT_OUT_DIR) {
    await writeFile(
      path.join(__dirname, "..", "src", "lib", "dataVersion.js"),
      "// GENERATED by scripts/split-data.mjs - do not edit. Names the content-hashed\n" +
        "// events/all.<hash>.json the app loads on start (see lib/dataClient.js loadAllLite).\n" +
        `export const DATA_VERSION = ${JSON.stringify(version)};\n`
    );
  }

  // id -> decade chunk, for deep links (?e=<id>) without scanning every chunk.
  await writeJSON(path.join(OUT_DIR, "events", "ids.json"), ids);

  await writeJSON(path.join(OUT_DIR, "events", "meta.json"), {
    decadeSize: DECADE_SIZE,
    decades: [...byDecade.keys()].sort((a, b) => a - b),
    minYear: MIN_YEAR,
    maxYear: MAX_YEAR,
    version,
    allFile,
    allBytes: Buffer.byteLength(allJson),
    totalEvents: events.length,
    withoutLocation: noLocation,
    fullBuckets: FULL_BUCKETS,
    maxChunkBytes: maxBytes,
    maxFullBytes: fullMax,
  });

  console.log(`events/${allFile}: ${(Buffer.byteLength(allJson) / 1024).toFixed(0)}KB (all ${events.length} lite records)`);
  console.log(
    `events: ${events.length} events (${noLocation} without coordinates, kept) -> ${byDecade.size} decade chunks, ` +
      `${(totalBytes / 1024).toFixed(0)}KB total, largest chunk ${(maxBytes / 1024).toFixed(0)}KB; ` +
      `full leads: ${FULL_BUCKETS} files, ${(fullTotal / 1024).toFixed(0)}KB total, largest ${(fullMax / 1024).toFixed(0)}KB; ` +
      `${Object.keys(ids).length} ids (source was ${((await readFile(EVENTS_FILE)).length / 1024).toFixed(0)}KB)`
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
async function copyLand() {
  const raw = JSON.parse(await readFile(path.join(SRC_DIR, "land.json"), "utf8"));
  const [minLon, minLat, maxLon, maxLat] = MAP_EXTENT;
  const features = raw.features.filter((f) => {
    const b = geometryBbox(f.geometry);
    return b[2] >= minLon && b[0] <= maxLon && b[3] >= minLat && b[1] <= maxLat;
  });
  await writeJSON(path.join(OUT_DIR, "land.json"), { ...raw, features });
  console.log(`land: ${features.length} of ${raw.features.length} polygons inside MAP_EXTENT, copied as one static asset`);
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
