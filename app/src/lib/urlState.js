// Shareable URL state via the History API (no router). Pure parse/serialize
// with strict validation: anything malformed is dropped, never trusted.
//
//   q, cat (comma list), c (comma list of countries), y=start-end,
//   scope=all|range, area=r:minLon,minLat,maxLon,maxLat | c:lon,lat,radiusKm,
//   e=<event id>, about=1 (the "About the data" dialog is open)

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

function parseList(raw) {
  if (!raw) return [];
  const out = [];
  for (const item of raw.split(",")) {
    const t = item.trim();
    if (!t || t.length > MAX_ITEM_LENGTH || CTRL_RE.test(t) || out.includes(t)) continue;
    out.push(t);
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

// -> {q, categories, countries, years:[s,e]|null, scope, area, eventId}
export function parseUrlState(search) {
  const p = new URLSearchParams(search);
  let q = p.get("q") ?? "";
  q = CTRL_RE.test(q) || q.length > MAX_Q_LENGTH ? "" : q;

  let years = null;
  const ym = /^(\d{4})-(\d{4})$/.exec(p.get("y") ?? "");
  if (ym) {
    const s = Number(ym[1]);
    const e = Number(ym[2]);
    if (s >= YEAR_MIN && e <= YEAR_MAX && s <= e) years = [s, e];
  }

  const e = p.get("e");
  return {
    q,
    categories: parseList(p.get("cat")),
    countries: parseList(p.get("c")),
    years,
    scope: p.get("scope") === "range" ? "range" : "all",
    area: parseArea(p.get("area")),
    eventId: isValidEventId(e) ? e : null,
    about: p.get("about") === "1",
  };
}

const enc = (v) => encodeURIComponent(v).replace(/%2C/g, ",").replace(/%3A/g, ":");

// state: {q, categories, countries, startYear, endYear, scope, area, eventId}
// -> "" or "?a=b&..." (defaults omitted so the bare URL stays clean).
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
  if (isValidEventId(state.eventId)) parts.push(`e=${encodeURIComponent(state.eventId)}`);
  if (state.about) parts.push("about=1");
  return parts.length ? `?${parts.join("&")}` : "";
}

// How useUrlState writes `nextSearch` over `prevSearch`: null = nothing to do;
// "push" = an event was opened/closed or the About dialog toggled (a history
// entry of its own, written at once); "replace" = the same change, but
// overwriting the current entry (`replace`: e.g. clearing a link to an event
// that does not exist, so Back does not return to the dead URL); "debounce" =
// any other change, replaced after a pause.
export function urlWriteMode(prevSearch, nextSearch, { replace = false } = {}) {
  if (nextSearch === prevSearch) return null;
  const prev = parseUrlState(prevSearch);
  const next = parseUrlState(nextSearch);
  if (prev.eventId === next.eventId && prev.about === next.about) return "debounce";
  return replace ? "replace" : "push";
}
