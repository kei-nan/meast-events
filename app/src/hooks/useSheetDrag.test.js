import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// useSheetDrag runs here against lib/testing/fakeReact.mjs (aliased in for
// "react"; setState does not re-render, so each step calls rerender) with a
// stand-in sheet element of fixed sizes.
const fakeReactUrl = new URL("../lib/testing/fakeReact.mjs", import.meta.url).href;
register("../lib/testing/viteNodeHooks.mjs", import.meta.url, { data: { aliases: { react: fakeReactUrl } } });
const { renderHook } = await import(fakeReactUrl);
const { default: useSheetDrag, FLICK_IDLE_MS } = await import("./useSheetDrag.js");

// A full sheet (563px) in a 683px map area, as on a 390x844 phone: a 1px top
// border, a 44px bar and a 44px search input (`input` 0: hidden, an event is open).
// `barShown` false: the desktop panel, where the bar is not displayed.
function setup({ input = 44, initial = "full", openTo, history = false, barShown = true } = {}) {
  const toggle = { offsetHeight: 44, getClientRects: () => (barShown ? [{}] : []) };
  const sheet = {
    clientTop: 1,
    parentElement: { clientHeight: 683 },
    getBoundingClientRect: () => ({ height: 563 }),
    querySelector: (s) => ({ ".sp-sheet-toggle": toggle, ".sp-inputwrap": { offsetHeight: input } })[s],
  };
  const { rerender } = renderHook(() => useSheetDrag(initial, { current: sheet }, openTo, { history }));
  const bar = () => rerender().barProps;
  const down = (y, t) => bar().onPointerDown({ button: 0, clientY: y, timeStamp: t, pointerId: 1, currentTarget: {} });
  const move = (y, t) => bar().onPointerMove({ clientY: y, timeStamp: t });
  const up = (t) => bar().onPointerUp({ timeStamp: t });
  return { rerender, down, move, up };
}

// The bar dragged 60px down in 40ms (1.5 px/ms): nearest to full, but a flick.
function quickDrag(s) {
  s.down(200, 0);
  s.move(230, 20);
  s.move(260, 40);
}

test("a quick drag let go at once flicks on to the next height", () => {
  const s = setup();
  quickDrag(s);
  s.up(48);
  assert.equal(s.rerender().sheet, "half");
});

test("a quick drag held still before letting go rests at the nearest height", () => {
  const s = setup();
  quickDrag(s);
  s.up(40 + FLICK_IDLE_MS + 1);
  assert.equal(s.rerender().sheet, "full");
});

test("the peek height comes from the bar and search box, before the sheet was ever at peek", () => {
  // Opened at full (an event's link), the search box hidden: peek is the bar
  // with its border and the space under it, 55px, the lowest a drag goes.
  const s = setup({ input: 0 });
  s.down(200, 0);
  s.move(900, 500);
  assert.equal(s.rerender().dragHeight, 55);
  s.up(900);
  assert.equal(s.rerender().sheet, "peek");
  // With the search box showing, its input as well: 99px.
  const t = setup();
  t.down(200, 0);
  t.move(900, 500);
  assert.equal(t.rerender().dragHeight, 99);
});

test("arrow keys step between the measured heights", () => {
  const s = setup();
  s.rerender().barProps.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  assert.equal(s.rerender().sheet, "half");
});

test("a tap on the lowered bar opens the sheet to full, or to openTo (half, an event)", () => {
  const s = setup({ initial: "peek" });
  s.rerender().barProps.onClick();
  assert.equal(s.rerender().sheet, "full");
  s.rerender().barProps.onClick();
  assert.equal(s.rerender().sheet, "peek");
  const t = setup({ initial: "peek", input: 0, openTo: "half" });
  t.rerender().barProps.onClick();
  assert.equal(t.rerender().sheet, "half");
  t.rerender().barProps.onClick();
  assert.equal(t.rerender().sheet, "peek");
});

// The sheet's history entry: a fake window whose history.back() waits for
// settle(), as a browser's traversal does; go(-1 | 1) is the reader's Back or
// Forward. Set before the hook mounts (it listens for popstate from then on).
function withHistory(ctx, url = "http://localhost/") {
  const entries = [{ url, state: null }];
  let index = 0;
  let backs = 0;
  const listeners = new Set();
  const go = (step) => {
    index += step;
    for (const fn of [...listeners]) fn();
  };
  globalThis.window = {
    location: {
      get href() {
        return entries[index].url;
      },
    },
    history: {
      get state() {
        return entries[index].state;
      },
      pushState(state, _t, to) {
        entries.splice(index + 1, Infinity, { url: new URL(to, url).href, state });
        index++;
      },
      replaceState(state, _t, to) {
        entries[index] = { url: new URL(to, url).href, state };
      },
      back() {
        backs++;
      },
    },
    addEventListener: (type, fn) => type === "popstate" && listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  ctx.after(() => delete globalThis.window);
  return {
    entries: () => entries.map((e) => e.state),
    index: () => index,
    go,
    settle() {
      assert.ok(backs > 0, "a history.back() is pending");
      backs--;
      go(-1);
    },
    backs: () => backs,
    // A replace by useUrlState (a debounced write): the same entry, a new URL.
    replaceUrl: (to) => (entries[index] = { ...entries[index], url: new URL(to, url).href }),
  };
}

test("raised over the list, the sheet adds a history entry; Back lowers it, Forward raises it again", (ctx) => {
  const h = withHistory(ctx);
  const s = setup({ initial: "peek", history: true });
  s.rerender().barProps.onClick();
  assert.equal(s.rerender().sheet, "full");
  assert.deepEqual(h.entries(), [null, { sheet: "full" }]);
  h.go(-1);
  assert.equal(s.rerender().sheet, "peek");
  h.go(1);
  assert.equal(s.rerender().sheet, "full");
});

test("lowered in the app with nothing else changed, the sheet's entry is gone back over", (ctx) => {
  const h = withHistory(ctx);
  const s = setup({ initial: "peek", history: true });
  s.rerender().barProps.onClick();
  s.rerender().barProps.onClick(); // lowered again
  assert.equal(h.backs(), 1);
  h.settle();
  assert.equal(h.index(), 0);
  assert.equal(s.rerender().sheet, "peek");
});

test("lowered after the URL changed, the entry stays and the next raise reuses it", (ctx) => {
  const h = withHistory(ctx);
  const s = setup({ initial: "peek", history: true });
  s.rerender().barProps.onClick();
  h.replaceUrl("/?cat=war");
  s.rerender().barProps.onClick();
  assert.equal(h.backs(), 0, "going back would lose the filter");
  s.rerender().barProps.onClick();
  assert.equal(h.entries().length, 2, "no second entry");
  assert.equal(s.rerender().sheet, "full");
  h.go(-1);
  assert.equal(s.rerender().sheet, "peek");
});

test("no sheet entry without `history` (an event open), a raise that was not from peek, or on the desktop panel", (ctx) => {
  const h = withHistory(ctx);
  const a = setup({ initial: "peek", history: false });
  a.rerender().barProps.onClick();
  const b = setup({ initial: "half", history: true });
  b.rerender().moveSheet("full");
  const c = setup({ initial: "peek", history: true, barShown: false });
  c.rerender().moveSheet("full");
  assert.deepEqual(h.entries(), [null]);
});

// A sheet in a map area `areaH` px tall, its bottom `bottom` px down the page,
// in a window `innerHeight` px tall that records how the page was scrolled.
function placed(ctx, { areaH, bottom, innerHeight = 740, initial = "half" }) {
  const scrolls = [];
  globalThis.window = {
    innerHeight,
    scrollBy: (x, y) => scrolls.push(["by", y]),
    scrollTo: (x, y) => scrolls.push(["to", y]),
    addEventListener() {},
    removeEventListener() {},
  };
  ctx.after(() => delete globalThis.window);
  const toggle = { offsetHeight: 44, getClientRects: () => [{}] };
  const sheet = {
    clientTop: 1,
    parentElement: { clientHeight: areaH },
    getBoundingClientRect: () => ({ height: 300, bottom }),
    querySelector: (s) => ({ ".sp-sheet-toggle": toggle, ".sp-inputwrap": { offsetHeight: 0 } })[s],
  };
  const { rerender } = renderHook(() => useSheetDrag(initial, { current: sheet }, "half"));
  return { rerender, scrolls };
}

test("an event opened at half in a map area too short for half goes on to full", (ctx) => {
  // 320x568: a 339px map area, half (170px) 49px from full (219px).
  const s = placed(ctx, { areaH: 339, bottom: 384, innerHeight: 568 });
  assert.equal(s.rerender().sheet, "full");
  // A taller one keeps half.
  assert.equal(placed(ctx, { areaH: 683, bottom: 700 }).rerender().sheet, "half");
});

test("raised below the screen's edge (a short screen, where the page scrolls), the page scrolls to the sheet's bottom; lowered, back to the top", (ctx) => {
  // 375x740 at 200% text: the map area grows to the screen + 120px, the sheet's bottom at 1017px.
  const s = placed(ctx, { areaH: 860, bottom: 1017 });
  s.rerender();
  assert.deepEqual(s.scrolls, [["by", 277]]);
  s.rerender().barProps.onClick(); // lowered
  s.rerender();
  assert.deepEqual(s.scrolls, [["by", 277], ["to", 0]]);
  // In sight already: no scroll.
  const t = placed(ctx, { areaH: 683, bottom: 700 });
  t.rerender();
  assert.deepEqual(t.scrolls, []);
});
