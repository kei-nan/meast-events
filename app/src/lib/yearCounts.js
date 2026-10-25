// Per-year event counts for the timeline density chart. Pure.

import { eventStartYear } from "./browseOrder.js";

/**
 * {year: count} of events by START year (date_start), as the rest of the app
 * places an event (the browse list's "starting in" part, the map's border
 * year). Not eventYearRange's lower year: for a reversed record such as
 * iraqi-invasion-of-kuwait (start 2009, end 1990) that would be its end year.
 * Events without a start date are not counted.
 */
export function countEventsByStartYear(events) {
  const counts = {};
  for (const e of events) {
    const y = eventStartYear(e);
    if (!Number.isFinite(y)) continue;
    counts[y] = (counts[y] ?? 0) + 1;
  }
  return counts;
}
