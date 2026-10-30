// Event years and border decades. Pure; shared by the app (dataClient, App,
// the results list) and the build (scripts/split-data.mjs).
//
// Ongoing events (docs/DATA_POLICY.md, "Ongoing events"): an event with no end
// date counts in its start year only, UNLESS a source says it is still going on:
//  - its Wikipedia article title says "present" ("Yemeni civil war (2014–present)"), or
//  - Wikidata gives its end time (P582) as "no value" or "unknown value"
//    (stored by the pipeline as date_end_open, scripts/lib/wd-entities.js).
// Such an event counts in every year from its start to the timeline's last year
// (MAX_YEAR: the current year, lib/years.js). The rule is mechanical and the
// same for every event; its dates and title are shown as the sources give them.

import { MAX_YEAR } from "./years.js";

export { DECADE_SIZE, decadeFloor } from "./years.js";

// "–present" / "- present" / "—present" in a title, as Wikipedia names a period still going on.
const PRESENT_IN_TITLE = /[–—-]\s*present\b/i;
const WIKIDATA_OPEN = new Set(["wikidata_novalue", "wikidata_somevalue"]);

/**
 * Why an event counts as ongoing, or null: "title" (its Wikipedia title says
 * "present"), "wikidata_novalue" / "wikidata_somevalue" (its Wikidata end time
 * is "no value" / "unknown value"). Only an event with a start and no end date.
 */
export function ongoingSignal(e) {
  if (!e || e.date_end || !e.date_start) return null;
  if (PRESENT_IN_TITLE.test(String(e.title ?? ""))) return "title";
  if (WIKIDATA_OPEN.has(e.date_end_open)) return e.date_end_open;
  return null;
}

/** Where the "ongoing" reading comes from, as a sentence (null when the event is not read as ongoing). */
export function ongoingNote(e) {
  const signal = ongoingSignal(e);
  if (!signal) return null;
  const why =
    signal === "title"
      ? "its Wikipedia article title says “present”"
      : `Wikidata gives its end time as “${signal === "wikidata_novalue" ? "no value" : "unknown value"}”`;
  return `No end date; shown as ongoing because ${why}. It counts in every year from its start to the current year.`;
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
 * The years an event counts in, [start, end]: rawEventYears, except that an
 * ongoing event (ongoingSignal) runs to `through` (default: the timeline's last
 * year, the current year), or its start year if that is later.
 */
export function eventSpanYears(e, through = MAX_YEAR) {
  const [s, en] = rawEventYears(e);
  return ongoingSignal(e) && Number.isFinite(s) ? [s, Math.max(s, through)] : [s, en];
}

/** "1956", "1956–1957" or, for an ongoing event, "2014–ongoing". "" without a start year. */
export function eventYearsText(e) {
  const [s, en] = rawEventYears(e);
  if (!Number.isFinite(s) || s === 0) return "";
  if (ongoingSignal(e)) return `${s}–ongoing`;
  return en !== s ? `${s}–${en}` : `${s}`;
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
 * The lowest and highest year an event counts in, earliest first. For a
 * reversed record that is its two years in order, NOT a span it covers: the
 * years between them are named by neither date (see eventOverlapsRange).
 */
export function eventYearRange(e) {
  const [s, en] = eventSpanYears(e);
  return s <= en ? [s, en] : [en, s];
}

/**
 * True when the event shares at least one year with [startYear, endYear]. A
 * reversed record matches only the two years its dates name (Kuwait: 1990 and
 * 2009), never the years between them, which neither source gives for it. An
 * ongoing event matches every year from its start to the current year.
 */
export function eventOverlapsRange(e, startYear, endYear) {
  const { s, en } = parsedYears(e);
  if (en < s) return (s >= startYear && s <= endYear) || (en >= startYear && en <= endYear);
  return s <= endYear && en >= startYear;
}

// eventSpanYears per event object, kept with the fields it was worked out from
// (a changed one is parsed again): every timeline step checks every event.
const yearCache = new WeakMap(); // event -> { ds, de, t, o, s, en }
function parsedYears(e) {
  if (e === null || typeof e !== "object") {
    const [s, en] = rawEventYears(e);
    return { s, en };
  }
  const hit = yearCache.get(e);
  if (hit && hit.ds === e.date_start && hit.de === e.date_end && hit.t === e.title && hit.o === e.date_end_open) return hit;
  const [s, en] = eventSpanYears(e);
  const entry = { ds: e.date_start, de: e.date_end, t: e.title, o: e.date_end_open, s, en };
  yearCache.set(e, entry);
  return entry;
}
