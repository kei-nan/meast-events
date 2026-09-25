// Splits the monolithic src/data/{boundaries,events}.json into small per-decade
// chunks under public/data/, so the app can fetch() only the time range it
// currently needs instead of bundling ~2MB of JSON into the JS bundle.
//
// Run via `npm run build` (wired in as a "prebuild" step) or `node scripts/split-data.mjs`
// directly during development. Safe to re-run any time src/data/*.json changes -
// it fully regenerates public/data/.
//
// Keep MIN_YEAR/MAX_YEAR here in sync with src/components/Timeline.jsx - they
// bound which decade chunks are ever requested by the app, so a feature/event
// active only outside this window doesn't need its own chunk.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "..", "src", "data");
const OUT_DIR = path.join(__dirname, "..", "public", "data");

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
  const events = JSON.parse(await readFile(path.join(SRC_DIR, "events.json"), "utf8"));

  function yearRange(e) {
    const start = Number(e.date_start.slice(0, 4));
    const end = e.date_end ? Number(e.date_end.slice(0, 4)) : start;
    return [start, end];
  }

  const byDecade = new Map();
  const countsByYear = {};
  for (const event of events) {
    const [start, end] = yearRange(event);
    countsByYear[start] = (countsByYear[start] ?? 0) + 1;
    for (const decade of decadesFor(start, end)) {
      if (!byDecade.has(decade)) byDecade.set(decade, []);
      byDecade.get(decade).push(event);
    }
  }

  let totalBytes = 0;
  for (const [decade, decadeEvents] of byDecade) {
    const filePath = path.join(OUT_DIR, "events", `${decade}.json`);
    await writeJSON(filePath, decadeEvents);
    totalBytes += JSON.stringify(decadeEvents).length;
  }

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
  });

  console.log(
    `events: ${events.length} events -> ${byDecade.size} decade chunks, ` +
      `${(totalBytes / 1024).toFixed(0)}KB total (source was ${(
        (await readFile(path.join(SRC_DIR, "events.json"))).length / 1024
      ).toFixed(0)}KB)`
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
