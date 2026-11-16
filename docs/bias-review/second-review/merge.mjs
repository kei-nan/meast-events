// Merges the verified second-review findings into data/framing-review.json of a repo.
// node merge.mjs <repo> [--write]
// Fairness: only events where the first review found nothing get one (keep/correct verdicts).
// Wording: kept points are appended. Entries are marked with second_review so the source is traceable.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url);
const [repo, flag] = process.argv.slice(2);
const file = `${repo}/data/framing-review.json`;
const review = JSON.parse(readFileSync(file, "utf8"));
const events = Object.fromEntries(JSON.parse(readFileSync(`${repo}/data/events.json`, "utf8")).map((e) => [e.id, e]));
const verdicts = {};
const inputs = {};
for (const f of readdirSync(new URL("in/", dir)).sort()) for (const e of JSON.parse(readFileSync(new URL(`in/${f}`, dir), "utf8"))) inputs[e.id] = e;
for (const f of readdirSync(new URL("out/", dir)).filter((f) => /^v-\d+\.json$/.test(f)).sort()) Object.assign(verdicts, JSON.parse(readFileSync(new URL(`out/${f}`, dir), "utf8")));
const missing = Object.keys(inputs).filter((id) => !verdicts[id]);
if (missing.length) { console.log(`not verified yet: ${missing.length} (${missing.slice(0, 5).join(", ")}...)`); if (flag === "--write") process.exit(1); }
const t = { fairnessAdded: 0, fairnessDropped: 0, wordingAdded: 0, wordingDropped: 0, events: new Set() };
for (const [id, v] of Object.entries(verdicts)) {
  const r = review.events[id];
  const text = events[id].extract;
  if (!r || r.text_sha1 !== inputs[id].text_sha1) throw new Error(`${id}: review missing or text changed since the second review`);
  if (v.fairness) {
    if (v.fairness.verdict === "drop") t.fairnessDropped++;
    else {
      if (r.fairness !== null) throw new Error(`${id}: already has a fairness finding`);
      for (const p of v.fairness.phrases) if (!text.includes(p)) throw new Error(`${id}: phrase not in text: ${p}`);
      r.fairness = { note: v.fairness.note, phrases: v.fairness.phrases, ...(v.fairness.sources?.length ? { sources: v.fairness.sources } : {}), second_review: true };
      t.fairnessAdded++; t.events.add(id);
    }
  }
  for (const w of v.wording ?? []) {
    if (w.verdict !== "keep") { t.wordingDropped++; continue; }
    if (!text.includes(w.phrase)) throw new Error(`${id}: wording phrase not in text: ${w.phrase}`);
    if (r.wording.some((x) => x.guideline === w.guideline && x.phrase === w.phrase)) continue;
    r.wording.push({ guideline: w.guideline, phrase: w.phrase, note: w.note, second_review: true });
    t.wordingAdded++; t.events.add(id);
  }
}
console.log({ ...t, events: t.events.size });
if (flag === "--write") { writeFileSync(file, JSON.stringify(review, null, 2) + "\n"); console.log("wrote", file); }
