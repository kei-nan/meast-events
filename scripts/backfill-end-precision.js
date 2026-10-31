// One-off (re-runnable) backfill of `date_end_precision`: the Wikidata precision of the P582 (end time) statement
// whose value is the stored `date_end` (lib/fixes.js keptEndPrecision, as enrich-candidates.js derives it for new
// events). The event panel then shows the end to that precision ("29 October – 7 November 1956") instead of the
// year only ("29 October 1956 (ended 1956)"); app/src/lib/eventDate.js.
//
//   node scripts/backfill-end-precision.js            DRY RUN (default): fetches the items and prints the counts, writes nothing
//   node scripts/backfill-end-precision.js --apply    also writes data/events.json
//
// Only events with a `date_end` and no `date_end_precision` yet are touched, and only that field is added: null when
// no P582 statement of the item has the stored date (the date did not come from Wikidata's end time, or Wikidata has
// changed since), so the end keeps showing as a year only. Dates, titles and every other field stay as they are.
// Read-only requests through lib/http.js politeFetch, uncached (the items are read fresh).
import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "./lib/files.js";
import { fetchEntities } from "./lib/wd-entities.js";
import { keptEndPrecision } from "./lib/fixes.js";

const APPLY = process.argv.includes("--apply");
const file = new URL("../data/events.json", import.meta.url);
const log = (m) => process.stdout.write(`\r${m}      `);

const events = JSON.parse(await readFile(file, "utf-8"));
const todo = events.filter((e) => e.date_end && e.wikidata_qid && !("date_end_precision" in e));
console.log(`${events.length} curated events; ${todo.length} with a date_end and no date_end_precision.`);

const entities = await fetchEntities(todo.map((e) => e.wikidata_qid), { log });
console.log();

const counts = {};
const unmatched = [];
const precisionOf = new Map();
for (const e of todo) {
  const entity = entities.get(e.wikidata_qid) ?? null;
  const name = keptEndPrecision(entity, e.date_end)?.name ?? null;
  precisionOf.set(e.id, name);
  counts[name ?? "null"] = (counts[name ?? "null"] ?? 0) + 1;
  if (!name) unmatched.push(`${e.id} (${e.wikidata_qid}): date_end ${e.date_end}; P582 ${entity ? (entity.p582 ?? []).map((v) => `${v.time} (${v.precision})`).join(", ") || "none" : "item not fetched"}`);
}
console.log("date_end_precision:", JSON.stringify(counts));
if (unmatched.length) console.log(`null (no P582 statement has the stored date_end):\n  ${unmatched.join("\n  ")}`);

if (APPLY) {
  // The new field goes right after date_precision (or date_end), so a record reads in order.
  const out = events.map((e) => {
    if (!precisionOf.has(e.id)) return e;
    const anchor = "date_precision" in e ? "date_precision" : "date_end";
    const rec = {};
    for (const [k, v] of Object.entries(e)) {
      rec[k] = v;
      if (k === anchor) rec.date_end_precision = precisionOf.get(e.id);
    }
    return rec;
  });
  await writeFileAtomic(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${precisionOf.size} date_end_precision values to data/events.json`);
} else {
  console.log("dry run: nothing written (--apply writes data/events.json)");
}
