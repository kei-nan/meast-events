// Everything the app answers from the in-memory event store, with no API call:
// title/snippet text matching, category/country filters, drawn-area queries
// (bbox + circle trim, precise-only rule) and the "events on the map in the
// current view" count. Pure. Only free-text search over full lead text (q)
// needs more: a static index, see hooks/useEventSearch.js.

import { eventCoords, inBbox } from "./geo.js";
import { matchesFilters, rankEvents } from "./ranking.js";

// Lite view for matching: the list shows title + snippet, so local matching must
// use exactly those (an event whose full lead happens to be loaded because it
// was opened must not match differently from one that was not).
const liteView = (e) => (e.extract === undefined ? e : { ...e, extract: undefined });

// Filter + rank. Area rule: coordinate-less and approximate (capital-pin)
// events are excluded (matchesFilters); circle areas are trimmed by distance.
export function localSearch(events, { q = "", area = null, categories = [], countries = [] } = {}) {
  const filters = { q, area, categories, countries };
  const hits = [];
  for (const e of events) if (matchesFilters(liteView(e), filters)) hits.push(e);
  return rankEvents(hits, q);
}

// Turns the full-text index's answer (event ids, most relevant first) into the
// events to list. Records come from the static store, the site's source of
// truth (an id no longer in it is dropped); category/country filters and the
// drawn-area rule (coordinate-less and approximate events excluded) apply as in
// localSearch. Unranked: index order.
export function textMatchesFromStore(ids, store, { area = null, categories = [], countries = [] } = {}) {
  const out = [];
  for (const id of ids) {
    const e = store.get(id);
    if (e && matchesFilters(e, { area, categories, countries })) out.push(e);
  }
  return out;
}

// Events that would be drawn in a map view: those with coordinates inside bbox.
export function countInBbox(events, bbox) {
  if (!bbox) return null;
  let n = 0;
  for (const e of events) {
    const c = eventCoords(e);
    if (c && inBbox(c, bbox)) n++;
  }
  return n;
}
