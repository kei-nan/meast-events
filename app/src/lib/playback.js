// Timeline Play stepping. Pure.

import { MAX_YEAR, MIN_YEAR } from "./years.js";

/**
 * One Play step. "accumulate" keeps the start year and grows the end year;
 * "slide" moves both, keeping the window length. Returns null once the end
 * year has reached MAX_YEAR.
 */
export function playStep(start, end, mode) {
  if (end >= MAX_YEAR) return null;
  return mode === "slide" ? [start + 1, end + 1] : [start, end + 1];
}

/**
 * Where Play restarts when pressed with the end year already at MAX_YEAR. The
 * result always leaves a step to play (its end year is before MAX_YEAR).
 */
export function playRestart(start, end, mode) {
  // Growing from the last year has nowhere to go: grow from the first instead.
  if (mode !== "slide") return start < MAX_YEAR ? [start, start] : [MIN_YEAR, MIN_YEAR];
  const len = end - start;
  // A window covering every year cannot slide; slide a single year instead.
  return len >= MAX_YEAR - MIN_YEAR ? [MIN_YEAR, MIN_YEAR] : [MIN_YEAR, MIN_YEAR + len];
}
