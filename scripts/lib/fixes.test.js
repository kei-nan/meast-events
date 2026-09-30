import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA_FIXES, applyDataFix, reconcileStartDate } from "./fixes.js";

test("ledger: one entry per QID, each ref documented in docs/data-fixes.md", () => {
  const qids = DATA_FIXES.map((f) => f.qid);
  assert.equal(new Set(qids).size, qids.length, "a repeated QID would be silently dropped by FIXES_BY_QID");
  const doc = readFileSync(new URL("../../docs/data-fixes.md", import.meta.url), "utf8");
  for (const { ref } of DATA_FIXES) assert.match(doc, new RegExp(`^## ${ref} - `, "m"), `${ref} has no section`);
});

test("applyDataFix: sets the listed fields once, with one review reason", () => {
  const ev = { id: "x", wikidata_qid: "Q17286795", date_start: "2014-07-21", date_end: "2014-06-30", review_reasons: ["other"] };
  assert.deepEqual(applyDataFix(ev), ["date_start", "date_end"]);
  assert.equal(ev.date_start, "2014-06-26");
  assert.equal(ev.date_end, "2014-07-21");
  assert.equal(ev.needs_review, true);
  assert.equal(ev.review_reasons.filter((r) => r.startsWith("data_fix F6:")).length, 1);
  assert.deepEqual(applyDataFix(ev), [], "second run changes nothing");
  assert.equal(ev.review_reasons.length, 2);
});

test("applyDataFix: an unlisted QID is left alone", () => {
  const ev = { id: "y", wikidata_qid: "Q1", date_start: "2000-01-01" };
  assert.deepEqual(applyDataFix(ev), []);
  assert.deepEqual(ev, { id: "y", wikidata_qid: "Q1", date_start: "2000-01-01" });
});

test("reconcileStartDate: P585 equal to the end time -> P580", () => {
  const entity = {
    p585: [{ time: "1918-11-11", precision: 11 }],
    p580: [{ time: "1914-07-28", precision: 11 }],
    p582: [{ time: "1918-11-11", precision: 11 }],
  };
  assert.equal(reconcileStartDate("1918-11-11", entity).date_start, "1914-07-28");
});

test("reconcileStartDate: decade-precision P585 -> year-or-finer P580", () => {
  const entity = { p585: [{ time: "1940-00-00", precision: 8 }], p580: [{ time: "1948-05-15", precision: 11 }] };
  assert.equal(reconcileStartDate("1940-01-01", entity).date_start, "1948-05-15");
});

test("reconcileStartDate: leaves ordinary dates alone", () => {
  const entity = { p585: [{ time: "1967-06-05", precision: 11 }], p580: [{ time: "1967-06-05", precision: 11 }] };
  assert.equal(reconcileStartDate("1967-06-05", entity), null);
  assert.equal(reconcileStartDate("1967-06-05", null), null);
});
