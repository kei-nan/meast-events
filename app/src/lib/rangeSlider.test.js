import test from "node:test";
import assert from "node:assert/strict";
import { checkTypedYear, handleForDirection, keyTarget, moveHandle, pickHandle } from "./rangeSlider.js";
import { MAX_YEAR, MIN_YEAR } from "./years.js";

test("overlapping thumbs leave the choice to the drag direction", () => {
  // A single year: both thumbs are under the pointer.
  assert.equal(pickHandle(1967, 1967, 1967, 1.4), null);
  assert.equal(pickHandle(1967, 1967, 1967.9, 1.4), null);
  // A short range on a phone (thumb radius about 10 years).
  assert.equal(pickHandle(1948, 1949, 1948, 10.6), null);
  assert.equal(pickHandle(1948, 1949, 1945, 10.6), null);
  assert.equal(handleForDirection(-3), "start");
  assert.equal(handleForDirection(4), "end");
  assert.equal(handleForDirection(0), null);
});

test("a press on one thumb grabs that thumb", () => {
  assert.equal(pickHandle(1948, 1960, 1948.5, 1.4), "start");
  assert.equal(pickHandle(1948, 1960, 1959.2, 1.4), "end");
  // Just outside the other thumb's reach.
  assert.equal(pickHandle(1948, 1951, 1947, 1.4), "start");
  assert.equal(pickHandle(1948, 1951, 1952, 1.4), "end");
});

test("a press off both thumbs goes to the nearest handle", () => {
  assert.equal(pickHandle(MIN_YEAR, MAX_YEAR, 1950, 1.4), "start");
  assert.equal(pickHandle(MIN_YEAR, MAX_YEAR, 1990, 1.4), "end");
  assert.equal(pickHandle(1967, 1967, 1950, 1.4), "start");
  assert.equal(pickHandle(1967, 1967, 1990, 1.4), "end");
  assert.equal(pickHandle(1950, 1990, 1930, 1.4), "start");
  assert.equal(pickHandle(1950, 1990, 2010, 1.4), "end");
});

test("moving a handle clamps to the timeline and the other handle", () => {
  assert.deepEqual(moveHandle("start", 1940.4, 1948, 1949), [1940, 1949]);
  assert.deepEqual(moveHandle("start", 1960, 1948, 1949), [1949, 1949]);
  assert.deepEqual(moveHandle("end", 1940, 1948, 1949), [1948, 1948]);
  assert.deepEqual(moveHandle("end", 1973, 1967, 1967), [1967, 1973]);
  assert.deepEqual(moveHandle("start", 1800, 1967, 1967), [MIN_YEAR, 1967]);
  assert.deepEqual(moveHandle("end", 3000, 1967, 1967), [1967, MAX_YEAR]);
});

test("slider keys", () => {
  assert.equal(keyTarget("ArrowLeft", 1967), 1966);
  assert.equal(keyTarget("ArrowDown", 1967), 1966);
  assert.equal(keyTarget("ArrowRight", 1967), 1968);
  assert.equal(keyTarget("ArrowUp", 1967), 1968);
  assert.equal(keyTarget("PageDown", 1967), 1957);
  assert.equal(keyTarget("PageUp", 1967), 1977);
  assert.equal(keyTarget("Home", 1967), MIN_YEAR);
  assert.equal(keyTarget("End", 1967), MAX_YEAR);
  assert.equal(keyTarget("Enter", 1967), null);
});

test("typed years are used exactly or explained", () => {
  assert.deepEqual(checkTypedYear("start", "1956", 1948, 1967), { year: 1956 });
  assert.deepEqual(checkTypedYear("end", " 1973 ", 1948, 1967), { year: 1973 });
  assert.deepEqual(checkTypedYear("start", "1967", 1948, 1967), { year: 1967 });
  assert.match(checkTypedYear("start", "195", 1948, 1967).error, /from 1900/);
  assert.match(checkTypedYear("start", "19a6", 1948, 1967).error, /from 1900/);
  assert.match(checkTypedYear("start", "", 1948, 1967).error, /from 1900/);
  assert.match(checkTypedYear("start", "1899", 1948, 1967).error, /from 1900/);
  assert.match(checkTypedYear("end", String(MAX_YEAR + 1), 1948, 1967).error, /from 1900/);
  assert.match(checkTypedYear("start", "1970", 1948, 1967).error, /after the end year \(1967\)/);
  assert.match(checkTypedYear("end", "1940", 1948, 1967).error, /before the start year \(1948\)/);
});
