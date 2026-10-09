import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (rel) => JSON.parse(readFileSync(new URL(`../../../data/${rel}`, import.meta.url), "utf8"));
const events = read("events.json");
const review = read("framing-review.json");

test("every event has exactly one framing review and no review is orphaned", () => {
  const ids = new Set(events.map((e) => e.id));
  const reviewed = new Set(Object.keys(review.events));
  assert.deepEqual([...ids].filter((id) => !reviewed.has(id)), []);
  assert.deepEqual([...reviewed].filter((id) => !ids.has(id)), []);
});

test("each summary has at most one concise fairness finding and wording points that cite a guideline", () => {
  for (const [id, r] of Object.entries(review.events)) {
    if (r.fairness !== null) assert.ok(typeof r.fairness.note === "string" && r.fairness.note.length > 20, `${id}: fairness note missing or too short`);
    assert.ok(Array.isArray(r.wording), `${id}: wording list missing`);
    for (const x of r.wording) {
      assert.ok(x.guideline in review.guidelines, `${id}: unknown guideline ${x.guideline}`);
      assert.ok(typeof x.note === "string" && x.note.length > 20, `${id}: note missing or too short`);
    }
  }
});

test("every quoted or highlighted phrase appears word for word in the text", () => {
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));
  for (const [id, r] of Object.entries(review.events)) {
    for (const p of [...(r.fairness?.phrases ?? []), ...r.wording.map((x) => x.phrase)]) {
      assert.ok(byId[id].extract.includes(p), `${id}: "${p}" not in the text`);
    }
  }
});

test("no score or side is published", () => {
  for (const [id, r] of Object.entries(review.events)) {
    for (const k of ["rating", "leans", "reason", "highlights", "observations", "first_review", "second_look", "findings", "fairness_note"]) assert.ok(!(k in r), `${id}: old field ${k}`);
  }
});

// A Wikipedia text refresh can change a summary after its review. That is allowed: the site
// then marks the review "may no longer apply" until it is redone. So this reports, not fails.
test("each review fingerprints the text it rated (changed texts are reported)", (t) => {
  for (const [id, r] of Object.entries(review.events)) assert.match(r.text_sha1 ?? "", /^[0-9a-f]{12}$/, `${id}: text fingerprint missing`);
  const stale = events.filter(
    (e) => review.events[e.id].text_sha1 !== createHash("sha1").update(e.extract).digest("hex").slice(0, 12)
  );
  if (stale.length) t.diagnostic(`${stale.length} review(s) out of date (text changed since review): ${stale.map((e) => e.id).join(", ")}`);
});

// docs/framing-review.md publishes counts from this data; keep them in step with it.
test("the counts in docs/framing-review.md match the data", () => {
  const doc = readFileSync(new URL("../../../docs/framing-review.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const results = doc.split(/^## Results$/m)[1]?.split(/^## /m)[0];
  assert.ok(results, "no Results section");
  const rows = Object.fromEntries(
    [...results.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm)].map((m) => [m[1], m[2]])
  );
  const all = Object.values(review.events);
  const n = all.length;
  assert.equal(rows["Overall fairness: issue found"], `${all.filter((r) => r.fairness !== null).length} of ${n}`);
  assert.equal(rows["Wording check: at least one wording point"], `${all.filter((r) => r.wording.length).length} of ${n}`);
  assert.equal(rows["Either"], `${all.filter((r) => r.fairness !== null || r.wording.length).length} of ${n}`);
  for (const [key, g] of Object.entries(review.guidelines)) {
    const points = all.reduce((sum, r) => sum + r.wording.filter((x) => x.guideline === key).length, 0);
    assert.equal(rows[g.name], String(points), `wording points for ${g.name}`);
  }
  assert.match(doc, new RegExp(`^All ${n} summaries were reviewed`, "m"));
});
