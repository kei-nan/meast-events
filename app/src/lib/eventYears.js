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
 * The span of years an event covers, earliest first. A few records have an end
 * date before their start date (as Wikidata gives them; the data is shown
 * unchanged), so the span is the lower to the higher of the two years: those
 * events still appear in every year they name instead of in none.
 */
export function eventYearRange(e) {
  const [s, en] = rawEventYears(e);
  return s <= en ? [s, en] : [en, s];
}

/** True when the event's span shares at least one year with [startYear, endYear]. */
export function eventOverlapsRange(e, startYear, endYear) {
  const [s, en] = eventYearRange(e);
  return s <= endYear && en >= startYear;
}
