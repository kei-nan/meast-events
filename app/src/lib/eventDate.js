// Formats an event's Wikidata dates ("YYYY-MM-DD" strings) for the detail view, e.g.
// "5–10 June 1967", "June 1967 – 1970" or "1915–1917". The data carries no date
// precision, and Wikidata pads coarse dates to the first of the month or year
// (e.g. the Nakba "ends" 1949-01-01), so a date on 1 January is shown as its year
// only and one on the 1st of a month as month and year. That can drop a real day
// but never adds precision that may not be there. `yearOnly` (set when the dates
// are flagged as unverified) shows just the years.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parse(s) {
  const m = /^(-?\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(s ?? "");
  if (!m) return null;
  const month = Number(m[2] ?? 0);
  const day = Number(m[3] ?? 0);
  const year = m[1];
  if (!month || (month === 1 && day <= 1)) return { year };
  if (day <= 1) return { year, month };
  return { year, month, day };
}

const monthName = (d) => MONTHS[d.month - 1];

function full(d) {
  if (!d.month) return d.year;
  return d.day ? `${d.day} ${monthName(d)} ${d.year}` : `${monthName(d)} ${d.year}`;
}

export function formatEventDate(start, end, { yearOnly = false } = {}) {
  let a = parse(start);
  let b = end && end !== start ? parse(end) : null;
  if (!a) return start ?? "";
  if (yearOnly) {
    a = { year: a.year };
    b = b && { year: b.year };
  }
  if (!b) return full(a);
  if (!a.month && !b.month) return a.year === b.year ? a.year : `${a.year}–${b.year}`;
  if (a.year === b.year && a.month && b.month) {
    if (a.month === b.month) {
      if (a.day && b.day) return `${a.day}–${b.day} ${monthName(a)} ${a.year}`;
      if (!a.day && !b.day) return full(a);
      return `${full(a)} – ${full(b)}`;
    }
    const left = a.day ? `${a.day} ${monthName(a)}` : monthName(a);
    return `${left} – ${full(b)}`;
  }
  return `${full(a)} – ${full(b)}`;
}
