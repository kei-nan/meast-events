// Splits the monolithic boundaries (src/data/boundaries.json) and the curated
// events (../data/events.json at the repo root - the single source of truth;
// the app/src/data/events.json copy is no longer read) into small per-decade
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
// Sizes are bounded: the build fails if any events chunk exceeds MAX_CHUNK_BYTES
// (default 1 MB) or any full file exceeds MAX_FULL_BYTES (default 1 MB).
//
// data/selection-funnel.json (written by the data pipeline) is copied to
// public/data/ for the "About the data" page; missing is a warning, not an error.
//
// Keep MIN_YEAR/MAX_YEAR here in sync with src/components/Timeline.jsx - they
// bound which decade chunks are ever requested by the app, so a feature/event
// active only outside this window doesn't need its own chunk.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FULL_BUCKETS, fullBucket } from "../src/lib/fullBucket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "..", "src", "data"); // boundaries.json, land.json
// ATLAS_DATA_DIR overrides the repo-root data/ (e.g. a scratch copy for tests).
const ROOT_DATA_DIR = process.env.ATLAS_DATA_DIR
  ? path.resolve(process.env.ATLAS_DATA_DIR)
  : path.join(__dirname, "..", "..", "data");
const EVENTS_FILE = path.join(ROOT_DATA_DIR, "events.json"); // repo-root source of truth
const OUT_DIR = process.env.SPLIT_OUT_DIR
  ? path.resolve(process.env.SPLIT_OUT_DIR)
  : path.join(__dirname, "..", "public", "data");
const MAX_CHUNK_BYTES = Number(process.env.MAX_CHUNK_BYTES) || 1024 * 1024;
const MAX_FULL_BYTES = Number(process.env.MAX_FULL_BYTES) || 1024 * 1024;
const SNIPPET_LENGTH = 160;

const MIN_YEAR = 1900;
const MAX_YEAR = 2026;
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
  const raw = JSON.parse(await readFile(path.join(SRC_DIR, "boundaries.json"), "utf8"));
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
        (await readFile(path.join(SRC_DIR, "boundaries.json"))).length / 1024
      ).toFixed(0)}KB)`
  );
}

async function splitEvents() {
  const allEvents = JSON.parse(await readFile(EVENTS_FILE, "utf8"));
  const events = allEvents.map(publicEvent);
  const noLocation = events.filter((e) => e.location_quality === "none").length;

  // Full leads, bucketed by id hash (see header comment).
  const fullBuckets = Array.from({ length: FULL_BUCKETS }, () => ({}));
  for (const e of allEvents) {
    fullBuckets[fullBucket(e.id)][e.id] = {
      extract: e.extract ?? "",
      extract_retrieved_at: e.extract_retrieved_at ?? null,
    };
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
  const countsByYear = {};
  const ids = {};
  for (const event of events) {
    const [start, end] = yearRange(event);
    countsByYear[start] = (countsByYear[start] ?? 0) + 1;
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

  // id -> decade chunk, for deep links (?e=<id>) without scanning every chunk.
  await writeJSON(path.join(OUT_DIR, "events", "ids.json"), ids);

  // Tiny, always-loaded index: per-year event counts for the timeline density
  // chart, which needs to show density across the *entire* MIN_YEAR-MAX_YEAR
  // span regardless of which decade chunks happen to be loaded right now.
  await writeJSON(path.join(OUT_DIR, "events", "index.json"), countsByYear);

  await writeJSON(path.join(OUT_DIR, "events", "meta.json"), {
    decadeSize: DECADE_SIZE,
    decades: [...byDecade.keys()].sort((a, b) => a - b),
    minYear: MIN_YEAR,
    maxYear: MAX_YEAR,
    totalEvents: events.length,
    withoutLocation: noLocation,
    fullBuckets: FULL_BUCKETS,
    maxChunkBytes: maxBytes,
    maxFullBytes: fullMax,
  });

  console.log(
    `events: ${events.length} events (${noLocation} without coordinates, kept) -> ${byDecade.size} decade chunks, ` +
      `${(totalBytes / 1024).toFixed(0)}KB total, largest chunk ${(maxBytes / 1024).toFixed(0)}KB; ` +
      `full leads: ${FULL_BUCKETS} files, ${(fullTotal / 1024).toFixed(0)}KB total, largest ${(fullMax / 1024).toFixed(0)}KB; ` +
      `${Object.keys(ids).length} ids (source was ${((await readFile(EVENTS_FILE)).length / 1024).toFixed(0)}KB)`
  );
}

async function copyLand() {
  const raw = JSON.parse(await readFile(path.join(SRC_DIR, "land.json"), "utf8"));
  await writeJSON(path.join(OUT_DIR, "land.json"), raw);
  console.log("land: copied as a single static asset (no time dimension to chunk by)");
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
