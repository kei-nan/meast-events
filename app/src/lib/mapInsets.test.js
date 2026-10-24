import test from "node:test";
import assert from "node:assert/strict";
import { PIN_MARGIN_PX, clearPadding, growPadding, keepPinInside, paddingOffset, screenPoint } from "./mapInsets.js";
import { SHEET_STRIP_PX } from "./sheetSnap.js";

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

// The clear part of the map a padding leaves, as a rect.
const clearOf = (w, h, p) => rect(p.left, p.top, w - p.right, h - p.bottom);
const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// Overlays as measured on the dev site (Edge, 2026-10-24).
// Desktop 1440x900: a 1000x740 map; toolbar top left; Borders chip, the
// "Borders as of" pair and the zoom buttons stacked top right; attribution.
const DESKTOP = {
  w: 1000,
  h: 740,
  rects: [rect(10, 10, 235, 54), rect(825, 10, 990, 46), rect(783, 52, 990, 112), rect(946, 118, 990, 202), rect(904, 707, 990, 729)],
};
// Phone 390x844: a 390x729 map, the sheet at full (all but a 120 px strip),
// toolbar top left, Borders chip and the year pair in a row top right, zoom
// buttons under them.
const PHONE_FULL = {
  w: 390,
  h: 729,
  rects: [rect(10, 10, 177, 62), rect(219, 10, 285, 54), rect(291, 10, 380, 54), rect(280, 60, 380, 112), rect(0, 120, 390, 729)],
};

test("no overlays: no padding, no offset", () => {
  const p = clearPadding(800, 600, []);
  assert.deepEqual(p, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.deepEqual(paddingOffset(800, 600, p), [0, 0]);
});

test("the clear part never overlaps an overlay", () => {
  for (const { w, h, rects } of [DESKTOP, PHONE_FULL]) {
    const c = clearOf(w, h, clearPadding(w, h, rects));
    for (const r of rects) assert.ok(!intersects(c, r), `${JSON.stringify(c)} overlaps ${JSON.stringify(r)}`);
    assert.ok(c.right - c.left >= 40 && c.bottom - c.top >= 40);
  }
});

test("desktop: most of the map stays clear", () => {
  const { w, h, rects } = DESKTOP;
  const c = clearOf(w, h, clearPadding(w, h, rects));
  assert.ok((c.right - c.left) * (c.bottom - c.top) > 0.7 * w * h);
});

test("phone, sheet at full: below the toolbar and left of the zoom buttons, not the wedge between controls", () => {
  const { w, h, rects } = PHONE_FULL;
  const p = clearPadding(w, h, rects);
  assert.deepEqual(clearOf(w, h, p), rect(0, 62, 280, SHEET_STRIP_PX));
  // The offset puts the target in the middle of that part.
  const [dx, dy] = paddingOffset(w, h, p);
  assert.ok(Math.abs(w / 2 + dx - 140) <= 0.5);
  assert.ok(Math.abs(h / 2 + dy - 91) <= 0.5);
});

test("phone, sheet at half: the whole width below the controls", () => {
  const rects = [...PHONE_FULL.rects.slice(0, 4), rect(0, 365, 390, 729)];
  assert.deepEqual(clearOf(390, 729, clearPadding(390, 729, rects)), rect(0, 112, 390, 365));
});

test("controls leaving no usable part are ignored; the sheet never is", () => {
  // A strip 50 px tall, its top 40 px under a bar of controls nearly as wide.
  const rects = [rect(0, 0, 370, 40), rect(0, 50, 390, 700)];
  assert.deepEqual(clearOf(390, 700, clearPadding(390, 700, rects)), rect(0, 0, 390, 50));
});

test("growPadding adds to every side", () => {
  assert.deepEqual(growPadding({ top: 1, right: 2, bottom: 3, left: 4 }, 40), { top: 41, right: 42, bottom: 43, left: 44 });
});

test("screenPoint: the centre shows at the middle plus the offset", () => {
  const cam = { center: [35, 31.8], zoom: 5, offset: [10, -20] };
  assert.deepEqual(screenPoint([35, 31.8], cam, 400, 300).map(Math.round), [210, 130]);
  // East is right and north is up; one degree of longitude at zoom 0 is 512/360 px.
  const [x, y] = screenPoint([36, 32.8], { center: [35, 31.8], zoom: 0 }, 400, 300);
  assert.ok(Math.abs(x - (200 + 512 / 360)) < 1e-9);
  assert.ok(y < 150);
});

test("keepPinInside leaves a pin already well inside alone", () => {
  const cam = { center: [35, 31.8], zoom: 5, offset: [0, 0] };
  const pad = { top: 60, right: 220, bottom: 0, left: 0 };
  assert.deepEqual(keepPinInside([35.2, 31.7], cam, 1000, 740, pad), cam.center);
});

test("keepPinInside moves a pin under a control into the clear part", () => {
  // Six-Day War on a phone, sheet at full: the countries' middle at the clear
  // part's middle, Jerusalem far to the north-east of it, under the Borders chip.
  const w = 390;
  const h = 729;
  const pad = clearPadding(w, h, PHONE_FULL.rects);
  const offset = paddingOffset(w, h, pad);
  const cam = { center: [31.5, 27.5], zoom: 3.6, offset };
  const pin = [35.2137, 31.7683];
  const before = screenPoint(pin, cam, w, h);
  assert.ok(before[1] < pad.top || before[0] > w - pad.right, "the pin starts outside the clear part");
  const center = keepPinInside(pin, cam, w, h, pad);
  const [x, y] = screenPoint(pin, { ...cam, center }, w, h);
  const c = clearOf(w, h, pad);
  assert.ok(x >= c.left + PIN_MARGIN_PX - 1e-6 && x <= c.right - PIN_MARGIN_PX + 1e-6, `x ${x}`);
  assert.ok(y >= c.top && y <= c.bottom, `y ${y}`);
  // In a part 58 px tall the pin is the margin inside it.
  assert.ok(y >= c.top + PIN_MARGIN_PX - 1e-3 && y <= c.bottom - PIN_MARGIN_PX + 1e-3, `y ${y}`);
  // The pin's marker (halo radius 22.5 px) stays off every control and the sheet.
  for (const r of PHONE_FULL.rects) {
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    assert.ok(Math.hypot(dx, dy) >= 22.5 + 5, `marker touches ${JSON.stringify(r)}`);
  }
});

test("keepPinInside puts the pin in the middle of a part too small for the margin", () => {
  const pad = { top: 62, right: 110, bottom: 729 - 110, left: 0 }; // 48 px tall
  const cam = { center: [35, 31.8], zoom: 4, offset: paddingOffset(390, 729, pad) };
  const center = keepPinInside([35, 40], cam, 390, 729, pad);
  const [, y] = screenPoint([35, 40], { ...cam, center }, 390, 729);
  assert.ok(Math.abs(y - 86) < 1e-3, `y ${y}`);
});

test("keepPinInside keeps a pin off the edge of a wide clear part (a fifth of it, up to twice the margin)", () => {
  const w = 1000;
  const h = 740;
  const pad = { top: 0, right: 0, bottom: 0, left: 0 };
  const cam = { center: [35, 31.8], zoom: 5, offset: [0, 0] };
  // A pin far off to the west.
  const center = keepPinInside([20, 31.8], cam, w, h, pad);
  const [x, y] = screenPoint([20, 31.8], { ...cam, center }, w, h);
  assert.ok(Math.abs(x - 2 * PIN_MARGIN_PX) < 1e-3, `x ${x}`);
  assert.ok(Math.abs(y - h / 2) < 1e-3, `y ${y}`);
});
