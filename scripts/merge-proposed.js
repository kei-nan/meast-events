// Merges data/events.proposed.json into the curated data/events.json. Run by the USER, deliberately.
//
//   node scripts/merge-proposed.js                 DRY RUN (default): prints what would change, writes nothing
//   node scripts/merge-proposed.js --apply         writes data/events.json
//   node scripts/merge-proposed.js --skip-duplicate-hints
//                                                  leave out proposed events that carry a possible_duplicates hint
//                                                  (by default they are merged with the hint kept as a review note)
//
// Nothing is rewritten: proposed events are appended exactly as proposed; curated events are untouched.
// Proposed events whose id or wikidata_qid already exists in the curated file are skipped and listed.
import { readFile, writeFile } from "node:fs/promises";
import { validateEvents, findClashes } from "./lib/validate.js";

const APPLY = process.argv.includes("--apply");
const SKIP_DUP = process.argv.includes("--skip-duplicate-hints");

const curatedUrl = new URL("../data/events.json", import.meta.url);
const proposedUrl = new URL("../data/events.proposed.json", import.meta.url);

const read = async (u) => JSON.parse(await readFile(u, "utf-8"));

const curated = await read(curatedUrl);
const exclusionsUrl = new URL("../data/proposed-exclusions.json", import.meta.url);
const exclusions = await read(exclusionsUrl).catch(() => []);
const excludedIds = new Set(exclusions.map((x) => x.id));
// Reviewed duplicates (data/proposed-exclusions.json, each with a stated reason) are left out.
const proposed = (await read(proposedUrl)).filter((e) => !excludedIds.has(e.id));
console.log(`Excluded by review (data/proposed-exclusions.json): ${excludedIds.size}`);

const pv = validateEvents(proposed, { name: "events.proposed" });
if (pv.errors.length) {
  console.error(`Proposed file is invalid (${pv.errors.length} violation(s)); refusing to merge:`);
  for (const e of pv.errors.slice(0, 20)) console.error("  " + e);
  process.exit(1);
}

const clashes = findClashes(curated, proposed);
const clashIds = new Set(clashes.map((c) => c.event.id));
let incoming = proposed.filter((e) => !clashIds.has(e.id));
const dupHinted = incoming.filter((e) => e.possible_duplicates?.length);
if (SKIP_DUP) incoming = incoming.filter((e) => !e.possible_duplicates?.length);

// Also guard QID clashes within the incoming set against curated after id filtering.
const merged = [...curated, ...incoming];
const mv = validateEvents(merged, { name: "merged", lenient: true });
if (mv.errors.length) {
  console.error(`Merged result would be invalid (${mv.errors.length} violation(s)); refusing:`);
  for (const e of mv.errors.slice(0, 20)) console.error("  " + e);
  process.exit(1);
}

const byCat = {};
for (const e of incoming) byCat[e.category] = (byCat[e.category] ?? 0) + 1;

console.log(`${APPLY ? "APPLY" : "DRY RUN"} - merge-proposed`);
console.log(`  curated events now:              ${curated.length}`);
console.log(`  proposed events:                 ${proposed.length}`);
console.log(`  skipped (id/QID already curated): ${clashes.length}`);
for (const c of clashes) console.log(`      ${c.event.id} (${c.reasons.join(", ")})`);
console.log(`  with possible-duplicate hints:   ${dupHinted.length}${SKIP_DUP ? " (skipped by --skip-duplicate-hints)" : " (merged; hint kept in review_reasons)"}`);
console.log(`  with any review flag:            ${incoming.filter((e) => e.needs_review).length}`);
console.log(`  would add:                       ${incoming.length}  -> total ${merged.length}`);
console.log(`  by category:`, byCat);

if (!APPLY) {
  console.log(`\nDry run only - nothing was written. Re-run with --apply to write it.`);
} else {
  await writeFile(curatedUrl, JSON.stringify(merged, null, 2) + "\n");
  console.log(`\nWrote data/events.json (${merged.length} events).`);
}
