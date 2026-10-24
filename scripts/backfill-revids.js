// One-off (re-runnable) backfill of `wikipedia_revid` and `wikipedia_revid_timestamp` (docs/DATA_POLICY.md, "Revision").
//
//   node scripts/backfill-revids.js            DRY RUN (default): fetches every lead and prints the counts, writes nothing
//   node scripts/backfill-revids.js --apply    also writes data/events.json
//
// For each event without a revision, it fetches the article's current lead, revision and that revision's timestamp in
// one request per batch (lib/lead.js, uncached, through lib/http.js politeFetch) and stores the revision and its
// timestamp ONLY when the current lead equals the stored `extract` exactly; otherwise both stay absent (we cannot say
// which revision the stored text came from). Nothing else in any event changes: not the text, not
// `extract_retrieved_at`, not the titles. Events that already have a revision are kept as they are, so running it
// again (for example after a rebase) only fills the gaps.
import { readFile, writeFile } from "node:fs/promises";
import { fetchLeads, titleFromWikipediaUrl } from "./lib/lead.js";
import { backfillRevid, isRevid, isRevTimestamp } from "./lib/revid.js";

const APPLY = process.argv.includes("--apply");
const file = new URL("../data/events.json", import.meta.url);
const events = JSON.parse(await readFile(file, "utf-8"));

const has = (e) => isRevid(e.wikipedia_revid) && isRevTimestamp(e.wikipedia_revid_timestamp);
const todo = events.filter((e) => e.wikipedia_url && !has(e));
console.log(`${events.length} events, ${events.length - todo.length} already have a revision or no article; fetching ${todo.length} leads ...`);
const leads = await fetchLeads(
  todo.map((e) => titleFromWikipediaUrl(e.wikipedia_url)),
  { cache: null, log: (m) => process.stdout.write(`\r${m}      `) }
);
console.log();

const counts = { set: 0, differs: 0, missing: 0, kept: events.length - todo.length };
const differs = [];
const missing = [];
for (const e of todo) {
  const r = backfillRevid(e, leads.get(titleFromWikipediaUrl(e.wikipedia_url)));
  counts[r]++;
  if (r === "differs") differs.push(e.id);
  if (r === "missing") missing.push(e.id);
}
console.log(
  `set ${counts.set}; text changed since retrieval (left without a revision) ${counts.differs}; no lead/revision/timestamp returned ${counts.missing}; already set or no article ${counts.kept}`
);
if (differs.length) console.log(`changed since retrieval: ${differs.join(", ")}`);
if (missing.length) console.log(`nothing returned: ${missing.join(", ")}`);

if (APPLY) {
  await writeFile(file, JSON.stringify(events, null, 2) + "\n");
  console.log("APPLIED: wrote data/events.json (wikipedia_revid and wikipedia_revid_timestamp only).");
} else {
  console.log("Dry run - nothing written. Re-run with --apply to write.");
}
