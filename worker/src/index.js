// Cloudflare Worker port of ../../server/index.js - same API contract, same
// RediSearch query-building/escaping/response-shaping logic (copied over
// verbatim from the Express version, not rewritten), just running on
// Workers' fetch-handler model instead of a persistent Express process, and
// talking to Redis over cloudflare:sockets via a small hand-rolled RESP2
// client (./resp.js) instead of the `redis` npm client (which needs real
// Node net sockets, unavailable here).
//
// Endpoints (identical to server/index.js):
//   GET /api/events?start&end&bbox&q&category&country&precise&sort&limit&offset&fields (see docs/design-contract.md)
//   GET /api/boundaries?year=<year>  (also start/end range, see server/index.js)
//   GET /api/health
//
// See README.md in this directory for what was verified locally, and
// ./resp.js's top comment for why this hand-rolls RESP2 instead of using the
// existing `redis-on-workers` package (github.com/kane50613/redis-on-workers) -
// short version: that package's generic send()/sendRaw() commands *would*
// carry FT.SEARCH (no command allowlist), but its decoder hangs on
// any bulk string containing multi-byte UTF-8, which this dataset's text is
// full of.

import { RedisConnection } from "./resp.js";
import { parseFtSearchWithFields } from "./resp-codec.js";
import {
  ClientError,
  buildBoundariesQuery,
  buildEventsRequest,
  boundaryDocToFeatureJson,
  corsHeaders,
  eventsResponse,
  etagFor,
  ifNoneMatchHits,
  makeIsolateGuard,
  MAX_URL_LENGTH,
} from "./logic.js";

// idx:events / idx:boundaries are ALIASES that scripts/load-redis.js repoints
// (FT.ALIASUPDATE) at a freshly built index, so reloads never interrupt the API.
const EVENTS_INDEX = "idx:events";
const BOUNDARIES_INDEX = "idx:boundaries";
const REDIS_TIMEOUT_MS = 8000; // whole connect+auth+query budget per request
const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

// Missing/invalid deployment configuration -> 503 "service not configured".
class ConfigError extends Error {}

// Data only changes when someone re-runs scripts/load-redis.js, so successful
// data responses are cacheable by browsers/CDNs. Errors and health: no-store.
//
// Cache API (caches.default) deliberately NOT used: Cloudflare's docs say
// "Workers deployed to custom domains have access to functional `cache`
// operations" (developers.cloudflare.com/workers/runtime-apis/cache/) and do
// not promise it on plain *.workers.dev, which is the expected first
// deployment. These headers are honored by browsers regardless.
//
// Data changes only on a manual reload, so browsers may reuse it: events 5 min
// fresh, boundaries (large, rarely changing) 1 h, both then served stale for a
// day while revalidating in the background (revalidation is an ETag 304).
// s-maxage mirrors max-age for any shared cache in front (none is configured).
const CACHE_EVENTS = "public, max-age=300, s-maxage=300, stale-while-revalidate=86400";
const CACHE_BOUNDARIES = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";
const NO_STORE = "no-store";

// Abuse guards (see docs/SECURITY.md). The Rate Limiting binding (RATE_LIMITER,
// optional - absent in local dev/tests) counts per Cloudflare location; the
// in-isolate guard is a cheap extra brake for one client hammering one isolate.
// NOTE: a request rejected here has still been invoked, so it still counts
// toward the daily Workers request quota - these protect Redis and CPU, not the quota.
const isolateGuard = makeIsolateGuard({ limit: 240, windowMs: 60_000 });
const clientKey = (request) => request.headers.get("CF-Connecting-IP") || "unknown";

async function tooManyRequests(request, env) {
  const key = clientKey(request);
  let limited = isolateGuard(key);
  if (!limited && env.RATE_LIMITER) {
    try {
      limited = !(await env.RATE_LIMITER.limit({ key })).success;
    } catch (err) {
      console.error("RATE_LIMITER failed (allowing request):", err); // fail open
    }
  }
  return limited
    ? json({ error: "too many requests" }, request, env, { status: 429, headers: { "Retry-After": "10" } })
    : null;
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
//
// Round trips per request (after the TCP/TLS handshake): 1 for every
// endpoint - AUTH is pipelined with the query, and boundaries fetch whole
// documents in the same FT.SEARCH (RETURN 1 $) instead of ids + JSON.MGET.
async function withRedis(env, fn) {
  if (!env.REDIS_URL) throw new ConfigError("REDIS_URL is not set");
  let redis;
  try {
    redis = new RedisConnection(env.REDIS_URL);
  } catch {
    throw new ConfigError("REDIS_URL is not a valid URL"); // never echo the URL (has the password)
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Redis request timed out after ${REDIS_TIMEOUT_MS}ms`)),
      REDIS_TIMEOUT_MS
    );
  });
  const work = fn(redis);
  work.catch(() => {}); // if the timeout wins, don't leave an unhandled rejection
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    redis.close();
  }
}

// --- responses ----------------------------------------------------------

// Allowed CORS origins: ALLOWED_ORIGINS (or legacy ALLOWED_ORIGIN); blank = built-in defaults.
const allowedOrigins = (env) => env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN;

// Sent on every response. CORP is "cross-origin" on purpose: the data is public
// and meant to be fetched by the frontend from another origin (see docs/SECURITY.md).
const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

function json(body, request, env, { status = 200, cache = NO_STORE, headers = {} } = {}) {
  // A string body is already-serialized JSON (see handleBoundaries).
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": status >= 200 && status < 300 ? cache : NO_STORE,
      ...BASE_HEADERS,
      ...corsHeaders(allowedOrigins(env), request.headers.get("Origin")),
      ...headers,
    },
  });
}

// Successful data response with a weak ETag; If-None-Match hit -> bodyless 304.
// (Saves bandwidth, not the Redis query: the body must be built to be hashed.)
async function dataJson(body, request, env, cache) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const etag = await etagFor(text);
  if (ifNoneMatchHits(request.headers.get("If-None-Match"), etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": cache,
        ...BASE_HEADERS,
        ...corsHeaders(allowedOrigins(env), request.headers.get("Origin")),
      },
    });
  }
  return json(text, request, env, { cache, headers: { ETag: etag } });
}

// Maps a thrown error to [status, clientBody]. Detail goes to the log only.
function classify(err) {
  if (err instanceof ClientError) return [400, { error: err.message }];
  if (err instanceof ConfigError) {
    console.error("Service not configured:", err.message);
    return [503, { error: "service not configured" }];
  }
  console.error("Upstream Redis failure:", err);
  return [502, { error: "upstream service unavailable" }];
}

function errorResponse(err, request, env) {
  const [status, body] = classify(err);
  return json(body, request, env, { status });
}

// --- routes ------------------------------------------------------------

async function handleHealth(request, env) {
  try {
    const pong = await withRedis(env, (redis) => redis.send("PING"));
    return json({ ok: true, redis: pong }, request, env);
  } catch (err) {
    const [status, body] = classify(err);
    return json({ ok: false, ...body }, request, env, { status: status === 502 ? 503 : status });
  }
}

async function handleEvents(request, env, searchParams) {
  try {
    const req = buildEventsRequest(searchParams);
    const args = ["FT.SEARCH", EVENTS_INDEX, req.query];
    if (req.sortBy) args.push("SORTBY", req.sortBy, "ASC");
    if (req.returnFields) args.push("RETURN", String(req.returnFields.length), ...req.returnFields);
    args.push("LIMIT", String(req.offset), String(req.limit));
    const reply = await withRedis(env, (redis) => redis.send(...args));
    const result = parseFtSearchWithFields(reply);
    return await dataJson(
      eventsResponse(
        result.total,
        result.documents.map((d) => d.value),
        req
      ),
      request,
      env,
      CACHE_EVENTS
    );
  } catch (err) {
    return errorResponse(err, request, env);
  }
}

async function handleBoundaries(request, env, searchParams) {
  try {
    const query = buildBoundariesQuery(searchParams);
    // One round trip: `RETURN 1 $` on the ON JSON index returns each whole
    // document as a string under the field "$" (verified on redis-stack),
    // replacing the old RETURN 0 + JSON.MGET pair.
    const reply = await withRedis(env, (redis) =>
      redis.send("FT.SEARCH", BOUNDARIES_INDEX, query, "LIMIT", "0", "1000", "RETURN", "1", "$")
    );
    // Geometry text is spliced through without a parse/stringify round trip
    // (boundaryDocToFeatureJson) - the dominant CPU cost for big responses.
    const features = parseFtSearchWithFields(reply)
      .documents.map((d) => boundaryDocToFeatureJson(d.value["$"]))
      .filter(Boolean);
    return await dataJson(
      `{"type":"FeatureCollection","features":[${features.join(",")}]}`,
      request,
      env,
      CACHE_BOUNDARIES
    );
  } catch (err) {
    return errorResponse(err, request, env);
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname, searchParams } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": ALLOWED_METHODS,
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
          ...BASE_HEADERS,
          ...corsHeaders(allowedOrigins(env), request.headers.get("Origin")),
        },
      });
    }

    if (request.url.length > MAX_URL_LENGTH) {
      return json({ error: "URI too long" }, request, env, { status: 414 });
    }

    const route =
      pathname === "/api/health"
        ? handleHealth
        : pathname === "/api/events"
          ? handleEvents
          : pathname === "/api/boundaries"
            ? handleBoundaries
            : null;
    if (!route) return json({ error: "not found" }, request, env, { status: 404 });

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method not allowed" }, request, env, {
        status: 405,
        headers: { Allow: ALLOWED_METHODS },
      });
    }

    const limited = await tooManyRequests(request, env);
    if (limited) return limited;

    return route(request, env, searchParams);
  },
};
