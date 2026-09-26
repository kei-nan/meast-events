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

export function eventYears(e) {
  const s = Number(e.date_start?.slice(0, 4));
  const en = e.date_end ? Number(e.date_end.slice(0, 4)) : s;
  return [s, Number.isFinite(en) ? en : s];
}

export function inRange(e, range) {
  if (!range) return true;
  const [s, en] = eventYears(e);
  return s <= range[1] && en >= range[0];
}
