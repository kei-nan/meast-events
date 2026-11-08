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
import { rawEventYears, yearsReversed } from "./eventYears.js";

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

/** @typedef {import("./eventTypes.js").Event} Event */

/**
 * The event's start year; NaN without one (lib/eventYears.js rawEventYears).
 * @param {Event} event
 * @returns {number}
 */
export function eventStartYear(event) {
  return rawEventYears(event)[0];
}

/**
 * True when the event began before `rangeStart` (so it is ongoing in the range).
 * A reversed record (end before start, flagged date_order_invalid) in the range
 * is never "ongoing": it matches the selected years only at a year one of its
 * dates names (lib/eventYears.js eventOverlapsRange), never the years between,
 * and its start is the later of the two, so the start year is not before them.
 * @param {Event} event
 * @param {number} rangeStart
 * @returns {boolean}
 */
export function startedBefore(event, rangeStart) {
  const y = eventStartYear(event);
  return Number.isFinite(y) && y < rangeStart;
}

/**
 * True when the event is listed at its END date within the selected years
 * `range` ([first, last]): a reversed record (end before start, flagged
 * date_order_invalid) whose start year is outside them and whose end year is in
 * them. It matches them by its end year alone (eventOverlapsRange), and its
 * Timeline bar is drawn there (lib/timelineView.js barGeometry), so it is placed
 * there too, e.g. arab-cold-war (start 1979-02-11, end 1970) in 1970-1971: at
 * 1970, not 1979. The dates stay as given.
 */
export function listedAtEnd(event, range) {
  if (!Array.isArray(range) || !event?.date_end || !yearsReversed(event)) return false;
  const [s, en] = rawEventYears(event);
  const inR = (y) => y >= range[0] && y <= range[1];
  return !inR(s) && inR(en);
}

/** The year the event is listed at in `range` (listedAtEnd): its end year or, as usual, its start year. */
export function listedYear(event, range) {
  return listedAtEnd(event, range) ? rawEventYears(event)[1] : eventStartYear(event);
}

/** The date string the event is ordered by in `range` (listedAtEnd); "" without one. */
export function listedDate(event, range) {
  const d = listedAtEnd(event, range) ? event.date_end : event?.date_start;
  return typeof d === "string" ? d : "";
}

const hasCount = (e) => Number.isFinite(e?.sitelinks);

/**
 * Events (already restricted to the range) in browse order; stable. `range`:
 * the selected years [first, last], or the first year alone (then every event
 * is ordered by its start date).
 * @param {Event[]} events
 * @param {[number, number]|number} range
 * @param {string} [sort]  one of SORTS
 * @returns {Event[]}
 */
export function orderBrowseList(events, range, sort = "date") {
  const { key, dir } = parseSort(sort);
  const rangeStart = Array.isArray(range) ? range[0] : range;
  let ranked = rankEvents(events, "");
  if (ranked.some((e) => listedAtEnd(e, range))) {
    // Chronological by the listed date (rankEvents' order: undated first).
    ranked = ranked
      .map((e, i) => ({ e, i, k: listedDate(e, range) }))
      .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i))
      .map((x) => x.e);
  }
  const starting = [];
  const ongoing = [];
  for (const e of ranked) (startedBefore(e, rangeStart) ? ongoing : starting).push(e);
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
