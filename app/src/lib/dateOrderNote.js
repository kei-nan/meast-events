// The note shown with an event whose Wikidata end date is before its start (flagged
// date_order_invalid; docs/DATA_POLICY.md, "Review flags"). Other date flags stay in the
// data and are not shown. Plain language, from the event's dates and the dates its
// Wikipedia lead mentions (wikipedia_lead_dates: "YYYY-MM-DD", or "YYYY" years). Pure.
import { formatEventDate } from "./eventDate.js";

const listText = (items) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0];

/** The note's text, or null when the event's dates are not flagged as out of order. */
export function dateOrderNote(event) {
  const { date_start: start, date_end: end } = event ?? {};
  const flagged = (event?.date_flags ?? []).some((f) => typeof f === "string" && f.startsWith("date_order_invalid"));
  if (!flagged || !start || !end || end >= start) return null;
  const startText = formatEventDate(start, null, { precision: event.date_precision ?? null });
  const endText = formatEventDate(end, null, { precision: "day" });
  const lead = (event.wikipedia_lead_dates ?? []).filter((d) => typeof d === "string" && /^\d{4}(-\d{2}-\d{2})?$/.test(d));
  const leadText = lead.map((d) => formatEventDate(d, null, { precision: "day" }));
  let wikipedia = "";
  if (lead.length === 1) wikipedia = `; Wikipedia gives ${leadText[0]}`;
  else if (lead.length > 1 && lead[0].length === 4) wikipedia = `; Wikipedia’s summary mentions the years ${listText(leadText)}`;
  else if (lead.length > 1) wikipedia = `; Wikipedia’s summary mentions ${listText(leadText)}`;
  return `Wikidata gives this event’s end (${endText}) as before its start (${startText})${wikipedia}.`;
}
