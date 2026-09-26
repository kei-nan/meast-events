# Deployment

This app now has **three pieces** to deploy, in this order (each depends on
the one before it):

1. **Redis Cloud** - the database (events + boundaries, RediSearch/RedisJSON).
2. **The API server** (`server/`) - a small Express app that queries Redis
   and serves it to the frontend over HTTP. Needs somewhere that runs a
   persistent Node process - a static host won't do.
3. **The frontend** (`app/`) - the static Vite build. Needs to know the API
   server's URL at *build* time (Vite bakes `VITE_API_URL` in when it builds,
   it isn't read at runtime in the browser).

If you deployed this before the Redis backend existed: that old setup (no
backend, no env vars) no longer reflects what's in the repo. The static-file
data pipeline (`app/scripts/split-data.mjs`) still exists as a fallback, but
isn't what the app uses by default anymore - see `server/README.md`.

## Before you start: the license constraint

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
2. Create a new database on the **free tier** (30MB). RediSearch and
   RedisJSON are included by default on the free tier - no extra
   configuration needed (confirmed from Redis's own docs: a free database
   "comes with all the Redis Open Source features, including Redis Search
   and JSON").
3. From the database's **Connect** page, copy the connection string. It
   looks like:
   ```
   redis://default:<password>@<host>.cloud.redislabs.com:<port>
   ```
   Keep this somewhere safe - you'll paste it into two places below. Never
   commit it to git (see `server/.env.example` / `.gitignore`).
4. Load the data into it from your own machine, once:
   ```bash
   REDIS_URL="redis://default:<password>@<host>.cloud.redislabs.com:<port>" \
     node scripts/load-redis.js
   ```
   Re-run this any time `data/events.json` or `data/boundaries.json` change
   - it's idempotent (drops and rebuilds both indexes each run). Current
   dataset uses ~8MB, comfortably inside the 30MB free tier with room to
   grow 3-4x before trimming would be needed.

## Part 2: the API server, on Render (~5 minutes)

**Why Render:** it's the only one of the three usual free-tier options
(Render, Railway, Fly.io) that's still genuinely free with no credit card as
of this writing - Railway's free tier is now just ~$1 of credit (a few
hours' runtime), and Fly.io requires a credit card and no longer offers a
free tier to new accounts. Render's real tradeoff: **the free tier sleeps
after 15 minutes of inactivity**, and the next request pays a 30-50 second
cold-start wake-up cost. For a low-traffic project that's a fair trade for
$0/month; if that cold start becomes a real problem, Render's paid tier
($7/mo, always-on) or adapting the API to Cloudflare Workers (same account
as the frontend, no cold start, but requires rewriting `server/index.js` to
Workers' request-handler model - not done in this repo) are the next steps.

1. Push this repo to GitHub if it isn't already there.
2. Sign up at [render.com](https://render.com) (no credit card needed for
   the free tier).
3. **New -> Web Service -> Connect** this repository.
4. Configure:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Under **Environment Variables**, add:
   - `REDIS_URL` = the connection string from Part 1.
   - (`PORT` doesn't need to be set - Render provides its own and Express
     already reads `process.env.PORT`... note: `server/index.js` currently
     defaults to `3001` if `PORT` is unset. Render sets `PORT` itself, and
     the server already reads `process.env.PORT`, so this works
     automatically - no action needed.)
6. Deploy. Render gives you a URL like `https://your-service.onrender.com`.
7. Verify it: `curl https://your-service.onrender.com/api/health` should
   return `{"ok":true,"redis":"PONG"}` (allow for the cold-start delay on
   the first request).

## Part 3: the frontend, on Cloudflare Pages (~5 minutes)

1. In the Cloudflare dashboard: **Workers & Pages -> Create -> Pages ->
   Connect to Git**, select this repository.
2. Build configuration:
   - **Framework preset:** Vite
   - **Root directory:** `app`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **This is the part that changed from the static-only setup:** under
   **Environment variables**, add:
   - `VITE_API_URL` = the Render URL from Part 2 (e.g.
     `https://your-service.onrender.com`).
   This has to be set before the build runs, since Vite substitutes
   `import.meta.env.VITE_API_URL` into the JS at build time - setting it
   later and just re-deploying without a fresh build won't pick it up.
4. **Save and Deploy.**

From here on, every push to `main` rebuilds and redeploys the frontend
automatically (Cloudflare) - the API server on Render redeploys on push too,
independently. `.github/workflows/ci.yml` build-checks the frontend on every
push/PR as a safety net.

## Verifying the full deploy worked

Open the Cloudflare Pages URL and confirm, in order:

1. **The map renders** with country shapes and event markers (not a blank
   pale-blue box - see `app/src/components/MapView.jsx`'s comments on the
   MapLibre-worker production bug if you ever see that).
2. **Open the browser's network tab** and confirm requests are going to your
   Render URL (`/api/events`, `/api/boundaries`), not `localhost` - if you
   see failed requests to `localhost:3001`, `VITE_API_URL` wasn't set before
   the Cloudflare build ran; fix it and trigger a fresh deploy.
3. **The first load might be slow** (~30-50s) if the Render API had gone to
   sleep - this is expected on the free tier, not a bug.
4. Clicking an event marker opens its detail panel; the search box returns
   results; panning the map updates the "N events in current map view"
   counter.
5. The footer's attribution and non-commercial notice are visible.

## Cost summary

Everything above is **$0/month**: Redis Cloud free tier, Render free tier
(with the cold-start caveat), Cloudflare Pages free tier (unlimited
bandwidth). No credit card is required anywhere in this path.
