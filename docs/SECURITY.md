# Security, abuse protection and operations

Scope: the two Cloudflare Workers (static site `atlas-wiki`, API
`atlaswiki-api`), the Redis Cloud free database behind the API, and the repo's
CI. There are no user accounts and no user data; everything served is public,
Wikipedia-derived data. The realistic threats are **quota exhaustion**
(Workers Free = 100,000 requests/day, 10 ms CPU), **a leaked Redis password**,
and **browser-side injection** on the static site.

Cloudflare claims below cite a docs URL. Where a page was read through a
summarising fetch tool (not the raw page) or could not be confirmed, that is
said explicitly. Docs change; re-check before relying on them.

## 1. CORS is not abuse protection

The API answers `Access-Control-Allow-Origin` only for an allow-listed
`Origin` (exact match, reflected, with `Vary: Origin`). Default allow-list
(`DEFAULT_ALLOWED_ORIGINS` in `worker/src/logic.js`, duplicated in
`server/index.js`, parity-tested):

- `https://atlas-wiki.middle-wiki.workers.dev` (production frontend)
- `http://localhost` and `http://127.0.0.1` on ports 5173 (vite dev), 4173
  (vite preview), 8794 (wrangler dev)

**What this stops:** another website's JavaScript reading API responses in a
visitor's browser (the browser withholds the response), i.e. someone
embedding your API in their page and using their visitors' browsers.

**What it does not stop:** `curl`, scripts, bots and any non-browser client.
They send no `Origin` (or any Origin they like) and CORS is enforced only by
the browser. A hostile client can still call the Worker as often as it wants,
and **every invocation counts against the 100,000/day quota whether or not
CORS allows the caller to read the result.** Direct `curl` use keeps working
by design.

Change the list: set `ALLOWED_ORIGINS` (comma-separated exact origins, scheme
+ host[:port], no trailing slash; `*` = any origin) in the `vars` block of
`worker/wrangler.jsonc` and `npx wrangler deploy` (dashboard edits of vars
are overwritten by the next deploy unless `keep_vars` is set, see
[Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)).
Blank/unset means the defaults, **not** open. The old name `ALLOWED_ORIGIN` is
still read. Add your custom domain here if you attach one.

## 2. Rate limiting and the request quota

### What is implemented

1. **Workers Rate Limiting binding** `RATE_LIMITER` (`worker/wrangler.jsonc`,
   `ratelimits`): 120 requests per 60 s, key = `CF-Connecting-IP`. Over the
   limit -> `429` with `Retry-After: 10`. If the binding is absent (local dev,
   tests) or throws, requests are allowed (fail open, logged).
2. **Per-isolate guard** (`makeIsolateGuard`, 240 requests/min per IP per
   isolate, memory bounded to 500 keys): a cheap brake with no external
   dependency. Resets when the isolate is evicted; it is not accounting.
3. **414** for request URLs over 2048 characters; the parsers already cap `q`
   (100 chars), lists (20 items), `limit` (1000; `fields=full` 100) and
   `offset` (10,000).

### What this does NOT do (read this)

A request rejected with 429 or 414 **has already invoked the Worker, so it
still counts toward the 100,000/day Workers quota.** The limiter protects
Redis (a 30 MB free instance) and CPU time, and blunts a single hammering
client. It cannot stop a flood from consuming the daily quota. From the
[binding docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
(fetched through a summarising tool): the limit is "local to the Cloudflare
location that your Worker runs in", `period` "must be either `10` or `60`",
and the API is "permissive, eventually consistent, and intentionally designed
to not be used as an accurate accounting system". A distributed attacker gets
a multiple of the limit.

### Plan availability (partly unverified)

- Rate Limiting binding on the **Free** plan: the docs page I could read
  states only the Wrangler requirement ("version 4.36.0 or later") and gives
  no plan table. A web-search summary of the
  [GA changelog](https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/)
  says it is available on Workers Free and Paid; **I could not confirm that
  on the raw page.** Local `wrangler dev` and `wrangler deploy --dry-run`
  accept the binding (verified). **Unverified: a real `wrangler deploy` on
  your Free account.** If that deploy is rejected because of the binding,
  delete the `ratelimits` block from `worker/wrangler.jsonc`; the code
  degrades to the per-isolate guard only.
- **WAF rate-limiting rules** (the only mechanism that blocks *before* the
  Worker is invoked, hence the only one that could save quota): per the
  [rate limiting rules page](https://developers.cloudflare.com/waf/rate-limiting-rules/)
  (summarised by the fetch tool) the Free plan gets 1 rule, a 10 s period and
  10 s mitigation, matching on Path / Verified Bot only. WAF rules are a
  property of a Cloudflare **zone (your own domain)**; the page does not
  address `*.workers.dev`, and a zone-level feature cannot be attached to a
  workers.dev hostname to my knowledge (**not verified**). So this path
  needs a custom domain on Cloudflare.
- **Cache API (`caches.default`)**: intentionally not used. The
  [Cache API page](https://developers.cloudflare.com/workers/runtime-apis/cache/)
  says "Workers deployed to custom domains have access to functional `cache`
  operations". Whether it works on `workers.dev` is not stated clearly
  enough to rely on; keep it off unless you test it on your deployed URL.
  Caching is done with HTTP headers instead (section 4).

### What you must do in the dashboard

Nothing for the binding: `npx wrangler deploy` creates it. To check:
Dashboard -> **Workers & Pages** -> `atlaswiki-api` -> **Settings** ->
**Bindings** should list `RATE_LIMITER`. To go further (optional, needs a
domain): add a custom domain to the API Worker (Workers & Pages -> the Worker
-> Settings -> Domains & Routes), then in that zone create one WAF rate
limiting rule (Security -> WAF -> Rate limiting rules) on path `/api/` with
the 10 s period. Then update `ALLOWED_ORIGINS`, `VITE_API_URL` and the CSP
`connect-src` in `app/public/_headers` to the new host.

### Reducing exposure without any of this

The round-2 frontend does not call the API on a default page load (static
chunks only); the API is used for full-text search. Every unnecessary API
call removed is quota saved. If traffic outgrows 100,000/day the fix is the
Workers Paid plan (see `DEPLOYMENT.md`), not more code.

## 3. Static site headers (`app/public/_headers`)

Workers static assets read a `_headers` file from the asset directory
([docs](https://developers.cloudflare.com/workers/static-assets/headers/),
summarised): up to 100 rules, 2,000 chars/line, splats and placeholders,
matching rules merge and duplicated headers are comma-joined, `! Name`
detaches. **Verified locally with `wrangler dev`** (2026-09-26, wrangler
4.141): the rules apply to the assets and the SPA fallback (`/nonexistent` ->
index.html); a pattern with **two splats is silently ignored**; `! Cache-Control`
followed by a new `Cache-Control` in the same rule replaces the value.

Sent on every response: `Content-Security-Policy`, `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation, camera,
microphone, payment off).

CSP (enforcing, not report-only): `default-src 'self'; script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src
https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'
https://atlaswiki-api.middle-wiki.workers.dev https://demotiles.maplibre.org;
worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri
'self'; form-action 'self'; frame-ancestors 'none'`.

- `style-src 'unsafe-inline'` is required by MapLibre and React inline
  `style` attributes; scripts stay locked to same-origin files (no inline
  script, no `eval`).
- The CSP is an allow-list: a new external host (custom API domain, a new
  tile server) must be added to `connect-src`/`img-src`, otherwise the
  request is blocked and only a console violation shows it.
- **Proof** (Playwright + Chromium, `wrangler dev` serving the built `dist/`):
  map renders (600+ distinct colours in the map screenshot; worker file
  served 200), event detail opens, search returns results, rectangle draw
  tool produces an area, About dialog opens, panning/zooming fetches
  demotiles tiles and glyphs: zero `securitypolicyviolation` events and zero
  CSP console messages. A positive control confirms the policy is enforced
  (an injected inline script is blocked and fires a violation event). Also
  run in API mode against the local Worker (allow-listed origin, search
  answered by `/api/events`); a page on a non-allow-listed origin got a CORS
  block from the browser, as intended. Not covered: a real deployed
  `workers.dev` response (the file is applied by the same mechanism, but it
  is not exercised here), Firefox/Safari.

Caching (same file): `/assets/index-*` (Vite content-hashed JS/CSS)
immutable for a year. The two unhashed MapLibre files
(`maplibre-gl-worker.mjs`, `maplibre-gl-shared.mjs`, see `vite.config.js`)
sit in `/assets/maplibre-gl-<version>/`, also immutable: the version in the
folder name changes on every MapLibre upgrade.
`/data/events/all.*` (content-hashed) is immutable; everything else under
`/data/*` (`meta.json`, `ids.json`, `full/*.json`, decade
chunks, `boundaries/*.json`, `land.json`, `selection-funnel.json`) is 1 h +
`stale-while-revalidate=86400`. HTML keeps Cloudflare's default
(`max-age=0, must-revalidate`) so a deploy is picked up immediately. If a
future hashed file has a different name prefix, add a rule for it; the hash
alone cannot be matched by a glob.

## 4. API response headers and caching

Every API response (including 304/429/OPTIONS): `X-Content-Type-Options:
nosniff`, `Cross-Origin-Resource-Policy: cross-origin`.

**CORP decision:** `cross-origin`. The frontend lives on a different origin
(`workers.dev` is on the public suffix list, so `atlas-wiki.*` and
`atlaswiki-api.*` are cross-site) and the data is public. CORP only gates
no-cors embeds (`<img>`, `<script>`); it does not protect data that CORS
already withholds, and `same-origin`/`same-site` would risk breaking future
legitimate embeds for no gain. Revisit if the API ever serves anything
non-public.

Caching: `/api/events` `public, max-age=300, s-maxage=300,
stale-while-revalidate=86400`; `/api/boundaries` the same with `max-age=3600`;
errors, health and 429: `no-store`. Both data endpoints carry a weak `ETag`
(SHA-1 of the body); `If-None-Match` -> bodyless `304` (verified with curl).
The 304 saves **bandwidth, not Redis work or quota**: the Worker still runs
and queries Redis to know the body. Only a fresh browser cache (max-age)
avoids the request. `s-maxage` mirrors `max-age` for any shared cache but no
Cloudflare cache sits in front of a `workers.dev` Worker by default.
Unmeasured: CPU cost of the SHA-1 on a multi-MB boundaries body on real
Workers (native WebCrypto, expected small; check CPU time after deploy).

## 5. Rotate the Redis password (do this once now)

The current password appeared once in a tool log during development;
rotate it.

Redis Cloud
([default user docs](https://redis.io/docs/latest/operate/rc/security/access-control/data-access-control/default-user/),
fetched):

1. Console -> your database -> **Configuration** tab -> **Security** ->
   default user **Configure** (Essentials/free) or **Edit** -> *Default user
   password* (Pro). Enter a new password (< 50 characters; the docs list
   complexity rules elsewhere: 8+ chars with upper, lower, digit and
   special). Avoid characters that need URL encoding (`@ : / # ? %`), or
   percent-encode them in step 2. **Save** (**OK** on Essentials).
2. Build the new URL: `redis://default:<new-password>@<host>:<port>`.
3. Immediately, from `worker/`: `npx wrangler secret put REDIS_URL` (paste the
   URL). Between steps 1 and 3 the API returns 502/503 and the frontend
   falls back to its bundled static data, so do them back to back.
4. Update the local copies: `server/.env` (`REDIS_URL=...`) and
   `worker/.dev.vars` (both gitignored). Also the Render env var if you use
   the Express alternative.
5. Verify: `curl https://atlaswiki-api.<subdomain>.workers.dev/api/health`
   returns `{"ok":true,"redis":"PONG"}`; from the repo root `npm run
   load-redis` still works (proves the new `server/.env`). Confirm the old
   password is rejected: `redis-cli -u redis://default:<old>@<host>:<port>
   PING` should answer `WRONGPASS`/auth error.
6. Check that no copy of the old URL remains in shell history, notes or CI
   logs. Rotating again periodically (e.g. yearly) is cheap.

Not verified end-to-end here: I did not touch the real Redis Cloud account or
Cloudflare secrets; the steps come from the docs and the existing
`DEPLOYMENT.md` flow.

## 6. Redis without TLS (free tier)

Redis's [TLS page](https://redis.io/docs/latest/operate/rc/security/database-security/tls-ssl/)
(quoted in `DEPLOYMENT.md`): TLS is not available for free Redis Cloud
Essentials plans. **Exact risk:** the AUTH password and all query traffic
between Cloudflare's edge and Redis Cloud cross the public internet in
cleartext. A party on that path can read the password and data, and can
replay the password to read, overwrite or delete the database or use the
instance. Impact is bounded: the data is public and reloadable in seconds
(`npm run load-redis`), nothing else uses the password, and there are no
user records. Mitigations available for free: rotate (section 5), keep a
local copy (`data/`), and do not reuse the password anywhere.

**Upgrade path:** paid Essentials or Pro -> database Configuration -> Security
-> enable TLS -> use a `rediss://` URL with the TLS port from the console ->
`wrangler secret put REDIS_URL`. The Worker's `rediss://` branch (socket
opened with `secureTransport: "on"`) exists but is **untested against a real
TLS Redis**; test `/api/health` and one events query before trusting it, and
be ready to debug. `scripts/load-redis.js` uses the `redis` npm client, which
supports `rediss://` but was also not tested against a TLS server here.

## 7. Monitoring and alerts

Where to look (dashboard):

- **Workers & Pages -> `atlaswiki-api` -> Metrics** (per the
  [metrics docs](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/),
  summarised): Requests (successful, errored, subrequests), **Errors**
  (select in the summary graph) and **CPU Time per execution**. Do the same
  for `atlas-wiki` (static assets). **Unverified:** whether static-asset
  requests count toward the 100,000/day Workers Free quota; I did not confirm
  this in the docs, so watch the account's **Workers & Pages -> Overview**
  usage figures after deploying.
- **Observability -> Logs** for `atlaswiki-api` (`observability` is enabled in
  `wrangler.jsonc`), or live: `cd worker && npx wrangler tail`. 429s,
  `Upstream Redis failure:` and `RATE_LIMITER failed` lines are logged here.
- Redis Cloud console -> database -> **Metrics**: memory (30 MB cap),
  connections, ops/sec.

Alerts: the Cloudflare [notifications catalogue](https://developers.cloudflare.com/notifications/notification-available/)
(summarised by the fetch tool) lists no Workers-specific notification type, so
I cannot point you at a "quota 80%" alert. Suggested substitutes: (a) an
external uptime monitor (any free one) polling
`/api/health` every 5 minutes (about 288 requests/day, less than 0.3% of
quota) and emailing on non-200 - it checks Worker, Redis and quota (error
1027) in one probe; (b) look at the Metrics tab weekly; (c) turn on
Dependabot email/PR notifications on GitHub for advisories.

## 8. Incident runbook

| Symptom | What it means | Do |
|---|---|---|
| API returns Cloudflare **error 1027** / site shows the "notice" banner and static fallback | Daily 100,000-request cap reached ([limits](https://developers.cloudflare.com/workers/platform/limits/)); requests are rejected until midnight UTC | 1) Metrics: was it one flood or organic? `wrangler tail` for a spiking `CF-Connecting-IP`/path. 2) The frontend keeps working from static data. 3) If abuse: tighten `ratelimits` limit, put the API on a custom domain + WAF rule (section 2), or block the source with a WAF custom rule. 4) If organic: Workers Paid. Nothing to "clear"; it resets at 00:00 UTC. |
| Cloudflare **error 1102** ("Worker exceeded resource limits") | >10 ms CPU or memory on Free | Metrics -> CPU time; find the endpoint in logs. Usual suspects: `/api/boundaries` with a wide `start`/`end`, or `fields=full` at high limit (capped at 100, see `worker/test/bench.mjs`). Narrow the frontend request, or Workers Paid. |
| `/api/health` -> 503 `{"ok":false,...}` or events 502 | Redis down/unreachable/wrong password | Redis Cloud console: database status (is it active, over its 30 MB limit?), then credentials (section 5). `wrangler tail` shows the underlying error. **The frontend falls back to its bundled static dataset** (notice banner, retry every 20 s), so this is degraded search, not an outage. Fix, then `curl /api/health`. If the data is gone: `npm run load-redis`. |
| 503 "service not configured" | `REDIS_URL` secret missing/invalid | `npx wrangler secret put REDIS_URL` |
| Sudden 429s for real users | A shared NAT/office hit 120 req/60 s | Raise `limit` in `worker/wrangler.jsonc` and redeploy; the default frontend makes almost no API calls, so 120/min is generous |
| Browser CORS errors after adding a domain | Origin not in `ALLOWED_ORIGINS` | Add it (section 1), redeploy the Worker; also `connect-src` in `_headers` if the API host changed |
| Blocked resources / blank map after a MapLibre or hosting change | CSP `connect-src`/`worker-src`/`img-src` too tight | DevTools console shows `Content Security Policy` violations naming the blocked URL; add that host in `app/public/_headers` |
| Suspected leaked Redis URL | - | Section 5 immediately |

## 9. Dependencies and CI

- `.github/dependabot.yml`: weekly npm updates for `/`, `/app`, `/worker`,
  `/server` (minor+patch grouped) and GitHub Actions. Not validated by GitHub
  from here (I cannot run Actions/Dependabot): check the repo's
  Insights -> Dependency graph -> Dependabot tab after merging.
- CI `audit` job: `npm audit --omit=dev --audit-level=high` per directory is
  **blocking** (runtime dependencies with a high/critical advisory are worth
  stopping for); the full `npm audit --audit-level=high` including dev
  tooling is **report-only** (`continue-on-error`) so an advisory in a build
  tool cannot block unrelated PRs, while still appearing in the log. All four
  directories audit clean today.
- CI also runs `node --test app/src/lib/*.test.js` and the worker tests
  (`npm test` in `worker/`, including the shared-logic parity tests).
- The unused `cors` package was removed from `server/package.json` (and its
  lockfile): `server/index.js` implements CORS itself and no file imports
  `cors`.
