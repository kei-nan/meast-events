# atlas.wiki data policy

atlas.wiki shows Wikipedia and Wikidata content **as-is**. Wikipedia has its own biases; the project's
principle is minimal interference with it, so that any bias visible on atlas.wiki is Wikipedia's, in the open,
rather than a second layer of ours. Concretely:

- We **never rewrite** titles, extracts, dates, countries, or labels. `title`, `extract`, `date_start`, `date_end`
  and `countries` are copied from Wikipedia/Wikidata exactly as returned.
- Automated checks only **flag** (they add a note in `review_reasons`); they never overwrite, "correct" or
  silently drop an event on judgement of its content.
- There is **no per-event editorial decision**. What is included follows from the published rule below.
- `category` is Wikidata's own class label for the item (for example "battle", "siege", "referendum"), presented
  as Wikidata's classification, not as an atlas.wiki opinion. (`category_group` keeps the older coarse grouping,
  war/political/treaty/..., purely so the map can colour markers.)
- We never invent coordinates and never edit Wikipedia or Wikidata.

## Inclusion rule

An event is **proposed** (written to `data/events.proposed.json`) if and only if all of these hold:

1. **Class.** Wikidata says it is an instance (`P31`, subclasses followed via `P279*`) of one of the event classes
   in `scripts/lib/event-classes.js` (table below).
2. **Place.** It is located in one of the 15 tracked countries/territories, via `P17`, or `P276`/`P131` pointing at
   a place that has `P17` there.
3. **Time.** It has a date (`P585` point in time, else `P580` start time) from 1900 to the present.
4. **Significance.** Its Wikidata item has **at least 10 sitelinks** (`INCLUSION_MIN_SITELINKS`) and has an
   **English Wikipedia article**.
5. **Real coordinates.** Its location comes from the English Wikipedia article's coordinates or the item's Wikidata
   `P625`. Events that have only a country-capital fallback pin, or no location at all, are **excluded** from the
   proposal and listed in `data/missing-coordinates-report.md`.
6. **Basic integrity.** Wikipedia returned a summary with a non-empty extract, and the item's own dates are not
   contradictory (`date_end` not before `date_start`). Events failing this are also not proposed; each is
   recorded with its `exclusion_reason` in `data/enriched-candidates.json`.

Everything else about an event (its flags) is advisory. Events that are already in the curated
`data/events.json` are not re-proposed.

### Honest caveat: the rule itself is biased

"Objective" here means *mechanical and published*, not *neutral*:

- **Sitelinks count language editions, not importance.** Events that many Wikipedia communities write about
  (international, modern, English-speaking-world-relevant, or well covered by Western media) score high;
  events important locally or regionally but thinly covered score low. The threshold of 10 is a judgement call
  (it was chosen as roughly the median of the earlier 5+ candidate set), not a validated cutoff.
- **The class list is a choice.** Someone had to decide which Wikidata classes count as "events"; there is no
  neutral list. Classes with many well-modelled items (battles, terrorist attacks) are over-represented against
  concepts Wikidata models loosely (diplomacy, economics, social movements), so those are under-found.
- **Wikidata modelling is uneven.** Only events that some editor has typed with a class, dated and located in
  one of the tracked countries are found at all. Multi-country events carry only the countries Wikidata lists.
- **English Wikipedia is required** for an extract, which biases toward what English Wikipedia covers.
- **Coordinates are required**, which biases against abstract events (treaties, embargoes, declarations) that
  lack a `P625`. The missing-coordinates report exists so that gap can be closed upstream rather than papered
  over here.

These biases are visible in the data; the project does not attempt to correct them, because a correction would be
an editorial judgement of the very kind this policy avoids.

## Event classes

All QIDs were checked against the live Wikidata Query Service on 2026-09-26 (English label matches; instance counts
are dated 1900+ in the tracked region, before the sitelinks filter; "s>=10" is how many of those have 10+ sitelinks).

| Class | QID | Group | In region (transitive) | s>=10 |
|---|---|---|---|---|
| battle, war, military operation, treaty, coup d'état, assassination, genocide, massacre, terrorist attack, revolution, rebellion, population transfer | (original set, see `event-classes.js`) | | | |
| siege | Q188055 | war | 74 | 18 |
| war crime | Q135010 | political | 131 | 19 |
| hostage taking | Q1371150 | terrorism | 16 | 5 |
| aircraft hijacking | Q898712 | terrorism | 9 | 4 |
| ceasefire | Q208383 | diplomatic | 10 | 5 |
| armistice | Q107706 | treaty | 3 | 2 |
| peace conference | Q7157512 | diplomatic | 3 | 2 |
| embargo | Q989265 | economic | 0 | 0 |
| nationalization | Q178564 | economic | 2 | 0 |
| declaration of independence | Q1464916 | political | 5 | 3 |
| referendum | Q43109 | political | 58 | 10 |

Two classes (embargo, nationalization) contribute nothing today; they are kept so events will be picked up if Wikidata
editors add them. Considered and not added: general strike (Q49775, 6 in region, 0 with 10+ sitelinks), prisoner
exchange (Q2001775, 5 / 1). The diplomatic and economic gap is therefore only partly closed: Wikidata holds few
such items for this region, and the curated list (`data/events.json`) remains the main source for them.

### Query robustness

Each class is queried separately. WDQS answers a class query that is too expensive with HTTP 504; the script then
retries once with plain `P31` (no subclass expansion) and logs that it did so. (Not retried with the same query:
a 504 is a deterministic timeout.) 429/5xx responses on the other Wikimedia APIs are retried with exponential
backoff honouring `Retry-After`. Requests are sequential, delayed (1.5 s between WDQS queries, 0.3 s between
Wikipedia/Wikidata calls) and identify themselves with the `AtlasWiki` User-Agent.

## Review flags (advisory only)

Each proposed event has `needs_review` and `review_reasons`. None of these change the data.

| Flag | Meaning |
|---|---|
| `date_precision` field | Wikidata's time precision for the event date (`year`, `month`, `day`, ...), read from the statement's `precision`. Replaces the earlier "date is Jan 1" heuristic. |
| `date_precision_coarse` | Precision coarser than a year (decade, century). |
| `date_order_invalid` | Hard flag: `date_end` before `date_start` in Wikidata. Such events are **not proposed** (they fail validation) and are listed in `enriched-candidates.json`. |
| `date_year_mismatch`, `date_end_year_mismatch` | Start/end year not found (within 1 year) among years in the Wikipedia extract. |
| `unverified_date` | No year appears in the extract and Wikipedia's year categories do not confirm the start year, so the date could not be cross-checked. |
| `category_year_mismatch` | Wikipedia's (non-hidden) year categories, e.g. "1990 in Kuwait", exist but none is within 1 year of the event's dates. |
| `coordinate_far_from_countries` | Real coordinates more than 1,500 km from every tagged country's reference point. |
| `many_countries` | More than 4 countries tagged. All are kept as Wikidata lists them. |
| `part_of` | Wikidata `P361` says the event is part of a larger event (the label is shown). |
| `possible_duplicate` | Hint that another event (proposed or curated) may be the same: shared QID / resolved QID, same normalised title, or similar title with date within 1 year and nearby or same country. Nothing is ever dropped automatically. |
| `qid_mismatch` | The Wikipedia title resolved to a different Wikidata item than discovery found. |

The year checks are heuristics on prose and categories: a flag means "look", not "wrong".

## Location quality

- `coordinate_source` is `wikipedia` or `wikidata` for proposed events, so `location_quality` is `precise`.
- Curated events in `data/events.json` whose `coordinate_source` starts with `country-fallback` are pinned at a
  capital and are `approximate`. They are still shown but labelled as approximate and excluded from drawn-area
  searches. Events with no coordinates are not shown.
- `data/missing-coordinates-report.md` lists every curated and candidate event lacking a precise location, sorted by
  sitelinks, with Wikipedia and Wikidata links, so contributions can be made upstream (Wikidata `P625`).

## Pipeline and workflow

```
node scripts/discover-events.js [--classes=Q...,Q...]   # WDQS -> data/event-candidates.json (bounded runs merge)
node scripts/enrich-candidates.js [--reuse] [--limit=N] # -> data/enriched-candidates.json, data/events.proposed.json,
                                                        #    data/missing-coordinates-report.md
node scripts/lib/verify-sample.js                       # -> data/import-verification-sample.md
node scripts/validate-events.js                         # schema/ids/dates/coordinates (runs in CI)
node scripts/merge-proposed.js [--apply]                # dry-run by default; --apply writes data/events.json AND app/src/data/events.json
```

Pipeline output never touches `data/events.json`. Only an explicit `merge-proposed.js --apply` run by a person does.
`validate-events.js` checks format and internal consistency only (ids `[a-z0-9-]+`, unique ids and QIDs, real calendar
dates within 1000-3000, `date_end >= date_start`, numeric in-range coordinates, non-empty extract); it never judges
content. One known pre-existing duplicate in the curated file (`Q2429253`, "Islamic State of Iraq and the Levant" and
"Islamic State" resolve to the same article) is allow-listed as a warning until the owner decides.

## Licensing of the source data

Wikipedia text is CC BY-SA 4.0; Wikidata is CC0. See `data/LICENSE` and `NOTICE`.
