// "Report a problem with this entry" in the event panel (components/EventDetail.jsx): a
// new GitHub issue (lib/githubIssue.js) that names the event as this site shows it, so a
// report says which record and which text it is about without the reader copying them.
// Pure.
//
// The body gives the values as they are in the data, not formatted for reading: the id,
// the Wikidata item, the Wikipedia article and the revision whose lead is the shown text
// (`wikipedia_revid`, where known), the dates with their precision, the country tags and
// the location quality with where the point comes from. A field the record lacks says so.
// Then the question the reader answers. Nothing about the reader is in the link, and no
// label: one the repository does not have would be a guess.

import { SITE } from "./citation.js";
import { issueUrl } from "./githubIssue.js";
import { eventPath } from "./urlState.js";

const or = (v, none = "none") => (v === null || v === undefined || v === "" ? none : String(v));

const dates = (e) => {
  const start = `${or(e.date_start, "unknown")}${e.date_precision ? ` (${e.date_precision} precision)` : ""}`;
  if (!e.date_end) return start;
  return `${start} to ${e.date_end}${e.date_end_precision ? ` (${e.date_end_precision} precision)` : ""}`;
};

const location = (e) => {
  const parts = [or(e.location_quality, "unknown")];
  if (e.approximate_reason) parts.push(`reason: ${e.approximate_reason}`);
  const c = e.coordinates;
  if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) parts.push(`lat ${c.lat}, lon ${c.lon}`);
  if (e.coordinate_source) parts.push(`from ${e.coordinate_source}`);
  return parts.join("; ");
};

/** The body lines of a report about `event` (a full detail record). */
export function reportBody(event) {
  return [
    `Event: ${event.title} (${event.id})`,
    `Page: ${SITE}${eventPath(event.id)}`,
    `Wikidata: ${or(event.wikidata_qid)}`,
    `Wikipedia: ${or(event.wikipedia_url)}`,
    `Wikipedia revision of the shown text: ${or(event.wikipedia_revid, "not recorded")}`,
    `Text retrieved: ${or(event.extract_retrieved_at ? String(event.extract_retrieved_at).slice(0, 10) : null, "not recorded")}`,
    `Dates: ${dates(event)}`,
    `Countries: ${(event.countries ?? []).length ? event.countries.join(", ") : "none"}`,
    `Location: ${location(event)}`,
    `Category: ${or(event.category)}`,
  ];
}

// After the record, kept whole however long it is (lib/githubIssue.js). The last line is
// the About page's ("Report a problem").
export const REPORT_TAIL = [
  "",
  "What is wrong, and what source shows it?",
  "",
  "",
  "Errors in article text are best fixed on Wikipedia or Wikidata itself; the next data refresh picks the fix up.",
];

/** The new-issue link for a problem with `event`. */
export function reportUrl(event) {
  return issueUrl({ title: `Problem with an entry: ${event.title}`, body: reportBody(event), tail: REPORT_TAIL });
}
