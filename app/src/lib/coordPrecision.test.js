import test from "node:test";
import assert from "node:assert/strict";
import { decimalPlaces, isLowPrecisionPin } from "./coordPrecision.js";

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
