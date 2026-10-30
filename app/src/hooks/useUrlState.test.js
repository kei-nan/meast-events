import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// useUrlState runs here against lib/testing/fakeReact.mjs (aliased in for
// "react") and a fake window whose history.back() is asynchronous, as in a
// browser: the traversal and its popstate happen only when the test calls
// settleBack(), so writes made in between can be checked.
const fakeReactUrl = new URL("../lib/testing/fakeReact.mjs", import.meta.url).href;
register("../lib/testing/viteNodeHooks.mjs", import.meta.url, { data: { aliases: { react: fakeReactUrl } } });
const { renderHook } = await import(fakeReactUrl);

function fakeWindow(startUrl = "/") {
  const entries = [{ url: startUrl, state: null }];
  let index = 0;
  let pendingBacks = 0;
  const listeners = new Set();
  const location = {};
  const sync = () => {
    const u = new URL(entries[index].url, "http://localhost");
    location.pathname = u.pathname;
    location.search = u.search;
    location.hash = u.hash;
  };
  sync();
  const history = {
    get state() {
      return entries[index].state;
    },
    get length() {
      return entries.length;
    },
    pushState(state, _title, url) {
      entries.splice(index + 1, Infinity, { url, state });
      index++;
      sync();
    },
    replaceState(state, _title, url) {
      entries[index] = { url, state };
      sync();
    },
    back() {
      pendingBacks++;
    },
  };
  return {
    window: {
      location,
      history,
      addEventListener: (type, fn) => type === "popstate" && listeners.add(fn),
      removeEventListener: (type, fn) => listeners.delete(fn),
    },
    urls: () => entries.map((e) => e.url),
    index: () => index,
    pendingBacks: () => pendingBacks,
    // The browser runs one queued history.back(): moves, then fires popstate.
    settleBack() {
      assert.ok(pendingBacks > 0, "a history.back() is pending");
      pendingBacks--;
      index--;
      sync();
      for (const fn of [...listeners]) fn();
    },
    // The user presses the browser's Back button.
    userBack() {
      index--;
      sync();
      for (const fn of [...listeners]) fn();
    },
  };
}

const BASE = { q: "", categories: [], countries: [], scope: "all", area: null, eventId: null, about: false, sort: "coverage" };

async function setup(startUrl = "/", initial = {}) {
  const w = fakeWindow(startUrl);
  globalThis.window = w.window;
  // A fresh module per test: its page-load id (DOC) and hook slots start clean.
  const { default: useUrlState } = await import(`./useUrlState.js?t=${Math.random()}`);
  const navigations = [];
  let state = { ...BASE, ...initial };
  const hook = renderHook((s) => useUrlState(s, (parsed) => navigations.push(parsed)), state);
  const set = (over) => {
    state = { ...state, ...over };
    return hook.rerender(state);
  };
  return { ...w, set, navigations };
}

test("opening an event pushes; closing it goes back to the entry it was opened from", async () => {
  const t = await setup();
  t.set({ eventId: "suez-crisis" });
  assert.deepEqual(t.urls(), ["/", "/event/suez-crisis"]);
  t.set({ eventId: null });
  assert.equal(t.pendingBacks(), 1);
  t.settleBack();
  assert.deepEqual(t.urls(), ["/", "/event/suez-crisis"]);
  assert.equal(t.index(), 0);
  assert.deepEqual(t.navigations, [], "our own back is not reported as a navigation");
});

test("a filter changed while the event was open is written onto the entry gone back to", async () => {
  const t = await setup();
  t.set({ eventId: "suez-crisis" });
  t.set({ q: "canal" }); // debounced replace, still pending
  t.set({ eventId: null });
  t.settleBack();
  assert.equal(t.index(), 0);
  assert.equal(t.urls()[0], "/?q=canal");
});

test("push, back, then another push before the popstate: the new event gets its own entry after the one gone back to", async () => {
  const t = await setup();
  t.set({ eventId: "suez-crisis" });
  t.set({ eventId: null }); // history.back() requested, not yet done
  t.set({ eventId: "six-day-war" }); // opened before the popstate arrives
  // Nothing is written mid-traversal: the entry being left is untouched.
  assert.deepEqual(t.urls(), ["/", "/event/suez-crisis"]);
  assert.equal(t.index(), 1);
  t.settleBack();
  assert.deepEqual(t.urls(), ["/", "/event/six-day-war"]);
  assert.equal(t.index(), 1);
  assert.deepEqual(t.navigations, []);
  // Closing it goes back to "/" again.
  t.set({ eventId: null });
  t.settleBack();
  assert.equal(t.index(), 0);
  assert.equal(t.urls()[0], "/");
});

test("push, back, then a filter change before the popstate: written onto the entry gone back to at once", async () => {
  const t = await setup();
  t.set({ eventId: "suez-crisis" });
  t.set({ eventId: null });
  t.set({ q: "canal" });
  assert.deepEqual(t.urls(), ["/", "/event/suez-crisis"]);
  t.settleBack();
  assert.deepEqual(t.urls(), ["/?q=canal", "/event/suez-crisis"]);
  assert.equal(t.index(), 0);
});

test("two nested events closed in a row before the first popstate: both go back", async () => {
  const t = await setup();
  t.set({ eventId: "suez-crisis" });
  t.set({ eventId: "six-day-war" });
  assert.deepEqual(t.urls(), ["/", "/event/suez-crisis", "/event/six-day-war"]);
  t.set({ eventId: "suez-crisis" }); // back to the first event
  t.set({ eventId: null }); // and closed, before the popstate
  t.settleBack(); // reaches suez-crisis; the state is now "/": back again
  assert.equal(t.pendingBacks(), 1);
  t.settleBack();
  assert.equal(t.index(), 0);
  assert.deepEqual(t.urls(), ["/", "/event/suez-crisis", "/event/six-day-war"]);
});

test("the browser's Back button is reported to onNavigate and not written back", async () => {
  const t = await setup();
  t.set({ eventId: "suez-crisis" });
  t.userBack();
  assert.equal(t.navigations.length, 1);
  assert.equal(t.navigations[0].eventId, null);
  t.set({ eventId: null }); // the app follows the navigation: nothing to write
  assert.equal(t.pendingBacks(), 0);
  assert.deepEqual(t.urls(), ["/", "/event/suez-crisis"]);
  assert.equal(t.index(), 0);
});

test("replaceNext() makes the next event change overwrite the current entry", async () => {
  const t = await setup("/event/suez-crisis", { eventId: "suez-crisis" });
  const replaceNext = t.set({});
  replaceNext();
  t.set({ eventId: null });
  assert.deepEqual(t.urls(), ["/"]);
  assert.equal(t.pendingBacks(), 0);
});
