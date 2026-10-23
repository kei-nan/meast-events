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

test("the widest: 60% of the window, but never past the content (56rem)", () => {
  assert.equal(maxPanelWidth(1440), 864); // 60% comes first
  assert.equal(maxPanelWidth(2560), 896); // 56rem at 16px
  assert.equal(maxPanelWidth(2560, 20), 1120); // a larger text size widens the content, and the limit with it
  assert.equal(maxPanelWidth(500), PANEL_MIN); // a narrow window: the minimum wins
});

test("a width is kept between 320 px and the widest", () => {
  assert.equal(clampPanelWidth(200, 864), PANEL_MIN);
  assert.equal(clampPanelWidth(1200, 864), 864);
  assert.equal(clampPanelWidth(500.6, 864), 501);
  assert.equal(clampPanelWidth(400, PANEL_MIN), PANEL_MIN);
});

test("a remembered width is used only when it is a sane number", () => {
  assert.equal(parseStoredWidth("520"), 520);
  assert.equal(parseStoredWidth("1200"), 1200); // held to the limits by the CSS when applied
  assert.equal(parseStoredWidth("100"), null);
  assert.equal(parseStoredWidth("abc"), null);
  assert.equal(parseStoredWidth("520px"), null);
  assert.equal(parseStoredWidth("99999"), null);
  assert.equal(parseStoredWidth(null), null);
});

test("keys: Left widens, Right narrows, Shift and Page keys take bigger steps", () => {
  assert.equal(widthForKey("ArrowLeft", false, 400, 864), 400 + PANEL_STEP);
  assert.equal(widthForKey("ArrowRight", false, 400, 864), 400 - PANEL_STEP);
  assert.equal(widthForKey("ArrowLeft", true, 400, 864), 400 + PANEL_STEP_BIG);
  assert.equal(widthForKey("PageDown", false, 500, 864), 500 - PANEL_STEP_BIG);
  assert.equal(widthForKey("PageUp", false, 500, 864), 500 + PANEL_STEP_BIG);
});

test("keys: Home and End go to the limits, Enter resets, others are ignored", () => {
  assert.equal(widthForKey("Home", false, 500, 864), PANEL_MIN);
  assert.equal(widthForKey("End", false, 500, 896), 896);
  assert.equal(widthForKey("Enter", false, 500, 864), "reset");
  assert.equal(widthForKey("a", false, 500, 864), null);
  assert.equal(widthForKey("ArrowRight", false, PANEL_MIN, 864), PANEL_MIN);
  assert.equal(widthForKey("ArrowLeft", false, 864, 864), 864);
});
