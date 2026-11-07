import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// src/index.css: the digits and en dash of "Spectral fallback" come from Times
// New Roman, sized to Spectral's, not from Georgia (old-style, proportional, 6.8%
// wider in "1900 – 2026"). With Georgia's the 360px phone timeline wrapped its
// presets onto a second row until Spectral loaded: 139 -> 95px, CLS +0.145 on
// the home page and +0.233 on an event page (measured 2026-11, slow 4G, 4x CPU).
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
const face = (range) => faces.find((f) => /"Spectral fallback"/.test(f) && f.includes(`unicode-range: ${range};`));

test("Spectral's fallback digits are tabular and Spectral's width (0.536em = Times New Roman's 0.5em x 107.2%)", () => {
  const digits = face("U+0030-0039");
  assert.ok(digits, "a Spectral fallback face for the digits");
  assert.match(digits, /local\("Times New Roman"\)/);
  assert.match(digits, /size-adjust: 107\.2%/);
  assert.match(digits, /font-weight: 600/);
});

test("Spectral's fallback en dash is Spectral's 0.5em", () => {
  const dash = face("U+2013");
  assert.ok(dash, "a Spectral fallback face for the en dash");
  assert.match(dash, /local\("Times New Roman"\)/);
  assert.match(dash, /size-adjust: 100%/);
});
