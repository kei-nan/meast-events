# API server (Cloudflare Worker port)

A Cloudflare Worker port of `../server/index.js` — same API contract (same
routes, same query params, same response shapes), so `app/src/lib/dataClient.js`
needs no changes to point at this instead. Built to run on Cloudflare Workers
instead of a persistent Node host (Render), avoiding Render free tier's
cold-start sleep, on the same Cloudflare account the frontend (Pages) already
uses.

**Deploying:** see [`../DEPLOYMENT.md`](../DEPLOYMENT.md) (Redis Cloud, then
`wrangler secret put REDIS_URL`, `wrangler deploy`, then Pages).
`npx wrangler deploy --dry-run --outdir=.dry-run` bundles without deploying.

`../server/index.js` is left in place, unmodified, as a working
fallback/reference — this is an alternative deployment target, not a
replacement.

## How the pieces fit together

Same two pieces as the Express version:

1. `../scripts/load-redis.js` loads `../data/events.json` and
   `../data/boundaries.json` into Redis and builds the `idx:events` /
   `idx:boundaries` RediSearch indexes. Unchanged — this Worker queries the
   exact same schema.
2. `src/index.js` queries those indexes and exposes the same three routes:
   - `GET /api/events?start=<year>&end=<year>&bbox=<minLon,minLat,maxLon,maxLat>&q=<text>`
   - `GET /api/boundaries?year=<year>` (also `start`/`end` range)
   - `GET /api/health`

The query-building/escaping/response-shaping logic in `src/index.js` is
copied verbatim from `../server/index.js` — none of that needed to change.
What's different is the transport layer: Express + `redis` (node-redis, real
TCP sockets via Node's `net` module) vs. a Workers `fetch` handler +
`cloudflare:sockets` + a hand-rolled RESP2 client (`src/resp.js`).

## Why a hand-rolled RESP2 client instead of an existing library

[`redis-on-workers`](https://github.com/kane50613/redis-on-workers)
(kane50613, MIT) was tried first — it's exactly what the task pointed at: a
small (~10KB), dependency-free client that opens a real TCP socket to Redis
via `cloudflare:sockets`. Its `send()`/`sendRaw()` are generic RESP2 command
senders with no allowlist, so `redis.send("FT.SEARCH", ...)` and
`redis.send("JSON.MGET", ...)` do go out on the wire — there's no
FT.SEARCH-specific blocker in principle.

In practice, though, verified locally against a real `redis-stack-server`
instance: **its RESP decoder hangs the connection indefinitely on any bulk
string containing multi-byte UTF-8.** Confirmed directly —
`SET k "hello world"` then `GET k` through it resolves fine; `SET k2
"Arab–Israeli café"` then `GET k2` never resolves, and the Workers runtime
eventually kills the request as hung. This dataset's event/boundary text
(titles, extracts, historical notes) is full of non-ASCII characters — en
dashes, diacritics, transliterated names — so this isn't an edge case, it's
most requests. Root cause looks like the decoder computing bulk-string
lengths from decoded characters somewhere instead of the raw byte length in
the `$<len>` header; RESP bulk-string lengths are always byte lengths.

Given the actual API surface needed is exactly three command shapes (`PING`,
`FT.SEARCH`, `JSON.MGET`), `src/resp.js` implements a minimal RESP2
client instead: command encoding, and a byte-exact recursive decoder (bulk
strings are sliced by their byte-length header and decoded with
`TextDecoder` exactly once, never re-parsed via character counts). ~200
lines, no dependencies. See the comment at the top of `src/resp.js` for the
full writeup.

RESP3 (`HELLO 3`) was also considered, since it returns FT.SEARCH results as
typed maps (`%`) instead of RESP2's flat alternating-field-value arrays,
which would shrink the small `parseFtSearchWithFields` reshaping helper in
`src/index.js`. Decided against it: RESP3 adds several more type markers a
generic decoder would need to handle (map, set, double, boolean, null,
verbatim string, big number, push) for a parser that's intentionally scoped
to 3 command shapes, and the RESP2 flat-array shape — once the *only* real
bug (byte-exact bulk strings) was fixed — turned out to need very little
bespoke unpacking code (two ~10-line functions, `parseFtSearchWithFields` /
`parseFtSearchIdsOnly`). The added type surface wasn't worth it for a
shrink that small.

## A real Workers architecture constraint hit during testing

The first working version reused one `RedisConnection` (one TCP socket) from
module scope across every request hitting the Worker, mirroring how
`server/index.js` keeps one long-lived `redis` client for the life of the
Node process. That broke under real concurrent traffic (the frontend fires
a dozen-plus decade-prefetch requests in parallel while scrubbing/loading) —
Cloudflare Workers ties I/O objects (sockets, streams, and the promises they
produce) to the request context they were created in, and tears that context
down once its originating request finishes. A second, unrelated request
reading from a socket opened during a *different*, now-finished request gets
a hard failure. Observed directly in the local `wrangler dev` log:

```
TypeError: This ReadableStream belongs to an object that is closing.
Warning: A promise was resolved or rejected from a different request context
than the one it was created in. However, the creating request has already
been completed or canceled.
```

This is a documented Workers isolation model, not a `wrangler dev`/miniflare
bug. The fix (`withRedis()` in `src/index.js`): open a fresh
`RedisConnection` per incoming HTTP request, use it for that request's one
or two Redis round-trips, close it before returning the Response. Verified
this resolves the issue completely under the same concurrent load (see
"What was verified" below).

**Tradeoff worth knowing about:** a fresh TCP connection (and, against a
non-local/TLS Redis endpoint, a TLS handshake) per request is real added
latency that `server/index.js`'s persistent connection doesn't pay. Locally
against Docker this added a few ms per request (fine). Against Redis Cloud
over the public internet this would be more — the standard fix for
wanting a pooled/reused connection across requests on Workers is a Durable
Object that owns the socket and serializes access to it, which is out of
scope for this port but would be the next step if per-request connection
overhead against a real Redis Cloud instance turns out to matter.

## Running locally (verified)

```bash
# from the repo root
docker run -d --name redis-stack -p 6379:6379 redis/redis-stack-server:latest
node scripts/load-redis.js          # loads data/events.json + data/boundaries.json

# from worker/
npm install --ignore-scripts        # redis-on-workers isn't a dependency here,
                                     # but --ignore-scripts avoids an unrelated
                                     # `lefthook install` postinstall failure
                                     # from a *transitive* dev tool if present
npx wrangler dev                    # local Workers emulator on :8787
```

Locally, `REDIS_URL` comes from `worker/.dev.vars` (copy `.dev.vars.example`; gitignored; `redis://localhost:6379` matches `server/index.js`'s own default). It is intentionally not in `wrangler.jsonc`. The task brief
flagged Workers' local TCP socket emulation as having had rough edges
reaching `localhost` specifically, suggesting `127.0.0.1` as a fallback if
so — tested both directly against this `wrangler dev` + Docker setup and saw
no difference: `localhost:6379` and `127.0.0.1:6379` both connected and
served real RediSearch results without issue. Worth trying `127.0.0.1` first
if you hit connection trouble on a different setup, but it wasn't needed
here.

Point the frontend at it the same way as the Express version, just a
different port:

```bash
# app/.env
VITE_API_URL=http://localhost:8787
```

## What was verified

- `GET /api/health` → `{"ok":true,"redis":"PONG"}`.
- `GET /api/events?start=1945&end=1950&bbox=32.71,29.27,37.71,34.27` (roughly
  250km around Jerusalem, 1945–1950) → 6 events, ids matching exactly what
  `redis-cli FT.SEARCH` with the equivalent query returns directly against
  the same Redis instance.
- `GET /api/events?q=Suez` → 2 results (Suez Crisis, Gallipoli campaign —
  "Suez" appears in the latter's extract), matching `redis-cli` directly.
- `GET /api/boundaries?year=1948` → 18 features, names/ids matching
  `redis-cli` directly (including geometry payloads containing non-ASCII
  text, confirming the byte-exact RESP2 fix holds for JSON.MGET too).
- Full frontend (`app/`) driven with Playwright against this Worker at
  `localhost:8787`: initial load, full-text search ("Suez" → 2 results,
  correct markers highlighted), and map panning (live viewport event count
  updated from 112 → 111) all worked with zero console errors and zero
  failed network requests, including the concurrent decade-prefetch burst
  that exposed the cross-request-socket issue above.

## Environment variables

Same variable, same meaning as the Express version:

| Variable    | Default (local dev)      | Set via                                    |
|-------------|---------------------------|---------------------------------------------|
| `REDIS_URL` | `redis://localhost:6379` | `.dev.vars` (local, gitignored) / `wrangler secret put REDIS_URL` (real deploy, never committed) |
| `ALLOWED_ORIGINS` | built-in list: `https://middleeast.events`, `https://meast-events.middle-wiki.workers.dev` + `http://localhost|127.0.0.1` on 5173, 4173, 8794 | `vars` in `wrangler.jsonc` (comma-separated exact origins; `*` = any). Legacy name `ALLOWED_ORIGIN` still read. Blank = default, NOT open. |
| `RATE_LIMITER` (binding) | absent locally = no binding limit | `ratelimits` in `wrangler.jsonc`, 120 requests / 60 s per client IP per Cloudflare location |

Also always on: a per-isolate guard (240 requests/min per IP), 414 for URLs over 2048 characters, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: cross-origin`, weak `ETag` + `If-None-Match` -> 304 on `/api/events` and `/api/boundaries`, and `Cache-Control` (events 5 min, boundaries 1 h, both with `stale-while-revalidate=86400`). Rationale, limits and what to click in the dashboard: [`../docs/SECURITY.md`](../docs/SECURITY.md).

Nothing here has been deployed by this repo's tooling. `wrangler dev` (local emulator) is what was verified, plus a plain-TCP run against a Redis Cloud free database. The TLS path (`rediss://`) is untested against a real TLS Redis. For a real deploy see [`../DEPLOYMENT.md`](../DEPLOYMENT.md).

## Search API v2 (see docs/design-contract.md)

`GET /api/events` also takes `category`, `country` (comma lists, TAG-matched with their own escaper), `precise=1`, `sort=date|relevance`, `limit`/`offset` (response carries `truncated`), `fields=lite|full`, and prefix-matches the last `q` token (>= 2 chars). `server/index.js` carries a verbatim copy of the shared logic block in `src/logic.js` (`test/parity.test.js` fails on drift). The API queries `idx:events` / `idx:boundaries` as aliases; `scripts/load-redis.js` builds a new index and switches the alias atomically.

CPU: Workers Free allows 10 ms CPU per request. `node test/bench.mjs` (synthetic 500/1000-event replies, no credentials) shows fields=full at 500 events already touching that budget on a cold isolate, so clients should use `fields=lite` and page with `limit`.
