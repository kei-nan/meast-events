// "Not in this atlas": the data policy's table of well-known events the inclusion rule
// does not reach (docs/DATA_POLICY.md, "Known gaps: major events the rule does not
// reach"), so a search for one of them says why it is missing instead of only "no
// events match". Pure; shared by the build (scripts/split-data.mjs, which parses the
// published table into src/data/known-gaps.json) and the search panel
// (components/KnownGapNote.jsx, which matches the query against it).
//
// The policy's own words are shown, unchanged: the table's reason cell, read into plain,
// code, bold and link pieces (its Markdown), and the first sentence of the section's
// introduction. An entry whose Wikidata item is one of the events here (a hand-picked
// one the table names as "shown") is left out by the build: it is on the site.
//
// The build fails when the section or its table cannot be read (parseKnownGaps throws):
// a renamed heading or a changed column would otherwise make the note silently vanish.

import { githubAnchor } from "./dataFixes.js";

export const DATA_POLICY_URL = "https://github.com/kei-nan/meast-events/blob/main/docs/DATA_POLICY.md";

const HEADING_RE = /^###\s+(Known gaps\b.*?)\s*$/;
const EVENT_COL = "Event (QID)";
const REASON_COL = "Why the rule misses it";

// The cells of one Markdown table row; a "\|" inside a cell is a literal bar.
function cells(line) {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return body.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

// "Taif Agreement (Q321936)", "Yemeni unification ([Q1139876](https://...))",
// "Treaty of London (1946) (Q541293)": the name and the QID in the last brackets.
const EVENT_RE = /^(.+?)\s*\(\s*(?:\[(Q\d+)\]\([^)\s]+\)|(Q\d+))\s*\)$/;

/**
 * Inline Markdown as pieces: {text}, {code}, {strong} or {link: text, url}. Only the
 * forms the table uses; anything else stays as written.
 */
export function inlineParts(md) {
  const out = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let at = 0;
  for (const m of String(md).matchAll(re)) {
    if (m.index > at) out.push({ text: md.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ code: m[1] });
    else if (m[2] !== undefined) out.push({ strong: m[2] });
    else out.push({ link: m[3], url: m[4] });
    at = m.index + m[0].length;
  }
  if (at < md.length) out.push({ text: md.slice(at) });
  return out;
}

/**
 * The section of `markdown` (docs/DATA_POLICY.md): { anchor, intro, entries: [{ name,
 * qid, reason }] }, `reason` as inlineParts. Throws, naming what it could not find.
 */
export function parseKnownGaps(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const h = lines.findIndex((l) => HEADING_RE.test(l));
  if (h < 0) throw new Error('known gaps: no "### Known gaps" heading in docs/DATA_POLICY.md');
  const anchor = githubAnchor(HEADING_RE.exec(lines[h])[1]);
  // The section ends at the next heading of any level.
  let end = lines.findIndex((l, i) => i > h && /^#{1,6}\s/.test(l));
  if (end < 0) end = lines.length;
  const section = lines.slice(h + 1, end);

  // The introduction's first sentence: the first paragraph, up to its first full stop.
  const para = [];
  for (const l of section) {
    if (!l.trim()) {
      if (para.length) break;
      continue;
    }
    if (l.trim().startsWith("|")) break;
    para.push(l.trim());
  }
  const sentence = /^(.+?\.)(?:\s|$)/.exec(para.join(" "));
  if (!sentence) throw new Error("known gaps: the section has no introduction before its table");
  const intro = inlineParts(sentence[1]);

  const t = section.findIndex((l) => l.trim().startsWith("|"));
  if (t < 0) throw new Error("known gaps: the section has no table");
  const header = cells(section[t]);
  const ei = header.indexOf(EVENT_COL);
  const ri = header.indexOf(REASON_COL);
  if (ei < 0 || ri < 0) {
    throw new Error(`known gaps: the table's columns are ${JSON.stringify(header)}; expected "${EVENT_COL}" and "${REASON_COL}"`);
  }
  if (!/^\|?\s*:?-{3,}/.test(section[t + 1] ?? "")) throw new Error("known gaps: the table has no separator row under its header");

  const entries = [];
  for (let i = t + 2; i < section.length && section[i].trim().startsWith("|"); i++) {
    const row = cells(section[i]);
    if (row.length !== header.length) {
      throw new Error(`known gaps: row ${i - t - 1} has ${row.length} cells, the header ${header.length}: ${section[i]}`);
    }
    const m = EVENT_RE.exec(row[ei]);
    if (!m) throw new Error(`known gaps: row ${i - t - 1}: no "Name (Q123)" in ${JSON.stringify(row[ei])}`);
    if (!row[ri]) throw new Error(`known gaps: row ${i - t - 1} (${m[1]}) has no reason`);
    entries.push({ name: m[1], qid: m[2] ?? m[3], reason: inlineParts(row[ri]) });
  }
  if (!entries.length) throw new Error("known gaps: the table has no rows");
  return { anchor, intro, entries };
}

// Words that say nothing on their own: a query of only these matches no entry.
const STOPWORDS = new Set(["a", "an", "and", "the", "of", "in", "on", "at", "to", "by", "for", "between", "d"]);

// Lower case, accents removed (Unicode decomposition), apostrophes and the transliteration
// marks for hamza and ayn dropped ("d'état" and "d’etat" are both "detat", "Ṭāʾif" is
// "taif"), and everything else that is not a letter or digit a break.
export function words(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’ʼ‘`ʾʿ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The entries whose name contains the query's words, whole and in order ("Taif", "taif
 * agreement", "iraqi coup", not "Tai" or "agreement Taif"), at most `limit`, in the
 * table's order. A query of only common words ("of", "the") matches none.
 */
export function matchKnownGaps(query, entries, limit = 3) {
  const q = words(query);
  if (!q.length || q.every((w) => STOPWORDS.has(w))) return [];
  const out = [];
  for (const e of entries ?? []) {
    const n = words(e.name);
    for (let i = 0; i + q.length <= n.length; i++) {
      if (q.every((w, k) => n[i + k] === w)) {
        out.push(e);
        break;
      }
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** The link to the section in the published policy. */
export const knownGapsUrl = (anchor) => (anchor ? `${DATA_POLICY_URL}#${anchor}` : DATA_POLICY_URL);
