// Formats an event's Wikidata dates ("YYYY-MM-DD" strings) for the detail view, showing
// no more precision than the data records. `precision` is Wikidata's precision of the
// start date ("day", "month", "year", "decade", or missing): a day shows as
// "5 June 1967", a month as "June 1967", anything else as the year only. `endPrecision`
// is the end date's (Wikidata's precision of the P582 statement behind date_end,
// lib/fixes.js keptEndPrecision): with it the end shows to that precision,
// "20 March 2003 – 18 December 2011", saying a shared year once ("29 October –
// 7 November 1956") and a shared month too ("5–10 June 1967"). Without it (not
// recorded), or after a year-only start, the end is a year only: "20 March 2003 – 2011",
// or "5 June 1967 (ended 1967)" when it ends in the start's year. `yearOnly` (set when
// the dates are flagged as unverified) shows just the years, in the order given.
// `ongoing` (lib/eventYears.js ongoingSignal: no end date, and a source says the event
// is still going on) shows "15 March 2011 – ongoing (per source)"
// ("2014–ongoing (per source)" for a year); the event panel's note says which source.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatStart(date, precision) {
  const [year, month, day] = date.split("-");
  const m = MONTHS[Number(month) - 1];
  if (precision === "day" && m && Number(day)) return `${Number(day)} ${m} ${year}`;
  if ((precision === "day" || precision === "month") && m) return `${m} ${year}`;
  return year;
}

export const ONGOING_TEXT = "ongoing (per source)";

export function formatEventDate(start, end, { precision = null, endPrecision = null, yearOnly = false, ongoing = false } = {}) {
  if (!start) return "";
  const startYear = start.slice(0, 4);
  const endYear = end && end !== start ? end.slice(0, 4) : null;
  // An end before the start is shown as given, but only as years.
  const startText = yearOnly || (end && end < start) ? startYear : formatStart(start, precision);
  if (!end && ongoing) return startText === startYear ? `${startYear}–${ONGOING_TEXT}` : `${startText} – ${ONGOING_TEXT}`;
  if (!endYear) return startText;
  if (startText === startYear) return endYear === startYear ? startYear : `${startYear}–${endYear}`;
  const endText = formatStart(end, endPrecision);
  if (endText === endYear) return endYear === startYear ? `${startText} (ended ${endYear})` : `${startText} – ${endYear}`;
  if (endText === startText) return startText;
  if (endYear !== startYear) return `${startText} – ${endText}`;
  // One year: it is said once, at the end; one month too, between two days.
  const startPart = startText.slice(0, -(startYear.length + 1));
  const [d1, m1] = startPart.split(" ");
  const endParts = endText.split(" ");
  if (m1 && endParts.length === 3 && endParts[1] === m1) return `${d1}–${endText}`;
  return `${startPart} – ${endText}`;
}
