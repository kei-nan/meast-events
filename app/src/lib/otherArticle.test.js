import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { otherArticleNote, otherArticleTitle } from "./otherArticle.js";

test("otherArticleTitle: the article of another item, decoded; null for an event's own article", () => {
  const ev = {
    wikidata_qid: "Q134890505",
    resolved_qid: "Q134961914",
    wikipedia_url: "https://en.wikipedia.org/wiki/List_of_attacks_during_the_Twelve-Day_War",
  };
  assert.equal(otherArticleTitle(ev), "List of attacks during the Twelve-Day War");
  assert.equal(
    otherArticleTitle({ ...ev, wikipedia_url: "https://en.wikipedia.org/wiki/2021_Israel%E2%80%93Palestine_crisis" }),
    "2021 Israel–Palestine crisis"
  );
  assert.equal(otherArticleTitle({ ...ev, resolved_qid: ev.wikidata_qid }), null);
  assert.equal(otherArticleTitle({ ...ev, resolved_qid: undefined }), null);
  assert.equal(otherArticleTitle({ ...ev, wikipedia_url: null }), null);
  assert.equal(otherArticleTitle({ ...ev, wikipedia_url: "https://en.wikipedia.org/wiki/%E0%A4" }), null);
  assert.match(otherArticleNote("Gaza war"), /no Wikipedia article of its own.*“Gaza war”/);
});

test("the known events without an article of their own are detected", () => {
  const events = JSON.parse(readFileSync(new URL("../../../data/events.json", import.meta.url), "utf8"));
  const ids = new Set(events.filter((e) => otherArticleTitle(e)).map((e) => e.id));
  // The redirect-only events as of 2026-10-10 (docs/data-fixes.md F12). A refresh may add more.
  for (const id of [
    "attack-on-the-united-states-embassy-in-baghdad",
    "ein-hashlosha-massacre",
    "israeli-invasion-of-the-gaza-strip",
    "june-2025-iranian-strikes-on-israel",
    "june-2025-israeli-strikes-on-iran",
    "musa-dagh-resistance",
    "operation-guardian-of-the-walls",
    "operation-marg-bar-sarmachar",
  ]) {
    assert.ok(ids.has(id), `${id} not detected`);
  }
});
