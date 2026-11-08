// Full lead section of an English Wikipedia article as plain text.
//
// Source: MediaWiki API action=query&prop=extracts&exintro=1&explaintext=1&redirects=1
// (TextExtracts). "exintro" = everything before the first heading, i.e. the whole lead,
// not only the first paragraph. The text is Wikipedia's own; the ONLY changes we make are
// whitespace normalisation and dropping empty "()" left by stripped markup (see normalizeLead).
// Never edited, summarised or reworded.
import { sleep, mediaWikiFetch } from "./http.js";

const API = "https://en.wikipedia.org/w/api.php";
export const LEAD_BATCH = 20; // TextExtracts hard limit with exintro (exlimit max 20)

// Whitespace normalisation: CRLF -> LF, no-break/other Unicode spaces -> plain space,
// runs of spaces/tabs collapsed, lines trimmed, paragraphs (one or more line breaks in the
// API output) joined with exactly one blank line. The one other change: an EMPTY pair of
// parentheses "()" (only whitespace inside), with the spaces before it, is dropped. TextExtracts
// leaves one where it strips everything a pair of brackets held (e.g. a pronunciation template):
// "The Sykes–Picot Agreement () was a 1916 secret treaty" (docs/data-fixes.md, checks of
// 2026-10-29). Parentheses with any other character inside are kept. Nothing else changes.
export function normalizeLead(text) {
  if (typeof text !== "string") return null;
  const paras = text
    .replace(/\r\n?/g, "\n")
    .replace(/[   -   　]/g, " ")
    .split(/\n+/)
    .map((l) => l.replace(/[ \t\f\v]*\([ \t\f\v]*\)/g, "").replace(/[ \t\f\v]+/g, " ").trim())
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

// One batch query, following the API's `continue` until it is complete. TextExtracts returns
// extracts only up to a size limit per response and hands back `continue: { excontinue, ... }`
// for the rest; without following it, the later pages of a batch would come back with no
// extract at all. Each continued response repeats `normalized`/`redirects`; the page records
// are merged by title (a field from a later part fills one that is still missing).
//
// Revision check: `lastrevid` (and the revision timestamp) come with the first part, but a page's extract may only
// come in a later one. Were the article edited in between, the stored revid would not be the revision of the stored
// text. So for every page whose extract came in a later part than its lastrevid (or whose lastrevid changed between
// parts), the latest revision is asked for again once all parts are in (latestRevids). Revision ids only grow, so
// the same lastrevid before and after means the page did not change while its lead was fetched. A page that did
// change is fetched again (up to `retries` times); if it keeps changing the fetch throws (nothing is cached).
export async function queryAllParts(titles, { maxParts = 50, retries = 2 } = {}) {
  const base = {
    action: "query",
    // revisions (latest only, ids|timestamp): the date of the revision the lead comes from (lib/revid.js)
    prop: "extracts|pageprops|info|revisions",
    rvprop: "ids|timestamp",
    exintro: "1",
    explaintext: "1",
    exlimit: "max",
    ppprop: "wikibase_item",
    inprop: "url",
    redirects: "1",
    format: "json",
    formatversion: "2",
    titles: titles.join("|"),
  };
  const normalized = new Map();
  const redirects = new Map();
  const pages = new Map();
  const revPart = new Map(); // title -> the part its lastrevid came in
  const extractPart = new Map(); // title -> the part its extract came in
  const changed = new Set(); // titles whose lastrevid differed between two parts
  let cont = null;
  for (let part = 0; part < maxParts; part++) {
    // An API error (HTTP 200 with an `error` body) throws once its retries (if transient) are spent: never read as
    // "every title missing" and cached as null.
    const data = await mediaWikiFetch(`${API}?${new URLSearchParams({ ...base, ...cont })}`, "lead fetch");
    const q = data.query ?? {};
    for (const n of q.normalized ?? []) normalized.set(n.from, n);
    for (const r of q.redirects ?? []) redirects.set(r.from, r);
    for (const p of q.pages ?? []) {
      const prev = pages.get(p.title);
      if (p.lastrevid !== undefined) {
        if (!revPart.has(p.title)) revPart.set(p.title, part);
        else if (prev && prev.lastrevid !== p.lastrevid) changed.add(p.title);
      }
      if (p.extract !== undefined && !extractPart.has(p.title)) extractPart.set(p.title, part);
      if (!prev) pages.set(p.title, { ...p });
      else for (const [k, v] of Object.entries(p)) if (prev[k] === undefined) prev[k] = v;
    }
    if (!data.continue) {
      const split = [...pages.keys()].filter(
        (t) => !changed.has(t) && extractPart.has(t) && revPart.has(t) && extractPart.get(t) !== revPart.get(t)
      );
      const current = split.length ? await latestRevids(split) : new Map();
      const stale = [...changed, ...split.filter((t) => current.get(t) !== pages.get(t).lastrevid)];
      if (stale.length) {
        if (retries <= 0) {
          throw new Error(
            `lead fetch: ${stale.join(", ")} changed while the lead was being fetched (the revision id no longer matches the text); re-run`
          );
        }
        // Fetched again by canonical title: the redirects/normalisation already recorded above still apply.
        const again = await queryAllParts(stale, { maxParts, retries: retries - 1 });
        for (const p of again.pages) pages.set(p.title, p);
      }
      return { normalized: [...normalized.values()], redirects: [...redirects.values()], pages: [...pages.values()] };
    }
    cont = data.continue;
  }
  throw new Error(`lead fetch: still continuing after ${maxParts} parts (${titles.length} titles)`);
}

// The current lastrevid of each (canonical) title: Map(title -> lastrevid). At most LEAD_BATCH titles (one batch).
async function latestRevids(titles) {
  const params = { action: "query", prop: "info", format: "json", formatversion: "2", titles: titles.join("|") };
  const data = await mediaWikiFetch(`${API}?${new URLSearchParams(params)}`, "lead revision check");
  return new Map((data.query?.pages ?? []).map((p) => [p.title, p.lastrevid]));
}

/** The timestamp of a page record's latest revision, only when it is the revision `lastrevid` names. */
export function revisionTimestamp(page) {
  const r = page?.revisions?.[0];
  return r && r.revid === page.lastrevid && typeof r.timestamp === "string" ? r.timestamp : null;
}

// Fetches leads for many titles. `cache` (see cache.js) is consulted/updated per requested
// title, so an interrupted run resumes. Returns Map(requestedTitle -> record|null).
// record: { title (canonical, after redirects), extract, wikibase_item, pageid, lastrevid,
//           url, redirected_from|null, redirect_fragment|null (redirect to a section), retrieved_at }
// A missing or invalid page (null) is NOT cached, and a null already in a cache written by an earlier version is
// treated as not cached: a page missing once (deleted, moved, a transient API answer) would otherwise read as missing
// on every later run, and the pipeline would keep falling back to the REST summary's extract (lib/v21.js) for good.
// Asking again costs one batch request for the few such titles.
export async function fetchLeads(titles, { cache = null, delayMs = 400, log = () => {} } = {}) {
  const wanted = [...new Set(titles.filter(Boolean))];
  const result = new Map();
  const todo = [];
  for (const t of wanted) {
    const hit = cache?.has(t) ? cache.get(t) : null;
    if (hit) result.set(t, hit);
    else todo.push(t);
  }
  for (let i = 0; i < todo.length; i += LEAD_BATCH) {
    const chunk = todo.slice(i, i + LEAD_BATCH);
    const q = await queryAllParts(chunk);
    const norm = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
    const redir = new Map((q.redirects ?? []).map((r) => [r.from, r.to]));
    const redirFragment = new Map((q.redirects ?? []).filter((r) => r.tofragment).map((r) => [r.from, r.tofragment]));
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
          // when the latest revision (the one lastrevid names) was saved; null if the API did not say
          lastrev_timestamp: revisionTimestamp(p),
          url: p.canonicalurl ?? p.fullurl ?? null,
          redirected_from: r !== n ? n : null,
          redirect_fragment: r !== n ? redirFragment.get(n) ?? null : null,
          retrieved_at: new Date().toISOString(),
        };
      }
      result.set(t, rec);
      if (rec) cache?.set(t, rec);
    }
    cache?.flush();
    log(`leads ${Math.min(i + LEAD_BATCH, todo.length)}/${todo.length}`);
    if (i + LEAD_BATCH < todo.length) await sleep(delayMs);
  }
  return result;
}
