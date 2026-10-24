// Proposes the Wikidata/Wikipedia fields that the hand-picked seed events of data/events.json lack
// (date_precision, part_of, resolved_qid, wikidata_description): they were curated from
// data/seed-events.json before the pipeline recorded those, and enrich-candidates.js only resolves
// discovery candidates that are not curated yet, so it never reaches them.
//
//   node scripts/enrich-seed.js [--fresh] [--cache-max-age=7d] [--cache-dir=DIR]
//        DRY RUN (default): writes the proposal, data/seed-enrichment.proposed.json, and leaves data/events.json alone
//   node scripts/enrich-seed.js --apply [--fresh] ...
//        also writes the proposal into data/events.json where the event's date agrees (below)
//
// The proposal lists per event only the fields it does not have yet, derived the way enrich-candidates.js
// derives them (lib/seed-enrichment.js), plus the review notes the pipeline would attach. Titles, extracts,
// dates, countries and coordinates are never proposed.
//
// --apply writes an event's proposal ONLY when its date agrees with Wikidata: its date_start is one of the
// item's P585/P580 values (so date_precision is that statement's precision). A seed date that is no Wikidata
// value is first settled, if at all, by a verified ledger entry (lib/fixes.js, F13 and F14 only, evidence in
// docs/data-fixes.md: F13 sets date_start to the Wikidata value the Wikipedia article confirms, F14 records
// the day precision of a stored date the article states). Every other event stays exactly as it is. After an
// --apply run the proposal file lists only the seed events still lacking a field, i.e. those left alone.
//
// Read-only requests through lib/http.js politeFetch (the project's User-Agent), cached like the
// pipeline's (lib/cache.js: the "leads" and "entities" caches enrich-candidates.js uses).
import { readFile, writeFile } from "node:fs/promises";
import { openCache } from "./lib/cache.js";
import { sleep } from "./lib/http.js";
import { fetchLeads, titleFromWikipediaUrl } from "./lib/lead.js";
import { fetchEntities } from "./lib/wd-entities.js";
import { fetchEntity, fetchLabels } from "./lib/wiki.js";
import { SEED_FIELDS, applySeedFix, applySeedProposal, isSeedEvent, proposeSeedFields, summarize } from "./lib/seed-enrichment.js";

const APPLY = process.argv.includes("--apply");
const REQUEST_DELAY_MS = 300;
const FULL = "claims|labels|descriptions|aliases|sitelinks/urls"; // as lib/context.js, so the cache entries are shared
const curatedUrl = new URL("../data/events.json", import.meta.url);
const outUrl = new URL("../data/seed-enrichment.proposed.json", import.meta.url);
const log = (m) => process.stdout.write(`\r${m}      `);

const curated = JSON.parse(await readFile(curatedUrl, "utf-8"));
const lacking = (e) => isSeedEvent(e) && e.wikidata_qid && SEED_FIELDS.some((k) => !(k in e));
const seeds = curated.filter(lacking);
console.log(`${curated.length} curated events; ${seeds.length} hand-picked seed events lack one of ${SEED_FIELDS.join(", ")}.`);

const leadCache = openCache("leads");
const leads = await fetchLeads(seeds.map((e) => titleFromWikipediaUrl(e.wikipedia_url) ?? e.title), { cache: leadCache, log });
leadCache.flush();
const entities = await fetchEntities(seeds.map((e) => e.wikidata_qid), { cache: openCache("entities"), props: FULL, log });
console.log();

// P361 exactly as enrich-candidates.js reads it (lib/wiki.js fetchEntity: preferred rank first).
const partOf = new Map();
for (let i = 0; i < seeds.length; i++) {
  const ent = await fetchEntity(seeds[i].wikidata_qid);
  partOf.set(seeds[i].wikidata_qid, ent?.partOf ?? []);
  log(`part of ${i + 1}/${seeds.length}`);
  await sleep(REQUEST_DELAY_MS);
}
console.log();
const labels = await fetchLabels([...new Set([...partOf.values()].flat())]);

const propose = (e) => {
  const lead = leads.get(titleFromWikipediaUrl(e.wikipedia_url) ?? e.title) ?? null;
  const p = proposeSeedFields(e, { entity: entities.get(e.wikidata_qid) ?? null, partOfQids: partOf.get(e.wikidata_qid) ?? [], labels, lead });
  return { id: e.id, wikidata_qid: e.wikidata_qid, title: e.title, ...p };
};
let proposals = seeds.map(propose);
console.log(JSON.stringify(summarize(proposals), null, 2));

if (APPLY) {
  const fieldCounts = {};
  const fixed = [];
  const applied = [];
  for (const e of seeds) {
    const fixFields = applySeedFix(e);
    if (fixFields.length) fixed.push(`${e.id} (${fixFields.join(", ")})`);
    // Re-derived after a fix: the date (and so its precision) may have changed.
    const changed = applySeedProposal(e, propose(e));
    for (const k of new Set([...fixFields, ...changed])) fieldCounts[k] = (fieldCounts[k] ?? 0) + 1;
    if (fixFields.length || changed.length) applied.push(e.id);
  }
  const left = seeds.filter(lacking);
  await writeFile(curatedUrl, JSON.stringify(curated, null, 2) + "\n");
  console.log(`\nAPPLIED to ${applied.length} events; events changed per field: ${JSON.stringify(fieldCounts)}`);
  if (fixed.length) console.log(`ledger (F13/F14): ${fixed.join(", ")}`);
  console.log(`left unchanged (date is no Wikidata value and no ledger entry settles it, or nothing could be fetched): ${left.length}`);
  if (left.length) console.log(`  ${left.map((e) => e.id).join(", ")}`);
  console.log("Wrote data/events.json.");
  proposals = left.map(propose);
}

const doc = {
  about:
    "PROPOSAL: fields the hand-picked seed events of data/events.json lack, derived from Wikidata and Wikipedia " +
    "the way scripts/enrich-candidates.js derives them for discovered events (scripts/enrich-seed.js). `set` lists only fields the event " +
    "does not have; titles, extracts, dates, countries and coordinates are not touched. `node scripts/enrich-seed.js --apply` writes a " +
    "proposal into data/events.json only where the event's date agrees with Wikidata (or a verified F13/F14 entry of docs/data-fixes.md " +
    "settles it); after such a run this file lists only the events left as they are.",
  retrieved_at: new Date().toISOString().slice(0, 10),
  summary: summarize(proposals),
  events: proposals,
};
await writeFile(outUrl, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote data/seed-enrichment.proposed.json (${proposals.length} events).${APPLY ? "" : " Dry run: data/events.json is unchanged; re-run with --apply to write it."}`);
