// Wikidata-driven event discovery: surfaces CANDIDATE historical events for human
// review, as a scalable alternative to hand-picking data/seed-events.json entries
// one at a time (which is what data/seed-events.json currently is - a ~114-item
// proof of concept, not comprehensive coverage).
//
// This script does NOT write to seed-events.json or events.json - those are the
// "approved" files and this project's standard is human review before anything
// goes live. This writes data/event-candidates.json: a longer, ranked, and
// honestly-labeled list for a person to skim, cross-check, and selectively copy
// entries out of into seed-events.json by hand.
//
// APPROACH
// For each of a fixed set of Wikidata event classes (battle, war, treaty, coup
// d'état, revolution, rebellion/uprising, massacre, terrorist attack, assassination,
// military operation, genocide, population transfer - see EVENT_CLASSES below), this
// queries query.wikidata.org's SPARQL endpoint for instances (P31, generalized to
// subclasses via P279*) that are located in one of this project's tracked countries,
// with a date (P585 point-in-time, or P580 start time) in 1900-present.
//
// "Located in" is a real modeling headache in Wikidata for historical events: there
// is no one property reliably filled in. This queries three paths and unions them -
// P17 (country) directly on the event; P276 (location) pointing at a place that
// itself has P17 set; and P131 (located in the administrative entity) likewise. Any
// one of the three is accepted. This still misses events whose only location data is
// further removed (e.g. only a village is recorded, and the village's own P131 chain
// to a country is more than one hop) - see LIMITATIONS at the bottom of this file.
//
// Each event class is queried in a SEPARATE request, not combined into one VALUES
// list. This was the single most important lesson from iterating against the live
// endpoint: combining even two classes' P31/P279* subclass-of expansion together
// with the country/date filters in one query reliably times out (tested and
// confirmed - see commit description / report for the actual numbers). Querying one
// class at a time, each takes single-digit to ~35 seconds; the whole run takes a few
// minutes. That's an acceptable trade for a script that's run occasionally, not live.
//
// A second, less obvious lesson: combining `SERVICE wikibase:label` with `GROUP BY`
// in one query block silently returns NO labels at all (Blazegraph evaluates the
// label service in a way that doesn't survive aggregation). The fix used below is
// the standard workaround - do the GROUP BY inside a subquery, and put
// `SERVICE wikibase:label` only in the outer query.
//
// NOTABILITY FILTERING
// A raw query like this surfaces a lot of low-significance items - a single local
// skirmish with one paragraph on one Wikipedia, a village council coup nobody
// outside specialist literature would recognize as history-book material. This
// script does NOT hide those from the output; it ranks by `sitelinks` (the number of
// distinct Wikipedia-family sites with an article on the item - a real signal
// Wikidata tracks, not a fabricated one) and separately flags whether an English
// Wikipedia article exists at all (`has_en_wikipedia` - required for enrich-candidates.js to
// resolve an excerpt/coordinates anyway). MIN_SITELINKS below is a **starting
// guess**, not a validated cutoff - see the discussion in the run report for why 5
// was chosen and what it trades off. Candidates below the threshold are still
// written to the output file (with `notable_enough: false`) rather than silently
// dropped, so a human reviewer can override the cutoff by eye rather than trust it
// blindly.
import { readFile, writeFile } from "node:fs/promises";
import { readJsonIfExists } from "./lib/files.js";
import { sleep } from "./lib/http.js";
import { runSparql, qidFromUri, compareQids } from "./lib/wdqs.js";
import {
  ALL_COUNTRY_QIDS,
  QID_TO_COUNTRY,
  EVENT_CLASSES,
  INCLUSION_MIN_SITELINKS,
} from "./lib/event-classes.js";
import {
  predecessorStatesQuery,
  predecessorStates,
  predecessorItemsQuery,
  presentDayCountryIndex,
  predecessorCountryTags,
} from "./lib/predecessor.js";
import { fetchEntities } from "./lib/wd-entities.js";
import { openCache } from "./lib/cache.js";

// Countries, event classes and the sitelink threshold live in scripts/lib/event-classes.js
// (shared with the enrichment step and docs/DATA_POLICY.md). Every class QID there was
// verified against WDQS.
//
// CLI:
//   --classes=Q188055,Q135010   query only these classes (bounded run) and MERGE the result
//                               into the existing data/event-candidates.json instead of
//                               overwriting it. Without --classes all classes are queried and
//                               the file is rewritten.
//   --min-sitelinks=N           notable_enough threshold (default: the policy value, 10)
//   --predecessors-only         run only the predecessor-state pass (below) and MERGE its NEW items into the existing
//                               data/event-candidates.json; rows already there are kept exactly as they are
//
// PREDECESSOR STATES (docs/DATA_POLICY.md, inclusion rule 2): an item whose P17 is a historical state that Wikidata
// links to a tracked country via P1366/P1365 (Ottoman Empire, Kingdom of Egypt, Pahlavi Iran, ...) counts only when
// its own P625 lies inside a tracked country's present-day border shape (data/boundaries.json), or a P276 place's
// present-day P17 is a tracked country; it is then tagged with that country. A few cheap queries (lib/predecessor.js):
// the predecessor list, the items with such a P17 dated 1900+, and their event classes/dates/sitelinks; then the
// items' and places' statements via wbgetentities (cached). Needs @turf/turf (root npm ci).
//
// A class query that fails (after the fallbacks below) makes the run write NOTHING and exit
// non-zero, listing the failed classes: rewriting the file without them would silently drop
// every candidate only that class finds. Re-run (or run the failed classes with --classes=).
// In a full run, a class that only the last-resort direct-P31 fallback answered counts as failed
// too: that answer misses every instance of the class's subclasses, and the full run rewrites the
// file, so those candidates would be dropped just as silently. A bounded --classes run merges into
// the existing file (it removes nothing), so there the partial P31 answer is still added.
//
// Each candidate's `countries` is sorted (by name), so the same Wikidata state always gives the
// same file whatever order WDQS returns the rows and the GROUP_CONCAT values in.
const argVal = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const MIN_SITELINKS = Number(argVal("min-sitelinks") ?? INCLUSION_MIN_SITELINKS);
const ONLY_CLASSES = argVal("classes")?.split(",").filter(Boolean) ?? null;
const PREDECESSORS_ONLY = process.argv.includes("--predecessors-only");
const REQUEST_DELAY_MS = 1500; // WDQS etiquette: no rapid-fire/parallel querying.
// Distinct country names in a fixed order (code-unit sort: no locale dependence).
const sortedCountries = (list) => [...new Set(list)].sort();

// classValues: query P31 instances of exactly these classes instead of classQid's tree
// (the batched fallback below passes a slice of the class's subclass tree).
function buildQuery(classQid, { transitive = true, classValues = null } = {}) {
  const countryValues = ALL_COUNTRY_QIDS.map((q) => `wd:${q}`).join(" ");
  const maxYear = new Date().getUTCFullYear() + 1;
  const classPath = transitive ? "wdt:P31/wdt:P279*" : "wdt:P31";
  const classTriple = classValues
    ? `VALUES ?cls { ${classValues.map((q) => `wd:${q}`).join(" ")} }\n      ?item wdt:P31 ?cls .`
    : `?item ${classPath} wd:${classQid} .`;
  return `
SELECT ?item ?itemLabel ?itemDescription ?eventDate ?eventDateEnd ?nSitelinks ?enwiki ?countries WHERE {
  {
    SELECT ?item
      (MIN(?date) AS ?eventDate)
      (MAX(?dateEnd) AS ?eventDateEnd)
      (SAMPLE(?sitelinks) AS ?nSitelinks)
      (SAMPLE(?enArticle) AS ?enwiki)
      (GROUP_CONCAT(DISTINCT ?country; separator="|") AS ?countries)
    WHERE {
      VALUES ?country { ${countryValues} }
      ${classTriple}
      {
        ?item wdt:P17 ?country .
      } UNION {
        ?item wdt:P276 ?loc . ?loc wdt:P17 ?country .
      } UNION {
        ?item wdt:P131 ?loc . ?loc wdt:P17 ?country .
      }
      OPTIONAL { ?item wdt:P585 ?pit }
      OPTIONAL { ?item wdt:P580 ?start }
      OPTIONAL { ?item wdt:P582 ?dateEnd }
      # Date rule (docs/DATA_POLICY.md): P585 point in time, else P580 start time; P582 end.
      # An item with several values gets the earliest start and the latest end (MIN/MAX, not
      # SAMPLE, so every run picks the same value).
      BIND(COALESCE(?pit, ?start) AS ?date)
      FILTER(BOUND(?date) && YEAR(?date) >= 1900 && YEAR(?date) <= ${maxYear})
      ?item wikibase:sitelinks ?sitelinks .
      OPTIONAL {
        ?enArticle schema:about ?item ;
                   schema:isPartOf <https://en.wikipedia.org/> .
      }
    }
    GROUP BY ?item
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY DESC(?nSitelinks) ?item
`;
}

// Some classes' subclass trees are just too large for the P31/P279* transitive
// expansion to finish inside WDQS's server-side timeout - "military operation"
// (Q645883) 504'd consistently during development even though every other class
// tried (including "battle", whose subclass tree is not obviously smaller) came
// back fine; "public election" (Q40231, thousands of per-country election
// subclasses) 504s too. There's no way to know this in advance short of trying it,
// so on a 504 this:
//   1. fetches the class's subclass tree once (P279*, cheap on its own) and queries
//      P31 instances of SUBCLASS_BATCH subclasses at a time - the same rule as the
//      transitive query, split into requests that finish in time;
//   2. only if that fails too, retries with plain P31 (no subclass expansion) - less
//      complete (misses instances of subclasses) but far better than zero results. Kept
//      only by a bounded --classes run (merged into the file); a full run counts it as a
//      failed class (see "A class query that fails" above).
const SUBCLASS_BATCH = 250;

async function subclassTree(classQid) {
  const rows = await runSparql(`SELECT DISTINCT ?sub WHERE { ?sub wdt:P279* wd:${classQid} . }`);
  return rows.map((r) => qidFromUri(r.sub.value));
}

async function runQueryWithFallback(classQid) {
  try {
    return { rows: await runSparql(buildQuery(classQid, { transitive: true })), usedFallback: false };
  } catch (err) {
    if (!/504|timeout|Gateway/i.test(err.message)) throw err;
    try {
      const subs = await subclassTree(classQid);
      console.log(`    (P279* transitive query failed: ${err.message} - querying ${subs.length} subclasses in batches of ${SUBCLASS_BATCH})`);
      const rows = [];
      for (let i = 0; i < subs.length; i += SUBCLASS_BATCH) {
        await sleep(REQUEST_DELAY_MS);
        rows.push(...(await runSparql(buildQuery(classQid, { classValues: subs.slice(i, i + SUBCLASS_BATCH) }))));
      }
      return { rows, usedFallback: false };
    } catch (err2) {
      console.log(`    (batched subclass query failed: ${err2.message} - retrying with direct P31 only)`);
      const rows = await runSparql(buildQuery(classQid, { transitive: false }));
      return { rows, usedFallback: true };
    }
  }
}

function toDateString(iso) {
  return iso ? iso.slice(0, 10) : null;
}

function titleFromEnwikiUrl(url) {
  if (!url) return null;
  const slug = url.split("/wiki/")[1];
  if (!slug) return null;
  return decodeURIComponent(slug).replace(/_/g, " ");
}

// Event classes, dates (the same rule as buildQuery), sitelinks and English article of the given items.
function predecessorDetailQuery(itemQids) {
  const maxYear = new Date().getUTCFullYear() + 1;
  return `
SELECT ?item ?itemLabel ?itemDescription ?eventDate ?eventDateEnd ?nSitelinks ?enwiki ?classes WHERE {
  {
    SELECT ?item (MIN(?date) AS ?eventDate) (MAX(?dateEnd) AS ?eventDateEnd) (SAMPLE(?sitelinks) AS ?nSitelinks)
      (SAMPLE(?enArticle) AS ?enwiki) (GROUP_CONCAT(DISTINCT ?cls; separator="|") AS ?classes)
    WHERE {
      VALUES ?item { ${itemQids.map((q) => `wd:${q}`).join(" ")} }
      VALUES ?cls { ${EVENT_CLASSES.map((c) => `wd:${c.qid}`).join(" ")} }
      ?item wdt:P31/wdt:P279* ?cls .
      OPTIONAL { ?item wdt:P585 ?pit }
      OPTIONAL { ?item wdt:P580 ?start }
      OPTIONAL { ?item wdt:P582 ?dateEnd }
      BIND(COALESCE(?pit, ?start) AS ?date)
      FILTER(BOUND(?date) && YEAR(?date) >= 1900 && YEAR(?date) <= ${maxYear})
      ?item wikibase:sitelinks ?sitelinks .
      OPTIONAL { ?enArticle schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
    }
    GROUP BY ?item
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

const PREDECESSOR_DETAIL_BATCH = 200;

// The predecessor-state pass. Adds new rows to byQid (and the rule's tags to rows already there unless keepExisting).
async function predecessorPass(byQid, { keepExisting = false } = {}) {
  const turf = await import("@turf/turf").catch(() => null);
  if (!turf) throw new Error("the predecessor-state pass needs @turf/turf: run npm ci at the repo root");
  const boundaries = JSON.parse(await readFile(new URL("../data/boundaries.json", import.meta.url), "utf-8"));
  const countriesAt = presentDayCountryIndex(boundaries, turf, new Date().getUTCFullYear());

  const preds = predecessorStates(
    (await runSparql(predecessorStatesQuery())).map((r) => ({
      pred: qidFromUri(r.pred.value),
      label: r.predLabel?.value,
      country: QID_TO_COUNTRY[qidFromUri(r.country.value)],
    }))
  );
  console.log(`  ${preds.size} predecessor states (P1366/P1365 to a tracked country)`);
  await sleep(REQUEST_DELAY_MS);
  const items = (await runSparql(predecessorItemsQuery([...preds.keys()]))).map((r) => qidFromUri(r.item.value)).sort(compareQids);
  console.log(`  ${items.length} items with such a P17 and a P585/P580 from 1900`);

  const detail = new Map();
  for (let i = 0; i < items.length; i += PREDECESSOR_DETAIL_BATCH) {
    await sleep(REQUEST_DELAY_MS);
    for (const r of await runSparql(predecessorDetailQuery(items.slice(i, i + PREDECESSOR_DETAIL_BATCH)))) {
      detail.set(qidFromUri(r.item.value), r);
    }
  }
  console.log(`  ${detail.size} of them are instances of an event class and dated 1900+`);

  const cache = openCache("entities");
  const ents = await fetchEntities([...detail.keys()], { cache });
  const placeQids = [...new Set([...ents.values()].filter(Boolean).flatMap((e) => e.p276))];
  const places = await fetchEntities(placeQids, { cache, props: "claims|labels" });

  let added = 0, tagged = 0, unlocated = 0;
  for (const [qid, row] of [...detail].sort((a, b) => compareQids(a[0], b[0]))) {
    const rule = predecessorCountryTags(ents.get(qid), places, preds, countriesAt);
    if (!rule) continue; // P17 changed between the queries
    if (!rule.countries.length) {
      unlocated++;
      continue; // the rule: neither its P625 nor a P276 place's present-day country is tracked
    }
    const matched = new Set((row.classes?.value ?? "").split("|").filter(Boolean).map(qidFromUri));
    const classes = EVENT_CLASSES.filter((c) => matched.has(c.qid));
    const predecessor_rule = { predecessors: rule.predecessors, via: rule.via };
    const existing = byQid.get(qid);
    if (existing) {
      if (keepExisting) continue;
      const before = existing.countries.length;
      existing.countries = sortedCountries([...existing.countries, ...rule.countries]);
      if (existing.countries.length > before) {
        existing.predecessor_rule = predecessor_rule;
        tagged++;
      }
      continue;
    }
    byQid.set(qid, {
      wikidata_qid: qid,
      wikipedia_title: titleFromEnwikiUrl(row.enwiki?.value),
      wikidata_label: row.itemLabel?.value ?? null,
      wikidata_description: row.itemDescription?.value ?? null,
      date_start: toDateString(row.eventDate?.value),
      date_end: toDateString(row.eventDateEnd?.value),
      countries: sortedCountries(rule.countries),
      category: classes[0].category,
      wikidata_classes: classes.map((c) => c.label),
      sitelinks: Number(row.nSitelinks?.value ?? 0),
      has_en_wikipedia: Boolean(row.enwiki),
      predecessor_rule,
    });
    added++;
  }
  console.log(
    `  predecessor rule: ${added} new candidates, ${tagged} existing candidates got a tag, ${unlocated} items not located in a tracked country (not counted)`
  );
}

async function loadExistingTitlesAndQids() {
  // Cross-check signal: does discovery re-find events already curated by hand? Uses
  // both seed-events.json (title match) and events.json (QID match, more reliable
  // since it's resolved post-ingest) - either file may be absent/stale, so both are
  // best-effort: an ABSENT file is fine; a malformed or unreadable one throws (read as empty,
  // every curated event would come back as a new candidate).
  const titles = new Set();
  const qids = new Set();
  const seed = await readJsonIfExists(new URL("../data/seed-events.json", import.meta.url), []);
  for (const e of seed) titles.add(e.wikipedia_title.toLowerCase());
  const events = await readJsonIfExists(new URL("../data/events.json", import.meta.url), []);
  for (const e of events) {
    if (e.title) titles.add(e.title.toLowerCase());
    if (e.wikidata_qid) qids.add(e.wikidata_qid);
  }
  return { titles, qids };
}

async function main() {
  const byQid = new Map();
  const outPath = new URL("../data/event-candidates.json", import.meta.url);
  const classes = PREDECESSORS_ONLY ? [] : ONLY_CLASSES ? EVENT_CLASSES.filter((c) => ONLY_CLASSES.includes(c.qid)) : EVENT_CLASSES;
  const existingRows = new Set();
  if (PREDECESSORS_ONLY) {
    for (const c of JSON.parse(await readFile(outPath, "utf-8"))) {
      byQid.set(c.wikidata_qid, c);
      existingRows.add(c.wikidata_qid);
    }
    console.log(`Predecessor-state pass only; merging new items into ${byQid.size} existing candidates (kept as they are).`);
  } else if (ONLY_CLASSES) {
    const unknown = ONLY_CLASSES.filter((q) => !EVENT_CLASSES.some((c) => c.qid === q));
    if (unknown.length) throw new Error(`--classes contains QIDs not in EVENT_CLASSES: ${unknown.join(", ")}`);
    // Bounded run: keep everything already discovered and merge the new rows into it.
    for (const c of JSON.parse(await readFile(outPath, "utf-8"))) byQid.set(c.wikidata_qid, c);
    console.log(`Bounded run over ${classes.length} class(es); merging into ${byQid.size} existing candidates.`);
  }

  const failed = [];
  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    process.stdout.write(`[${i + 1}/${classes.length}] querying "${cls.label}" (wd:${cls.qid})... `);
    let rows, usedFallback;
    try {
      ({ rows, usedFallback } = await runQueryWithFallback(cls.qid));
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      failed.push({ cls, message: err.message });
      if (i < classes.length - 1) await sleep(REQUEST_DELAY_MS);
      continue;
    }
    console.log(`${rows.length} raw results${usedFallback ? " (via direct-P31 fallback, no subclass expansion)" : ""}`);
    if (usedFallback && !ONLY_CLASSES) {
      // Full run: the partial answer would drop this class's subclass instances from the rewritten file (see the top).
      failed.push({ cls, message: "only the direct-P31 fallback answered (instances of subclasses missing)" });
      if (i < classes.length - 1) await sleep(REQUEST_DELAY_MS);
      continue;
    }

    for (const row of rows) {
      const qid = qidFromUri(row.item.value);
      const sitelinks = Number(row.nSitelinks?.value ?? 0);
      const countryQids = (row.countries?.value ?? "").split("|").filter(Boolean).map(qidFromUri);
      const countries = sortedCountries(countryQids.map((q) => QID_TO_COUNTRY[q]).filter(Boolean));
      if (countries.length === 0) continue; // shouldn't happen given the VALUES filter, but be defensive

      const existing = byQid.get(qid);
      if (!existing) {
        byQid.set(qid, {
          wikidata_qid: qid,
          wikipedia_title: titleFromEnwikiUrl(row.enwiki?.value),
          wikidata_label: row.itemLabel?.value ?? null,
          wikidata_description: row.itemDescription?.value ?? null,
          date_start: toDateString(row.eventDate?.value),
          date_end: toDateString(row.eventDateEnd?.value),
          countries,
          category: cls.category,
          // Same item can satisfy more than one class (e.g. both "battle" and
          // "military operation", or "coup d'état" and "rebellion") - every class
          // matched is kept here even though only the first-seen one sets `category`,
          // so a reviewer can see the ambiguity instead of it being silently hidden.
          wikidata_classes: [cls.label],
          sitelinks,
          has_en_wikipedia: Boolean(row.enwiki),
        });
      } else {
        if (!existing.wikidata_classes.includes(cls.label)) existing.wikidata_classes.push(cls.label);
        existing.sitelinks = Math.max(existing.sitelinks, sitelinks);
        existing.countries = sortedCountries([...existing.countries, ...countries]);
      }
    }

    if (i < classes.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  if (failed.length) {
    console.error(`\n${failed.length} class quer${failed.length === 1 ? "y" : "ies"} failed; data/event-candidates.json was NOT written:`);
    for (const f of failed) console.error(`  ${f.cls.label} (${f.cls.qid}): ${f.message}`);
    console.error(`Re-run, or query just these with --classes=${failed.map((f) => f.cls.qid).join(",")} (merges into the existing file).`);
    process.exit(1);
  }

  // Bounded --classes runs leave the predecessor pass out (run it with --predecessors-only).
  if (!ONLY_CLASSES) {
    console.log(`Predecessor-state pass:`);
    if (!PREDECESSORS_ONLY) await sleep(REQUEST_DELAY_MS);
    await predecessorPass(byQid, { keepExisting: PREDECESSORS_ONLY });
  }

  const { titles: existingTitles, qids: existingQids } = await loadExistingTitlesAndQids();

  const all = [...byQid.values()].map((c) =>
    existingRows.has(c.wikidata_qid)
      ? c // --predecessors-only: rows already in the file are not touched
      : {
          ...c,
          notable_enough: c.sitelinks >= MIN_SITELINKS && c.has_en_wikipedia,
          already_curated:
            existingQids.has(c.wikidata_qid) ||
            (c.wikipedia_title ? existingTitles.has(c.wikipedia_title.toLowerCase()) : false),
        }
  );

  const bySitelinks = (a, b) => b.sitelinks - a.sitelinks || compareQids(a.wikidata_qid, b.wikidata_qid);
  if (PREDECESSORS_ONLY) {
    // Keep the file's existing order (its rows are untouched) and slot each new row in by the same sort.
    const kept = all.filter((c) => existingRows.has(c.wikidata_qid));
    for (const row of all.filter((c) => !existingRows.has(c.wikidata_qid)).sort(bySitelinks)) {
      const at = kept.findIndex((c) => bySitelinks(row, c) < 0);
      kept.splice(at < 0 ? kept.length : at, 0, row);
    }
    all.splice(0, all.length, ...kept);
  } else all.sort(bySitelinks);

  await writeFile(outPath, JSON.stringify(all, null, 2));

  const noEnwiki = all.filter((c) => !c.has_en_wikipedia).length;
  const passed = all.filter((c) => c.notable_enough);
  const alreadyCurated = all.filter((c) => c.already_curated);
  const newNotable = passed.filter((c) => !c.already_curated);

  console.log(`\n--- discover-events.js summary ---`);
  console.log(`Total distinct candidates found: ${all.length}`);
  console.log(`  ... without any English Wikipedia article: ${noEnwiki}`);
  console.log(`Passing notability filter (sitelinks >= ${MIN_SITELINKS} AND has English article): ${passed.length}`);
  console.log(`  ... of those, already present in seed-events.json/events.json: ${alreadyCurated.length}`);
  console.log(`  ... of those, NEW (not yet curated): ${newNotable.length}`);
  console.log(`\nBy category (passing filter):`);
  const byCat = {};
  for (const c of passed) byCat[c.category] = (byCat[c.category] ?? 0) + 1;
  for (const [cat, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(`  ${cat}: ${n}`);
  console.log(`\nWrote ${all.length} candidates to data/event-candidates.json (sorted by sitelinks desc, then QID).`);
  console.log(`This file is for human review only - nothing here has been merged into seed-events.json.`);
}

main();

// LIMITATIONS (see also the comments above)
//
// - Location resolution (P17 direct, or P276/P131 one hop to something with P17)
//   misses events whose only recorded location is further removed than one hop, or
//   whose location property is something else entirely (P1001 "applies to
//   jurisdiction", P710 "participant", etc.) - some real events in this region will
//   not be found by this query at all.
// - "diplomatic" and "economic" categories are barely covered - there's no tidy
//   Wikidata class for "oil crisis" or "peace conference" the way there is for
//   "battle" or "treaty", so seed-events.json entries like the 1973 oil crisis or the
//   Khartoum Resolution would not be found by this pipeline as currently built.
// - Multi-country events (e.g. the Six-Day War touching Israel/Palestine, Egypt,
//   Syria, Jordan at once) are only as multi-country as Wikidata's own P17/P276/P131
//   statements on that item happen to be - Wikidata frequently records only one
//   "main" country for what was actually a multi-country war, so the `countries`
//   array here is less complete than the hand-curated seed list's.
// - Dates on Wikidata are not always trustworthy at a glance - spot-checking during
//   development turned up at least one item (the Iraqi invasion of Kuwait) carrying a
//   P585 "point in time" statement dated to the wrong year entirely. This script does
//   not attempt to sanity-check dates against Wikipedia prose; a human reviewer (or a
//   the date flags enrich-candidates.js adds from the Wikipedia lead) needs to.
// - Sitelink count and "has an English Wikipedia article" are proxies for notability,
//   not the thing itself - they favor internationally-reported events and modern
//   events (more languages actively editing) over events that were significant
//   locally/regionally but under-documented in English-language and cross-lingual
//   Wikipedia. MIN_SITELINKS=5 is a starting guess calibrated by eyeballing the
//   sitelink distribution during development, not a validated threshold - see the run
//   report for the actual distribution and reasoning.
