import test from "node:test";
import assert from "node:assert/strict";
import { FLICK_PX_PER_MS, SHEET_STRIP_PX, clampSheet, sheetDetents, snapSheet, stepSheet } from "./sheetSnap.js";

// A 390x844 phone: about 560 px of map area under the header, above the timeline.
const phone = sheetDetents(560, 130);

test("resting heights: peek, half and full but the top strip", () => {
  assert.deepEqual(phone, [
    { name: "peek", h: 130 },
    { name: "half", h: 280 },
    { name: "full", h: 560 - SHEET_STRIP_PX },
  ]);
});

test("a short screen has no half: it would sit too close to peek or full", () => {
  assert.deepEqual(
    sheetDetents(300, 130).map((d) => d.name),
    ["peek", "full"]
  );
  // Never below peek, even when the map area is smaller than the strip plus the bar.
  assert.equal(sheetDetents(200, 130).at(-1).h, 130);
});

test("a slow release rests at the nearest height", () => {
  assert.equal(snapSheet(150, 0, phone), "peek");
  assert.equal(snapSheet(250, 0.1, phone), "half");
  assert.equal(snapSheet(400, -0.2, phone), "full");
});

test("a flick carries on to the next height that way", () => {
  assert.equal(snapSheet(150, FLICK_PX_PER_MS, phone), "half");
  assert.equal(snapSheet(300, 1.2, phone), "full");
  assert.equal(snapSheet(400, -1, phone), "half");
  assert.equal(snapSheet(270, -FLICK_PX_PER_MS, phone), "peek");
  // Already past the last one: it stays there.
  assert.equal(snapSheet(440, 2, phone), "full");
  assert.equal(snapSheet(130, -2, phone), "peek");
});

test("a drag is kept between peek and full", () => {
  assert.equal(clampSheet(20, phone), 130);
  assert.equal(clampSheet(900, phone), 440);
  assert.equal(clampSheet(300, phone), 300);
});

test("arrow keys step one height at a time and stop at the ends", () => {
  assert.equal(stepSheet("peek", 1, phone), "half");
  assert.equal(stepSheet("half", 1, phone), "full");
  assert.equal(stepSheet("full", 1, phone), "full");
  assert.equal(stepSheet("full", -1, phone), "half");
  assert.equal(stepSheet("peek", -1, phone), "peek");
  const short = sheetDetents(300, 130);
  assert.equal(stepSheet("half", 1, short), "full");
  assert.equal(stepSheet("half", -1, short), "peek");
});
