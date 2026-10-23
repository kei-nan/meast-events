import test from "node:test";
import assert from "node:assert/strict";
import { stripOffset } from "./mapInsets.js";
import { SHEET_STRIP_PX } from "./sheetSnap.js";

test("no sheet over the map: centre and plain padding", () => {
  assert.deepEqual(stripOffset(600, null), [0, 0]);
  assert.deepEqual(stripOffset(600, null, 60), [0, 0]);
});

test("sheet open: the target lands in the middle of the top strip", () => {
  const h = 500;
  const [, dy] = stripOffset(h, SHEET_STRIP_PX);
  // The map centre moved by the offset is the strip's middle.
  assert.equal(h / 2 + dy, SHEET_STRIP_PX / 2);
});

test("sheet at half: the middle of the top half", () => {
  const h = 560;
  const [, dy] = stripOffset(h, 280);
  assert.equal(h / 2 + dy, 140);
  // Below a toolbar reaching 60 px down: the middle of 60..280.
  const [, dy2] = stripOffset(h, 280, 60);
  assert.equal(h / 2 + dy2, 170);
});

test("sheet open with a toolbar over the strip: the middle of what is left below it", () => {
  const h = 529;
  const [, dy] = stripOffset(h, SHEET_STRIP_PX, 60);
  assert.ok(Math.abs(h / 2 + dy - (60 + SHEET_STRIP_PX) / 2) <= 0.5);
  // A toolbar leaving too little of the strip is ignored.
  const [, dy2] = stripOffset(h, SHEET_STRIP_PX, 100);
  assert.ok(Math.abs(h / 2 + dy2 - SHEET_STRIP_PX / 2) <= 0.5);
});

test("a strip as tall as the map, or none at all, is left alone", () => {
  assert.deepEqual(stripOffset(SHEET_STRIP_PX, SHEET_STRIP_PX), [0, 0]);
  assert.deepEqual(stripOffset(500, 0), [0, 0]);
});
