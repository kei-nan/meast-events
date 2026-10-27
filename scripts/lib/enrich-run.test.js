import test from "node:test";
import assert from "node:assert/strict";
import { boundedRunError, reuseRecord, fetchErrors, candidateFields, setReason, FETCH_ERROR } from "./enrich-run.js";

test("boundedRunError: a bounded run needs --keep-existing or --out-suffix; a full run may write", () => {
  assert.equal(boundedRunError({}), null);
  assert.match(boundedRunError({ limit: 5 }), /--limit=5 is a bounded run.*--keep-existing.*--out-suffix/);
  assert.match(boundedRunError({ classes: ["battle", "war"] }), /--classes=battle,war is a bounded run/);
  assert.equal(boundedRunError({ limit: 5, keepExisting: true }), null);
  assert.equal(boundedRunError({ classes: ["battle"], outSuffix: ".test" }), null);
  assert.match(boundedRunError({ classes: [] }), /--classes= is a bounded run/); // --classes= selects no candidate at all
});

const candidate = (over = {}) => ({
  wikidata_qid: "Q1",
  wikipedia_title: "Battle of Alpha",
  countries: ["Egypt", "Israel"],
  wikidata_classes: ["battle"],
  category: "war",
  sitelinks: 30,
  wikidata_description: "new description",
  ...over,
});
const cached = (over = {}) => ({
  wikidata_qid: "Q1",
  title: "Battle of Alpha",
  enrich_version: 3,
  countries: ["Somalia"],
  sitelinks: 12,
  wikidata_classes: ["war"],
  wikidata_description: "old",
  coordinates: { lat: 30.0, lon: 31.2 },
  extract: "Lead.",
  _review: ["many_countries: 5 countries tagged (kept exactly as Wikidata lists them; verify the event really concerns all of them)", "x: kept"],
  ...over,
});

test("reuseRecord: re-applies the candidate-file fields and the country flags; the cached record is not changed", () => {
  const old = cached();
  const r = reuseRecord(old, candidate(), [2, 3]);
  assert.deepEqual(r.countries, ["Egypt", "Israel"]);
  assert.equal(r.sitelinks, 30);
  assert.deepEqual(r.wikidata_classes, ["battle"]);
  assert.equal(r.wikidata_description, "new description");
  assert.equal(r.extract, "Lead.");
  assert.deepEqual(r._review, ["x: kept"]); // 2 countries: no many_countries flag; Cairo point is near Egypt
  assert.deepEqual(old.countries, ["Somalia"]);
  assert.equal(old._review.length, 2);
  // more than four countries: the flag comes back
  const many = reuseRecord(cached({ _review: [] }), candidate({ countries: ["Egypt", "Israel", "Jordan", "Syria", "Lebanon"] }), [3]);
  assert.match(many._review[0], /^many_countries: 5 countries tagged/);
});

test("reuseRecord: never reuses an error record, another title, an old version or a record without its review list", () => {
  assert.equal(reuseRecord(cached({ error: "fetch failed", exclusion_reason: FETCH_ERROR }), candidate(), [3]), null);
  assert.equal(reuseRecord(cached({ exclusion_reason: FETCH_ERROR }), candidate(), [3]), null);
  assert.equal(reuseRecord(cached({ error: "summary_not_found" }), candidate(), [3]), null);
  assert.equal(reuseRecord(cached(), candidate({ wikipedia_title: "Battle of Alpha (1956)" }), [3]), null);
  assert.equal(reuseRecord(cached({ enrich_version: 1 }), candidate(), [2, 3]), null);
  assert.equal(reuseRecord(cached({ _review: undefined }), candidate(), [3]), null);
  assert.equal(reuseRecord(undefined, candidate(), [3]), null);
});

test("fetchErrors / candidateFields / setReason", () => {
  assert.deepEqual(fetchErrors([{ id: "a" }, { id: "b", exclusion_reason: FETCH_ERROR }, { id: "c", exclusion_reason: "not_an_event" }]).map((r) => r.id), ["b"]);
  const f = candidateFields(candidate({ wikidata_description: undefined }));
  assert.equal(f.title, "Battle of Alpha");
  assert.equal(f.category, "battle");
  assert.equal(f.wikidata_description, null);
  const list = ["a: 1", "b: 2"];
  setReason(list, "a", "a: 3");
  setReason(list, "b", null);
  setReason(list, "c", "c: 4");
  assert.deepEqual(list, ["a: 3", "c: 4"]);
});
