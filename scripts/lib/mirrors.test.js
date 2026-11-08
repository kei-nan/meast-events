import test from "node:test";
import assert from "node:assert/strict";
import { mirrorPairs, syncMirrorTexts } from "./mirrors.js";

const url = "https://en.wikipedia.org/wiki/October_7_attacks";
const source = () => ({ id: "october-7-attacks", wikidata_qid: "Q1", resolved_qid: "Q1", wikipedia_url: url, extract: "new", extract_retrieved_at: "2026-10-10" });
const mirror = () => ({ id: "ein-hashlosha-massacre", wikidata_qid: "Q2", resolved_qid: "Q1", wikipedia_url: url, extract: "old", extract_retrieved_at: "2026-10-01" });

test("mirrorPairs: only a mirror whose article is another event's own article", () => {
  const list = [source(), mirror(), { id: "orphan", wikidata_qid: "Q3", resolved_qid: "Q9", wikipedia_url: "https://en.wikipedia.org/wiki/List" }];
  assert.deepEqual(mirrorPairs(list).map((p) => [p.mirror.id, p.source.id]), [["ein-hashlosha-massacre", "october-7-attacks"]]);
  // the article's item must be the source's own item
  assert.equal(mirrorPairs([source(), { ...mirror(), resolved_qid: "Q7" }]).length, 0);
});

test("mirrorPairs: the pair survives a rename of the article, and the mirror's text keeps following", () => {
  // The refresh updates the source's URL; the mirror's update is held as qid_mismatch, so it keeps the old URL.
  const renamed = { ...source(), wikipedia_url: "https://en.wikipedia.org/wiki/Renamed" };
  const list = [renamed, mirror()];
  assert.deepEqual(mirrorPairs(list).map((p) => [p.mirror.id, p.source.id]), [["ein-hashlosha-massacre", "october-7-attacks"]]);
  assert.deepEqual(syncMirrorTexts(list), ["ein-hashlosha-massacre"]);
  assert.equal(list[1].extract, "new");
});

test("mirrorPairs: a source that itself shows another item's article is no source", () => {
  const other = { id: "other", wikidata_qid: "Q1", resolved_qid: "Q9", wikipedia_url: url };
  assert.equal(mirrorPairs([other, mirror()]).length, 0);
});

test("mirrorPairs on the real records: the four pairs, nothing else", async () => {
  const { readFile } = await import("node:fs/promises");
  const events = JSON.parse(await readFile(new URL("../../data/events.json", import.meta.url), "utf-8"));
  assert.deepEqual(mirrorPairs(events).map((p) => `${p.mirror.id} <- ${p.source.id}`).sort(), [
    "attack-on-the-united-states-embassy-in-baghdad <- december-2019-united-states-airstrikes-in-iraq-and-syria",
    "ein-hashlosha-massacre <- october-7-attacks",
    "israeli-invasion-of-the-gaza-strip <- 2023-israel-hamas-war",
    "operation-guardian-of-the-walls <- 2021-israel-palestine-crisis",
  ]);
});

test("syncMirrorTexts copies the source's text and date", () => {
  const list = [source(), mirror()];
  assert.deepEqual(syncMirrorTexts(list), ["ein-hashlosha-massacre"]);
  assert.equal(list[1].extract, "new");
  assert.equal(list[1].extract_retrieved_at, "2026-10-10");
  assert.deepEqual(syncMirrorTexts(list), []);
});
