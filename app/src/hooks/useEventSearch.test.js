import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// useEventSearch runs here against lib/testing/fakeReact.mjs (aliased in for
// "react"; setState does not re-render, so each step calls rerender) with the
// full-text index replaced by globalThis.__searchEventIds.
const fakeReactUrl = new URL("../lib/testing/fakeReact.mjs", import.meta.url).href;
const textSearchUrl = `data:text/javascript,${encodeURIComponent(
  "export const searchEventIds = (q) => globalThis.__searchEventIds(q);"
)}`;
register("../lib/testing/viteNodeHooks.mjs", import.meta.url, {
  data: { aliases: { react: fakeReactUrl, "../lib/textSearch": textSearchUrl } },
});
const { renderHook } = await import(fakeReactUrl);
const { default: useEventSearch } = await import("./useEventSearch.js");

const ev = (id, category, title = `Event ${id}`) => ({
  id,
  title,
  extract: "",
  category,
  countries: ["Iraq"],
  date_start: `19${id.slice(1).padStart(2, "0")}-01-01`,
  lat: 33,
  lon: 44,
  location_quality: "precise",
});
const EVENTS = [ev("e1", "war"), ev("e2", "treaty"), ev("e3", "war")];
const store = new Map(EVENTS.map((e) => [e.id, e]));

function stubIndex(answer = ["e1", "e2", "e3"]) {
  const calls = [];
  let pending = [];
  globalThis.__searchEventIds = (q) => {
    calls.push(q);
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  };
  const settle = async (fail = false) => {
    const now = pending;
    pending = [];
    for (const p of now) {
      if (fail) p.reject(new Error("down"));
      else p.resolve(answer);
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  return { calls, settle };
}

function props(over = {}) {
  return {
    query: "event",
    area: null,
    categories: [],
    countries: [],
    storeRef: { current: store },
    version: 1,
    ready: true,
    degraded: false,
    probeTick: 0,
    onOutage: () => {},
    onRecovered: () => {},
    ...over,
  };
}

const ids = (s) => s.results.map((e) => e.id);

test("shows instant local matches while the index answers, then the full-text answer", async () => {
  const index = stubIndex(["e3", "e1"]);
  const p = props();
  const h = renderHook(useEventSearch, p);
  const interim = h.rerender(p);
  assert.equal(interim.status, "loading");
  assert.equal(interim.interim, true);
  assert.deepEqual(index.calls, ["event"]);
  await index.settle();
  const done = h.rerender(p);
  assert.equal(done.status, "ready");
  assert.equal(done.source, "fulltext");
  assert.equal(done.interim, false);
  assert.deepEqual(ids(done), ["e3", "e1"]); // equal title tiers keep index order
  assert.equal(done.total, 2);
});

test("changing a filter re-filters the cached answer without searching again", async () => {
  const index = stubIndex();
  const p = props();
  const h = renderHook(useEventSearch, p);
  await index.settle();
  assert.deepEqual(ids(h.rerender(p)), ["e1", "e2", "e3"]);

  const wars = h.rerender({ ...p, categories: ["war"] });
  assert.equal(wars.status, "ready");
  assert.equal(wars.interim, false);
  assert.deepEqual(ids(wars), ["e1", "e3"]);

  const none = h.rerender({ ...p, categories: ["war"], countries: ["Iran"] });
  assert.equal(none.status, "ready");
  assert.deepEqual(ids(none), []);

  assert.deepEqual(ids(h.rerender(p)), ["e1", "e2", "e3"]);
  assert.deepEqual(index.calls, ["event"]);
});

test("an answer is used only for the text it was asked for", async () => {
  const index = stubIndex();
  const h = renderHook(useEventSearch, props({ query: "old" }));
  h.rerender(props({ query: "new" })); // undebounced: the hook keeps the first text
  // useDebouncedValue settles after 300 ms; a new hook instance stands in for it.
  const h2 = renderHook(useEventSearch, props({ query: "new" }));
  await index.settle();
  const s = h.rerender(props({ query: "new" }));
  assert.equal(s.status, "loading"); // h only has the answer for "old"
  assert.equal(s.interim, true);
  assert.equal(h2.rerender(props({ query: "new" })).status, "ready");
});

test("an outage reports once and falls back to local matches", async () => {
  const index = stubIndex();
  let outages = 0;
  const p = props({ onOutage: () => outages++ });
  const h = renderHook(useEventSearch, p);
  await index.settle(true);
  assert.equal(outages, 1);
  const s = h.rerender(p);
  assert.equal(s.source, "static");
  assert.deepEqual(ids(s), ["e1", "e2", "e3"]);
  // A filter change while the outage stands does not search again.
  h.rerender({ ...p, categories: ["war"], degraded: true });
  assert.deepEqual(index.calls, ["event"]);
});

test("filters alone are answered locally, without the index", () => {
  const index = stubIndex();
  const h = renderHook(useEventSearch, props({ query: "", categories: ["treaty"] }));
  const s = h.rerender(props({ query: "", categories: ["treaty"] }));
  assert.equal(s.source, "local");
  assert.deepEqual(ids(s), ["e2"]);
  assert.deepEqual(index.calls, []);
});

test("a query of only punctuation is no search (idle, no index call), not every event", () => {
  for (const query of ["??", "--", " ... "]) {
    const index = stubIndex();
    const p = props({ query, degraded: true });
    const h = renderHook(useEventSearch, p);
    const s = h.rerender(p);
    assert.equal(s.status, "idle", query);
    assert.deepEqual(ids(s), [], query);
    assert.deepEqual(index.calls, [], query);
  }
  // With a filter, the filter alone answers.
  const index = stubIndex();
  const p = props({ query: "??", categories: ["treaty"] });
  const h = renderHook(useEventSearch, p);
  const s = h.rerender(p);
  assert.equal(s.source, "local");
  assert.equal(s.textSearch, false);
  assert.deepEqual(ids(s), ["e2"]);
  assert.deepEqual(index.calls, []);
});

test("while degraded, a probe that went stale still ends the outage, and the current text is searched", async () => {
  const index = stubIndex();
  let recovered = 0;
  const p = props({ query: "old", degraded: true, probeTick: 0, onRecovered: () => recovered++ });
  const h = renderHook(useEventSearch, p);
  assert.deepEqual(index.calls, []); // degraded: no search until a probe
  h.rerender({ ...p, probeTick: 1 });
  assert.deepEqual(index.calls, ["old"]);
  // The text changes before the probe answers (and settles: 300 ms), which is
  // not searched while degraded.
  h.rerender({ ...p, query: "new", probeTick: 1 });
  await new Promise((r) => setTimeout(r, 320));
  h.rerender({ ...p, query: "new", probeTick: 1 });
  assert.deepEqual(index.calls, ["old"]);
  await index.settle(); // the stale probe loads
  assert.equal(recovered, 1);
  // App clears degraded: the current text is searched at once, and answered.
  h.rerender({ ...p, query: "new", probeTick: 1, degraded: false });
  assert.deepEqual(index.calls, ["old", "new"]);
  await index.settle();
  const s = h.rerender({ ...p, query: "new", probeTick: 1, degraded: false });
  assert.equal(s.status, "ready");
  assert.equal(s.source, "fulltext");
});

test("a recovery that answered the text does not search it again", async () => {
  const index = stubIndex();
  const p = props({ degraded: true, probeTick: 0 });
  const h = renderHook(useEventSearch, p);
  h.rerender({ ...p, probeTick: 1 });
  await index.settle();
  h.rerender({ ...p, probeTick: 1, degraded: false });
  assert.deepEqual(index.calls, ["event"]);
});
