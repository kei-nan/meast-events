// Event years and border decades. Pure; shared by the app (dataClient, App,
// the results list) and the build (scripts/split-data.mjs).

export const DECADE_SIZE = 10;

/** The first year of the decade `year` falls in (the boundary chunk it lives in). */
export function decadeFloor(year) {
  return Math.floor(year / DECADE_SIZE) * DECADE_SIZE;
}

/**
 * The years an event's dates name, in the order the source gives them:
 * [start, end], with end = start when there is no end date. For labels.
 */
export function rawEventYears(e) {
  const s = Number(String(e?.date_start ?? "").slice(0, 4));
  const en = e?.date_end ? Number(String(e.date_end).slice(0, 4)) : s;
  return [s, Number.isFinite(en) ? en : s];
}

/**
 * True when the end year comes before the start year. A few records have their
 * dates in that order as Wikidata gives them (shown unchanged; the data flags
 * each one, date_order_invalid, and the validator fails an unflagged one), e.g.
 * iraqi-invasion-of-kuwait: start 2009-08-02, end 1990-08-04.
 */
export function yearsReversed(e) {
  const [s, en] = rawEventYears(e);
  return en < s;
}

/**
 * The lowest and highest year an event's dates name, earliest first. For a
 * reversed record that is its two years in order, NOT a span it covers: the
 * years between them are named by neither date (see eventOverlapsRange).
 */
export function eventYearRange(e) {
  const [s, en] = rawEventYears(e);
  return s <= en ? [s, en] : [en, s];
}

/**
 * True when the event shares at least one year with [startYear, endYear]. A
 * reversed record matches only the two years its dates name (Kuwait: 1990 and
 * 2009), never the years between them, which neither source gives for it.
 */
export function eventOverlapsRange(e, startYear, endYear) {
  const { s, en } = parsedYears(e);
  if (en < s) return (s >= startYear && s <= endYear) || (en >= startYear && en <= endYear);
  return s <= endYear && en >= startYear;
}

// rawEventYears per event object, kept with the date strings it was parsed
// from (a changed date is parsed again): every timeline step checks every event.
const yearCache = new WeakMap(); // event -> { ds, de, s, en }
function parsedYears(e) {
  if (e === null || typeof e !== "object") {
    const [s, en] = rawEventYears(e);
    return { s, en };
  }
  const hit = yearCache.get(e);
  if (hit && hit.ds === e.date_start && hit.de === e.date_end) return hit;
  const [s, en] = rawEventYears(e);
  const entry = { ds: e.date_start, de: e.date_end, s, en };
  yearCache.set(e, entry);
  return entry;
}
