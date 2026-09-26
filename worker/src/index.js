// Cloudflare Worker port of ../../server/index.js - same API contract, same
// RediSearch query-building/escaping/response-shaping logic (copied over
// verbatim from the Express version, not rewritten), just running on
// Workers' fetch-handler model instead of a persistent Express process, and
// talking to Redis over cloudflare:sockets via a small hand-rolled RESP2
// client (./resp.js) instead of the `redis` npm client (which needs real
// Node net sockets, unavailable here).
//
// Endpoints (identical to server/index.js):
//   GET /api/events?start=<year>&end=<year>&bbox=<minLon,minLat,maxLon,maxLat>&q=<text>
//   GET /api/boundaries?year=<year>  (also start/end range, see server/index.js)
//   GET /api/health
//
// See README.md in this directory for what was verified locally, and
// ./resp.js's top comment for why this hand-rolls RESP2 instead of using the
// existing `redis-on-workers` package (github.com/kane50613/redis-on-workers) -
// short version: that package's generic send()/sendRaw() commands *would*
// carry FT.SEARCH/JSON.MGET (no command allowlist), but its decoder hangs on
// any bulk string containing multi-byte UTF-8, which this dataset's text is
// full of.

import { RedisConnection } from "./resp.js";

const EVENTS_INDEX = "idx:events";
const BOUNDARIES_INDEX = "idx:boundaries";

// --- helpers copied unchanged from server/index.js --------------------------
// (query-building/escaping logic is data-shape logic, not transport logic -
// nothing here needed to change for the Workers port.)

function escapeRediSearchTerm(text) {
  return text.replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|\\/]/g, "\\$&");
}

function yearRangeClause(start, end) {
  const lo = start !== undefined && start !== "" ? Number(start) : null;
  const hi = end !== undefined && end !== "" ? Number(end) : null;
  const hiClamp = Number.isFinite(hi) ? hi : "+inf";
  const loClamp = Number.isFinite(lo) ? lo : "-inf";
  return `@start_year:[-inf ${hiClamp}] @end_year:[${loClamp} +inf]`;
}

function bboxClause(bbox) {
  if (!bbox) return null;
  const parts = bbox.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error("bbox must be minLon,minLat,maxLon,maxLat");
  }
  const [minLon, minLat, maxLon, maxLat] = parts;
  return `@lon:[${minLon} ${maxLon}] @lat:[${minLat} ${maxLat}]`;
}

function textClause(q) {
  if (!q) return null;
  const escaped = escapeRediSearchTerm(q.trim());
  if (!escaped) return null;
  return `@title|extract:(${escaped})`;
}

function hashToEvent(v) {
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

// --- RESP reply shaping ------------------------------------------------
//
// ./resp.js's RedisConnection.send() is a *generic* RESP2 command sender
// (no ft.search()/json.mGet() convenience methods the way node-redis has),
// so FT.SEARCH/JSON.MGET replies come back as plain decoded RESP2 values
// (numbers, strings, nested arrays, null), and we do the same reply-shape
// parsing node-redis's client would normally do internally.
//
// FT.SEARCH with default (no RETURN) reply shape, confirmed against a real
// redis-stack instance with `redis-cli --no-raw`:
//   [ total, key1, [field1, value1, field2, value2, ...], key2, [...], ... ]
// FT.SEARCH with `RETURN 0` (no fields) reply shape:
//   [ total, key1, key2, ... ]   (no nested per-doc arrays at all)
function parseFtSearchWithFields(reply) {
  const total = reply[0];
  const documents = [];
  for (let i = 1; i < reply.length; i += 2) {
    const id = reply[i];
    const fields = reply[i + 1] || [];
    const value = {};
    for (let j = 0; j < fields.length; j += 2) {
      value[fields[j]] = fields[j + 1];
    }
    documents.push({ id, value });
  }
  return { total, documents };
}

function parseFtSearchIdsOnly(reply) {
  const total = reply[0];
  const ids = reply.slice(1);
  return { total, ids };
}

// --- Redis connection ---------------------------------------------------
//
// A fresh connection is opened per incoming HTTP request rather than reused
// from a module-scope singleton across requests - tried the singleton
// approach first (mirroring server/index.js's one-long-lived-client model)
// and it broke under concurrent load in exactly the way Cloudflare's docs
// warn about: Workers ties I/O objects (sockets, streams, the promises they
// produce) to the request context ("I/O context") they were created in, and
// tears that context down when its originating request finishes. A second,
// unrelated request that later tries to read from a socket opened during a
// *different* request gets a hard failure once the first request completes -
// confirmed locally as `TypeError: This ReadableStream belongs to an object
// that is closing` plus `Warning: A promise was resolved or rejected from a
// different request context than the one it was created in`, both firing
// under the frontend's real concurrent decade-prefetch traffic pattern (many
// /api/events and /api/boundaries requests in flight at once). This is a
// documented Workers isolation model, not a wrangler/miniflare bug - see
// developers.cloudflare.com/workers/runtime-apis/fetch/#background and the
// "I/O objects... cannot be used outside of the request in which they were
// created" behavior on the Request/Response/streams docs. One connection
// per request sidesteps it entirely at the cost of a fresh TCP (and, for a
// non-local/TLS Redis, TLS) handshake per request - a real latency tradeoff
// against server/index.js's persistent connection, worth knowing about but
// not a correctness problem; a production version wanting a pooled
// connection across requests would need a Durable Object to own the socket
// and serialize access to it, which is out of scope for this port.
async function withRedis(env, fn) {
  const redis = new RedisConnection(env.REDIS_URL || "redis://localhost:6379");
  try {
    return await fn(redis);
  } finally {
    redis.close();
  }
}

// --- CORS -----------------------------------------------------------------
// Express's `cors()` middleware defaults to allow-all-origins with a
// reflected set of methods/headers. Replicated by hand here since Workers
// has no middleware layer - just headers added to every Response.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...(init.headers || {}),
    },
  });
}

// --- routes ------------------------------------------------------------
// Same three endpoints/response shapes as server/index.js, ported from
// Express `app.get(path, handler)` to `if (pathname === path)` dispatch.

async function handleHealth(env) {
  try {
    const pong = await withRedis(env, (redis) => redis.send("PING"));
    return json({ ok: true, redis: pong });
  } catch (err) {
    return json({ ok: false, error: err.message }, { status: 503 });
  }
}

async function handleEvents(env, searchParams) {
  try {
    const start = searchParams.get("start") ?? undefined;
    const end = searchParams.get("end") ?? undefined;
    const bbox = searchParams.get("bbox") ?? undefined;
    const q = searchParams.get("q") ?? undefined;

    const clauses = [yearRangeClause(start, end)];
    const bboxClauseStr = bboxClause(bbox);
    if (bboxClauseStr) clauses.push(bboxClauseStr);
    const textClauseStr = textClause(q);
    if (textClauseStr) clauses.push(textClauseStr);

    const query = clauses.join(" ");
    const reply = await withRedis(env, (redis) =>
      redis.send("FT.SEARCH", EVENTS_INDEX, query, "LIMIT", "0", "1000")
    );
    const result = parseFtSearchWithFields(reply);

    return json({
      total: result.total,
      events: result.documents.map((d) => hashToEvent(d.value)),
    });
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, { status: 400 });
  }
}

async function handleBoundaries(env, searchParams) {
  try {
    const yearParam = searchParams.get("year");
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");

    let lo, hi;
    if (yearParam !== null && yearParam !== "") {
      lo = hi = Number(yearParam);
    } else if (startParam !== null && endParam !== null) {
      lo = Number(startParam);
      hi = Number(endParam);
    } else {
      return json({ error: "year (or start & end) is required" }, { status: 400 });
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      return json({ error: "year/start/end must be numeric" }, { status: 400 });
    }
    if (lo > hi) [lo, hi] = [hi, lo];

    const query = `@start_year:[-inf ${hi}] @end_year:[${lo} +inf]`;

    const features = await withRedis(env, async (redis) => {
      const reply = await redis.send(
        "FT.SEARCH",
        BOUNDARIES_INDEX,
        query,
        "LIMIT",
        "0",
        "1000",
        "RETURN",
        "0"
      );
      const result = parseFtSearchIdsOnly(reply);
      if (result.total === 0) return [];

      const mgetReply = await redis.send("JSON.MGET", ...result.ids, "$");
      return mgetReply
        .map((raw) => (raw == null ? null : JSON.parse(raw)))
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
    });

    return json({ type: "FeatureCollection", features });
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, { status: 400 });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname, searchParams } = new URL(request.url);

    if (pathname === "/api/health") return handleHealth(env);
    if (pathname === "/api/events") return handleEvents(env, searchParams);
    if (pathname === "/api/boundaries") return handleBoundaries(env, searchParams);

    return json({ error: "not found" }, { status: 404 });
  },
};
