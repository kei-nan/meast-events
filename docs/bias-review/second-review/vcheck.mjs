// Checks one verification output against its input: node vcheck.mjs 03
import { readFileSync } from "node:fs";
const dir = new URL(".", import.meta.url);
const n = String(process.argv[2] ?? "").padStart(2, "0");
const input = JSON.parse(readFileSync(new URL(`in/v-${n}.json`, dir), "utf8"));
let out;
try { out = JSON.parse(readFileSync(new URL(`out/v-${n}.json`, dir), "utf8")); }
catch (e) { console.log(`FAIL cannot read out/v-${n}.json: ${e.message}`); process.exit(1); }
const KEYS = new Set(["LABEL", "EDITORIAL", "DOUBT", "SAID", "PUFFERY", "NPOV"]);
const errs = [];
const tally = { keep: 0, correct: 0, drop: 0, wkeep: 0, wdrop: 0 };
for (const e of input) {
  const r = out[e.id];
  if (!r) { errs.push(`${e.id}: missing`); continue; }
  const has = (p) => typeof p === "string" && p.length > 0 && e.text.includes(p);
  if (e.to_check.fairness) {
    const f = r.fairness;
    if (!f || !["keep", "correct", "drop"].includes(f.verdict)) { errs.push(`${e.id}: fairness.verdict must be keep|correct|drop`); }
    else {
      tally[f.verdict]++;
      if (typeof f.reason !== "string" || f.reason.length < 10) errs.push(`${e.id}: fairness.reason missing`);
      if (f.verdict !== "drop") {
        if (typeof f.note !== "string" || f.note.length < 20) errs.push(`${e.id}: fairness.note missing`);
        if (!Array.isArray(f.phrases)) errs.push(`${e.id}: fairness.phrases must be an array`);
        for (const p of f.phrases ?? []) if (!has(p)) errs.push(`${e.id}: phrase not word for word: ${JSON.stringify(p)}`);
      }
      for (const s of f.sources ?? []) if (!/^https?:\/\//.test(s.url ?? "")) errs.push(`${e.id}: source without a URL: ${JSON.stringify(s)}`);
    }
  } else if (r.fairness != null) errs.push(`${e.id}: fairness must be null (nothing to check)`);
  const w = r.wording ?? [];
  if (w.length !== e.to_check.wording.length) errs.push(`${e.id}: wording needs one verdict per point to check (${e.to_check.wording.length})`);
  for (const x of w) {
    if (!["keep", "drop"].includes(x.verdict)) { errs.push(`${e.id}: wording verdict must be keep|drop`); continue; }
    tally[x.verdict === "keep" ? "wkeep" : "wdrop"]++;
    if (typeof x.reason !== "string" || x.reason.length < 10) errs.push(`${e.id}: wording reason missing`);
    if (x.verdict === "keep") {
      if (!KEYS.has(x.guideline)) errs.push(`${e.id}: unknown guideline ${x.guideline}`);
      if (!has(x.phrase)) errs.push(`${e.id}: wording phrase not word for word: ${JSON.stringify(x.phrase)}`);
      if (typeof x.note !== "string" || x.note.length < 20) errs.push(`${e.id}: wording note missing`);
    }
  }
}
if (errs.length) { console.log(`FAIL v-${n}: ${errs.length} problem(s)\n` + errs.join("\n")); process.exit(1); }
console.log(`OK v-${n}: ${input.length} events; fairness keep ${tally.keep}, correct ${tally.correct}, drop ${tally.drop}; wording keep ${tally.wkeep}, drop ${tally.wdrop}`);
