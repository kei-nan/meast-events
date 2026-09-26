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
//
// Validation, error semantics, CORS and cache headers intentionally match
// worker/src/ (the Cloudflare Worker port) - keep the two in sync.
//   invalid input -> 400; Redis/upstream failure -> 502 (generic message,
//   detail logged); unknown route -> 404; non-GET/HEAD/OPTIONS -> 405 + Allow.
// Optional env ALLOWED_ORIGIN: comma-separated exact origins; unset = allow all.

import express from "express";
import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

const EVENTS_INDEX = "idx:events";
const BOUNDARIES_INDEX = "idx:boundaries";

const MIN_YEAR = 1000;
const MAX_YEAR = 3000;
const MAX_Q_LENGTH = 100;
const ALLOWED_METHODS = "GET, HEAD, OPTIONS";
const CACHE_OK = "public, max-age=300, stale-while-revalidate=86400";

const client = createClient({ url: REDIS_URL });
client.on("error", (err) => console.error("Redis client error:", err));
await client.connect();
// Log only protocol/host - the raw URL contains the Redis password, and this
// line ends up in hosting platforms' log streams.
console.log(`Connected to Redis at ${new URL(REDIS_URL).protocol}//${new URL(REDIS_URL).host}`);

const app = express();

// --- helpers ---------------------------------------------------------------

// Invalid client input -> HTTP 400 with this (safe to show) message.
class ClientError extends Error {}

// Absent/empty -> undefined; otherwise must be an integer in [MIN_YEAR, MAX_YEAR].
function parseYear(name, value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^-?\d{1,6}$/.test(value)) {
    throw new ClientError(`${name} must be an integer year`);
  }
  const n = Number(value);
  if (n < MIN_YEAR || n > MAX_YEAR) {
    throw new ClientError(`${name} must be between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  return n;
}

// Latitude must be within [-90,90]. Longitude is clamped into [-180,180]
// rather than rejected: MapLibre's getBounds() reports lon beyond +/-180 when
// zoomed out far enough to show repeated world copies, and the frontend sends
// those verbatim. (|lon| > 720 is still rejected as garbage.)
function parseBbox(bbox) {
  if (bbox === undefined || bbox === null || bbox === "") return null;
  if (typeof bbox !== "string") throw new ClientError("bbox must be minLon,minLat,maxLon,maxLat (numbers)");
  const parts = bbox.split(",").map((s) => (s.trim() === "" ? NaN : Number(s)));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new ClientError("bbox must be minLon,minLat,maxLon,maxLat (numbers)");
  }
  let [minLon, minLat, maxLon, maxLat] = parts;
  if (Math.abs(minLon) > 720 || Math.abs(maxLon) > 720) {
    throw new ClientError("bbox longitude must be within [-180,180]");
  }
  if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
    throw new ClientError("bbox latitude must be within [-90,90]");
  }
  if (minLon > maxLon || minLat > maxLat) throw new ClientError("bbox min must not exceed max");
  minLon = Math.max(-180, Math.min(180, minLon));
  maxLon = Math.max(-180, Math.min(180, maxLon));
  return [minLon, minLat, maxLon, maxLat];
}

function parseQ(q) {
  if (q === undefined || q === null) return undefined;
  if (typeof q !== "string") throw new ClientError("q must be a string");
  const t = q.trim();
  if (t.length > MAX_Q_LENGTH) throw new ClientError(`q must be at most ${MAX_Q_LENGTH} characters`);
  return t || undefined;
}

// Escapes RediSearch's query-syntax special characters inside a raw user
// search term so arbitrary input (e.g. "coup d'état", "Anglo-Iraqi War")
// doesn't get misparsed as query syntax (RediSearch treats things like `-`
// as NOT and `'` as a token boundary otherwise).
function escapeRediSearchTerm(text) {
  return text.replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|\\/]/g, "\\$&");
}

// Overlap semantics, matching eventYearRange()/boundariesForYear() in the
// frontend: a feature is "in range" if its start is at/before the queried
// end AND its end is at/after the queried start.
function yearRangeClause(lo, hi) {
  const hiClamp = hi === undefined ? "+inf" : hi;
  const loClamp = lo === undefined ? "-inf" : lo;
  return `@start_year:[-inf ${hiClamp}] @end_year:[${loClamp} +inf]`;
}

// Axis-aligned bounding box via plain NUMERIC range queries. RediSearch's
// GEO field type only supports radius queries, not rectangular bounds - see
// scripts/load-redis.js for why lon/lat are also indexed as separate
// SORTABLE NUMERIC fields specifically to make bbox (viewport) queries possible.
function bboxClause(bounds) {
  if (!bounds) return null;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  return `@lon:[${minLon} ${maxLon}] @lat:[${minLat} ${maxLat}]`;
}

function textClause(q) {
  if (!q) return null;
  const escaped = escapeRediSearchTerm(q);
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

// Origin matching: ALLOWED_ORIGIN unset -> "*"; otherwise reflect the request
// Origin only when it exactly matches an entry, else no ACAO header.
function matchOrigin(allowed, requestOrigin) {
  if (allowed === undefined || String(allowed).trim() === "") return "*";
  if (!requestOrigin) return null;
  const list = String(allowed)
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return list.includes(requestOrigin) ? requestOrigin : null;
}

app.use((req, res, next) => {
  const origin = matchOrigin(ALLOWED_ORIGIN, req.get("Origin"));
  if (origin) res.set("Access-Control-Allow-Origin", origin);
  if (origin !== "*") res.vary("Origin");
  if (req.method === "OPTIONS") {
    res.set({
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    });
    return res.status(204).end();
  }
  next();
});

// Any failure -> [status, generic client body]; detail is logged, never sent.
function sendError(res, err) {
  if (err instanceof ClientError) return res.set("Cache-Control", "no-store").status(400).json({ error: err.message });
  console.error("Upstream Redis failure:", err);
  return res.set("Cache-Control", "no-store").status(502).json({ error: "upstream service unavailable" });
}

// --- routes ------------------------------------------------------------

const ROUTES = new Set(["/api/health", "/api/events", "/api/boundaries"]);
app.use((req, res, next) => {
  if (!ROUTES.has(req.path)) return res.status(404).json({ error: "not found" });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.set({ Allow: ALLOWED_METHODS, "Cache-Control": "no-store" }).status(405).json({ error: "method not allowed" });
  }
  next();
});

app.get("/api/health", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const pong = await client.ping();
    res.json({ ok: true, redis: pong });
  } catch (err) {
    console.error("Upstream Redis failure:", err);
    res.status(503).json({ ok: false, error: "upstream service unavailable" });
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const { start: startRaw, end: endRaw, bbox, q } = req.query;
    const start = parseYear("start", startRaw);
    const end = parseYear("end", endRaw);
    if (start !== undefined && end !== undefined && start > end) {
      throw new ClientError("start must not exceed end");
    }
    const clauses = [yearRangeClause(start, end)];
    const bboxClauseStr = bboxClause(parseBbox(bbox));
    if (bboxClauseStr) clauses.push(bboxClauseStr);
    const textClauseStr = textClause(parseQ(q));
    if (textClauseStr) clauses.push(textClauseStr);

    const result = await client.ft.search(EVENTS_INDEX, clauses.join(" "), {
      LIMIT: { from: 0, size: 1000 },
    });

    res.set("Cache-Control", CACHE_OK).json({
      total: result.total,
      events: result.documents.map(hashToEvent),
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/boundaries", async (req, res) => {
  try {
    const { year: yearRaw, start: startRaw, end: endRaw } = req.query;
    // Primary contract (spec'd): a single `year`, matching boundariesForYear()
    // in MapView.jsx exactly (start_year <= year <= end_year). Also accepts a
    // `start`/`end` range as an additive convenience so the frontend can fetch
    // a whole decade's worth of boundaries in one request and filter to an
    // exact year client-side - the same decade-chunk-then-filter caching
    // pattern the old static-file pipeline used (see dataClient.js) - rather
    // than issuing one request per single-year tick while scrubbing.
    let lo, hi;
    const year = parseYear("year", yearRaw);
    if (year !== undefined) {
      lo = hi = year;
    } else if (startRaw !== undefined && startRaw !== "" && endRaw !== undefined && endRaw !== "") {
      lo = parseYear("start", startRaw);
      hi = parseYear("end", endRaw);
    } else {
      throw new ClientError("year (or start & end) is required");
    }
    if (lo > hi) [lo, hi] = [hi, lo];

    // Union semantics: any boundary active at any point within [lo, hi].
    const query = `@start_year:[-inf ${hi}] @end_year:[${lo} +inf]`;
    // One round trip: `RETURN 1 $` on the ON JSON index returns each whole
    // document as a string under the field "$" (instead of RETURN 0 + JSON.MGET).
    const result = await client.ft.search(BOUNDARIES_INDEX, query, {
      LIMIT: { from: 0, size: 1000 },
      RETURN: ["$"],
    });

    const features = result.documents
      .map((d) => {
        // node-redis (v5) parses a `$` reply and spreads the whole document
        // into d.value; other versions leave it as a string under "$".
        const raw = d.value["$"];
        if (raw === undefined) return d.value;
        let doc = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(doc)) doc = doc[0];
        return doc;
      })
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

    res.set("Cache-Control", CACHE_OK).json({ type: "FeatureCollection", features });
  } catch (err) {
    sendError(res, err);
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
