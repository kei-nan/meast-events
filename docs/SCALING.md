# Scaling: how the site stays fast as events are added

The site is fully static: the browser downloads the data and does all filtering, searching and clustering itself. That keeps hosting free and simple,
but it means every event added costs every visitor something. This page says what grows with the number of events, where the limits are, what
guards them in the build, and what to do when one is reached. Numbers were measured on 2026-10-06 (method at the end).

## What a visitor downloads

| File | When | Grows with events? |
|---|---|---|
| `data/events/v.<version>/all.json` | on every page load, preloaded from `index.html` | **yes, linearly**: the lite record of every event (id, title, dates, countries, category, 160-character snippet, coordinates, location quality) |
| `data/events/v.<version>/full/<bucket>.json` | when an event is opened | per bucket, no: the bucket count doubles as the dataset doubles, so a bucket stays around 32 events (~20 KB compressed) |
| `pagefind/*` | on the first search | the index is chunked by Pagefind; `pagefind/ids.json` (~40 bytes per event) is loaded whole |
| `data/boundaries/<decade>.json`, `data/boundaries/shared/<hash>.json`, `data/land.json` | when the map starts | no (borders, not events) |
| `/event/<id>` | search engines, shared links | one static page per event: **counts against the host's file limit** |

`<version>` is a hash of every file in the folder, so the whole folder is cached immutably (`app/public/_headers`) and a page never mixes files from two builds.

## Measured

Built from the same synthetic datasets (real events cloned with new ids, years and nearby coordinates; `app/scripts/scale-test/generate.mjs`) by the code
before this change (`origin/main` at `5e804b5`) and after it. Edge, headless, with Lighthouse's mobile throttling: 150 ms round trip, 1.6 Mbps down, CPU 4x
slower. Median of 3 runs.

| Dataset | | List shown | Event file loaded | Blocking time while moving the timeline 20 years |
|---|---|---|---|---|
| real (571 events) | before | 3.26 s | 2.87 s | 383 ms |
| | **after** | **1.64 s** | **0.91 s** | **240 ms** |
| 10,000 events | before | 8.96 s | 8.55 s | 1,084 ms |
| | **after** | **5.32 s** | **5.02 s** | **318 ms** |
| 25,000 events | before | 16.2 s | 14.9 s | 3,429 ms |
| | **after** | **12.7 s** | **11.6 s** | **618 ms** |

What changed:

- **Leaner list records.** The Wikipedia link, Wikidata classes and QID, date flags and coordinate source are only shown in an event's detail view, so they moved
  from the list file to the detail files. The list file went from 72 to 55 KB gzipped for the 571 events (-24%).
- **The list file is preloaded** from `index.html`, so it downloads alongside the JavaScript instead of after it.
- **Borders stored once.** OCHA's West Bank areas (2.9 MB of points, kept at full precision) were copied into each of the 2000, 2010 and 2020 decade files,
  and the map loads the shown decade plus its neighbours. Large geometries that span several decades are now one shared file; the borders the map draws
  are byte-for-byte the source's (checked for all 291 decade features). Total border data 11.8 MB -> 5.7 MB; the default view downloads the West Bank
  areas once instead of twice.
- **Timeline steps send the map only what changed.** Each step used to re-send every feature to MapLibre's worker (about 170 ms per step at 25,000 events
  on the throttled CPU). Now only the events entering or leaving the range are sent (`updateData`, `app/src/lib/sourceDiff.js`); a full replacement is
  still used when most features change (a search starts or ends). Checked in the browser: after every move the map holds exactly the events of the
  selected years, and the clusters it draws are identical to a full reload of the same data.
- **No re-sorting on timeline steps.** The browse list is in date order; the events are sorted once per data load and filtering keeps that order.
- **Decade chunks of events and `events/ids.json` removed.** They were only a fallback; the decade chunk guard (1 MB) would have failed the build at
  about 1,600 events in one decade.
- **Detail files grow in number, not size.** With a fixed 64 buckets, opening one event would have downloaded ~300 KB at 10,000 events; now ~70 KB.

## Limits, in the order the dataset reaches them

| At about | What happens | Guard | Next step |
|---|---|---|---|
| 5,000 events | the list file download dominates the first view on slow mobile connections (~1.5 s per 300 KB compressed) | - | split the snippets out of the list file (below) |
| 10,000 events | the list file passes 1 MB gzipped | **build fails** (`MAX_LITE_GZIP_BYTES` in `split-data.mjs`) | split the snippets out of the list file (below) |
| 15,000 events | 75% of the host's file limit | warning (`check-dist.mjs`) | plan the step below |
| 19,000 events | the host's limit of **20,000 files per deploy** (Cloudflare Workers static assets, free plan; 100,000 on the paid plan: https://developers.cloudflare.com/workers/platform/limits/) | **build check fails** (`check-dist.mjs`, `MAX_DIST_FILES`) | render `/event/<id>` pages on demand from a Worker reading the detail files, instead of one static file per event; or the paid plan |
| 20,000 events | `/event/` lists every event on one page (1.3 MB of HTML at 10,000) | - | split the index page by decade |
| 50,000 events | one `sitemap.xml` holds at most 50,000 URLs | - | a sitemap index |

**Splitting the snippets out of the list file.** The 160-character snippet is 62% of the compressed list file (78 bytes per event with brotli, 30 without
it). Loading it as a second file after the list would cut the critical download at 10,000 events from about 1 MB to about 300 KB. It was not done yet
because rows would grow when their snippet arrives (a visible jump), which is not worth it at today's size; it needs reserved row space and local search
that re-runs once snippets arrive.

Not limits: clustering runs in MapLibre's worker (supercluster takes 41 ms for 25,000 points unthrottled); range filtering is under 2 ms for 25,000 events
unthrottled; full-text search is chunked by Pagefind.

## Borders

Borders do not grow with events but are the largest download of the first view: the 2020 decade (the default) is ~150 KB plus the shared West Bank areas
(~480 KB with brotli). Encoding coordinates as integer deltas at 6 decimals would cut that by about 15% with brotli (half with gzip), but 1,296 source
points have more than 6 decimals, so it would round them (by at most ~5 cm). Borders are never simplified, and rounding them is the owner's call, so it is
not done; it is an option if border data becomes the bottleneck.

## Re-measuring

```
cd app
node scripts/scale-test/generate.mjs 10000 ../.scale-10k     # synthetic data, never shipped
ATLAS_DATA_DIR=../.scale-10k MAX_LITE_GZIP_BYTES=100000000 npm run build
node scripts/scale-test/serve.mjs dist 5101 &                # brotli, like the host
npm i --no-save playwright-core
BROWSER=msedge node scripts/scale-test/bench.mjs http://127.0.0.1:5101/ 10k   # or BROWSER=chrome
npm run build                                                # back to the real data
```
