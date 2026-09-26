// Pure request-validation / query-building / response-shaping logic. No
// cloudflare:sockets import, so it is unit-testable in plain Node.
//
// The block between BEGIN/END SHARED LOGIC is duplicated verbatim (minus the
// `export ` keywords) in server/index.js; worker/test/parity.test.js fails if
// the two copies drift apart. Edit both together.

// BEGIN SHARED LOGIC
const MIN_YEAR = 1000;
const MAX_YEAR = 3000;
const MAX_Q_LENGTH = 100;
const MAX_LIMIT = 1000;
const MAX_OFFSET = 10000;
const MAX_LIST_ITEMS = 20;
const MAX_LIST_ITEM_LENGTH = 80;
const SNIPPET_LENGTH = 160;

// Invalid client input -> HTTP 400 with this (safe to show) message.
export class ClientError extends Error {}

// --- validation -----------------------------------------------------------

// Absent/empty -> undefined; otherwise must be an integer in [MIN_YEAR, MAX_YEAR].
export function parseYear(name, value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!/^-?\d{1,6}$/.test(value)) throw new ClientError(`${name} must be an integer year`);
  const n = Number(value);
  if (n < MIN_YEAR || n > MAX_YEAR) {
    throw new ClientError(`${name} must be between ${MIN_YEAR} and ${MAX_YEAR}`);
  }
  return n;
}

// "minLon,minLat,maxLon,maxLat". Latitude must be within [-90,90]. Longitude
// is clamped into [-180,180] rather than rejected: MapLibre's getBounds()
// legitimately reports lon beyond +/-180 when the world is zoomed out enough
// to show repeated copies, and the frontend sends those bounds verbatim.
// (Wildly out-of-range values, |lon| > 720, are still rejected as garbage.)
export function parseBbox(bbox) {
  if (bbox === undefined || bbox === null || bbox === "") return null;
  const raw = bbox.split(",");
  const parts = raw.map((s) => (s.trim() === "" ? NaN : Number(s)));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new ClientError("bbox must be minLon,minLat,maxLon,maxLat (numbers)");
  }
  let [minLon, minLat, maxLon, maxLat] = parts;
  if (Math.abs(minLon) > 720 || Math.abs(maxLon) > 720) {
    throw new ClientError("bbox longitude must be within [-180,180]");
  }
  if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
    throw new ClientError("bbox latitude must be within [-90,90]");
  }
  if (minLon > maxLon || minLat > maxLat) {
    throw new ClientError("bbox min must not exceed max");
  }
  minLon = Math.max(-180, Math.min(180, minLon));
  maxLon = Math.max(-180, Math.min(180, maxLon));
  return [minLon, minLat, maxLon, maxLat];
}

export function parseQ(q) {
  if (q === undefined || q === null) return undefined;
  const t = q.trim();
  if (t.length > MAX_Q_LENGTH) throw new ClientError(`q must be at most ${MAX_Q_LENGTH} characters`);
  return t || undefined;
}

// Absent/empty -> []; otherwise a de-duplicated comma list of non-empty items.
export function parseList(name, value) {
  if (value === undefined || value === null) return [];
  const items = [];
  for (const part of value.split(",")) {
    const t = part.replace(/[\x00-\x1f\x7f]/g, "").trim();
    if (!t) continue;
    if (t.length > MAX_LIST_ITEM_LENGTH) {
      throw new ClientError(`${name} items must be at most ${MAX_LIST_ITEM_LENGTH} characters`);
    }
    if (!items.includes(t)) items.push(t);
  }
  if (items.length > MAX_LIST_ITEMS) {
    throw new ClientError(`${name} accepts at most ${MAX_LIST_ITEMS} values`);
  }
  return items;
}

// Absent/empty -> fallback; otherwise an integer in [min, max].
export function parseIntParam(name, value, { min, max, fallback }) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!/^\d{1,9}$/.test(value)) throw new ClientError(`${name} must be a non-negative integer`);
  const n = Number(value);
  if (n < min || n > max) throw new ClientError(`${name} must be between ${min} and ${max}`);
  return n;
}

export function parseFlag(name, value) {
  if (value === undefined || value === null || value === "" || value === "0") return false;
  if (value === "1") return true;
  throw new ClientError(`${name} must be 1 or 0`);
}

export function parseEnum(name, value, allowed) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!allowed.includes(value)) throw new ClientError(`${name} must be one of ${allowed.join(", ")}`);
  return value;
}

// --- query building -------------------------------------------------------

// Escapes RediSearch query-syntax characters in a raw user search term.
export function escapeRediSearchTerm(text) {
  return text.replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|\\/]/g, "\\$&");
}

// Escapes a value for use inside a TAG query `@field:{...}`. Inside a TAG
// clause every ASCII punctuation character AND whitespace (`Saudi Arabia`,
// `Israel/Palestine`) is a syntax/separator char and must be backslash
// escaped; letters, digits, `_` and all non-ASCII characters are literal.
// (Different from escapeRediSearchTerm, which is for full-text terms.)
export function escapeTagValue(value) {
  return value
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\x20-\x2f\x3a-\x40\x5b-\x5e\x60\x7b-\x7e]/g, "\\$&");
}

export function tagClause(field, values) {
  const escaped = values.map(escapeTagValue).filter(Boolean);
  if (!escaped.length) return null;
  return `@${field}:{${escaped.join("|")}}`;
}

// Overlap semantics, matching eventYearRange()/boundariesForYear() in the frontend.
export function yearRangeClause(lo, hi) {
  const hiClamp = hi === undefined ? "+inf" : hi;
  const loClamp = lo === undefined ? "-inf" : lo;
  return `@start_year:[-inf ${hiClamp}] @end_year:[${loClamp} +inf]`;
}

// RediSearch GEO fields only do radius queries, so bbox uses the separate
// NUMERIC lon/lat fields (see scripts/load-redis.js).
export function bboxClause(bounds) {
  if (!bounds) return null;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  return `@lon:[${minLon} ${maxLon}] @lat:[${minLat} ${maxLat}]`;
}

// Words in the same way the index tokenizer splits them (RediSearch's default
// separators plus whitespace), so `Anglo-Iraqi` searches for the two words the
// index actually holds. Any other ASCII punctuation is escaped to stay literal.
const WORD_SEPARATORS = /[\s,.<>{}[\]"':;!@#$%^&*()\-+=~]+/;
export function queryTokens(q) {
  return q
    .split(WORD_SEPARATORS)
    .map((t) =>
      t
        .replace(/[\x00-\x1f\x7f]/g, "")
        .replace(/[\x20-\x2f\x3a-\x40\x5b-\x5e\x60\x7b-\x7e]/g, "\\$&")
    )
    .filter(Boolean);
}

// The last token is prefix-matched (`crisi*`) when it is >= 2 characters, so
// search-as-you-type works. (Escaping happens before the `*` is appended, so
// user input can never inject a wildcard.)
export function textClause(q) {
  if (!q) return null;
  const tokens = queryTokens(q);
  if (!tokens.length) return null;
  const last = tokens.length - 1;
  if (tokens[last].replace(/\\/g, "").length >= 2) tokens[last] += "*";
  return `@title|extract:(${tokens.join(" ")})`;
}

// Parses /api/events params. Returns everything both server implementations
// need to run FT.SEARCH. Throws ClientError.
export function buildEventsRequest(searchParams) {
  const start = parseYear("start", searchParams.get("start") ?? undefined);
  const end = parseYear("end", searchParams.get("end") ?? undefined);
  if (start !== undefined && end !== undefined && start > end) {
    throw new ClientError("start must not exceed end");
  }
  const q = parseQ(searchParams.get("q") ?? undefined);
  const clauses = [yearRangeClause(start, end)];
  const bb = bboxClause(parseBbox(searchParams.get("bbox") ?? undefined));
  if (bb) clauses.push(bb);
  const cat = tagClause("category", parseList("category", searchParams.get("category") ?? undefined));
  if (cat) clauses.push(cat);
  const cty = tagClause("countries", parseList("country", searchParams.get("country") ?? undefined));
  if (cty) clauses.push(cty);
  if (parseFlag("precise", searchParams.get("precise") ?? undefined)) {
    clauses.push("@location_quality:{precise}");
  }
  const tc = textClause(q);
  if (tc) clauses.push(tc);

  const sort = parseEnum("sort", searchParams.get("sort") ?? undefined, ["date", "relevance"]) ?? (tc ? "relevance" : "date");
  const limit = parseIntParam("limit", searchParams.get("limit") ?? undefined, { min: 1, max: MAX_LIMIT, fallback: MAX_LIMIT });
  const offset = parseIntParam("offset", searchParams.get("offset") ?? undefined, { min: 0, max: MAX_OFFSET, fallback: 0 });
  // Default is lite: a full lead is up to ~10 KB, so an unqualified query for 1000 events must stay small.
  const fields = parseEnum("fields", searchParams.get("fields") ?? undefined, ["lite", "full"]) ?? "lite";
  return {
    query: clauses.join(" "),
    sortBy: sort === "date" ? "start_year" : null,
    limit,
    offset,
    fields,
    returnFields: fields === "lite" ? LITE_FIELDS : null, // null = every stored field
  };
}

// Kept for callers/tests that only need the query string.
export function buildEventsQuery(searchParams) {
  return buildEventsRequest(searchParams).query;
}

// --- response shaping -------------------------------------------------------

// Stored hash fields fetched for fields=lite (lon/lat -> coordinates).
export const LITE_FIELDS = [
  "id",
  "title",
  "date_start",
  "date_end",
  "countries",
  "category",
  "lon",
  "lat",
  "location_quality",
  "snippet",
];

// First SNIPPET_LENGTH characters (code points, never splitting a surrogate pair).
export function makeSnippet(extract) {
  if (!extract) return "";
  return extract.length <= SNIPPET_LENGTH ? extract : Array.from(extract).slice(0, SNIPPET_LENGTH).join("");
}

// Stored JSON-array text -> string[] (never throws; anything malformed -> []).
export function parseStringList(s) {
  if (!s) return [];
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function hashToEvent(v, fields = "full") {
  const event = {
    id: v.id,
    title: v.title,
    date_start: v.date_start || null,
    date_end: v.date_end || null,
    countries: v.countries ? v.countries.split(",").filter(Boolean) : [],
    category: v.category || null, // our coarse grouping (colour/filter)
  };
  if (fields === "lite") {
    event.snippet = v.snippet !== undefined ? v.snippet : makeSnippet(v.extract);
  } else {
    event.extract = v.extract || "";
    event.extract_retrieved_at = v.extract_retrieved_at || null;
    event.wikidata_classes = parseStringList(v.wikidata_classes);
    event.date_flags = parseStringList(v.date_flags);
    event.wikipedia_url = v.wikipedia_url || null;
    event.wikidata_qid = v.wikidata_qid || null;
    event.coordinate_source = v.coordinate_source || null;
  }
  event.location_quality = v.location_quality || "precise";
  if (v.lon !== undefined && v.lat !== undefined) {
    event.coordinates = { lon: Number(v.lon), lat: Number(v.lat) };
  } else {
    event.coordinates = null;
  }
  return event;
}

// The /api/events response body. `total` comes from FT.SEARCH.
export function eventsResponse(total, documents, req) {
  const events = documents.map((v) => hashToEvent(v, req.fields));
  return { total, truncated: total > req.offset + events.length, events };
}
// END SHARED LOGIC

// Returns the FT.SEARCH query string for /api/boundaries. Throws ClientError.
export function buildBoundariesQuery(searchParams) {
  const year = parseYear("year", searchParams.get("year") ?? undefined);
  let lo, hi;
  if (year !== undefined) {
    lo = hi = year;
  } else {
    const s = searchParams.get("start");
    const e = searchParams.get("end");
    if (s === null || e === null || s === "" || e === "") {
      throw new ClientError("year (or start & end) is required");
    }
    lo = parseYear("start", s);
    hi = parseYear("end", e);
  }
  if (lo > hi) [lo, hi] = [hi, lo];
  // Union semantics: any boundary active at any point within [lo, hi].
  return `@start_year:[-inf ${hi}] @end_year:[${lo} +inf]`;
}

// `raw` is the whole boundary JSON document as a string (FT.SEARCH RETURN 1 $).
export function boundaryDocToFeature(raw) {
  if (raw == null) return null;
  let d = JSON.parse(raw);
  if (Array.isArray(d)) d = d[0];
  if (!d) return null;
  return {
    type: "Feature",
    properties: {
      name: d.name,
      start_year: d.start_year,
      end_year: d.end_year,
      status: d.status,
      source: d.source,
      note: d.note,
    },
    geometry: d.geometry,
  };
}

// --- CORS -----------------------------------------------------------------

// allowed: env.ALLOWED_ORIGIN (comma-separated exact origins) or unset.
// Returns "*" (unset -> allow all), the origin to reflect, or null (no header).
export function matchOrigin(allowed, requestOrigin) {
  if (allowed === undefined || allowed === null || String(allowed).trim() === "") return "*";
  if (!requestOrigin) return null;
  const list = String(allowed)
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return list.includes(requestOrigin) ? requestOrigin : null;
}

export function corsHeaders(allowed, requestOrigin) {
  const headers = {};
  const origin = matchOrigin(allowed, requestOrigin);
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  if (origin !== "*") headers["Vary"] = "Origin";
  return headers;
}

// Same result as JSON.stringify(boundaryDocToFeature(raw)) but without parsing
// and re-serializing the (large) geometry: RedisJSON emits documents with
// `geometry` as the last key, so the geometry text is spliced through
// verbatim and only the small leading properties are parsed. Falls back to
// the full parse if the document doesn't have that layout. Returns a JSON
// string, or null for an empty/invalid document.
const GEOMETRY_KEY = ',"geometry":';
export function boundaryDocToFeatureJson(raw) {
  if (raw == null) return null;
  const at = raw.indexOf(GEOMETRY_KEY);
  if (at > 0 && raw.charCodeAt(0) === 123 && raw.endsWith("}}") && raw.charCodeAt(at + GEOMETRY_KEY.length) === 123) {
    let head;
    try {
      head = JSON.parse(raw.slice(0, at) + "}");
    } catch {
      head = null;
    }
    if (head && typeof head === "object" && !Array.isArray(head)) {
      const properties = {
        name: head.name,
        start_year: head.start_year,
        end_year: head.end_year,
        status: head.status,
        source: head.source,
        note: head.note,
      };
      const geometry = raw.slice(at + GEOMETRY_KEY.length, raw.length - 1);
      return `{"type":"Feature","properties":${JSON.stringify(properties)},"geometry":${geometry}}`;
    }
  }
  const f = boundaryDocToFeature(raw);
  return f ? JSON.stringify(f) : null;
}
