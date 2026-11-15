// Checks one second-review output against its input batch: node check.mjs 07
// Every event reviewed once, fingerprints match, guideline keys valid, notes not trivial,
// and every phrase appears word for word in that event's text.
import { readFileSync } from "node:fs";
const dir = new URL(".", import.meta.url);
const n = String(process.argv[2] ?? "").padStart(2, "0");
const input = JSON.parse(readFileSync(new URL(`in/batch-${n}.json`, dir), "utf8"));
let out;
try {
  out = JSON.parse(readFileSync(new URL(`out/batch-${n}.json`, dir), "utf8"));
} catch (e) {
  console.log(`FAIL cannot read out/batch-${n}.json: ${e.message}`);
  process.exit(1);
}
const KEYS = new Set(["LABEL", "EDITORIAL", "DOUBT", "SAID", "PUFFERY", "NPOV"]);
const errs = [];
const byId = Object.fromEntries(input.map((e) => [e.id, e]));
for (const id of Object.keys(out)) if (!byId[id]) errs.push(`${id}: not in the input batch`);
for (const e of input) {
  const r = out[e.id];
  if (!r) { errs.push(`${e.id}: missing`); continue; }
  if (r.text_sha1 !== e.text_sha1) errs.push(`${e.id}: text_sha1 should be ${e.text_sha1}`);
  if (r.fairness !== null) {
    if (typeof r.fairness?.note !== "string" || r.fairness.note.length < 20) errs.push(`${e.id}: fairness must be null or {note, phrases}`);
    if (!Array.isArray(r.fairness?.phrases)) errs.push(`${e.id}: fairness.phrases must be an array`);
  }
  if (!Array.isArray(r.wording)) { errs.push(`${e.id}: wording must be an array`); continue; }
  for (const w of r.wording) {
    if (!KEYS.has(w.guideline)) errs.push(`${e.id}: unknown guideline ${w.guideline}`);
    if (typeof w.note !== "string" || w.note.length < 20) errs.push(`${e.id}: wording note too short`);
  }
  for (const p of [...(r.fairness?.phrases ?? []), ...r.wording.map((w) => w.phrase)]) {
    if (typeof p !== "string" || !p || !e.text.includes(p)) errs.push(`${e.id}: phrase not word for word in the text: ${JSON.stringify(p)}`);
  }
}
if (errs.length) { console.log(`FAIL batch ${n}: ${errs.length} problem(s)\n` + errs.join("\n")); process.exit(1); }
const f = Object.values(out).filter((r) => r.fairness).length;
const w = Object.values(out).reduce((s, r) => s + r.wording.length, 0);
console.log(`OK batch ${n}: ${input.length} events, ${f} fairness findings, ${w} wording points`);
