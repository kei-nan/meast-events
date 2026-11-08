import test from "node:test";
import assert from "node:assert/strict";
import { describeStatus, scopeAction } from "./panelStatus.js";

const base = {
  years: null,
  eventsLoading: false,
  eventsError: null,
  loading: false,
  interim: false,
  resultCount: 12,
  total: 12,
  searching: true,
  inView: false,
  scope: "all",
  shownInRange: null,
};
const status = (over) => describeStatus({ ...base, ...over });

test("describeStatus: loading, errors and a running search come first", () => {
  assert.deepEqual(status({ eventsLoading: true }), { text: "Loading events…", extra: "" });
  assert.deepEqual(status({ eventsError: new Error("x") }), { text: "Events could not be loaded - retrying", extra: "" });
  assert.equal(status({ loading: true, interim: true, total: 1, resultCount: 1 }).text, "1 title/summary match so far - full-text search running…");
  assert.equal(status({ loading: true, interim: true, total: 3, resultCount: 3 }).text, "3 title/summary matches so far - full-text search running…");
  assert.equal(status({ loading: true, resultCount: 0 }).text, "Searching…");
});

test("describeStatus: browsing names the years, the visible line says 'the selected years'", () => {
  assert.equal(status({ searching: false, total: 1 }).text, "1 event in the selected years");
  assert.equal(status({ searching: false, years: "1948–1949", total: 40, inView: true }).text, "40 events in 1948–1949, in map view");
});

test("describeStatus: searching, by scope and by how many fall in the selected years", () => {
  assert.deepEqual(status({ scope: "range", years: "1967" }), { text: "12 results in 1967", extra: "" });
  assert.deepEqual(status({ scope: "range" }), { text: "12 results in selected years", extra: "" });
  assert.deepEqual(status({ total: 0, resultCount: 0 }), { text: "0 results", extra: "" });
  assert.deepEqual(status({ shownInRange: 0 }), { text: "12 results (none in selected years)", extra: "" });
  assert.deepEqual(status({ shownInRange: 5 }), { text: "12 results", extra: ", 5 in selected years" });
  assert.deepEqual(status({ shownInRange: 12 }), { text: "12 results", extra: "" });
  assert.deepEqual(status({ total: 1, resultCount: 1 }), { text: "1 result", extra: "" });
});

test("scopeAction: whole timeline from the selected years, and back", () => {
  const a = (over) => scopeAction({ settled: true, scope: "all", allCount: null, total: 12, shownInRange: null, ...over });
  assert.equal(a({ settled: false, scope: "range" }), null, "not before the search has settled");
  assert.deepEqual(a({ scope: "range" }), { label: "Show whole timeline", aria: "Show results from the whole timeline", scope: "all" });
  assert.deepEqual(a({ scope: "range", allCount: 30 }), { label: "Show all 30", aria: "Show all 30 results, whole timeline", scope: "all" });
  assert.equal(a({ scope: "range", allCount: 12 }), null, "nothing more in the whole timeline");
  assert.deepEqual(a({ shownInRange: 5 }), { label: "Show the 5 in selected years", aria: null, scope: "range" });
  assert.equal(a({ shownInRange: 12 }), null, "all of them are in the selected years");
  assert.equal(a({ shownInRange: 0 }), null, "none to show");
});
