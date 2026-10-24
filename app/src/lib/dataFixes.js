// The documented corrections this project applied to an event (docs/data-fixes.md,
// "F1", "F7", ...). Pure; shared by the build (scripts/split-data.mjs, which reads the
// fix log and attaches { ref, anchor } to each corrected event's detail record) and
// the event panel, which says so in one line with a link to the entry.
//
// The pipeline records an applied fix as a review note "data_fix F7: ..." (scripts/lib/
// fixes.js applyDataFix). Only those count: the log's other entries (checks, rules)
// changed no value of the event.

export const DATA_FIXES_DOC = "https://github.com/kei-nan/meast-events/blob/main/docs/data-fixes.md";

const DATA_FIX_RE = /^data_fix (F\d+):/;

/** The fix refs ("F7") named in an event's review notes, in order, each once. */
export function dataFixRefs(reviewReasons) {
  const out = [];
  for (const r of Array.isArray(reviewReasons) ? reviewReasons : []) {
    const m = DATA_FIX_RE.exec(String(r));
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * The anchor GitHub gives a Markdown heading (as github-slugger does): lower case,
 * every character that is not a letter, digit, space, hyphen or underscore removed,
 * each space a hyphen. "F7 - October 7 attacks (`x`, Q1)" -> "f7---october-7-attacks-x-q1".
 */
export function githubAnchor(heading) {
  return String(heading)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}_ -]/gu, "")
    .replace(/ /g, "-");
}

/** Map ref -> anchor for every "## Fn - ..." heading of docs/data-fixes.md. */
export function dataFixAnchors(markdown) {
  const out = new Map();
  for (const line of String(markdown ?? "").split(/\r?\n/)) {
    const m = /^##\s+((F\d+)\b.*)$/.exec(line);
    if (m && !out.has(m[2])) out.set(m[2], githubAnchor(m[1]));
  }
  return out;
}

/** The link to a fix's entry; the log itself when its heading was not found. */
export function dataFixUrl(fix) {
  return fix?.anchor ? `${DATA_FIXES_DOC}#${fix.anchor}` : DATA_FIXES_DOC;
}
