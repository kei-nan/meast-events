# Scaling: how the site stays fast as events are added

The site is fully static: the browser downloads the data and does all filtering, searching and clustering itself. That keeps hosting free and simple,
but it means every event added costs every visitor something. This page says what grows with the number of events, where the limits are, what
guards them in the build, and what to do when one is reached. Numbers were measured on 2026-10-25 with 815 events (method at the end) unless dated otherwise.

## What a visitor downloads

| File | When | Grows with events? |
|---|---|---|
| `data/events/v.<version>/all.json` | on every page load, preloaded from `index.html` | **yes, linearly**: the lite record of every event (id, title, dates, countries, category, 160-character snippet, coordinates, location quality, Wikidata sitelink count, Wikidata aliases). 82 bytes per event with brotli, 105 with gzip (65 / 84 KB for 815 events) |
| `data/events/v.<version>/full/<bucket>.json` | when an event is opened | per bucket, no: at least 64 buckets, doubling as the dataset doubles, so a bucket holds at most about 32 events (~20 KB compressed) on average (`app/src/lib/fullBucket.js`) |
| `pagefind/v.<version>/*` | on the first search | the index is chunked by Pagefind (21 chunks for 815 events, 170 for 8,150); `ids.json` (~40 bytes per event) is loaded whole |
| `data/boundaries/v.<version>/<decade>.tbin`, `data/land.tbin` (binary geometry, `app/src/lib/geoCodec.js`) | when the map starts; `data/boundaries/shared/<hash>.tbin` (the West Bank Areas A/B/C) once zoomed in over them; `data/land-far.tbin` and the Middle East's 1:10m `data/land-cells/<cell>.tbin` (45 cells, 132 KB with brotli in all; the 35 all-land cells whose 1:10m land is exactly their light square have no file, 2026-10-27) once its first view has drawn - in view first, the rest in the background unless the visitor saves data | no (borders, not events) |
| `/event/<id>` | every visit to an event's link (it is the app, with the event's own title, preview tags and text) | one page per event: **counts against the host's file limit** |

Both `<version>`s are a hash of every file in their folder, so each folder is cached immutably through one rule (`app/public/_headers`,
`app/scripts/expand-headers.mjs`) and a page never mixes files from two builds. `data/events/meta.json` and `pagefind/meta.json` name the current
folders, for a page whose bundle is older than the deploy.

## Measured

Edge, headless, phone (Lighthouse's Moto G Power: 412x823, DPR 1.75, touch) with Lighthouse's mobile throttling: 150 ms round trip, 1.6 Mbps
down, CPU 4x slower; served with brotli by `app/scripts/scale-test/serve.mjs`. Median of 3 runs (`app/scripts/scale-test/bench.mjs`), 2026-10-25,
`origin/main` at `85ea0ad` plus the benchmark fixes below.

| Dataset | List file (brotli) | List shown | List file loaded | Data on first load | Blocking time, first 15 s | Blocking time, timeline 20 years |
|---|---|---|---|---|---|---|
| real (815 events) | 77 KB | 2.16 s | 1.22 s | 215 KB | 372 ms | 0 ms |
| 8,150 events, unique text (phone) | 672 KB | **7.79 s** | 6.92 s | 810 KB | 577 ms | 72 ms |
| 8,150 events, unique text (desktop 1280x800) | 672 KB | 7.50 s | 6.94 s | 810 KB | 669 ms | 220 ms |
| 8,150 events, copies (the old generator, phone) | 243 KB | 3.83 s | 3.04 s | 381 KB | 904 ms | 164 ms |

The list file decides the first view at 10x: at 8,150 events it is ~670 KB with brotli, and the first row shows about 1 s after it arrives.

**The old benchmark was too optimistic.** Its synthetic events were copies of the real ones with a suffix, and brotli replaces a repeated title or
snippet with a short back-reference: 8,150 copied events compressed to 176 KB (22 bytes per event, against 82 for the real events), so the earlier
"10,000 events: list shown 5.32 s" (2026-10-06) understated the list download about 3-fold. `generate.mjs` now writes new text for every synthetic
event (word chains drawn from the real titles, aliases and leads). It errs slightly the other way: 815 synthetic events compress to 99 bytes per
event against 82 for the real ones (brotli); 8,150 to 64 per event (the real set will also compress a little better per event as it grows). The
benchmark also used a desktop window (now `DEVICE=phone` by default, `DEVICE=desktop` for the old one), and its server did not compress the `.tbin`
geometry, which the host does (`app/public/_headers`, `/data/*.tbin`).

Earlier changes (measured 2026-10-06 on 571 events and the copied datasets, so their 10x numbers are optimistic as above): the list file lost the
fields only the detail view shows (72 -> 55 KB gzipped) and is preloaded from `index.html`; borders spanning several decades are stored once
(`data/boundaries/shared/`); timeline steps send MapLibre only the events entering or leaving the range (`app/src/lib/sourceDiff.js`); detail files
grow in number, not size.

## Limits, in the order the dataset reaches them

| At about | What happens | Guard | Next step |
|---|---|---|---|
| now | the list file is the largest download of the first view after the JavaScript (~1 s per 200 KB compressed on the throttled connection) | - | split the snippets and aliases out of the list file (below) |
| 2,000 events (fixed 2026-10-25) | the search index chunks no longer fit the host's 100 header rules, so every chunk revalidated on every visit | `expand-headers.mjs` warns | done: the whole index is one versioned folder, `pagefind/v.<version>/`, one rule at any size (32 rules in all at 815 and at 8,150 events, from 55) |
| 10,000 events (real text, 105 B/event gzip) | the list file passes 1 MB gzipped | **build fails** (`MAX_LITE_GZIP_BYTES` in `split-data.mjs`; the synthetic 8,150 already pass it, 1,062 KB) | split the snippets out of the list file (below) |
| 15,000 events | 75% of the host's file limit | warning (`check-dist.mjs`) | plan the step below |
| 19,000 events | the host's limit of **20,000 files per deploy** (Cloudflare Workers static assets, free plan; 100,000 on the paid plan: https://developers.cloudflare.com/workers/platform/limits/) | **build check fails** (`check-dist.mjs`, `MAX_DIST_FILES`) | render `/event/<id>` pages on demand from a Worker reading the detail files, instead of one static file per event; or the paid plan |
| 20,000 events | `/event/` lists every event on one page (1.3 MB of HTML at 10,000) | - | split the index page by decade |
| 50,000 events | one `sitemap.xml` holds at most 50,000 URLs | - | a sitemap index |

**Splitting the snippets and aliases out of the list file.** Of the list file's brotli bytes, the 160-character snippet is 55% and the aliases 8%
(815 real events; 47% and 9% for the 8,150 synthetic ones): without both, 29 instead of 82 bytes per event, about 230 KB instead of ~670 KB at
8,150 events. It is not done yet because both are used from the first view:

- every result row shows its snippet under the title (`ResultsList.jsx`), so rows would grow when snippets arrive (a visible jump);
- the local search matches and ranks titles, aliases and snippets (`localSearch.js`, `ranking.js`, `useEventSearch.js`) and a row names the alias a
  query matched, so a query typed before they arrive would rank differently and must re-run;
- the opened event shows the snippet until its full lead arrives (`App.jsx`).

The plan: `split-data.mjs` writes `events/v.<version>/text.json` (`{id: [snippet, aliases?]}`, in the same versioned folder, so it is cached and
versioned with `all.json`); `loadAllLite` resolves with the lite list as now and starts `text.json` right after it, merging `snippet` and `aliases`
into the same event objects when it arrives (so `ranking.js` and the rows keep reading `event.snippet` / `event.aliases`); rows reserve the
snippet's two lines until then; the search hook re-runs its current query once the text has merged. Worth doing when the list file passes about
300 KB with brotli (~3,500 events), where it adds about 1.5 s to the first view on the throttled phone.

Not limits: clustering runs in MapLibre's worker (supercluster takes 41 ms for 25,000 points unthrottled); range filtering is under 2 ms for 25,000 events
unthrottled; full-text search is chunked by Pagefind.

## Borders

Borders do not grow with events. All geometry together is 61 `.tbin` files, 1.30 MiB (0.76 MiB with brotli; 2026-10-27). The default view (2020) needs its
decade file, 36 KB with brotli (57 KB raw), plus the opening land (`land.tbin`, 33 KB with brotli); the neighbouring decades are prefetched. The
West Bank Areas A/B/C (`boundaries/shared/`, 202 KB with brotli) load only once zoomed in over them (zoom 7, `DEFERRED_GROUPS` in `split-data.mjs`).
The binary format stores coordinates as integers at 6 decimal places (about 10 cm, `app/src/lib/geoCodec.js`); borders are never simplified.

## Re-measuring

```
cd app
node scripts/scale-test/generate.mjs 8150 ../.scale-10k      # synthetic data, never shipped
ATLAS_DATA_DIR=../.scale-10k MAX_LITE_GZIP_BYTES=100000000 npm run build
node scripts/scale-test/serve.mjs dist 5101 &                # brotli, like the host
BROWSER=msedge node scripts/scale-test/bench.mjs http://127.0.0.1:5101/ 10k   # or BROWSER=chrome; DEVICE=desktop for a 1280x800 window
npm run build                                                # back to the real data
```

The list file's composition (bytes per field) was measured by compressing `all.json` with and without each field (Node's zlib, brotli quality 11,
gzip level 9); the geometry sizes the same way over every `.tbin` in `dist/data/`.
