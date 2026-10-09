// Order of the idle browse list (no query, filters or area). Pure.
//
// Events that START within the selected years come first; then events still
// ongoing from earlier. Without this a single year (e.g. 1948) would open with
// every multi-decade conflict that merely overlaps it. Within each part:
//   "coverage" (the app's default): most Wikidata sitelinks first - the same
//     mechanical signal as the inclusion rule (docs/DATA_POLICY.md, "Default
//     order") - then chronologically; events without a count come last.
//   "date": chronologically.

import { rankEvents } from "./ranking.js";

export const SORTS = ["coverage", "date"];

export function eventStartYear(event) {
  const y = String(event?.date_start ?? "").slice(0, 4);
  return y ? Number(y) : NaN;
}

/** True when the event began before `rangeStart` (so it is ongoing in the range). */
export function startedBefore(event, rangeStart) {
  const y = eventStartYear(event);
  return Number.isFinite(y) && y < rangeStart;
}

const coverage = (e) => (Number.isFinite(e?.sitelinks) ? e.sitelinks : -1);

/** Events (already restricted to the range) in browse order; stable. */
export function orderBrowseList(events, rangeStart, sort = "date") {
  const starting = [];
  const ongoing = [];
  for (const e of rankEvents(events, "")) (startedBefore(e, rangeStart) ? ongoing : starting).push(e);
  if (sort === "coverage") {
    // Array.prototype.sort is stable, so equal counts stay chronological.
    const byCoverage = (a, b) => coverage(b) - coverage(a);
    starting.sort(byCoverage);
    ongoing.sort(byCoverage);
  }
  return starting.concat(ongoing);
}
