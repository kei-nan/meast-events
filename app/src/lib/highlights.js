// Splits one paragraph of Wikipedia text into plain and highlighted pieces, marking
// every exact occurrence of each phrase flagged by the framing review. The text itself
// is never altered: joining the pieces gives back the paragraph unchanged.
//
// A phrase is a string or {text, kind}. Overlapping marks merge into one piece whose
// `kinds` lists every review type that flagged any part of it.
export function markSegments(paragraph, phrases) {
  const ranges = [];
  for (const item of phrases ?? []) {
    const phrase = typeof item === "string" ? item : item?.text;
    const kind = typeof item === "string" ? null : item.kind;
    if (!phrase) continue;
    for (let at = paragraph.indexOf(phrase); at !== -1; at = paragraph.indexOf(phrase, at + phrase.length)) {
      ranges.push([at, at + phrase.length, kind]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const [s, e, kind] of ranges) {
    const last = merged.at(-1);
    if (last && s <= last[1]) {
      last[1] = Math.max(last[1], e);
      if (kind) last[2].add(kind);
    } else merged.push([s, e, new Set(kind ? [kind] : [])]);
  }
  const out = [];
  let pos = 0;
  for (const [s, e, kinds] of merged) {
    if (s > pos) out.push({ text: paragraph.slice(pos, s), flagged: false });
    out.push({ text: paragraph.slice(s, e), flagged: true, kinds: [...kinds] });
    pos = e;
  }
  if (pos < paragraph.length || out.length === 0) out.push({ text: paragraph.slice(pos), flagged: false });
  return out;
}
