import test from "node:test";
import assert from "node:assert/strict";
import { mirrorPairs, syncMirrorReviews, syncMirrorTexts } from "./mirrors.js";

const url = "https://en.wikipedia.org/wiki/October_7_attacks";
const source = () => ({ id: "october-7-attacks", wikidata_qid: "Q1", resolved_qid: "Q1", wikipedia_url: url, extract: "new", extract_retrieved_at: "2026-10-10" });
const mirror = () => ({ id: "ein-hashlosha-massacre", wikidata_qid: "Q2", resolved_qid: "Q1", wikipedia_url: url, extract: "old", extract_retrieved_at: "2026-10-01" });

test("mirrorPairs: only a mirror whose article is another event's own article", () => {
  const list = [source(), mirror(), { id: "orphan", wikidata_qid: "Q3", resolved_qid: "Q9", wikipedia_url: "https://en.wikipedia.org/wiki/List" }];
  assert.deepEqual(mirrorPairs(list).map((p) => [p.mirror.id, p.source.id]), [["ein-hashlosha-massacre", "october-7-attacks"]]);
  // the article's item must be the source's own item
  assert.equal(mirrorPairs([source(), { ...mirror(), resolved_qid: "Q7" }]).length, 0);
});

test("syncMirrorTexts copies the source's text and date; syncMirrorReviews then copies its review", () => {
  const list = [source(), mirror()];
  assert.deepEqual(syncMirrorTexts(list), ["ein-hashlosha-massacre"]);
  assert.equal(list[1].extract, "new");
  assert.equal(list[1].extract_retrieved_at, "2026-10-10");
  assert.deepEqual(syncMirrorTexts(list), []);

  const reviews = { "october-7-attacks": { text_sha1: "abc", fairness: null, wording: [] }, "ein-hashlosha-massacre": { text_sha1: "old" } };
  assert.deepEqual(syncMirrorReviews(list, reviews), ["ein-hashlosha-massacre"]);
  assert.deepEqual(reviews["ein-hashlosha-massacre"], reviews["october-7-attacks"]);
  assert.notEqual(reviews["ein-hashlosha-massacre"], reviews["october-7-attacks"], "a copy, not the same object");
});
