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

test("every observation cites a published guideline and explains itself", () => {
  for (const [id, r] of Object.entries(review.events)) {
    assert.ok(Array.isArray(r.observations), `${id}: observations missing`);
    for (const o of r.observations) {
      assert.ok(o.guideline in review.guidelines, `${id}: unknown guideline ${o.guideline}`);
      assert.ok(typeof o.note === "string" && o.note.length > 20, `${id}: note missing or too short`);
    }
    assert.ok(!("reviewer_note" in r), `${id}: judgement notes belong in fairness_note`);
    if (r.fairness_note !== null) assert.ok(r.fairness_note.length > 20, `${id}: fairness note too short`);
    assert.equal(typeof r.second_look, "boolean", `${id}: second_look must be true or false`);
    const fr = r.first_review;
    assert.ok(fr && typeof fr.found === "boolean", `${id}: first_review missing`);
    if (fr.found) assert.ok(fr.note && fr.note.length > 20, `${id}: a first-review finding needs its reason`);
    if (fr.phrases) assert.ok(fr.found, `${id}: first-review highlights without a finding`);
    const laterFound = r.observations.length > 0 || r.fairness_note !== null;
    assert.equal(r.second_look, laterFound && !fr.found, `${id}: second look is for summaries only the later review flags`);
  }
});

test("every quoted phrase appears word for word in the text", () => {
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));
  for (const [id, r] of Object.entries(review.events)) {
    for (const o of r.observations) assert.ok(byId[id].extract.includes(o.phrase), `${id}: "${o.phrase}" not in the text`);
    for (const p of r.first_review.phrases ?? []) assert.ok(byId[id].extract.includes(p), `${id}: first-review phrase "${p}" not in the text`);
  }
});

test("no score or side is published", () => {
  for (const [id, r] of Object.entries(review.events)) {
    for (const k of ["rating", "leans", "reason", "highlights"]) assert.ok(!(k in r), `${id}: old field ${k}`);
  }
});

test("each review fingerprints the exact text it rated", () => {
  const stale = events.filter(
    (e) => review.events[e.id].text_sha1 !== createHash("sha1").update(e.extract).digest("hex").slice(0, 12)
  );
  assert.deepEqual(stale.map((e) => e.id), [], "text changed since review: re-review these or accept them as stale");
});
