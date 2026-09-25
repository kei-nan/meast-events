// HTTP API serving events/boundaries out of Redis (RediSearch + RedisJSON,
// i.e. a redis-stack instance) instead of the statically chunked JSON files
// under app/public/data/. See ../scripts/load-redis.js for the indexing
// scheme this queries against, and ../server/README.md for how to point
// this at a real Redis Cloud instance instead of local Docker.
//
// Endpoints:
//   GET /api/events?start=<year>&end=<year>&bbox=<minLon,minLat,maxLon,maxLat>&q=<text>
//   GET /api/boundaries?year=<year>
//   GET /api/health

import express from "express";
import cors from "cors";
import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PORT = process.env.PORT || 3001;

const EVENTS_INDEX = "idx:events";
const BOUNDARIES_INDEX = "idx:boundaries";

const client = createClient({ url: REDIS_URL });
client.on("error", (err) => console.error("Redis client error:", err));
await client.connect();
console.log(`Connected to Redis at ${REDIS_URL}`);

const app = express();
app.use(cors());

// --- helpers ---------------------------------------------------------------

// Escapes RediSearch's query-syntax special characters inside a raw user
// search term so arbitrary input (e.g. "coup d'état", "Anglo-Iraqi War")
// doesn't get misparsed as query syntax (RediSearch treats things like `-`
// as NOT and `'` as a token boundary otherwise).
function escapeRediSearchTerm(text) {
  return text.replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|\\/]/g, "\\$&");
}

function yearRangeClause(start, end) {
  const lo = start !== undefined && start !== "" ? Number(start) : null;
  const hi = end !== undefined && end !== "" ? Number(end) : null;
  const hiClamp = Number.isFinite(hi) ? hi : "+inf";
  const loClamp = Number.isFinite(lo) ? lo : "-inf";
  // Overlap semantics, matching eventYearRange()/boundariesForYear() in the
  // frontend: a feature is "in range" if its start is at/before the queried
  // end AND its end is at/after the queried start.
  return `@start_year:[-inf ${hiClamp}] @end_year:[${loClamp} +inf]`;
}

function bboxClause(bbox) {
  if (!bbox) return null;
  const parts = bbox.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error("bbox must be minLon,minLat,maxLon,maxLat");
  }
  const [minLon, minLat, maxLon, maxLat] = parts;
  // Axis-aligned bounding box via plain NUMERIC range queries. RediSearch's
  // GEO field type only supports radius queries (GEOFILTER lon lat radius
  // unit), not rectangular bounds - see scripts/load-redis.js for why lon/lat
  // are also indexed as separate SORTABLE NUMERIC fields specifically to make
  // real bbox (viewport) queries possible.
  return `@lon:[${minLon} ${maxLon}] @lat:[${minLat} ${maxLat}]`;
}

function textClause(q) {
  if (!q) return null;
  const escaped = escapeRediSearchTerm(q.trim());
  if (!escaped) return null;
  return `@title|extract:(${escaped})`;
}

function hashToEvent(doc) {
  const v = doc.value;
  const event = {
    id: v.id,
    title: v.title,
    date_start: v.date_start || null,
    date_end: v.date_end || null,
    countries: v.countries ? v.countries.split(",").filter(Boolean) : [],
    category: v.category || null,
    extract: v.extract || "",
    wikipedia_url: v.wikipedia_url || null,
    wikidata_qid: v.wikidata_qid || null,
    coordinate_source: v.coordinate_source || null,
  };
  if (v.lon !== undefined && v.lat !== undefined) {
    event.coordinates = { lon: Number(v.lon), lat: Number(v.lat) };
  } else {
    event.coordinates = null;
  }
  return event;
}

// --- routes ------------------------------------------------------------

app.get("/api/health", async (_req, res) => {
  try {
    const pong = await client.ping();
    res.json({ ok: true, redis: pong });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const { start, end, bbox, q } = req.query;
    const clauses = [yearRangeClause(start, end)];
    const bboxClauseStr = bboxClause(bbox);
    if (bboxClauseStr) clauses.push(bboxClauseStr);
    const textClauseStr = textClause(q);
    if (textClauseStr) clauses.push(textClauseStr);

    const query = clauses.join(" ");
    const result = await client.ft.search(EVENTS_INDEX, query, {
      LIMIT: { from: 0, size: 1000 },
    });

    res.json({
      total: result.total,
      events: result.documents.map(hashToEvent),
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/boundaries", async (req, res) => {
  try {
    const { year, start, end } = req.query;
    // Primary contract (spec'd): a single `year`, matching boundariesForYear()
    // in MapView.jsx exactly (start_year <= year <= end_year). Also accepts a
    // `start`/`end` range as an additive convenience so the frontend can fetch
    // a whole decade's worth of boundaries in one request and filter to an
    // exact year client-side - the same decade-chunk-then-filter caching
    // pattern the old static-file pipeline used (see dataClient.js) - rather
    // than issuing one request per single-year tick while scrubbing.
    let lo, hi;
    if (year !== undefined && year !== "") {
      lo = hi = Number(year);
    } else if (start !== undefined && end !== undefined) {
      lo = Number(start);
      hi = Number(end);
    } else {
      return res.status(400).json({ error: "year (or start & end) is required" });
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      return res.status(400).json({ error: "year/start/end must be numeric" });
    }
    if (lo > hi) [lo, hi] = [hi, lo];

    // Union semantics: any boundary active at any point within [lo, hi].
    const query = `@start_year:[-inf ${hi}] @end_year:[${lo} +inf]`;
    const result = await client.ft.search(BOUNDARIES_INDEX, query, {
      LIMIT: { from: 0, size: 1000 },
      RETURN: [],
    });

    if (result.total === 0) {
      return res.json({ type: "FeatureCollection", features: [] });
    }

    const ids = result.documents.map((d) => d.id);
    const docs = await client.json.mGet(ids, "$");
    const features = docs
      .map((d) => (Array.isArray(d) ? d[0] : d))
      .filter(Boolean)
      .map((d) => ({
        type: "Feature",
        properties: {
          name: d.name,
          start_year: d.start_year,
          end_year: d.end_year,
          status: d.status,
          source: d.source,
          note: d.note,
        },
        geometry: d.geometry,
      }));

    res.json({ type: "FeatureCollection", features });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
