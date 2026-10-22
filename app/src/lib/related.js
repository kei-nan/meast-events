// Related events for the detail view and the event pages: other events in this
// dataset that share a Wikidata "part of" parent with an event, that happened near
// it, or that started around the same time. Chosen by mechanical rules only
// (a shared QID, a distance, a date), closest first, never by importance or
// coverage, so no event is promoted over another for what it is about.
//
// Used at build time by scripts/split-data.mjs (the result rides in the full-lead
// buckets, like part_of / includes) and so by the event pages.

import { bearingDeg, haversineKm } from "./geo.js";

const QID = /^Q[1-9]\d*$/;

// Events listed per group.
export const RELATED_SHOWN = 5;
// "Nearby": both events have a precise location, at most this far apart.
export const NEARBY_KM = 50;
// "Around the same time": both start dates are exact to the day, at most this many
// days apart. Month, year or unknown precision, or a flagged date, is left out:
// ranking those by days would claim a precision the data does not have.
export const SAME_TIME_DAYS = 183;

const DATE = /^(-?\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/;

// Days since 1970 for a "YYYY", "YYYY-MM" or "YYYY-MM-DD" start, or null.
export function dayNumber(date) {
  const m = DATE.exec(typeof date === "string" ? date : "");
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, m[3] ? Number(m[3]) : 1);
  return Number.isFinite(t) ? Math.round(t / 86400000) : null;
}

const exactDay = (e) =>
  e.date_precision === "day" && !(e.date_flags?.length > 0) && /^-?\d{4}-\d{2}-\d{2}/.test(e.date_start ?? "");

const precise = (e) =>
  e.location_quality === "precise" && Number.isFinite(e.coordinates?.lon) && Number.isFinite(e.coordinates?.lat);

function parentQids(e) {
  const out = new Set();
  for (const p of Array.isArray(e.part_of) ? e.part_of : []) {
    if (p && typeof p.qid === "string" && QID.test(p.qid) && p.qid !== e.wikidata_qid) out.add(p.qid);
  }
  return out;
}

// Closest first; equal distance falls back to the id, so the order is stable.
const byDistance = (a, b) => a.d - b.d || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0);

const item = (e) => ({ id: e.id, title: e.title, date_start: e.date_start ?? null });

/**
 * `events`: [{id, title, date_start, date_precision?, date_flags?, location_quality,
 * coordinates, wikidata_qid?, part_of?}]. `partOf`: resolvePartOf(events) (lib/partOf.js),
 * whose curated parents and children are already shown, so they are left out here.
 * Returns Map<event id, {shared_parent?, nearby?, same_time?}>, each a list of at most
 * RELATED_SHOWN {id, title, date_start}, closest first (nearby also has `km`, to 0.1 km,
 * and `bearing`, whole degrees clockwise from north, from this event to that one):
 *   shared_parent  share a Wikidata "part of" QID with the event; closest in time
 *                  (undated events last);
 *   nearby         both precise, within NEARBY_KM;
 *   same_time      both exact to the day, within SAME_TIME_DAYS.
 * An event is listed at most once per event, in the first group it fits, and never
 * for itself. Events with no related event are absent; empty groups are left out.
 */
const PRECISION_WORDS = { month: "month", year: "year", decade: "decade", century: "century" };

/**
 * Why `event` has no events in group `key` ("shared_parent", "nearby",
 * "same_time"), in plain words, from the same rules resolveRelated applies.
 * `event` needs location_quality, part_of, date_precision and date_flags.
 */
export function emptyReason(key, event) {
  if (key === "shared_parent") {
    return event.part_of?.length
      ? "No other event in this dataset shares a Wikidata “part of” with this one."
      : "Wikidata does not list this event as part of a wider one.";
  }
  if (key === "nearby") {
    if (event.location_quality === "none") return "This event has no map location (Wikipedia and Wikidata give no coordinates), so nothing can be measured from it.";
    if (!precise(event)) {
      return "This event’s marker is only an approximate place (a national capital), so distances from it would be misleading.";
    }
    return `No other event with a precise location is within ${NEARBY_KM} km.`;
  }
  if (event.date_flags?.length) return "This event’s date could not be checked against its Wikipedia text, so it is not compared day by day.";
  const word = PRECISION_WORDS[event.date_precision];
  if (word) return `This event’s date is known only to the ${word}, so it is not compared day by day.`;
  if (!exactDay(event)) return "The exact day of this event is not recorded, so it is not compared day by day.";
  return "No other event with an exact date is within six months.";
}

export function resolveRelated(events, partOf = new Map()) {
  const list = events.filter((e) => e && typeof e.id === "string");
  const day = new Map(list.map((e) => [e.id, dayNumber(e.date_start)]));
  const byParent = new Map();
  const parents = new Map();
  for (const e of list) {
    const qids = parentQids(e);
    parents.set(e.id, qids);
    for (const q of qids) {
      if (!byParent.has(q)) byParent.set(q, []);
      byParent.get(q).push(e);
    }
  }
  const placed = list.filter(precise);
  const dated = list.filter(exactDay);

  const out = new Map();
  for (const e of list) {
    const rel = partOf.get(e.id);
    const taken = new Set([e.id, ...(rel?.part_of ?? []).map((p) => p.id).filter(Boolean), ...(rel?.includes ?? []).map((c) => c.id)]);
    const pick = (candidates) => {
      const chosen = candidates.sort(byDistance).filter(({ e: o }) => !taken.has(o.id)).slice(0, RELATED_SHOWN);
      for (const { e: o } of chosen) taken.add(o.id);
      return chosen;
    };
    const groups = {};

    const own = day.get(e.id);
    const siblings = new Map();
    for (const q of parents.get(e.id)) {
      for (const o of byParent.get(q)) {
        if (o.id === e.id || siblings.has(o.id)) continue;
        const od = day.get(o.id);
        siblings.set(o.id, { e: o, d: own != null && od != null ? Math.abs(od - own) : Infinity });
      }
    }
    const shared = pick([...siblings.values()]);
    if (shared.length) groups.shared_parent = shared.map(({ e: o }) => item(o));

    if (precise(e)) {
      const { lon, lat } = e.coordinates;
      const near = [];
      for (const o of placed) {
        // One degree of latitude is ~111 km: skip the far ones before the haversine.
        if (o.id === e.id || Math.abs(o.coordinates.lat - lat) * 111 > NEARBY_KM + 1) continue;
        const km = haversineKm(lon, lat, o.coordinates.lon, o.coordinates.lat);
        if (km <= NEARBY_KM) near.push({ e: o, d: km, b: bearingDeg(lon, lat, o.coordinates.lon, o.coordinates.lat) });
      }
      const chosen = pick(near);
      if (chosen.length) {
        groups.nearby = chosen.map(({ e: o, d, b }) => ({ ...item(o), km: Math.round(d * 10) / 10, bearing: Math.round(b) % 360 }));
      }
    }

    if (exactDay(e) && own != null) {
      const close = [];
      for (const o of dated) {
        if (o.id === e.id) continue;
        const d = Math.abs(day.get(o.id) - own);
        if (d <= SAME_TIME_DAYS) close.push({ e: o, d });
      }
      const chosen = pick(close);
      if (chosen.length) groups.same_time = chosen.map(({ e: o }) => item(o));
    }

    if (Object.keys(groups).length) out.set(e.id, groups);
  }
  return out;
}
