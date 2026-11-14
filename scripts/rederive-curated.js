// Re-derives curated values after a published rule changed (lib/rederive.js; docs/DATA_POLICY.md, "Re-deriving
// curated values"). Re-runnable; on unchanged sources a second run changes nothing.
//
//   node scripts/rederive-curated.js            DRY RUN (default): fetches the items and articles, prints every change
//   node scripts/rederive-curated.js --apply    also writes data/events.json
//
// Two rules:
//  1. date_start: a stored start that is the item's year-precision P585 while its P580 is month-or-finer and in
//     that year becomes the P580 (lib/fixes.js reconcileStartDate case (d)), with a date_source_adjusted note.
//  2. coordinates: a "wikipedia" pin becomes the article's current primary point when that point and the item's
//     P625 are the same and the stored pin is not. A pin where only the article differs is listed, never changed.
// Nothing else is changed. Read-only requests through lib/http.js (the pipeline's User-Agent), uncached.
import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "./lib/files.js";
import { fetchEntities } from "./lib/wd-entities.js";
import { fetchArticleCoordinates } from "./lib/wiki.js";
import { titleFromWikipediaUrl } from "./lib/lead.js";
import { rederiveStartDate, rederiveWikipediaPin, wikipediaPinCheck, REDERIVED_START_RULES } from "./lib/rederive.js";

const APPLY = process.argv.includes("--apply");
const file = new URL("../data/events.json", import.meta.url);
const log = (m) => process.stderr.write(`\r${m}      `);

const events = JSON.parse(await readFile(file, "utf-8"));
const withQid = events.filter((e) => e.wikidata_qid);
const entities = await fetchEntities(withQid.map((e) => e.wikidata_qid), { props: "claims", log });
const pinned = events.filter((e) => e.coordinate_source === "wikipedia" && e.coordinates);
const articles = await fetchArticleCoordinates(pinned.map((e) => titleFromWikipediaUrl(e.wikipedia_url)));
process.stderr.write("\n");

const fmtPt = (c) => (c ? `${c.lat}, ${c.lon}` : "none");
const starts = [];
const pins = [];
const listed = [];
for (const e of events) {
  const entity = entities.get(e.wikidata_qid) ?? null;
  const s = rederiveStartDate(e, entity);
  if (s) starts.push(s);
  if (e.coordinate_source !== "wikipedia") continue;
  const article = articles.get(titleFromWikipediaUrl(e.wikipedia_url));
  const p625 = entity?.p625 ?? null;
  const check = wikipediaPinCheck(e, article, p625);
  if (check?.kind === "article_differs") listed.push(`${e.id} (${e.wikidata_qid}): stored ${fmtPt(e.coordinates)}; article now ${fmtPt(article)}; P625 ${fmtPt(p625)}`);
  const p = rederiveWikipediaPin(e, article, p625);
  if (p) pins.push({ ...p, p625 });
}

console.log(`${events.length} curated events; start rule cases re-derived: ${REDERIVED_START_RULES.join(", ")}.`);
console.log(`\ndate_start re-derived (${starts.length}):`);
for (const s of starts) console.log(`  ${s.id} (${s.qid}): ${s.from} (${s.fromPrecision ?? "no"} precision) -> ${s.to} (${s.toPrecision}); ${s.reason}`);
console.log(`\n"wikipedia" pins re-derived, article and P625 agree (${pins.length}):`);
for (const p of pins) console.log(`  ${p.id} (${p.qid}): ${fmtPt(p.from)} -> ${fmtPt(p.to)} (P625 ${fmtPt(p.p625)})`);
console.log(`\n"wikipedia" pins the article no longer gives, P625 does not agree: listed, not changed (${listed.length}):`);
for (const l of listed) console.log(`  ${l}`);

if (APPLY && (starts.length || pins.length)) {
  await writeFileAtomic(file, JSON.stringify(events, null, 2) + "\n");
  console.log(`\nwrote ${starts.length + pins.length} change(s) to data/events.json`);
} else if (!APPLY) {
  console.log("\ndry run: nothing written (--apply writes data/events.json)");
}
