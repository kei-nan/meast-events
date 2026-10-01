// Re-fetches the English Wikipedia lead of every event and reports what changed. Run monthly
// by .github/workflows/refresh-data.yml (see docs/DATA_POLICY.md, "Refreshing extracts").
//
//   node scripts/refresh-extracts.js                 DRY RUN (default): prints every changed lead as a diff, writes nothing
//   node scripts/refresh-extracts.js --apply         writes the new leads (never silently: the diff is always printed)
//   node scripts/refresh-extracts.js --proposed      also check data/events.proposed.json (default: curated file only)
//   node scripts/refresh-extracts.js --only=id1,id2  limit to some ids
//   node scripts/refresh-extracts.js --max-lines=N   diff lines per event in the printout (default 6)
//   node scripts/refresh-extracts.js --report=path   also write the printout to a markdown file
//
// Rules: the lead text is Wikipedia's, only whitespace-normalised (lib/lead.js). `extract_retrieved_at` is set
// to today only for leads whose text changed, so an unchanged event is not touched and a refresh diff shows only
// real changes (each check is recorded by the refresh workflow's run history). With --apply the curated file is
// written. Nothing else in an event is touched.
import { readFile, writeFile } from "node:fs/promises";
import { fetchLeads, titleFromWikipediaUrl } from "./lib/lead.js";

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

async function refresh(events, label) {
  const targets = events.filter((e) => e.wikipedia_url && (!ONLY || ONLY.includes(e.id)));
  const titles = targets.map((e) => titleFromWikipediaUrl(e.wikipedia_url));
  console.log(`${label}: re-fetching ${targets.length} leads (no cache) ...`);
  const leads = await fetchLeads(titles, { cache: null, log: (m) => process.stdout.write(`\r${m}      `) });
  console.log();
  const out = { changed: [], unchanged: 0, missing: [] };
  for (const e of targets) {
    const lead = leads.get(titleFromWikipediaUrl(e.wikipedia_url));
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
  return out;
}

const lines = [];
const say = (s = "") => {
  console.log(s);
  lines.push(s);
};

const curated = await read(curatedUrl);
const res = await refresh(curated, "curated");
const propRes = PROPOSED ? { events: await read(proposedUrl) } : null;
if (propRes) propRes.res = await refresh(propRes.events, "proposed");

for (const [name, r] of [["curated", res], ...(propRes ? [["proposed", propRes.res]] : [])]) {
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
  say(`\nAPPLIED: wrote data/events.json${propRes ? " and data/events.proposed.json" : ""}. extract_retrieved_at = ${today} for changed leads.`);
} else {
  say("\nDry run - nothing written. Review the diffs above, then re-run with --apply.");
}
if (REPORT) await writeFile(REPORT, lines.join("\n") + "\n");
