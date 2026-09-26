// Text normalisation, static-search matching and result ranking. Pure.
//
// Static (offline) matching mirrors the API's semantics: the query is split
// into tokens (case- and diacritic-insensitive); every token must occur as a
// whole word in title+extract, except the LAST token which is prefix-matched
// when it has >= 2 characters.

import { eventCoords, inArea } from "./geo.js";

export const MIN_QUERY_LENGTH = 2;

const EXTRA_FOLD = { "ß": "ss", "ø": "o", "ł": "l", "đ": "d", "æ": "ae", "œ": "oe", "ı": "i" };

export function normalizeText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ßøłđæœı]/g, (ch) => EXTRA_FOLD[ch]);
}

export function tokenize(s) {
  return normalizeText(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function tokenMatches(token, isLast, words) {
  const prefix = isLast && token.length >= 2;
  for (const w of words) {
    if (w === token || (prefix && w.startsWith(token))) return true;
  }
  return false;
}

export function matchesTokens(event, tokens) {
  if (tokens.length === 0) return true;
  const words = tokenize(`${event.title ?? ""} ${event.extract ?? event.snippet ?? ""}`);
  return tokens.every((t, i) => tokenMatches(t, i === tokens.length - 1, words));
}

export function matchesFilters(event, { q = "", area = null, categories = [], countries = [] } = {}) {
  const coords = eventCoords(event);
  if (!coords) return false;
  if (!matchesTokens(event, tokenize(q))) return false;
  if (categories.length && !categories.includes(event.category)) return false;
  if (countries.length && !(event.countries ?? []).some((c) => countries.includes(c))) return false;
  if (area) {
    // Approximate (capital-pin) locations are excluded from drawn-area searches.
    if (event.location_quality === "approximate") return false;
    if (!inArea(coords, area)) return false;
  }
  return true;
}

function tier(event, qNorm, tokens) {
  const title = normalizeText(event.title).trim();
  const phrase = tokens.join(" ");
  const titleTokens = tokenize(event.title).join(" ");
  if (title === qNorm || titleTokens === phrase) return 0;
  if (title.startsWith(qNorm) || titleTokens.startsWith(phrase)) return 1;
  if (title.includes(qNorm) || matchesTokens({ title: event.title, extract: "" }, tokens)) return 2;
  return 3;
}

// With a query: exact title > title prefix > title contains > everything else
// (in the server's order). Without: chronological by start date. Stable.
export function rankEvents(events, q = "") {
  const tokens = tokenize(q);
  const indexed = events.map((event, i) => ({ event, i }));
  if (tokens.length === 0) {
    indexed.sort((a, b) => {
      const da = a.event.date_start ?? "";
      const db = b.event.date_start ?? "";
      return da < db ? -1 : da > db ? 1 : a.i - b.i;
    });
  } else {
    const qNorm = normalizeText(q).trim();
    const tiers = new Map(indexed.map(({ event }) => [event, tier(event, qNorm, tokens)]));
    indexed.sort((a, b) => tiers.get(a.event) - tiers.get(b.event) || a.i - b.i);
  }
  return indexed.map((x) => x.event);
}
