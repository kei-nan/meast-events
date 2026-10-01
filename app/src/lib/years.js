// The timeline's year span, shared by the app (Timeline, URL state, map) and the
// build (scripts/split-data.mjs). The last year is the current UTC year, read
// when the code runs, so the timeline grows on 1 January without a code change.
// Current borders end in 9999 (scripts/ingest-boundaries.js), so they draw in
// any later year. split-data writes data chunks up to the decade of the year it
// runs in, so a site must be rebuilt at least once per new decade (next: 2030).
export const MIN_YEAR = 1900;
export const MAX_YEAR = new Date().getUTCFullYear();
