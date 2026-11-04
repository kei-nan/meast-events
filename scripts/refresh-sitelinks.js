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
// and aliases; one that never had a count stays without one (listed last). An event whose item now redirects to
// another (a merged item) is skipped the same way and listed in a warning: the target's values are not its own.
//
// The aliases are Wikidata's English "also known as" values, stored as-is in Wikidata's order; an item
// with none has no `wikidata_aliases` field.
//
// It also stores `date_end_open` for an event with no date_end whose item gives its end time (P582) as
// "no value" or "unknown value" (lib/wd-entities.js setDateEndOpen); the app counts such an event in every
// year from its start to the current year (docs/DATA_POLICY.md, "Ongoing events"). Refreshed in both modes.
import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "./lib/files.js";
import { fetchEntities, refreshFromEntities } from "./lib/wd-entities.js";

const APPLY = process.argv.includes("--apply");
const ALIASES_ONLY = process.argv.includes("--aliases-only");
const curatedUrl = new URL("../data/events.json", import.meta.url);
const events = JSON.parse(await readFile(curatedUrl, "utf-8"));

const entities = await fetchEntities(
  events.map((e) => e.wikidata_qid),
  { props: "sitelinks|aliases|claims", log: (m) => console.log(m) }
);

// A merged item (its QID now redirects) is skipped: Wikidata answers with the target item, whose sitelinks, aliases
// and end time are not necessarily this event's. The QID is for the owner to review (the drift report lists it too).
const { changed, aliasesChanged, openChanged, missing, redirected } = refreshFromEntities(events, entities, {
  aliasesOnly: ALIASES_ONLY,
  log: (m) => console.log(m),
});

const withAliases = events.filter((e) => e.wikidata_aliases).length;
const aliasCount = events.reduce((n, e) => n + (e.wikidata_aliases?.length ?? 0), 0);
console.log(
  `\n${ALIASES_ONLY ? "Sitelink counts not refreshed (--aliases-only)." : `${changed} of ${events.length} counts changed.`}` +
    `\n${aliasesChanged} events' aliases changed; ${withAliases} events have aliases (${aliasCount} in total).` +
    `
${openChanged} events' date_end_open changed; ${events.filter((e) => e.date_end_open).length} events have one.`
);
if (missing.length) console.log(`Not fetched (previous count and aliases kept): ${missing.join(", ")}`);
if (redirected.length) {
  // stdout, so refresh-data.yml puts it in the refresh report and pull request description.
  console.log(
    `\nWARNING: ${redirected.length} event(s) whose Wikidata item now redirects to another (merged); nothing changed for ` +
      `them (previous count, aliases and date_end_open kept), review the QID: ${redirected.join(", ")}`
  );
}
if (APPLY) {
  await writeFileAtomic(curatedUrl, JSON.stringify(events, null, 2) + "\n");
  console.log("APPLIED: wrote data/events.json.");
} else {
  console.log("Dry run - nothing written. Re-run with --apply.");
}
