// Compares the second review (out/batch-*.json) with the published one (data/framing-review.json).
// node compare.mjs <repo> -> writes merged.json and compare.json next to this file, prints a summary.
// Agreement only: no counts of which side a review favours (docs/framing-review.md).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url);
const repo = process.argv[2];
const first = JSON.parse(readFileSync(`${repo}/data/framing-review.json`, "utf8"));
const events = JSON.parse(readFileSync(`${repo}/data/events.json`, "utf8"));
const second = {};
for (const f of readdirSync(new URL("out/", dir)).filter((f) => /^batch-\d+\.json$/.test(f)).sort()) {
  Object.assign(second, JSON.parse(readFileSync(new URL(`out/${f}`, dir), "utf8")));
}
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
const overlaps = (a, b) => { const x = norm(a), y = norm(b); return x.includes(y) || y.includes(x); };

const rows = [];
const t = { both: 0, onlyFirst: 0, onlySecond: 0, neither: 0 };
const g = {};
let missing = 0;
for (const e of events) {
  const A = first.events[e.id], B = second[e.id];
  if (!B) { missing++; continue; }
  const fa = !!A.fairness, fb = !!B.fairness;
  t[fa && fb ? "both" : fa ? "onlyFirst" : fb ? "onlySecond" : "neither"]++;
  const wa = A.wording, wb = B.wording;
  const matched = (x, list) => list.some((y) => y.guideline === x.guideline && overlaps(x.phrase, y.phrase));
  const wOnlyFirst = wa.filter((x) => !matched(x, wb));
  const wOnlySecond = wb.filter((x) => !matched(x, wa));
  for (const x of wa) (g[x.guideline] ??= { first: 0, second: 0, agreed: 0 }).first++;
  for (const x of wb) { (g[x.guideline] ??= { first: 0, second: 0, agreed: 0 }).second++; if (matched(x, wa)) g[x.guideline].agreed++; }
  const stale = A.text_sha1 !== B.text_sha1;
  if (fa !== fb || wOnlyFirst.length || wOnlySecond.length || stale) {
    rows.push({ id: e.id, title: e.title, stale_first_review: stale,
      fairness: fa === fb ? (fa ? "both" : "neither") : fa ? "only first" : "only second",
      first_fairness: A.fairness, second_fairness: B.fairness,
      wording_only_first: wOnlyFirst, wording_only_second: wOnlySecond });
  }
}
const n = t.both + t.onlyFirst + t.onlySecond + t.neither;
const po = (t.both + t.neither) / n;
const pa = ((t.both + t.onlyFirst) / n) * ((t.both + t.onlySecond) / n) + ((t.neither + t.onlySecond) / n) * ((t.neither + t.onlyFirst) / n);
const kappa = (po - pa) / (1 - pa);
writeFileSync(new URL("merged.json", dir), JSON.stringify(second, null, 2));
writeFileSync(new URL("compare.json", dir), JSON.stringify({ n, missing, fairness: t, kappa, guidelines: g, disagreements: rows }, null, 2));
console.log({ n, missing, fairness: t, agreement: po.toFixed(3), kappa: kappa.toFixed(3), guidelines: g, events_with_any_disagreement: rows.length });
