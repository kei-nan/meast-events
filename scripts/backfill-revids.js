// One-off (re-runnable) backfill of `wikipedia_revid` and `wikipedia_revid_timestamp` (docs/DATA_POLICY.md, "Revision").
//
//   node scripts/backfill-revids.js                         DRY RUN (default): fetches every lead and prints the counts, writes nothing
//   node scripts/backfill-revids.js --apply                 also writes data/events.json
//   node scripts/backfill-revids.js --historical [--apply]  for events still without a revision: look for the OLD revision whose
//                                                           lead equals the stored text (see below)
//
// Default mode: for each event without a revision, it fetches the article's current lead, revision and that revision's
// timestamp in one request per batch (lib/lead.js, uncached, through lib/http.js politeFetch) and stores the revision
// and its timestamp ONLY when the current lead equals the stored `extract` exactly; otherwise both stay absent (we
// cannot say which revision the stored text came from). Nothing else in any event changes: not the text, not
// `extract_retrieved_at`, not the titles. Events that already have a revision are kept as they are, so running it
// again (for example after a rebase) only fills the gaps.
//
// --historical: for each event still without a revision (its article's lead changed after we read it), it walks the
// article's revisions back from the current one to a few days before `extract_retrieved_at` (lib/rev-lead.js
// fetchRevisions: 50 revisions per request, with the wikitext of section 0 only), groups consecutive revisions with
// the same lead wikitext, and checks the groups nearest the retrieval day first. A group's lead is the revision's
// parsed HTML (action=parse&oldid) converted to plain text the way TextExtracts does, then lib/lead.js normalizeLead,
// so "equal" means what it means above. Both fields are set only on an EXACT match, to the matching revision current
// on the retrieval day if there is one, else to the matching revision nearest that day. Never a "close" one. The
// conversion is trusted for an article only when it reproduces the article's current TextExtracts lead exactly
// (converted current revision === current lead); otherwise the event is left without a revision. If nothing matches
// within RECENT_DAYS, it looks further back, to WIDE_DAYS. The stored text and every other field stay as they are.
import { readFile, writeFile } from "node:fs/promises";
import { fetchLeads, titleFromWikipediaUrl } from "./lib/lead.js";
import { backfillRevid, isRevid, isRevTimestamp, setRevid } from "./lib/revid.js";
import { candidateRuns, fetchRevisions, htmlLead, parseRevisionHtml } from "./lib/rev-lead.js";
import { sleep } from "./lib/http.js";

// Days before `extract_retrieved_at` the revision walk reaches: first RECENT_DAYS, then, if nothing matched, WIDE_DAYS.
const RECENT_DAYS = 7;
const WIDE_DAYS = 120;
const DELAY_MS = 500;
const DAY_MS = 86_400_000;

const APPLY = process.argv.includes("--apply");
const HISTORICAL = process.argv.includes("--historical");
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

if (HISTORICAL) await historical();
else current();

if (APPLY) {
  await writeFile(file, JSON.stringify(events, null, 2) + "\n");
  console.log("APPLIED: wrote data/events.json (wikipedia_revid and wikipedia_revid_timestamp only).");
} else {
  console.log("Dry run - nothing written. Re-run with --apply to write.");
}

function current() {
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
}

async function historical() {
  const parsed = new Map(); // revid -> normalised lead of its parsed HTML (null: could not convert)
  const leadOfRevision = async (revid) => {
    if (!parsed.has(revid)) {
      await sleep(DELAY_MS);
      parsed.set(revid, htmlLead(await parseRevisionHtml(revid)));
    }
    return parsed.get(revid);
  };
  const results = [];
  for (const [i, e] of todo.entries()) {
    const lead = leads.get(titleFromWikipediaUrl(e.wikipedia_url));
    const r = { id: e.id, result: null, note: "" };
    results.push(r);
    process.stdout.write(`\r${i + 1}/${todo.length} ${e.id}                                        `);
    if (!lead?.extract || !isRevid(lead.lastrevid)) {
      r.result = "missing";
      r.note = "no current lead or revision returned";
      continue;
    }
    if (lead.extract === e.extract) {
      r.result = "current";
      r.note = "current lead equals the stored text (run without --historical)";
      continue;
    }
    // Gate: the conversion must reproduce this article's current TextExtracts lead exactly.
    if ((await leadOfRevision(lead.lastrevid)) !== lead.extract) {
      r.result = "unverifiable";
      r.note = `converted current revision ${lead.lastrevid} != current TextExtracts lead`;
      continue;
    }
    const anchor = `${e.extract_retrieved_at}T23:59:59Z`;
    const tried = new Set();
    for (const days of [RECENT_DAYS, WIDE_DAYS]) {
      const until = new Date(Date.parse(`${e.extract_retrieved_at}T00:00:00Z`) - days * DAY_MS).toISOString();
      await sleep(DELAY_MS);
      const revs = await fetchRevisions(lead.title, until, { delayMs: DELAY_MS, maxRequests: days === RECENT_DAYS ? 4 : 20 });
      if (!revs?.length) break;
      const anchorRevid = revs.find((x) => x.timestamp <= anchor)?.revid;
      r.oldest = revs[revs.length - 1].timestamp;
      r.revisions = revs.length;
      for (const c of candidateRuns(revs, anchor)) {
        if (tried.has(c.revid)) continue;
        tried.add(c.revid);
        if ((await leadOfRevision(c.revid)) === e.extract) {
          setRevid(e, c.revid, c.timestamp);
          r.result = "set";
          r.note = `${c.revid} (${c.timestamp}); ${c.revids.includes(anchorRevid) ? "current on the retrieval day" : "nearest matching revision to the retrieval day"}`;
          break;
        }
      }
      if (r.result) break;
      r.result = "nomatch";
      r.note = `no revision back to ${r.oldest} (${r.revisions} revisions, ${tried.size} distinct leads) has the stored text`;
    }
    if (!r.result) {
      r.result = "missing";
      r.note = "no revisions returned";
    }
  }
  console.log();
  const counts = {};
  for (const r of results) counts[r.result] = (counts[r.result] ?? 0) + 1;
  console.log(`historical: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join("; ")} (of ${todo.length})`);
  for (const r of results) console.log(`  ${r.result.padEnd(12)} ${r.id}: ${r.note}`);
}
