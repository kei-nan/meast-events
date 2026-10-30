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
function setup({ input = 44, initial = "full", openTo } = {}) {
  const sheet = {
    clientTop: 1,
    parentElement: { clientHeight: 683 },
    getBoundingClientRect: () => ({ height: 563 }),
    querySelector: (s) => ({ ".sp-sheet-toggle": { offsetHeight: 44 }, ".sp-inputwrap": { offsetHeight: input } })[s],
  };
  const { rerender } = renderHook(() => useSheetDrag(initial, { current: sheet }, openTo));
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
