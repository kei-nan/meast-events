import test from "node:test";
import assert from "node:assert/strict";
import { backfillRevid, isRevid, isRevTimestamp, setRevid } from "./revid.js";
import { revisionTimestamp } from "./lead.js";
import { syncMirrorTexts } from "./mirrors.js";

const TS = "2026-10-15T19:38:37Z";
const ev = (o = {}) => ({ id: "a", extract: "Lead text.", extract_retrieved_at: "2026-09-01", wikidata_classes: ["war"], ...o });

test("isRevid and isRevTimestamp", () => {
  assert.equal(isRevid(1), true);
  for (const v of [0, -3, 1.5, "12", null, undefined, Number.MAX_SAFE_INTEGER + 2]) assert.equal(isRevid(v), false);
  assert.equal(isRevTimestamp(TS), true);
  for (const v of ["2026-10-15", "2026-10-15T19:38:37.000Z", "2026-02-30T00:00:00Z", "2026-10-15T19:38:37+01:00", 1, null]) {
    assert.equal(isRevTimestamp(v), false, String(v));
  }
});

test("revisionTimestamp: only the timestamp of the revision lastrevid names", () => {
  assert.equal(revisionTimestamp({ lastrevid: 5, revisions: [{ revid: 5, timestamp: TS }] }), TS);
  assert.equal(revisionTimestamp({ lastrevid: 6, revisions: [{ revid: 5, timestamp: TS }] }), null);
  assert.equal(revisionTimestamp({ lastrevid: 5 }), null);
});

test("setRevid: both fields right after extract_retrieved_at; replaced or removed together", () => {
  const e = ev();
  assert.equal(setRevid(e, 42, TS), true);
  assert.deepEqual(Object.keys(e), ["id", "extract", "extract_retrieved_at", "wikipedia_revid", "wikipedia_revid_timestamp", "wikidata_classes"]);
  assert.equal(setRevid(e, 42, TS), false, "same values: no change");
  assert.equal(setRevid(e, 43, "2026-10-16T00:00:00Z"), true);
  assert.deepEqual([e.wikipedia_revid, e.wikipedia_revid_timestamp], [43, "2026-10-16T00:00:00Z"]);
  assert.equal(setRevid(e, 44, null), true, "no timestamp: both go");
  assert.equal("wikipedia_revid" in e || "wikipedia_revid_timestamp" in e, false);
  assert.equal(setRevid(e, undefined, undefined), false);
  const noDate = { id: "b" };
  setRevid(noDate, 7, TS);
  assert.deepEqual(Object.keys(noDate), ["id", "wikipedia_revid", "wikipedia_revid_timestamp"]);
});

test("backfillRevid: only where the current lead equals the stored extract exactly", () => {
  const lead = (extract, lastrevid = 900, lastrev_timestamp = TS) => ({ extract, lastrevid, lastrev_timestamp });
  const same = ev();
  assert.equal(backfillRevid(same, lead("Lead text.")), "set");
  assert.equal(same.wikipedia_revid, 900);
  assert.equal(same.wikipedia_revid_timestamp, TS);
  assert.equal(same.extract, "Lead text.");
  assert.equal(same.extract_retrieved_at, "2026-09-01", "nothing else changes");

  const changed = ev();
  assert.equal(backfillRevid(changed, lead("Lead text, edited.")), "differs");
  assert.equal("wikipedia_revid" in changed, false);
  // one whitespace character is a difference too
  assert.equal(backfillRevid(ev(), lead("Lead  text.")), "differs");

  assert.equal(backfillRevid(ev(), null), "missing");
  assert.equal(backfillRevid(ev(), lead("Lead text.", null)), "missing");
  assert.equal(backfillRevid(ev(), lead("Lead text.", 900, null)), "missing", "no timestamp: nothing set");

  const kept = ev({ wikipedia_revid: 5, wikipedia_revid_timestamp: "2026-01-01T00:00:00Z" });
  assert.equal(backfillRevid(kept, lead("Lead text.")), "kept");
  assert.equal(kept.wikipedia_revid, 5, "re-running never replaces a stored revision");
});

test("syncMirrorTexts: a mirror takes its source's revision and date with its text", () => {
  const url = "https://en.wikipedia.org/wiki/X";
  const source = { id: "s", wikidata_qid: "Q1", resolved_qid: "Q1", wikipedia_url: url, extract: "new", extract_retrieved_at: "2026-10-10", wikipedia_revid: 77, wikipedia_revid_timestamp: TS };
  const mirror = { id: "m", wikidata_qid: "Q2", resolved_qid: "Q1", wikipedia_url: url, extract: "old", extract_retrieved_at: "2026-10-01", wikipedia_revid: 11, wikipedia_revid_timestamp: "2026-01-01T00:00:00Z" };
  syncMirrorTexts([source, mirror]);
  assert.deepEqual([mirror.wikipedia_revid, mirror.wikipedia_revid_timestamp], [77, TS]);
  const bare = { ...source, id: "s2", extract: "newer" };
  delete bare.wikipedia_revid;
  delete bare.wikipedia_revid_timestamp;
  const m2 = { ...mirror, id: "m2" };
  syncMirrorTexts([bare, m2]);
  assert.equal("wikipedia_revid" in m2 || "wikipedia_revid_timestamp" in m2, false, "a source without a revision leaves the mirror without one");
});
