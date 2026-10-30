import test from "node:test";
import assert from "node:assert/strict";
import { COUNTRY_CAPITALS } from "../../../scripts/lib/geo.js";
import { FALLBACK_PLACES, fallbackLocationNote } from "./fallbackPoint.js";

test("FALLBACK_PLACES: one place per country fallback point in scripts/lib/geo.js COUNTRY_CAPITALS", () => {
  assert.deepEqual(Object.keys(FALLBACK_PLACES).sort(), Object.keys(COUNTRY_CAPITALS).sort());
  for (const [country, place] of Object.entries(FALLBACK_PLACES)) {
    assert.ok(typeof place === "string" && place.trim(), `${country} has a place name`);
  }
});

test("fallbackLocationNote: names the country and its reference place, and disclaims the city's status", () => {
  const note = fallbackLocationNote({ coordinate_source: "country-fallback:Israel/Palestine" });
  assert.equal(
    note,
    "Approximate location: no coordinates were found for this event, so its marker is placed at the one reference point used for every such event of Israel/Palestine (Jerusalem), whatever its date. The marker shows the country, not where the event happened, and says nothing about the status of that city."
  );
  assert.match(fallbackLocationNote({ coordinate_source: "country-fallback:Turkey" }), /event of Turkey \(Ankara\), whatever its date/);
});

test("fallbackLocationNote: a country without a known place is named without a city or status clause", () => {
  const note = fallbackLocationNote({ coordinate_source: "country-fallback:regional" });
  assert.match(note, /every such event of Region-wide, whatever its date\./);
  assert.doesNotMatch(note, /\(/);
  assert.doesNotMatch(note, /status of that city/);
});

test("fallbackLocationNote: inherited object keys are not treated as places", () => {
  const note = fallbackLocationNote({ coordinate_source: "country-fallback:toString" });
  assert.doesNotMatch(note, /\(/);
  assert.match(note, /event of toString, whatever/);
});

test("fallbackLocationNote: without a country-fallback source (or before the full record loads) it stays generic", () => {
  const generic =
    "Approximate location: no coordinates were found for this event, so its marker is placed at a fixed reference point for one of its countries. The marker shows the country, not where the event happened.";
  for (const event of [undefined, null, {}, { coordinate_source: "wikidata" }, { coordinate_source: "country-fallback:" }]) {
    assert.equal(fallbackLocationNote(event), generic);
  }
});
