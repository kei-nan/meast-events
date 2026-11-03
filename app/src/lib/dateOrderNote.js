// The note shown with an event whose Wikidata end date is before its start (flagged
// date_order_invalid; docs/DATA_POLICY.md, "Review flags"). Other date flags stay in the
// data and are not shown. Plain language, from the event's dates and the dates its
// Wikipedia lead mentions (wikipedia_lead_dates: "YYYY-MM-DD", or "YYYY" years). Each date
// shows no more precision than its source gives (date_precision, date_end_precision). Pure.
import { formatEventDate } from "./eventDate.js";

const listText = (items) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0];

/** The note's text, or null when the event's dates are not flagged as out of order. */
export function dateOrderNote(event) {
  const { date_start: start, date_end: end } = event ?? {};
  const flagged = (event?.date_flags ?? []).some((f) => typeof f === "string" && f.startsWith("date_order_invalid"));
  if (!flagged || !start || !end || end >= start) return null;
  const startText = formatEventDate(start, null, { precision: event.date_precision ?? null });
  // The end to Wikidata's precision of it (date_end_precision), as the event's date line
  // shows it (lib/eventDate.js): a year-precision end stored as 1970-01-01 is "1970", not
  // "1 January 1970"; none recorded is the year only.
  const endText = formatEventDate(end, null, { precision: event.date_end_precision ?? null });
  const lead = (event.wikipedia_lead_dates ?? []).filter((d) => typeof d === "string" && /^\d{4}(-\d{2}-\d{2})?$/.test(d));
  // Each lead date to what it gives: a full date as a day, a "YYYY" as the year.
  const leadText = lead.map((d) => formatEventDate(d, null, { precision: d.length === 4 ? "year" : "day" }));
  let wikipedia = "";
  if (lead.length === 1) wikipedia = `; Wikipedia gives ${leadText[0]}`;
  else if (lead.length > 1 && lead[0].length === 4) wikipedia = `; Wikipedia’s summary mentions the years ${listText(leadText)}`;
  else if (lead.length > 1) wikipedia = `; Wikipedia’s summary mentions ${listText(leadText)}`;
  return `Wikidata gives this event’s end (${endText}) as before its start (${startText})${wikipedia}.`;
}
