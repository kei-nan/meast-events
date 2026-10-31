# Deployment

The site is fully static: **one static-assets Cloudflare Worker (`meast-events`,
free plan), built and deployed by Cloudflare Workers Builds on every push to
`main`.** There is no database and no API. Everything the browser loads is
generated from `data/` during `npm run build`:

- `app/public/data/` - the event and border files (`app/scripts/split-data.mjs`);
- `app/public/pagefind/` - the full-text search index, searched in the browser
  with [Pagefind](https://pagefind.app/) (`app/scripts/build-search-index.mjs`);
- `app/node_modules/.cache/subset-fonts/` - the web fonts, subset to the characters
  the site shows (`app/scripts/subset-fonts.mjs`, see [Build steps](#build-steps-and-build-time-checks)).

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
- The footer's "Sources & licences" link (`app/src/App.jsx`, next to "About the
  data") must stay visible - don't remove or bury it - and the dialog it opens
  (`app/src/components/AboutData.jsx`) must credit CShapes 2.0, UN OCHA and
  Wikipedia/Wikidata with their licences.

Free/non-commercial hosting (as below) keeps the project compliant without
anyone having to think about it.

## The frontend as a static-assets Worker

The frontend is a Worker with only static assets (`app/wrangler.jsonc`: name
`meast-events`, assets from `./dist`, `dist/404.html` with status 404 for any other path), built and deployed by
Cloudflare [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
from this GitHub repository. Setup (already done; for reference or a rebuild):

1. Cloudflare dashboard, **Workers & Pages**: create a Worker from this GitHub
   repository (Workers Builds).
2. Build settings:
   - **Root directory:** `app`
   - **Build command:** `npm run build`. Its npm `prebuild` and `postbuild` scripts
     validate the data first and check `dist/` last, so a bad build fails here and
     is not deployed ([Build steps](#build-steps-and-build-time-checks)).
   - **Deploy command:** `npx wrangler deploy`
   - **Non-production branch builds:** `npx wrangler preview` (the default). It needs the
     `previews` block in `app/wrangler.jsonc`, which is there; each branch and pull
     request then gets its own preview URL without touching production.
   - `npx wrangler` runs the copy pinned in `app/package.json` (an exact version in
     `devDependencies`, locked in `app/package-lock.json`), installed by the build's
     `npm ci`, so a deploy never picks up whatever wrangler release is newest that day.
     Dependabot proposes upgrades like any other dependency.
3. No build variables or secrets are needed. (Two optional hardening changes to the
   build settings, made by hand: [Owner checklist](#owner-checklist-manual-dashboard-only).)

Workers Builds' docs list a free-plan allowance of 3,000 build minutes/month, 1
concurrent build and a 20-minute build timeout
([limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)).

The site's address is the custom domain `https://middleeast.events`; the Worker's own
`https://meast-events.<account-subdomain>.workers.dev` address keeps working too.

### Non-production hostnames (workers.dev and previews)

The same files are served at the Worker's `workers.dev` address and at each branch's
preview URL. `_headers` cannot treat them differently: its rules match paths, not
hostnames, so a static `X-Robots-Tag: noindex` would also de-index `middleeast.events`.
What already limits duplicate indexing, and the options (none applied; checked against
Cloudflare's docs on 2026-10-24):

- Every page names `https://middleeast.events/...` as its canonical address (`<link
  rel="canonical">`, `og:url`), and `sitemap.xml` lists only those addresses.
- Preview URLs on `workers.dev` get an `X-Robots-Tag: noindex` header from Cloudflare
  itself ([Previews](https://developers.cloudflare.com/workers/previews/)); the production
  `workers.dev` address does not.
- **Option, static, one line:** turn the production `workers.dev` address off with
  `"workers_dev": false` in `app/wrangler.jsonc` (or **Workers & Pages** -> `meast-events`
  -> **Settings** -> **Domains & Routes** -> `workers.dev` -> **Disable**; without the
  config line the next deploy turns it back on,
  [workers.dev docs](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)).
  Per those docs, Version/Preview URLs then default to off too unless `preview_urls` is set
  explicitly, so add `"preview_urls": true` if branch previews must keep working, and check
  one branch build afterwards. Not done here: it changes how the site is reached, so it
  is the owner's call.
- A per-host `noindex` would need a Worker script in front of the assets
  (`run_worker_first`), which the site does not have; not worth it for this.

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

### Build steps and build-time checks

Workers Builds deploys whatever `npm run build` produces on `main`, **whether or not CI
passed** (CI does not gate it; see [Recommended repository settings](#recommended-repository-settings-manual)).
So the checks that must stop a broken deploy are part of the build command itself
(`app/package.json`). npm runs `prebuild` and `postbuild` around `npm run build`
automatically, on Cloudflare as anywhere else; a failing step fails the build and
Cloudflare does not deploy it.

1. `prebuild`:
   - `node ../scripts/validate-events.js ../data/events.json` - structural checks on the
     curated events (schema, ids, dates, coordinates). It uses only Node built-ins, so it
     needs no `node_modules` at the repo root (the build installs only `app/`).
   - `scripts/split-data.mjs` - writes `app/public/data/`.
   - `scripts/subset-fonts.mjs` - subsets Inter (variable, wght axis kept) and Spectral
     600 from the fontsource packages to Basic Latin, Latin-1, General Punctuation and
     every character in `app/public/data/` and the app's source, keeping fontsource's
     per-script files and unicode-ranges. Output in `app/node_modules/.cache/subset-fonts/`,
     imported by `app/src/main.jsx`. A character outside every subset (Arabic, Hebrew)
     falls back to the system font, as before. In October 2026 this cut the default
     view's font downloads from 156 KB to 67 KB. It writes into a private temporary folder
     and then moves each file into place (fonts first, `fonts.css` last), never emptying the
     output folder, so a second build or dev server running at the same time never sees it
     missing or half-written.
   - `scripts/build-search-index.mjs` - writes `app/public/pagefind/`.
2. `vite build`.
3. `postbuild`:
   - `scripts/build-event-pages.mjs` - the `/event/` pages (each event's is the app's `index.html` with the event's own head tags and text, a preload of its full-record bucket, and links to related, earlier and later events), the sitemap (with each event's text retrieval date as `<lastmod>`), and `dist/_redirects` when `data/event-redirects.json` exists ([Renamed event ids](#renamed-event-ids-redirects)).
   - `scripts/expand-headers.mjs` - in `dist/_headers`, an immutable cache rule per
     content-hashed file (each splat marked `#! immutable-per-file` in
     `public/_headers`), so a 404 for a missing hashed file is never cached as immutable.
   - `scripts/check-dist.mjs` - fails if the versioned events folder named by
     `src/lib/dataVersion.js` is missing or inconsistent with `meta.json`, an event has
     no full record, a boundary chunk points to a missing shared geometry, a file
     `index.html` loads is missing, the search index is missing, **a file under
     `dist/assets/` has no content hash** (each gets an immutable rule in `_headers`),
     `_headers` has an immutable splat rule, was not expanded or has more than 100
     rules, an inline `<script>` has a hash the CSP does not list, `favicon.ico` or the
     180x180 `apple-touch-icon.png` is missing or malformed, an event page does not
     preload its own (existing) bucket, `_redirects` redirects a live id or points to a
     missing one, the search index is not the one versioned folder `pagefind/meta.json` and
     the bundle name, or `dist/` has more files than the host
     allows per deploy.

The raster icons (`app/public/favicon.ico`, `app/public/apple-touch-icon.png`) are
committed, rendered from `app/public/favicon.svg` by `node scripts/make-icons.mjs` (run in
`app/`; needs an installed Edge or Chrome, which the build does not). Run it again after
changing `favicon.svg`.

## CI and the data pipeline

`.github/workflows/ci.yml` runs on every push and pull request to `main`, and on a manual
or dispatched run (`workflow_dispatch`: the monthly refresh starts it on its pull request's
branch, [below](#ci-on-the-refresh-pull-request)). It deploys
nothing. Its jobs (the names GitHub shows as status checks):

- **Build app/** - lints `app/` (oxlint), runs its unit tests (`npm test`), checks that
  `.nvmrc` and `app/.nvmrc` agree, and runs `npm run build`, i.e. the same build
  Cloudflare runs, with all the checks above.
- **Validate event data** - validates `data/events.json` and `data/events.proposed.json`
  (`node scripts/validate-events.js`), runs the data-pipeline tests (`npm test` at the
  repo root), lints `scripts/` (`npm run lint` at the repo root: oxlint with the import
  plugin, `.oxlintrc.json`; `import/named` is an error, other findings are warnings),
  validates `data/boundaries.json` (`npm run validate-boundaries`; it also fails if a shape
  has fewer vertices or coarser coordinates than in `data/border-geometry-baseline.json`)
  and runs the border check (`node scripts/verify-borders.js --check`, every border period).
- **Dependency audit (.)** and **Dependency audit (app)** - `npm audit` of production
  dependencies (high and critical block) plus a report-only audit of everything.

The data pipeline lives in `scripts/` (ingestion, the cited border corrections, the
proposed-events flow: pipeline output goes to `data/events.proposed.json` plus a report,
and `data/events.json` changes only through `node scripts/merge-proposed.js`). See
[docs/DATA_POLICY.md](docs/DATA_POLICY.md).

### Monthly refresh of the Wikipedia summaries

`.github/workflows/refresh-data.yml` runs on the 1st of each month (and on demand from
the Actions tab). It:

- re-fetches every event's English Wikipedia lead and article title. Changed summaries
  are applied, and so are plain title renames; held cases (a redirect to a section of
  another article, another Wikidata item, a stored title Wikipedia does not redirect to)
  are not changed but listed in the PR description for review;
- refreshes the Wikidata sitelink counts behind the default "most covered" order, and
  the items' English Wikidata aliases (`wikidata_aliases`), which the search also matches;
- checks whether the Wikipedia guideline sections the framing review's wording check
  cites were edited since the reviews (recorded in `data/framing-review.json`, with the
  diff at the top of the PR description; if the check cannot run, the PR says so).

If `data/events.json` or `data/framing-review.json` changed, it installs the repo-root
dependencies (`npm ci`: the geometry library, without which `validate-events.js` skips its
pin-in-country check and the root tests skip the geometry tests), validates the data,
regenerates the two generated reports (`data/missing-coordinates-report.md`, and
`data/selection-funnel.json` with `--offline`, which keeps its committed sitelink measurement)
and checks that they are current, runs both unit-test suites and builds the site
(`npm ci && npm run build` in `app/`, which includes the build-time checks above), and then
a pull request is opened and CI is started on it (below). The workflow has two jobs: the
**Refresh summaries** job (`refresh`) does all of the above with a read-only token and
hands the two data files and the generated and refresh reports on as artifacts; the pull request is opened by
a separate job, **Open a pull request** (`open-pr`), which holds the write token and runs
no npm code and no repository scripts, so nothing the refresh installs or builds holds a
token that can push. The PR description holds the start of the refresh report; the full
report is uploaded as the run's `refresh-report` artifact (kept 90 days) and linked from
the PR. It never merges; merging the pull request rebuilds the site, including the
search index.

It needs one repository setting, once:
**Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"**.
Without it the workflow still refreshes and checks the data, but fails at the step that
opens the pull request.

#### CI on the refresh pull request

The pull request is opened with the workflow's own token (`GITHUB_TOKEN`). GitHub's
[Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
page (read 2026-10-18) says events from that token do not start new workflow runs, except
that `workflow_dispatch` and `repository_dispatch` "always create workflow runs", and that a
pull request it opens gets its `pull_request` runs in an **approval-required** state, which a
person with write access starts with **Approve workflows to run** in the merge box. So without
help the required checks (`Build app/`, `Validate event data`) would sit waiting on the PR.

So after opening the PR, the `open-pr` job runs `gh workflow run ci.yml --ref <branch>` (the
job has `actions: write` for this only, the permission GitHub lists for the
[workflow dispatch endpoint](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)).
For a `workflow_dispatch` run, `GITHUB_SHA` is the "last commit on the `GITHUB_REF` branch"
([Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)),
which is the PR's head commit, and its jobs have the same names as on a pull request. Check
runs belong to a commit and the app that created them
([checks guide](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks)),
and required status checks are matched by job name (and, if set, by source app:
[About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)),
so the dispatched run's checks should satisfy the ruleset. This was read from the docs, not
yet seen on a real refresh PR: on the next one, check that the merge box lists the required
checks as passed. Notes:

- `workflow_dispatch` only works once `ci.yml` with that trigger is on `main` (it is, from
  this change on). If the dispatch fails, the job logs a warning and the PR stays open; start
  CI by hand: **Actions → CI → Run workflow** on the PR's branch, or approve the waiting
  `pull_request` runs.
- The approval-required `pull_request` runs may also appear on the PR. Approving them is
  harmless (the same checks run twice); leaving them is fine too.
- If the dispatched checks turn out not to count (say, a ruleset that pins a source app the
  runs do not come from), the alternative is a token that is not `GITHUB_TOKEN`: a GitHub App
  installation token (an App the owner creates with Contents and Pull requests write on this
  repository, its ID and private key stored as Actions secrets, the token minted in `open-pr`
  with `actions/create-github-app-token` pinned to a SHA) or a fine-grained personal access
  token stored as a secret. PRs opened with either start CI normally. Both must be created by
  the owner; nothing in the repo does it. The App is preferable (short-lived tokens, not tied
  to a personal account).

## Frontend headers (`app/public/_headers`)

The static-assets Worker `meast-events` serves `dist/_headers` (copied from
`app/public/_headers` by Vite): a CSP, `nosniff`, `X-Frame-Options`,
`Referrer-Policy`, and cache rules: every file under `/assets/` is immutable for a
year (every file there is content-hashed, MapLibre's worker included;
`check-dist.mjs` fails the build otherwise), as are the content-hashed data folder and search
index folder, each through its own rule (`scripts/expand-headers.mjs`), so the 404
for a missing hashed file (a tab older or newer than a deploy) revalidates instead
of being cached for a year; the other dataset files get 1 h + stale-while-revalidate, and HTML
and `pagefind/meta.json` revalidate on every visit. If the site ever loads anything from another host, add it to the CSP
in that file, or the browser will block it. The CSP allows one inline script by its
sha256 hash (index.html's `document.documentElement.classList.add("js")`); changing that
text means changing the hash in `_headers`, and `check-dist.mjs` fails the build until
they match. Details and the verification
notes: [docs/SECURITY.md](docs/SECURITY.md#2-static-site-headers-apppublic_headers).

### Upgrading Pagefind

Nothing special: the engine (`pagefind.js`, `pagefind-worker.js`, `wasm.*.pagefind`) is in the
search index's versioned folder `pagefind/v.<hash>/` (`app/scripts/build-search-index.mjs`),
and the hash covers its bytes, so a new release gets a new folder and a browser never
pairs an old engine with a new index.

### Renamed event ids (redirects)

An event's address is `/event/<id>`, and links to it get shared, so ids are not renamed
casually (some early ids are spelled oddly, e.g. `treaty-of-s-vres`; they stay). To rename
one, change the id in the data and add the old one to `data/event-redirects.json`, an
object of `{"old-id": "new-id"}`. The build then writes `dist/_redirects` with a 301 from
`/event/old-id` to `/event/new-id` (`app/scripts/redirects.mjs`), and fails if an old id
is still an event (the redirect would hide its page: redirects apply before files), a new
id is not an event, or there are more than 2,000 (the host's limit). The file is optional;
without it there is no `_redirects`. New ids from `scripts/enrich-candidates.js` come from
`scripts/lib/slug.js`, which keeps accented letters' base letters ("Sèvres" -> `sevres`)
and drops apostrophes inside words ("Dawson's" -> `dawsons`); an item already in
`data/events.json` keeps its id.

## Recommended repository settings (manual)

These are settings for the owner to make by hand; nothing in the repo changes them.

1. **Require CI before merging to `main`.** Workers Builds deploys every push to `main`
   whether or not CI passed, so a pull request merged with a red check still deploys
   (the build-time checks above catch a broken build, but not, say, a failing border check
   or data-pipeline test). GitHub: **Settings -> Rules -> Rulesets** (or **Branches ->
   Branch protection rules**) for `main` -> **Require status checks to pass**, with the
   CI job names as they appear on a pull request:
   - `Build app/`
   - `Validate event data`
   - optionally `Dependency audit (.)` and `Dependency audit (app)` - their blocking step
     fails on a new high/critical advisory in a production dependency, which can turn an
     unrelated pull request red until the dependency is upgraded.
2. **No Workers Builds preview builds for Dependabot branches.** Every push to a
   non-production branch runs a preview build (build command, then `npx wrangler preview`)
   in Cloudflare, with the build's API token, for code from a dependency update nobody
   has reviewed yet, and uses build minutes. Cloudflare's Workers Builds docs
   ([build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/),
   read 2026-10-09) describe only an on/off **Enable Preview Builds** checkbox under
   **Settings -> Build -> Branch control**, with no branch filter. If the dashboard shows
   branch include/exclude rules there, exclude `dependabot/*`. Otherwise set the
   **Preview command** (Settings -> Build) to skip them using the branch name Workers
   Builds provides in `WORKERS_CI_BRANCH`
   ([build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)):
   `case "$WORKERS_CI_BRANCH" in dependabot/*) echo "No preview for Dependabot branches";; *) npx wrangler preview;; esac`.
   That skips the preview upload; the build command itself still runs. Dependabot pull
   requests still get CI.

## Owner checklist (manual, dashboard-only)

Nothing in the repo can make these changes; each is a setting in the Cloudflare or GitHub
dashboard. None is needed for the site to work.

1. **No preview builds for Dependabot branches.** See
   [Recommended repository settings](#recommended-repository-settings-manual), item 2: either
   exclude `dependabot/*` in Workers Builds' branch control, or set the preview command to the
   `WORKERS_CI_BRANCH` check given there.
2. **Do not run dependencies' install scripts in the Cloudflare build.** `app/package-lock.json`
   marks three packages with `"hasInstallScript": true` (`esbuild`, `workerd` from wrangler, and
   the macOS-only `fsevents`); the repo-root lockfile has none (checked 2026-10-18). Their
   scripts run during the build's install with the build's API token in the environment.
   - **Do not** just set `NPM_CONFIG_IGNORE_SCRIPTS=true` as a build variable. npm's
     [`ignore-scripts`](https://docs.npmjs.com/cli/v11/using-npm/config#ignore-scripts) also
     makes `npm run build` skip its `prebuild` and `postbuild` scripts, i.e. the data validation
     and `check-dist.mjs` ([Build steps](#build-steps-and-build-time-checks)): checked locally on
     2026-10-18, `NPM_CONFIG_IGNORE_SCRIPTS=true npm run build` ran only `vite build`. A broken
     build would then deploy.
   - Instead, limit it to the install: **Workers & Pages → `meast-events` → Settings → Build →
     Variables**: add `SKIP_DEPENDENCY_INSTALL` = `1` (Workers Builds then skips its own install,
     per its [build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
     docs), and change the **Build command** to `npm ci --ignore-scripts && npm run build`.
     Checked locally (Windows, 2026-10-18): after `npm ci --ignore-scripts`, `npm run build` ran
     all its checks and passed, and `npx wrangler --version` worked. Watch the first Cloudflare
     build after the change (Linux, where esbuild and workerd use their platform packages): if
     it fails in esbuild or wrangler, revert both settings.
3. **Narrow the build's API token.** Workers Builds creates a user API token by default with,
   per its [configuration docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
   account settings read, Workers Scripts edit, Workers KV Storage edit, Workers R2 Storage
   edit, Workers Routes edit on all zones, and user details and memberships read. The site
   uses no KV, no R2 and no routes (`app/wrangler.jsonc` declares none; the custom domain is
   set in the dashboard). **My Profile → API Tokens** → the Workers Builds token → **Edit**:
   remove Workers KV Storage and Workers R2 Storage, and restrict it to this account. Removing
   Workers Routes is likely fine too but untested; if the next build's deploy fails, add it
   back. Then confirm one push to `main` still deploys and one branch still gets a preview.
4. **Finish [Retiring the old API](#retiring-the-old-api-manual-one-time):** delete the
   `meast-api` Worker and the Redis Cloud database (and subscription), then delete the local
   `server/.env` and `worker/.dev.vars` files (they hold the old Redis password).
5. **Stop Cloudflare injecting its "JavaScript detections" script.** Every page on the live
   site logs a CSP error ("Refused to execute inline script ...") for an inline script
   Cloudflare adds under `/cdn-cgi/challenge-platform/`. The CSP blocks it on purpose: its
   content changes per response, so only `'unsafe-inline'` would allow it
   ([docs/SECURITY.md](docs/SECURITY.md)). Cloudflare's docs (read 2026-10-24) say that
   with **Bot Fight Mode** (the free plan's bot protection) JavaScript detections are
   always on and cannot be turned off separately, so:
   - Free plan: **Security → Settings**, filter by **Bot traffic** → **Bot fight mode** →
     **Off** ([Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/)).
     This also stops Bot Fight Mode's challenges to bot-like traffic; the site is static
     and has no forms or accounts, so there is little for it to protect.
   - Pro plan or above (Super Bot Fight Mode): **Security → Settings**, filter by **Bot
     traffic** → **Super Bot fight mode** → the edit icon for **JS detections** → **Off**.
   Then reload any page with the browser console open: the CSP error should be gone.

## Verifying a deploy

1. Open the site: the map renders with country shapes and markers (not a blank
   pale-blue box - see the MapLibre worker note in `app/src/components/MapView.jsx`).
2. Search for a word that only occurs deep in an article's lead: it returns results
   (the browser network tab shows requests to `/pagefind/`, all same-origin).
3. Clicking a marker opens its detail panel with the full lead; panning updates the
   event count.
4. The footer's "About the data · Sources & licences" links are visible, and "Sources
   & licences" opens the dialog at the credits for CShapes 2.0, UN OCHA and Wikipedia.
   Its "third-party licences" link opens `/third-party-licenses.txt` (generated by the build,
   `app/scripts/third-party-licenses.mjs`), which lists MapLibre GL JS among others.

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
