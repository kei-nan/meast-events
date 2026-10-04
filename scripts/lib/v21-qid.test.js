import test from "node:test";
import assert from "node:assert/strict";
import { finalizeEvent, EXTRACT_HELD_FLAG } from "./v21.js";

// Minimal offline context: one lead keyed by the URL title, no Wikidata entity (no class/country checks run).
const ctx = (lead) => ({
  leads: new Map([["Musa Dagh", lead]]),
  entities: new Map(),
  places: new Map(),
  labels: {},
  matched: new Map(),
  sovereign: new Set(),
  reconcileDates: false,
});
const musa = (over = {}) => ({
  id: "musa-dagh-resistance",
  title: "Musa Dagh",
  date_start: "1915-07-01",
  date_end: "1915-09-12",
  countries: ["Turkey"],
  category: "war",
  wikidata_qid: "Q19831524",
  wikipedia_url: "https://en.wikipedia.org/wiki/Musa_Dagh",
  extract: "Stored text from 1915.",
  extract_retrieved_at: "2026-09-26",
  review_reasons: [],
  ...over,
});
const lead = (over = {}) => ({
  title: "Musa Dagh",
  extract: "Musa Dagh is a mountain in Hatay. In 1915 it was the site of a resistance.",
  wikibase_item: "Q1953975",
  retrieved_at: "2026-10-04T10:00:00.000Z",
  ...over,
});

test("finalizeEvent: a lead from another Wikidata item's article is not copied; the case is flagged", () => {
  const ev = finalizeEvent(musa(), ctx(lead()));
  assert.equal(ev.extract, "Stored text from 1915.");
  assert.equal(ev.extract_retrieved_at, "2026-09-26");
  const flags = ev.review_reasons.filter((r) => r.startsWith(EXTRACT_HELD_FLAG));
  assert.equal(flags.length, 1);
  assert.match(flags[0], /"Musa Dagh" is Wikidata Q1953975, the event is Q19831524/);
  assert.equal(ev.needs_review, true);
  // re-running does not duplicate the flag
  const again = finalizeEvent(ev, ctx(lead()));
  assert.equal(again.review_reasons.filter((r) => r.startsWith(EXTRACT_HELD_FLAG)).length, 1);
});

test("finalizeEvent: same item, or no QID to compare -> the lead is copied as before, no flag", () => {
  const same = finalizeEvent(musa(), ctx(lead({ wikibase_item: "Q19831524" })));
  assert.equal(same.extract, lead().extract);
  assert.equal(same.extract_retrieved_at, "2026-10-04");
  assert.ok(!same.review_reasons.some((r) => r.startsWith(EXTRACT_HELD_FLAG)));
  const noQid = finalizeEvent(musa({ wikidata_qid: null }), ctx(lead()));
  assert.equal(noQid.extract, lead().extract);
  const noItem = finalizeEvent(musa(), ctx(lead({ wikibase_item: null })));
  assert.equal(noItem.extract, lead().extract);
});

test("finalizeEvent: identical text from another item's article is not flagged (nothing would change)", () => {
  const ev = finalizeEvent(musa({ extract: lead().extract }), ctx(lead()));
  assert.equal(ev.extract, lead().extract);
  assert.ok(!ev.review_reasons.some((r) => r.startsWith(EXTRACT_HELD_FLAG)));
});

test("finalizeEvent: a stale held flag is dropped once the article is the record's own", () => {
  const ev = finalizeEvent(musa({ review_reasons: [`${EXTRACT_HELD_FLAG}: old`] }), ctx(lead({ wikibase_item: "Q19831524" })));
  assert.ok(!ev.review_reasons.some((r) => r.startsWith(EXTRACT_HELD_FLAG)));
});
