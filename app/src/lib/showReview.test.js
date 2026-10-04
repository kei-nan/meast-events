import test from "node:test";
import assert from "node:assert/strict";
import { showReview } from "./showReview.js";

// Minimal DOM stand-ins: a document with an optional #framing-review element and
// a window whose matchMedia reports the reduced-motion preference.
function withDom({ box, reducedMotion }, fn) {
  const saved = { document: globalThis.document, window: globalThis.window };
  globalThis.document = { getElementById: (id) => (id === "framing-review" ? box : null) };
  globalThis.window =
    reducedMotion === undefined
      ? {}
      : { matchMedia: (q) => ({ matches: q === "(prefers-reduced-motion: reduce)" && reducedMotion }) };
  try {
    fn();
  } finally {
    Object.assign(globalThis, saved);
  }
}

function fakeBox() {
  const calls = [];
  return {
    calls,
    scrollIntoView: (opts) => calls.push(["scrollIntoView", opts]),
    focus: (opts) => calls.push(["focus", opts]),
  };
}

test("scrolls the review box smoothly to the top, then focuses it without a second scroll", () => {
  const box = fakeBox();
  withDom({ box, reducedMotion: false }, showReview);
  assert.deepEqual(box.calls, [
    ["scrollIntoView", { behavior: "smooth", block: "start" }],
    ["focus", { preventScroll: true }],
  ]);
});

test("honours prefers-reduced-motion: jumps instead of animating", () => {
  const box = fakeBox();
  withDom({ box, reducedMotion: true }, showReview);
  assert.deepEqual(box.calls[0], ["scrollIntoView", { behavior: "auto", block: "start" }]);
});

test("without matchMedia it still scrolls (smoothly)", () => {
  const box = fakeBox();
  withDom({ box, reducedMotion: undefined }, showReview);
  assert.equal(box.calls[0][1].behavior, "smooth");
});

test("does nothing when the page has no review box", () => {
  assert.doesNotThrow(() => withDom({ box: null, reducedMotion: false }, showReview));
});
