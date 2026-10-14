import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// textSearch.js reads Vite's import.meta.env and imports the Pagefind engine
// from <BASE_URL>pagefind/pagefind.js; the hooks define the first and route the
// second to globalThis.__fakePagefind. A fresh copy per test resets its caches.
register("./testing/viteNodeHooks.mjs", import.meta.url);
let copies = 0;
const fresh = () => import(`./textSearch.js?copy=${++copies}`);

function fakePagefind({ results = [], initFails = 0 } = {}) {
  const pf = {
    calls: { options: [], init: 0, search: [] },
    async options(o) {
      pf.calls.options.push(o);
    },
    async init() {
      pf.calls.init++;
      if (initFails-- > 0) throw new Error("engine failed");
    },
    async search(q) {
      pf.calls.search.push(q);
      return { results };
    },
  };
  globalThis.__fakePagefind = pf;
  return pf;
}

function stubIds(map, { failFirst = 0 } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (failFirst-- > 0) return new Response("", { status: 503 });
    return new Response(JSON.stringify(map), { headers: { "content-type": "application/json" } });
  };
  return calls;
}

test("maps Pagefind result ids to event ids in relevance order, dropping unknown ones", async () => {
  const { searchEventIds } = await fresh();
  const pf = fakePagefind({ results: [{ id: "p2" }, { id: "p9" }, { id: "p1" }] });
  const calls = stubIds({ p1: "event-1", p2: "event-2" });
  assert.deepEqual(await searchEventIds("suez canal"), ["event-2", "event-1"]);
  assert.deepEqual(pf.calls.search, ["suez canal"]);
  assert.deepEqual(pf.calls.options, [{ basePath: "/pagefind/" }]);
  assert.deepEqual(calls, ["/pagefind/ids.json"]);
});

test("engine and id map load once for many searches", async () => {
  const { searchEventIds, preloadTextSearch } = await fresh();
  const pf = fakePagefind({ results: [{ id: "p1" }] });
  const calls = stubIds({ p1: "e1" });
  preloadTextSearch();
  await Promise.all([searchEventIds("a"), searchEventIds("b")]);
  await searchEventIds("c");
  assert.equal(pf.calls.init, 1);
  assert.equal(calls.length, 1);
});

test("no results object is an empty answer", async () => {
  const { searchEventIds } = await fresh();
  const pf = fakePagefind();
  pf.search = async () => null;
  stubIds({});
  assert.deepEqual(await searchEventIds("x"), []);
});

test("a failed id map or engine load is retried on the next search", async () => {
  {
    const { searchEventIds } = await fresh();
    fakePagefind({ results: [{ id: "p1" }] });
    const calls = stubIds({ p1: "e1" }, { failFirst: 1 });
    await assert.rejects(searchEventIds("q"), /search ids: 503/);
    assert.deepEqual(await searchEventIds("q"), ["e1"]);
    assert.equal(calls.length, 2);
  }
  {
    const { searchEventIds } = await fresh();
    const pf = fakePagefind({ results: [{ id: "p1" }], initFails: 1 });
    stubIds({ p1: "e1" });
    await assert.rejects(searchEventIds("q"), /engine failed/);
    assert.deepEqual(await searchEventIds("q"), ["e1"]);
    assert.equal(pf.calls.init, 2);
  }
});

test("preloadTextSearch swallows a failure", async () => {
  const { preloadTextSearch } = await fresh();
  fakePagefind({ initFails: 1 });
  stubIds({}, { failFirst: 1 });
  preloadTextSearch();
  await new Promise((r) => setTimeout(r, 0)); // an unhandled rejection would fail the run
});

test("the engine is looked up under BASE_URL", async () => {
  globalThis.__VITE_ENV__ = { BASE_URL: "/sub/" };
  try {
    const { searchEventIds } = await fresh();
    const pf = fakePagefind({ results: [] });
    const calls = stubIds({});
    await searchEventIds("q");
    assert.deepEqual(pf.calls.options, [{ basePath: "/sub/pagefind/" }]);
    assert.deepEqual(calls, ["/sub/pagefind/ids.json"]);
  } finally {
    delete globalThis.__VITE_ENV__;
  }
});
