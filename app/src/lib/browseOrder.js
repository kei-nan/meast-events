// Order of the idle browse list (no query, filters or area). Pure.
//
// Events that START within the selected years come first; then events still
// ongoing from earlier. Without this a single year (e.g. 1948) would open with
// every multi-decade conflict that merely overlaps it. Within each part, by one
// of four sorts (a key and a direction):
//   "coverage" (the app's default): most Wikidata sitelinks first - the same
//     mechanical signal as the inclusion rule (docs/DATA_POLICY.md, "Default
//     order"); "coverage-asc": fewest first. Equal counts stay chronological;
//     events without a count come last either way.
//   "date": oldest first; "date-desc": newest first.

import { rankEvents } from "./ranking.js";

export const SORTS = ["coverage", "coverage-asc", "date", "date-desc"];
const DEFAULT_DIR = { coverage: "desc", date: "asc" };

/** "coverage-asc" -> {key: "coverage", dir: "asc"}; unknown values give the default sort. */
export function parseSort(sort) {
  const [key, dir] = SORTS.includes(sort) ? sort.split("-") : ["coverage"];
  return { key, dir: dir ?? DEFAULT_DIR[key] };
}

/** The sort value for a key and direction (the key alone when it is that key's usual direction). */
export function sortValue(key, dir) {
  return dir === DEFAULT_DIR[key] ? key : `${key}-${dir}`;
}

export function eventStartYear(event) {
  const y = String(event?.date_start ?? "").slice(0, 4);
  return y ? Number(y) : NaN;
}

/** True when the event began before `rangeStart` (so it is ongoing in the range). */
export function startedBefore(event, rangeStart) {
  const y = eventStartYear(event);
  return Number.isFinite(y) && y < rangeStart;
}

const hasCount = (e) => Number.isFinite(e?.sitelinks);

/** Events (already restricted to the range) in browse order; stable. */
export function orderBrowseList(events, rangeStart, sort = "date") {
  const { key, dir } = parseSort(sort);
  const starting = [];
  const ongoing = [];
  for (const e of rankEvents(events, "")) (startedBefore(e, rangeStart) ? ongoing : starting).push(e);
  if (key === "coverage") {
    // Array.prototype.sort is stable, so equal counts stay chronological.
    const sign = dir === "asc" ? 1 : -1;
    const byCoverage = (a, b) =>
      hasCount(a) && hasCount(b) ? sign * (a.sitelinks - b.sitelinks) : Number(hasCount(b)) - Number(hasCount(a));
    starting.sort(byCoverage);
    ongoing.sort(byCoverage);
  } else if (dir === "desc") {
    starting.reverse();
    ongoing.reverse();
  }
  return starting.concat(ongoing);
}
