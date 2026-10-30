// A border's note and source (data/boundaries.json), split for reading as
// short lists: the words are the data's own, only broken into items. Pure;
// used by the border popup, the Borders list (MapUi.jsx) and PlaceHistory.jsx.

// Words a sentence-ending "." follows only as an abbreviation.
const ABBREVIATIONS = new Set([
  ...["al", "e.g", "i.e", "cf", "c", "ca", "approx", "no", "nos", "vol", "st", "mt", "u.s", "u.k", "u.n"],
  ...["para", "paras", "p", "pp", "art", "arts"], // "(paras. 78, 102)", as the ICJ notes cite
]);

/**
 * A note as its sentences, in order. A sentence ends at ".", "!" or "?" (with
 * any closing quote or bracket) followed by a space and a capital, a digit or
 * an opening quote/bracket; not after an abbreviation or a single initial.
 */
export function noteSentences(note) {
  const text = String(note ?? "").trim();
  if (!text) return [];
  const out = [];
  let start = 0;
  const re = /[.!?]["'”’)\]]*\s+(?=["'“‘([]?[A-Z0-9])/g;
  for (let m; (m = re.exec(text)); ) {
    const before = text.slice(start, m.index);
    const word = before.match(/([A-Za-z.]+)$/)?.[1] ?? "";
    if (text[m.index] === "." && (ABBREVIATIONS.has(word.toLowerCase()) || /^[A-Z]$/.test(word))) continue;
    const end = m.index + m[0].trimEnd().length;
    out.push(text.slice(start, end));
    start = m.index + m[0].length;
  }
  out.push(text.slice(start));
  return out.filter((s) => s.trim());
}

/** A source as its items: split at each ";" outside brackets. */
export function sourceItems(source) {
  const text = String(source ?? "").trim();
  if (!text) return [];
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** A short readable name for a source link (the link itself is unchanged). */
export function linkLabel(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const host = url.hostname.replace(/^www\./, "");
  const wiki = host.match(/^([a-z-]+)\.wikipedia\.org$/);
  if (wiki && url.pathname.startsWith("/wiki/")) {
    const title = decodeURIComponent(url.pathname.slice(6)).replace(/_/g, " ");
    return `Wikipedia: ${title}`;
  }
  if (host === "documents.un.org" && url.searchParams.get("s")) return `UN document ${url.searchParams.get("s")}`;
  const file = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  return file ? `${host} (${file})` : host;
}

/**
 * An item as text and links, in order: [{text}|{href, label}]. Only http(s)
 * URLs become links; a trailing "." or "," stays text.
 */
export function itemParts(item) {
  const parts = [];
  const re = /https?:\/\/[^\s]+/g;
  let last = 0;
  for (let m; (m = re.exec(item)); ) {
    let href = m[0];
    const trail = href.match(/[.,]+$/)?.[0] ?? "";
    if (trail) href = href.slice(0, -trail.length);
    if (m.index > last) parts.push({ text: item.slice(last, m.index) });
    parts.push({ href, label: linkLabel(href) });
    last = m.index + href.length;
  }
  if (last < item.length) parts.push({ text: item.slice(last) });
  return parts;
}
