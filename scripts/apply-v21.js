// Brings the curated data/events.json (and its byte-identical app copy) to data shape v2.1:
//   extract               full English Wikipedia lead (plain text), + extract_retrieved_at
//   wikidata_classes      ALL of the item's Wikidata P31 class labels in Wikidata's order, plus discovery-matched
//                         classes not already among them (see docs/DATA_POLICY.md); legacy labels are NOT kept
//   category/category_group  OUR coarse grouping (unchanged values); category_label removed
//   location_quality      precise | approximate (capital fallback pin) | none (no coordinates, never invented)
//   date_flags / review_reasons  flags only; verified fixes come from scripts/lib/fixes.js (docs/data-fixes.md)
// Ids are never changed. Dry-run by default; --apply writes data/events.json.
//   node scripts/apply-v21.js [--apply] [--cache-dir=...]
import { readFile, writeFile } from "node:fs/promises";
import { buildContext } from "./lib/context.js";
import { finalizeEvent } from "./lib/v21.js";
import { validateEvents } from "./lib/validate.js";

const APPLY = process.argv.includes("--apply");
const dataUrl = (n) => new URL(`../data/${n}`, import.meta.url);
const read = async (u) => JSON.parse(await readFile(u, "utf-8"));

const events = await read(dataUrl("events.json"));
const candidates = await read(dataUrl("event-candidates.json"));
const before = events.map((e) => ({ id: e.id, len: e.extract.length, title: e.title, date_start: e.date_start, date_end: e.date_end, countries: e.countries }));
const ctx = await buildContext(events, { candidates, reconcileDates: false, log: (m) => process.stdout.write(`\r${m}      `) });
console.log();

const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return { n: s.length, min: s[0], median: s[Math.floor(s.length / 2)], mean: Math.round(s.reduce((x, y) => x + y, 0) / s.length), max: s.at(-1) };
};

const out = events.map((e) => {
  const ev = finalizeEvent({ ...e }, ctx);
  ev.location_quality = !ev.coordinates ? "none" : String(ev.coordinate_source ?? "").startsWith("country-fallback") ? "approximate" : "precise";
  ev.needs_manual_coordinates = ev.location_quality !== "precise";
  return ev;
});

const changed = { title: [], date_start: [], date_end: [], countries: [] };
out.forEach((e, i) => {
  for (const k of Object.keys(changed)) if (JSON.stringify(e[k]) !== JSON.stringify(before[i][k])) changed[k].push(e.id);
});
const classCount = out.map((e) => e.wikidata_classes.length);
const lq = {};
for (const e of out) lq[e.location_quality] = (lq[e.location_quality] ?? 0) + 1;
const flagCounts = {};
for (const e of out) for (const r of [...(e.review_reasons ?? []), ...(e.date_flags ?? [])]) flagCounts[r.split(/[:( ]/)[0]] = (flagCounts[r.split(/[:( ]/)[0]] ?? 0) + 1;

console.log("extract length before:", stats(before.map((b) => b.len)));
console.log("extract length after: ", stats(out.map((e) => e.extract.length)));
console.log("events with longer extract:", out.filter((e, i) => e.extract.length > before[i].len).length, "shorter:", out.filter((e, i) => e.extract.length < before[i].len).length, "same:", out.filter((e, i) => e.extract.length === before[i].len).length);
console.log("fields changed by verified fixes:", changed);
console.log("wikidata_classes per event:", stats(classCount), "events with 0 classes:", out.filter((e) => !e.wikidata_classes.length).map((e) => e.id));
console.log("location_quality:", lq);
console.log("flags:", flagCounts);

const v = validateEvents(out, { name: "events", lenient: true });
if (v.errors.length) {
  console.error("VALIDATION ERRORS", v.errors.slice(0, 20));
  process.exit(1);
}
if (APPLY) {
  const text = JSON.stringify(out, null, 2) + "\n";
  await writeFile(dataUrl("events.json"), text);
  console.log(`Wrote data/events.json (${out.length} events).`);
} else console.log("Dry run - nothing written. Use --apply.");
