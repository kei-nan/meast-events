import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkExclusionEntries, matchExclusions, exclusionSummary } from "./exclusions.js";

const ev = (id, wikidata_qid) => ({ id, wikidata_qid });

test("matchExclusions: matches by id or by wikidata_qid; a renamed article stays excluded", () => {
  const exclusions = [
    { id: "battle-of-x", wikidata_qid: "Q10", reason: "r" },
    { id: "old-title", wikidata_qid: "Q20", reason: "r" }, // article renamed: the proposed id is now new-title
    { id: "no-qid", reason: "r" },
    { id: "gone", wikidata_qid: "Q99", reason: "r" },
  ];
  const events = [ev("battle-of-x", "Q10"), ev("new-title", "Q20"), ev("no-qid", "Q30"), ev("kept", "Q40")];
  const m = matchExclusions(exclusions, events);
  assert.deepEqual([...m.excludedIds].sort(), ["battle-of-x", "new-title", "no-qid"]);
  assert.equal(m.isExcluded(ev("kept", "Q40")), null);
  assert.equal(m.isExcluded(ev("new-title", "Q20")), exclusions[1]);
  assert.deepEqual(
    m.matched.map((x) => [x.entry.id, x.ids, x.by]),
    [["battle-of-x", ["battle-of-x"], "id and wikidata_qid"], ["old-title", ["new-title"], "wikidata_qid"], ["no-qid", ["no-qid"], "id"]]
  );
  assert.deepEqual(m.unmatched, [exclusions[3]]);
  assert.deepEqual(m.warnings, [
    'exclusion "old-title" (Q20) matched new-title by wikidata_qid only (article renamed?); update its id',
    'exclusion "gone" (Q99) matches no event',
  ]);
  assert.equal(exclusionSummary(exclusions, m), "4 entries: 3 matched (2 by id, 1 by wikidata_qid only), 1 matched nothing");
});

test("matchExclusions: an entry whose id and QID name two different events leaves both out, with a warning", () => {
  const m = matchExclusions([{ id: "a", wikidata_qid: "Q2", reason: "r" }], [ev("a", "Q1"), ev("b", "Q2")]);
  assert.deepEqual([...m.excludedIds].sort(), ["a", "b"]);
  assert.match(m.warnings[0], /match different events \(a, b\)/);
});

test("matchExclusions: qidOf reads the QID from another field (enriched records keep source_qid)", () => {
  const m = matchExclusions([{ id: "x", wikidata_qid: "Q5", reason: "r" }], [{ id: "y", source_qid: "Q5" }], { qidOf: (r) => r.wikidata_qid ?? r.source_qid });
  assert.deepEqual([...m.excludedIds], ["y"]);
});

test("checkExclusionEntries: ids, QIDs and reasons are required to be well formed and unique", () => {
  assert.deepEqual(checkExclusionEntries([{ id: "a", wikidata_qid: "Q1", reason: "r" }, { id: "b", reason: "r" }]), []);
  assert.deepEqual(checkExclusionEntries({}), ["proposed-exclusions.json: must be an array of {id, wikidata_qid?, reason}"]);
  assert.deepEqual(
    checkExclusionEntries([
      { id: "a", wikidata_qid: "q1", reason: "r" },
      { id: "a", reason: "r" },
      { id: "c", wikidata_qid: "Q3", reason: "" },
      { id: "d", wikidata_qid: "Q3", reason: "r" },
      { reason: "r" },
    ]),
    [
      'proposed-exclusions.json[0]: wikidata_qid "q1" is not a QID',
      'proposed-exclusions.json[1]: id "a" is listed twice',
      'proposed-exclusions.json[2]: no "reason"',
      "proposed-exclusions.json[3]: wikidata_qid Q3 is listed twice",
      'proposed-exclusions.json[4]: no "id"',
    ]
  );
});

test("data/proposed-exclusions.json: well formed, every entry carries its Wikidata item", () => {
  const exclusions = JSON.parse(readFileSync(new URL("../../data/proposed-exclusions.json", import.meta.url), "utf-8"));
  assert.deepEqual(checkExclusionEntries(exclusions), []);
  for (const x of exclusions) assert.match(x.wikidata_qid ?? "", /^Q\d+$/, x.id);
});
