// Formats an event's Wikidata dates ("YYYY-MM-DD" strings) for the detail view, showing
// no more precision than the data records. `precision` is Wikidata's precision of the
// start date ("day", "month", "year", "decade", or missing): a day shows as
// "5 June 1967", a month as "June 1967", anything else as the year only. No precision
// is recorded for the end date, so it shows as a year only: "20 March 2003 – 2011", or
// "5 June 1967 (ended 1967)" when it ends in the start's year. `yearOnly` (set when the
// dates are flagged as unverified) shows just the years, in the order given.

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

export function formatEventDate(start, end, { precision = null, yearOnly = false } = {}) {
  if (!start) return "";
  const startYear = start.slice(0, 4);
  const endYear = end && end !== start ? end.slice(0, 4) : null;
  // An end before the start is shown as given, but only as years.
  const startText = yearOnly || (end && end < start) ? startYear : formatStart(start, precision);
  if (!endYear) return startText;
  if (startText === startYear) return endYear === startYear ? startYear : `${startYear}–${endYear}`;
  return endYear === startYear ? `${startText} (ended ${endYear})` : `${startText} – ${endYear}`;
}
