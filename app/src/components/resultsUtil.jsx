import { eventOverlapsRange } from "../lib/eventYears.js";

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split text into nodes with query-word prefixes wrapped in <mark>. */
export function highlight(text, query) {
  const tokens = (query ?? "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!text || tokens.length === 0) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${tokens.map(escapeRe).join("|")})`, "giu");
  const out = [];
  let last = 0;
  let found = false;
  for (const m of text.matchAll(re)) {
    found = true;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<mark key={m.index}>{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  if (!found) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// The years as the dates give them, for labels (lib/eventYears.js).
export { rawEventYears as eventYears } from "../lib/eventYears.js";

// Overlap with the selected years: the span between the two years, whichever
// order the data gives them in (lib/eventYears.js).
export function inRange(e, range) {
  if (!range) return true;
  return eventOverlapsRange(e, range[0], range[1]);
}
