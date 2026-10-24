import test from "node:test";
import assert from "node:assert/strict";
import { decimalPlaces, isLowPrecisionPin, roundedLocationNote } from "./coordPrecision.js";

test("roundedLocationNote: names the source and the coordinates as given", () => {
  assert.equal(
    roundedLocationNote({ coordinate_source: "wikidata", coordinates: { lat: 33, lon: 43 } }),
    "Approximate location: Wikidata gives this event’s coordinates only to the nearest degree or tenth of a degree (33, 43), so its marker shows the general area, not where the event happened."
  );
  assert.match(roundedLocationNote({ coordinate_source: "wikipedia", coordinates: { lat: 30.5, lon: 47.8 } }), /^Approximate location: Wikipedia gives .* \(30\.5, 47\.8\),/);
  // Before the full record arrives (no coordinate_source yet).
  assert.match(roundedLocationNote({ coordinates: { lat: 30, lon: 24 } }), /^Approximate location: The source gives/);
});

test("decimalPlaces: as JavaScript writes the number", () => {
  assert.equal(decimalPlaces(33), 0);
  assert.equal(decimalPlaces(30.5), 1);
  assert.equal(decimalPlaces(31.36), 2);
  assert.equal(decimalPlaces(31.35027777777778), 14);
  assert.equal(decimalPlaces(-3.7), 1);
  assert.equal(decimalPlaces(1e-7), null);
  assert.equal(decimalPlaces(NaN), null);
  assert.equal(decimalPlaces("33"), null);
});

test("isLowPrecisionPin: a precise pin with at most one decimal place in both coordinates", () => {
  const pin = (lat, lon, q = "precise") => ({ location_quality: q, coordinates: { lat, lon } });
  // As in the data: al-anfal-campaign 33, 43; operation-crusader 30, 24; siege-of-basra 30.5, 47.8.
  assert.equal(isLowPrecisionPin(pin(33, 43)), true);
  assert.equal(isLowPrecisionPin(pin(30, 24)), true);
  assert.equal(isLowPrecisionPin(pin(30.5, 47.8)), true);
  // Finer in either coordinate: october-7-attacks 31.36, 34.51; adana-massacre 37, 35.32133.
  assert.equal(isLowPrecisionPin(pin(31.36, 34.51)), false);
  assert.equal(isLowPrecisionPin(pin(37, 35.32133)), false);
  // Capital fallbacks and events without a location are not "precise" pins.
  assert.equal(isLowPrecisionPin(pin(33, 44, "approximate")), false);
  assert.equal(isLowPrecisionPin({ location_quality: "none", coordinates: null }), false);
  assert.equal(isLowPrecisionPin(null), false);
});
