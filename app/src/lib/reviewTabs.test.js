import test from "node:test";
import assert from "node:assert/strict";
import { REVIEW_TABS, defaultReviewTab, tabStatus } from "./reviewTabs.js";

test("tab order: fairness first, then wording", () => {
  assert.deepEqual(REVIEW_TABS, ["fairness", "wording"]);
});

test("opens the first review type that found something", () => {
  assert.equal(defaultReviewTab({ fairness: { found: true }, wording: { found: true } }), "fairness");
  assert.equal(defaultReviewTab({ fairness: { found: false }, wording: { found: true } }), "wording");
  assert.equal(defaultReviewTab({ fairness: { found: true }, wording: { found: false } }), "fairness");
});

test("falls back to the first tab when nothing was found or the review is missing", () => {
  assert.equal(defaultReviewTab({ fairness: { found: false }, wording: { found: false } }), "fairness");
  assert.equal(defaultReviewTab({ fairness: null, wording: undefined }), "fairness");
  assert.equal(defaultReviewTab({}), "fairness");
  assert.equal(defaultReviewTab(null), "fairness");
  assert.equal(defaultReviewTab(undefined), "fairness");
});

test("tabStatus: nothing found, an issue, or the number of wording points", () => {
  assert.equal(tabStatus("fairness", { found: false }), "Nothing found");
  assert.equal(tabStatus("fairness", { found: true }), "Issue found");
  assert.equal(tabStatus("wording", { found: true, findings: [{}] }), "1 wording point");
  assert.equal(tabStatus("wording", { found: true, findings: [{}, {}] }), "2 wording points");
});
