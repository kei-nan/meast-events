// Text normalisation, static-search matching and result ranking. Pure.
//
// Local (title + summary) matching, used for instant results and when the
// full-text index cannot be loaded: the query is split
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

// Words of an event's searchable text, cached per event object: every keystroke
// matches all events, and tokenising them again each time was most of its cost.
// The text is stored with its words, so an event that later gains its extract
// is tokenised again.
const wordCache = new WeakMap(); // event -> { text, words }
function eventWords(event) {
  const text = `${event.title ?? ""} ${event.extract ?? event.snippet ?? ""}`;
  const hit = wordCache.get(event);
  if (hit && hit.text === text) return hit.words;
  const words = tokenize(text);
  wordCache.set(event, { text, words });
  return words;
}

export function matchesTokens(event, tokens) {
  if (tokens.length === 0) return true;
  const words = eventWords(event);
  return tokens.every((t, i) => tokenMatches(t, i === tokens.length - 1, words));
}

export function matchesFilters(event, { q = "", area = null, categories = [], countries = [] } = {}) {
  const coords = eventCoords(event);
  // Coordinate-less events (location_quality "none") match text/category/country
  // but can never be inside a drawn area.
  if (area && !coords) return false;
  if (!matchesTokens(event, tokenize(q))) return false;
  if (categories.length && !categories.includes(event.category)) return false;
  if (countries.length && !(event.countries ?? []).some((c) => countries.includes(c))) return false;
  if (area) {
    // Approximate (capital-pin) locations are excluded from drawn-area searches.
    if (event.location_quality === "approximate" || event.location_quality === "none") return false;
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

function isChronological(events) {
  for (let i = 1; i < events.length; i++) {
    if ((events[i - 1].date_start ?? "") > (events[i].date_start ?? "")) return false;
  }
  return true;
}

// With a query: exact title > title prefix > title contains > everything else
// (in the server's order). Without: chronological by start date. Stable.
export function rankEvents(events, q = "") {
  const tokens = tokenize(q);
  // Chronological input (the app keeps its store in this order, so every
  // range's list is already sorted) is returned as-is: one O(n) check instead
  // of an O(n log n) sort on every timeline step. Same result: a stable sort of
  // sorted input is the identity.
  if (tokens.length === 0 && isChronological(events)) return events.slice();
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
