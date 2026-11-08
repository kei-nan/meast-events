// Links that open a new GitHub issue on this project's repository with its title,
// body and label filled in, for the reader to finish and submit. Pure; shared by
// the framing review's "contest this review" (components/FramingReview.jsx) and the
// event panel's "Report a problem with this entry" (lib/eventReport.js).
//
// Nothing is sent: the link only opens GitHub's form, prefilled from the URL's query
// (GitHub Docs, "Creating an issue", section "Creating an issue from a URL query").
//
// Length: GitHub does not document how long that URL may be. The link is kept to
// MAX_ISSUE_URL, 8,000 characters, the length RFC 9110 (section 4.1) recommends every
// sender and recipient support at a minimum. Only the body is shortened: whole lines
// from its end, then (one very long line) characters, with a line saying so. The
// title, the label and the `tail` lines (the question the reader answers) are kept
// whole; a title is one event's name, short.

export const REPO = "https://github.com/kei-nan/meast-events";
export const MAX_ISSUE_URL = 8000;

export const TRUNCATED_NOTE = "(Shortened to fit in a link.)";

const build = (title, lines, tail, labels) =>
  `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent([...lines, ...tail].join("\n"))}` +
  (labels ? `&labels=${encodeURIComponent(labels)}` : "");

/**
 * The new-issue URL for `title`, `body` (lines, or one string), `tail` (lines after the
 * body, never shortened) and `labels` (one label or a comma-separated list; optional),
 * at most `max` characters while the title, label and tail fit.
 */
export function issueUrl({ title, body = [], tail = [], labels = "" }, max = MAX_ISSUE_URL) {
  const lines = Array.isArray(body) ? [...body] : String(body).split("\n");
  const full = build(title, lines, tail, labels);
  if (full.length <= max) return full;
  const shortened = (kept) => build(title, [...kept, "", TRUNCATED_NOTE], tail, labels);
  while (lines.length > 1) {
    lines.pop();
    const url = shortened(lines);
    if (url.length <= max) return url;
  }
  // By code point: a cut through a surrogate pair would make encodeURIComponent throw.
  const chars = Array.from(lines[0] ?? "");
  for (let n = Math.floor(chars.length * 0.9); n > 0; n = Math.floor(n * 0.9)) {
    const url = shortened([`${chars.slice(0, n).join("")}…`]);
    if (url.length <= max) return url;
  }
  return build(title, [TRUNCATED_NOTE], tail, labels);
}
