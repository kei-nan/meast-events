# middleeast.events search-v2 contract (shared by all work packages)

Branch: `integration/search-v2`. NOTHING is pushed to `main` (pushing main auto-deploys the live site) until the user has seen it locally.

Note (October 2026): the site no longer has an API or Redis. All data is static (built from `data/` by `app/scripts/split-data.mjs`) and full-text search runs in the browser on a Pagefind index (`app/scripts/build-search-index.mjs`). The API section below was replaced by the static equivalent; the old API code is in git history only.

## Data policy (applies to everything)
- Wikipedia/Wikidata content is shown AS-IS: never rewrite titles, extracts, dates, countries or labels. Automated checks may only FLAG problems (shown as a note), never overwrite.
- Inclusion is by an objective, published rule (Wikidata event classes + >=10 Wikipedia language editions), never per-event judgement. Document it in `docs/DATA_POLICY.md` (the data agent owns this file).
- Events with NO coordinates are not indexed, not shown (superseded by the addendum below: they are now kept). Events whose `coordinate_source` starts with `country-fallback` (pin at the capital) are kept but have `location_quality: "approximate"`; all others `"precise"`. Approximate events are excluded from user-drawn area searches (`precise=1`), still shown on the map and in text search, and labelled "approximate location" in the UI.
- `category` shown to users is presented as Wikidata's classification, not an editorial label.
- Curated-data rule: pipeline output goes to `data/events.proposed.json` + a report. `data/events.json` changes only via an explicit `node scripts/merge-proposed.js` run by the user.

## Search (static; replaces the former `GET /api/events` API)
Everything is answered in the browser from the static lite event set (`events/all.<hash>.json`: id,title,date_start,date_end,countries,category,coordinates,location_quality,snippet[160 chars], ...): year range, `bbox`, category, country and the precise-only rule for drawn areas (`app/src/lib/localSearch.js`). Free text (`q`, last token prefix-matched when >=2 chars) is matched against title + full lead by the Pagefind index, which returns only matching ids; filters, area and ranking are then applied locally (`app/src/hooks/useEventSearch.js`, `app/src/lib/ranking.js`). Totals are exact (no truncation).
Circle search: bounding `bbox` first, then trimmed by distance.
Event objects carry `location_quality`.

## Frontend props/contracts
- MapView props: `events`, `matchIds: Set|null` (null = no active search; non-matches dimmed when set), `selectedEventId`, `hoverId`, `focus: {id, lon, lat, nonce}|null` (fly + select), `areaMode: "off"|"rect"|"circle"`, `area: {type:"rect"|"circle", bbox:[minLon,minLat,maxLon,maxLat], center?:[lon,lat], radiusKm?:number}|null`, `onAreaModeChange(mode)`, `onAreaChange(area|null)`, `onViewportChange(bounds)`, `onSelectEvent(id)`. Exports `CATEGORY_COLORS`. The draw tool button lives in the map controls; drawing is an explicit mode so it never fights panning; the area stays editable.
- URL state (History API, no router): `q, cat, c (countries), y=start-end, scope=all|range, area=r:minLon,minLat,maxLon,maxLat | c:lon,lat,radiusKm, e=<event id>`. Validate on read.
- Side panel: search input, area chip (removable), filter chips, status line (aria-live), results list (matched words in <mark>), detail view with "Back to results". If the full-text index cannot be loaded: degraded notice + tokenised local search over titles and summaries, retried every 20 s.
- Deep links resolve via static `events/ids.json` (id -> decade chunk).

## Rules for every agent
- Work only in your own worktree/branch; own only the files listed in your task; do not touch others'.
- Never read/print/commit real credentials; no `git push`; never broad-kill processes (exact PIDs only); Windows: use `npm.cmd`/`npx.cmd` in PowerShell, prefer Bash tool.
- Report honestly what you verified vs. could not; leave changes COMMITTED on your branch.

## Addendum: bias-review fixes (data shape v2.1) - supersedes conflicting lines above
Source reports: docs/bias-review/*.md. The user approved: full lead text, all Wikidata classes shown as-is, data-bug fixes, scheduled extract refresh with "as of" date, an "About the data" page publishing the selection funnel, date-order errors flagged instead of dropped, DATA_POLICY wording fix, and events WITHOUT coordinates included (not dropped).
Event fields (curated and proposed, and static output):
- `extract`: the FULL lead section of the English Wikipedia article as plain text (not just the first paragraph); `extract_retrieved_at` (ISO date). `snippet` stays first 160 chars.
- `wikidata_classes`: string[] of ALL Wikidata class labels found for the item, in Wikidata's order; shown as-is in the UI ("Wikidata classes: a, b"). `category` remains the coarse colour/filter group (our own grouping - the UI labels it "Category (our grouping)"); `category_label` is deprecated and removed.
- `location_quality`: "precise" | "approximate" (capital fallback pin, unchanged) | "none" (no coordinates; `coordinates: null`, NO map marker, never invent a location).
- Events with `location_quality: "none"` ARE indexed/served/searchable/listed (list tag "No map location"), excluded from bbox/area queries (no lon/lat) and from map markers. `precise=1` still means precise only.
- `date_flags`: string[] (e.g. "date_order_invalid: Wikidata start after end"); such events are kept and shown with a visible note "Date unverified: <reason>", dates displayed as Wikidata gives them.
- Static chunks: keep coordinate-less events in decade chunks too.
