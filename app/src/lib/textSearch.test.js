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

// ids.json answers `map` (calls lists those requests); pagefind/meta.json, read
// when the bundle names no folder (as here: no __SEARCH_DIR__) or after a
// failure, names folder v.test (calls.meta counts it). words.json (the index's
// word list) answers `words` (calls.words lists those requests).
const WORDS = ["a", "b", "c", "canal", "q", "suez", "x"];
function stubIds(map, { failFirst = 0, words = WORDS } = {}) {
  const calls = [];
  Object.defineProperty(calls, "meta", { value: 0, writable: true, enumerable: false }); // not part of deepEqual
  Object.defineProperty(calls, "words", { value: [], enumerable: false });
  globalThis.fetch = async (url) => {
    if (url.endsWith("/pagefind/meta.json")) {
      calls.meta++;
      return new Response(JSON.stringify({ version: "test", dir: "v.test" }), { headers: { "content-type": "application/json" } });
    }
    if (globalThis.__goneDir && url.includes(`/${globalThis.__goneDir}/`)) return new Response("", { status: 404 });
    if (url.endsWith("/words.json")) {
      calls.words.push(url);
      return new Response(JSON.stringify(words), { headers: { "content-type": "application/json" } });
    }
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
  assert.deepEqual(pf.calls.options, [{ basePath: "/pagefind/v.test/" }]);
  assert.deepEqual(calls, ["/pagefind/v.test/ids.json"]);
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

test("a failed engine download is retried under a new URL", async () => {
  // A browser rejects a second import of a URL whose download failed, without
  // a request; the stub does the same (one module per URL). A BASE_URL of its
  // own keeps this test's failed URL apart from the other tests'.
  globalThis.__VITE_ENV__ = { BASE_URL: "/retry/" };
  let downloadFails = true;
  globalThis.__fakePagefindDownloadFails = () => downloadFails;
  try {
    const { searchEventIds } = await fresh();
    const pf = fakePagefind({ results: [{ id: "p1" }] });
    stubIds({ p1: "e1" });
    await assert.rejects(searchEventIds("q"), /dynamically imported module/);
    downloadFails = false;
    assert.deepEqual(await searchEventIds("q"), ["e1"]);
    assert.deepEqual(pf.calls.options, [{ basePath: "/retry/pagefind/v.test/" }]);
    // The plain URL stays failed: importing it again would not recover.
    await assert.rejects(import("/retry/pagefind/v.test/pagefind.js"), /dynamically imported module/);
  } finally {
    delete globalThis.__VITE_ENV__;
    delete globalThis.__fakePagefindDownloadFails;
  }
});

test("the bundle's search folder is used; once it is gone, the folder meta.json names", async () => {
  globalThis.__SEARCH_DIR__ = "v.old";
  globalThis.__goneDir = "v.old";
  try {
    const { searchEventIds } = await fresh();
    const pf = fakePagefind({ results: [{ id: "p1" }] });
    const calls = stubIds({ p1: "e1" });
    await assert.rejects(searchEventIds("q"), /search ids: 404/);
    assert.equal(calls.meta, 0);
    assert.deepEqual(await searchEventIds("q"), ["e1"]);
    assert.equal(calls.meta, 1);
    // The search ran on the new folder's engine. The old folder's engine import
    // is not awaited by anyone and may settle before, after or not at all here.
    const bases = pf.calls.options.map((o) => o.basePath);
    assert.equal(bases.filter((b) => b === "/pagefind/v.test/").length, 1);
    assert.ok(bases.every((b) => b === "/pagefind/v.test/" || b === "/pagefind/v.old/"));
    assert.deepEqual(calls, ["/pagefind/v.test/ids.json"]);
  } finally {
    delete globalThis.__SEARCH_DIR__;
    delete globalThis.__goneDir;
  }
});

test("an old folder's load failing late does not reset the new folder's", async () => {
  // The old folder's engine fails at once; its id map answers 404 only after
  // the retry has loaded the new folder. The folder has a name of its own: an
  // engine URL imported by an earlier test stays cached and would not fail.
  globalThis.__SEARCH_DIR__ = "v.late";
  globalThis.__fakePagefindDownloadFails = (url) => url.includes("/v.late/");
  let release;
  const gate = new Promise((r) => (release = r));
  let oldIdsDone;
  const oldIdsSettled = new Promise((r) => (oldIdsDone = r));
  try {
    const { searchEventIds } = await fresh();
    const pf = fakePagefind({ results: [{ id: "p1" }] });
    const calls = stubIds({ p1: "e1" });
    const fetchNew = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (!url.includes("/v.late/")) return fetchNew(url, init);
      await gate;
      setTimeout(oldIdsDone, 0);
      return new Response("", { status: 404 });
    };
    await assert.rejects(searchEventIds("q"), /dynamically imported module/);
    assert.deepEqual(await searchEventIds("q"), ["e1"]);
    release();
    await oldIdsSettled;
    assert.deepEqual(await searchEventIds("q"), ["e1"]);
    // Still the retry's one meta.json read, engine and id map. Counted for this
    // test's folder only: the previous test's v.old engine load is not awaited
    // and may settle now, calling options() on this test's fake (seen on CI).
    assert.equal(calls.meta, 1);
    const bases = pf.calls.options.map((o) => o.basePath);
    assert.equal(bases.filter((b) => b === "/pagefind/v.test/").length, 1);
    assert.ok(bases.every((b) => b === "/pagefind/v.test/" || b === "/pagefind/v.old/"));
    assert.deepEqual(calls, ["/pagefind/v.test/ids.json"]);
  } finally {
    delete globalThis.__SEARCH_DIR__;
    delete globalThis.__fakePagefindDownloadFails;
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
    assert.deepEqual(pf.calls.options, [{ basePath: "/sub/pagefind/v.test/" }]);
    assert.deepEqual(calls, ["/sub/pagefind/v.test/ids.json"]);
  } finally {
    delete globalThis.__VITE_ENV__;
  }
});

test("a word no indexed word starts with answers no events, without Pagefind's prefix fallback", async () => {
  const { searchEventIds } = await fresh();
  // Pagefind would answer "suezxyz" with the "suez" events, and ignore "qqq" in "suez qqq".
  const pf = fakePagefind({ results: [{ id: "p1" }] });
  const calls = stubIds({ p1: "e1" }, { words: ["jerusalem", "suez", "suezkan", "war"] });
  assert.deepEqual(await searchEventIds("suezxyz"), []);
  assert.deepEqual(await searchEventIds("suez qqq"), []);
  assert.deepEqual(await searchEventIds("Jerusalm"), []);
  assert.deepEqual(pf.calls.search, []);
  // Real words, prefixes of them and inflected forms (stemmed as Pagefind does) are searched.
  assert.deepEqual(await searchEventIds("Suez"), ["e1"]);
  assert.deepEqual(await searchEventIds("jerus"), ["e1"]);
  assert.deepEqual(await searchEventIds("Suez wars"), ["e1"]);
  assert.deepEqual(pf.calls.search, ["Suez", "jerus", "Suez wars"]);
  assert.deepEqual(calls.words, ["/pagefind/v.test/words.json"]);
});

test("symbols, never part of an indexed word, are left out of the query", async () => {
  const { searchEventIds } = await fresh();
  const pf = fakePagefind({ results: [{ id: "p1" }] });
  stubIds({ p1: "e1" }, { words: ["8000", "us500"] });
  assert.deepEqual(await searchEventIds("8000+"), ["e1"]);
  assert.deepEqual(await searchEventIds("US$500"), ["e1"]);
  assert.deepEqual(pf.calls.search, ["8000", "US500"]);
});

test("a word list that is not a list is a failed load", async () => {
  const { searchEventIds } = await fresh();
  fakePagefind({ results: [{ id: "p1" }] });
  stubIds({ p1: "e1" }, { words: { nope: 1 } });
  await assert.rejects(searchEventIds("q"), /words.json is not a list/);
});
