import test from "node:test";
import assert from "node:assert/strict";
import { playRestart, playStep } from "./playback.js";
import { MAX_YEAR, MIN_YEAR } from "./years.js";

test("accumulate keeps the start year and grows the end year", () => {
  assert.deepEqual(playStep(1948, 1950, "accumulate"), [1948, 1951]);
  assert.deepEqual(playStep(1948, 1950, undefined), [1948, 1951]);
});

test("slide moves both years, keeping the window length", () => {
  assert.deepEqual(playStep(1948, 1950, "slide"), [1949, 1951]);
  assert.deepEqual(playStep(1967, 1967, "slide"), [1968, 1968]);
});

test("no step once the end year is the last year", () => {
  assert.equal(playStep(1990, MAX_YEAR, "slide"), null);
  assert.equal(playStep(1990, MAX_YEAR, "accumulate"), null);
});

test("restart: accumulate from the start year, slide from the first year with the same length", () => {
  assert.deepEqual(playRestart(1990, MAX_YEAR, "accumulate"), [1990, 1990]);
  assert.deepEqual(playRestart(MAX_YEAR - 10, MAX_YEAR, "slide"), [MIN_YEAR, MIN_YEAR + 10]);
  assert.deepEqual(playRestart(MIN_YEAR, MAX_YEAR, "slide"), [MIN_YEAR, MIN_YEAR]);
});

test("restart: accumulate with only the last year selected grows from the first year", () => {
  assert.deepEqual(playRestart(MAX_YEAR, MAX_YEAR, "accumulate"), [MIN_YEAR, MIN_YEAR]);
  assert.deepEqual(playRestart(MAX_YEAR, MAX_YEAR, "slide"), [MIN_YEAR, MIN_YEAR]);
});

test("restart always leaves a step to play", () => {
  for (const mode of ["accumulate", "slide"]) {
    for (const start of [MIN_YEAR, 1967, MAX_YEAR - 1, MAX_YEAR]) {
      const [s, e] = playRestart(start, MAX_YEAR, mode);
      assert.notEqual(playStep(s, e, mode), null, `${mode} from ${start}`);
    }
  }
});
