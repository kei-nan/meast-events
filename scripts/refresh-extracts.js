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
// real changes (each check is recorded by the refresh workflow's run history). With --apply the curated file is
// written. Apart from titles (below), nothing else in an event is touched.
//
// Titles follow Wikipedia the same way: the same fetch tells whether each event's `title` is still the current
// article title (an article renamed on Wikipedia, or a stored URL that now redirects; lib/title-refresh.js).
// A dry run lists the changes; --apply writes the plain renames (`title`, and `wikipedia_url` when the stored URL
// redirects). Cases that are not a plain rename (redirect to a section, another Wikidata item, a stored title that
// Wikipedia does not redirect to the article) are held: never applied, only listed. Event ids never change.
import { readFile, writeFile } from "node:fs/promises";
import { fetchLeads, titleFromWikipediaUrl } from "./lib/lead.js";
import { detectTitleChange, checkFormerTitle, applyTitleChanges, titleReport } from "./lib/title-refresh.js";

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
const clip = (s, n = 160) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

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
  const out = { changed: [], unchanged: 0, missing: [], titles: [], checked: targets.length };
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
    const d = diffLeads(e.extract, lead.extract);
    out.changed.push({ id: e.id, title: e.title, from: e.extract_retrieved_at ?? null, d, redirected_from: lead.redirected_from });
    if (APPLY) {
      e.extract = lead.extract;
      e.extract_retrieved_at = today;
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

const lines = [];
const say = (s = "") => {
  console.log(s);
  lines.push(s);
};

const curated = await read(curatedUrl);
const res = await refresh(curated, "curated", "curated");
const propRes = PROPOSED ? { events: await read(proposedUrl) } : null;
if (propRes) propRes.res = await refresh(propRes.events, "proposed", "proposed");

const results = [["curated", res], ...(propRes ? [["proposed", propRes.res]] : [])];
// titles first, so a long list of changed leads can never push them out of a truncated PR description
for (const [name, r] of results) say("\n" + titleReport(r.titles, { name, applied: APPLY }));
for (const [name, r] of results) {
  say(`\n## ${name}: ${r.changed.length} changed, ${r.unchanged} identical, ${r.missing.length} missing`);
  for (const c of r.changed) {
    say(`\n- ${c.id} ("${c.title}") stored ${c.from ?? "?"}: ${c.d.lenBefore} -> ${c.d.lenAfter} chars, -${c.d.removed.length} +${c.d.added.length} sentences`);
    for (const s of c.d.removed.slice(0, MAX_LINES)) say(`    - ${clip(s)}`);
    if (c.d.removed.length > MAX_LINES) say(`    - ... ${c.d.removed.length - MAX_LINES} more removed`);
    for (const s of c.d.added.slice(0, MAX_LINES)) say(`    + ${clip(s)}`);
    if (c.d.added.length > MAX_LINES) say(`    + ... ${c.d.added.length - MAX_LINES} more added`);
  }
  if (r.missing.length) say(`\nNo lead returned for: ${r.missing.join(", ")}`);
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
