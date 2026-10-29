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

// A run with no label of its own takes the language of the nearest labelled
// run before it when the two are plainly the same language's names:
//   - the same sentence: no ". " (or "!", "?") outside parentheses between
//     them, as in "(Arabic: X), also known as the Great Arab Revolt (Y)" or
//     "(Persian: X, romanized: ... (Y, BARJAM))";
//   - no other language label between them ("; Turkish: ", "(Egyptian
//     Arabic: "), only "romanized:" and the like (lower case);
//   - the run is in that language's script: a Hebrew label never passes to an
//     Arabic-script run or the reverse. Script alone never gives a language
//     (Persian, Kurdish, Ottoman Turkish and Arabic share one script), so a run
//     with no labelled run before it keeps none.
const OTHER_LABEL_RE = /(?:^|[(;,])\s*\p{Lu}[\p{L} ]*:/u;
// Letters a run must not hold to take the language.
const OTHER_SCRIPT = {
  ar: /[\p{Script=Hebrew}\p{Script=Syriac}]/u,
  fa: /[\p{Script=Hebrew}\p{Script=Syriac}]/u,
  he: /[\p{Script=Arabic}\p{Script=Syriac}]/u,
};

// Does text[from, to) hold a sentence end outside parentheses? Depth is
// counted from the start of text.
function sentenceEndBetween(text, from, to) {
  let depth = 0;
  for (let i = 0; i < to; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (i >= from && depth === 0 && (c === "." || c === "!" || c === "?") && /\s/.test(text[i + 1] ?? "")) return true;
  }
  return false;
}

/**
 * The right-to-left runs of `text`: [{start, end, lang}]. lang comes from a
 * label right before the run, or from an earlier labelled run (see above); null
 * when neither.
 */
export function rtlRuns(text) {
  const s = String(text ?? "");
  const runs = [];
  let labelled = null; // the nearest run before with a label of its own
  for (const m of s.matchAll(RUN_RE)) {
    const run = { start: m.index, end: m.index + m[0].length, lang: null };
    const label = LABEL_RE.exec(s.slice(Math.max(0, m.index - 40), m.index));
    if (label) {
      run.lang = LANG[label[1]];
      labelled = run;
    } else if (
      labelled &&
      !OTHER_SCRIPT[labelled.lang].test(m[0]) &&
      !OTHER_LABEL_RE.test(s.slice(labelled.end, run.start)) &&
      !sentenceEndBetween(s, labelled.end, run.start)
    ) {
      run.lang = labelled.lang;
    }
    runs.push(run);
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
