import test from "node:test";
import assert from "node:assert/strict";
import { SHEET_STRIP_PX, stripOffset } from "./mapInsets.js";

test("no sheet over the map: centre and plain padding", () => {
  assert.deepEqual(stripOffset(600, false), [0, 0]);
  assert.deepEqual(stripOffset(600, false, 60), [0, 0]);
});

test("sheet open: the target lands in the middle of the top strip", () => {
  const h = 500;
  const [, dy] = stripOffset(h, true);
  // The map centre moved by the offset is the strip's middle.
  assert.equal(h / 2 + dy, SHEET_STRIP_PX / 2);
});

test("sheet open with a toolbar over the strip: the middle of what is left below it", () => {
  const h = 529;
  const [, dy] = stripOffset(h, true, 60);
  assert.ok(Math.abs(h / 2 + dy - (60 + SHEET_STRIP_PX) / 2) <= 0.5);
  // A toolbar leaving too little of the strip is ignored.
  const [, dy2] = stripOffset(h, true, 100);
  assert.ok(Math.abs(h / 2 + dy2 - SHEET_STRIP_PX / 2) <= 0.5);
});

test("a map no taller than the strip is left alone", () => {
  assert.deepEqual(stripOffset(SHEET_STRIP_PX, true), [0, 0]);
});
