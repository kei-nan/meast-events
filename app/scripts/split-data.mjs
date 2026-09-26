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
// Events without real numeric coordinates are dropped (they are never shown),
// every kept event gets a derived location_quality ("approximate" iff
// coordinate_source starts with "country-fallback", else "precise"), and
// events/ids.json maps event id -> the decade chunk that holds it (for deep
// links), using the first decade of the event's span.
//
// Chunk sizes are bounded: the build fails if any single events chunk exceeds
// MAX_CHUNK_BYTES (raise it deliberately, or chunk the time range finer).
//
// Keep MIN_YEAR/MAX_YEAR here in sync with src/components/Timeline.jsx - they
// bound which decade chunks are ever requested by the app, so a feature/event
// active only outside this window doesn't need its own chunk.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "..", "src", "data"); // boundaries.json, land.json
const EVENTS_FILE = path.join(__dirname, "..", "..", "data", "events.json"); // repo-root source of truth
const OUT_DIR = process.env.SPLIT_OUT_DIR
  ? path.resolve(process.env.SPLIT_OUT_DIR)
  : path.join(__dirname, "..", "public", "data");
const MAX_CHUNK_BYTES = Number(process.env.MAX_CHUNK_BYTES) || 2 * 1024 * 1024;

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

function locationQuality(event) {
  return String(event.coordinate_source || "").startsWith("country-fallback") ? "approximate" : "precise";
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
  const events = allEvents.filter(hasRealCoordinates).map((e) => ({ ...e, location_quality: locationQuality(e) }));
  const skipped = allEvents.length - events.length;

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
    maxChunkBytes: maxBytes,
  });

  console.log(
    `events: ${events.length} events (${skipped} without coordinates skipped) -> ${byDecade.size} decade chunks, ` +
      `${(totalBytes / 1024).toFixed(0)}KB total, largest chunk ${(maxBytes / 1024).toFixed(0)}KB, ` +
      `${Object.keys(ids).length} ids (source was ${((await readFile(EVENTS_FILE)).length / 1024).toFixed(0)}KB)`
  );
}

async function copyLand() {
  const raw = JSON.parse(await readFile(path.join(SRC_DIR, "land.json"), "utf8"));
  await writeJSON(path.join(OUT_DIR, "land.json"), raw);
  console.log("land: copied as a single static asset (no time dimension to chunk by)");
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await splitBoundaries();
  await splitEvents();
  await copyLand();
  console.log(`\nWrote chunked data to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
