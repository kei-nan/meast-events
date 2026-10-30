// Shareable URL state via the History API (no router). Pure parse/serialize
// with strict validation: anything malformed is dropped, never trusted.
//
// An open event is the PATH, /event/<id> (eventPath): the build writes that
// page as the app itself with the event's own title and link-preview tags
// (scripts/event-page.mjs), so the address bar and Share both hand out a link
// that previews as the event and opens on the map. Without an event: /.
// Everything else is the query string:
//
//   q, cat (comma list of category ids), c (comma list of countries; both
//   known values only), y=start-end (cut to YEAR_MIN-YEAR_MAX),
//   scope=all|range, area=r:minLon,minLat,maxLon,maxLat | c:lon,lat,radiusKm,
//   about=1 (the "About the data" dialog is open),
//   sort=coverage-asc|date|date-desc (browse list order, lib/browseOrder.js; the
//   default, most covered first, is omitted),
//   view=timeline (the results panel's Timeline view; the default list is omitted)
//
// Older links put the event in the query, /?e=<id>: still read (the path wins
// if both are given), and rewritten to /event/<id> by the next URL write.

import { SORTS } from "./browseOrder.js";
import { CATEGORY_LABELS } from "./categoryLabels.js";
import { COUNTRY_SHAPES } from "./eventCountries.js";
import { MAX_RADIUS_KM, makeCircleArea, makeRectArea } from "./geo.js";
import { MAX_YEAR, MIN_YEAR } from "./years.js";

export const YEAR_MIN = MIN_YEAR;
export const YEAR_MAX = MAX_YEAR;
export const MAX_Q_LENGTH = 100;
const MAX_ITEMS = 20;
const MAX_ITEM_LENGTH = 60;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,119}$/;
const NUM_RE = /^-?\d{1,3}(\.\d{1,12})?$/;
// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\u0000-\u001f\u007f]/;

export function isValidEventId(id) {
  return typeof id === "string" && ID_RE.test(id);
}

/**
 * Search words for an event link that leads nowhere (App's "Search instead"): the id's words, its separators as
 * spaces ("june-2025-strikes" -> "june 2025 strikes"), as long as the search box takes; "" for no id.
 */
export function eventIdQuery(id) {
  if (typeof id !== "string") return "";
  return id.replace(/[-_.~:]+/g, " ").trim().slice(0, MAX_Q_LENGTH).trim();
}

/** The event's URL path; scripts/build-event-pages.mjs writes its page there. */
export const eventPath = (id) => `/event/${encodeURIComponent(id)}`;

const EVENT_PATH_RE = /^\/event\/([^/]+)\/?$/;

/** The event id in a /event/<id> path (a trailing slash allowed), else null. */
export function eventIdFromPath(pathname) {
  const m = EVENT_PATH_RE.exec(pathname ?? "");
  if (!m) return null;
  let id;
  try {
    id = decodeURIComponent(m[1]);
  } catch {
    return null; // malformed %-escape
  }
  return isValidEventId(id) ? id : null;
}

// The values a list parameter may hold, by lower case: the category ids
// (lib/categoryLabels.js) and the `countries` vocabulary of data/events.json
// (lib/eventCountries.js, whose tests check that every country in the data has
// an entry). Matched case-insensitively and written back as the data spells
// them (?cat=War -> war, ?c=uae -> UAE); anything else is dropped, so a link
// can never show a filter chip that matches no event.
const byLowerCase = (values) => new Map(values.map((v) => [v.toLowerCase(), v]));
const KNOWN_CATEGORIES = byLowerCase(Object.keys(CATEGORY_LABELS));
const KNOWN_COUNTRIES = byLowerCase(Object.keys(COUNTRY_SHAPES));

function parseList(raw, known) {
  if (!raw) return [];
  const out = [];
  for (const item of raw.split(",")) {
    const t = item.trim();
    if (!t || t.length > MAX_ITEM_LENGTH || CTRL_RE.test(t)) continue;
    const v = known.get(t.toLowerCase());
    if (!v || out.includes(v)) continue;
    out.push(v);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function nums(str, count) {
  const parts = str.split(",");
  if (parts.length !== count || !parts.every((p) => NUM_RE.test(p))) return null;
  return parts.map(Number);
}

const validLon = (n) => n >= -180 && n <= 180;
const validLat = (n) => n >= -90 && n <= 90;

export function parseArea(raw) {
  if (typeof raw !== "string") return null;
  if (raw.startsWith("r:")) {
    const v = nums(raw.slice(2), 4);
    if (!v) return null;
    const [minLon, minLat, maxLon, maxLat] = v;
    if (![minLon, maxLon].every(validLon) || ![minLat, maxLat].every(validLat)) return null;
    if (minLon >= maxLon || minLat >= maxLat) return null;
    return makeRectArea([minLon, minLat, maxLon, maxLat]);
  }
  if (raw.startsWith("c:")) {
    const parts = raw.slice(2).split(",");
    if (parts.length !== 3 || !parts.every((p) => /^-?\d+(\.\d+)?$/.test(p) && p.length < 24)) return null;
    const [lon, lat, r] = parts.map(Number);
    if (!validLon(lon) || !validLat(lat) || !(r > 0) || r > MAX_RADIUS_KM) return null;
    return makeCircleArea([lon, lat], r);
  }
  return null;
}

const round = (n) => String(Math.round(n * 1e4) / 1e4);

export function areaToParam(area) {
  if (!area) return null;
  if (area.type === "circle") {
    return `c:${round(area.center[0])},${round(area.center[1])},${round(area.radiusKm)}`;
  }
  if (area.type === "rect") return `r:${area.bbox.map(round).join(",")}`;
  return null;
}

// -> {q, categories, countries, years:[s,e]|null, scope, area, eventId, about, sort, view}
export function parseUrlState(search, pathname = "/") {
  const p = new URLSearchParams(search);
  let q = p.get("q") ?? "";
  q = CTRL_RE.test(q) || q.length > MAX_Q_LENGTH ? "" : q;

  let years = null;
  const ym = /^(\d{4})-(\d{4})$/.exec(p.get("y") ?? "");
  if (ym) {
    const [s, e] = [Number(ym[1]), Number(ym[2])];
    // A range reaching outside the timeline is cut to it, at either end: the last
    // year follows the visitor's clock (lib/years.js), so a link made where the
    // year had already turned ends at the last year shown here; one starting
    // before the first year starts there. An inverted range, or one entirely
    // outside the timeline, is dropped.
    if (s <= e && e >= YEAR_MIN && s <= YEAR_MAX) years = [Math.max(s, YEAR_MIN), Math.min(e, YEAR_MAX)];
  }

  const e = p.get("e"); // an older link (see the top of the file)
  return {
    q,
    categories: parseList(p.get("cat"), KNOWN_CATEGORIES),
    countries: parseList(p.get("c"), KNOWN_COUNTRIES),
    years,
    scope: p.get("scope") === "range" ? "range" : "all",
    area: parseArea(p.get("area")),
    eventId: eventIdFromPath(pathname) ?? (isValidEventId(e) ? e : null),
    about: p.get("about") === "1",
    sort: SORTS.includes(p.get("sort")) ? p.get("sort") : "coverage",
    view: p.get("view") === "timeline" ? "timeline" : "list",
  };
}

const enc = (v) => encodeURIComponent(v).replace(/%2C/g, ",").replace(/%3A/g, ":");

// state: {q, categories, countries, startYear, endYear, scope, area, eventId, about, sort, view}
// -> the query string: "" or "?a=b&..." (defaults omitted so the bare URL stays
// clean). The event is not in it: it is the path (stateUrl).
export function serializeUrlState(state) {
  const parts = [];
  const q = (state.q ?? "").trim();
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  const cats = (state.categories ?? []).filter((s) => !s.includes(","));
  if (cats.length) parts.push(`cat=${cats.map((s) => encodeURIComponent(s)).join(",")}`);
  const cs = (state.countries ?? []).filter((s) => !s.includes(","));
  if (cs.length) parts.push(`c=${cs.map((s) => encodeURIComponent(s)).join(",")}`);
  if (
    Number.isInteger(state.startYear) &&
    Number.isInteger(state.endYear) &&
    (state.startYear !== YEAR_MIN || state.endYear !== YEAR_MAX)
  ) {
    parts.push(`y=${state.startYear}-${state.endYear}`);
  }
  if (state.scope === "range") parts.push("scope=range");
  const area = areaToParam(state.area);
  if (area) parts.push(`area=${enc(area)}`);
  if (state.about) parts.push("about=1");
  if (SORTS.includes(state.sort) && state.sort !== "coverage") parts.push(`sort=${state.sort}`);
  if (state.view === "timeline") parts.push("view=timeline");
  return parts.length ? `?${parts.join("&")}` : "";
}

/** The URL (path and query, no origin) for `state`: /event/<id>?... or /?... */
export function stateUrl(state) {
  return `${isValidEventId(state.eventId) ? eventPath(state.eventId) : "/"}${serializeUrlState(state)}`;
}

/** parseUrlState for a URL as stateUrl writes it (path and query). */
export function parseUrl(url) {
  const u = new URL(url, "http://localhost");
  return parseUrlState(u.search, u.pathname);
}

// How useUrlState writes the URL `nextUrl` over `prevUrl` (both path and
// query, as stateUrl gives them): null = nothing to do; "push" = an event was
// opened/closed or the About dialog toggled (a history entry of its own,
// written at once); "replace" = the same change, but overwriting the current
// entry (`replace`: e.g. clearing a link to an event that does not exist, so
// Back does not return to the dead URL); "debounce" = any other change,
// replaced after a pause. An older /?e=<id> link rewritten to /event/<id> is
// "debounce": the same event, so the entry is replaced, not pushed.
// "back" = a push that would return to the entry the current one was pushed
// from (`backUrl`, that entry's URL as it was left; null when the current entry
// was not pushed by this page load: a deep link, the first entry, a reload).
// Closing an event or About is then an undo: useUrlState goes back to that
// entry (and gives it the current view) instead of pushing a copy of it, so the
// browser's Back does not re-open what was just closed.
export function urlWriteMode(prevUrl, nextUrl, { replace = false, backUrl = null } = {}) {
  if (nextUrl === prevUrl) return null;
  const prev = parseUrl(prevUrl);
  const next = parseUrl(nextUrl);
  if (prev.eventId === next.eventId && prev.about === next.about) return "debounce";
  if (replace) return "replace";
  if (typeof backUrl === "string") {
    const back = parseUrl(backUrl);
    if (back.eventId === next.eventId && back.about === next.about) return "back";
  }
  return "push";
}

// An area that survives its own link: what parseArea reads back from
// areaToParam. The URL keeps 4 decimals, so a rectangle thinner than that (a
// sideways-only drag) or a circle of a few metres would be dropped on share or
// reload; the map does not commit such a shape (MapView).
export function areaRoundTrips(area) {
  const param = areaToParam(area);
  return param != null && parseArea(param) != null;
}

// Before a push (an event opened/closed, About toggled): the URL the CURRENT
// entry should have first. A non-event change made just before (typing, a
// filter, the years) is still waiting for its debounced replace, which the push
// cancels; written here, Back returns to the view as it was left, not as it
// was 400 ms earlier. null when the current entry is already up to date.
// `prevUrl` is the current entry's URL, `state` the new state (as for stateUrl).
export function entryBeforePush(prevUrl, state) {
  const prev = parseUrl(prevUrl);
  const carried = stateUrl({ ...state, eventId: prev.eventId, about: prev.about });
  return carried === prevUrl ? null : carried;
}

// The link a Share button hands out for `state`: the view as it is now, built
// from the state rather than window.location, since URL writes are debounced
// (hooks/useUrlState.js) and the address bar can lag the view by 400 ms - Play
// moves the years every 350 ms. An open event's link is its own page,
// /event/<id>, so it previews as the event and opens on the map.
export function shareLink(origin, state) {
  return `${origin}${stateUrl(state)}`;
}

// The page's canonical path for `state`, as a fresh load of its URL has it in
// <link rel="canonical"> and og:url: /event/<id> for an open event (the view's
// other state left out), else /. Kept current by App.jsx: some share menus
// (Chrome on Android) send the canonical link, not the address bar.
export function canonicalPath(state) {
  return isValidEventId(state.eventId) ? eventPath(state.eventId) : "/";
}
