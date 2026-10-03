// Pure helpers for the map's stacked-event list, hover label and "show results"
// fit. Kept free of MapLibre/React so they can be unit-tested with node --test.

// Biggest cluster whose events we list instead of zooming. Bigger clusters that
// still can't be split (rare) list their first LIST_MAX events with a note.
export const LIST_MAX = 60;

// "1956" or "1956–1957" from an event's ISO-ish date_start/date_end.
export function eventYearLabel(e) {
  const s = Number(String(e?.date_start ?? "").slice(0, 4));
  if (!Number.isFinite(s) || s === 0) return "";
  const en = e.date_end ? Number(String(e.date_end).slice(0, 4)) : s;
  return Number.isFinite(en) && en !== s ? `${s}–${en}` : String(s);
}

const coordKey = (f) => {
  const c = f?.geometry?.coordinates;
  return c ? `${c[0]},${c[1]}` : "";
};

// True when every feature sits on exactly the same point (capital-pinned
// "approximate" events share coordinates, so no zoom level ever separates them).
export function allSameCoordinates(features) {
  if (!features?.length) return false;
  const k = coordKey(features[0]);
  return features.every((f) => coordKey(f) === k);
}

// What a click on a cluster should do. Zoom while zooming can still split the
// cluster; list its events once it can't: all leaves on one point, or the split
// would only happen past clusterMaxZoom (where points stop clustering and
// identical ones render as a single dot).
export function clusterClickAction({ count, expansionZoom, clusterMaxZoom, leaves = null }) {
  if (leaves && allSameCoordinates(leaves)) return "list";
  if (Number.isFinite(expansionZoom) && expansionZoom > clusterMaxZoom && count <= LIST_MAX) return "list";
  return "zoom";
}

// Distinct events (by id) among features hit at one point, in a stable order:
// search matches first, then by year, then title.
export function stackItems(features) {
  const seen = new Map();
  for (const f of features ?? []) {
    const p = f?.properties;
    if (!p || p.id == null || seen.has(p.id)) continue;
    seen.set(p.id, {
      id: p.id,
      title: p.title ?? p.id,
      year: p.y ?? "",
      category: p.category,
      approx: p.a === 1,
      match: p.m !== 0,
    });
  }
  return [...seen.values()].sort(
    (a, b) =>
      Number(b.match) - Number(a.match) ||
      (parseInt(a.year, 10) || 0) - (parseInt(b.year, 10) || 0) ||
      String(a.title).localeCompare(String(b.title))
  );
}

// Hover label text for a dot or cluster feature (properties as in eventsToGeoJSON
// plus MapLibre's point_count). `stacked` = how many dots share the hovered spot.
export function hoverLabel(props, { stacked = 1, listable = false } = {}) {
  if (!props) return "";
  if (props.point_count) {
    return `${props.point_count} events — click to ${listable ? "list them" : "zoom in"}`;
  }
  const base = props.y ? `${props.title} (${props.y})` : String(props.title ?? "");
  return stacked > 1 ? `${base} + ${stacked - 1} more here — click to list` : base;
}

// [west, south, east, north] around the events whose id is in `ids` (all events
// when ids is null); events without coordinates are ignored. null if none.
export function eventsBounds(events, ids = null) {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  let count = 0;
  for (const ev of events ?? []) {
    if (ids && !ids.has(ev.id)) continue;
    const c = ev.coordinates;
    if (!c || !Number.isFinite(c.lon) || !Number.isFinite(c.lat)) continue;
    w = Math.min(w, c.lon);
    e = Math.max(e, c.lon);
    s = Math.min(s, c.lat);
    n = Math.max(n, c.lat);
    count++;
  }
  return count ? { bbox: [w, s, e, n], count } : null;
}
