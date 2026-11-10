import test from "node:test";
import assert from "node:assert/strict";
import { placeToFocus } from "./placeParam.js";

const JERUSALEM = { lon: 35.2345, lat: 31.7767 };
const ALEPPO = { lon: 37.16, lat: 36.2 };

test("placeToFocus: Back/Forward onto a place flies to it when it opens or moves", () => {
  assert.deepEqual(placeToFocus(null, { place: JERUSALEM, eventId: null }), JERUSALEM);
  assert.deepEqual(placeToFocus(ALEPPO, { place: JERUSALEM, eventId: null }), JERUSALEM);
});

test("placeToFocus: not for a place that stays open, one under an event, or none", () => {
  // Back from an event opened over the place: the place was open all along.
  assert.equal(placeToFocus(JERUSALEM, { place: { lon: 35.23450001, lat: 31.7767 }, eventId: null }), null);
  assert.equal(placeToFocus(null, { place: JERUSALEM, eventId: "suez-crisis" }), null);
  assert.equal(placeToFocus(JERUSALEM, { place: null, eventId: null }), null);
});
