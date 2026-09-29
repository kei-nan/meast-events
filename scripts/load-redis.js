// Loads data/events.json and data/boundaries.json into Redis (redis-stack:
// core Redis + RediSearch + RedisJSON) and builds two search indexes.
//
// Run with: node scripts/load-redis.js
// Reads REDIS_URL (defaults to redis://localhost:6379).
//
// Non-destructive for the live API: each run builds a NEW index under a NEW key
// prefix (idx:events:<stamp> over ev:<stamp>:*, idx:boundaries:<stamp> over
// bd:<stamp>:*), sanity-checks it, then points the alias the API queries
// (idx:events / idx:boundaries) at it with FT.ALIASUPDATE - an atomic switch -
// and only then drops the previous index (DD: together with its documents).
// If the load fails, the half-built index is dropped and the alias is left
// untouched.
// One-time migration: a legacy REAL index called idx:events / idx:boundaries
// (from older versions of this script) occupies the alias name; it is dropped
// (DD) at that moment, a brief gap on the first run only.
//
// --- Schema design ---
//
// Events (HASH, prefix "ev:<stamp>:"):
//   title, extract          TEXT   - full-text search (title weighted higher)
//   category                TAG    - exact-match filter (war/treaty/political/...)
//   countries               TAG    - exact-match filter, comma-separated
//   location_quality        TAG    - "precise" | "approximate" (pin at a capital) |
//                                    "none" (no coordinates); taken from the event
//                                    (data shape v2.1), derived when absent; the
//                                    API's precise=1 filters on it
//   start_year, end_year    NUMERIC SORTABLE - year-range overlap queries
//   lon, lat                NUMERIC SORTABLE - rectangular bbox queries
//                                    (RediSearch's GEO field only supports
//                                    radius queries, so bbox uses plain
//                                    NUMERIC range queries on lon/lat)
//   location                GEO    - kept for radius-style queries
//   id, date_start, date_end, wikipedia_url, wikidata_qid, coordinate_source,
//   extract_retrieved_at, snippet (first 160 chars of extract, for fields=lite),
//   wikidata_classes / date_flags (JSON-array text; the API parses them)
//                            stored but not indexed (retrieval only)
//
// Events WITHOUT real numeric coordinates ARE loaded (location_quality "none"):
// they get NO lon/lat/location fields, so bbox/area queries (NUMERIC ranges on
// lon/lat) can never match them, and precise=1 excludes them. They stay
// searchable by text, category and country.
//
// Boundaries (JSON, prefix "bd:<stamp>:"): polygons, filtered by year only:
//   $.name, $.note          TEXT
//   $.status                TAG
//   $.start_year, $.end_year NUMERIC SORTABLE - same semantics as
//                                    boundariesForYear() in MapView.jsx
// The full GeoJSON geometry stays in the RedisJSON document; the API fetches it
// with FT.SEARCH ... RETURN 1 $.

import { createClient, SCHEMA_FIELD_TYPE } from "redis";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ATLAS_DATA_DIR overrides where events.json / boundaries.json are read from
// (e.g. a scratch copy for local testing).
const DATA_DIR = process.env.ATLAS_DATA_DIR ? path.resolve(process.env.ATLAS_DATA_DIR) : path.join(__dirname, "..", "data");

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

// The API queries these two names as ALIASES (see swapAlias).
const EVENTS_ALIAS = "idx:events";
const BOUNDARIES_ALIAS = "idx:boundaries";
const SNIPPET_LENGTH = 160;
const STAMP = Date.now().toString(36); // names this run's new index + key prefix
const BATCH = 200;

function locationQuality(event) {
  if (!hasRealCoordinates(event)) return "none";
  if (event.location_quality === "precise" || event.location_quality === "approximate") return event.location_quality;
  return String(event.coordinate_source || "").startsWith("country-fallback") ? "approximate" : "precise";
}

const stringList = (v) => JSON.stringify(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

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

function yearRange(dateStart, dateEnd) {
  const start = Number(dateStart.slice(0, 4));
  const end = dateEnd ? Number(dateEnd.slice(0, 4)) : start;
  return [start, end];
}

// Slugify a boundary's name into a stable-ish id. Boundaries.json has no
// explicit id field, and multiple entries can share a name across different
// year ranges, so the id also includes start_year to stay unique.
function boundaryId(feature, index) {
  const slug = (feature.properties.name || "boundary")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug}-${feature.properties.start_year}-${index}`;
}

// Older RediSearch says "Unknown index name"; newer versions (e.g. the ones
// Redis Cloud runs) say "SEARCH_INDEX_NOT_FOUND Index not found".
const isMissingIndex = (err) => /unknown index|index not found|no such index/i.test(err.message);

async function dropIndexIfExists(client, indexName) {
  try {
    await client.ft.dropIndex(indexName, { DD: true });
    console.log(`Dropped index ${indexName} (and its documents)`);
  } catch (err) {
    if (!isMissingIndex(err)) throw err;
  }
}

async function docCount(client, indexName) {
  return (await client.ft.search(indexName, "*", { LIMIT: { from: 0, size: 0 } })).total;
}

// Points `alias` at `newIndex` (atomic), then drops every older versioned
// index of that alias.
async function swapAlias(client, alias, newIndex) {
  try {
    await client.ft.aliasUpdate(alias, newIndex);
  } catch (err) {
    // Only a legacy real index occupying the alias name justifies dropping it. FT._LIST
    // lists real indexes, never aliases, so any other failure (network, memory,
    // timeout) must not delete the index the API is serving.
    if (!(await client.ft._list()).includes(alias)) throw err;
    console.log(`${alias} is a legacy real index (${String(err.message).trim()}); dropping it - one-time brief gap`);
    await dropIndexIfExists(client, alias);
    await client.ft.aliasAdd(alias, newIndex);
  }
  console.log(`Alias ${alias} -> ${newIndex}`);
  const versioned = new RegExp(`^${alias}:[0-9a-z]+$`);
  for (const name of await client.ft._list()) {
    if (name !== newIndex && versioned.test(name)) await dropIndexIfExists(client, name);
  }
}

// Runs build(indexName) into a fresh index; on failure removes the partial one.
async function buildAndSwap(client, alias, build) {
  const index = `${alias}:${STAMP}`;
  try {
    await build(index);
  } catch (err) {
    await dropIndexIfExists(client, index).catch(() => {});
    throw err;
  }
  await swapAlias(client, alias, index);
}

async function inBatches(items, fn) {
  for (let i = 0; i < items.length; i += BATCH) {
    await Promise.all(items.slice(i, i + BATCH).map(fn)); // node-redis pipelines these
  }
}

async function loadEvents(client) {
  const raw = JSON.parse(await readFile(path.join(DATA_DIR, "events.json"), "utf8"));
  const events = raw;
  const prefix = `ev:${STAMP}:`;

  await buildAndSwap(client, EVENTS_ALIAS, async (index) => {
    await client.ft.create(
      index,
      {
        title: { type: SCHEMA_FIELD_TYPE.TEXT, WEIGHT: 5 },
        extract: { type: SCHEMA_FIELD_TYPE.TEXT },
        category: { type: SCHEMA_FIELD_TYPE.TAG },
        countries: { type: SCHEMA_FIELD_TYPE.TAG, SEPARATOR: "," },
        location_quality: { type: SCHEMA_FIELD_TYPE.TAG },
        start_year: { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
        end_year: { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
        lon: { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
        lat: { type: SCHEMA_FIELD_TYPE.NUMERIC, SORTABLE: true },
        location: { type: SCHEMA_FIELD_TYPE.GEO },
      },
      { ON: "HASH", PREFIX: prefix }
    );
    console.log(`Created index ${index} (prefix ${prefix})`);

    await inBatches(events, (event) => {
      const [startYear, endYear] = yearRange(event.date_start, event.date_end);
      const located = hasRealCoordinates(event);
      return client.hSet(`${prefix}${event.id}`, {
        id: event.id,
        title: event.title,
        extract: event.extract || "",
        snippet: makeSnippet(event.extract),
        // category = our coarse group (colour/filter). The Wikidata class labels
        // are wikidata_classes, shown as-is. (category_group: pre-v2.1 data only.)
        category: event.category_group || event.category || "",
        wikidata_classes: stringList(event.wikidata_classes),
        date_flags: stringList(event.date_flags),
        extract_retrieved_at: event.extract_retrieved_at || "",
        countries: (event.countries || []).join(","),
        location_quality: locationQuality(event),
        start_year: String(startYear),
        end_year: String(endYear),
        date_start: event.date_start || "",
        date_end: event.date_end || "",
        wikipedia_url: event.wikipedia_url || "",
        wikidata_qid: event.wikidata_qid || "",
        coordinate_source: event.coordinate_source || "",
        ...(located
          ? {
              lon: String(event.coordinates.lon),
              lat: String(event.coordinates.lat),
              location: `${event.coordinates.lon},${event.coordinates.lat}`,
            }
          : {}),
      });
    });

    const n = await docCount(client, index);
    if (n !== events.length) throw new Error(`index ${index} holds ${n} docs, expected ${events.length}; alias not switched`);
  });

  const q = (k) => events.filter((e) => locationQuality(e) === k).length;
  console.log(
    `Loaded ${events.length} events (${q("precise")} precise, ${q("approximate")} approximate, ` +
      `${q("none")} without coordinates)`
  );
}

async function loadBoundaries(client) {
  const raw = JSON.parse(await readFile(path.join(DATA_DIR, "boundaries.json"), "utf8"));
  const prefix = `bd:${STAMP}:`;

  await buildAndSwap(client, BOUNDARIES_ALIAS, async (index) => {
    await client.ft.create(
      index,
      {
        "$.name": { type: SCHEMA_FIELD_TYPE.TEXT, AS: "name" },
        "$.note": { type: SCHEMA_FIELD_TYPE.TEXT, AS: "note" },
        "$.status": { type: SCHEMA_FIELD_TYPE.TAG, AS: "status" },
        "$.start_year": { type: SCHEMA_FIELD_TYPE.NUMERIC, AS: "start_year", SORTABLE: true },
        "$.end_year": { type: SCHEMA_FIELD_TYPE.NUMERIC, AS: "end_year", SORTABLE: true },
      },
      { ON: "JSON", PREFIX: prefix }
    );
    console.log(`Created index ${index} (prefix ${prefix})`);

    await inBatches(raw.features.map((feature, i) => [feature, i]), ([feature, i]) => {
      const id = boundaryId(feature, i);
      return client.json.set(`${prefix}${id}`, "$", {
        name: feature.properties.name,
        start_year: feature.properties.start_year,
        end_year: feature.properties.end_year,
        status: feature.properties.status,
        source: feature.properties.source || "",
        note: feature.properties.note || "",
        geometry: feature.geometry,
      });
    });

    const n = await docCount(client, index);
    if (n !== raw.features.length) {
      throw new Error(`index ${index} holds ${n} docs, expected ${raw.features.length}; alias not switched`);
    }
  });

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
