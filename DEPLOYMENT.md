# Deployment

Recommended path: **Redis Cloud (free) -> API on Cloudflare Workers (free
plan) -> frontend on Cloudflare Pages (free)**. Three pieces, deployed in
this order because each depends on the previous one:

1. **Redis Cloud** - the database (events + boundaries, RediSearch/RedisJSON).
2. **The API** (`worker/`) - a Cloudflare Worker that queries Redis over a
   TCP socket (`cloudflare:sockets`) and serves it to the frontend over HTTP.
   See `worker/README.md` for how it works.
3. **The frontend** (`app/`) - the static Vite build on Cloudflare Pages. It
   needs the API's URL at *build* time.

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
  `https://atlaswiki-api.<account-subdomain>.workers.dev`
  (the name comes from `name` in `worker/wrangler.jsonc`). Note it down.

Verify:

```bash
curl https://atlaswiki-api.<account-subdomain>.workers.dev/api/health
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
Builds) with root directory `worker`. This is optional and has not been
exercised for this repo; manual `npx wrangler deploy` is always enough.

## Part 3: the frontend on Cloudflare Pages (~5 minutes)

1. Cloudflare dashboard: **Workers & Pages -> Create -> Pages -> Connect to
   Git**, select this repository.
2. Build configuration:
   - **Framework preset:** Vite
   - **Root directory:** `app`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Under **Environment variables** add
   `VITE_API_URL` = `https://atlaswiki-api.<account-subdomain>.workers.dev`
   (no trailing slash).

**Why it's set at build time:** Vite substitutes `import.meta.env.VITE_API_URL`
into the JavaScript while building; the browser never reads an environment.
If you change it later you must trigger a fresh build/deploy of Pages - just
editing the variable doesn't change the already-built files.

4. **Save and Deploy.** Note the resulting `https://<project>.pages.dev` URL.

Every push to `main` then rebuilds the frontend automatically.
`.github/workflows/ci.yml` build-checks the frontend and dry-run-bundles the
Worker on every push/PR (it deploys nothing).

## The ordering problem: `ALLOWED_ORIGIN`

The Worker can restrict CORS to one origin via the optional, non-secret
`ALLOWED_ORIGIN` variable (unset = any origin allowed). But the Pages URL isn't known until Pages
has been deployed, and Pages needs the Worker URL first. Resolution:

1. Deploy the Worker (`ALLOWED_ORIGIN` unset).
2. Deploy Pages with `VITE_API_URL` = the Worker URL.
3. Set `ALLOWED_ORIGIN` on the Worker to the exact Pages origin
   (`https://<project>.pages.dev`, scheme + host, no trailing slash). Do it
   in `worker/wrangler.jsonc` by uncommenting the `vars` block:
   ```jsonc
   "vars": { "ALLOWED_ORIGIN": "https://<project>.pages.dev" }
   ```
4. `npx wrangler deploy` again.

Set it in `wrangler.jsonc`, not only in the dashboard: Cloudflare's docs say
that if you change variables in the dashboard, "Wrangler will override them
the next time you deploy" unless `keep_vars` is set.

The app works fine with `ALLOWED_ORIGIN` unset (open CORS); it's a hardening
step. If you later add a custom domain to Pages, add it too / update the
value.

## If the API is down or `VITE_API_URL` is unset

If `VITE_API_URL` is unset at build time, the app runs in static mode: events,
boundaries and search all come from the bundled dataset, with no API calls. If
the API is set but unreachable or slower than 8 s, the app falls back to the
same built-in dataset, shows a notice, and retries every 20 s. Set
`VITE_API_URL` before the Pages build to get live (Redis-backed) data.

## Verifying the full deploy

1. `curl .../api/health` on the Worker returns `{"ok":true,"redis":"PONG"}`.
2. Open the Pages URL: the map renders with country shapes and markers (not
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
| Browser console: CORS error | `ALLOWED_ORIGIN` doesn't exactly match the Pages origin (scheme, host, no trailing slash, and preview deploys use different hostnames). Fix it, redeploy the Worker; or unset it to allow any origin. |
| Requests go to `localhost` | `VITE_API_URL` wasn't set when Pages built. Set it and trigger a new Pages deploy. |
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
requests/day), Pages Free. The only paid upgrades that are relevant are
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
- **Rotate the Redis password:** create a new password/user in the Redis
  Cloud console, then `cd worker && npx wrangler secret put REDIS_URL` with
  the new string (this creates a new version and deploys it), then
  `npx wrangler deploy` if you also changed config, and finally update
  `server/.env`. Remove the old credential in Redis Cloud once
  `/api/health` is OK.
