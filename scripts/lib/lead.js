// Full lead section of an English Wikipedia article as plain text.
//
// Source: MediaWiki API action=query&prop=extracts&exintro=1&explaintext=1&redirects=1
// (TextExtracts). "exintro" = everything before the first heading, i.e. the whole lead,
// not only the first paragraph. The text is Wikipedia's own; the ONLY change we make is
// whitespace normalisation (see normalizeLead). Never edited, summarised or reworded.
import { politeFetch, sleep } from "./http.js";

const API = "https://en.wikipedia.org/w/api.php";
export const LEAD_BATCH = 20; // TextExtracts hard limit with exintro (exlimit max 20)

// Whitespace normalisation only: CRLF -> LF, no-break/other Unicode spaces -> plain space,
// runs of spaces/tabs collapsed, lines trimmed, paragraphs (one or more line breaks in the
// API output) joined with exactly one blank line. No characters other than whitespace change.
export function normalizeLead(text) {
  if (typeof text !== "string") return null;
  const paras = text
    .replace(/\r\n?/g, "\n")
    .replace(/[   -   　]/g, " ")
    .split(/\n+/)
    .map((l) => l.replace(/[ \t\f\v]+/g, " ").trim())
    .filter(Boolean);
  const out = paras.join("\n\n");
  return out || null;
}

export function titleFromWikipediaUrl(url) {
  if (!url) return null;
  const slug = url.split("/wiki/")[1];
  if (!slug) return null;
  try {
    return decodeURIComponent(slug.split("#")[0]).replace(/_/g, " ");
  } catch {
    return null;
  }
}

// Fetches leads for many titles. `cache` (see cache.js) is consulted/updated per requested
// title, so an interrupted run resumes. Returns Map(requestedTitle -> record|null).
// record: { title (canonical, after redirects), extract, wikibase_item, pageid, lastrevid,
//           url, redirected_from|null, retrieved_at }
export async function fetchLeads(titles, { cache = null, delayMs = 400, log = () => {} } = {}) {
  const wanted = [...new Set(titles.filter(Boolean))];
  const result = new Map();
  const todo = [];
  for (const t of wanted) {
    if (cache?.has(t)) result.set(t, cache.get(t));
    else todo.push(t);
  }
  for (let i = 0; i < todo.length; i += LEAD_BATCH) {
    const chunk = todo.slice(i, i + LEAD_BATCH);
    const url =
      `${API}?action=query&prop=extracts|pageprops|info&exintro=1&explaintext=1&exlimit=max` +
      `&ppprop=wikibase_item&inprop=url&redirects=1&format=json&formatversion=2&titles=` +
      encodeURIComponent(chunk.join("|"));
    const res = await politeFetch(url);
    if (!res.ok) throw new Error(`lead fetch HTTP ${res.status}`);
    const data = await res.json();
    const q = data.query ?? {};
    const norm = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
    const redir = new Map((q.redirects ?? []).map((r) => [r.from, r.to]));
    const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const t of chunk) {
      const n = norm.get(t) ?? t;
      const r = redir.get(n) ?? n;
      const p = pages.get(r);
      let rec = null;
      if (p && !p.missing && !p.invalid) {
        rec = {
          title: p.title,
          extract: normalizeLead(p.extract),
          wikibase_item: p.pageprops?.wikibase_item ?? null,
          pageid: p.pageid,
          lastrevid: p.lastrevid ?? null,
          url: p.canonicalurl ?? p.fullurl ?? null,
          redirected_from: r !== n ? n : null,
          retrieved_at: new Date().toISOString(),
        };
      }
      result.set(t, rec);
      cache?.set(t, rec);
    }
    cache?.flush();
    log(`leads ${Math.min(i + LEAD_BATCH, todo.length)}/${todo.length}`);
    if (i + LEAD_BATCH < todo.length) await sleep(delayMs);
  }
  return result;
}
