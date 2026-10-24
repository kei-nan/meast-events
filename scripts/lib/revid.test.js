import test from "node:test";
import assert from "node:assert/strict";
import { backfillRevid, isRevid, setRevid } from "./revid.js";
import { syncMirrorTexts } from "./mirrors.js";

const ev = (o = {}) => ({ id: "a", extract: "Lead text.", extract_retrieved_at: "2026-09-01", wikidata_classes: ["war"], ...o });

test("isRevid: positive safe integers only", () => {
  assert.equal(isRevid(1), true);
  for (const v of [0, -3, 1.5, "12", null, undefined, Number.MAX_SAFE_INTEGER + 2]) assert.equal(isRevid(v), false);
});

test("setRevid: placed right after extract_retrieved_at, replaced or removed in place", () => {
  const e = ev();
  assert.equal(setRevid(e, 42), true);
  assert.deepEqual(Object.keys(e), ["id", "extract", "extract_retrieved_at", "wikipedia_revid", "wikidata_classes"]);
  assert.equal(setRevid(e, 42), false, "same value: no change");
  assert.equal(setRevid(e, 43), true);
  assert.equal(e.wikipedia_revid, 43);
  assert.equal(setRevid(e, null), true, "no revision: the field goes");
  assert.equal("wikipedia_revid" in e, false);
  assert.equal(setRevid(e, undefined), false);
  const noDate = { id: "b" };
  setRevid(noDate, 7);
  assert.deepEqual(Object.keys(noDate), ["id", "wikipedia_revid"]);
});

test("backfillRevid: only where the current lead equals the stored extract exactly", () => {
  const lead = (extract, lastrevid = 900) => ({ extract, lastrevid });
  const same = ev();
  assert.equal(backfillRevid(same, lead("Lead text.")), "set");
  assert.equal(same.wikipedia_revid, 900);
  assert.equal(same.extract, "Lead text.");
  assert.equal(same.extract_retrieved_at, "2026-09-01", "nothing else changes");

  const changed = ev();
  assert.equal(backfillRevid(changed, lead("Lead text, edited.")), "differs");
  assert.equal("wikipedia_revid" in changed, false);
  // one whitespace character is a difference too
  assert.equal(backfillRevid(ev(), lead("Lead  text.")), "differs");

  assert.equal(backfillRevid(ev(), null), "missing");
  assert.equal(backfillRevid(ev(), lead("Lead text.", null)), "missing");

  const kept = ev({ wikipedia_revid: 5 });
  assert.equal(backfillRevid(kept, lead("Lead text.")), "kept");
  assert.equal(kept.wikipedia_revid, 5, "re-running never replaces a stored revision");
});

test("syncMirrorTexts: a mirror takes its source's revision with its text", () => {
  const url = "https://en.wikipedia.org/wiki/X";
  const source = { id: "s", wikidata_qid: "Q1", resolved_qid: "Q1", wikipedia_url: url, extract: "new", extract_retrieved_at: "2026-10-10", wikipedia_revid: 77 };
  const mirror = { id: "m", wikidata_qid: "Q2", resolved_qid: "Q1", wikipedia_url: url, extract: "old", extract_retrieved_at: "2026-10-01", wikipedia_revid: 11 };
  syncMirrorTexts([source, mirror]);
  assert.equal(mirror.wikipedia_revid, 77);
  const bare = { ...source, id: "s2", extract: "newer", wikipedia_revid: undefined };
  delete bare.wikipedia_revid;
  const m2 = { ...mirror, id: "m2" };
  syncMirrorTexts([bare, m2]);
  assert.equal("wikipedia_revid" in m2, false, "a source without a revision leaves the mirror without one");
});
