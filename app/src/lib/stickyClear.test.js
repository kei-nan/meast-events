import { test } from "node:test";
import assert from "node:assert/strict";
import { CLEAR_AIR_PX, claimClearance, clearancePx, stuckBottom } from "./stickyClear.js";

test("stuckBottom: the scroller's top padding, the sticky top and the bar's height", () => {
  // Desktop: top -16px cancels the 16px padding, so the bar's bottom is its height.
  assert.equal(stuckBottom({ padTop: 16, stickTop: -16, height: 30.6 }), 30.6);
  // Phone: no top padding, top 0.
  assert.equal(stuckBottom({ padTop: 0, stickTop: 0, height: 52 }), 52);
});

test("clearancePx: rounded up, with the air below; nothing for a hidden bar", () => {
  assert.equal(clearancePx({ padTop: 16, stickTop: -16, height: 30.6 }), Math.ceil(30.6 + CLEAR_AIR_PX));
  assert.equal(clearancePx({ padTop: 16, stickTop: -16, height: 0 }), 0);
  assert.equal(clearancePx({ padTop: 16, stickTop: -16, height: NaN }), 0);
});

test("claimClearance: the largest claim wins, and giving one up leaves the others", () => {
  const scroller = { style: { scrollPaddingTop: "" } };
  const axis = {};
  const actions = {};
  claimClearance(scroller, axis, 39);
  assert.equal(scroller.style.scrollPaddingTop, "39px");
  claimClearance(scroller, actions, 58);
  assert.equal(scroller.style.scrollPaddingTop, "58px");
  // The list hidden while an event is open: its axis has no height.
  claimClearance(scroller, axis, 0);
  assert.equal(scroller.style.scrollPaddingTop, "58px");
  // The event closes; the list (shown again) measures its axis.
  claimClearance(scroller, actions, null);
  claimClearance(scroller, axis, 39);
  assert.equal(scroller.style.scrollPaddingTop, "39px");
  claimClearance(scroller, axis, null);
  assert.equal(scroller.style.scrollPaddingTop, "");
});
