// "What was this place?": which border shapes of the map contain one point, in
// every year of the timeline, collapsed into periods. Pure, so node --test can
// run it against data/boundaries.json; components/PlaceHistory.jsx shows it.
//
// The shapes and their words are the map's own: the same features the map draws
// for a year (boundariesForYear over listedBoundaries: every real feature active
// that year, never a placeholder outline), at full precision (the geometry is
// tested as stored, never simplified), with the name, status, note and source
// the border popup shows (components/mapBorders.js uniqueBoundaries), sorted by
// name as the popup sorts them. Where shapes overlap (a "...-included" state and
// the flagged area drawn on top of it) the shape on top is the entry and the
// one under it goes with it (`under`), as a click there shows them
// (mapBorders.js foldIncluded). Nothing here writes new wording about a place.

import { foldIncluded, uniqueBoundaries } from "../components/mapBorders.js";
import { bearingDeg, haversineKm } from "./geo.js";

// Even-odd ray casting over one linear ring ([lon, lat] positions, closed or
// not). A point exactly on an edge may fall either side, as on the map.
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// A polygon is its outer ring minus its holes.
function inPolygon(lon, lat, rings) {
  if (!rings?.length || !inRing(lon, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(lon, lat, rings[k])) return false;
  return true;
}

/** Whether a GeoJSON Polygon or MultiPolygon contains [lon, lat]. */
export function geometryContains(geometry, lon, lat) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return inPolygon(lon, lat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((p) => inPolygon(lon, lat, p));
  return false;
}

// [west, south, east, north] of a geometry's positions.
export function geometryBbox(geometry) {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const polys = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  for (const poly of polys) {
    for (const [x, y] of poly[0] ?? []) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  return [w, s, e, n];
}

const inBox = (box, lon, lat) => Boolean(box) && lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3];

const isPlaceholder = (f) => Array.isArray(f.properties?.placeholder_for);
const isPending = (f) => f.geometry == null && Boolean(f.geometry_ref);

/**
 * geometry_refs of the pending (deferred, lib/deferredBoundaries.js) features
 * whose bbox holds the point: the geometries needed before historyAt can
 * answer for it. Every other pending feature cannot contain it.
 */
export function pendingRefsAt(features, lon, lat) {
  const refs = new Set();
  for (const f of features) {
    if (isPending(f) && !isPlaceholder(f) && inBox(f.bbox ?? [-180, -90, 180, 90], lon, lat)) refs.add(f.geometry_ref);
  }
  return [...refs];
}

/**
 * The real features (no placeholder) whose geometry contains [lon, lat], with
 * a bbox test first. A pending feature counts as not containing the point:
 * load it first (pendingRefsAt).
 */
export function featuresAt(features, lon, lat) {
  return features.filter((f) => {
    if (isPlaceholder(f) || !f.geometry) return false;
    const box = f.bbox && f.bbox.length === 4 ? f.bbox : geometryBbox(f.geometry);
    return inBox(box, lon, lat) && geometryContains(f.geometry, lon, lat);
  });
}

// What makes two years' shapes the same period: the same names and statuses.
// Within a period a shape can change record (CShapes redraws a state, a note
// or source changes, as for Kuwait in 1970): each record keeps its own years,
// note and source (`records`), so no word of any of them is lost.
const itemKey = (b) => `${b.name}\u0001${b.status ?? ""}`;
const recordKey = (b) => `${b.note ?? ""}\u0001${b.source ?? ""}`;

// The "...-included" shapes an item is drawn over in `year` (b.under, from
// foldIncluded), kept on the item as `under`: [{name, status, start, end, note,
// source}], one per run of years with the same shape, note and source.
function addUnder(item, b, year) {
  for (const u of b.under ?? []) {
    item.under ??= [];
    const k = `${itemKey(u)}\u0002${recordKey(u)}`;
    const same = (r) => `${itemKey(r)}\u0002${recordKey(r)}` === k;
    const run = item.under.find((r) => r.end === year - 1 && same(r));
    if (run) run.end = year;
    else if (!item.under.some((r) => r.end === year && same(r)))
      item.under.push({ name: u.name, status: u.status, start: year, end: year, note: u.note, source: u.source });
  }
}

/**
 * `features`: boundary features (as boundaries.json or a decoded chunk has them;
 * several copies of one feature are fine). Returns, for minYear..maxYear, the
 * periods in order: [{start, end, items}], where `items` are the shapes
 * containing the point in each of those years, sorted by name as the border
 * popup lists them: [{name, status, records: [{start, end, note, source}]}],
 * one record per run of years with the same note and source (years clipped to
 * the timeline). An empty `items` means no shape covers the point (blank on
 * the map). Consecutive years whose shapes have the same names and statuses
 * are one period.
 */
export function historyAt(features, lon, lat, { minYear, maxYear }) {
  const hits = featuresAt(features, lon, lat);
  const periods = [];
  let last = null;
  for (let year = minYear; year <= maxYear; year++) {
    const active = hits.filter((f) => f.properties.start_year <= year && year <= f.properties.end_year);
    // uniqueBoundaries (the popup's own list): one entry per name and years, by name.
    const seen = new Set();
    // foldIncluded, as the popup: a shape drawn over an "...-included" one is
    // the entry, the one under it goes with it (`under`).
    const shown = foldIncluded(
      uniqueBoundaries(active).filter((b) => {
        const k = `${itemKey(b)}\u0002${recordKey(b)}`;
        return !seen.has(k) && seen.add(k);
      })
    );
    const key = shown.map(itemKey).join("\u0003");
    if (last && last.key === key) {
      last.period.end = year;
      for (const b of shown) {
        const item = last.period.items.find((i) => itemKey(i) === itemKey(b));
        const rec = item.records.find((r) => r.end === year - 1 && recordKey(r) === recordKey(b));
        if (rec) rec.end = year;
        else item.records.push({ start: year, end: year, note: b.note, source: b.source });
        addUnder(item, b, year);
      }
      continue;
    }
    const items = [];
    for (const b of shown) {
      const record = { start: year, end: year, note: b.note, source: b.source };
      let item = items.find((i) => itemKey(i) === itemKey(b));
      // One name and status from two records in one year: both records are kept.
      if (item) item.records.push(record);
      else items.push((item = { name: b.name, status: b.status, records: [record] }));
      addUnder(item, b, year);
    }
    const period = { start: year, end: year, items };
    periods.push(period);
    last = { key, period };
  }
  return periods;
}

/** The period of `periods` that holds `year`, or null. */
export function periodOf(periods, year) {
  return periods.find((p) => p.start <= year && year <= p.end) ?? null;
}

/** "1900–1918", "1990" or, for a period reaching the last year, "1992–present". */
export function periodLabel(period, maxYear) {
  if (period.end >= maxYear) return period.start >= maxYear ? `${period.start}` : `${period.start}–present`;
  return period.start === period.end ? `${period.start}` : `${period.start}–${period.end}`;
}

// ---- events near the point (the event panel's Nearby rule, lib/related.js) ----

const precise = (e) =>
  e.location_quality === "precise" && Number.isFinite(e.coordinates?.lon) && Number.isFinite(e.coordinates?.lat);

/**
 * Events with a precise location within `km` of [lon, lat], closest first (equal
 * distances by id): [{id, title, date_start, km (to 0.1), bearing (whole
 * degrees from the point)}]. The same rule as the event panel's Nearby
 * (NEARBY_KM, precise locations only, distance only: never importance).
 */
export function eventsNear(events, lon, lat, km) {
  const out = [];
  for (const e of events) {
    if (!precise(e) || Math.abs(e.coordinates.lat - lat) * 111 > km + 1) continue;
    const d = haversineKm(lon, lat, e.coordinates.lon, e.coordinates.lat);
    if (d > km) continue;
    out.push({
      id: e.id,
      title: e.title,
      date_start: e.date_start ?? null,
      d,
      km: Math.round(d * 10) / 10,
      bearing: Math.round(bearingDeg(lon, lat, e.coordinates.lon, e.coordinates.lat)) % 360,
    });
  }
  out.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out.map(({ d: _d, ...rest }) => rest);
}
