import { Fragment } from "react";
import { eventOverlapsRange } from "../lib/eventYears.js";
import { queryMarks } from "../lib/queryMarks.js";

// Right-to-left runs isolated (<bdi>), as in EventDetail, so the punctuation
// around a name in Arabic, Hebrew or Persian script stays in place.
function bidiNodes(pieces, keyBase) {
  return pieces.map((p, k) =>
    p.rtl ? (
      <bdi key={`${keyBase}-${k}`} dir="rtl" lang={p.lang ?? undefined}>
        {p.text}
      </bdi>
    ) : (
      p.text
    )
  );
}

/** Text as nodes: query-word prefixes wrapped in <mark>, right-to-left runs in <bdi> (lib/queryMarks.js). */
export function highlight(text, query) {
  if (!text) return text;
  const segs = queryMarks(text, query);
  if (segs.length === 1 && !segs[0].mark && segs[0].pieces.length === 1 && !segs[0].pieces[0].rtl) return text;
  let at = 0;
  return segs.map((s) => {
    const key = at;
    at += s.text.length;
    const nodes = bidiNodes(s.pieces, key);
    return s.mark ? <mark key={key}>{nodes}</mark> : <Fragment key={key}>{nodes}</Fragment>;
  });
}

// The years as the dates give them, for labels (lib/eventYears.js).
export { rawEventYears as eventYears } from "../lib/eventYears.js";

// Overlap with the selected years: the span between the two years, whichever
// order the data gives them in (lib/eventYears.js).
export function inRange(e, range) {
  if (!range) return true;
  return eventOverlapsRange(e, range[0], range[1]);
}
