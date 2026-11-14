import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { checkAppUsage, REQUIRED, splitSelectors, trimMaplibreCss } from "./trim-maplibre-css.mjs";

const required = REQUIRED.map((s) => `${s}{a:b}`).join("");

test("splitSelectors splits at top-level commas only", () => {
  assert.deepEqual(splitSelectors(".a, .b:is(.c,.d) ,.e"), [".a", ".b:is(.c,.d)", ".e"]);
});

test("drops the unused controls' selectors, rules, empty @media and unnamed @keyframes; keeps the rest as it is", () => {
  const css =
    required +
    ".maplibregl-ctrl-group button:focus,.maplibregl-ctrl-attrib-button:focus{box-shadow:0 0 2px}" +
    '.maplibregl-ctrl-logo{background-image:url("data:image/svg+xml,%3Csvg%3E{}%3C/svg%3E")}' +
    "@media(forced-colors:active){.maplibregl-ctrl-icon{color:red}}" +
    "@media screen{.maplibregl-popup{x:y}.maplibregl-ctrl-attrib.maplibregl-compact{min-height:20px}}" +
    ".maplibregl-ctrl-geolocate-waiting .x{animation:maplibregl-spin 2s infinite}" +
    "@keyframes maplibregl-spin{0%{transform:rotate(0)}to{transform:rotate(1turn)}}" +
    ".maplibregl-marker{animation:keep 1s}@keyframes keep{to{opacity:0}}";
  const out = trimMaplibreCss(css);
  assert.ok(out.startsWith(required));
  assert.match(out, /\}\.maplibregl-ctrl-attrib-button:focus\{box-shadow:0 0 2px\}/);
  assert.doesNotMatch(out, /ctrl-group|ctrl-logo|ctrl-icon|popup|geolocate|maplibregl-spin|forced-colors/);
  assert.match(out, /@media screen\{\.maplibregl-ctrl-attrib\.maplibregl-compact\{min-height:20px\}\}/);
  assert.match(out, /@keyframes keep\{to\{opacity:0\}\}/);
});

test("fails when a rule the app needs is gone", () => {
  assert.throws(() => trimMaplibreCss(required.replace(".maplibregl-marker{", ".maplibregl-pin{")), /no longer has \.maplibregl-marker/);
});

test("the installed maplibre-gl.css: every required rule kept, the controls' icons gone", () => {
  const css = readFileSync(createRequire(import.meta.url).resolve("maplibre-gl/dist/maplibre-gl.css"), "utf8");
  const out = trimMaplibreCss(css);
  assert.ok(out.length < css.length / 4, `${out.length} of ${css.length} bytes kept`);
  assert.doesNotMatch(out, /maplibregl-(ctrl-logo|ctrl-group|popup|ctrl-geolocate)/);
  // The one icon kept: the compact attribution's "i" button (and its forced-colours variants).
  for (const m of out.matchAll(/[^{}]+\{[^{}]*data:image\/svg/g)) assert.match(m[0], /maplibregl-ctrl-attrib/);
});

test("checkAppUsage: a dropped class, control or option in src/ fails the build", () => {
  assert.doesNotThrow(() => checkAppUsage([["a.js", 'import { Map, Marker } from "maplibre-gl"; const c = ".maplibregl-ctrl-attrib";']]));
  assert.throws(() => checkAppUsage([["a.css", ".maplibregl-popup-content{}"]]), /a\.css uses maplibregl-popup/);
  assert.throws(() => checkAppUsage([["a.js", 'import { Map, NavigationControl } from "maplibre-gl";']]), /imports NavigationControl/);
  assert.throws(() => checkAppUsage([["a.js", 'import { Map } from "maplibre-gl"; new Map({ cooperativeGestures: true });']]), /cooperativeGestures/);
});
