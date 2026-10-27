// Citations of an event's text, in APA 7, MLA 9 and Chicago (notes and bibliography, 18th ed.). Pure.
//
// What is cited is the Wikipedia article the text comes from (it is Wikipedia's text, unchanged), under the
// article's own title (from `wikipedia_url`; our event title can be a label for an event without an article of
// its own). Two forms, following each style's own rules:
//
// - DATED, where the revision whose lead is exactly the shown text is known (`wikipedia_revid` with its
//   `wikipedia_revid_timestamp`; docs/DATA_POLICY.md, "Revision"): the permanent link of that revision,
//   https://en.wikipedia.org/w/index.php?title=<title>&oldid=<revid>, under the date that revision was saved
//   (UTC). No retrieval/access date: the link is to a fixed version.
// - UNDATED, otherwise: the article's URL, which may since show different text, with each style's form for a
//   source without a date and the day the text was retrieved (`extract_retrieved_at`) as the retrieval/access date.
//
// APA 7 (Publication Manual, 7th ed., 10.3; APA Style, "Wikipedia entry references",
//   https://apastyle.apa.org/style-grammar-guidelines/references/examples/wikipedia-references):
//   "Oil painting. (2019, December 8). In Wikipedia. https://en.wikipedia.org/w/index.php?title=Oil_painting&oldid=929802398"
//   Cite the archived version (oldid); "if a wiki does not provide permanent links to archived versions of the
//   page, include the URL for the entry and a retrieval date". No date: "n.d." (APA Style, "Missing reference
//   information", https://apastyle.apa.org/style-grammar-guidelines/references/missing-information); retrieval
//   date as "Retrieved January 9, 2020, from https://..." (APA Style, "Webpage on a website references",
//   https://apastyle.apa.org/style-grammar-guidelines/references/examples/webpage-website-references).
//   => dated:   Title. (YYYY, Month D). In *Wikipedia*. PERMALINK
//   => undated: Title. (n.d.). In *Wikipedia*. Retrieved Month D, YYYY, from URL
//
// MLA 9 (MLA Style Center, "If I have two works with identical titles and no authors...",
//   https://style.mla.org/identical-titles-no-authors/): "“Harry Houdini.” Wikipedia: The Free Encyclopedia,
//   Wikimedia Foundation, 20 Feb. 2018, en.wikipedia.org/wiki/Harry_Houdini." (container in italics, the date of
//   the version as the publication date, URL without "https://", no access date; also
//   https://style.mla.org/citing-entries-in-reference-works/). An access date is optional, useful when a work
//   lacks a publication date or may change (https://style.mla.org/access-dates/); with no publication date, omit
//   it and put the access date at the end, "Accessed 25 Oct. 2015." (https://style.mla.org/web-sites-no-publication-date/).
//   Months as the MLA Handbook abbreviates them (Sept., not Sep.; May, June, July in full).
//   => dated:   “Title.” *Wikipedia: The Free Encyclopedia*, Wikimedia Foundation, D Mon. YYYY, en.wikipedia.org/w/index.php?...
//   => undated: “Title.” *Wikipedia: The Free Encyclopedia*, Wikimedia Foundation, en.wikipedia.org/wiki/... Accessed D Mon. YYYY.
//
// Chicago 18th ed., notes and bibliography (14.130-14.131, as quoted by Red Deer Polytechnic Library,
//   https://guides.rdpolytech.ca/chicago18/citation/referencework): note "Wikipedia, “Vincent van Gogh,” last
//   modified February 9, 2025, 01:10 (UTC), https://en.wikipedia.org/wiki/Vincent_van_Gogh."; "If there is no
//   publication or revision date, supply an access date instead"; "s.v." is no longer recommended; well-known
//   reference works are usually cited in notes only, not in the bibliography (14.130). Chicago's own advice on
//   Wikipedia as a tertiary source: https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Documentation/faq0376.html
//   => dated:   Wikipedia, “Title,” last modified Month D, YYYY, HH:MM (UTC), PERMALINK.
//   => undated: Wikipedia, “Title,” accessed Month D, YYYY, URL.
//   => shortened note: Wikipedia, “Title.”
//
// The site's event page and the border data's source are named next to the citations, not inside them: the
// text is Wikipedia's, the borders are CShapes 2.0's (credit as in NOTICE).

export const SITE = "https://middleeast.events";
export const SITE_NAME = "Middle East, 1900–present";
// The border data's credits, worded as in NOTICE (and data/LICENSE): CShapes 2.0, plus the two
// other sources the drawn borders carry - UN OCHA's West Bank Areas A/B/C (not a Creative Commons
// licence: the legacy HumanitarianResponse.info terms) and GeoNames (the treaty wells and capes
// located in scripts/extract-correction-geometry.js).
export const CSHAPES_CREDIT =
  "CShapes 2.0 - historical country borders. Schvitz, G., et al. (2022). CC BY-NC-SA 4.0. https://icr.ethz.ch/data/cshapes/ (modified by middleeast.events)";
export const OCHA_CREDIT =
  "West Bank Areas A/B/C: UN OCHA / HDX \"Oslo Agreement\" Areas A/B/C (West Bank). Distributed under the legacy HumanitarianResponse.info terms: non-commercial use with credit to UN OCHA. https://data.humdata.org/dataset/state-of-palestine-other-0-0-0-0-0";
export const GEONAMES_CREDIT =
  "some corrected border points: GeoNames - CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). https://www.geonames.org/";
export const BORDERS_CREDIT = [CSHAPES_CREDIT, OCHA_CREDIT, GEONAMES_CREDIT].join("; ");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// MLA Handbook abbreviations.
const MLA_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

/** {y, m, d} of an ISO date or timestamp ("2026-10-01", "2026-10-01T04:00:00Z"), or null. */
export function isoDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(String(value ?? ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? { y, m: mo, d } : null;
}

/** {y, m, d, time: "HH:MM"} of a MediaWiki revision timestamp ("2026-10-15T19:38:37Z", UTC), or null. */
export function revisionDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}Z$/.exec(String(value ?? ""));
  const day = m && isoDay(value);
  return day ? { ...day, time: `${m[4]}:${m[5]}` } : null;
}

/** "October 1, 2026" (APA retrieval date, Chicago). */
export const longDate = ({ y, m, d }) => `${MONTHS[m - 1]} ${d}, ${y}`;
/** "2026, October 1" (APA reference date). */
export const apaDate = ({ y, m, d }) => `${y}, ${MONTHS[m - 1]} ${d}`;
/** "1 Oct. 2026" (MLA). */
export const mlaDate = ({ y, m, d }) => `${d} ${MLA_MONTHS[m - 1]} ${y}`;

/** The article title of an English Wikipedia /wiki/ URL ("Gaza_war#x" -> "Gaza war"), or null. */
export function articleTitle(url) {
  const m = /^https:\/\/en\.wikipedia\.org\/wiki\/([^?#]+)/.exec(String(url ?? ""));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, " ").trim() || null;
  } catch {
    return null;
  }
}

/** The permanent link of one revision of an English Wikipedia article. */
export function permalink(title, revid) {
  return `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(String(title).replace(/ /g, "_"))}&oldid=${revid}`;
}

const isRevid = (v) => Number.isSafeInteger(v) && v > 0;

// A title already ending in "?" or "!" keeps that mark and takes no extra period or comma after it.
const endsInMark = (t) => /[?!]$/.test(t);
const plain = (parts) => parts.map((p) => p.text).join("");

/**
 * The citations of `event` (a full detail record: wikipedia_url, extract_retrieved_at, wikipedia_revid?,
 * wikipedia_revid_timestamp?, id), or null when it has no English Wikipedia article URL. The revision is used only
 * with its date (both or neither). Each style is {id, label, parts, text}: `parts` are {text, italic?} pieces for
 * display, `text` is the same citation as plain text (what "Copy" copies).
 */
export function citeEvent(event) {
  const title = articleTitle(event?.wikipedia_url);
  if (!title) return null;
  const revDay = isRevid(event.wikipedia_revid) ? revisionDay(event.wikipedia_revid_timestamp) : null;
  const revid = revDay ? event.wikipedia_revid : null;
  const url = revid ? permalink(title, revid) : String(event.wikipedia_url).split("#")[0];
  const day = isoDay(event.extract_retrieved_at);
  const mlaUrl = url.replace(/^https?:\/\//, "");
  const end = (t, mark) => (endsInMark(t) ? t : t + mark);

  const apa = [
    { text: `${end(title, ".")} (${revDay ? apaDate(revDay) : "n.d."}). In ` },
    { text: "Wikipedia", italic: true },
    { text: revDay ? `. ${url}` : day ? `. Retrieved ${longDate(day)}, from ${url}` : `. ${url}` },
  ];
  const mla = [
    { text: `“${end(title, ".")}” ` },
    { text: "Wikipedia: The Free Encyclopedia", italic: true },
    {
      text: revDay
        ? `, Wikimedia Foundation, ${mlaDate(revDay)}, ${mlaUrl}.`
        : `, Wikimedia Foundation, ${mlaUrl}.${day ? ` Accessed ${mlaDate(day)}.` : ""}`,
    },
  ];
  const when = revDay
    ? `last modified ${longDate(revDay)}, ${revDay.time} (UTC), `
    : day
      ? `accessed ${longDate(day)}, `
      : "";
  const chicagoNote = [{ text: `Wikipedia, “${end(title, ",")}” ${when}${url}.` }];
  const chicagoShort = [{ text: `Wikipedia, “${end(title, ".")}”` }];

  const styles = [
    { id: "apa", label: "APA 7", parts: apa },
    { id: "mla", label: "MLA 9", parts: mla },
    { id: "chicago", label: "Chicago (note)", parts: chicagoNote },
    { id: "chicago-short", label: "Chicago (shortened note)", parts: chicagoShort },
  ].map((s) => ({ ...s, text: plain(s.parts) }));

  return {
    title,
    url,
    revid,
    revised: revDay ? longDate(revDay) : null,
    retrieved: day ? longDate(day) : null,
    styles,
    siteName: SITE_NAME,
    eventPage: `${SITE}/event/${encodeURIComponent(event.id)}`,
    borders: BORDERS_CREDIT,
  };
}

/**
 * The plain notes that go with the citations: which version the link is, and (Chicago) that Wikipedia is cited
 * in notes only. Strings, so the app and the static page say the same.
 */
export function citationNotes(cite) {
  if (!cite) return [];
  return [
    cite.revid
      ? `The link is the Wikipedia revision of ${cite.revised} (revision ${cite.revid}), whose lead is exactly the text shown here.`
      : `No revision is recorded for this text, so the link is the live article: Wikipedia’s text may have changed since it was retrieved${cite.retrieved ? ` on ${cite.retrieved}` : ""}.`,
    "Chicago cites well-known reference works such as Wikipedia in notes only, not in the bibliography.",
  ];
}
