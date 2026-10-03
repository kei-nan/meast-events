// Order of the idle browse list (no query, filters or area). Pure.
//
// Events that START within the selected years come first, chronologically;
// then events still ongoing from earlier, also chronologically. Without this a
// single year (e.g. 1948) would open with every multi-decade conflict that
// merely overlaps it. No notability ranking: only dates decide the order.

import { rankEvents } from "./ranking.js";

export function eventStartYear(event) {
  const y = String(event?.date_start ?? "").slice(0, 4);
  return y ? Number(y) : NaN;
}

/** True when the event began before `rangeStart` (so it is ongoing in the range). */
export function startedBefore(event, rangeStart) {
  const y = eventStartYear(event);
  return Number.isFinite(y) && y < rangeStart;
}

/** Events (already restricted to the range) in browse order; stable. */
export function orderBrowseList(events, rangeStart) {
  const starting = [];
  const ongoing = [];
  for (const e of rankEvents(events, "")) (startedBefore(e, rangeStart) ? ongoing : starting).push(e);
  return starting.concat(ongoing);
}
