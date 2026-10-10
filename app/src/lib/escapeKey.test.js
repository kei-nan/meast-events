import test from "node:test";
import assert from "node:assert/strict";
import { isUnhandledEscape } from "./escapeKey.js";

// A stand-in element: `inside` lists the selectors among its ancestors (itself
// included) that closest() finds.
function el(...inside) {
  return {
    closest: (selector) => (selector.split(",").some((s) => inside.includes(s.trim())) ? {} : null),
  };
}
const esc = (target, extra = {}) => ({ key: "Escape", defaultPrevented: false, target, ...extra });

test("an Escape on the map or the page is unhandled", () => {
  assert.equal(isUnhandledEscape(esc(el("canvas"))), true);
  assert.equal(isUnhandledEscape(esc(null)), true);
  assert.equal(isUnhandledEscape(esc({})), true); // window/document target
});

test("other keys and handled Escapes are not", () => {
  assert.equal(isUnhandledEscape({ key: "Enter", target: el() }), false);
  assert.equal(isUnhandledEscape(esc(el(), { defaultPrevented: true })), false);
});

test("an Escape in a form field, a dialog or the side panel belongs to it", () => {
  assert.equal(isUnhandledEscape(esc(el("input"))), false);
  assert.equal(isUnhandledEscape(esc(el("textarea"))), false);
  assert.equal(isUnhandledEscape(esc(el("select"))), false);
  assert.equal(isUnhandledEscape(esc(el("dialog[open]"))), false);
  assert.equal(isUnhandledEscape(esc(el("[role='dialog']"))), false);
  assert.equal(isUnhandledEscape(esc(el(".side-panel"))), false);
});

test("an Escape inside the handler's own element is its own", () => {
  const target = el("[role='dialog']");
  const own = { contains: (t) => t === target };
  assert.equal(isUnhandledEscape(esc(target), own), true);
  assert.equal(isUnhandledEscape(esc(el("[role='dialog']")), own), false);
  assert.equal(isUnhandledEscape(esc(target, { defaultPrevented: true }), own), false);
});
