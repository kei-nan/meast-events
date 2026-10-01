// HTTP API serving events/boundaries out of Redis (RediSearch + RedisJSON,
// i.e. a redis-stack instance) instead of the statically chunked JSON files
// under app/public/data/. See ../scripts/load-redis.js for the indexing
// scheme this queries against, and ../server/README.md for how to point
// this at a real Redis Cloud instance instead of local Docker.
//
// Endpoints:
//   GET /api/events?start&end&bbox&q&category&country&precise&sort&limit&offset&fields (see docs/design-contract.md)
//   GET /api/boundaries?year=<year>
//   GET /api/health
//
// Validation, error semantics, CORS and cache headers intentionally match
// worker/src/ (the Cloudflare Worker port) - keep the two in sync.
//   invalid input -> 400; Redis/upstream failure -> 502 (generic message,
//   detail logged); unknown route -> 404; non-GET/HEAD/OPTIONS -> 405 + Allow.
// Optional env ALLOWED_ORIGINS: comma-separated exact origins ("*" = any);
// unset = production frontend + localhost dev origins (see SHARED CORS below).
// Express adds weak ETags / answers If-None-Match with 304 by itself.

import express from "express";
import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PORT = process.env.PORT || 3001;
// ALLOWED_ORIGINS (legacy name ALLOWED_ORIGIN also read); blank = built-in defaults.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN;

// idx:events / idx:boundaries are ALIASES that scripts/load-redis.js repoints
// (FT.ALIASUPDATE) at a freshly built index, so reloads never interrupt the API.
const EVENTS_INDEX = "idx:events";
const BOUNDARIES_INDEX = "idx:boundaries";

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";
const CACHE_EVENTS = "public, max-age=300, s-maxage=300, stale-while-revalidate=86400";
const CACHE_BOUNDARIES = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

const client = createClient({ url: REDIS_URL });
client.on("error", (err) => console.error("Redis client error:", err));
await client.connect();
// Log only protocol/host - the raw URL contains the Redis password, and this
// line ends up in hosting platforms' log streams.
console.log(`Connected to Redis at ${new URL(REDIS_URL).protocol}//${new URL(REDIS_URL).host}`);

const app = express();

// --- helpers ---------------------------------------------------------------

// BEGIN SHARED LOGIC
const MIN_YEAR = 1000;
const MAX_YEAR = 3000;
const MAX_Q_LENGTH = 100;
const MAX_LIMIT = 1000;
const MAX_OFFSET = 10000;
const MAX_LIST_ITEMS = 20;
const MAX_LIST_ITEM_LENGTH = 80;
const SNIPPET_LENGTH = 160;
// A full lead is up to ~10 KB: 1000 of them measured 18 ms of CPU (limit on Workers Free: 10 ms),
// 100 measured ~2 ms (worker/test/bench.mjs). fields=full is therefore capped.
const MAX_FULL_LIMIT = 100;

// Invalid client input -> HTTP 400 with this (safe to show) message.
class ClientError extends Error {}

// --- validation -----------------------------------------------------------

// Absent/empty -> undefined; otherwise must be an integer in [MIN_YEAR, MAX_YEAR].
function parseYear(name, value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!/^-?\d{1,6}$/.test(value)) throw new ClientError(`${name} must be an integer year`);
  const n = Number(value);
  if (n < MIN_YEAR || n > MAX_YEAR) {
    throw new ClientError(`${name} must be between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  return n;
}

// "minLon,minLat,maxLon,maxLat". Latitude must be within [-90,90]. Longitude
// is clamped into [-180,180] rather than rejected: MapLibre's getBounds()
// legitimately reports lon beyond +/-180 when the world is zoomed out enough
// to show repeated copies, and the frontend sends those bounds verbatim.
// (Wildly out-of-range values, |lon| > 720, are still rejected as garbage.)
function parseBbox(bbox) {
  if (bbox === undefined || bbox === null || bbox === "") return null;
  const raw = bbox.split(",");
  const parts = raw.map((s) => (s.trim() === "" ? NaN : Number(s)));
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
  if (minLon > maxLon || minLat > maxLat) {
    throw new ClientError("bbox min must not exceed max");
  }
  minLon = Math.max(-180, Math.min(180, minLon));
  maxLon = Math.max(-180, Math.min(180, maxLon));
  return [minLon, minLat, maxLon, maxLat];
}

function parseQ(q) {
  if (q === undefined || q === null) return undefined;
  const t = q.trim();
  if (t.length > MAX_Q_LENGTH) throw new ClientError(`q must be at most ${MAX_Q_LENGTH} characters`);
  return t || undefined;
}

// Absent/empty -> []; otherwise a de-duplicated comma list of non-empty items.
function parseList(name, value) {
  if (value === undefined || value === null) return [];
  const items = [];
  for (const part of value.split(",")) {
    const t = part.replace(/[\x00-\x1f\x7f]/g, "").trim();
    if (!t) continue;
    if (t.length > MAX_LIST_ITEM_LENGTH) {
      throw new ClientError(`${name} items must be at most ${MAX_LIST_ITEM_LENGTH} characters`);
    }
    if (!items.includes(t)) items.push(t);
  }
  if (items.length > MAX_LIST_ITEMS) {
    throw new ClientError(`${name} accepts at most ${MAX_LIST_ITEMS} values`);
  }
  return items;
}

// Absent/empty -> fallback; otherwise an integer in [min, max].
function parseIntParam(name, value, { min, max, fallback }) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!/^\d{1,9}$/.test(value)) throw new ClientError(`${name} must be a non-negative integer`);
  const n = Number(value);
  if (n < min || n > max) throw new ClientError(`${name} must be between ${min} and ${max}`);
  return n;
}

function parseFlag(name, value) {
  if (value === undefined || value === null || value === "" || value === "0") return false;
  if (value === "1") return true;
  throw new ClientError(`${name} must be 1 or 0`);
}

function parseEnum(name, value, allowed) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!allowed.includes(value)) throw new ClientError(`${name} must be one of ${allowed.join(", ")}`);
  return value;
}

// --- query building -------------------------------------------------------

// Escapes RediSearch query-syntax characters in a raw user search term.
function escapeRediSearchTerm(text) {
  return text.replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|\\/]/g, "\\$&");
}

// Escapes a value for use inside a TAG query `@field:{...}`. Inside a TAG
// clause every ASCII punctuation character AND whitespace (`Saudi Arabia`,
// `Israel/Palestine`) is a syntax/separator char and must be backslash
// escaped; letters, digits, `_` and all non-ASCII characters are literal.
// (Different from escapeRediSearchTerm, which is for full-text terms.)
function escapeTagValue(value) {
  return value
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\x20-\x2f\x3a-\x40\x5b-\x5e\x60\x7b-\x7e]/g, "\\$&");
}

function tagClause(field, values) {
  const escaped = values.map(escapeTagValue).filter(Boolean);
  if (!escaped.length) return null;
  return `@${field}:{${escaped.join("|")}}`;
}

// Overlap semantics, matching eventYearRange()/boundariesForYear() in the frontend.
function yearRangeClause(lo, hi) {
  const hiClamp = hi === undefined ? "+inf" : hi;
  const loClamp = lo === undefined ? "-inf" : lo;
  return `@start_year:[-inf ${hiClamp}] @end_year:[${loClamp} +inf]`;
}

// RediSearch GEO fields only do radius queries, so bbox uses the separate
// NUMERIC lon/lat fields (see scripts/load-redis.js).
function bboxClause(bounds) {
  if (!bounds) return null;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  return `@lon:[${minLon} ${maxLon}] @lat:[${minLat} ${maxLat}]`;
}

// Words in the same way the index tokenizer splits them (RediSearch's default
// separators plus whitespace), so `Anglo-Iraqi` searches for the two words the
// index actually holds. Any other ASCII punctuation is escaped to stay literal.
const WORD_SEPARATORS = /[\s,.<>{}[\]"':;!@#$%^&*()\-+=~]+/;
function queryTokens(q) {
  return q
    .split(WORD_SEPARATORS)
    .map((t) =>
      t
        .replace(/[\x00-\x1f\x7f]/g, "")
        .replace(/[\x20-\x2f\x3a-\x40\x5b-\x5e\x60\x7b-\x7e]/g, "\\$&")
    )
    .filter(Boolean);
}

// The last token is prefix-matched (`crisi*`) when it is >= 2 characters, so
// search-as-you-type works. (Escaping happens before the `*` is appended, so
// user input can never inject a wildcard.)
function textClause(q) {
  if (!q) return null;
  const tokens = queryTokens(q);
  if (!tokens.length) return null;
  const last = tokens.length - 1;
  if (tokens[last].replace(/\\/g, "").length >= 2) tokens[last] += "*";
  return `@title|extract:(${tokens.join(" ")})`;
}

// Parses /api/events params. Returns everything both server implementations
// need to run FT.SEARCH. Throws ClientError.
function buildEventsRequest(searchParams) {
  const start = parseYear("start", searchParams.get("start") ?? undefined);
  const end = parseYear("end", searchParams.get("end") ?? undefined);
  if (start !== undefined && end !== undefined && start > end) {
    throw new ClientError("start must not exceed end");
  }
  const q = parseQ(searchParams.get("q") ?? undefined);
  const clauses = [yearRangeClause(start, end)];
  const bb = bboxClause(parseBbox(searchParams.get("bbox") ?? undefined));
  if (bb) clauses.push(bb);
  const cat = tagClause("category", parseList("category", searchParams.get("category") ?? undefined));
  if (cat) clauses.push(cat);
  const cty = tagClause("countries", parseList("country", searchParams.get("country") ?? undefined));
  if (cty) clauses.push(cty);
  if (parseFlag("precise", searchParams.get("precise") ?? undefined)) {
    clauses.push("@location_quality:{precise}");
  }
  const tc = textClause(q);
  if (tc) clauses.push(tc);

  const sort = parseEnum("sort", searchParams.get("sort") ?? undefined, ["date", "relevance"]) ?? (tc ? "relevance" : "date");
  const offset = parseIntParam("offset", searchParams.get("offset") ?? undefined, { min: 0, max: MAX_OFFSET, fallback: 0 });
  // Default is lite: a full lead is up to ~10 KB, so an unqualified query for 1000 events must stay small.
  const fields = parseEnum("fields", searchParams.get("fields") ?? undefined, ["lite", "full"]) ?? "lite";
  const maxLimit = fields === "full" ? MAX_FULL_LIMIT : MAX_LIMIT;
  const limit = parseIntParam("limit", searchParams.get("limit") ?? undefined, { min: 1, max: maxLimit, fallback: maxLimit });
  return {
    query: clauses.join(" "),
    sortBy: sort === "date" ? "start_year" : null,
    limit,
    offset,
    fields,
    returnFields: fields === "lite" ? LITE_FIELDS : null, // null = every stored field
  };
}

// Kept for callers/tests that only need the query string.
function buildEventsQuery(searchParams) {
  return buildEventsRequest(searchParams).query;
}

// --- response shaping -------------------------------------------------------

// Stored hash fields fetched for fields=lite (lon/lat -> coordinates).
const LITE_FIELDS = [
  "id",
  "title",
  "date_start",
  "date_end",
  "countries",
  "category",
  "lon",
  "lat",
  "location_quality",
  "snippet",
];

// First SNIPPET_LENGTH characters (code points, never splitting a surrogate pair).
function makeSnippet(extract) {
  if (!extract) return "";
  return extract.length <= SNIPPET_LENGTH ? extract : Array.from(extract).slice(0, SNIPPET_LENGTH).join("");
}

// Stored JSON-array text -> string[] (never throws; anything malformed -> []).
function parseStringList(s) {
  if (!s) return [];
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function hashToEvent(v, fields = "full") {
  const event = {
    id: v.id,
    title: v.title,
    date_start: v.date_start || null,
    date_end: v.date_end || null,
    countries: v.countries ? v.countries.split(",").filter(Boolean) : [],
    category: v.category || null, // our coarse grouping (colour/filter)
  };
  if (fields === "lite") {
    event.snippet = v.snippet !== undefined ? v.snippet : makeSnippet(v.extract);
  } else {
    event.extract = v.extract || "";
    event.extract_retrieved_at = v.extract_retrieved_at || null;
    event.wikidata_classes = parseStringList(v.wikidata_classes);
    event.date_flags = parseStringList(v.date_flags);
    event.wikipedia_url = v.wikipedia_url || null;
    event.wikidata_qid = v.wikidata_qid || null;
    event.coordinate_source = v.coordinate_source || null;
  }
  event.location_quality = v.location_quality || "precise";
  if (v.lon !== undefined && v.lat !== undefined) {
    event.coordinates = { lon: Number(v.lon), lat: Number(v.lat) };
  } else {
    event.coordinates = null;
  }
  return event;
}

// The /api/events response body. `total` comes from FT.SEARCH.
function eventsResponse(total, documents, req) {
  const events = documents.map((v) => hashToEvent(v, req.fields));
  return { total, truncated: total > req.offset + events.length, events };
}
// END SHARED LOGIC

// BEGIN SHARED CORS
// Browser-only protection: a disallowed Origin just gets no
// Access-Control-Allow-Origin header, so other sites' scripts cannot READ
// responses. It does nothing against curl/bots (they send no Origin, or any
// Origin they like) and does not stop requests from being made or counted
// against the Workers request quota. See docs/SECURITY.md.
//
// Default (env var unset/blank): the production frontend + local dev origins.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://middleeast.events",
  "https://atlas-wiki.middle-wiki.workers.dev",
  "http://localhost:5173", // vite dev
  "http://127.0.0.1:5173",
  "http://localhost:4173", // vite preview
  "http://127.0.0.1:4173",
  "http://localhost:8794", // wrangler dev (static assets)
  "http://127.0.0.1:8794",
];

// allowed: env.ALLOWED_ORIGINS (comma-separated exact origins; "*" = open) or
// unset/blank = DEFAULT_ALLOWED_ORIGINS.
// Returns "*", the origin to reflect, or null (no header).
function matchOrigin(allowed, requestOrigin) {
  const configured = allowed === undefined || allowed === null || String(allowed).trim() === "" ? null : String(allowed);
  const list =
    configured === null
      ? DEFAULT_ALLOWED_ORIGINS
      : configured
          .split(",")
          .map((s) => s.trim().replace(/\/$/, ""))
          .filter(Boolean);
  if (list.includes("*")) return "*";
  if (!requestOrigin) return null;
  return list.includes(requestOrigin) ? requestOrigin : null;
}

function corsHeaders(allowed, requestOrigin) {
  const headers = {};
  const origin = matchOrigin(allowed, requestOrigin);
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  if (origin !== "*") headers["Vary"] = "Origin";
  return headers;
}
// END SHARED CORS

app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "cross-origin" });
  res.set(corsHeaders(ALLOWED_ORIGIN, req.get("Origin")));
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
    const params = new URL(req.originalUrl, "http://localhost").searchParams;
    const request = buildEventsRequest(params);
    const options = { LIMIT: { from: request.offset, size: request.limit } };
    if (request.sortBy) options.SORTBY = { BY: request.sortBy, DIRECTION: "ASC" };
    if (request.returnFields) options.RETURN = request.returnFields;

    const result = await client.ft.search(EVENTS_INDEX, request.query, options);

    res.set("Cache-Control", CACHE_EVENTS).json(
      eventsResponse(
        result.total,
        result.documents.map((d) => d.value),
        request
      )
    );
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

    res.set("Cache-Control", CACHE_BOUNDARIES).json({ type: "FeatureCollection", features });
  } catch (err) {
    sendError(res, err);
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
