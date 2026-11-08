// Recomputes data/selection-funnel.json (machine readable; rendered by the app's "About the data" page)
// from the repository's own data files - nothing is copied from the review documents.
//   node scripts/build-selection-funnel.js [--cache-dir=...]
//   node scripts/build-selection-funnel.js --check   no network: recompute everything except sitelink_measurement (kept
//                                                    from the committed file) and exit 1 if the file differs (CI)
//   node scripts/build-selection-funnel.js --offline no network: the same recomputation as --check, written to the file
//                                                    (the monthly refresh, after leads or titles changed)
// Inputs: data/event-candidates.json (raw discovery), data/enriched-candidates.json + data/events.proposed.json
// (enrichment result), data/events.json (curated, shown), data/seed-events.json, data/proposed-exclusions.json.
// Network: only to measure Wikipedia-editions-only sitelink counts (Wikidata wbgetentities, cached; see lib/cache.js).
import { readFile, writeFile } from "node:fs/promises";
import { openCache } from "./lib/cache.js";
import { matchExclusions } from "./lib/exclusions.js";
import { fetchEntities } from "./lib/wd-entities.js";
import { INCLUSION_MIN_SITELINKS, COUNTRIES, EVENT_CLASSES, groupForEvent } from "./lib/event-classes.js";

const read = async (n) => JSON.parse(await readFile(new URL(`../data/${n}`, import.meta.url), "utf-8"));
const candidates = await read("event-candidates.json");
const enriched = await read("enriched-candidates.json");
const proposed = await read("events.proposed.json");
const curated = await read("events.json");
const seed = await read("seed-events.json");
const exclusions = await read("proposed-exclusions.json");

const MIN = INCLUSION_MIN_SITELINKS;
const CHECK = process.argv.includes("--check");
const OFFLINE = CHECK || process.argv.includes("--offline");
const OUT = new URL("../data/selection-funnel.json", import.meta.url);
const committed = OFFLINE ? await readFile(OUT, "utf-8").catch(() => "") : null;
// Dated by its inputs, not the wall clock, so re-running on unchanged data gives an identical
// file: the newest retrieval time among the enriched candidates and the curated summaries.
const dataAsOf =
  [...enriched.map((e) => e.retrieved_at), ...curated.map((e) => e.extract_retrieved_at)].filter(Boolean).map((d) => d.slice(0, 10)).sort().at(-1) ?? null;
const inc = (o, k, n = 1) => (o[k] = (o[k] ?? 0) + n);

// ---- sitelink measurement: all Wikimedia projects (what the rule uses) vs Wikipedia editions only ----
// The only part that needs the network; --check and --offline keep the committed block.
async function measureSitelinks() {
  const ents = await fetchEntities(candidates.map((c) => c.wikidata_qid), {
    cache: openCache("entities"),
    props: "sitelinks/urls",
    log: (m) => process.stdout.write(`\r${m}      `),
  });
  console.log();
  const ruleSitelinks = (c) => c.sitelinks; // from the discovery query: wikibase:sitelinks = all Wikimedia projects
  const wpEditions = (c) => ents.get(c.wikidata_qid)?.wikipedia_editions ?? null;
  const measured = candidates.filter((c) => wpEditions(c) !== null);
  const withEn = measured.filter((c) => c.has_en_wikipedia);
  const sitelinkMeasurement = {
    rule_uses: "sitelinks across ALL Wikimedia projects (Wikidata wikibase:sitelinks: Wikipedias + Wikisource, Wikiquote, Commons, ...)",
    threshold: MIN,
    candidates_measured: measured.length,
    candidates_with_english_article: withEn.length,
    pass_by_all_projects: withEn.filter((c) => ruleSitelinks(c) >= MIN).length,
    pass_by_wikipedia_editions_only: withEn.filter((c) => wpEditions(c) >= MIN).length,
    pass_by_all_projects_but_not_wikipedia_only: withEn.filter((c) => ruleSitelinks(c) >= MIN && wpEditions(c) < MIN).length,
    pass_by_wikipedia_only_but_not_all_projects: withEn.filter((c) => ruleSitelinks(c) < MIN && wpEditions(c) >= MIN).length,
    median_all_projects_of_passing: null,
    median_wikipedia_editions_of_passing: null,
    mismatch_between_discovery_sitelinks_and_fresh_count: withEn.filter((c) => (ents.get(c.wikidata_qid)?.sitelinks_all ?? c.sitelinks) !== c.sitelinks).length,
  };
  const med = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const passing = withEn.filter((c) => ruleSitelinks(c) >= MIN);
  sitelinkMeasurement.median_all_projects_of_passing = med(passing.map(ruleSitelinks));
  sitelinkMeasurement.median_wikipedia_editions_of_passing = med(passing.map(wpEditions));
  return sitelinkMeasurement;
}
const sitelinkMeasurement = OFFLINE ? (JSON.parse(committed || "{}").sitelink_measurement ?? null) : await measureSitelinks();
if (OFFLINE && !CHECK && !sitelinkMeasurement) {
  console.error("FAIL --offline keeps the committed sitelink_measurement, and data/selection-funnel.json has none: run without --offline");
  process.exit(1);
}

// ---- funnel ----
const enrichedByQid = new Map(enriched.map((e) => [e.wikidata_qid, e]));
// The proposed events left out by review, matched by id or wikidata_qid as merge-proposed.js does.
const excludedIds = matchExclusions(exclusions, proposed).excludedIds;
const noEn = candidates.filter((c) => !c.has_en_wikipedia);
const lt10 = candidates.filter((c) => c.has_en_wikipedia && c.sitelinks < MIN);
const pass = candidates.filter((c) => c.has_en_wikipedia && c.sitelinks >= MIN);
const curatedQids = new Set(curated.map((e) => e.wikidata_qid));
// Passing candidates that were not enriched because they are curated: checked against data/events.json QIDs (as
// enrich-candidates.js selects, lib/enrich-run.js withoutCurated), not the candidate's stored already_curated flag,
// which discover-events.js --predecessors-only never refreshes. Not in enriched-candidates.json, so the enrichment
// stage's count (enriched + these) does not count an event merged after its enrichment twice.
const passAlready = pass.filter((c) => curatedQids.has(c.wikidata_qid) && !enrichedByQid.has(c.wikidata_qid));
const seedCount = curated.filter((e) => e.sitelinks === undefined).length; // legacy curated events carry no discovery sitelinks
const candQids = new Set(candidates.map((c) => c.wikidata_qid));
const seedFound = curated.filter((e) => e.sitelinks === undefined && candQids.has(e.wikidata_qid)).length;
// Of those, the ones whose hand-typed countries are not the set discovery derived from Wikidata (About the data cites it).
const candByQid = new Map(candidates.map((c) => [c.wikidata_qid, c]));
const countrySet = (a) => JSON.stringify([...new Set(a ?? [])].sort());
const seedOtherCountries = curated.filter(
  (e) => e.sitelinks === undefined && candByQid.has(e.wikidata_qid) && countrySet(e.countries) !== countrySet(candByQid.get(e.wikidata_qid).countries)
).length;
// Hand-picked start dates that are none of the item's Wikidata P585/P580 values (About the data cites both counts).
// No network: the comparison is the one the pipeline already made and stored. A seed event's `date_precision` is
// written only from the P585/P580 statement whose value IS its date_start (lib/fixes.js keptDatePrecision: equal,
// or equal after Wikidata's "-00" month/day becomes "-01", so 1920-01-01 is the year-precision value 1920), by
// enrich-seed.js (live Wikidata, 2026-10-24) and the date refresh of 2026-10-30 (docs/data-fixes.md). So a seed
// without one has a start that matched none of those values; so has a seed whose `date_precision` comes from the
// fix ledger's F14 instead (lib/fixes.js; applying it adds the review note "data_fix F14: ..."), the dates the
// English article states to the day (checked against the article, the sentence's sub-count). A later change on
// Wikidata is listed by the monthly drift report, not written here.
const isF14 = (e) => (e.review_reasons ?? []).some((r) => String(r).startsWith("data_fix F14:"));
const seedStartNotWikidata = curated.filter((e) => e.sitelinks === undefined && (e.date_precision == null || isF14(e)));
const proposedNoLoc = proposed.filter((e) => e.location_quality === "none");
const proposedDateFlagged = proposed.filter((e) => (e.date_flags ?? []).some((f) => f.startsWith("date_order_invalid")));
const dupExcluded = proposed.filter((e) => excludedIds.has(e.id));
const mergedDiscovered = curated.filter((e) => e.sitelinks !== undefined);
const pendingNew = proposed.filter((e) => !curatedQids.has(e.wikidata_qid) && !excludedIds.has(e.id));

const stages = [
  { stage: "raw_candidates", label: `Raw Wikidata candidates (${EVENT_CLASSES.length} event classes, ${Object.keys(COUNTRIES).length} tracked countries, dated 1900+)`, count: candidates.length },
  { stage: "english_article", label: "Has an English Wikipedia article", count: candidates.length - noEn.length, removed: noEn.length, removed_by_reason: { no_english_article: noEn.length } },
  { stage: "sitelinks", label: `At least ${MIN} sitelinks (all Wikimedia projects)`, count: pass.length, removed: lt10.length, removed_by_reason: { fewer_than_min_sitelinks: lt10.length } },
  {
    stage: "enrichment",
    label: "Resolved against Wikipedia + Wikidata and proposed (already-curated items are not re-proposed)",
    count: enriched.length + passAlready.length,
    removed: 0,
    removed_by_reason: {},
    note:
      "Since data shape v2.1 no candidate is removed here for lacking coordinates or for a Wikidata date-order error; they are kept and flagged.",
    of_which: {
      already_curated_seed_events_found_by_discovery: passAlready.length,
      enriched_and_proposed: enriched.length,
    },
  },
];

const funnel = {
  data_as_of: dataAsOf,
  generated_by: "node scripts/build-selection-funnel.js (recomputed from data/*.json; not copied from documents)",
  rule: `Wikidata class in the event-class list; located in a tracked country; dated 1900+; English article and >= ${MIN} sitelinks (all Wikimedia projects). See docs/DATA_POLICY.md.`,
  stages,
  proposed_breakdown: {
    proposed_total: proposed.length,
    location_quality_none_no_map_marker: proposedNoLoc.length,
    date_order_invalid_flagged_and_kept: proposedDateFlagged.length,
    excluded_as_redirect_duplicates_by_review: dupExcluded.length,
    already_merged_into_curated: proposed.filter((e) => curatedQids.has(e.wikidata_qid)).length,
    pending_merge_new_events: pendingNew.length,
    pending_merge_new_events_without_location: pendingNew.filter((e) => e.location_quality === "none").length,
    hard_excluded_no_wikipedia_summary_or_extract: enriched.filter((e) => e.exclusion_reason).length,
  },
  shown_now: {
    curated_total: curated.length,
    seed_events_hand_picked: seedCount,
    seed_events_also_found_by_discovery: seedFound,
    seed_events_found_with_other_countries_than_wikidata: seedOtherCountries,
    seed_events_not_reachable_by_discovery: seedCount - seedFound,
    seed_start_dates_none_of_wikidata_values: seedStartNotWikidata.length,
    seed_start_dates_none_of_wikidata_values_checked_against_article: seedStartNotWikidata.filter(isF14).length,
    discovered_events_merged: mergedDiscovered.length,
    location_quality: curated.reduce((o, e) => (inc(o, e.location_quality), o), {}),
    seed_file_entries: seed.length,
  },
  sitelink_measurement: sitelinkMeasurement,
  breakdowns: { by_country: {}, by_class: {}, by_group: {}, by_decade: {} },
};

// ---- breakdowns (multi-country events count once per tag) ----
const blank = () => ({ raw: 0, no_english_article: 0, fewer_than_min_sitelinks: 0, passed_filters: 0, proposed_location_none: 0, date_order_flagged: 0, in_curated: 0 });
const bump = (bucket, key, c) => {
  const b = (bucket[key] ??= blank());
  b.raw++;
  if (!c.has_en_wikipedia) b.no_english_article++;
  else if (c.sitelinks < MIN) b.fewer_than_min_sitelinks++;
  else {
    b.passed_filters++;
    const e = enrichedByQid.get(c.wikidata_qid);
    if (e?.location_quality === "none") b.proposed_location_none++;
    if ((e?.date_flags ?? []).some((f) => f.startsWith("date_order_invalid"))) b.date_order_flagged++;
  }
  if (curatedQids.has(c.wikidata_qid)) b.in_curated++;
};
for (const c of candidates) {
  for (const k of c.countries) bump(funnel.breakdowns.by_country, k, c);
  for (const k of c.wikidata_classes ?? []) bump(funnel.breakdowns.by_class, k, c);
  bump(funnel.breakdowns.by_group, groupForEvent(c.wikidata_classes), c);
  bump(funnel.breakdowns.by_decade, `${Math.floor(Number(c.date_start.slice(0, 4)) / 10) * 10}s`, c);
}
funnel.breakdowns.notes = [
  "by_country: Wikidata's country tags from discovery (P17, or P17 of the P276/P131 place); a multi-country event counts once in every country, so rows do not sum to the total. Israel/Palestine is one combined tag in this project.",
  "by_class: an item matched by several classes counts in each; by_group uses the first matched class (our coarse grouping).",
  "in_curated counts candidates whose Wikidata item is in data/events.json now.",
];
funnel.tracked_countries = Object.keys(COUNTRIES);

// ---- coverage of what is shown (data/events.json), offline: counts only, nothing judged ----
const MANY = 8; // the validator's MANY_COUNTRIES_WARN: region-wide events (world wars, regional conflicts) carry 8-15 tags
const sortedCounts = (o, byKey = false) =>
  Object.fromEntries(Object.entries(o).sort((a, b) => (byKey ? a[0].localeCompare(b[0]) : b[1] - a[1] || a[0].localeCompare(b[0]))));
const countBy = (events, keysOf) => {
  const o = {};
  for (const e of events) for (const k of keysOf(e)) inc(o, k);
  return o;
};
const many = curated.filter((e) => (e.countries ?? []).length >= MANY);
const economic = curated.filter((e) => e.category === "economic");
funnel.coverage = {
  scope: "Events shown on the site (data/events.json). An event tagged with several countries counts once in each.",
  shown_total: curated.length,
  by_country: sortedCounts(countBy(curated, (e) => e.countries ?? [])),
  events_tagged_with_8_or_more_countries: many.length,
  by_country_without_events_tagged_with_8_or_more_countries: sortedCounts(
    countBy(curated.filter((e) => (e.countries ?? []).length < MANY), (e) => e.countries ?? [])
  ),
  by_decade: sortedCounts(countBy(curated, (e) => [`${Math.floor(Number(e.date_start.slice(0, 4)) / 10) * 10}s`]), true),
  by_category: sortedCounts(countBy(curated, (e) => [e.category])),
  economic_events: {
    total: economic.length,
    from_hand_picked_list: economic.filter((e) => e.sitelinks === undefined).length,
    titles: economic.map((e) => e.title),
  },
  notes: [
    `"regional" is a hand-assigned tag of a few hand-picked events that concern the whole region; it is not a country.`,
    `by_country_without_events_tagged_with_8_or_more_countries: the same count leaving out the ${many.length} events tagged with ${MANY} or more countries (world wars, region-wide conflicts), which otherwise count in each of their 8 to 15 countries.`,
    "by_decade: the decade of the event's start date. by_category: our coarse grouping (docs/DATA_POLICY.md, Category), the same rule for hand-picked and discovered events.",
  ],
};

const text = JSON.stringify(funnel, null, 2) + "\n";
if (CHECK) {
  if (committed.replace(/\r\n/g, "\n") !== text) {
    console.error("FAIL data/selection-funnel.json is stale: run node scripts/build-selection-funnel.js and commit the result");
    process.exit(1);
  }
  console.log(`ok   data/selection-funnel.json is current (curated_total ${curated.length}; sitelink_measurement not re-measured)`);
  process.exit(0);
}
await writeFile(OUT, text);
console.log(JSON.stringify({ stages: stages.map((s) => [s.stage, s.count, s.removed]), proposed: funnel.proposed_breakdown, shown: funnel.shown_now, sitelinks: sitelinkMeasurement }, null, 1));
