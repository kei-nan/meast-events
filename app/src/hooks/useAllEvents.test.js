import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// useAllEvents runs here against lib/testing/fakeReact.mjs (aliased in for
// "react"; setState does not re-render, so each step calls rerender) with the
// lite-set load (lib/dataClient loadAllLite) answered by each test, and the
// 20 s retry driven by mock timers.
const fakeReactUrl = new URL("../lib/testing/fakeReact.mjs", import.meta.url).href;
const dataClientUrl = `data:text/javascript,${encodeURIComponent(
  "export const loadAllLite = () => globalThis.__loadAllLite(); export const normalizeEvents = (list) => list;"
)}`;
register("../lib/testing/viteNodeHooks.mjs", import.meta.url, {
  data: { aliases: { react: fakeReactUrl, "../lib/dataClient": dataClientUrl } },
});
const { renderHook } = await import(fakeReactUrl);
const { default: useAllEvents, RETRY_MS } = await import("./useAllEvents.js");

const flush = () => new Promise((r) => setImmediate(r));
const EVENTS = [
  { id: "suez-crisis", title: "Suez Crisis" },
  { id: "six-day-war", title: "Six-Day War" },
];

// Each call of loadAllLite takes the next answer: "fail" rejects, an array resolves.
function source(answers) {
  let calls = 0;
  globalThis.__loadAllLite = () => {
    const a = answers[Math.min(calls++, answers.length - 1)];
    return a === "fail" ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(a);
  };
  return { calls: () => calls };
}

function setup(t) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  t.mock.method(console, "warn", () => {});
}

test("useAllEvents: loading until the first load ends, then every event in the store", async (t) => {
  setup(t);
  const src = source([EVENTS]);
  const { rerender } = renderHook(useAllEvents);
  let s = rerender();
  assert.equal(s.loading, true);
  assert.equal(s.error, false);
  await flush();
  s = rerender();
  assert.equal(s.loading, false);
  assert.equal(s.error, false);
  assert.equal(s.version, 1, "version changes when the store gains events");
  assert.deepEqual([...s.storeRef.current.keys()], ["suez-crisis", "six-day-war"]);
  t.mock.timers.tick(RETRY_MS * 3);
  rerender();
  assert.equal(src.calls(), 1, "a successful load is not repeated");
});

test("useAllEvents: an outage is an error (not loading), retried every 20 s until it recovers", async (t) => {
  setup(t);
  assert.equal(RETRY_MS, 20000);
  const src = source(["fail", "fail", EVENTS]);
  const { rerender } = renderHook(useAllEvents);
  await flush();
  let s = rerender();
  assert.equal(s.error, true);
  assert.equal(s.loading, false, "the page shows its outage state, not a loading skeleton");
  assert.equal(s.storeRef.current.size, 0);
  assert.equal(src.calls(), 1);

  t.mock.timers.tick(RETRY_MS - 1);
  rerender();
  assert.equal(src.calls(), 1, "no retry before 20 s");
  t.mock.timers.tick(1);
  s = rerender();
  assert.equal(src.calls(), 2, "retried at 20 s");
  assert.equal(s.loading, false, "loading stays false during a retry");
  await flush();
  s = rerender();
  assert.equal(s.error, true, "still down");

  t.mock.timers.tick(RETRY_MS);
  rerender();
  assert.equal(src.calls(), 3, "retried again 20 s later");
  await flush();
  s = rerender();
  assert.equal(s.error, false, "recovered");
  assert.equal(s.loading, false);
  assert.equal(s.version, 1);
  assert.equal(s.storeRef.current.size, 2);

  t.mock.timers.tick(RETRY_MS * 3);
  rerender();
  assert.equal(src.calls(), 3, "no more retries once loaded");
});
