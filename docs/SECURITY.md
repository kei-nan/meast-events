# Security and operations

Scope: the static site (the Cloudflare static-assets Worker `meast-events`) and
the repo's CI. There is no server code, no database, no API, no user accounts
and no user data; everything served is public, Wikipedia-derived data built
from `data/`. The realistic threats are **browser-side injection** on the
static site, **a compromised dependency** in the build, and **quota
exhaustion** of the Workers Free plan.

(The Redis Cloud database and the API Worker that used to sit behind the site,
with their CORS, rate-limiting and credential-rotation notes, were removed from
the repo; git history keeps them. Shutting down what is still deployed is the
owner's manual checklist in
[DEPLOYMENT.md](../DEPLOYMENT.md#retiring-the-old-api-manual-one-time).)

Cloudflare claims below cite a docs URL. Where a page was read through a
summarising fetch tool (not the raw page) or could not be confirmed, that is
said explicitly. Docs change; re-check before relying on them.

## 1. Secrets

The site needs none: the build has no environment variables and the Worker has
no bindings or secrets (`app/wrangler.jsonc`). Keep it that way where possible;
anything put in a `VITE_*` variable ends up in the public JavaScript.

`.gitignore` still ignores `server/.env`, `worker/.dev.vars` and `.env.local`.
The first two held the old Redis connection string; delete any local copies
(DEPLOYMENT.md, "Retiring the old API"). Never commit credentials; if one is
ever committed, rotate it first, then clean history.

## 2. Static site headers (`app/public/_headers`)

Workers static assets read a `_headers` file from the asset directory
([docs](https://developers.cloudflare.com/workers/static-assets/headers/),
summarised): up to 100 rules, 2,000 chars/line, splats and placeholders,
matching rules merge and duplicated headers are comma-joined, `! Name`
detaches. **Verified locally with `wrangler dev`** (2026-09-26, wrangler
4.141): the rules apply to the assets and the SPA fallback (`/nonexistent` ->
index.html); a pattern with **two splats is silently ignored**; `! Cache-Control`
followed by a new `Cache-Control` in the same rule replaces the value.

Sent on every response: `Strict-Transport-Security: max-age=31536000;
includeSubDomains`, `Cross-Origin-Opener-Policy: same-origin`,
`Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (geolocation, camera, microphone, payment off).

- HSTS (one year, subdomains included): browsers ignore it over plain HTTP,
  so it takes effect from the first HTTPS visit. `includeSubDomains` commits
  every `*.middleeast.events` name to HTTPS for a year, so any subdomain
  added later must serve HTTPS. Not submitted for the browsers' preload list
  (that needs `preload` and is hard to undo).
- COOP `same-origin`: the site opens other sites only through links with
  `rel="noreferrer"`, and nothing it opens needs a handle back to it.

CSP (enforcing, not report-only): `default-src 'self'; script-src 'self'
'wasm-unsafe-eval' https://static.cloudflareinsights.com; style-src 'self'
'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src
'self' https://cloudflareinsights.com; worker-src 'self'; child-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors
'none'`.

- `worker-src`/`child-src` no longer allow `blob:` (2026-10-04). Both web
  workers are same-origin files: MapLibre's
  `/assets/maplibre-gl-<version>/maplibre-gl-worker.mjs` (set with
  `setWorkerUrl`, MapView.jsx) and Pagefind's `/pagefind/pagefind-worker.js`.
  Checked with Playwright + Chromium against `wrangler dev` (wrangler
  4.147.0) serving the built `dist/` with and without `blob:`: in both runs
  the only workers created were those two files, the map rendered (checked
  in a screenshot after a zoom), a search for "armistice" returned 20 Pagefind
  results and showed them in the panel, and there were zero
  `securitypolicyviolation` events and zero CSP console messages. Positive
  control: on the policy without `blob:`, `new Worker(blob URL)` is blocked
  with a `worker-src` violation. If a future MapLibre or Pagefind version
  creates blob workers, the map or search breaks with a `worker-src`
  violation in the console; add `blob:` back then. `img-src` keeps `blob:`
  (not re-tested; left as it was).

- `style-src 'unsafe-inline'` is required by MapLibre and React inline
  `style` attributes; scripts stay locked to same-origin files (no inline
  script, no `eval`).
- `'wasm-unsafe-eval'` lets the full-text search engine (Pagefind, served
  from `/pagefind/`) compile its WebAssembly module. It allows WebAssembly
  compilation only, not JavaScript `eval` or inline scripts.
- `static.cloudflareinsights.com` / `cloudflareinsights.com`: the Cloudflare
  Web Analytics beacon, injected by Cloudflare, and where it reports.
- No other host: data, search index, fonts, glyphs and the base map style are
  all same-origin. Cloudflare's bot-detection inline script
  (`/cdn-cgi/challenge-platform`) stays blocked; its content changes per
  response, so only `'unsafe-inline'` would allow it.
- The CSP is an allow-list: a new external host (e.g. a tile server) must be
  added to `connect-src`/`img-src`, otherwise the request is blocked and only
  a console violation shows it.
- **Proof** (Playwright + Chromium, `wrangler dev` serving the built `dist/`):
  map renders (600+ distinct colours in the map screenshot; worker file
  served 200), event detail opens, search returns results, rectangle draw
  tool produces an area, About dialog opens, panning/zooming fetches
  tiles and glyphs (then from demotiles.maplibre.org; since 2026-10-01 the
  base style and glyphs are self-hosted, see MapView.jsx BASE_STYLE): zero
  `securitypolicyviolation` events and zero CSP console messages. A positive
  control confirms the policy is enforced (an injected inline script is
  blocked and fires a violation event). That run predates the in-browser
  search index; `'wasm-unsafe-eval'` was added for it. Not covered: a real
  deployed `workers.dev` response (the file is applied by the same
  mechanism, but it is not exercised here), Firefox/Safari.

Caching (same file): `/assets/index-*` (Vite content-hashed JS/CSS)
immutable for a year. The two unhashed MapLibre files
(`maplibre-gl-worker.mjs`, `maplibre-gl-shared.mjs`, see `vite.config.js`)
sit in `/assets/maplibre-gl-<version>/`, also immutable: the version in the
folder name changes on every MapLibre upgrade.
`/data/events/all.*` (content-hashed) is immutable; everything else under
`/data/*` (`meta.json`, `ids.json`, `full/*.json`, decade
chunks, `boundaries/*.json`, `land.json`, `selection-funnel.json`) is 1 h +
`stale-while-revalidate=86400`. `/pagefind/*` revalidates on every visit
(`no-cache`) except the content-hashed `/pagefind/index/*` chunks (immutable).
HTML keeps Cloudflare's default (`max-age=0, must-revalidate`) so a deploy is
picked up immediately. If a future hashed file has a different name prefix,
add a rule for it; the hash alone cannot be matched by a glob.

## 3. Monitoring

- **Workers & Pages -> `meast-events` -> Metrics** (per the
  [metrics docs](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/),
  summarised): requests and errors.
- **Unverified:** whether static-asset requests count toward the 100,000/day
  Workers Free quota (when it is hit, Cloudflare answers **error 1027** until
  midnight UTC, [limits](https://developers.cloudflare.com/workers/platform/limits/)).
  I did not confirm this in the docs, so watch the account's **Workers &
  Pages -> Overview** usage figures.
- Alerts: the Cloudflare [notifications catalogue](https://developers.cloudflare.com/notifications/notification-available/)
  (summarised by the fetch tool) lists no Workers-specific notification type.
  Substitutes: an external uptime monitor polling the home page, a weekly
  look at Metrics, and Dependabot notifications on GitHub.

| Symptom | Do |
|---|---|
| Blocked resources / blank map after a MapLibre or hosting change | DevTools console shows `Content Security Policy` violations naming the blocked URL; add that host in `app/public/_headers`. |
| "Full-text search is unavailable" notice | `/pagefind/` could not be loaded: check the build log for `build-search-index.mjs` and that the CSP keeps `'wasm-unsafe-eval'`. Search still works on titles and summaries meanwhile. |
| Error 1027 | Daily request cap; resets at 00:00 UTC. If it recurs, check Metrics for a flood, or move to Workers Paid. |

## 4. Dependencies and CI

- `.github/dependabot.yml`: weekly npm updates for `/` and `/app`
  (minor+patch grouped) and GitHub Actions. Not validated by GitHub from here
  (I cannot run Actions/Dependabot): check the repo's Insights -> Dependency
  graph -> Dependabot tab.
- CI `audit` job (`.github/workflows/ci.yml`), for the repo root and `app/`:
  `npm audit --omit=dev --audit-level=high` is **blocking** (runtime
  dependencies with a high/critical advisory are worth stopping for); the full
  `npm audit --audit-level=high` including dev tooling is **report-only**
  (`continue-on-error`) so an advisory in a build tool cannot block unrelated
  PRs, while still appearing in the log. The repo root has only dev
  dependencies (the geometry libraries the data scripts use).
- CI also lints, tests and builds the app (then `app/scripts/check-dist.mjs`
  checks the built `dist/`), validates the data and runs the border check; it
  deploys nothing.
- Every `uses:` in `.github/workflows/` is pinned to a full commit SHA, with
  the tag in a comment; Dependabot's github-actions entry bumps both.
  `wrangler` (the deploy command Workers Builds runs) is an exact-version
  devDependency in `app/package.json`, so a deploy uses the locked copy.
- Workflow permissions: `ci.yml` is read-only (`contents: read`).
  `refresh-data.yml` pushes a branch and opens a pull request but never
  merges; every data change goes through a reviewed pull request. It is split
  so that code from npm never runs next to a write token. `npm ci` runs
  packages' install scripts, and those run as the job's user: in the same job
  they could have added a `.git/hooks/*` script that a later `git commit` or
  `git push` runs, or appended to `$GITHUB_ENV`/`$GITHUB_PATH` to change the
  environment or the `git` binary of later steps, including the step that
  holds the token. Hiding the token from earlier steps does not stop that.
  - Job `refresh` (`contents: read`): runs the refresh scripts, `npm ci`, the
    tests, the build and `check-dist.mjs`, and uploads `data/events.json`,
    `data/framing-review.json` and the reports as workflow artifacts.
  - Job `open-pr` (`contents: write`, `pull-requests: write`; only when
    `refresh` succeeded and found changes): a fresh checkout of the same
    commit (`persist-credentials: false`), the two data files copied in from
    the artifact (nothing else from it reaches the commit), then commit, push
    and `gh pr create`. It runs no npm and no repository script; git runs
    with `core.hooksPath=/dev/null`. The token is passed only to that last
    step, and only for the push through git's `GIT_CONFIG_*` environment
    (never written to `.git/config`).
  - Left over: a compromised dependency in `refresh` can still choose the
    content of those two data files (or the PR description, from the
    reports). That reaches only the unmerged pull request, which the owner
    reviews; it cannot push elsewhere, change workflows, or merge.
