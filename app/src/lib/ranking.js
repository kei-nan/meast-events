// Text normalisation, static-search matching and result ranking. Pure.
//
// Local (title + summary) matching, used for instant results and when the
// full-text index cannot be loaded: the query is split
// into tokens (case- and diacritic-insensitive); every token must occur as a
// whole word in title+aliases+extract, except the LAST token which is
// prefix-matched when it has >= 2 characters. `aliases` are the item's English
// Wikidata aliases (scripts/split-data.mjs), so "July War" finds the 2006
// Lebanon War; the title shown is still Wikipedia's.

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
// The fields the words came from are stored with them and compared by identity
// (no text is rebuilt on a hit), so an event that later gains its extract, or
// gets a new title, aliases array or snippet, is tokenised again. (Records are
// replaced, not edited in place: an aliases array changed in place would keep
// its old words.)
const wordCache = new WeakMap(); // event -> { title, aliases, body, words }
const aliasesOf = (event) => (Array.isArray(event.aliases) ? event.aliases : []);

function eventWords(event) {
  const body = event.extract ?? event.snippet ?? "";
  const hit = wordCache.get(event);
  if (hit && hit.title === event.title && hit.aliases === event.aliases && hit.body === body) return hit.words;
  const words = tokenize(`${event.title ?? ""} ${aliasesOf(event).join(" ")} ${body}`);
  wordCache.set(event, { title: event.title, aliases: event.aliases, body, words });
  return words;
}

/** Tokenises the events' searchable text ahead of the first keystroke (warms the cache). */
export function warmWords(events) {
  for (const e of events) eventWords(e);
}

export function matchesTokens(event, tokens) {
  if (tokens.length === 0) return true;
  const words = eventWords(event);
  return tokens.every((t, i) => tokenMatches(t, i === tokens.length - 1, words));
}

// `tokens` (tokenize(q)) may be passed so a search over many events tokenises
// the query once, not once per event.
export function matchesFilters(event, { q = "", tokens = null, area = null, categories = [], countries = [] } = {}) {
  const coords = eventCoords(event);
  // Coordinate-less events (location_quality "none") match text/category/country
  // but can never be inside a drawn area.
  if (area && !coords) return false;
  if (!matchesTokens(event, tokens ?? tokenize(q))) return false;
  if (categories.length && !categories.includes(event.category)) return false;
  if (countries.length && !(event.countries ?? []).some((c) => countries.includes(c))) return false;
  if (area) {
    // Approximate (capital-pin) locations are excluded from drawn-area searches.
    if (event.location_quality === "approximate" || event.location_quality === "none") return false;
    if (!inArea(coords, area)) return false;
  }
  return true;
}

// How a name (the title or one alias) matches the query: 0 exact, 1 prefix,
// 2 contains (the text, or every token as a word), 3 not.
function nameTier(name, qNorm, tokens) {
  const norm = normalizeText(name).trim();
  const phrase = tokens.join(" ");
  const nameTokens = tokenize(name).join(" ");
  if (norm === qNorm || nameTokens === phrase) return 0;
  if (norm.startsWith(qNorm) || nameTokens.startsWith(phrase)) return 1;
  if (norm.includes(qNorm) || matchesTokens({ title: name, extract: "" }, tokens)) return 2;
  return 3;
}

function bestAlias(event, qNorm, tokens) {
  let best = null;
  for (const alias of aliasesOf(event)) {
    const t = nameTier(alias, qNorm, tokens);
    if (t < 3 && (!best || t < best.tier)) best = { alias, tier: t };
  }
  return best;
}

// Title exact > alias exact > title prefix > alias prefix > title contains >
// alias contains > the rest. An alias never outranks the same kind of title
// match.
function tier(event, qNorm, tokens) {
  const t = nameTier(event.title, qNorm, tokens);
  const a = bestAlias(event, qNorm, tokens)?.tier ?? 3;
  return Math.min(t * 2, a * 2 + 1);
}

// The alias the query matched, for a result whose title it does not match
// (shown as "matched: …"); null otherwise.
export function matchedAlias(event, q) {
  const tokens = tokenize(q);
  if (!tokens.length || !aliasesOf(event).length) return null;
  const qNorm = normalizeText(q).trim();
  if (nameTier(event.title, qNorm, tokens) < 3) return null;
  return bestAlias(event, qNorm, tokens)?.alias ?? null;
}

function isChronological(events) {
  for (let i = 1; i < events.length; i++) {
    if ((events[i - 1].date_start ?? "") > (events[i].date_start ?? "")) return false;
  }
  return true;
}

// With a query: exact title > title prefix > title contains > everything else
// (in the full-text index's order), each title tier followed by the same tier
// of alias matches (see tier). Without: chronological by start date. Stable.
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
