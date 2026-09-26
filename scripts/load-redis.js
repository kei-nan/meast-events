// Loads data/events.json and data/boundaries.json into Redis (redis-stack:
// core Redis + RediSearch + RedisJSON) and builds two search indexes.
//
// Run with: node scripts/load-redis.js
// Reads REDIS_URL (defaults to redis://localhost:6379).
//
// Idempotent: FT.DROPINDEX ... DD deletes the index *and* every document
// under its keyspace prefix, so re-running this script always starts from a
// clean slate for both event: and boundary: keys rather than accumulating
// stale/duplicate documents across runs.
//
// --- Schema design ---
//
// Events (HASH, prefix "event:"): the same shape already validated earlier
// this session against the 113-event curated set.
//   title, extract          TEXT   - full-text search (title weighted higher)
//   category                TAG    - exact-match filter (war/treaty/political/...)
//   countries                TAG    - exact-match filter, comma-separated
//   start_year, end_year    NUMERIC SORTABLE - year-range overlap queries
//   lon, lat                NUMERIC SORTABLE - rectangular bbox queries
//                                    (RediSearch's GEO field only supports
//                                    radius queries via GEOFILTER, not
//                                    axis-aligned bounding boxes - see note
//                                    below - so bbox filtering is done with
//                                    plain NUMERIC range queries on lon/lat
//                                    instead)
//   location                 GEO    - kept too, for radius-style queries
//                                    ("within N km of point X"), which is
//                                    exactly what was validated earlier this
//                                    session (250km of Jerusalem). Redundant
//                                    with lon/lat but cheap, and each field
//                                    serves a different query shape.
//   id, date_start, date_end, wikipedia_url, wikidata_qid, coordinate_source
//                            stored but not indexed (retrieval only)
//
// Events with no coordinates (needs_manual_coordinates or missing lat/lon)
// simply omit lon/lat/location - RediSearch just won't match them on a geo
// or bbox filter, which is correct (there's nothing to place on a map).
//
// Boundaries (JSON, prefix "boundary:"): boundaries are polygons/multipolygons,
// not points, and RediSearch's GEO field is point-only (RediSearch does have
// a newer GEOSHAPE field for real polygon WITHIN/CONTAINS queries, but that's
// more machinery than this app needs right now - nothing in the current UI
// does spatial boundary queries, it only filters boundaries by year, exactly
// like the existing boundariesForYear() in MapView.jsx). So:
//   $.name                  TEXT   - full-text search on territory name
//   $.note                  TEXT   - full-text search on historical note
//   $.status                TAG    - exact-match filter (mandate/occupied/...)
//   $.start_year, $.end_year NUMERIC SORTABLE - year-range queries, same
//                                    semantics as boundariesForYear()
// The full GeoJSON geometry (and source/note text) is stored as a RedisJSON
// document rather than forced into search fields, since it's never a search
// *criterion* - it's just payload the client needs back once a boundary has
// matched the year filter. The API does FT.SEARCH for matching ids (cheap,
// indexed), then JSON.GET/JSON.MGET for the full documents (retrieval, not
// search) - simpler and more robust than trying to get RediSearch to return
// a nested JSON path through node-redis's RETURN handling.

import { createClient, SCHEMA_FIELD_TYPE } from "redis";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Never log the raw URL - it contains the Redis password.
function describeRedisTarget(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "<unparseable REDIS_URL>";
  }
}

const EVENTS_INDEX = "idx:events";
const EVENTS_PREFIX = "event:";
const BOUNDARIES_INDEX = "idx:boundaries";
const BOUNDARIES_PREFIX = "boundary:";

function yearRange(dateStart, dateEnd) {
  const start = Number(dateStart.slice(0, 4));
  const end = dateEnd ? Number(dateEnd.slice(0, 4)) : start;
  return [start, end];
}

// Slugify a boundary's name into a stable-ish id. Boundaries.json has no
// explicit id field, and multiple entries can share a name across different
// year ranges (e.g. "Persia" 1886-1934 vs some other span), so the id also
// includes start_year to stay unique.
function boundaryId(feature, index) {
  const slug = (feature.properties.name || "boundary")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug}-${feature.properties.start_year}-${index}`;
}

async function dropIndexIfExists(client, indexName) {
  try {
    await client.ft.dropIndex(indexName, { DD: true });
    console.log(`Dropped existing index ${indexName} (and its documents)`);
  } catch (err) {
    // Older RediSearch says "Unknown index name"; newer versions (e.g. the
    // ones Redis Cloud runs) say "SEARCH_INDEX_NOT_FOUND Index not found".
    if (!/unknown index|index not found|no such index/i.test(err.message)) throw err;
  }
}

async function loadEvents(client) {
  const raw = JSON.parse(await readFile(path.join(DATA_DIR, "events.json"), "utf8"));

  await dropIndexIfExists(client, EVENTS_INDEX);

  await client.ft.create(
    EVENTS_INDEX,
    {
      title: { type: SCHEMA_FIELD_TYPE.TEXT, WEIGHT: 5 },
      extract: { type: SCHEMA_FIELD_TYPE.TEXT },
      category: { type: SCHEMA_FIELD_TYPE.TAG },
      countries: { type: SCHEMA_FIELD_TYPE.TAG, SEPARATOR: "," },
      start_year: { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
      end_year: { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
      lon: { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
      lat: { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
      location: { type: SCHEMA_FIELD_TYPE.GEO },
    },
    { ON: "HASH", PREFIX: EVENTS_PREFIX }
  );
  console.log(`Created index ${EVENTS_INDEX}`);

  let withCoords = 0;
  for (const event of raw) {
    const [startYear, endYear] = yearRange(event.date_start, event.date_end);
    const hash = {
      id: event.id,
      title: event.title,
      extract: event.extract || "",
      category: event.category || "",
      countries: (event.countries || []).join(","),
      start_year: String(startYear),
      end_year: String(endYear),
      date_start: event.date_start || "",
      date_end: event.date_end || "",
      wikipedia_url: event.wikipedia_url || "",
      wikidata_qid: event.wikidata_qid || "",
      coordinate_source: event.coordinate_source || "",
    };
    if (event.coordinates && Number.isFinite(event.coordinates.lon) && Number.isFinite(event.coordinates.lat)) {
      hash.lon = String(event.coordinates.lon);
      hash.lat = String(event.coordinates.lat);
      hash.location = `${event.coordinates.lon},${event.coordinates.lat}`;
      withCoords++;
    }
    await client.hSet(`${EVENTS_PREFIX}${event.id}`, hash);
  }

  console.log(`Loaded ${raw.length} events (${withCoords} with coordinates)`);
}

async function loadBoundaries(client) {
  const raw = JSON.parse(await readFile(path.join(DATA_DIR, "boundaries.json"), "utf8"));

  await dropIndexIfExists(client, BOUNDARIES_INDEX);

  await client.ft.create(
    BOUNDARIES_INDEX,
    {
      "$.name": { type: SCHEMA_FIELD_TYPE.TEXT, AS: "name" },
      "$.note": { type: SCHEMA_FIELD_TYPE.TEXT, AS: "note" },
      "$.status": { type: SCHEMA_FIELD_TYPE.TAG, AS: "status" },
      "$.start_year": { type: SCHEMA_FIELD_TYPE.NUMERIC, AS: "start_year", SORTABLE: true },
      "$.end_year": { type: SCHEMA_FIELD_TYPE.NUMERIC, AS: "end_year", SORTABLE: true },
    },
    { ON: "JSON", PREFIX: BOUNDARIES_PREFIX }
  );
  console.log(`Created index ${BOUNDARIES_INDEX}`);

  let i = 0;
  for (const feature of raw.features) {
    const id = boundaryId(feature, i++);
    const doc = {
      name: feature.properties.name,
      start_year: feature.properties.start_year,
      end_year: feature.properties.end_year,
      status: feature.properties.status,
      source: feature.properties.source || "",
      note: feature.properties.note || "",
      geometry: feature.geometry,
    };
    await client.json.set(`${BOUNDARIES_PREFIX}${id}`, "$", doc);
  }

  console.log(`Loaded ${raw.features.length} boundaries`);
}

async function main() {
  const client = createClient({ url: REDIS_URL });
  client.on("error", (err) => console.error("Redis client error:", err));
  await client.connect();
  console.log(`Connected to ${describeRedisTarget(REDIS_URL)}`);

  try {
    await loadEvents(client);
    await loadBoundaries(client);

    const info = await client.info("memory");
    const usedMemory = info.match(/used_memory_human:(\S+)/)?.[1];
    console.log(`\nDone. Redis used_memory: ${usedMemory ?? "unknown"}`);
  } finally {
    await client.quit();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
