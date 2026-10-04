// Structural validation for event files. This checks FORMAT and internal consistency
// only - it never judges whether an event is "right" (that would be editorial).
import { createHash } from "node:crypto";
import { COUNTRIES, EVENT_CLASSES } from "./event-classes.js";

const ID_RE = /^[a-z0-9-]+$/;
const QID_RE = /^Q[1-9][0-9]*$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Inclusion rule 3 (docs/DATA_POLICY.md): events date from 1900 to the present. One year of
// slack at the top for a scheduled end date; the bound moves with the clock (UTC).
export const MIN_YEAR = 1900;
export const MAX_YEAR = new Date().getUTCFullYear() + 1;
export const LOCATION_QUALITIES = ["precise", "approximate", "none"];

// The allowed `category` / `category_group` values: the groups the pipeline can assign
// (scripts/lib/event-classes.js). The app's CATEGORY_LABELS has one label per group
// (checked in validate.test.js).
export const CATEGORIES = [...new Set(EVENT_CLASSES.map((c) => c.category))];

// Which coordinate_source goes with which location_quality, as the pipeline writes them:
// scripts/ingest.js (wikipedia -> wikidata -> manual-override -> country-fallback:<country>),
// scripts/enrich-candidates.js (wikipedia | wikidata, else none) and the shape-v2.1 rule
// (country-fallback => approximate, no coordinates => none, otherwise precise).
export const PRECISE_SOURCES = ["wikipedia", "wikidata", "manual-override"];
const FALLBACK_RE = /^country-fallback:(.+)$/;

// A generous box around the 15 tracked countries (Egypt's west edge ~25E, Iran's east
// ~63.3E, Yemen ~12N, Turkey's north ~42.1N). A point outside it is only a WARNING: a few
// events really happened abroad (conferences, signings, a hijacking).
export const REGION_BBOX = { minLat: 10, maxLat: 44, minLon: 24, maxLon: 65 };
const inRegion = (lat, lon) =>
  lat >= REGION_BBOX.minLat && lat <= REGION_BBOX.maxLat && lon >= REGION_BBOX.minLon && lon <= REGION_BBOX.maxLon;

// The app's list snippet is the first 160 characters of the extract (app/scripts/split-data.mjs,
// SNIPPET_LENGTH). A lead no longer than its own preview is suspicious (stub, truncated
// fetch), so it is reported - as a warning only.
export const MIN_EXTRACT_CHARS = 160;

export function isRealDate(s) {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // days in month (leap-year aware)
  return d <= dim;
}

// opts.lenient: curated data.events.json may hold events that still
// need manual coordinates (reported as warnings, not errors). The proposed file may not.
//
// KNOWN_DUPLICATE_QIDS: pre-existing duplicates in curated data awaiting the user's
// decision (we never edit curated data automatically). Downgraded to warnings in lenient
// (curated) mode so CI stays green; any NEW duplicate still fails.
//   Q2429253: curated "Islamic State of Iraq and the Levant" (2013) and "Islamic State"
//   (2014) are two seed titles that resolve to the same Wikipedia article.
export const KNOWN_DUPLICATE_QIDS = new Set([]);

export function validateEvents(events, { name = "events", lenient = false, otherIds = new Set() } = {}) {
  const errors = [];
  const warnings = [];
  const err = (i, e, msg) => errors.push(`${name}[${i}] ${e?.id ?? "(no id)"}: ${msg}`);
  const warn = (i, e, msg) => warnings.push(`${name}[${i}] ${e?.id ?? "(no id)"}: ${msg}`);

  if (!Array.isArray(events)) return { errors: [`${name}: top level must be an array`], warnings };

  const ids = new Map();
  const qids = new Map();

  events.forEach((e, i) => {
    if (!e || typeof e !== "object") return err(i, e, "not an object");

    if (typeof e.id !== "string" || !ID_RE.test(e.id)) err(i, e, `id must match ${ID_RE} (got ${JSON.stringify(e.id)})`);
    else if (ids.has(e.id)) err(i, e, `duplicate id (also at index ${ids.get(e.id)})`);
    else ids.set(e.id, i);

    if (typeof e.title !== "string" || !e.title.trim()) err(i, e, "title missing/empty");

    if (e.wikidata_qid != null) {
      if (typeof e.wikidata_qid !== "string" || !QID_RE.test(e.wikidata_qid)) {
        err(i, e, `wikidata_qid malformed (${JSON.stringify(e.wikidata_qid)})`);
      } else if (qids.has(e.wikidata_qid) && lenient && KNOWN_DUPLICATE_QIDS.has(e.wikidata_qid)) {
        warnings.push(`${name}[${i}] ${e.id}: known duplicate wikidata_qid ${e.wikidata_qid} (awaiting user decision)`);
      } else if (qids.has(e.wikidata_qid)) {
        err(i, e, `duplicate wikidata_qid ${e.wikidata_qid} (also at index ${qids.get(e.wikidata_qid)})`);
      } else qids.set(e.wikidata_qid, i);
    } else if (!lenient) {
      err(i, e, "wikidata_qid missing");
    } else warnings.push(`${name}[${i}] ${e.id}: no wikidata_qid`);

    if (!isRealDate(e.date_start)) err(i, e, `date_start invalid (${JSON.stringify(e.date_start)})`);
    if (e.date_flags != null && (!Array.isArray(e.date_flags) || e.date_flags.some((f) => typeof f !== "string" || !f))) {
      err(i, e, "date_flags must be an array of non-empty strings");
    }
    if (e.date_end != null) {
      if (!isRealDate(e.date_end)) err(i, e, `date_end invalid (${JSON.stringify(e.date_end)})`);
      else if (isRealDate(e.date_start) && e.date_end < e.date_start) {
        // v2.1: Wikidata's own date-order errors are kept and flagged, not dropped. The order problem is
        // only tolerated (as a warning) when date_flags carries a date_order_invalid reason explaining it.
        const explained = Array.isArray(e.date_flags) && e.date_flags.some((f) => String(f).startsWith("date_order_invalid"));
        if (explained) warnings.push(`${name}[${i}] ${e.id}: date_end (${e.date_end}) precedes date_start (${e.date_start}) - flagged in date_flags`);
        else err(i, e, `date_end (${e.date_end}) precedes date_start (${e.date_start}) and date_flags has no date_order_invalid reason`);
      }
    }

    if (!Array.isArray(e.countries) || e.countries.length === 0 || e.countries.some((c) => typeof c !== "string" || !c)) {
      err(i, e, "countries must be a non-empty array of strings");
    } else if (!e.countries.some((c) => c in COUNTRIES || c === "regional")) {
      err(i, e, `no tracked country (inclusion rule 2): ${e.countries.join(", ")}`);
    }
    if (typeof e.category !== "string" || !e.category) err(i, e, "category missing");
    else if (!CATEGORIES.includes(e.category)) err(i, e, `category must be one of ${CATEGORIES.join("|")} (got ${JSON.stringify(e.category)})`);
    if (e.category_group != null) {
      if (!CATEGORIES.includes(e.category_group)) {
        err(i, e, `category_group must be one of ${CATEGORIES.join("|")} (got ${JSON.stringify(e.category_group)})`);
      } else if (e.category_group !== e.category) {
        err(i, e, `category_group (${e.category_group}) differs from category (${e.category}); both hold the same grouping`);
      }
    }

    if (typeof e.extract !== "string" || !e.extract.trim()) err(i, e, "extract missing/empty");
    else if (e.extract.trim().length < MIN_EXTRACT_CHARS) {
      warn(i, e, `extract is only ${e.extract.trim().length} characters (< ${MIN_EXTRACT_CHARS}); check the lead was fetched whole`);
    }

    // v2.1 shape fields
    if (!Array.isArray(e.wikidata_classes) || e.wikidata_classes.some((c) => typeof c !== "string" || !c)) {
      err(i, e, "wikidata_classes must be an array of non-empty strings");
    }
    if (typeof e.extract_retrieved_at !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(e.extract_retrieved_at)) {
      err(i, e, "extract_retrieved_at must be an ISO date");
    }
    if ("category_label" in e) err(i, e, "category_label is deprecated and must not be present");
    if (e.location_quality != null && !LOCATION_QUALITIES.includes(e.location_quality)) {
      err(i, e, `location_quality must be one of ${LOCATION_QUALITIES.join("|")} (got ${JSON.stringify(e.location_quality)})`);
    }

    // Coordinates are required only when location_quality != "none". "none" means no real location:
    // coordinates must then be null (never invented).
    if (e.location_quality === "none") {
      if (e.coordinates != null) err(i, e, 'location_quality "none" requires coordinates: null');
    } else if (e.coordinates == null) {
      if (lenient) warnings.push(`${name}[${i}] ${e.id}: coordinates null but location_quality is not "none"`);
      else err(i, e, 'coordinates missing (set location_quality "none" for events without a known location)');
    } else {
      const { lat, lon } = e.coordinates;
      if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        err(i, e, "coordinates.lat/lon must be finite numbers");
      } else if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        err(i, e, `coordinates out of range (${lat}, ${lon})`);
      } else if (!inRegion(lat, lon)) {
        // Outside the region but inside it with lat/lon exchanged: almost certainly a swap.
        if (inRegion(lon, lat)) err(i, e, `coordinates look swapped (lat ${lat}, lon ${lon}); (${lon}, ${lat}) would be in the region`);
        else warn(i, e, `coordinates (${lat}, ${lon}) are outside the Middle East box (source: ${e.coordinate_source ?? "none"}); fine if the event happened abroad`);
      }
    }

    // location_quality <-> coordinate_source, as the pipeline pairs them.
    if (LOCATION_QUALITIES.includes(e.location_quality)) {
      const src = e.coordinate_source ?? null;
      const fb = typeof src === "string" ? FALLBACK_RE.exec(src) : null;
      if (e.location_quality === "none" && src !== null) {
        err(i, e, `location_quality "none" requires coordinate_source: null (got ${JSON.stringify(src)})`);
      } else if (e.location_quality === "approximate" && !(fb && fb[1] in COUNTRIES)) {
        err(i, e, `location_quality "approximate" requires coordinate_source "country-fallback:<tracked country>" (got ${JSON.stringify(src)})`);
      } else if (e.location_quality === "precise" && !PRECISE_SOURCES.includes(src)) {
        err(i, e, `location_quality "precise" requires coordinate_source ${PRECISE_SOURCES.join("|")} (got ${JSON.stringify(src)})`);
      }
    }

    if (e.wikipedia_url != null && !/^https:\/\/[a-z-]+\.wikipedia\.org\/wiki\//.test(e.wikipedia_url)) {
      err(i, e, `wikipedia_url not a Wikipedia article URL (${e.wikipedia_url})`);
    }
    // resolved_qid = the Wikidata item of the article at wikipedia_url (enrich-candidates.js).
    // A different item means the URL points at another (often broader) article. Flag only.
    if (typeof e.resolved_qid === "string" && typeof e.wikidata_qid === "string" && e.resolved_qid !== e.wikidata_qid) {
      warn(i, e, `wikipedia_url (${e.wikipedia_url}) belongs to ${e.resolved_qid}, not the event's wikidata_qid ${e.wikidata_qid}`);
    }
  });

  // possible_duplicates hints must name an existing event: one in this file, or in
  // opts.otherIds (the curated ids, for the proposed file, whose hints may point there).
  events.forEach((e, i) => {
    if (!e || typeof e !== "object" || e.possible_duplicates == null) return;
    if (!Array.isArray(e.possible_duplicates)) return err(i, e, "possible_duplicates must be an array");
    for (const d of e.possible_duplicates) {
      const id = typeof d === "string" ? d : d?.id;
      if (!ids.has(id) && !otherIds.has(id)) {
        warn(i, e, `possible_duplicates names "${id}", which is not in ${otherIds.size ? "this file or the curated file" : "this file"}`);
      }
    }
  });

  return { errors, warnings };
}

// Framing-review coverage (data/framing-review.json): every event needs a review of its
// CURRENT text. "Stale" is defined as in app/scripts/split-data.mjs (framingFor) and
// app/src/lib/framingReview.test.js: the review's text_sha1 is not the first 12 hex digits
// of sha1(extract). A summary refreshed from Wikipedia may stay stale until it is
// re-reviewed, so everything here is a warning.
export const textSha1 = (text) => createHash("sha1").update(text ?? "").digest("hex").slice(0, 12);

export function checkFramingCoverage(events, review, { name = "framing-review" } = {}) {
  const reviews = review?.events;
  if (!reviews || typeof reviews !== "object") return { warnings: [`${name}: no "events" object`], missing: 0, stale: 0, orphans: 0 };
  const warnings = [];
  let missing = 0;
  let stale = 0;
  const ids = new Set();
  for (const e of events) {
    if (!e?.id) continue;
    ids.add(e.id);
    const r = reviews[e.id];
    if (!r) {
      missing++;
      warnings.push(`${name}: ${e.id} has no framing review`);
    } else if (r.text_sha1 !== textSha1(e.extract)) {
      stale++;
      warnings.push(`${name}: ${e.id} review is stale (text changed since it was reviewed; reviewed text of ${r.text_retrieved_at ?? "?"}, current text of ${e.extract_retrieved_at ?? "?"})`);
    }
  }
  const orphans = Object.keys(reviews).filter((id) => !ids.has(id));
  for (const id of orphans) warnings.push(`${name}: review for "${id}", which is not an event`);
  return { warnings, missing, stale, orphans: orphans.length };
}

// Cross-file check used by merge-proposed.js: ids/QIDs of `incoming` must not clash with `base`.
export function findClashes(base, incoming) {
  const ids = new Set(base.map((e) => e.id));
  const qids = new Set(base.map((e) => e.wikidata_qid).filter(Boolean));
  return incoming
    .map((e) => ({
      event: e,
      reasons: [ids.has(e.id) && "id", e.wikidata_qid && qids.has(e.wikidata_qid) && "wikidata_qid"].filter(Boolean),
    }))
    .filter((c) => c.reasons.length);
}
