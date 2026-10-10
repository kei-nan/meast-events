// Right-to-left runs in Wikipedia's English text: names given in Arabic, Hebrew
// or Persian, such as "(Arabic: ثورة البراق, Thawrat al-Burāq)". Shown inside
// left-to-right text without isolation, the bidi algorithm can reorder the
// punctuation and numbers around them. EventDetail wraps each run in
// <bdi dir="rtl">. Presentation only: the text is never changed, and joining
// the pieces gives back the input. Pure.

// A letter of a right-to-left script, with any combining marks (Arabic
// vowel signs are of the "Inherited" script, not Arabic).
const RTL_UNIT = "[\\p{Script=Arabic}\\p{Script=Hebrew}\\p{Script=Syriac}]\\p{M}*";
// Spaces, digits and punctuation between two such letters belong to the run
// (Hebrew gershayim are often typed as '"'); before the first or after the last
// letter they stay outside it, e.g. the ", " and ")" around a name.
const BRIDGE = "[\\s\\p{P}\\p{N}\\u200c\\u200d]*";
const RUN_RE = new RegExp(`${RTL_UNIT}(?:${BRIDGE}${RTL_UNIT})*`, "gu");

// A language label right before the run ("(Arabic: ", "; Hebrew: "): only the
// bare names, so "Egyptian Arabic:" or "Ottoman Turkish:" give no lang.
const LABEL_RE = /(?:^|[(;,]\s*)(Arabic|Hebrew|Persian)\s*:\s*$/;
const LANG = { Arabic: "ar", Hebrew: "he", Persian: "fa" };

/** The right-to-left runs of `text`: [{start, end, lang}] (lang null when not labelled). */
export function rtlRuns(text) {
  const runs = [];
  for (const m of String(text ?? "").matchAll(RUN_RE)) {
    const label = LABEL_RE.exec(text.slice(Math.max(0, m.index - 40), m.index));
    runs.push({ start: m.index, end: m.index + m[0].length, lang: label ? LANG[label[1]] : null });
  }
  return runs;
}

/**
 * Splits the piece of a paragraph that starts at `offset` into [{text, rtl,
 * lang}] by the paragraph's `runs` (rtlRuns of the whole paragraph, so a label
 * in an earlier piece still counts). Joined, the texts are `text`.
 */
export function splitBidi(text, runs, offset = 0) {
  const out = [];
  let pos = 0;
  const end = text.length;
  for (const r of runs) {
    const s = Math.max(0, r.start - offset);
    const e = Math.min(end, r.end - offset);
    if (e <= s) continue;
    if (s > pos) out.push({ text: text.slice(pos, s), rtl: false, lang: null });
    out.push({ text: text.slice(s, e), rtl: true, lang: r.lang });
    pos = e;
  }
  if (pos < end || out.length === 0) out.push({ text: text.slice(pos), rtl: false, lang: null });
  return out;
}
