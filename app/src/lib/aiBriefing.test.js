import test from "node:test";
import assert from "node:assert/strict";
import { assembleBriefing, contextRecord, sharedParts, storeEntry, GUIDANCE } from "./aiBriefing.js";

const ev = (id, countries, extract) => ({ id, title: id, date_start: "1948-01-01", countries, extract, framing_review: null });
const a = ev("a", ["Israel/Palestine"], "First sentence of a. Second sentence.");
const b = ev("b", ["Egypt"], "B happened.");
const byId = new Map([a, b].map((e) => [e.id, e]));
const context = { groups: [{ qid: "Q1", label: "War", size: 2, own: true }], near: { size: 1 }, ids: ["a", "b"] };
const funnel = { rule: "r", breakdowns: { by_country: { Egypt: { raw: 10, in_curated: 3 }, Iraq: { raw: 5, in_curated: 1 } } } };
const shared = sharedParts(funnel, { version: "v1", reviewer: "x", reviewed_on: "2026-09-30" });
const entries = { a: storeEntry(a), b: storeEntry(b) };

test("the assembled briefing is self-contained: every event's entry, the full summary, the shared texts", () => {
  const out = assembleBriefing(contextRecord(a, context, byId), entries, shared);
  assert.equal(out.guidance_for_ai, GUIDANCE);
  assert.equal(out.asked_about.summary, a.extract);
  assert.equal(out.asked_about.opening, "First sentence of a.");
  assert.deepEqual(out.events.map((e) => [e.id, !!e.asked_about]), [["a", true], ["b", false]]);
  assert.equal(out.selection.total, 2);
  assert.equal(out.data_version, "v1");
});

test("coverage lists only the context's countries, null where the funnel has none", () => {
  const out = assembleBriefing(contextRecord(a, context, byId), entries, shared);
  assert.deepEqual(out.coverage.by_country, { Egypt: { wikidata_candidates: 10, shown: 3 }, "Israel/Palestine": null });
});

test("a record whose id is not in the store fails instead of dropping the event", () => {
  assert.throws(() => assembleBriefing(contextRecord(a, context, byId), { a: entries.a }, shared), /no stored entry for b/);
});

test("the guidance asks to attribute the summaries to Wikipedia", () => {
  assert.match(GUIDANCE, /attribute them to Wikipedia/);
});
