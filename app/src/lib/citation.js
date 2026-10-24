// Citations of an event's text, in APA 7, MLA 9 and Chicago (notes and bibliography, 18th ed.). Pure.
//
// What is cited is the Wikipedia article the text comes from (it is Wikipedia's text, unchanged), under the
// article's own title (from `wikipedia_url`; our event title can be a label for an event without an article of
// its own). The link is the permanent link of the revision whose lead is exactly the shown text,
// https://en.wikipedia.org/w/index.php?title=<title>&oldid=<wikipedia_revid>, where that revision is known
// (docs/DATA_POLICY.md, "Revision"); otherwise the article's URL, which may since show different text. The date
// is the day the text was retrieved (`extract_retrieved_at`). We do not store the date of the revision itself,
// so each style's form for a source without a publication date is used, with the retrieval/access date:
//
// APA 7 (Publication Manual, 7th ed., 10.3; APA Style, "Wikipedia entry references",
//   https://apastyle.apa.org/style-grammar-guidelines/references/examples/wikipedia-references):
//   "Oil painting. (2019, December 8). In Wikipedia. https://en.wikipedia.org/w/index.php?title=Oil_painting&oldid=929802398"
//   Cite the archived version (oldid); "if a wiki does not provide permanent links to archived versions of the
//   page, include the URL for the entry and a retrieval date". No date: "n.d." (APA Style, "Missing reference
//   information", https://apastyle.apa.org/style-grammar-guidelines/references/missing-information); retrieval
//   date as "Retrieved January 9, 2020, from https://..." (APA Style, "Webpage on a website references",
//   https://apastyle.apa.org/style-grammar-guidelines/references/examples/webpage-website-references).
//   Wikipedia's own APA example has exactly this no-date form with an oldid link: "Plagiarism. (n.d.). In
//   Wikipedia. Retrieved August 10, 2004, from https://en.wikipedia.org/w/index.php?title=Plagiarism&oldid=5139350"
//   (https://en.wikipedia.org/wiki/Wikipedia:Citing_Wikipedia).
//   => Title. (n.d.). In *Wikipedia*. Retrieved Month D, YYYY, from URL
//
// MLA 9 (MLA Style Center, "If I have two works with identical titles and no authors...",
//   https://style.mla.org/identical-titles-no-authors/): "“Harry Houdini.” Wikipedia: The Free Encyclopedia,
//   Wikimedia Foundation, 20 Feb. 2018, en.wikipedia.org/wiki/Harry_Houdini." (container in italics, URL without
//   "https://"; also https://style.mla.org/citing-entries-in-reference-works/). No publication date: omit it and
//   put an access date in the optional slot at the end, "Accessed 25 Oct. 2015." (https://style.mla.org/web-sites-no-publication-date/,
//   https://style.mla.org/access-dates/). Months as the MLA Handbook abbreviates them (Sept., not Sep.; May, June, July in full).
//   => “Title.” *Wikipedia: The Free Encyclopedia*, Wikimedia Foundation, en.wikipedia.org/... Accessed D Mon. YYYY.
//
// Chicago 18th ed., notes and bibliography (14.130-14.131, as quoted by Red Deer Polytechnic Library,
//   https://guides.rdpolytech.ca/chicago18/citation/referencework): note "Wikipedia, “Vincent van Gogh,” last
//   modified February 9, 2025, 01:10 (UTC), https://en.wikipedia.org/wiki/Vincent_van_Gogh."; "If there is no
//   publication or revision date, supply an access date instead"; "s.v." is no longer recommended; well-known
//   reference works are usually cited in notes only, not in the bibliography (14.130). Chicago's own advice on
//   Wikipedia as a tertiary source: https://www.chicagomanualofstyle.org/qanda/data/faq/topics/Documentation/faq0376.html
//   => note: Wikipedia, “Title,” accessed Month D, YYYY, URL.   shortened note: Wikipedia, “Title.”
//
// The site's event page and the border data's source are named next to the citations, not inside them: the
// text is Wikipedia's, the borders are CShapes 2.0's (credit as in NOTICE).

export const SITE = "https://middleeast.events";
export const SITE_NAME = "Middle East, 1900–present";
// NOTICE, "CShapes 2.0 - historical country borders" (and data/LICENSE).
export const CSHAPES_CREDIT =
  "CShapes 2.0 - historical country borders. Schvitz, G., et al. (2022). CC BY-NC-SA 4.0. https://icr.ethz.ch/data/cshapes/ (modified by middleeast.events)";

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

/** "October 1, 2026" (APA, Chicago). */
export const longDate = ({ y, m, d }) => `${MONTHS[m - 1]} ${d}, ${y}`;
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
 * The citations of `event` (a full detail record: wikipedia_url, extract_retrieved_at, wikipedia_revid?, id),
 * or null when it has no English Wikipedia article URL. Each style is {id, label, parts, text}: `parts` are
 * {text, italic?} pieces for display, `text` is the same citation as plain text (what "Copy" copies).
 */
export function citeEvent(event) {
  const title = articleTitle(event?.wikipedia_url);
  if (!title) return null;
  const revid = isRevid(event.wikipedia_revid) ? event.wikipedia_revid : null;
  const url = revid ? permalink(title, revid) : String(event.wikipedia_url).split("#")[0];
  const day = isoDay(event.extract_retrieved_at);
  const mlaUrl = url.replace(/^https?:\/\//, "");
  const end = (t, mark) => (endsInMark(t) ? t : t + mark);

  const apa = [
    { text: `${end(title, ".")} (n.d.). In ` },
    { text: "Wikipedia", italic: true },
    { text: day ? `. Retrieved ${longDate(day)}, from ${url}` : `. ${url}` },
  ];
  const mla = [
    { text: `“${end(title, ".")}” ` },
    { text: "Wikipedia: The Free Encyclopedia", italic: true },
    { text: `, Wikimedia Foundation, ${mlaUrl}.${day ? ` Accessed ${mlaDate(day)}.` : ""}` },
  ];
  const chicagoNote = [{ text: `Wikipedia, “${end(title, ",")}” ${day ? `accessed ${longDate(day)}, ` : ""}${url}.` }];
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
    retrieved: day ? longDate(day) : null,
    styles,
    siteName: SITE_NAME,
    eventPage: `${SITE}/event/${encodeURIComponent(event.id)}`,
    borders: CSHAPES_CREDIT,
  };
}

/**
 * The plain notes that go with the citations: whether the link is the exact revision, and (Chicago) that
 * Wikipedia is cited in notes only. Strings, so the app and the static page say the same.
 */
export function citationNotes(cite) {
  if (!cite) return [];
  return [
    cite.revid
      ? `The link is the Wikipedia revision whose lead is exactly the text shown here (revision ${cite.revid}).`
      : `No revision is recorded for this text, so the link is the live article: Wikipedia’s text may have changed since it was retrieved${cite.retrieved ? ` on ${cite.retrieved}` : ""}.`,
    "Chicago cites well-known reference works such as Wikipedia in notes only, not in the bibliography.",
  ];
}
