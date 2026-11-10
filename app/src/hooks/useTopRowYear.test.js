import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// useTopRowYear runs here against lib/testing/fakeReact.mjs (aliased in for
// "react"; setState does not re-render, so each step calls rerender) with
// stand-in elements whose sizes the test sets, and ResizeObserver and
// requestAnimationFrame fakes that run when the test says.
const fakeReactUrl = new URL("../lib/testing/fakeReact.mjs", import.meta.url).href;
register("../lib/testing/viteNodeHooks.mjs", import.meta.url, { data: { aliases: { react: fakeReactUrl } } });
const { renderHook } = await import(fakeReactUrl);
const { default: useTopRowYear } = await import("./useTopRowYear.js");

function setup(ctx) {
  const frames = [];
  const observers = [];
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
  globalThis.cancelAnimationFrame = () => {};
  globalThis.ResizeObserver = class {
    constructor(fn) {
      this.fn = fn;
      this.observed = [];
      observers.push(this);
    }
    observe(el) {
      this.observed.push(el);
    }
    disconnect() {
      this.observed = [];
    }
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  ctx.after(() => {
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
    delete globalThis.ResizeObserver;
    delete globalThis.window;
  });
  // Hidden (display: none, an event open over the list): every rect is zero.
  let shown = false;
  const rect = (top, height) => () => (shown ? { top, bottom: top + height } : { top: 0, bottom: 0 });
  const rows = [1948, 1956, 1967].map((year, i) => ({
    dataset: { year: String(year) },
    getBoundingClientRect: rect(100 + i * 40, 40),
  }));
  const scroller = { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: rect(0, 600) };
  const list = { closest: () => scroller, querySelectorAll: () => rows };
  const axis = { getBoundingClientRect: rect(60, 40) }; // its bottom at 100: the first row is right under it
  const hook = renderHook(() => useTopRowYear({ current: list }, { current: axis }, true, 50, rows));
  return {
    hook,
    list,
    observers,
    show: () => (shown = true),
    runFrames: () => frames.splice(0).forEach((fn) => fn()),
  };
}

test("useTopRowYear: a list mounted hidden gets its year once it is shown, with no scroll", (ctx) => {
  const t = setup(ctx);
  assert.equal(t.hook.rerender(), null, "nothing to measure while hidden");
  t.show(); // Back to the list: it gets its size, and no scroll event fires
  assert.ok(t.observers.some((o) => o.observed.includes(t.list)), "the list's size is watched");
  for (const o of t.observers) o.fn();
  t.runFrames();
  assert.equal(t.hook.rerender(), 1948);
});
