// The lead of a given (possibly old) revision of an English Wikipedia article, as plain text comparable with lib/lead.js.
//
// lib/lead.js reads leads through TextExtracts (prop=extracts&exintro&explaintext), which only serves an article's
// CURRENT revision. For an older revision we take the revision's parsed HTML (action=parse&oldid=<revid>) and turn
// it into plain text the way TextExtracts' ExtractFormatter does in plain-text mode, then apply the same
// normalizeLead (lib/lead.js), so the result means exactly what an equal lead means for lib/revid.js:
//   1. exintro: keep everything before the first <h1>..<h6> (the lead);
//   2. remove the elements TextExtracts removes ($wgExtractsRemoveClasses, its extension.json default): table, div,
//      figure, script, input, style, ul.gallery, .mw-editsection, sup.reference, ol.references, .error, .nomobile,
//      .noprint, .noexcerpt, .sortkey;
//   3. drop every remaining tag, keeping the text (and the source line breaks) between them;
//   4. decode HTML entities.
// Whether this reproduces TextExtracts is checked, not assumed: backfill-revids.js --historical converts each
// article's CURRENT revision this way and only trusts the conversion for that article when it equals the current
// TextExtracts lead exactly. An entity it does not know makes the conversion fail (null) rather than guess.
// Pure, except parseRevisionHtml / fetchRevisions (network, through lib/http.js politeFetch).
import { politeFetch, sleep } from "./http.js";
import { normalizeLead } from "./lead.js";

const API = "https://en.wikipedia.org/w/api.php";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

// [tag or null, class or null]: an element matches when its tag (if given) and one of its classes (if given) match.
export const REMOVE = [
  ["table", null],
  ["div", null],
  ["figure", null],
  ["script", null],
  ["input", null],
  ["style", null],
  ["ul", "gallery"],
  [null, "mw-editsection"],
  ["sup", "reference"],
  ["ol", "references"],
  [null, "error"],
  [null, "nomobile"],
  [null, "noprint"],
  [null, "noexcerpt"],
  [null, "sortkey"],
];

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

/** Decodes HTML entities; null when it meets a named entity it does not know (never guesses). */
export function decodeEntities(s) {
  let unknown = false;
  const out = s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) {
        unknown = true;
        return m;
      }
      return String.fromCodePoint(cp);
    }
    if (Object.hasOwn(NAMED, body)) return NAMED[body];
    unknown = true;
    return m;
  });
  return unknown ? null : out;
}

function classesOf(attrs) {
  const m = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]).split(/\s+/).filter(Boolean) : [];
}

const removed = (tag, attrs) => {
  const cls = classesOf(attrs);
  return REMOVE.some(([t, c]) => (t === null || t === tag) && (c === null || cls.includes(c)));
};

/** The lead of parser-output HTML as raw plain text (before normalizeLead); null when it cannot be converted safely. */
export function htmlLeadToText(html) {
  if (typeof html !== "string") return null;
  // action=parse wraps the output in <div class="mw-content-ltr mw-parser-output" ...>; TextExtracts works on the
  // unwrapped text, so take that wrapper off (only when it wraps the whole output).
  const wrap = /^\s*<div class="[^"]*\bmw-parser-output\b[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/.exec(html);
  const body = wrap ? wrap[1] : html;
  const h = /<h[1-6]\b/i.exec(body);
  const lead = h ? body.slice(0, h.index) : body;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
  let text = "";
  // While inside a removed element: its tag name and how many same-named elements are open.
  let skipTag = null;
  let depth = 0;
  for (let m; (m = re.exec(lead)); ) {
    const [tok, close, rawTag, attrs] = m;
    if (rawTag === undefined) {
      if (tok.startsWith("<!--")) continue;
      if (!skipTag) text += tok;
      continue;
    }
    const tag = rawTag.toLowerCase();
    const selfClosing = VOID.has(tag) || /\/\s*$/.test(attrs);
    if (skipTag) {
      if (tag === skipTag && !selfClosing) depth += close ? -1 : 1;
      if (depth === 0) skipTag = null;
      continue;
    }
    if (!close && !selfClosing && removed(tag, attrs)) {
      skipTag = tag;
      depth = 1;
    }
  }
  return decodeEntities(text);
}

/** htmlLeadToText followed by lib/lead.js normalizeLead: directly comparable with a stored `extract`. */
export const htmlLead = (html) => normalizeLead(htmlLeadToText(html));

/**
 * Groups revisions (newest first, as fetchRevisions returns them) into runs of consecutive revisions with the same
 * section-0 wikitext, and orders the runs by how close they are to the moment the stored text was read: the run
 * holding the revision that was current at `anchorTime` first, then the others alternately older and newer. Each run
 * names the revision to cite if its lead matches: the anchor itself, else the revision of the run nearest in time
 * to it (the newest of an older run, the oldest of a newer one). Revisions whose wikitext is hidden (null) are
 * never candidates. Returns [{ revid, timestamp, revids }] where revids are all revisions of the run.
 */
export function candidateRuns(revs, anchorTime) {
  const runs = [];
  for (const r of revs) {
    const last = runs[runs.length - 1];
    if (last && last.wikitext === r.wikitext && r.wikitext !== null) last.revs.push(r);
    else runs.push({ wikitext: r.wikitext, revs: [r] });
  }
  let anchorRun = runs.findIndex((run) => run.revs.some((r) => r.timestamp <= anchorTime));
  if (anchorRun === -1) anchorRun = runs.length - 1;
  const order = [anchorRun];
  for (let d = 1; order.length < runs.length; d++) {
    if (anchorRun + d < runs.length) order.push(anchorRun + d); // older
    if (anchorRun - d >= 0) order.push(anchorRun - d); // newer
  }
  return order
    .map((i) => {
      const run = runs[i];
      let pick;
      if (i === anchorRun) pick = run.revs.find((r) => r.timestamp <= anchorTime) ?? run.revs[run.revs.length - 1];
      else pick = i > anchorRun ? run.revs[0] : run.revs[run.revs.length - 1];
      return { wikitext: run.wikitext, revid: pick.revid, timestamp: pick.timestamp, revids: run.revs.map((r) => r.revid) };
    })
    .filter((c) => c.wikitext !== null);
}

/** Parsed HTML of section 0 (the lead) of revision `revid`. */
export async function parseRevisionHtml(revid) {
  const params = new URLSearchParams({
    action: "parse",
    oldid: String(revid),
    prop: "text",
    section: "0",
    disableeditsection: "1",
    disablelimitreport: "1",
    format: "json",
    formatversion: "2",
  });
  const res = await politeFetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`parse HTTP ${res.status} (oldid ${revid})`);
  const data = await res.json();
  if (data.error) throw new Error(`parse error ${data.error.code} (oldid ${revid})`);
  return data.parse?.text ?? null;
}

/**
 * Revisions of `title` newest first, from the current one back to the first one saved before `until` (ISO time),
 * each { revid, timestamp, wikitext } where `wikitext` is the wikitext of section 0 (to group revisions whose lead wikitext
 * is the same, so each distinct lead is parsed once). Batched: up to 50 revisions with content per request.
 */
export async function fetchRevisions(title, until, { maxRequests = 20, delayMs = 400 } = {}) {
  const out = [];
  let cont = null;
  for (let i = 0; i < maxRequests; i++) {
    const params = new URLSearchParams({
      action: "query",
      prop: "revisions",
      titles: title,
      redirects: "1",
      rvprop: "ids|timestamp|content",
      rvslots: "main",
      rvsection: "0",
      rvlimit: "50",
      format: "json",
      formatversion: "2",
      ...cont,
    });
    const res = await politeFetch(`${API}?${params}`);
    if (!res.ok) throw new Error(`revisions HTTP ${res.status} (${title})`);
    const data = await res.json();
    const page = data.query?.pages?.[0];
    if (!page || page.missing || page.invalid) return null;
    for (const r of page.revisions ?? []) {
      out.push({ revid: r.revid, timestamp: r.timestamp, wikitext: r.slots?.main?.content ?? null });
    }
    const last = out[out.length - 1];
    if (!data.continue || (last && last.timestamp < until)) return out;
    cont = data.continue;
    await sleep(delayMs);
  }
  return out;
}
