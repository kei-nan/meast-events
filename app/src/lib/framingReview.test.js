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

test("every finding is a wording point citing a guideline or a fairness judgement, and explains itself", () => {
  for (const [id, r] of Object.entries(review.events)) {
    assert.ok(Array.isArray(r.findings), `${id}: findings missing`);
    for (const x of r.findings) {
      assert.ok(x.kind === "wording" || x.kind === "fairness", `${id}: unknown kind ${x.kind}`);
      if (x.kind === "wording") assert.ok(x.guideline in review.guidelines, `${id}: unknown guideline ${x.guideline}`);
      assert.ok(typeof x.note === "string" && x.note.length > 20, `${id}: note missing or too short`);
    }
    assert.ok(r.findings.filter((x) => x.kind === "fairness").length <= 1, `${id}: fairness judgements are merged into one finding`);
  }
});

test("every quoted or highlighted phrase appears word for word in the text", () => {
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));
  for (const [id, r] of Object.entries(review.events)) {
    for (const x of r.findings) {
      for (const p of x.kind === "wording" ? [x.phrase] : x.phrases ?? []) assert.ok(byId[id].extract.includes(p), `${id}: "${p}" not in the text`);
    }
  }
});

test("no score or side is published", () => {
  for (const [id, r] of Object.entries(review.events)) {
    for (const k of ["rating", "leans", "reason", "highlights", "observations", "first_review", "second_look"]) assert.ok(!(k in r), `${id}: old field ${k}`);
  }
});

test("each review fingerprints the exact text it rated", () => {
  const stale = events.filter(
    (e) => review.events[e.id].text_sha1 !== createHash("sha1").update(e.extract).digest("hex").slice(0, 12)
  );
  assert.deepEqual(stale.map((e) => e.id), [], "text changed since review: re-review these or accept them as stale");
});
