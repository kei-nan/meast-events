// The Wikipedia guideline sections the framing review's wording check cites (data/framing-review.json
// `guidelines`, docs/framing-review.md). Each guideline records the revision the reviews applied
// (`reviewed_revision`) and a fingerprint of that section's text, so a later edit of the section on
// Wikipedia can be found and shown (scripts/refresh-guidelines.js). Read-only: nothing here writes to Wikipedia.
import { createHash } from "node:crypto";
import { politeFetch } from "./http.js";

const API = "https://en.wikipedia.org/w/api.php";

/** "https://en.wikipedia.org/wiki/Wikipedia:Neutral_point_of_view#Explanation" -> { page, anchor } */
export function parseGuidelineUrl(url) {
  const u = new URL(url);
  const m = u.pathname.match(/^\/wiki\/(.+)$/);
  if (u.hostname !== "en.wikipedia.org" || !m || !u.hash) throw new Error(`not an English Wikipedia section link: ${url}`);
  return { page: decodeURIComponent(m[1]).replace(/_/g, " "), anchor: decodeURIComponent(u.hash.slice(1)) };
}

/** Link to the section as it read in one revision. */
export function permalink(url, revid) {
  const { page, anchor } = parseGuidelineUrl(url);
  return `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(page.replace(/ /g, "_"))}&oldid=${revid}#${encodeURIComponent(anchor)}`;
}

/** A section's own text: its heading and body, without its subsections. */
export function ownSection(wikitext) {
  const lines = wikitext.replace(/\r\n?/g, "\n").split("\n");
  const level = lines[0].match(/^(=+)/)?.[1].length ?? 0;
  const end = lines.findIndex((l, i) => i > 0 && /^(=+).*\1\s*$/.test(l) && l.match(/^(=+)/)[1].length > level);
  return (end === -1 ? lines : lines.slice(0, end)).join("\n").trim();
}

/** 12 hex characters of SHA-1 over the section's own text, whitespace runs collapsed (same length as text_sha1). */
export function sectionHash(text) {
  return createHash("sha1").update(text.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 12);
}

/** Lines removed and added between two versions of a section (order-insensitive, like the lead diff). */
export function diffLines(oldText, newText) {
  const split = (t) => (t ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const a = split(oldText);
  const b = split(newText);
  const A = new Set(a);
  const B = new Set(b);
  return { removed: a.filter((l) => !B.has(l)), added: b.filter((l) => !A.has(l)) };
}

/**
 * The part of a long line that changed, with `context` characters around it on each side, so an edit inside a
 * long paragraph is readable: { before, after } with "…" where text was cut.
 */
export function changedSpan(oldLine, newLine, context = 80) {
  let p = 0;
  while (p < oldLine.length && p < newLine.length && oldLine[p] === newLine[p]) p++;
  let s = 0;
  while (s < oldLine.length - p && s < newLine.length - p && oldLine.at(-1 - s) === newLine.at(-1 - s)) s++;
  const from = Math.max(0, p - context);
  const cut = (line) => {
    const to = Math.min(line.length, line.length - s + context);
    return (from > 0 ? "…" : "") + line.slice(from, to) + (to < line.length ? "…" : "");
  };
  return { before: cut(oldLine), after: cut(newLine) };
}

async function api(params) {
  const res = await politeFetch(`${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`);
  if (!res.ok) throw new Error(`Wikipedia API: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Wikipedia API: ${data.error.code} ${data.error.info}`);
  return data;
}

/** The page's latest revision, or the last one at or before `at` (ISO timestamp). */
export async function fetchRevision(page, at = null) {
  const data = await api({
    action: "query", prop: "revisions", titles: page, rvlimit: "1", rvprop: "ids|timestamp",
    ...(at ? { rvstart: at, rvdir: "older" } : {}),
  });
  const rev = data.query?.pages?.[0]?.revisions?.[0];
  if (!rev) throw new Error(`no revision of "${page}"${at ? ` at or before ${at}` : ""}`);
  return { revid: rev.revid, timestamp: rev.timestamp };
}

/** The own text of the section with this anchor in one revision, or null if that revision has no such section. */
export async function fetchSection(revid, anchor) {
  const parsed = await api({ action: "parse", oldid: String(revid), prop: "sections" });
  const sec = parsed.parse.sections.find((s) => s.anchor === anchor.replace(/ /g, "_"));
  if (!sec) return null;
  const data = await api({
    action: "query", prop: "revisions", revids: String(revid), rvslots: "main", rvprop: "content", rvsection: String(sec.index),
  });
  const text = data.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  if (typeof text !== "string") throw new Error(`no text for section "${anchor}" of revision ${revid}`);
  return ownSection(text);
}
