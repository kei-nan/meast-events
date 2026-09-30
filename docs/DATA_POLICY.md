# Data policy

This project shows Wikipedia and Wikidata content **as-is**. Wikipedia has its own biases; the project's
principle is minimal interference with it, so that any bias visible on the site is Wikipedia's, in the open,
rather than a second layer of ours. Concretely:

- We **never rewrite** titles, extracts, dates, countries, or labels. `title`, `extract`, `date_start`, `date_end`,
  `countries` and `wikidata_classes` are copied from Wikipedia/Wikidata as returned. The only change made to text is
  whitespace normalisation of the extract (see "Extract").
- Automated checks only **flag** (a note in `review_reasons` or `date_flags`); they never overwrite, "correct" or
  silently drop an event on judgement of its content. The exceptions are the few individually verified fixes listed
  with evidence in `docs/data-fixes.md`.
- There is **no per-event editorial decision about content or inclusion**. What is included follows from the published rule below.
- We never invent coordinates and never edit Wikipedia or Wikidata.
- In addition, the project publishes a **separately labelled framing review** of each summary (`data/framing-review.json`: two separate
  reviews per summary, a labelled overall-fairness judgement of emphasis and omissions, and a wording check that quotes wording
  departing from Wikipedia's own neutrality and wording guidelines and names the guideline), produced by an AI model with the published method in
  `docs/framing-review.md`. There is no score and no verdict on which side a summary favours. It is our reading, not Wikipedia's and
  not a correction. It never alters, hides or reorders the extract, it is shown for every event (including those where nothing was
  found), and readers can contest it; re-reviews are recorded in the file's history. This is the one per-event judgement the project
  makes, and it is kept out of every Wikipedia/Wikidata field.

## What each field is

| Field | Content | Whose |
|---|---|---|
| `title`, `wikipedia_url` | English Wikipedia article title / URL | Wikipedia |
| `extract`, `extract_retrieved_at` | The **full lead section** (everything before the first heading) of the English article as plain text, and the date it was fetched | Wikipedia |
| `wikidata_classes` | ALL class labels of the Wikidata item, see below | Wikidata |
| `date_start`, `date_end` | Wikidata dates (P585 point in time, else P580 start; P582 end) | Wikidata |
| `countries` | Wikidata's country (P17, or P17 of the P276/P131 place), mapped to the 15 tracked names | Wikidata |
| `category`, `category_group` | A coarse grouping used for marker colours and the category filter (same value in both fields) | **ours** |
| `location_quality`, `coordinates` | `precise`, `approximate` or `none` | Wikipedia/Wikidata coordinates; the rule is ours |
| `date_flags`, `review_reasons`, `needs_review` | Advisory flags | ours (flags only) |

### Extract

Fetched with the MediaWiki API (`action=query&prop=extracts&exintro=1&explaintext=1&redirects=1`), i.e. all paragraphs of the lead as plain
text. Only whitespace is normalised (no-break spaces to plain spaces, runs of spaces collapsed, paragraphs separated by one blank line).
`snippet` (API/UI) is the first 160 characters of it. Length before and after the change for the 394 curated events: median 435 -> 1,207
characters, mean 476 -> 1,494, max 1,487 -> 5,481; 327 got longer, 66 were already the whole lead, 1 got shorter (Wikipedia rewrote the lead of the
Battle of Elli in between). The earlier text was mostly the first paragraph only. `extract_retrieved_at` says when the text was fetched, so it can be shown as "as of".

### Wikidata classes (`wikidata_classes`)

The labels (English) of **all** the item's `P31` (instance of) statements, in the order Wikidata's entity JSON lists them (deprecated-rank statements
excluded; a class without an English label shows its QID), followed - only if not already present - by the labels of the event classes discovery matched via
subclass (`P279*`) below. Nothing is de-duplicated by our preference, re-ordered, or replaced by our own label. For the 112 hand-picked (legacy) events
the classes come from live Wikidata too (for example Saddam Hussein: `human`, Fall of the Assad regime: `regime change`); the old labels such as "political"
or "war" that the curated file used to carry as if they were Wikidata's are gone. `category_label` is removed. Number of classes per event across the
594 events (curated + proposed): 1 class 320, 2: 165, 3: 68, 4: 30, 5: 7, 6: 4.

### Category (our grouping)

`category` is **our own coarse mapping**, not Wikidata's classification, and the UI labels it "Category (our grouping)". It is set by one rule applied to every
event (`groupForEvent` in `scripts/lib/event-classes.js`):

1. If any of the event's `wikidata_classes` is in the **terrorism** group (terrorist attack, hostage taking, aircraft hijacking), the category is terrorism.
2. Otherwise, if any is in the **atrocity** group (genocide, massacre, war crime), the category is atrocity.
3. Otherwise discovered events get the group of the **first event class discovery matched** (the order of the table below), and the 112 legacy events keep the
   group hand-assigned in `data/seed-events.json`.

Before 2026-09-28 steps 1-2 did not exist: an item Wikidata types as both a "massacre" and a "terrorist attack" was shown as "political" because "massacre"
happened to be checked first. A full review found that this ordering hid the "terrorist attack" type of 18 events, 16 of them attacks on Israelis
(October 7 and the kibbutz and Nova attacks among them), while events typed only "terrorist attack" by Wikidata kept that label whoever the perpetrator was.
The rule still passes Wikidata's typing through without judging it; the UI lists every Wikidata class next to our group.

| Wikidata class | QID | Our group |
|---|---|---|
| battle | Q178561 | war |
| war | Q198 | war |
| military operation | Q645883 | war |
| siege | Q188055 | war |
| treaty | Q131569 | treaty |
| armistice | Q107706 | treaty |
| coup d'état | Q45382 | political |
| assassination | Q3882219 | political |
| genocide | Q41397 | atrocity |
| massacre | Q3199915 | atrocity |
| war crime | Q135010 | atrocity |
| declaration of independence | Q1464916 | political |
| referendum | Q43109 | political |
| terrorist attack | Q2223653 | terrorism |
| hostage taking | Q1371150 | terrorism |
| aircraft hijacking | Q898712 | terrorism |
| revolution | Q10931 | uprising |
| rebellion | Q124734 | uprising |
| population transfer | Q15589476 | migration |
| ceasefire | Q208383 | diplomatic |
| peace conference | Q7157512 | diplomatic |
| embargo | Q989265 | economic |
| nationalization | Q178564 | economic |

## Inclusion rule

An event is **proposed** (written to `data/events.proposed.json`) if and only if all of these hold:

1. **Class.** Wikidata says it is an instance (`P31`, subclasses followed via `P279*`) of one of the event classes in the table above.
2. **Place.** It is located in one of the 15 tracked countries/territories, via `P17`, or `P276`/`P131` pointing at a place that has `P17` there.
   A place only counts when at least as many of the present-day sovereign states it lists (its `P17`) are inside the region as outside it
   (`placeIsMostlyInRegion` in `scripts/lib/v21.js`). Seas and regions that mostly belong to other countries - the Mediterranean (6 in, 16 out), Black Sea,
   Sahara, Sahel, North Africa, Gulf of Aden, Bab-el-Mandeb - lend no country. Historical predecessors such as the Ottoman Empire or Mandatory Palestine
   are not sovereign states today and count on neither side. The rule only removes country tags derived from such places (the 112 hand-picked
   events keep their hand-typed tags), and an event left with no tracked country is excluded (`data/proposed-exclusions.json`, 23 events on 2026-09-29).
3. **Time.** It has a date (`P585` point in time, else `P580` start time) from 1900 to the present.
4. **Significance.** Its Wikidata item has **at least 10 sitelinks** (`INCLUSION_MIN_SITELINKS`) and has an **English Wikipedia article**.
5. **Basic integrity.** Wikipedia returned a summary with a non-empty extract.

Since data shape v2.1 two former conditions are **gone**: events **without real coordinates** are included (with `location_quality: "none"`,
`coordinates: null`, no map marker, listed and searchable), and events whose Wikidata **dates are contradictory** (end before start) are included
with the dates as Wikidata gives them and a `date_flags` reason. Nothing is dropped for either reason any more. Events already in the curated
`data/events.json` are not re-proposed. Two proposed events were left out by review as redirect duplicates of an event already present
(`data/proposed-exclusions.json`, each with its reason).

### What "10 sitelinks" really counts

Earlier text said "10 Wikipedia language editions". That was wrong. The rule uses Wikidata's `wikibase:sitelinks`, which counts links to **all Wikimedia
projects** (Wikipedias, but also Wikisource, Wikiquote, Commons, Wikivoyage, ...). Measured on the current discovery candidates
(`node scripts/build-selection-funnel.js`, stored in `data/selection-funnel.json` under `sitelink_measurement`): of the 1,900 candidates with an English
article, **535** have 10+ sitelinks across all projects (what the rule uses) while **506** would pass if only Wikipedia language editions were counted;
29 events pass only thanks to non-Wikipedia sitelinks, and none pass by Wikipedia editions but fail by all projects. The median is 16 either way among passing events.
The rule stays as coded (all projects); the documentation now says so.

### Honest caveat: the rule itself is biased

"Objective" here means *mechanical and published*, not *neutral*:

- **Sitelinks count Wikimedia project pages, not importance.** Events that many communities write about (international, modern, English-speaking-world-relevant,
  or well covered by Western media) score high; events important locally or regionally but thinly covered score low. The threshold of 10 is a judgement call
  (roughly the median of the earlier 5+ candidate set), not a validated cutoff. Among events dropped for fewer than 10 sitelinks, 49% have more Arabic/Hebrew/Turkish/Persian
  editions than European ones (dataset-coverage review).
- **The class list is a choice.** Someone had to decide which Wikidata classes count as "events"; classes with many well-modelled items (battles, terrorist attacks)
  are over-represented against concepts Wikidata models loosely (diplomacy, elections, protests), so those are under-found.
- **Wikidata modelling is uneven.** Only events that some editor has typed with a class, dated and located in a tracked country are found at all. Multi-country events
  carry only the countries Wikidata lists.
- **English Wikipedia is required** for an extract, which biases toward what English Wikipedia covers.
- **The hand-picked seed list** (112 events, 61 of them not reachable by the rule) is our own selection and the only source of diplomatic and economic events.
- **Location is not required, but it changes visibility.** Events without coordinates are listed but have no marker; abstract and large-area events (wars, referendums,
  treaties) lack coordinates far more often than point-like ones.

The funnel from 2,539 raw candidates to what is shown, with breakdowns by country, class, group and decade, is machine readable in `data/selection-funnel.json`
(recomputed from the data files by `scripts/build-selection-funnel.js`, not copied from documents) so the app's About page can render it.

These biases are visible in the data; the project does not attempt to correct them, because a correction would be an editorial judgement of the very kind this policy avoids.
Bias in the wording of individual summaries is handled the same way: it is not corrected, but it is disclosed next to the text by the framing review (see `docs/framing-review.md`).

## Event classes

All QIDs were checked against the live Wikidata Query Service on 2026-09-26 (English label matches; instance counts are dated 1900+ in the tracked region,
before the sitelinks filter; "s>=10" is how many of those have 10+ sitelinks).

| Class | QID | Group | In region (transitive) | s>=10 |
|---|---|---|---|---|
| battle, war, military operation, treaty, coup d'état, assassination, genocide, massacre, terrorist attack, revolution, rebellion, population transfer | (original set, see `event-classes.js`) | | | |
| siege | Q188055 | war | 74 | 18 |
| war crime | Q135010 | atrocity | 131 | 19 |
| hostage taking | Q1371150 | terrorism | 16 | 5 |
| aircraft hijacking | Q898712 | terrorism | 9 | 4 |
| ceasefire | Q208383 | diplomatic | 10 | 5 |
| armistice | Q107706 | treaty | 3 | 2 |
| peace conference | Q7157512 | diplomatic | 3 | 2 |
| embargo | Q989265 | economic | 0 | 0 |
| nationalization | Q178564 | economic | 2 | 0 |
| declaration of independence | Q1464916 | political | 5 | 3 |
| referendum | Q43109 | political | 58 | 10 |

Two classes (embargo, nationalization) contribute nothing today; they are kept so events will be picked up if Wikidata editors add them. Considered and not added:
general strike (Q49775), prisoner exchange (Q2001775).

### Query robustness

Each class is queried separately. WDQS answers a class query that is too expensive with HTTP 504; the script then retries once with plain `P31` (no subclass expansion)
and logs that it did so. 429/5xx responses on the other Wikimedia APIs are retried with exponential backoff honouring `Retry-After`. Requests are sequential, delayed
and identify themselves with the `AtlasWiki` User-Agent (`AtlasWiki/0.1 (data pipeline; +https://github.com/kei-nan/atlas-wiki)`).

## Review flags (advisory only)

Each event may carry `review_reasons` (strings) and `date_flags`; none of them changes the data. The UI shows `date_flags` as "Date unverified: <reason>".

| Flag | Where | Meaning |
|---|---|---|
| `date_order_invalid` | `date_flags` | Wikidata's `date_end` is before `date_start` (5 events, e.g. Iraqi invasion of Kuwait: start 2009-08-02, end 1990-08-04). Kept, shown as Wikidata gives them. Validation downgrades the order error to a warning only when this flag is present. |
| `wikipedia_dates_note` | `date_flags` | NOTE next to a date-order error: the dates/years the article's lead mentions (`scripts/lib/v21.js`, `wikipediaDatesNote`). Informational; it never changes a date. |
| `date_start_year_not_in_lead` | `date_flags` | Start year is not within 1 year of any year in the full lead. A heuristic on prose: "look", not "wrong". |
| `date_source_adjusted` | `date_flags` | The discovery date came from an implausible P585; P580 was used instead (rule in `docs/data-fixes.md` F2, both values in the text). |
| `date_precision_coarse`, `unverified_date`, `category_year_mismatch` | `review_reasons` | Date precision coarser than a year; no year in the lead and no confirming year category; Wikipedia year categories disagree. |
| `title_differs_from_article` | `review_reasons` | Record title differs from the article title and does not appear in its lead. |
| `country_not_supported_by_wikidata`, `country_via_place_only` | `review_reasons` | Tracked country tag cannot be derived from Wikidata P17/P276/P131, or comes only from a place while the item's own P17 is another sovereign state. |
| `coordinate_far_from_countries` | `review_reasons` | Real coordinates more than 1,500 km from every tagged country's reference point. |
| `many_countries` | `review_reasons` | More than 4 countries tagged. All are kept as Wikidata lists them. |
| `part_of` | `review_reasons` | Wikidata `P361` says the event is part of a larger event. |
| `possible_duplicate` | `review_reasons` | Hint that another event may be the same (shared QID, same normalised title, or similar title + date within 1 year + nearby). Nothing is dropped automatically. |
| `qid_mismatch` | `review_reasons` | The Wikipedia title resolved to a different Wikidata item than discovery found. |
| `data_fix Fn` | `review_reasons` | A verified fix from `docs/data-fixes.md` was applied to this event. |

## Location quality

- `precise`: coordinates from the English Wikipedia article or the item's Wikidata `P625` (`coordinate_source` = `wikipedia` / `wikidata` / `manual-override`).
- `approximate`: curated events whose `coordinate_source` starts with `country-fallback` are pinned at a capital (80 events, unchanged behaviour). They are labelled
  "approximate location" and excluded from drawn-area searches.
- `none`: no real location known. `coordinates: null`, `coordinate_source: null`. The event is listed and searchable but has no map marker and never matches an area/bbox query.
  Discovered events never get a capital-fallback pin any more. Currently 1 curated event (Arab Spring) and 197 proposed events.
- Validation (`scripts/lib/validate.js`): coordinates are required unless `location_quality` is `none` (then they must be `null`).
- `data/missing-coordinates-report.md` lists every curated and candidate event lacking a precise location, sorted by sitelinks, with Wikipedia and Wikidata links, so
  contributions can be made upstream (Wikidata `P625`).

## Pipeline and workflow

```
node scripts/discover-events.js [--classes=Q...,Q...]   # WDQS -> data/event-candidates.json (bounded runs merge)
node scripts/enrich-candidates.js [--reuse] [--limit=N] # -> data/enriched-candidates.json, data/events.proposed.json,
                                                        #    data/missing-coordinates-report.md   (full lead, classes, flags)
node scripts/apply-v21.js [--apply]                     # one-off: brings data/events.json + app copy to shape v2.1 (idempotent)
node scripts/refresh-extracts.js [--apply] [--proposed] # quarterly lead refresh, see below
node scripts/build-selection-funnel.js                  # -> data/selection-funnel.json
node scripts/lib/verify-sample.js                       # -> data/import-verification-sample.md
node scripts/validate-events.js                         # schema/ids/dates/coordinates (runs in CI)
node scripts/merge-proposed.js [--apply]                # dry-run by default; --apply writes data/events.json
```

Network scripts cache fetched data outside the repo (`ATLAS_CACHE_DIR` or `--cache-dir=`, default: OS temp dir), so an interrupted run resumes.

Pipeline output never touches `data/events.json`. Only an explicit `merge-proposed.js --apply` run by a person does (the one-off `apply-v21.js` and
`refresh-extracts.js --apply` are the other two, both deliberate, and both keep the app copy byte-identical). `validate-events.js` checks format and internal
consistency only (ids `[a-z0-9-]+`, unique ids and QIDs, real calendar dates within 1000-3000, `date_end >= date_start` unless `date_flags` explains it, coordinates
present unless `location_quality` is `none`, `wikidata_classes` array, `extract_retrieved_at` date, no `category_label`, non-empty extract); it never judges content.

## Refreshing extracts (monthly, automatic)

Wikipedia leads change (for example the Fall of the Assad regime lead moved from "1971" to "1970" within two weeks). The **Refresh Wikipedia summaries** workflow
(`.github/workflows/refresh-data.yml`) runs on the 1st of each month, and on demand from the Actions tab ("Run workflow"):

1. It runs `node scripts/refresh-extracts.js --apply`, which re-fetches every lead uncached. Only leads whose text changed are updated, with
   `extract_retrieved_at` set to that day; unchanged events are not touched, so the diff contains only real changes.
2. If nothing changed, it stops. Otherwise it validates the events, runs the unit tests and opens a pull request whose description lists, for each changed lead,
   the removed and added sentences. It never merges.
3. **Before merging**, read those sentences. Changes in wording are Wikipedia's; the point of reading is to spot vandalism or a lead that was rewritten wholesale.
4. After merging, the site rebuilds itself; run `npm run load-redis` so search uses the new text. The framing review of each changed summary shows "may no longer
   apply" until it is re-reviewed.

To run it by hand instead: `node scripts/refresh-extracts.js --report=refresh-report.md` (dry run, default, writes nothing), then add `--apply` to write the changes.
Add `--proposed` to also refresh `data/events.proposed.json`.

## Licensing of the source data

Wikipedia text is CC BY-SA 4.0; Wikidata is CC0. See `data/LICENSE` and `NOTICE`.
