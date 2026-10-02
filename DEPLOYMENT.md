# Deployment

> **The site no longer uses the API or Redis.** Full-text search now runs in
> the browser on a static index (Pagefind) that `npm run build` generates from
> `data/events.json`, so the frontend (Part 3) is the only piece the site needs,
> and it needs no `VITE_API_URL`. Parts 1 and 2 below (Redis Cloud, the API
> Worker, `npm run load-redis`) describe infrastructure that is still deployed
> but unused, kept until it is retired.

Previous setup: **Redis Cloud (free) -> API on Cloudflare Workers (free
plan) -> frontend as a static-assets Cloudflare Worker (free)**. Three pieces,
deployed in this order because each depends on the previous one:

1. **Redis Cloud** - the database (events + boundaries, RediSearch/RedisJSON).
2. **The API** (`worker/`) - a Cloudflare Worker that queries Redis over a
   TCP socket (`cloudflare:sockets`) and serves it to the frontend over HTTP.
   See `worker/README.md` for how it works.
3. **The frontend** (`app/`) - the static Vite build, served by the Worker
   `meast-events` and built by Cloudflare Workers Builds on every push to `main`.
   It needs the API's URL at *build* time.

## After every merge to `main` (checklist)

Only the frontend deploys itself. The other two pieces do not:

| Changed | What to run | Automatic? |
|---|---|---|
| `app/`, or any file in `data/` that the site shows (the build regenerates `app/public/data/` from it) | nothing: Workers Builds rebuilds and deploys the site | yes |
| `worker/` (the API) | `cd worker` then `npx wrangler deploy` (on Windows PowerShell: `npx.cmd wrangler deploy`) | **no** |
| `data/events.json` (categories, fixes, and the monthly "Refresh Wikipedia summaries" pull request) | `npm run load-redis` from the repo root (Windows: `npm.cmd run load-redis`) | **no** |

The monthly refresh workflow (`.github/workflows/refresh-data.yml`) needs one repository setting, once:
**Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"**.
Without it the workflow still refreshes and checks the data, but fails at the step that opens the pull request.

Check afterwards: `/api/health` returns `{"ok":true,"redis":"PONG"}`, and a request
sent with an unknown `Origin` header gets no `Access-Control-Allow-Origin: *` back
(the hardened API only answers the allow-listed origins).

`server/` (Express) is the same API for a normal Node host. It is kept as an
[alternative](#alternative-the-express-server-on-render) if you'd rather not
use Workers.

## The license constraint (read first)

This project's map borders derive from [CShapes 2.0](https://icr.ethz.ch/data/cshapes/)
(CC BY-NC-SA 4.0) and UN OCHA data distributed under HDX's legacy terms.
**Both require non-commercial use.** That means:

- No ads, paywalls, or "pro tier" bolted onto this site.
- No selling access, embedding it in a paid product, or using it to promote
  a commercial offering.
- The attribution in the footer (`app/src/App.jsx`) must stay visible - don't
  remove or bury it.

Free/non-commercial hosting (as below) keeps the project compliant without
anyone having to think about it.

## Part 1: Redis Cloud (~5 minutes)

1. Sign up at [redis.io/cloud](https://redis.io/cloud/) - free, no credit
   card required.
2. Create a database on the **free tier** (30 MB). RediSearch and RedisJSON
   are included on the free tier (Redis's docs: a free database "comes with
   all the Redis Open Source features, including Redis Search and JSON").
3. From the database's **Connect** page, copy the connection string:
   ```
   redis://default:<password>@<host>.cloud.redislabs.com:<port>
   ```
   Treat it as a password. Never commit it.
4. Load the data from your own machine. Put the string in `server/.env`
   (copy `server/.env.example`; that file is **gitignored**, so the
   credential stays local):
   ```
   REDIS_URL=redis://default:<password>@<host>.cloud.redislabs.com:<port>
   ```
   then, from the repo root:
   ```bash
   npm run load-redis
   ```
   (The script reads `server/.env` automatically.) It's idempotent - it
   drops and rebuilds both indexes each run. The current dataset uses ~8 MB
   of the 30 MB.

**Transport security note:** the free tier only offers plain `redis://`.
Read [Security notes](#security-notes) before you decide whether that's OK
for you (short version: it's a reasonable trade for this data, and there's
a paid upgrade path).

## Part 2: the API on Cloudflare Workers (~10 minutes)

```bash
cd worker
npm install
npx wrangler login              # you do this; opens a browser to authorise
npx wrangler secret put REDIS_URL   # paste the Redis Cloud connection string
npx wrangler deploy
```

- `REDIS_URL` is a **secret**, not a var. Do not add it to `vars` in
  `wrangler.jsonc`: vars are plaintext and committed, and Cloudflare's
  tooling re-applies `vars` on every deploy. Secrets are never deleted or
  overwritten by a deploy. (For local dev, `worker/.dev.vars` - copied from
  `worker/.dev.vars.example` - is read by `wrangler dev` only and is never
  deployed.)
- If `secret put` complains the Worker doesn't exist yet, run
  `npx wrangler deploy` first; the API just returns errors until the secret
  is set.
- `wrangler deploy` prints the Worker URL:
  `https://meast-api.<account-subdomain>.workers.dev`
  (the name comes from `name` in `worker/wrangler.jsonc`). Note it down.

Verify:

```bash
curl https://meast-api.<account-subdomain>.workers.dev/api/health
# {"ok":true,"redis":"PONG"}
```

To check the bundle without deploying (this is also what CI does):
`npx wrangler deploy --dry-run --outdir=.dry-run`.

### Optional: auto-deploy on push (Workers Builds)

Cloudflare's [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
connects a Worker to a GitHub/GitLab repo and builds/deploys on push. Its
docs list a free-plan allowance of 3,000 build minutes/month, 1 concurrent
build and a 20-minute build timeout
([limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)).
Set it up in the dashboard (Workers & Pages -> your Worker -> Settings ->
Builds) with root directory `worker`. This has not been set up for the API: until it
is, every change under `worker/` must be deployed by hand (see the checklist above).
A merged API change that is never deployed leaves production on the old code.

## Part 3: the frontend as a static-assets Worker (~5 minutes)

The frontend is a Worker with only static assets (`app/wrangler.jsonc`: name
`meast-events`, assets from `./dist`, single-page-app fallback), built and deployed by
Cloudflare [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
from this GitHub repository.

1. Cloudflare dashboard, **Workers & Pages**: create a Worker from this GitHub
   repository (Workers Builds).
2. Build settings:
   - **Root directory:** `app`
   - **Build command:** `npm run build` (it runs `scripts/split-data.mjs` first)
   - **Deploy command:** `npx wrangler deploy`
   - **Non-production branch builds:** `npx wrangler preview` (the default). It needs the
     `previews` block in `app/wrangler.jsonc`, which is there; each branch and pull
     request then gets its own preview URL without touching production.
3. Add the build variable `VITE_API_URL` =
   `https://meast-api.<account-subdomain>.workers.dev` (no trailing slash) in the
   Worker's build settings.

**Why it's set at build time:** Vite substitutes `import.meta.env.VITE_API_URL`
into the JavaScript while building; the browser never reads an environment.
If you change it later, trigger a new build: editing the variable alone doesn't
change the already-built files.

The site's address is the custom domain `https://middleeast.events`; the Worker's own
`https://meast-events.<account-subdomain>.workers.dev` address keeps working too.

### Custom domain (middleeast.events)

From Cloudflare's docs (developers.cloudflare.com/workers/configuration/routing/custom-domains/):
a Custom Domain needs "an active Cloudflare zone" that you own, and cannot be added on a
hostname that already has a CNAME record. Cloudflare then creates the DNS record and the
certificate itself.

1. Add `middleeast.events` to the Cloudflare account as a zone, and switch the domain's
   nameservers at the registrar to the two Cloudflare gives you, so the zone becomes active.
2. **Workers & Pages** -> `meast-events` -> **Settings** -> **Domains & Routes** -> **Add** ->
   **Custom Domain** -> `middleeast.events` -> **Add Custom Domain**.
3. Redeploy the API Worker (`cd worker && npx wrangler deploy`) so its built-in CORS list,
   which now includes `https://middleeast.events`, is live. Without this, full-text search
   from the new address falls back to titles and summaries.
4. Optional, `www`: a Worker on `middleeast.events` does not receive `www.middleeast.events`.
   Cloudflare's docs suggest a proxied DNS record for `www` (`A` -> `192.0.2.0`) plus a
   Single Redirect rule (301) to `https://middleeast.events`.

The Workers are named `meast-events` (site) and `meast-api` (API); they were renamed from
`atlas-wiki` and `atlaswiki-api` on 2026-10-01, and the old workers.dev addresses stopped
answering (Cloudflare error 1042). If a Worker is renamed again in the dashboard, change
`name` in its wrangler.jsonc at the same time: Workers Builds fails when the two differ, and
`wrangler deploy` with the old name would create a second, empty Worker. The API address is
also in the `VITE_API_URL` build variable and in `connect-src` in `app/public/_headers`.

Every push to `main` rebuilds the frontend. `.github/workflows/ci.yml` lints and
tests the app, dry-run-bundles the API Worker and validates the data on every push
and pull request; it deploys nothing.

## CORS: `ALLOWED_ORIGINS` (safe by default)

The API only lets browsers read responses from an allow-list of origins. When
`ALLOWED_ORIGINS` is unset the built-in default applies: the production
frontend `https://middleeast.events` and its workers.dev address
`https://meast-events.middle-wiki.workers.dev`, plus local dev origins
(`http://localhost` / `127.0.0.1` on ports 5173, 4173, 8794). So the current
deployment needs no configuration.

To change it (custom domain, different frontend URL, preview deploys), set
the comma-separated exact origins (scheme + host[:port], no trailing slash)
in `worker/wrangler.jsonc` and redeploy:

```jsonc
"vars": { "ALLOWED_ORIGINS": "https://middleeast.events,https://meast-events.middle-wiki.workers.dev" }
```

`"*"` opens it to every origin; a blank value means the defaults, not open.
The old name `ALLOWED_ORIGIN` is still read. Set it in `wrangler.jsonc`, not
only in the dashboard: Cloudflare's docs say that if you change variables in
the dashboard, "Wrangler will override them the next time you deploy" unless
`keep_vars` is set.

**CORS is browser-only.** `curl` and bots are unaffected and still count
against the daily request quota. See [docs/SECURITY.md](docs/SECURITY.md) for
rate limiting (`RATE_LIMITER` binding, deployed by `wrangler deploy`), what it
can and cannot protect, and what to click in the dashboard.

## Frontend headers (`app/public/_headers`)

The static-assets Worker `meast-events` serves `dist/_headers` (copied from
`app/public/_headers` by Vite): a CSP, `nosniff`, `X-Frame-Options`,
`Referrer-Policy`, and cache rules (immutable for hashed files, 1 h +
stale-while-revalidate for the dataset and the unhashed MapLibre worker
files). If you point the frontend at a different API host, add it to
`connect-src` in that file, or the browser will block the calls. Details and
the verification notes: [docs/SECURITY.md](docs/SECURITY.md#3-static-site-headers-apppublic_headers).

## If the API is down or `VITE_API_URL` is unset

If `VITE_API_URL` is unset at build time, the app runs in static mode: events,
boundaries and search all come from the bundled dataset, with no API calls. If
the API is set but unreachable or slower than 8 s, the app falls back to the
same built-in dataset, shows a notice, and retries every 20 s. Set
`VITE_API_URL` before the frontend build to get live (Redis-backed) data.

## Verifying the full deploy

1. `curl .../api/health` on the Worker returns `{"ok":true,"redis":"PONG"}`.
2. Open the site URL: the map renders with country shapes and markers (not
   a blank pale-blue box - see the MapLibre worker note in
   `app/src/components/MapView.jsx`).
3. Browser network tab: `/api/events` and `/api/boundaries` go to your
   `workers.dev` URL, not `localhost`.
4. Clicking a marker opens its detail panel; search returns results; panning
   updates the event count.
5. The footer attribution and non-commercial notice are visible.

## Workers Free plan limits, and what they mean here

From Cloudflare's [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
and [pricing](https://developers.cloudflare.com/workers/platform/pricing/)
pages (fetched 2026-09-26; re-check them, limits change):

| Limit (Free plan) | Value |
|---|---|
| Requests | 100,000 per day, resets at midnight UTC |
| CPU time | 10 ms per HTTP request invocation |
| Subrequests | 50 per request |
| Simultaneous open connections | 6 "simultaneously waiting for response headers"; the docs say this includes "opening a TCP socket using the `connect()` API" |
| Memory | 128 MB per isolate |

- **When the daily cap is hit:** the limits page says Cloudflare returns
  **Error 1027** ("fail closed", the default for a route/workers.dev
  Worker). Requests are rejected, not throttled; service returns after the
  UTC reset. (The docs also describe a "fail open" mode that bypasses the Worker; this setup does not configure it.)
- **CPU limit:** exceeding CPU or memory gives **Error 1102** ("Worker
  exceeded resource limits"). CPU time is time spent computing, not time
  waiting on Redis over the network; the Worker's work is mostly building a
  command, waiting, and parsing the reply, but I have not measured CPU per
  request on a real deploy, and large `/api/boundaries` responses are the
  most likely place to hit 10 ms. Check `wrangler tail` / Workers Logs after
  deploying.
- **Subrequests:** each API request uses one `connect()` socket to Redis.
  The docs count `connect()` sockets toward the simultaneous-connection
  limit (6); whether they also count toward the 50-subrequest cap is not
  stated on the pages I read. Either way one or two per request is far
  below both.
- **What it means for this app:** the old frontend made ~16 API calls per
  page load, which at 100,000/day is only ~6,000 visits. The frontend is
  being reworked to reduce API calls per page load substantially, which
  should make the cap far less of a concern, but actual capacity depends on
  the final numbers. For a low-traffic non-commercial map the free plan is
  expected to be enough; if you outgrow it, the Workers Paid plan raises the
  limits (see the pricing page).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Blank pale-blue map, no country shapes | MapLibre worker asset bug in production builds; see the comments in `app/src/components/MapView.jsx` (the worker file is shipped explicitly). Rebuild after any MapLibre upgrade. |
| Browser console: CORS error | The page's origin isn't in `ALLOWED_ORIGINS` (or the built-in default): exact match on scheme, host and port, no trailing slash; preview deploys use different hostnames. Add it, redeploy the Worker. |
| Browser console: "Content Security Policy" violation | `app/public/_headers` doesn't allow that host; add it to the right directive and redeploy the frontend. |
| API returns 429 | Per-client rate limit (120 req/60 s per IP per location, or the per-isolate guard). Wait 10 s; raise `ratelimits.simple.limit` in `worker/wrangler.jsonc` if legitimate. |
| Requests go to `localhost` | `VITE_API_URL` wasn't set when the frontend was built. Set it in the Worker's build settings and trigger a new build. |
| 503 "service not configured" | The `REDIS_URL` secret isn't set. Run `npx wrangler secret put REDIS_URL`. |
| 502/503 upstream error | Redis unreachable or wrong password/host/port: re-check the connection string, that the DB is running in the Redis Cloud console, and that you didn't paste a `rediss://` URL for a DB with TLS off (or vice versa). `npx wrangler tail` shows the underlying error. |
| Cloudflare **error 1102** | Worker exceeded CPU/memory limit (10 ms CPU on Free). See the limits section; consider the paid plan. |
| Cloudflare **error 1027** | Daily 100,000-request cap reached; resets at midnight UTC. |
| `wrangler secret put` fails saying the name already exists as a variable | `REDIS_URL` is still declared in `vars` in `wrangler.jsonc`; remove it. |

## Alternative: the Express server on Render

If you'd rather not use Workers, `server/` runs the same API on a normal
Node host. Render is the one usual free option that's still free without a
credit card as of writing (Railway's free tier is only a small trial credit,
Fly.io needs a card).

**Caveat: Render's free tier sleeps after 15 minutes of inactivity**, and
the next request pays a ~30-50 second cold start. That is the main reason
Workers is preferred. Render's paid tier ($7/mo) is always-on.

1. Push the repo to GitHub; sign up at [render.com](https://render.com).
2. **New -> Web Service**, connect the repo. Root Directory `server`,
   Runtime Node, Build `npm install`, Start `npm start`, Instance Type Free.
3. Environment variable `REDIS_URL` = the Part 1 connection string
   (`PORT` is provided by Render).
4. Deploy; verify `curl https://<service>.onrender.com/api/health` (allow
   for the cold start).
5. Use that URL as `VITE_API_URL` in Part 3.

## Cost summary

**$0/month**, no credit card: Redis Cloud free (30 MB), Workers Free (100,000
requests/day) for both the API and the static-assets frontend. The only paid upgrades that are relevant are
Redis Cloud Essentials (for TLS, from about $5/month, see below) and
Workers Paid if you exceed the daily cap or CPU limit.

## Security notes

**Redis Cloud free tier has no TLS.** Redis's docs
([TLS](https://redis.io/docs/latest/operate/rc/security/database-security/tls-ssl/)):
"Paid Redis Cloud Essentials plans and Redis Cloud Pro plans can use TLS ...
TLS is not available for Free Redis Cloud Essentials plans." TLS is enabled
per database (Configuration -> Edit -> Security -> TLS toggle) and, once on,
"all client connections to your database must use TLS". Essentials paid
plans are listed at [redis.io/pricing](https://redis.io/pricing/) as "from
$0.007/hour with a minimum of $5/month" (250 MB+). You would then use a
`rediss://` URL (note the extra `s`) with the TLS port shown in the console.

**What that means:** with the free tier, traffic between Cloudflare and
Redis Cloud, including the AUTH password, crosses the public internet
unencrypted. Someone positioned on that path could read the password.

**Untested TLS path:** the Worker supports `rediss://` (it opens the socket
with `secureTransport: "on"`), but that path has **not been tested against a
real TLS Redis**; only plain TCP has been verified (locally and against your
Redis Cloud free database). If you pay for TLS, test it (`/api/health`)
before relying on it, and expect that you may need to debug it.

**Risk assessment (not alarmist):** the database holds only public,
Wikipedia-derived data, reloadable in seconds with `npm run load-redis`. With
a sniffed password an attacker could read that public data (no loss) or
modify/delete it (you reload it), or use the 30 MB instance for their own
purposes until you rotate the password. There is no user data, no other
credentials, and the password is used only for this database. It is a
legitimate, low-impact risk to accept on a hobby project, not a reason not
to deploy.

Options: (1) accept it (the default here); (2) upgrade to a paid Essentials
plan and use `rediss://` after testing; (3) mitigate: rotate the password
periodically (below) and keep nothing else in that database; (4) keep a
copy of the data locally (it is in `data/`) so a wipe is a non-event.

The Worker itself only exposes read endpoints; `REDIS_URL` never reaches the
browser or the repo. Keep `server/.env` and `worker/.dev.vars` out of git
(both are gitignored).

## Maintenance

- **Reload data:** update `data/*.json`, then `npm run load-redis` from the
  repo root (idempotent, uses `server/.env`).
- **Rotate the Redis password** (recommended once now: the current one
  appeared in a tool log; then periodically). Full steps with verification in
  [docs/SECURITY.md section 5](docs/SECURITY.md#5-rotate-the-redis-password-do-this-once-now).
  Short version: change the default-user password in the Redis Cloud console
  (database -> Configuration -> Security), immediately run
  `cd worker && npx wrangler secret put REDIS_URL` with the new URL, update
  `server/.env` and `worker/.dev.vars`, check `/api/health`, and confirm the
  old password is rejected.
- **Monitoring and incident runbook** (quota 1027, CPU 1102, Redis down):
  [docs/SECURITY.md sections 7-8](docs/SECURITY.md#7-monitoring-and-alerts).
