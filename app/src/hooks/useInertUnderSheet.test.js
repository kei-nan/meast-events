import test from "node:test";
import assert from "node:assert/strict";
import { isUnderSheet } from "./useInertUnderSheet.js";

const box = (top, height = 44, width = 44) => ({ top, bottom: top + height, width, height });

test("a control starting at or below the sheet's top is under it; one it covers in part is not", () => {
  // The sheet's top at 400px: "Move map" at 409px (375x740 at 200% text, half sheet).
  assert.equal(isUnderSheet(box(409), 400), true);
  assert.equal(isUnderSheet(box(400), 400), true);
  assert.equal(isUnderSheet(box(380), 400), false, "its top 20px still in sight");
  assert.equal(isUnderSheet(box(100), 400), false);
});

test("a control that is not displayed (no size) is not counted as under the sheet", () => {
  assert.equal(isUnderSheet(box(500, 0, 0), 400), false);
});
