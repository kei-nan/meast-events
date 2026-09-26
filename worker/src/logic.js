// Pure request-validation / query-building / response-shaping logic. No
// cloudflare:sockets import, so it is unit-testable in plain Node.
// server/index.js carries an equivalent copy - keep the two in sync.

export const MIN_YEAR = 1000;
export const MAX_YEAR = 3000;
export const MAX_Q_LENGTH = 100;

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

// --- query building -------------------------------------------------------

// Escapes RediSearch query-syntax characters in a raw user search term.
export function escapeRediSearchTerm(text) {
  return text.replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|\\/]/g, "\\$&");
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

export function textClause(q) {
  if (!q) return null;
  const escaped = escapeRediSearchTerm(q);
  if (!escaped) return null;
  return `@title|extract:(${escaped})`;
}

// Returns the FT.SEARCH query string for /api/events. Throws ClientError.
export function buildEventsQuery(searchParams) {
  const start = parseYear("start", searchParams.get("start") ?? undefined);
  const end = parseYear("end", searchParams.get("end") ?? undefined);
  if (start !== undefined && end !== undefined && start > end) {
    throw new ClientError("start must not exceed end");
  }
  const clauses = [yearRangeClause(start, end)];
  const bb = bboxClause(parseBbox(searchParams.get("bbox") ?? undefined));
  if (bb) clauses.push(bb);
  const tc = textClause(parseQ(searchParams.get("q") ?? undefined));
  if (tc) clauses.push(tc);
  return clauses.join(" ");
}

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

// --- response shaping -------------------------------------------------------

export function hashToEvent(v) {
  const event = {
    id: v.id,
    title: v.title,
    date_start: v.date_start || null,
    date_end: v.date_end || null,
    countries: v.countries ? v.countries.split(",").filter(Boolean) : [],
    category: v.category || null,
    extract: v.extract || "",
    wikipedia_url: v.wikipedia_url || null,
    wikidata_qid: v.wikidata_qid || null,
    coordinate_source: v.coordinate_source || null,
  };
  if (v.lon !== undefined && v.lat !== undefined) {
    event.coordinates = { lon: Number(v.lon), lat: Number(v.lat) };
  } else {
    event.coordinates = null;
  }
  return event;
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
