// Splits one paragraph of Wikipedia text into plain and highlighted pieces, marking
// every exact occurrence of each phrase flagged by the framing review. The text itself
// is never altered: joining the pieces gives back the paragraph unchanged.
export function markSegments(paragraph, phrases) {
  const ranges = [];
  for (const phrase of phrases ?? []) {
    if (!phrase) continue;
    for (let at = paragraph.indexOf(phrase); at !== -1; at = paragraph.indexOf(phrase, at + phrase.length)) {
      ranges.push([at, at + phrase.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const out = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) out.push({ text: paragraph.slice(pos, s), flagged: false });
    out.push({ text: paragraph.slice(s, e), flagged: true });
    pos = e;
  }
  if (pos < paragraph.length || out.length === 0) out.push({ text: paragraph.slice(pos), flagged: false });
  return out;
}
