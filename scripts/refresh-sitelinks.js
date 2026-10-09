// Stores each event's current Wikidata sitelink count as `sitelinks_current`. The app lists events
// with the most sitelinks first by default (docs/DATA_POLICY.md, "Default order"). Run monthly by
// .github/workflows/refresh-data.yml after the extract refresh.
//
//   node scripts/refresh-sitelinks.js           DRY RUN (default): prints what would change, writes nothing
//   node scripts/refresh-sitelinks.js --apply   writes the counts into data/events.json
//
// The count is Wikidata's sitelinks across ALL Wikimedia projects, the same measure as the inclusion
// rule's "at least 10 sitelinks". It is kept apart from `sitelinks` (the count discovery saw, carried by
// discovered events only and used by lib/v21.js to tell them from the hand-picked ones), so adding it
// to every event changes nothing else. An event whose item cannot be fetched keeps its previous count;
// one that never had a count stays without one (listed last).
import { readFile, writeFile } from "node:fs/promises";
import { fetchEntities } from "./lib/wd-entities.js";

const APPLY = process.argv.includes("--apply");
const curatedUrl = new URL("../data/events.json", import.meta.url);
const events = JSON.parse(await readFile(curatedUrl, "utf-8"));

const entities = await fetchEntities(
  events.map((e) => e.wikidata_qid),
  { props: "sitelinks", log: (m) => console.log(m) }
);

let changed = 0;
const missing = [];
for (const e of events) {
  const rec = entities.get(e.wikidata_qid);
  if (!rec) {
    missing.push(`${e.id} (${e.wikidata_qid ?? "no QID"})`);
    continue;
  }
  if (e.sitelinks_current !== rec.sitelinks_all) {
    console.log(`${e.id}: ${e.sitelinks_current ?? "-"} -> ${rec.sitelinks_all}`);
    e.sitelinks_current = rec.sitelinks_all;
    changed++;
  }
}

console.log(`\n${changed} of ${events.length} counts changed.`);
if (missing.length) console.log(`Not fetched (previous count kept): ${missing.join(", ")}`);
if (APPLY) {
  await writeFile(curatedUrl, JSON.stringify(events, null, 2) + "\n");
  console.log("APPLIED: wrote data/events.json.");
} else {
  console.log("Dry run - nothing written. Re-run with --apply.");
}
