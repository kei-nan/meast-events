// Recomputes data/selection-funnel.json (machine readable; rendered by the app's "About the data" page)
// from the repository's own data files - nothing is copied from the review documents.
//   node scripts/build-selection-funnel.js [--cache-dir=...]
// Inputs: data/event-candidates.json (raw discovery), data/enriched-candidates.json + data/events.proposed.json
// (enrichment result), data/events.json (curated, shown), data/seed-events.json, data/proposed-exclusions.json.
// Network: only to measure Wikipedia-editions-only sitelink counts (Wikidata wbgetentities, cached; see lib/cache.js).
import { readFile, writeFile } from "node:fs/promises";
import { openCache } from "./lib/cache.js";
import { fetchEntities } from "./lib/wd-entities.js";
import { INCLUSION_MIN_SITELINKS, EVENT_CLASSES, COUNTRIES, groupForEvent } from "./lib/event-classes.js";

const read = async (n) => JSON.parse(await readFile(new URL(`../data/${n}`, import.meta.url), "utf-8"));
const candidates = await read("event-candidates.json");
const enriched = await read("enriched-candidates.json");
const proposed = await read("events.proposed.json");
const curated = await read("events.json");
const seed = await read("seed-events.json");
const exclusions = await read("proposed-exclusions.json");

const MIN = INCLUSION_MIN_SITELINKS;
// Dated by its inputs, not the wall clock, so re-running on unchanged data gives an identical
// file: the newest retrieval time among the enriched candidates and the curated summaries.
const dataAsOf =
  [...enriched.map((e) => e.retrieved_at), ...curated.map((e) => e.extract_retrieved_at)].filter(Boolean).sort().at(-1) ?? null;
const inc = (o, k, n = 1) => (o[k] = (o[k] ?? 0) + n);
const group = Object.fromEntries(EVENT_CLASSES.map((c) => [c.label, c.category]));

// ---- sitelink measurement: all Wikimedia projects (what the rule uses) vs Wikipedia editions only ----
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

// ---- funnel ----
const enrichedByQid = new Map(enriched.map((e) => [e.wikidata_qid, e]));
const excludedIds = new Set(exclusions.map((x) => x.id));
const noEn = candidates.filter((c) => !c.has_en_wikipedia);
const lt10 = candidates.filter((c) => c.has_en_wikipedia && c.sitelinks < MIN);
const pass = candidates.filter((c) => c.has_en_wikipedia && c.sitelinks >= MIN);
const passAlready = pass.filter((c) => c.already_curated);
const curatedQids = new Set(curated.map((e) => e.wikidata_qid));
const seedCount = curated.filter((e) => e.sitelinks === undefined).length; // legacy curated events carry no discovery sitelinks
const candQids = new Set(candidates.map((c) => c.wikidata_qid));
const seedFound = curated.filter((e) => e.sitelinks === undefined && candQids.has(e.wikidata_qid)).length;
const proposedNoLoc = proposed.filter((e) => e.location_quality === "none");
const proposedDateFlagged = proposed.filter((e) => (e.date_flags ?? []).some((f) => f.startsWith("date_order_invalid")));
const dupExcluded = proposed.filter((e) => excludedIds.has(e.id));
const mergedDiscovered = curated.filter((e) => e.sitelinks !== undefined);
const pendingNew = proposed.filter((e) => !curatedQids.has(e.wikidata_qid) && !excludedIds.has(e.id));

const stages = [
  { stage: "raw_candidates", label: "Raw Wikidata candidates (23 event classes, 15 tracked countries, dated 1900+)", count: candidates.length },
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
    seed_events_not_reachable_by_discovery: seedCount - seedFound,
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
  bump(funnel.breakdowns.by_group, groupForEvent(c.wikidata_classes, group[(c.wikidata_classes ?? [])[0]] ?? c.category), c);
  bump(funnel.breakdowns.by_decade, `${Math.floor(Number(c.date_start.slice(0, 4)) / 10) * 10}s`, c);
}
funnel.breakdowns.notes = [
  "by_country: Wikidata's country tags from discovery (P17, or P17 of the P276/P131 place); a multi-country event counts once in every country, so rows do not sum to the total. Israel/Palestine is one combined tag in this project.",
  "by_class: an item matched by several classes counts in each; by_group uses the first matched class (our coarse grouping).",
  "in_curated counts candidates whose Wikidata item is in data/events.json now.",
];
funnel.tracked_countries = Object.keys(COUNTRIES);

await writeFile(new URL("../data/selection-funnel.json", import.meta.url), JSON.stringify(funnel, null, 2) + "\n");
console.log(JSON.stringify({ stages: stages.map((s) => [s.stage, s.count, s.removed]), proposed: funnel.proposed_breakdown, shown: funnel.shown_now, sitelinks: sitelinkMeasurement }, null, 1));
