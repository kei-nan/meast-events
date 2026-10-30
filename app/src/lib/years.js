// The timeline's year span, shared by the app (Timeline, URL state, map) and the
// build (scripts/split-data.mjs).
//
// The build's last year is the current UTC year when it runs. split-data writes
// boundary chunks up to that year's decade only, and records the year as
// MAX_YEAR in the generated dataVersion.js, which vite.config.js hands the
// bundle as __DATA_MAX_YEAR__. In the browser the last year is the visitor's UTC
// year clamped to what the build can serve (lastYear below):
//  - never before the build's year, so a visitor whose clock is behind keeps
//    every year the data has, and shared y=...-<build year> links stay valid;
//  - never past the build decade's last year, so a clock ahead (or 1 January
//    2030 before a rebuild) never asks for a boundaries/<decade>.json that was
//    not written. Within the decade the timeline still grows on 1 January
//    without a rebuild (current borders end in 9999, scripts/ingest-boundaries.js,
//    so they draw in any later year); a new decade needs one (next: 2030).
// Outside a Vite bundle (the build itself, node --test) __DATA_MAX_YEAR__ is not
// defined and the clock's year is used: that is the build's year.
//
// The border decades are defined here (lib/eventYears.js re-exports them), so
// eventYears.js can read MAX_YEAR (ongoing events) without an import cycle.

export const DECADE_SIZE = 10;

/** The first year of the decade `year` falls in (the boundary chunk it lives in). */
export function decadeFloor(year) {
  return Math.floor(year / DECADE_SIZE) * DECADE_SIZE;
}

export const MIN_YEAR = 1900;

/** The timeline's last year for a clock in `clockYear` and data built in `buildYear` (null: unknown). */
export function lastYear(clockYear, buildYear) {
  if (!Number.isInteger(buildYear)) return clockYear;
  return Math.min(Math.max(clockYear, buildYear), decadeFloor(buildYear) + DECADE_SIZE - 1);
}

/* global __DATA_MAX_YEAR__ */
const BUILD_MAX_YEAR = typeof __DATA_MAX_YEAR__ === "number" ? __DATA_MAX_YEAR__ : null;

export const MAX_YEAR = lastYear(new Date().getUTCFullYear(), BUILD_MAX_YEAR);
