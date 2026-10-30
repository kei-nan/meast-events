// Stores each event's current Wikidata sitelink count as `sitelinks_current` and its English Wikidata
// aliases as `wikidata_aliases`. The app lists events with the most sitelinks first by default
// (docs/DATA_POLICY.md, "Default order"), and its search also finds an event by its aliases. Run monthly
// by .github/workflows/refresh-data.yml after the extract refresh.
//
//   node scripts/refresh-sitelinks.js                  DRY RUN (default): prints what would change, writes nothing
//   node scripts/refresh-sitelinks.js --apply          writes the counts and the aliases into data/events.json
//   node scripts/refresh-sitelinks.js --aliases-only   only the aliases (no sitelink count is touched);
//                                                      combine with --apply to write them
//
// The count is Wikidata's sitelinks across ALL Wikimedia projects, the same measure as the inclusion
// rule's "at least 10 sitelinks". It is kept apart from `sitelinks` (the count discovery saw, carried by
// discovered events only and used by lib/v21.js to tell them from the hand-picked ones), so adding it
// to every event changes nothing else. An event whose item cannot be fetched keeps its previous count
// and aliases; one that never had a count stays without one (listed last).
//
// The aliases are Wikidata's English "also known as" values, stored as-is in Wikidata's order; an item
// with none has no `wikidata_aliases` field.
//
// It also stores `date_end_open` for an event with no date_end whose item gives its end time (P582) as
// "no value" or "unknown value" (lib/wd-entities.js setDateEndOpen); the app counts such an event in every
// year from its start to the current year (docs/DATA_POLICY.md, "Ongoing events"). Refreshed in both modes.
import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "./lib/files.js";
import { fetchEntities, setDateEndOpen, setWikidataAliases } from "./lib/wd-entities.js";

const APPLY = process.argv.includes("--apply");
const ALIASES_ONLY = process.argv.includes("--aliases-only");
const curatedUrl = new URL("../data/events.json", import.meta.url);
const events = JSON.parse(await readFile(curatedUrl, "utf-8"));

const entities = await fetchEntities(
  events.map((e) => e.wikidata_qid),
  { props: "sitelinks|aliases|claims", log: (m) => console.log(m) }
);

let changed = 0;
let aliasesChanged = 0;
let openChanged = 0;
const missing = [];
for (const e of events) {
  const rec = entities.get(e.wikidata_qid);
  if (!rec) {
    missing.push(`${e.id} (${e.wikidata_qid ?? "no QID"})`);
    continue;
  }
  if (!ALIASES_ONLY && e.sitelinks_current !== rec.sitelinks_all) {
    console.log(`${e.id}: ${e.sitelinks_current ?? "-"} -> ${rec.sitelinks_all}`);
    e.sitelinks_current = rec.sitelinks_all;
    changed++;
  }
  const before = e.wikidata_aliases;
  if (setWikidataAliases(e, rec.aliases)) {
    console.log(`${e.id}: aliases ${JSON.stringify(before ?? [])} -> ${JSON.stringify(e.wikidata_aliases ?? [])}`);
    aliasesChanged++;
  }
  const openBefore = e.date_end_open;
  if (setDateEndOpen(e, rec.p582_open)) {
    console.log(`${e.id}: date_end_open ${openBefore ?? "-"} -> ${e.date_end_open ?? "-"}`);
    openChanged++;
  }
}

const withAliases = events.filter((e) => e.wikidata_aliases).length;
const aliasCount = events.reduce((n, e) => n + (e.wikidata_aliases?.length ?? 0), 0);
console.log(
  `\n${ALIASES_ONLY ? "Sitelink counts not refreshed (--aliases-only)." : `${changed} of ${events.length} counts changed.`}` +
    `\n${aliasesChanged} events' aliases changed; ${withAliases} events have aliases (${aliasCount} in total).` +
    `
${openChanged} events' date_end_open changed; ${events.filter((e) => e.date_end_open).length} events have one.`
);
if (missing.length) console.log(`Not fetched (previous count and aliases kept): ${missing.join(", ")}`);
if (APPLY) {
  await writeFileAtomic(curatedUrl, JSON.stringify(events, null, 2) + "\n");
  console.log("APPLIED: wrote data/events.json.");
} else {
  console.log("Dry run - nothing written. Re-run with --apply.");
}
