// Merges data/events.proposed.json into the curated data/events.json. Run by the USER, deliberately.
//
//   node scripts/merge-proposed.js                 DRY RUN (default): prints what would change, writes nothing
//   node scripts/merge-proposed.js --apply         writes data/events.json
//   node scripts/merge-proposed.js --skip-duplicate-hints
//                                                  leave out proposed events that carry a possible_duplicates hint
//                                                  (by default they are merged with the hint kept as a review note)
//   node scripts/merge-proposed.js --no-add         add no proposed event; only apply the rules below to the curated file
//   node scripts/merge-proposed.js --only=ID,ID     add only these proposed events (each id must be in the proposed
//                                                  file and not excluded by review); the rules below still apply
//   node scripts/merge-proposed.js --allow-unreviewed
//                                                  let --apply add events that have no entry in framing-review.json
//                                                  (by default --apply refuses them; the dry run lists them)
//   node scripts/merge-proposed.js --data-dir=DIR  read/write events.json, events.proposed.json,
//                                                  proposed-exclusions.json and framing-review.json in DIR instead of
//                                                  data/ (tests)
//
// Nothing is rewritten: proposed events are appended exactly as proposed. Proposed events whose id or wikidata_qid
// already exists in the curated file are skipped and listed.
// Reviewed exclusions (proposed-exclusions.json, lib/exclusions.js) match a proposed event by id or by wikidata_qid,
// so a renamed article (new slug id, same item) stays excluded; entries that match nothing are listed as warnings.
// Framing review (framing-review.json, keyed by event id under "events"): every event shown on the site has one,
// so --apply refuses to add an event without an entry unless --allow-unreviewed is given. A review whose text_sha1
// no longer matches the extract (stale) is listed but not refused; the site marks it "may no longer apply".
// Rules applied to the curated file on every run (listed in the dry run, written with --apply):
//   - "Not events" (docs/DATA_POLICY.md; NOT_EVENT_CLASSES in lib/event-classes.js): a curated entry whose Wikidata
//     classes include a person, organisation, state or country-history class is removed; a proposed one is not added.
//   - Re-derived date-order flags (lib/order-flags.js): a curated event that is also in the proposed file (same id and
//     QID, same dates and extract) takes the proposed record's date_order_invalid / date_end_precision_coarse /
//     wikipedia_dates_note flags and wikipedia_lead_dates, so a pipeline fix to those flags reaches the curated record.
//     Nothing else of the curated record changes. Since 2026-11-03 curated events are not re-proposed
//     (enrich-candidates.js, lib/enrich-run.js withoutCurated), so this finds nothing to copy unless a proposed file
//     written before then is merged; kept for that case.
import { readFile } from "node:fs/promises";
import { readJsonIfExists, writeFileAtomic } from "./lib/files.js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validateEvents, findClashes, textSha1 } from "./lib/validate.js";
import { notEventClasses } from "./lib/event-classes.js";
import { refreshOrderFlags } from "./lib/order-flags.js";
import { checkExclusionEntries, matchExclusions, exclusionSummary } from "./lib/exclusions.js";

const APPLY = process.argv.includes("--apply");
const SKIP_DUP = process.argv.includes("--skip-duplicate-hints");
const NO_ADD = process.argv.includes("--no-add");
const ALLOW_UNREVIEWED = process.argv.includes("--allow-unreviewed");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean) : null;
if (ONLY && !ONLY.length) {
  console.error("--only= needs at least one proposed event id (comma-separated)");
  process.exit(1);
}
if (ONLY && NO_ADD) {
  console.error("--only and --no-add contradict each other (--no-add adds nothing)");
  process.exit(1);
}
const dataDirArg = process.argv.find((a) => a.startsWith("--data-dir="))?.split("=").slice(1).join("=");
const dataDir = dataDirArg ? pathToFileURL(resolve(dataDirArg) + "/") : new URL("../data/", import.meta.url);

const curatedUrl = new URL("events.json", dataDir);
const proposedUrl = new URL("events.proposed.json", dataDir);

const read = async (u) => JSON.parse(await readFile(u, "utf-8"));

const curatedIn = await read(curatedUrl);
const notEvent = (e) => notEventClasses(e.wikidata_classes).map((c) => c.label);
const removedNotEvents = curatedIn.filter((e) => notEvent(e).length);
const curated = curatedIn.filter((e) => !notEvent(e).length);
const exclusionsUrl = new URL("proposed-exclusions.json", dataDir);
// Absent: no reviewed exclusions. Present but unreadable or malformed: fail, never merge as if empty.
const exclusions = await readJsonIfExists(exclusionsUrl, []);
const exclusionErrors = checkExclusionEntries(exclusions);
if (exclusionErrors.length) {
  console.error(`data/proposed-exclusions.json is malformed (${exclusionErrors.length} problem(s)); refusing to merge:`);
  for (const e of exclusionErrors) console.error("  " + e);
  process.exit(1);
}
// Reviewed exclusions (data/proposed-exclusions.json, each with a stated reason) are left out, matched by id or QID.
const proposedAll = await read(proposedUrl);
const excl = matchExclusions(exclusions, proposedAll);
const proposed = proposedAll.filter((e) => !excl.isExcluded(e));
console.log(`Excluded by review (data/proposed-exclusions.json): ${excl.excludedIds.size} proposed event(s); ${exclusionSummary(exclusions, excl)}`);
for (const m of excl.matched) console.log(`      ${m.ids.join(", ")} (by ${m.by})`);
for (const w of excl.warnings) console.warn(`  warn ${w.replace("matches no event", "matches no proposed event")}`);

if (ONLY) {
  const allIds = new Set(proposedAll.map((e) => e.id));
  const unknown = ONLY.filter((id) => !allIds.has(id));
  const excludedOnly = ONLY.filter((id) => excl.excludedIds.has(id));
  if (unknown.length || excludedOnly.length) {
    if (unknown.length) console.error(`--only: not in the proposed file: ${unknown.join(", ")}`);
    if (excludedOnly.length) console.error(`--only: excluded by review (data/proposed-exclusions.json): ${excludedOnly.join(", ")}`);
    process.exit(1);
  }
}

const pv = validateEvents(proposed, { name: "events.proposed" });
if (pv.errors.length) {
  console.error(`Proposed file is invalid (${pv.errors.length} violation(s)); refusing to merge:`);
  for (const e of pv.errors.slice(0, 20)) console.error("  " + e);
  process.exit(1);
}

const proposedById = new Map(proposed.map((e) => [e.id, e]));
const flagsRefreshed = curated.filter((e) => {
  const p = proposedById.get(e.id);
  return p && p.wikidata_qid === e.wikidata_qid && refreshOrderFlags(e, p);
});

const clashes = findClashes(curated, proposed);
const clashIds = new Set(clashes.map((c) => c.event.id));
const proposedNotEvents = proposed.filter((e) => !clashIds.has(e.id) && notEvent(e).length);
let incoming = NO_ADD ? [] : proposed.filter((e) => !clashIds.has(e.id) && !notEvent(e).length);
if (ONLY) incoming = incoming.filter((e) => ONLY.includes(e.id));
const dupHinted = incoming.filter((e) => e.possible_duplicates?.length);
if (SKIP_DUP) incoming = incoming.filter((e) => !e.possible_duplicates?.length);
const onlyNotAdded = ONLY ? ONLY.filter((id) => !incoming.some((e) => e.id === id)) : [];

// Framing review coverage of what would be added (keyed by event id under "events").
const framing = await readJsonIfExists(new URL("framing-review.json", dataDir), { events: {} });
const reviews = framing?.events && typeof framing.events === "object" ? framing.events : {};
const unreviewed = incoming.filter((e) => !reviews[e.id]);
const staleReview = incoming.filter((e) => reviews[e.id] && reviews[e.id].text_sha1 !== textSha1(e.extract));

// Also guard QID clashes within the incoming set against curated after id filtering.
const merged = [...curated, ...incoming];
// Strict, like the proposed file: what is written to data/events.json must pass every rule, not the curated-mode
// leniency (missing wikidata_qid, null coordinates with a location_quality other than "none" as warnings).
const mv = validateEvents(merged, { name: "merged" });
if (mv.errors.length) {
  console.error(`Merged result would be invalid (${mv.errors.length} violation(s)); refusing:`);
  for (const e of mv.errors.slice(0, 20)) console.error("  " + e);
  process.exit(1);
}

const byCat = {};
for (const e of incoming) byCat[e.category] = (byCat[e.category] ?? 0) + 1;

console.log(`${APPLY ? "APPLY" : "DRY RUN"} - merge-proposed`);
console.log(`  curated events now:              ${curatedIn.length}`);
console.log(`  removed, not events (rule):      ${removedNotEvents.length}`);
for (const e of removedNotEvents) console.log(`      ${e.id} (${notEvent(e).join(", ")})`);
console.log(`  date-order flags re-derived:     ${flagsRefreshed.length}`);
for (const e of flagsRefreshed) console.log(`      ${e.id}: ${(e.date_flags ?? []).map((f) => f.split(":")[0]).join(", ") || "(none)"}`);
if (proposedNotEvents.length) console.log(`  proposed, not events (not added): ${proposedNotEvents.map((e) => e.id).join(", ")}`);
console.log(`  proposed events:                 ${proposed.length}`);
console.log(`  skipped (id/QID already curated): ${clashes.length}`);
for (const c of clashes) console.log(`      ${c.event.id} (${c.reasons.join(", ")})`);
console.log(`  with possible-duplicate hints:   ${dupHinted.length}${SKIP_DUP ? " (skipped by --skip-duplicate-hints)" : " (merged; hint kept in review_reasons)"}`);
console.log(`  with any review flag:            ${incoming.filter((e) => e.needs_review).length}`);
console.log(`  without a framing review:        ${unreviewed.length}${unreviewed.length ? (ALLOW_UNREVIEWED ? " (--allow-unreviewed)" : " (--apply refuses them)") : ""}`);
for (const e of unreviewed) console.log(`      ${e.id}`);
if (staleReview.length) {
  console.log(`  framing review stale (text changed since): ${staleReview.length}`);
  for (const e of staleReview) console.log(`      ${e.id}`);
}
if (ONLY) {
  console.log(`  --only:                          ${ONLY.length} requested, ${incoming.length} to add`);
  if (onlyNotAdded.length) console.log(`      not added (already curated, not an event, or a skipped duplicate hint): ${onlyNotAdded.join(", ")}`);
}
console.log(`  would add:                       ${incoming.length}${NO_ADD ? " (--no-add)" : ""}  -> total ${merged.length}`);
console.log(`  by category:`, byCat);

if (!APPLY) {
  console.log(`\nDry run only - nothing was written. Re-run with --apply to write it.`);
} else if (unreviewed.length && !ALLOW_UNREVIEWED) {
  console.error(
    `\nRefusing to apply: ${unreviewed.length} event(s) to add have no framing review in data/framing-review.json ` +
      `(${unreviewed.map((e) => e.id).join(", ")}). Review them first, leave them out with --only=..., ` +
      "or add them unreviewed on purpose with --allow-unreviewed. Nothing was written."
  );
  process.exit(1);
} else {
  await writeFileAtomic(curatedUrl, JSON.stringify(merged, null, 2) + "\n");
  console.log(`\nWrote data/events.json (${merged.length} events).`);
}
