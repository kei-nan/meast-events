import test from "node:test";
import assert from "node:assert/strict";
import {
  PANEL_MIN,
  PANEL_STEP,
  PANEL_STEP_BIG,
  clampPanelWidth,
  maxPanelWidth,
  parseStoredWidth,
  widthForKey,
} from "./panelWidth.js";

test("the panel stays between 320 px and 60% of the window", () => {
  assert.equal(maxPanelWidth(1440), 864);
  assert.equal(clampPanelWidth(200, 1440), PANEL_MIN);
  assert.equal(clampPanelWidth(1200, 1440), 864);
  assert.equal(clampPanelWidth(500.6, 1440), 501);
});

test("on a narrow window the minimum wins over the share", () => {
  assert.equal(maxPanelWidth(500), PANEL_MIN);
  assert.equal(clampPanelWidth(400, 500), PANEL_MIN);
});

test("a remembered width is used only when it is a sane number", () => {
  assert.equal(parseStoredWidth("520"), 520);
  assert.equal(parseStoredWidth("1200"), 1200); // clamped when applied, by the window
  assert.equal(parseStoredWidth("100"), null);
  assert.equal(parseStoredWidth("abc"), null);
  assert.equal(parseStoredWidth("520px"), null);
  assert.equal(parseStoredWidth("99999"), null);
  assert.equal(parseStoredWidth(null), null);
});

test("keys: Left widens, Right narrows, Shift and Page keys take bigger steps", () => {
  assert.equal(widthForKey("ArrowLeft", false, 400, 1440), 400 + PANEL_STEP);
  assert.equal(widthForKey("ArrowRight", false, 400, 1440), 400 - PANEL_STEP);
  assert.equal(widthForKey("ArrowLeft", true, 400, 1440), 400 + PANEL_STEP_BIG);
  assert.equal(widthForKey("PageDown", false, 500, 1440), 500 - PANEL_STEP_BIG);
  assert.equal(widthForKey("PageUp", false, 500, 1440), 500 + PANEL_STEP_BIG);
});

test("keys: Home and End go to the limits, Enter resets, others are ignored", () => {
  assert.equal(widthForKey("Home", false, 500, 1440), PANEL_MIN);
  assert.equal(widthForKey("End", false, 500, 1440), 864);
  assert.equal(widthForKey("Enter", false, 500, 1440), "reset");
  assert.equal(widthForKey("a", false, 500, 1440), null);
  assert.equal(widthForKey("ArrowRight", false, PANEL_MIN, 1440), PANEL_MIN);
  assert.equal(widthForKey("ArrowLeft", false, 864, 1440), 864);
});
