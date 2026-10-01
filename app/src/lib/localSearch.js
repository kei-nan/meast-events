// Everything the app answers from the in-memory event store, with no API call:
// title/snippet text matching, category/country filters, drawn-area queries
// (bbox + circle trim, precise-only rule) and the "events on the map in the
// current view" count. Pure. The API is only needed for free-text search over
// full lead text (q) - see hooks/useEventSearch.js.

import { eventCoords, inArea, inBbox } from "./geo.js";
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

// Turns an API answer into the events to list. The API only decides WHICH events
// match: each record is taken from the static store, the site's source of truth.
// The search index lags behind a data change until `npm run load-redis` is run,
// so its own copies could carry stale dates or text, or be events that were
// since removed (those are dropped). With a drawn area, coordinate-less and
// approximate events are excluded, as in localSearch. Unranked.
export function apiMatchesFromStore(apiEvents, store, area = null) {
  const out = [];
  for (const { id } of apiEvents) {
    const e = store.get(id);
    if (!e) continue;
    if (area) {
      const c = eventCoords(e);
      if (!c || e.location_quality === "approximate" || !inArea(c, area)) continue;
    }
    out.push(e);
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
