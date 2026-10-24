// Proposes the Wikidata/Wikipedia fields that the hand-picked seed events of data/events.json lack
// (date_precision, part_of, resolved_qid, wikidata_description): they were curated from
// data/seed-events.json before the pipeline recorded those, and enrich-candidates.js only resolves
// discovery candidates that are not curated yet, so it never reaches them.
//
//   node scripts/enrich-seed.js [--fresh] [--cache-max-age=7d] [--cache-dir=DIR]
//
// Writes data/seed-enrichment.proposed.json: per event, only the fields it does not have yet, derived
// the way enrich-candidates.js derives them (lib/seed-enrichment.js), plus the review notes the pipeline
// would attach. A PROPOSAL for the owner's review: this script never writes data/events.json, and
// nothing merges the file automatically. Titles, extracts, dates, countries and coordinates are never
// proposed. Read-only requests through lib/http.js politeFetch (the project's User-Agent), cached like
// the pipeline's (lib/cache.js: the "leads" and "entities" caches enrich-candidates.js uses).
import { readFile, writeFile } from "node:fs/promises";
import { openCache } from "./lib/cache.js";
import { sleep } from "./lib/http.js";
import { fetchLeads, titleFromWikipediaUrl } from "./lib/lead.js";
import { fetchEntities } from "./lib/wd-entities.js";
import { fetchEntity, fetchLabels } from "./lib/wiki.js";
import { SEED_FIELDS, isSeedEvent, proposeSeedFields, summarize } from "./lib/seed-enrichment.js";

const REQUEST_DELAY_MS = 300;
const FULL = "claims|labels|descriptions|sitelinks/urls"; // as lib/context.js, so the cache entries are shared
const curatedUrl = new URL("../data/events.json", import.meta.url);
const outUrl = new URL("../data/seed-enrichment.proposed.json", import.meta.url);
const log = (m) => process.stdout.write(`\r${m}      `);

const curated = JSON.parse(await readFile(curatedUrl, "utf-8"));
const seeds = curated.filter((e) => isSeedEvent(e) && e.wikidata_qid && SEED_FIELDS.some((k) => !(k in e)));
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

const proposals = seeds.map((e) => {
  const lead = leads.get(titleFromWikipediaUrl(e.wikipedia_url) ?? e.title) ?? null;
  const p = proposeSeedFields(e, { entity: entities.get(e.wikidata_qid) ?? null, partOfQids: partOf.get(e.wikidata_qid) ?? [], labels, lead });
  return { id: e.id, wikidata_qid: e.wikidata_qid, title: e.title, ...p };
});
const summary = summarize(proposals);

const doc = {
  about:
    "PROPOSAL, not applied: fields the hand-picked seed events of data/events.json lack, derived from Wikidata and Wikipedia " +
    "the way scripts/enrich-candidates.js derives them for discovered events (scripts/enrich-seed.js). For the owner's review; " +
    "never merged automatically. `set` lists only fields the event does not have; titles, extracts, dates, countries and coordinates are not touched.",
  retrieved_at: new Date().toISOString().slice(0, 10),
  summary,
  events: proposals,
};
await writeFile(outUrl, JSON.stringify(doc, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote data/seed-enrichment.proposed.json (${proposals.length} events). data/events.json is unchanged.`);
