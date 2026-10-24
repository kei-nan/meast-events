// Re-fetches the English Wikipedia lead of every event and reports what changed. Run monthly
// by .github/workflows/refresh-data.yml (see docs/DATA_POLICY.md, "Refreshing extracts").
//
//   node scripts/refresh-extracts.js                 DRY RUN (default): prints title changes and every changed lead as a diff, writes nothing
//   node scripts/refresh-extracts.js --apply         writes the new leads and titles (never silently: everything is printed)
//   node scripts/refresh-extracts.js --proposed      also check data/events.proposed.json (default: curated file only)
//   node scripts/refresh-extracts.js --only=id1,id2  limit to some ids
//   node scripts/refresh-extracts.js --max-lines=N   diff lines per event in the printout (default 6)
//   node scripts/refresh-extracts.js --report=path   also write the printout to a markdown file
//
// Rules: the lead text is Wikipedia's, only whitespace-normalised (lib/lead.js). `extract_retrieved_at` is set
// to today only for leads whose text changed, so an unchanged event is not touched and a refresh diff shows only
// real changes (each check is recorded by the refresh workflow's run history). With each lead it writes it also
// writes `wikipedia_revid` and `wikipedia_revid_timestamp`, the revision that lead came from and its date
// (lib/revid.js). With --apply the curated file is
// written. Apart from titles (below), nothing else in an event is touched. A lead is never copied when the fetched
// article belongs to a different Wikidata item than the event's wikidata_qid (the stored URL leads to another
// subject's article); such updates are held and listed under "held" (lib/title-refresh.js detectExtractHold).
// The exception is an event without an article of its own whose article is another event's: with --apply it
// takes that event's (just refreshed) stored text, so the two show the same text (lib/mirrors.js).
//
// Titles follow Wikipedia the same way: the same fetch tells whether each event's `title` is still the current
// article title (an article renamed on Wikipedia, or a stored URL that now redirects; lib/title-refresh.js).
// A dry run lists the changes; --apply writes the plain renames (`title`, and `wikipedia_url` when the stored URL
// redirects). Cases that are not a plain rename (redirect to a section, another Wikidata item, a stored title that
// Wikipedia does not redirect to the article) are held: never applied, only listed. Event ids never change.
import { readFile, writeFile } from "node:fs/promises";
import { fetchLeads, titleFromWikipediaUrl } from "./lib/lead.js";
import {
  detectTitleChange,
  checkFormerTitle,
  applyTitleChanges,
  titleReport,
  detectExtractHold,
  extractHoldReport,
  leadChangeReport,
} from "./lib/title-refresh.js";
import { syncMirrorTexts } from "./lib/mirrors.js";
import { setRevid } from "./lib/revid.js";

const APPLY = process.argv.includes("--apply");
const PROPOSED = process.argv.includes("--proposed");
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const ONLY = arg("only")?.split(",").filter(Boolean) ?? null;
const MAX_LINES = Number(arg("max-lines") ?? 6);
const REPORT = arg("report");
const today = new Date().toISOString().slice(0, 10);

const curatedUrl = new URL("../data/events.json", import.meta.url);
const proposedUrl = new URL("../data/events.proposed.json", import.meta.url);
const read = async (u) => JSON.parse(await readFile(u, "utf-8"));

const sentences = (t) =>
  t
    .split(/\n\n/)
    .flatMap((p) => p.split(/(?<=[.!?\]"'”])\s+(?=[A-Z0-9"'“(])/))
    .map((s) => s.trim())
    .filter(Boolean);

export function diffLeads(oldText, newText) {
  const a = sentences(oldText ?? "");
  const b = sentences(newText ?? "");
  const A = new Set(a);
  const B = new Set(b);
  return {
    removed: a.filter((s) => !B.has(s)),
    added: b.filter((s) => !A.has(s)),
    lenBefore: (oldText ?? "").length,
    lenAfter: (newText ?? "").length,
  };
}

async function refresh(events, label, file) {
  const targets = events.filter((e) => e.wikipedia_url && (!ONLY || ONLY.includes(e.id)));
  const titles = targets.map((e) => titleFromWikipediaUrl(e.wikipedia_url));
  console.log(`${label}: re-fetching ${targets.length} leads (no cache) ...`);
  const leads = await fetchLeads(titles, { cache: null, log: (m) => process.stdout.write(`\r${m}      `) });
  console.log();
  const out = { changed: [], unchanged: 0, missing: [], held: [], titles: [], checked: targets.length };
  for (const e of targets) {
    const lead = leads.get(titleFromWikipediaUrl(e.wikipedia_url));
    const tc = detectTitleChange(e, lead);
    if (tc) out.titles.push({ file, ...tc });
    if (!lead?.extract) {
      out.missing.push(e.id);
      continue;
    }
    if (lead.extract === e.extract) {
      out.unchanged++;
      continue;
    }
    // the article is another Wikidata item's (lib/title-refresh.js detectExtractHold): never copy its lead
    const held = detectExtractHold(e, lead);
    if (held) {
      out.held.push(held);
      continue;
    }
    const d = diffLeads(e.extract, lead.extract);
    out.changed.push({ id: e.id, title: e.title, from: e.extract_retrieved_at ?? null, d, redirected_from: lead.redirected_from });
    if (APPLY) {
      e.extract = lead.extract;
      e.extract_retrieved_at = today;
      // the revision this lead came from and its date (lib/revid.js); both absent if the API gave either not
      setRevid(e, lead.lastrevid, lead.lastrev_timestamp);
    }
  }
  // A "title out of date" proposal stands only if Wikipedia redirects the stored title to the same article
  // (i.e. the article was renamed); otherwise it is held (lib/title-refresh.js checkFormerTitle).
  const stale = out.titles.filter((c) => !c.hold && c.kind === "title_stale");
  if (stale.length) {
    console.log(`${label}: checking whether Wikipedia redirects ${stale.length} stored titles to their articles ...`);
    const old = await fetchLeads(stale.map((c) => c.old_title), { cache: null });
    out.titles = out.titles.map((c) => (c.kind === "title_stale" && !c.hold ? checkFormerTitle(c, old.get(c.old_title)) : c));
  }
  if (APPLY) {
    const r = applyTitleChanges(events, out.titles);
    const skipped = new Map([...r.stale, ...r.unknown].map((id) => [id, "event changed during the run"]));
    for (const id of r.duplicate) skipped.set(id, "another event already has that title");
    // anything not written is reported as held, so the printout never claims a change that was not made
    out.titles = out.titles.map((c) =>
      skipped.has(c.id) ? { ...c, hold: "not_applied", detail: skipped.get(c.id) } : c
    );
  }
  return out;
}

// The printout is also the PR description (refresh-data.yml), so every Wikipedia title and sentence in it is a
// code span (lib/title-refresh.js mdCode, leadChangeReport): an edit to an article cannot hide part of the
// description or ping anyone.
const lines = [];
const say = (s = "") => {
  console.log(s);
  lines.push(s);
};

const curated = await read(curatedUrl);
const res = await refresh(curated, "curated", "curated");
// An event without an article of its own that shows another event's article (its "source") follows that
// event's text (lib/mirrors.js); its framing review is redone together with the source's.
const mirrored = APPLY ? syncMirrorTexts(curated) : [];
const propRes = PROPOSED ? { events: await read(proposedUrl) } : null;
if (propRes) propRes.res = await refresh(propRes.events, "proposed", "proposed");

const results = [["curated", res], ...(propRes ? [["proposed", propRes.res]] : [])];
// titles first, so a long list of changed leads can never push them out of a truncated PR description
for (const [name, r] of results) say("\n" + titleReport(r.titles, { name, applied: APPLY }));
for (const [name, r] of results) {
  say(`\n## ${name}: ${r.changed.length} changed, ${r.unchanged} identical, ${r.held.length} held, ${r.missing.length} missing`);
  if (r.held.length) say("\n" + extractHoldReport(r.held, { name }));
  for (const c of r.changed) say("\n" + leadChangeReport(c, { maxLines: MAX_LINES }));
  if (r.missing.length) say(`\nNo lead returned for: ${r.missing.join(", ")}`);
}
if (mirrored.length) {
  say(`\n## Events that show another event's article: ${mirrored.length} now follow its new text`);
  for (const id of mirrored) say(`- ${id}`);
}

if (APPLY) {
  const text = JSON.stringify(curated, null, 2) + "\n";
  await writeFile(curatedUrl, text);
  if (propRes) await writeFile(proposedUrl, JSON.stringify(propRes.events, null, 2) + "\n");
  say(`\nAPPLIED: wrote data/events.json${propRes ? " and data/events.proposed.json" : ""}: changed leads (extract_retrieved_at = ${today}) and titles.`);
} else {
  say("\nDry run - nothing written. Review the title changes and lead diffs above, then re-run with --apply.");
}
if (REPORT) await writeFile(REPORT, lines.join("\n") + "\n");
