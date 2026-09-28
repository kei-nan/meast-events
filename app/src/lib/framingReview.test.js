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

test("ratings are on the published scale and flagged entries give a reason", () => {
  for (const [id, r] of Object.entries(review.events)) {
    assert.ok(String(r.rating) in review.ratings, `${id}: rating ${r.rating} not on the scale`);
    assert.equal(typeof r.reason, "string", `${id}: reason missing`);
    assert.ok(r.reason.length > 10, `${id}: reason too short`);
    if (r.leans !== undefined) assert.ok(r.rating > 0, `${id}: a direction needs a rating above 0`);
  }
});

test("highlighted phrases appear word for word in the text and only on flagged entries", () => {
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));
  for (const [id, r] of Object.entries(review.events)) {
    if (!r.highlights) continue;
    assert.ok(r.rating > 0, `${id}: highlights on an entry rated 0`);
    for (const h of r.highlights) assert.ok(byId[id].extract.includes(h), `${id}: "${h}" not in the text`);
  }
});

test("each review fingerprints the exact text it rated", () => {
  const stale = events.filter(
    (e) => review.events[e.id].text_sha1 !== createHash("sha1").update(e.extract).digest("hex").slice(0, 12)
  );
  assert.deepEqual(stale.map((e) => e.id), [], "text changed since review: re-review these or accept them as stale");
});
