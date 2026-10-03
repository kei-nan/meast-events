# Deployment

The site is fully static: **one static-assets Cloudflare Worker (`meast-events`,
free plan), built and deployed by Cloudflare Workers Builds on every push to
`main`.** There is no database and no API. Everything the browser loads is
generated from `data/` during `npm run build`:

- `app/public/data/` - the event and border files (`app/scripts/split-data.mjs`);
- `app/public/pagefind/` - the full-text search index, searched in the browser
  with [Pagefind](https://pagefind.app/) (`app/scripts/build-search-index.mjs`).

Both are gitignored and regenerated on every build, including Cloudflare's.

(Until October 2026 search ran on Redis Cloud behind a separate API Worker. That
code was removed from the repo; git history keeps it. What still has to be shut
down by hand is listed in
[Retiring the old API](#retiring-the-old-api-manual-one-time).)

## After every merge to `main` (checklist)

| Changed | What to run | Automatic? |
|---|---|---|
| `app/` | nothing: Workers Builds rebuilds and deploys the site | yes |
| any file in `data/` that the site shows, including `data/events.json` (categories, fixes, the monthly "Refresh Wikipedia summaries" pull request) | nothing: the rebuild regenerates `app/public/data/` and the search index | yes |

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

## The frontend as a static-assets Worker

The frontend is a Worker with only static assets (`app/wrangler.jsonc`: name
`meast-events`, assets from `./dist`, single-page-app fallback), built and deployed by
Cloudflare [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
from this GitHub repository. Setup (already done; for reference or a rebuild):

1. Cloudflare dashboard, **Workers & Pages**: create a Worker from this GitHub
   repository (Workers Builds).
2. Build settings:
   - **Root directory:** `app`
   - **Build command:** `npm run build` (it runs `scripts/split-data.mjs` and
     `scripts/build-search-index.mjs` first)
   - **Deploy command:** `npx wrangler deploy`
   - **Non-production branch builds:** `npx wrangler preview` (the default). It needs the
     `previews` block in `app/wrangler.jsonc`, which is there; each branch and pull
     request then gets its own preview URL without touching production.
3. No build variables or secrets are needed.

Workers Builds' docs list a free-plan allowance of 3,000 build minutes/month, 1
concurrent build and a 20-minute build timeout
([limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)).

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
3. Optional, `www`: a Worker on `middleeast.events` does not receive `www.middleeast.events`.
   Cloudflare's docs suggest a proxied DNS record for `www` (`A` -> `192.0.2.0`) plus a
   Single Redirect rule (301) to `https://middleeast.events`.

The Worker was renamed from `atlas-wiki` to `meast-events` on 2026-10-01, and the old
workers.dev address stopped answering (Cloudflare error 1042). If it is renamed again in
the dashboard, change `name` in `app/wrangler.jsonc` at the same time: Workers Builds fails
when the two differ, and `wrangler deploy` with the old name would create a second, empty
Worker.

## CI and the data pipeline

`.github/workflows/ci.yml` runs on every push and pull request to `main` and deploys
nothing: it lints, unit-tests and builds `app/`; validates `data/events.json` and
`data/events.proposed.json` (`node scripts/validate-events.js`), runs the data-pipeline
tests (`node --test scripts/lib/*.test.js`) and the border check
(`node scripts/verify-borders.js --check`); and runs `npm audit` for the repo root and
`app/`.

The data pipeline lives in `scripts/` (ingestion, the cited border corrections, the
proposed-events flow: pipeline output goes to `data/events.proposed.json` plus a report,
and `data/events.json` changes only through `node scripts/merge-proposed.js`). See
[docs/DATA_POLICY.md](docs/DATA_POLICY.md).

### Monthly refresh of the Wikipedia summaries

`.github/workflows/refresh-data.yml` runs on the 1st of each month (and on demand from
the Actions tab). It re-fetches every event's English Wikipedia lead and, if any changed,
opens a pull request with the changed summaries and a list of events whose title is no
longer the current article title. It never merges; merging the pull request rebuilds the
site, including the search index.

It needs one repository setting, once:
**Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"**.
Without it the workflow still refreshes and checks the data, but fails at the step that
opens the pull request.

## Frontend headers (`app/public/_headers`)

The static-assets Worker `meast-events` serves `dist/_headers` (copied from
`app/public/_headers` by Vite): a CSP, `nosniff`, `X-Frame-Options`,
`Referrer-Policy`, and cache rules (immutable for hashed files, 1 h +
stale-while-revalidate for the dataset and the unhashed MapLibre worker
files). If the site ever loads anything from another host, add it to the CSP
in that file, or the browser will block it. Details and the verification
notes: [docs/SECURITY.md](docs/SECURITY.md#2-static-site-headers-apppublic_headers).

## Verifying a deploy

1. Open the site: the map renders with country shapes and markers (not a blank
   pale-blue box - see the MapLibre worker note in `app/src/components/MapView.jsx`).
2. Search for a word that only occurs deep in an article's lead: it returns results
   (the browser network tab shows requests to `/pagefind/`, all same-origin).
3. Clicking a marker opens its detail panel with the full lead; panning updates the
   event count.
4. The footer attribution and non-commercial notice are visible.

## Free plan limits

From Cloudflare's [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
and [pricing](https://developers.cloudflare.com/workers/platform/pricing/) pages
(fetched 2026-09-26; re-check them, limits change): the Workers Free plan allows
100,000 requests per day, resetting at midnight UTC; when the cap is hit Cloudflare
returns **Error 1027**. Whether requests for static assets count toward that cap was
not confirmed here (see [docs/SECURITY.md](docs/SECURITY.md#3-monitoring)); watch the
account's **Workers & Pages -> Overview** usage figures.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Blank pale-blue map, no country shapes | MapLibre worker asset bug in production builds; see the comments in `app/src/components/MapView.jsx` (the worker file is shipped explicitly). Rebuild after any MapLibre upgrade. |
| "Full-text search is unavailable - matching titles and summaries only" | The browser could not load `/pagefind/`. Check that the build ran `build-search-index.mjs` (the Workers Builds log) and that the CSP still has `'wasm-unsafe-eval'`. The app retries every 20 s. |
| Browser console: "Content Security Policy" violation | `app/public/_headers` doesn't allow that host; add it to the right directive and redeploy the frontend. |
| Workers Builds fails right after a rename | `name` in `app/wrangler.jsonc` differs from the Worker's name in the dashboard. |
| Cloudflare **error 1027** | Daily 100,000-request cap reached; resets at midnight UTC. |

## Cost summary

**$0/month** for hosting, no credit card: Workers Free for the static-assets frontend
and Workers Builds' free allowance. The domain registration is the only paid item.

## Retiring the old API (manual, one-time)

**These steps are for the owner to do by hand. Removing the code from the repo
changed nothing in any account:** no Cloudflare, Redis Cloud, DNS or GitHub setting
was touched, so the old pieces below keep running until you shut them down. The site
does not use any of them (it has made no API calls since the in-browser search change,
#26), so shutting them down cannot break it.

1. **The API Worker `meast-api`** (the name was in the removed `worker/wrangler.jsonc`;
   it was renamed from `atlaswiki-api` on 2026-10-01). Cloudflare dashboard -> **Workers &
   Pages** -> `meast-api` -> **Settings** -> **Delete**. Deleting the Worker also removes
   its `REDIS_URL` secret and its `RATE_LIMITER` rate-limit binding. If a Worker named
   `atlaswiki-api` is still listed, delete it too.
2. **Its address.** The removed config used only the default
   `https://meast-api.<account-subdomain>.workers.dev` address (`"workers_dev": true`) and
   declared **no routes and no custom domain**. If you ever added a route or custom domain
   for the API in the dashboard, remove it (Worker -> **Settings** -> **Domains &
   Routes**) and delete the matching DNS record in the zone.
3. **The Redis Cloud database and subscription.** Redis Cloud console -> the database ->
   delete it; then delete the free subscription (or the whole account) if nothing else
   uses it. The data in it is a copy of `data/`; nothing is lost.
4. **The `VITE_API_URL` build variable.** Workers & Pages -> `meast-events` -> **Settings**
   -> **Build** -> variables: delete `VITE_API_URL` if it is still set. The app no longer
   reads it, so this is cleanup only.
5. **Local secret files.** Delete these wherever they exist (they hold the Redis
   connection string with its password; they are gitignored, so git never had them):
   `server/.env` and `worker/.dev.vars` in every checkout, plus any `server/` and `worker/`
   folders left behind with only ignored files in them (`node_modules/`, `.wrangler/`).
6. **Other copies of the Redis URL.** If the connection string was ever stored anywhere
   else (a Render service from the old Express alternative, a password manager, shell
   history), delete it there too. Once the database is deleted the password is worthless,
   so this is tidiness, not urgency.
