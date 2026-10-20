import test from "node:test";
import assert from "node:assert/strict";
import { RELOAD_KEY, RELOAD_WINDOW_MS, claimReload, importOr, isLoadFailure, reloadOnce } from "./importOr.js";

const Fallback = () => null;
const Real = () => null;
const offline = () => new TypeError("Failed to fetch dynamically imported module: https://x/assets/A-12345678.js");
// Counts reload requests and answers `result` (whether the page reloaded).
const reloader = (result = false) => {
  const fn = async () => (fn.calls++, result);
  fn.calls = 0;
  return fn;
};

// A sessionStorage stand-in; `fail` makes every call throw, as a blocked one does.
function memoryStorage({ fail = false } = {}) {
  const m = new Map();
  const check = () => {
    if (fail) throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return {
    getItem: (k) => (check(), m.has(k) ? m.get(k) : null),
    setItem: (k, v) => (check(), m.set(k, String(v))),
  };
}

test("a chunk that loads is used, with one download", async () => {
  let calls = 0;
  const reload = reloader();
  const mod = await importOr(() => (calls++, Promise.resolve({ default: Real })), Fallback, { delay: 0, reload });
  assert.equal(mod.default, Real);
  assert.equal(calls, 1);
  assert.equal(reload.calls, 0);
});

test("a failed download is retried once, and the retry's chunk is used", async () => {
  let calls = 0;
  const reload = reloader();
  const load = () => (++calls === 1 ? Promise.reject(offline()) : Promise.resolve({ default: Real }));
  const mod = await importOr(load, Fallback, { delay: 0, reload });
  assert.equal(mod.default, Real);
  assert.equal(calls, 2);
  assert.equal(reload.calls, 0);
});

test("two failed downloads ask for one reload, then resolve to the fallback when it is refused", async () => {
  let calls = 0;
  const reload = reloader(false);
  const mod = await importOr(() => (calls++, Promise.reject(offline())), Fallback, { delay: 0, reload });
  assert.equal(mod.default, Fallback);
  assert.equal(calls, 2);
  assert.equal(reload.calls, 1);
});

test("while a reload starts, the fallback waits out the grace period", async () => {
  const mod = await importOr(() => Promise.reject(offline()), Fallback, { delay: 0, reload: reloader(true), grace: 0 });
  assert.equal(mod.default, Fallback);
});

test("a missing stylesheet (Vite's preload error) counts as a failed download", async () => {
  const css = () => new Error("Unable to preload CSS for https://x/assets/MapView-WgrWBmqo.css");
  const reload = reloader();
  const mod = await importOr(() => Promise.reject(css()), Fallback, { delay: 0, reload });
  assert.equal(mod.default, Fallback);
  assert.equal(reload.calls, 1);
});

test("an error from running the module is rethrown, not retried, reloaded or hidden", async () => {
  let calls = 0;
  const reload = reloader(true);
  const bug = new ReferenceError("x is not defined");
  await assert.rejects(importOr(() => (calls++, Promise.reject(bug)), Fallback, { delay: 0, reload }), bug);
  assert.equal(calls, 1);
  assert.equal(reload.calls, 0);
});

test("isLoadFailure knows each engine's message and Vite's, and nothing else", () => {
  assert.ok(isLoadFailure(offline()));
  assert.ok(isLoadFailure(new TypeError("error loading dynamically imported module: https://x/a.js")));
  assert.ok(isLoadFailure(new TypeError("Importing a module script failed.")));
  assert.ok(isLoadFailure(new Error("Unable to preload CSS for https://x/assets/A-12345678.css")));
  assert.ok(!isLoadFailure(new TypeError("Cannot read properties of undefined (reading 'map')")));
  assert.ok(!isLoadFailure(new Error("Failed to fetch dynamically imported module")));
  assert.ok(!isLoadFailure(new Error("x Unable to preload CSS for y")));
  assert.ok(!isLoadFailure(undefined));
});

test("claimReload: the first failure may reload, a second one within the window may not", () => {
  const s = memoryStorage();
  assert.equal(claimReload(s, 1_000_000), true);
  assert.equal(s.getItem(RELOAD_KEY), "1000000");
  // The page after the reload fails again: no second reload, so no loop.
  assert.equal(claimReload(s, 1_000_000 + 5_000), false);
  assert.equal(claimReload(s, 1_000_000 + RELOAD_WINDOW_MS - 1), false);
  // A later deploy, long after: one more reload.
  assert.equal(claimReload(s, 1_000_000 + RELOAD_WINDOW_MS), true);
});

test("claimReload refuses when storage is missing, throws, or does not keep the value", () => {
  assert.equal(claimReload(null, 1), false);
  assert.equal(claimReload(memoryStorage({ fail: true }), 1), false);
  assert.equal(claimReload({ getItem: () => null, setItem: () => {} }, 1), false);
  // A time later than now (the clock went back) is not a recent reload; nor is garbage.
  const s = memoryStorage();
  s.setItem(RELOAD_KEY, "5000");
  assert.equal(claimReload(s, 1000), true);
  s.setItem(RELOAD_KEY, "not a time");
  assert.equal(claimReload(s, 2000), true);
});

test("reloadOnce reloads once, and not while the page cannot be reached", async () => {
  const s = memoryStorage();
  let reloads = 0;
  const go = () => reloads++;
  let t = 10_000_000;
  const now = () => t;
  // Offline: keep the app (a reload would show the browser's error page), and
  // keep the one reload for when the connection is back.
  assert.equal(await reloadOnce({ storage: s, now, reachable: async () => false, go }), false);
  assert.equal(reloads, 0);
  assert.equal(await reloadOnce({ storage: s, now, reachable: async () => true, go }), true);
  assert.equal(reloads, 1);
  t += 3_000;
  assert.equal(await reloadOnce({ storage: s, now, reachable: async () => true, go }), false);
  assert.equal(reloads, 1);
});

test("importOr with reloadOnce: when the reloaded page fails too, there is no second reload", async () => {
  // One sessionStorage outlives the reload; each "page" runs importOr anew.
  const s = memoryStorage();
  let reloads = 0;
  let t = 50_000_000;
  const reload = () => reloadOnce({ storage: s, now: () => t, reachable: async () => true, go: () => reloads++ });
  const page = () => importOr(() => Promise.reject(offline()), Fallback, { delay: 0, reload, grace: 0 });
  assert.equal((await page()).default, Fallback);
  assert.equal(reloads, 1);
  t += 4_000;
  assert.equal((await page()).default, Fallback);
  assert.equal(reloads, 1);
});
