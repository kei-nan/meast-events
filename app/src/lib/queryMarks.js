// The pieces of a result row's title or snippet (components/resultsUtil.jsx
// highlight): where the query's words start a word they are marked, and every
// piece is split into its right-to-left runs (lib/bidi.js), so a name in
// Arabic, Hebrew or Persian script is isolated in the row as in the event's
// text. Presentation only: joined, the texts are the input. Pure.

import { rtlRuns, splitBidi } from "./bidi.js";

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * [{text, mark, pieces: [{text, rtl, lang}]}] for `text`: `mark` is true for a
 * query word prefix. One unmarked segment when nothing matches.
 */
export function queryMarks(text, query) {
  const s = String(text ?? "");
  const tokens = (query ?? "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const segs = [];
  if (tokens.length) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${tokens.map(escapeRe).join("|")})`, "giu");
    let last = 0;
    for (const m of s.matchAll(re)) {
      if (m.index > last) segs.push({ text: s.slice(last, m.index), mark: false });
      segs.push({ text: m[0], mark: true });
      last = m.index + m[0].length;
    }
    if (last < s.length) segs.push({ text: s.slice(last), mark: false });
  }
  if (!segs.length) segs.push({ text: s, mark: false });
  const runs = rtlRuns(s);
  let at = 0;
  return segs.map((seg) => {
    const pieces = runs.length ? splitBidi(seg.text, runs, at) : [{ text: seg.text, rtl: false, lang: null }];
    at += seg.text.length;
    return { ...seg, pieces };
  });
}
