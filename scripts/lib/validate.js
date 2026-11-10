// Structural validation for event files. This checks FORMAT and internal consistency
// only - it never judges whether an event is "right" (that would be editorial).
import { createHash } from "node:crypto";
import { COUNTRIES, GROUPS, INCLUSION_MIN_SITELINKS, groupForEvent, notEventClasses } from "./event-classes.js";
import { coordinatesChecked, lastDayOfPeriod } from "./fixes.js";
import { precisionName, precisionCode, yearOf, yearsIn } from "./wiki.js";
import { durativeWithoutEndFlag, leadStartDayFlag, lowPrecisionCoordinateFlag, presentWithoutEndFlag, titleYearsFlag } from "./flags.js";
import { isRevid, isRevTimestamp } from "./revid.js";
import { expectedLeadDates } from "./lead-dates.js";
import { distanceToRingsKm } from "./geo.js";
// Same value as lib/v21.js DATE_END_COARSE_FLAG (v21.js is not imported here: it pulls in the whole pipeline).
const DATE_END_COARSE_FLAG = "date_end_precision_coarse";
// Plain module (no imports of its own), shared with the app: country -> border-shape names per year.
import { shapeNamesFor } from "../../app/src/lib/eventCountries.js";
// The app's own id check (the /event/<id> path and ?e= links) and timeline span: an event the
// validator passes must be one the app can link to and show.
import { isValidEventId } from "../../app/src/lib/urlState.js";
import { MIN_YEAR, MAX_YEAR } from "../../app/src/lib/years.js";

// The pipeline's slugs (lower-case letters, digits and hyphens: safe as a file name everywhere, ":"
// is not on Windows) that the app also accepts (isValidEventId: a letter or digit first, at most
// 120 characters), and never a name that collides with a fixed file next to the event pages
// (index) or a Windows reserved device name (a checkout on Windows could not hold a file or
// folder named after it).
const ID_RE = /^[a-z0-9-]+$/;
const RESERVED_IDS = new Set([
  "index",
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);
/** Why `id` is not a valid event id, or null when it is. */
export function eventIdProblem(id) {
  if (typeof id !== "string" || !ID_RE.test(id) || !isValidEventId(id)) {
    return `id must be lower-case letters, digits and hyphens, a letter or digit first, at most 120 characters (got ${JSON.stringify(id)})`;
  }
  if (RESERVED_IDS.has(id)) return `id ${JSON.stringify(id)} is a reserved file name (index, or a Windows device name)`;
  return null;
}
const QID_RE = /^Q[1-9][0-9]*$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Inclusion rule 3 (docs/DATA_POLICY.md): events date from 1900 to the present. The bounds are
// the app's timeline span (app/src/lib/years.js; outside a Vite bundle MAX_YEAR is the current
// UTC year): a start date after it would pass here but never show on the timeline. An END date
// keeps one year of slack (MAX_END_YEAR) for a scheduled end; the event still shows by its start.
// A start date after the day its data was fetched (a scheduled election, say) is valid but WARNED about.
export { MIN_YEAR, MAX_YEAR };
export const MAX_END_YEAR = MAX_YEAR + 1;
const LOCATION_QUALITIES = ["precise", "approximate", "none"];

// The allowed `category` / `category_group` values: the groups the pipeline can assign, "unclassified" included
// (scripts/lib/event-classes.js). The app's CATEGORY_LABELS has one label per group
// (checked in validate.test.js).
export const CATEGORIES = GROUPS;

// Which coordinate_source goes with which location_quality, as the pipeline writes them:
// scripts/ingest.js (wikipedia -> wikidata -> manual-override -> country-fallback:<country>),
// scripts/enrich-candidates.js (wikipedia | wikidata | redirect_target, else none) and the
// shape-v2.1 rule (country-fallback => approximate, no coordinates => none, otherwise precise).
// "redirect_target": the point is a real Wikipedia/Wikidata coordinate, but of a DIFFERENT item
// (the article the event's title redirects to, or that article's P625), not the event's own.
// Allowed, and always warned about (see BORROWED_SOURCE below).
export const BORROWED_SOURCE = "redirect_target";
const PRECISE_SOURCES = ["wikipedia", "wikidata", "manual-override", BORROWED_SOURCE];
// coordinate_source for a point read from the Wikipedia article at wikipedia_url: when that
// article belongs to another item than the event's (otherItem), the point is borrowed.
export const borrowedSource = (source, otherItem) => (otherItem && source === "wikipedia" ? BORROWED_SOURCE : source);
const FALLBACK_RE = /^country-fallback:(.+)$/;

// A generous box around the 15 tracked countries (Egypt's west edge ~25E, Iran's east
// ~63.3E, Yemen ~12N, Turkey's north ~42.1N). A point outside it is only a WARNING: a few
// events really happened abroad (conferences, signings, a hijacking).
const REGION_BBOX = { minLat: 10, maxLat: 44, minLon: 24, maxLon: 65 };
const inRegion = (lat, lon) =>
  lat >= REGION_BBOX.minLat && lat <= REGION_BBOX.maxLat && lon >= REGION_BBOX.minLon && lon <= REGION_BBOX.maxLon;

// The app's list snippet is the first 160 characters of the extract (app/scripts/split-data.mjs,
// SNIPPET_LENGTH). A lead no longer than its own preview is suspicious (stub, truncated
// fetch), so it is reported - as a warning only.
const MIN_EXTRACT_CHARS = 160;

// A precise pin is checked against the border shapes of the event's tagged countries in its
// start year (the same country -> shape table the map uses to shade countries,
// app/src/lib/eventCountries.js COUNTRY_SHAPES). Points within this distance of a shape count
// as inside it: coastal battles and border crossings sit on or just off the drawn line.
const PIN_TOLERANCE_KM = 5;

// Warnings only. An event tagged with this many countries counts in each of them (per-country figures); the
// region-wide events (world wars, regional conflicts) carry 8-15 tags. lib/flags.js already flags > 4 as
// many_countries in review_reasons; this is the validator's listing of the extreme ones.
export const MANY_COUNTRIES_WARN = 8;
const ENGLISH_WIKIPEDIA = "https://en.wikipedia.org/wiki/";

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}/;

// Inclusion rule 2: a tag is one of the tracked countries/territories, or "regional" (hand-assigned to a few
// legacy events that concern the whole region).
const isKnownCountry = (c) => Object.hasOwn(COUNTRIES, c) || c === "regional";

/**
 * Why `date` (YYYY-MM-DD) cannot be a date of Wikidata precision `name`, or null when it fits (or cannot be
 * checked: no date, no or an unknown precision, day or finer). Month precision is stored as the month's first day,
 * year and coarser as 1 January (the period's first day, as WDQS returns such values).
 */
function precisionShapeProblem(date, name) {
  const code = precisionCode(name);
  const m = DATE_RE.exec(String(date ?? ""));
  if (code === null || code >= 11 || !m) return null;
  if (code === 10) return m[3] === "01" ? null : "a month-precision date is stored as the month's first day (YYYY-MM-01)";
  return m[2] === "01" && m[3] === "01" ? null : `a ${name}-precision date is stored as 1 January (YYYY-01-01)`;
}
const todayUtc = () => new Date().toISOString().slice(0, 10);

// Index of data/boundaries.json features by name, with bounding boxes, for pinCountryCheck.
function indexBoundaries(boundaries, turf) {
  const features = Array.isArray(boundaries) ? boundaries : boundaries?.features ?? [];
  const byName = new Map();
  for (const f of features) {
    const p = f?.properties;
    if (!p?.name || !f.geometry) continue;
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name).push({ f, bbox: turf.bbox(f), from: p.start_year, to: p.end_year });
  }
  return { byName, turf };
}

// CHECK ONLY (never used for the map's country shading or the displayed country tags): before 1920
// the map has no shape of its own for these countries, which lay wholly or partly inside the
// Ottoman Empire (Turkey, the Levant, Mesopotamia, the Hejaz). For the pin check a pin tagged with
// one of them is tested against the Ottoman Empire shape of its year (data/boundaries.json draws
// it 1886-1919). The shape also covers other present-day countries, so this catches pins that
// lie outside the Empire altogether (abroad, swapped or mistyped coordinates), not a pin in the
// wrong province. eventCountries.js keeps the Ottoman shape out of COUNTRY_SHAPES for that reason.
// Kuwait, Bahrain, Qatar and the Trucial coast were not Ottoman-ruled in these years, so they are
// not listed. Each entry is [feature name, first year, last year], as in COUNTRY_SHAPES.
const PRE_1920_CHECK_SHAPES = Object.fromEntries(
  ["Turkey", "Iraq", "Syria", "Lebanon", "Jordan", "Israel/Palestine", "Saudi Arabia"].map((c) => [c, [["Ottoman Empire", 1886, 1919]]])
);
/** The shape names the pin check uses for a country in a year: the map's own, else the check-only pre-1920 one. */
export function checkShapeNamesFor(country, year) {
  const own = shapeNamesFor(country, year);
  if (own.length) return { names: own, wide: false };
  const extra = (Object.hasOwn(PRE_1920_CHECK_SHAPES, country) ? PRE_1920_CHECK_SHAPES[country] : [])
    .filter(([, from, to]) => from <= year && year <= to)
    .map(([name]) => name);
  return { names: extra, wide: extra.length > 0 };
}

// For a precise pin: null when the point lies inside (or within PIN_TOLERANCE_KM of) a shape of
// at least one tagged country in the event's start year, or when that cannot be checked (no
// tagged country, or one of them, has no shape that year: e.g. "regional", Kuwait before
// 1961). Otherwise { year, km, wide } with the distance to the nearest of those shapes; `wide`
// when a pre-1920 check-only shape (PRE_1920_CHECK_SHAPES) was among them.
function pinCountryCheck(e, index) {
  const { byName, turf } = index;
  const year = Number(String(e.date_start).slice(0, 4));
  const countries = Array.isArray(e.countries) ? e.countries : [];
  let wide = false;
  const perCountry = countries.map((c) => {
    const r = checkShapeNamesFor(c, year);
    if (r.wide) wide = true;
    return r.names.flatMap((n) => (byName.get(n) ?? []).filter((s) => s.from <= year && year <= s.to));
  });
  if (!perCountry.length || perCountry.some((s) => !s.length)) return null;
  const shapes = perCountry.flat();
  const { lat, lon } = e.coordinates;
  const pt = turf.point([lon, lat]);
  // ~0.1 degree is more than the tolerance at these latitudes (>= 8 km east-west at 44N).
  const pad = 0.1;
  const near = (b) => lon >= b[0] - pad && lon <= b[2] + pad && lat >= b[1] - pad && lat <= b[3] + pad;
  for (const s of shapes) {
    if (!near(s.bbox)) continue;
    if (turf.booleanPointInPolygon(pt, s.f)) return null;
    if (distanceToRingsKm(turf, pt, s.f) <= PIN_TOLERANCE_KM) return null;
  }
  const km = Math.min(...shapes.map((s) => distanceToRingsKm(turf, pt, s.f)));
  return { year, km, wide };
}

// A real calendar day YYYY-MM-DD in MIN_YEAR..maxYear (default MAX_YEAR, the app's last year).
export function isRealDate(s, maxYear = MAX_YEAR) {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < MIN_YEAR || y > maxYear || mo < 1 || mo > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // days in month (leap-year aware)
  return d <= dim;
}

// Date notes that state something about an event's stored dates, re-checked against them. A date changed by a ledger
// fix or by hand keeps its old notes unless they are removed too: before F16 the Kuwait invasion's corrected start
// would have kept "Wikidata start (2009-08-02) is after end (1990-08-04)" (docs/data-fixes.md). Each note is read as
// the pipeline writes it (lib/v21.js finalizeEvent / dateOrderFlags, lib/flags.js dateFlags, enrich-candidates.js,
// lib/seed-enrichment.js); a note of another form, or one with nothing checkable, is not judged.
// Returns { flags, reasons }: why each stale entry of date_flags / review_reasons no longer fits.
const wdDay = (s) => String(s).replace(/-00(?=-|$)/g, "-01"); // Wikidata "1986-00-00" is stored as 1986-01-01
export function staleDateNotes(e) {
  const out = { flags: [], reasons: [] };
  const start = e.date_start;
  const end = e.date_end ?? null;
  if (!isRealDate(start)) return out; // already an error
  const sy = yearOf(start);
  const ey = yearOf(end);
  const reversed = end != null && end < start;
  const stored = `stored ${start}${end ? ` to ${end}` : ", no end"}`;
  const leadYears = yearsIn(e.extract);
  const inLead = (y) => leadYears.some((x) => Math.abs(x - y) <= 1);
  const near = (years, lo, hi) => years.some((y) => y >= lo - 1 && y <= hi + 1);
  const listed = (f) => (/\[([^\]]*)\]/.exec(f)?.[1] ?? "").split(",").map(Number).filter(Number.isInteger);
  const named = (s, en) => `names ${s}${en ? ` to ${en}` : ""}`;

  const flagProblem = (f) => {
    const kind = f.split(":")[0];
    if (kind === "date_order_invalid") {
      const m = /Wikidata start \(([^)]+)\) is after end \(([^,)]+)/.exec(f);
      const old = /date_end \(([^)]+)\) precedes date_start \(([^)]+)\)/.exec(f);
      const [s, en] = m ? [m[1], m[2]] : old ? [old[2], old[1]] : [];
      if (!reversed) return `the stored dates are in order (${stored})`;
      if (s && (s !== start || en !== end)) return `${named(s, en)}, ${stored}`;
    } else if (kind === DATE_END_COARSE_FLAG) {
      const m = /end time (\S+) .*the start \(([^)]+)\)/.exec(f);
      if (!reversed) return `the stored end is not before the start (${stored})`;
      if (m && (m[1] !== end || m[2] !== start)) return `${named(m[2], m[1])}, ${stored}`;
    } else if (kind === "wikipedia_dates_note") {
      // Written only next to date_order_invalid, for reversed dates.
      const m = /Wikidata gives (\S+?)(?: to (\d{4}-\d\d-\d\d))?(?: \(|;|$)/.exec(f);
      if (!reversed) return `the stored dates are in order (${stored})`;
      if (m && (m[1] !== start || (m[2] ?? null) !== end)) return `${named(m[1], m[2])}, ${stored}`;
      const y = /\(start year (\d+) not in lead\)/.exec(f);
      if (y && Number(y[1]) !== sy) return `names start year ${y[1]}, ${stored}`;
    } else if (kind === "date_start_year_not_in_lead") {
      const m = /start year (\d+) \(([^)]+)\)/.exec(f);
      if (m && m[2] !== start) return `names ${m[2]}, ${stored}`;
      if (leadYears.length && inLead(sy)) return `the stored lead has a year within 1 of ${sy}`;
    } else if (kind === "date_source_adjusted") {
      const m = /used (P580|P585) start time (\S+)$/.exec(f);
      if (m && wdDay(m[2]) !== start) return `says ${m[1]} ${m[2]} was used, ${stored}`;
    }
    return null;
  };
  const reasonProblem = (f) => {
    const kind = f.split(":")[0];
    if (kind === "category_year_mismatch") {
      const m = /within 1 year of (\d+)(?:-(\d+))?$/.exec(f);
      if (!m) return null;
      const [lo, hi] = [Number(m[1]), Number(m[2] ?? m[1])];
      if (lo !== sy || hi !== (ey ?? sy)) return `names ${m[1]}${m[2] ? `-${m[2]}` : ""}, ${stored}`;
      if (near(listed(f), lo, hi)) return `a category year it lists is within 1 year of ${lo}${hi !== lo ? `-${hi}` : ""}`;
    } else if (kind === "date_year_mismatch" || kind === "date_end_year_mismatch") {
      const m = /year \((\d+)\)/.exec(f);
      const y = kind === "date_year_mismatch" ? sy : ey;
      if (m && Number(m[1]) !== y) return `names ${m[1]}, ${stored}`;
    } else if (kind === "unverified_date") {
      const m = /do not confirm (\d+)/.exec(f);
      if (m && Number(m[1]) !== sy) return `names ${m[1]}, ${stored}`;
    } else if (kind === "month_precision_day_in_lead") {
      const m = /date_start (\S+) has only month precision/.exec(f);
      if (m && (m[1] !== start || e.date_precision !== "month")) return `names ${m[1]} at month precision, ${stored} at ${e.date_precision ?? "no"} precision`;
    } else if (kind === "date_precision_coarse") {
      const m = /only to (.+?) precision/.exec(f);
      if (m && m[1] !== e.date_precision) return `says ${m[1]} precision, date_precision is ${JSON.stringify(e.date_precision ?? null)}`;
    } else if (kind === "date_order_invalid") {
      return flagProblem(f);
    }
    return null;
  };
  for (const [list, check, key] of [[e.date_flags, flagProblem, "flags"], [e.review_reasons, reasonProblem, "reasons"]]) {
    if (!Array.isArray(list)) continue;
    for (const f of list) {
      const why = typeof f === "string" ? check(f) : null;
      if (why) out[key].push(`${f.split(":")[0]} no longer fits the stored dates: ${why}`);
    }
  }
  return out;
}

// opts.lenient: events that still need manual coordinates or a QID are reported as warnings, not errors. No script
// uses it since 2026-11-03: data/events.json passes strictly, and validate-events.js / merge-proposed.js validate strictly.
//
// KNOWN_DUPLICATE_QIDS: pre-existing duplicates in curated data awaiting the user's
// decision (we never edit curated data automatically). Downgraded to warnings in lenient
// (curated) mode so CI stays green; any NEW duplicate still fails.
//   Q2429253: curated "Islamic State of Iraq and the Levant" (2013) and "Islamic State"
//   (2014) are two seed titles that resolve to the same Wikipedia article.
const KNOWN_DUPLICATE_QIDS = new Set([]);

// ---- The allowed fields ----
// Every top-level field an event record may carry, with its type (docs/DATA_POLICY.md, "What each field is", lists
// the same fields). Any other key is an error: a typo ("date_ends") or a pipeline-internal field (_review,
// source_qid, enrich_version) would otherwise be published unnoticed. `check(value)` is true when a present value
// has the field's type; a field without one is type-checked by its own checker below (its message names the field).
// Optional fields stay optional here: what the pipeline writes on every record is not required of a hand-written one.
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";
const isStringArray = (v) => Array.isArray(v) && v.every(isNonEmptyString);
const isNonNegativeInteger = (v) => Number.isInteger(v) && v >= 0;
// The enrichment time (enrich-candidates.js: new Date().toISOString()), a real calendar day.
const ISO_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,9})?Z$/;
const isIsoTimestamp = (v) => typeof v === "string" && ISO_TIMESTAMP_RE.test(v) && isRealDate(v.slice(0, 10));
// The P582 "no value" / "unknown value" of lib/wd-entities.js setDateEndOpen.
const DATE_END_OPEN_VALUES = ["wikidata_novalue", "wikidata_somevalue"];
// wikipedia_lead_dates: lib/lead-dates.js wikipediaLeadDates, "YYYY-MM-DD" or a "YYYY" year.
const LEAD_DATE_RE = /^\d{4}(-\d{2}-\d{2})?$/;
// part_of: enrich-candidates.js / lib/seed-enrichment.js write { qid, label } (label null when Wikidata has none).
const isPartOf = (p) =>
  isPlainObject(p) &&
  Object.keys(p).every((k) => k === "qid" || k === "label") &&
  typeof p.qid === "string" &&
  QID_RE.test(p.qid) &&
  "label" in p &&
  (p.label === null || isNonEmptyString(p.label));

export const EVENT_FIELDS = {
  id: { type: "string (lower-case slug)" },
  title: { type: "non-empty string" },
  wikipedia_url: { type: "English Wikipedia article URL" },
  extract: { type: "non-empty string" },
  extract_retrieved_at: { type: "ISO date or timestamp" },
  retrieved_at: { type: "an ISO UTC timestamp (YYYY-MM-DDTHH:MM:SS[.sss]Z)", check: isIsoTimestamp },
  wikipedia_revid: { type: "positive integer" },
  wikipedia_revid_timestamp: { type: "UTC timestamp" },
  wikidata_qid: { type: "QID" },
  resolved_qid: { type: "a QID", check: (v) => typeof v === "string" && QID_RE.test(v) },
  wikidata_classes: { type: "array of non-empty strings" },
  wikidata_description: { type: "a non-empty string or null", check: (v) => v === null || isNonEmptyString(v) },
  wikidata_aliases: { type: "non-empty array of distinct non-empty strings" },
  date_start: { type: "YYYY-MM-DD" },
  date_end: { type: "YYYY-MM-DD or null" },
  date_precision: { type: "Wikidata precision name or null" },
  date_end_precision: { type: "Wikidata precision name or null" },
  date_end_open: { type: DATE_END_OPEN_VALUES.map((v) => JSON.stringify(v)).join(" or "), check: (v) => DATE_END_OPEN_VALUES.includes(v) },
  date_flags: { type: "array of non-empty strings" },
  wikipedia_lead_dates: {
    type: 'a non-empty array of "YYYY-MM-DD" or "YYYY" strings',
    check: (v) => Array.isArray(v) && v.length > 0 && v.every((d) => typeof d === "string" && LEAD_DATE_RE.test(d)),
  },
  countries: { type: "non-empty array of distinct tracked countries" },
  category: { type: "category group" },
  category_group: { type: "category group" },
  location_quality: { type: LOCATION_QUALITIES.join("|") },
  coordinates: {
    type: "null or { lat, lon } with no other keys",
    check: (v) => v === null || (isPlainObject(v) && Object.keys(v).every((k) => k === "lat" || k === "lon")),
  },
  coordinate_source: { type: "coordinate source or null" },
  needs_manual_coordinates: { type: "a boolean", check: (v) => typeof v === "boolean" },
  review_reasons: { type: "an array of non-empty strings", check: isStringArray },
  needs_review: { type: "a boolean", check: (v) => typeof v === "boolean" },
  part_of: { type: "an array of { qid, label } (label a non-empty string or null)", check: (v) => Array.isArray(v) && v.every(isPartOf) },
  possible_duplicates: { type: "array" },
  sitelinks: { type: "a non-negative integer", check: isNonNegativeInteger },
  sitelinks_current: { type: "a non-negative integer", check: isNonNegativeInteger },
};
// Reported by checkDeprecatedFields, not as unknown.
const DEPRECATED_FIELDS = new Set(["category_label"]);

const shortJson = (v) => {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

// ---- Per-event checks ----
// Each checker reads one event (and `ctx`: the options, the event's index, the ids/QIDs seen so far) and returns its
// findings: error(msg), or warning(code, msg). A warning's code is stable across runs (its message may carry counts
// that change): the warnings baseline (data/validation-warnings-baseline.json, scripts/validate-events.js) keys on
// [file, event id, code]. validateEvents runs them in EVENT_CHECKS order, so the messages come out in a fixed order.
const error = (msg) => ({ level: "error", msg });
const warning = (code, msg) => ({ level: "warning", code, msg });
// A lib/flags.js flag reads "<code>: ...".
const flagWarning = (flag, suffix = "") => warning(flag.split(":")[0], flag + suffix);

function checkId(e, ctx) {
  const problem = eventIdProblem(e.id);
  if (problem) return [error(problem)];
  if (ctx.ids.has(e.id)) return [error(`duplicate id (also at index ${ctx.ids.get(e.id)})`)];
  ctx.ids.set(e.id, ctx.i);
  return [];
}

function checkTitle(e) {
  return typeof e.title !== "string" || !e.title.trim() ? [error("title missing/empty")] : [];
}

function checkWikidataQid(e, ctx) {
  const q = e.wikidata_qid;
  if (q == null) return ctx.lenient ? [warning("no_wikidata_qid", "no wikidata_qid")] : [error("wikidata_qid missing")];
  if (typeof q !== "string" || !QID_RE.test(q)) return [error(`wikidata_qid malformed (${JSON.stringify(q)})`)];
  if (ctx.qids.has(q) && ctx.lenient && KNOWN_DUPLICATE_QIDS.has(q)) {
    return [warning("known_duplicate_qid", `known duplicate wikidata_qid ${q} (awaiting user decision)`)];
  }
  if (ctx.qids.has(q)) return [error(`duplicate wikidata_qid ${q} (also at index ${ctx.qids.get(q)})`)];
  ctx.qids.set(q, ctx.i);
  return [];
}

function checkDateStart(e, ctx) {
  if (!isRealDate(e.date_start)) return [error(`date_start invalid (${JSON.stringify(e.date_start)})`)];
  // Dated after its data was fetched: a scheduled/planned event (valid up to MAX_YEAR, but
  // what Wikipedia said then may no longer hold). Compared with the fetch day, so the
  // result depends on the data, not on when validation runs.
  const fetched = typeof e.extract_retrieved_at === "string" && ISO_DAY_RE.test(e.extract_retrieved_at);
  const asOf = fetched ? e.extract_retrieved_at.slice(0, 10) : ctx.today;
  if (e.date_start <= asOf) return [];
  return [
    warning(
      "date_start_after_retrieval",
      `date_start (${e.date_start}) is after the day its data was ${fetched ? "retrieved" : "validated"} (${asOf}): a scheduled or planned event; shown as Wikidata gives it`
    ),
  ];
}

function checkDateFlags(e) {
  if (e.date_flags != null && (!Array.isArray(e.date_flags) || e.date_flags.some((f) => typeof f !== "string" || !f))) {
    return [error("date_flags must be an array of non-empty strings")];
  }
  return [];
}

function checkDateEnd(e) {
  if (e.date_end == null) return [];
  if (!isRealDate(e.date_end, MAX_END_YEAR)) return [error(`date_end invalid (${JSON.stringify(e.date_end)})`)];
  if (!isRealDate(e.date_start) || e.date_end >= e.date_start) return [];
  // v2.1: Wikidata's own date-order errors are kept and flagged, not dropped. The order problem is
  // only tolerated (as a warning) when date_flags carries a date_order_invalid reason explaining it.
  const flags = Array.isArray(e.date_flags) ? e.date_flags.map(String) : [];
  const explained = flags.some((f) => f.startsWith("date_order_invalid"));
  // A coarse Wikidata end (e.g. the year "2002", stored as 2002-01-01) is not before the start when its
  // whole period reaches it; the pipeline then writes date_end_precision_coarse naming the precision
  // (lib/v21.js dateOrderFlags). Checked here against the stored dates, so the flag cannot excuse a real reversal.
  const coarse = flags.find((f) => f.startsWith(`${DATE_END_COARSE_FLAG}:`));
  const coarseCode = coarse ? precisionCode(/has only (.+?) precision/.exec(coarse)?.[1]) : null;
  const coarseOk = coarseCode != null && (lastDayOfPeriod(e.date_end, coarseCode) ?? "") >= e.date_start;
  if (explained) {
    return [warning("date_order_invalid", `date_end (${e.date_end}) precedes date_start (${e.date_start}) - flagged in date_flags`)];
  }
  if (coarseOk) {
    return [
      warning(
        DATE_END_COARSE_FLAG,
        `date_end (${e.date_end}) is a coarse Wikidata end (${precisionName(coarseCode)} precision) that reaches date_start (${e.date_start}) - flagged ${DATE_END_COARSE_FLAG}`
      ),
    ];
  }
  return [error(`date_end (${e.date_end}) precedes date_start (${e.date_start}) and date_flags has no date_order_invalid reason`)];
}

// The converse: a date note that no longer fits the stored dates (staleDateNotes). date_flags are shown on the
// event's page, so one is an error, as an unflagged reversal is; review_reasons are the owner's review notes
// (not shown), so a stale one is a warning, as a stale framing review is.
function checkStaleDateNotes(e) {
  const stale = staleDateNotes(e);
  return [
    ...stale.flags.map((why) => error(`date_flags: ${why}`)),
    ...stale.reasons.map((why) => warning("stale_review_reason", `review_reasons: ${why}`)),
  ];
}

function checkCountries(e) {
  if (!Array.isArray(e.countries) || e.countries.length === 0 || e.countries.some((c) => typeof c !== "string" || !c)) {
    return [error("countries must be a non-empty array of strings")];
  }
  if (!e.countries.some(isKnownCountry)) return [error(`no tracked country (inclusion rule 2): ${e.countries.join(", ")}`)];
  if (!e.countries.every(isKnownCountry)) {
    // Every tag must be a tracked country (or "regional"): one tracked name next to a misspelt or untracked one
    // (["Iraq", "Isreal"]) is a typo, not an event in two countries; the app has no shape for the other name.
    const unknown = e.countries.filter((c) => !isKnownCountry(c)).map((c) => JSON.stringify(c));
    return [error(`unknown country ${unknown.join(", ")} (each tag must be a tracked country or "regional")`)];
  }
  return [];
}

function checkCategory(e) {
  const out = [];
  if (typeof e.category !== "string" || !e.category) out.push(error("category missing"));
  else if (!CATEGORIES.includes(e.category)) out.push(error(`category must be one of ${CATEGORIES.join("|")} (got ${JSON.stringify(e.category)})`));
  else if (Array.isArray(e.wikidata_classes) && e.category !== groupForEvent(e.wikidata_classes)) {
    // The grouping rule (groupForEvent) is the only source of the group: no event keeps one set by hand.
    out.push(error(`category ${e.category} is not what the grouping rule gives for its wikidata_classes (${groupForEvent(e.wikidata_classes)})`));
  }
  if (e.category_group != null) {
    if (!CATEGORIES.includes(e.category_group)) {
      out.push(error(`category_group must be one of ${CATEGORIES.join("|")} (got ${JSON.stringify(e.category_group)})`));
    } else if (e.category_group !== e.category) {
      out.push(error(`category_group (${e.category_group}) differs from category (${e.category}); both hold the same grouping`));
    }
  }
  return out;
}

function checkExtract(e) {
  if (typeof e.extract !== "string" || !e.extract.trim()) return [error("extract missing/empty")];
  const n = e.extract.trim().length;
  if (n < MIN_EXTRACT_CHARS) {
    return [warning("short_extract", `extract is only ${n} characters (< ${MIN_EXTRACT_CHARS}); check the lead was fetched whole`)];
  }
  return [];
}

// v2.1 shape fields
function checkWikidataClasses(e) {
  if (!Array.isArray(e.wikidata_classes) || e.wikidata_classes.some((c) => typeof c !== "string" || !c)) {
    return [error("wikidata_classes must be an array of non-empty strings")];
  }
  const notEvent = notEventClasses(e.wikidata_classes);
  if (notEvent.length) {
    // "Not events" (docs/DATA_POLICY.md): merge-proposed.js removes such an entry; listed here until it does.
    return [warning("not_an_event", `not an event by its Wikidata classes (${notEvent.map((c) => c.label).join(", ")}): merge-proposed.js removes it`)];
  }
  return [];
}

// Wikidata's English aliases (scripts/refresh-sitelinks.js): absent when the item has none, never empty.
function checkWikidataAliases(e) {
  const a = e.wikidata_aliases;
  if (a !== undefined && (!Array.isArray(a) || !a.length || a.some((x) => typeof x !== "string" || !x.trim()))) {
    return [error("wikidata_aliases must be a non-empty array of non-empty strings (absent when Wikidata has none)")];
  }
  return [];
}

// A date or a timestamp; its day must be a real calendar day (not 2026-02-30).
function checkExtractRetrievedAt(e) {
  const v = e.extract_retrieved_at;
  if (typeof v !== "string" || !ISO_DAY_RE.test(v) || !isRealDate(v.slice(0, 10))) {
    return [error(`extract_retrieved_at must be an ISO date (got ${JSON.stringify(v)})`)];
  }
  return [];
}

// The revision whose lead is the stored extract, and its date (lib/revid.js): both or neither.
function checkRevision(e) {
  const out = [];
  if ("wikipedia_revid" in e && !isRevid(e.wikipedia_revid)) {
    out.push(error(`wikipedia_revid must be a positive integer when present (got ${JSON.stringify(e.wikipedia_revid)})`));
  }
  if ("wikipedia_revid_timestamp" in e && !isRevTimestamp(e.wikipedia_revid_timestamp)) {
    out.push(error(`wikipedia_revid_timestamp must be a UTC timestamp like 2026-10-15T19:38:37Z (got ${JSON.stringify(e.wikipedia_revid_timestamp)})`));
  }
  if (("wikipedia_revid" in e) !== ("wikipedia_revid_timestamp" in e)) {
    out.push(error("wikipedia_revid and wikipedia_revid_timestamp must be present together or not at all"));
  }
  return out;
}

function checkDeprecatedFields(e) {
  return "category_label" in e ? [error("category_label is deprecated and must not be present")] : [];
}

function checkLocationQuality(e) {
  if (e.location_quality == null) {
    // Required (shape v2.1): without it the coordinate checks cannot tell "no known location" from a pin.
    return [error(`location_quality missing (one of ${LOCATION_QUALITIES.join("|")})`)];
  }
  if (!LOCATION_QUALITIES.includes(e.location_quality)) {
    return [error(`location_quality must be one of ${LOCATION_QUALITIES.join("|")} (got ${JSON.stringify(e.location_quality)})`)];
  }
  return [];
}

// The warning code of the pin-in-country check, which runs only with data/boundaries.json and @turf/turf (a
// baseline entry of this code is not "gone" when the check was skipped).
export const PIN_OUTSIDE_COUNTRIES = "pin_outside_countries";

// Coordinates are required only when location_quality != "none". "none" means no real location:
// coordinates must then be null (never invented).
function checkCoordinates(e, ctx) {
  if (e.location_quality === "none") return e.coordinates != null ? [error('location_quality "none" requires coordinates: null')] : [];
  if (e.coordinates == null) {
    return ctx.lenient
      ? [warning("coordinates_missing", 'coordinates null but location_quality is not "none"')]
      : [error('coordinates missing (set location_quality "none" for events without a known location)')];
  }
  const { lat, lon } = e.coordinates;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return [error("coordinates.lat/lon must be finite numbers")];
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return [error(`coordinates out of range (${lat}, ${lon})`)];
  if (!inRegion(lat, lon)) {
    // Outside the region but inside it with lat/lon exchanged: almost certainly a swap,
    // unless this exact point was checked against both sources (fixes.js CHECKED_COORDINATES).
    const checked = coordinatesChecked(e);
    if (inRegion(lon, lat) && !checked) return [error(`coordinates look swapped (lat ${lat}, lon ${lon}); (${lon}, ${lat}) would be in the region`)];
    if (checked) {
      return [warning("outside_region_checked", `coordinates (${lat}, ${lon}) are outside the Middle East box; checked against Wikipedia and Wikidata, not swapped (docs/data-fixes.md ${checked.ref})`)];
    }
    return [warning("outside_region", `coordinates (${lat}, ${lon}) are outside the Middle East box (source: ${e.coordinate_source ?? "none"}); fine if the event happened abroad`)];
  }
  if (ctx.shapeIndex && e.location_quality === "precise" && isRealDate(e.date_start)) {
    // Inside the box only: a point outside it is outside every tracked country anyway and
    // already has its warning above (one warning per event).
    const off = pinCountryCheck(e, ctx.shapeIndex);
    if (off) {
      return [
        warning(
          PIN_OUTSIDE_COUNTRIES,
          `precise pin (${lat}, ${lon}) is ${Math.round(off.km)} km outside the ${off.year} border shapes of every tagged country (${e.countries.join(", ")}; tolerance ${PIN_TOLERANCE_KM} km, source: ${e.coordinate_source ?? "none"}${off.wide ? "; before 1920 checked against the Ottoman Empire shape" : ""}); fine if the event happened abroad`
        ),
      ];
    }
  }
  return [];
}

// location_quality <-> coordinate_source, as the pipeline pairs them.
function checkCoordinateSource(e) {
  if (!LOCATION_QUALITIES.includes(e.location_quality)) return [];
  const src = e.coordinate_source ?? null;
  const fb = typeof src === "string" ? FALLBACK_RE.exec(src) : null;
  if (e.location_quality === "none" && src !== null) {
    return [error(`location_quality "none" requires coordinate_source: null (got ${JSON.stringify(src)})`)];
  }
  if (e.location_quality === "approximate" && !(fb && fb[1] in COUNTRIES)) {
    return [error(`location_quality "approximate" requires coordinate_source "country-fallback:<tracked country>" (got ${JSON.stringify(src)})`)];
  }
  if (e.location_quality === "precise" && !PRECISE_SOURCES.includes(src)) {
    return [error(`location_quality "precise" requires coordinate_source ${PRECISE_SOURCES.join("|")} (got ${JSON.stringify(src)})`)];
  }
  return [];
}

// Inclusion rule 4 (docs/DATA_POLICY.md) and the extract both need the English article: required, and English.
function checkWikipediaUrl(e) {
  const u = e.wikipedia_url;
  if (typeof u !== "string" || !u) return [error("wikipedia_url missing (inclusion rule 4 needs an English Wikipedia article)")];
  if (!/^https:\/\/[a-z-]+\.wikipedia\.org\/wiki\//.test(u)) return [error(`wikipedia_url not a Wikipedia article URL (${u})`)];
  if (!u.startsWith(ENGLISH_WIKIPEDIA)) return [error(`wikipedia_url is not an English Wikipedia article (${u}); inclusion rule 4 needs one`)];
  return [];
}

// A date stored at a precision coarser than a day is the period's first day, as Wikidata/WDQS writes it
// (month: YYYY-MM-01; year and coarser: YYYY-01-01). Any other day means the date and its precision disagree
// (a ledger date kept with the discovery precision, or a hand edit): the app would show the wrong period.
function checkPrecisionShapes(e) {
  const out = [];
  for (const [field, pField] of [["date_start", "date_precision"], ["date_end", "date_end_precision"]]) {
    const shape = precisionShapeProblem(e[field], e[pField]);
    if (shape) out.push(error(`${field} ${e[field]} does not fit ${pField} ${JSON.stringify(e[pField])}: ${shape}`));
  }
  return out;
}

// Discovered events (they carry `sitelinks`, the count discovery saw) met inclusion rule 4 when found. The
// hand-picked seed events (data/seed-events.json; no `sitelinks`) are the allow-list: they were chosen by
// hand, not by the rule, so neither count is checked for them (docs/DATA_POLICY.md, "Honest caveat").
function checkInclusionAndPrecision(e) {
  const out = [];
  const unknownPrecision = () =>
    warning("date_precision_unknown", `date_precision ${JSON.stringify(e.date_precision)} is not a Wikidata precision name`);
  if (e.sitelinks !== undefined) {
    if (typeof e.sitelinks !== "number" || e.sitelinks < INCLUSION_MIN_SITELINKS) {
      out.push(warning("sitelinks_below_threshold", `sitelinks at discovery (${JSON.stringify(e.sitelinks)}) below the inclusion threshold of ${INCLUSION_MIN_SITELINKS} (rule 4), and it is not a hand-picked seed event`));
    } else if (typeof e.sitelinks_current === "number" && e.sitelinks_current < INCLUSION_MIN_SITELINKS) {
      out.push(warning("sitelinks_current_below_threshold", `sitelinks_current (${e.sitelinks_current}) has fallen below the inclusion threshold of ${INCLUSION_MIN_SITELINKS} (it had ${e.sitelinks} at discovery); kept, events are never dropped automatically`));
    }
    // date_precision: the Wikidata precision of the kept date_start (lib/fixes.js keptDatePrecision). null is
    // written when the kept date is no Wikidata value (a ledger date from the infobox).
    if (!("date_precision" in e)) out.push(warning("date_precision_missing", "date_precision missing (discovered events record the Wikidata precision of date_start)"));
    else if (e.date_precision !== null && precisionCode(e.date_precision) === null) out.push(unknownPrecision());
  } else if (!("date_precision" in e)) {
    // Seed events were added before date_precision existed; without it their date shows as the year only
    // (app/src/lib/eventDate.js). scripts/enrich-seed.js proposes the Wikidata value for the owner's review.
    out.push(warning("seed_date_precision_missing", "date_precision missing (hand-picked seed event; its date shows as the year only until the Wikidata precision is recorded)"));
  } else if (e.date_precision != null && precisionCode(e.date_precision) === null) out.push(unknownPrecision());
  return out;
}

// date_end_precision (optional): the Wikidata precision of the kept date_end's P582 statement (lib/fixes.js
// keptEndPrecision; scripts/backfill-end-precision.js), null when no P582 has that value. Without it the end
// shows as a year only.
function checkEndPrecision(e) {
  if (!("date_end_precision" in e)) return [];
  if (!e.date_end) return [warning("date_end_precision_without_end", "date_end_precision without a date_end")];
  if (e.date_end_precision !== null && precisionCode(e.date_end_precision) === null) {
    return [warning("date_end_precision_unknown", `date_end_precision ${JSON.stringify(e.date_end_precision)} is not a Wikidata precision name`)];
  }
  return [];
}

// Advisory flags (lib/flags.js), each a warning named by its flag; nothing is changed.
function checkAdvisoryFlags(e) {
  const out = [];
  // Years only: the title is Wikipedia's, the dates Wikidata's; neither is changed (lib/flags.js titleYearsFlag).
  if (typeof e.title === "string" && isRealDate(e.date_start)) {
    const ty = titleYearsFlag(e);
    if (ty) out.push(flagWarning(ty));
    // A day-precision start the lead's first sentence does not name, next to another day of that year (advisory).
    const ld = leadStartDayFlag(e);
    if (ld) out.push(flagWarning(ld));
  }
  // No date_end on an event the title calls ongoing, or of a class that lasts a span (lib/flags.js). Flags only.
  const pn = presentWithoutEndFlag(e);
  if (pn) out.push(flagWarning(pn));
  const dn = durativeWithoutEndFlag(e);
  if (dn) out.push(flagWarning(dn));
  // A precise pin rounded to whole degrees or tenths (app/src/lib/coordPrecision.js): the site shows it as approximate.
  const lowPin = lowPrecisionCoordinateFlag(e);
  if (lowPin) out.push(flagWarning(lowPin, "; shown on the site as an approximate location"));
  // A decade/century date stored as its first day, with no end: shown as a single year that Wikidata never gave
  // (e.g. "+2000-00-00" at century precision is the 20th century, 1901-2000, stored as 2000-01-01).
  const pc = precisionCode(e.date_precision);
  if (pc !== null && pc <= 8 && e.date_end == null) {
    out.push(warning("coarse_start_without_end", `date_start ${e.date_start} has only ${e.date_precision} precision and there is no date_end: Wikidata gives only the ${e.date_precision} ending ${String(lastDayOfPeriod(e.date_start, pc)).slice(0, 4)}, not this year or day`));
  }
  if (Array.isArray(e.countries) && e.countries.length >= MANY_COUNTRIES_WARN) {
    out.push(warning("many_countries", `tagged with ${e.countries.length} countries (>= ${MANY_COUNTRIES_WARN}): it counts once in each of them in per-country figures`));
  }
  return out;
}

// resolved_qid = the Wikidata item of the article at wikipedia_url (enrich-candidates.js).
// A different item means the URL points at another (often broader) article. Flag only.
// Borrowed coordinates (one warning per event, merged with the above):
//  - coordinate_source "redirect_target": enrich-candidates.js took the point from that other
//    article/item;
//  - coordinate_source "wikipedia" with a different resolved_qid (records written before
//    "redirect_target" existed): the Wikipedia coordinates are by construction those of the
//    article at wikipedia_url, i.e. of the other item.
//  ("wikidata" with a different resolved_qid is ambiguous - the event's own P625 or the other
//  item's - and is not reported as borrowed.)
function checkOtherItem(e) {
  const otherItem = typeof e.resolved_qid === "string" && typeof e.wikidata_qid === "string" && e.resolved_qid !== e.wikidata_qid;
  const borrowed = e.coordinates != null && (e.coordinate_source === BORROWED_SOURCE || (otherItem && e.coordinate_source === "wikipedia"));
  if (borrowed) {
    const where = otherItem ? `wikipedia_url (${e.wikipedia_url}) belongs to ${e.resolved_qid}` : "taken from the redirect target";
    return [warning("borrowed_coordinates", `coordinates are borrowed from another item (coordinate_source ${JSON.stringify(e.coordinate_source)}): ${where}, not the event's wikidata_qid ${e.wikidata_qid}; the pin is that article's location`)];
  }
  if (otherItem) return [warning("article_of_other_item", `wikipedia_url (${e.wikipedia_url}) belongs to ${e.resolved_qid}, not the event's wikidata_qid ${e.wikidata_qid}`)];
  return [];
}

// Unknown keys, and the type of each field EVENT_FIELDS gives a `check` for.
function checkFields(e) {
  const out = [];
  for (const [key, value] of Object.entries(e)) {
    if (DEPRECATED_FIELDS.has(key)) continue;
    const field = Object.hasOwn(EVENT_FIELDS, key) ? EVENT_FIELDS[key] : null;
    if (!field) out.push(error(`unknown field ${JSON.stringify(key)} (the allowed fields: EVENT_FIELDS in scripts/lib/validate.js, docs/DATA_POLICY.md "What each field is")`));
    else if (field.check && !field.check(value)) out.push(error(`${key} must be ${field.type} (got ${shortJson(value)})`));
  }
  return out;
}

// Each list once: a repeated tag counts the event twice in that country's figures; a repeated alias is noise
// (refresh-sitelinks.js keeps Wikidata's list as it is).
function checkDistinctLists(e) {
  const out = [];
  for (const key of ["countries", "wikidata_aliases"]) {
    const list = e[key];
    if (!Array.isArray(list)) continue;
    const repeated = [...new Set(list.filter((x, i) => list.indexOf(x) !== i))];
    if (repeated.length) out.push(error(`${key} lists ${repeated.map((x) => JSON.stringify(x)).join(", ")} more than once`));
  }
  return out;
}

// needs_review is derived, never set by hand: true when review_reasons or date_flags is non-empty (lib/v21.js
// finalizeEvent, lib/order-flags.js refreshOrderFlags, enrich-candidates.js; lib/fixes.js sets it with the
// data_fix reason it adds). Not judged when either list is malformed (already an error).
function checkNeedsReview(e) {
  if (typeof e.needs_review !== "boolean") return [];
  const reasons = e.review_reasons ?? [];
  const flags = e.date_flags ?? [];
  if (!Array.isArray(reasons) || !Array.isArray(flags)) return [];
  const derived = reasons.length > 0 || flags.length > 0;
  if (e.needs_review === derived) return [];
  return [error(`needs_review is ${e.needs_review}, but it is derived: ${derived} when review_reasons (${reasons.length}) or date_flags (${flags.length}) is non-empty`)];
}

// needs_manual_coordinates: true unless the event has its own precise pin. enrich-candidates.js writes
// !coordinates next to precise/none, lib/fixes.js writes false with precise and true with none, and the legacy
// country-capital ("approximate") pins carry true: the capital is no location of the event's own.
function checkNeedsManualCoordinates(e) {
  if (typeof e.needs_manual_coordinates !== "boolean" || !LOCATION_QUALITIES.includes(e.location_quality)) return [];
  const expected = e.location_quality !== "precise";
  if (e.needs_manual_coordinates === expected) return [];
  return [error(`needs_manual_coordinates is ${e.needs_manual_coordinates}, but location_quality "${e.location_quality}" gives ${expected} (true unless the pin is precise)`)];
}

// date_end_open is how Wikidata states a missing end; with a date_end the date is what counts
// (lib/wd-entities.js setDateEndOpen removes it then, and app/scripts/split-data.mjs does not publish it).
function checkDateEndOpen(e) {
  if (!("date_end_open" in e) || e.date_end == null) return [];
  return [error(`date_end_open (${shortJson(e.date_end_open)}) with a date_end (${shortJson(e.date_end)}): it is only for an event without one`)];
}

// wikipedia_lead_dates is written only next to a date_order_invalid flag (lib/v21.js finalizeEvent; lib/order-flags.js
// carries both together), for the shown date-order note (app/src/lib/dateOrderNote.js): without the flag it is stale.
function checkLeadDates(e) {
  if (!("wikipedia_lead_dates" in e)) return [];
  const flags = Array.isArray(e.date_flags) ? e.date_flags : [];
  if (flags.some((f) => typeof f === "string" && f.startsWith("date_order_invalid"))) {
    // They are the stored lead's dates (lib/lead-dates.js wikipediaLeadDates); refresh-extracts.js re-derives them with each
    // new lead (refreshLeadDates), so a mismatch is a lead written without them.
    const want = expectedLeadDates(e);
    if (!Array.isArray(e.wikipedia_lead_dates) || typeof e.extract !== "string") return [];
    if (JSON.stringify(want) === JSON.stringify(e.wikipedia_lead_dates)) return [];
    return [
      error(
        `wikipedia_lead_dates ${shortJson(e.wikipedia_lead_dates)} are not the dates the stored lead mentions (${shortJson(want ?? [])})`
      ),
    ];
  }
  return [error("wikipedia_lead_dates without a date_order_invalid flag in date_flags (it is written only next to one)")];
}

// In the order their messages come out.
const EVENT_CHECKS = [
  checkId,
  checkTitle,
  checkWikidataQid,
  checkDateStart,
  checkDateFlags,
  checkDateEnd,
  checkStaleDateNotes,
  checkCountries,
  checkCategory,
  checkExtract,
  checkWikidataClasses,
  checkWikidataAliases,
  checkExtractRetrievedAt,
  checkRevision,
  checkDeprecatedFields,
  checkLocationQuality,
  checkCoordinates,
  checkCoordinateSource,
  checkWikipediaUrl,
  checkPrecisionShapes,
  checkInclusionAndPrecision,
  checkEndPrecision,
  checkAdvisoryFlags,
  checkOtherItem,
  checkFields,
  checkDistinctLists,
  checkNeedsReview,
  checkNeedsManualCoordinates,
  checkDateEndOpen,
  checkLeadDates,
];

// ---- Checks across events ----

// Two events with the same wikipedia_url or the same extract. Expected only for events without an English
// article of their own (docs/DATA_POLICY.md, "Events without an article of their own"): their resolved_qid
// differs from their wikidata_qid, and they already carry that warning. A group is explained when
// at most one member is the article's own item; it is still listed, naming the other event(s), once per
// event (one warning for the shared wikipedia_url, saying whether the extract is identical too). Anything
// else is listed as unexplained. Returns [index, finding] pairs.
function checkSharedArticles(events) {
  const out = [];
  const ownItem = (e) => !(typeof e.resolved_qid === "string" && e.resolved_qid !== e.wikidata_qid);
  const sameText = (members) => new Set(members.map((e) => (typeof e.extract === "string" ? e.extract.trim() : ""))).size === 1;
  for (const field of ["wikipedia_url", "extract"]) {
    const groups = new Map();
    events.forEach((e, i) => {
      const v = e && typeof e === "object" && typeof e[field] === "string" ? e[field].trim() : "";
      if (!v) return;
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v).push(i);
    });
    for (const idx of groups.values()) {
      if (idx.length < 2) continue;
      const members = idx.map((i) => events[i]);
      const sameUrl = new Set(members.map((e) => e.wikipedia_url)).size === 1;
      const others = (i) => idx.filter((j) => j !== i).map((j) => events[j].id).join(", ");
      if (sameUrl && members.filter(ownItem).length <= 1) {
        // Explained: listed once per event, under the wikipedia_url group (the same extract adds no second warning).
        if (field !== "wikipedia_url") continue;
        const text = sameText(members) ? " and the same extract" : "";
        for (const i of idx) {
          const why = ownItem(events[i])
            ? "this is the article's own event"
            : `this event has no English article of its own (the article belongs to ${events[i].resolved_qid})`;
          out.push([i, warning("shared_article", `same wikipedia_url${text} as ${others(i)}: ${why}; both show this article's text`)]);
        }
        continue;
      }
      // Two or more events that each claim the shared article as their own (no resolved_qid other than their
      // wikidata_qid): one of them shows another item's text with no note on the site. An error since 2026-10-29
      // (docs/data-fixes.md, checks of 2026-10-29). The same text under different URLs stays a warning.
      const msg = (i) => `same ${field} as ${others(i)}${sameUrl ? "" : " (different wikipedia_url)"}, and not explained as an event without an article of its own`;
      for (const i of idx) out.push([i, field === "wikipedia_url" ? error(msg(i)) : warning("shared_extract", msg(i))]);
    }
  }
  return out;
}

// possible_duplicates hints must name an existing event: one in this file, or in
// opts.otherIds (the curated ids, for the proposed file, whose hints may point there).
function checkPossibleDuplicates(e, ids, otherIds) {
  if (e.possible_duplicates == null) return [];
  if (!Array.isArray(e.possible_duplicates)) return [error("possible_duplicates must be an array")];
  const out = [];
  for (const d of e.possible_duplicates) {
    const id = typeof d === "string" ? d : d?.id;
    if (!ids.has(id) && !otherIds.has(id)) {
      out.push(warning("possible_duplicate_unknown", `possible_duplicates names "${id}", which is not in ${otherIds.size ? "this file or the curated file" : "this file"}`));
    }
  }
  return out;
}

// opts.boundaries + opts.turf: data/boundaries.json and the @turf/turf module; with both, every
// precise pin is checked against its tagged countries' shapes (pinCountryCheck; a warning).
// opts.today (YYYY-MM-DD): "now" for events without extract_retrieved_at (default: today, UTC).
// Returns { errors, warnings }, each a list of { index, id, message, text } (warnings also have `code`): `text` is
// the line validateEvents gives ("<name>[<index>] <id>: <message>").
// `events` is whatever the file holds (this is what checks it): valid data is an array of
// EventRecord (app/src/lib/eventTypes.js, kept equal to EVENT_FIELDS by its test).
/** @param {unknown} events */
export function validateEventsDetailed(
  events,
  { name = "events", lenient = false, otherIds = new Set(), boundaries = null, turf = null, today = todayUtc() } = {}
) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(events)) {
    const message = "top level must be an array";
    return { errors: [{ index: null, id: null, message, text: `${name}: ${message}` }], warnings };
  }
  const add = (i, e, f) => {
    const id = e?.id ?? "(no id)";
    const item = { index: i, id, message: f.msg, text: `${name}[${i}] ${id}: ${f.msg}` };
    if (f.level === "error") errors.push(item);
    else warnings.push({ ...item, code: f.code });
  };
  const shapeIndex = boundaries && turf ? indexBoundaries(boundaries, turf) : null;
  const ctx = { lenient, today, shapeIndex, ids: new Map(), qids: new Map(), i: 0 };

  events.forEach((e, i) => {
    if (!e || typeof e !== "object") return add(i, e, error("not an object"));
    ctx.i = i;
    for (const check of EVENT_CHECKS) for (const f of check(e, ctx)) add(i, e, f);
  });
  for (const [i, f] of checkSharedArticles(events)) add(i, events[i], f);
  events.forEach((e, i) => {
    if (!e || typeof e !== "object") return;
    for (const f of checkPossibleDuplicates(e, ctx.ids, otherIds)) add(i, e, f);
  });
  return { errors, warnings };
}

// The same checks, as the lines validate-events.js prints: { errors: string[], warnings: string[] }.
export function validateEvents(events, opts = {}) {
  const { errors, warnings } = validateEventsDetailed(events, opts);
  return { errors: errors.map((x) => x.text), warnings: warnings.map((x) => x.text) };
}

// Framing-review coverage (data/framing-review.json): every event needs a review of its
// CURRENT text. "Stale" is defined as in app/scripts/split-data.mjs (framingFor) and
// app/src/lib/framingReview.test.js: the review's text_sha1 is not the first 12 hex digits
// of sha1(extract). A summary refreshed from Wikipedia may stay stale until it is
// re-reviewed, so everything here is a warning.
export const textSha1 = (text) => createHash("sha1").update(text ?? "").digest("hex").slice(0, 12);

// Both framing checks also return `items`: each warning as { id, code, text } (text = the warnings entry), for the
// warnings baseline. A review of a proposed event (proposedIds) is not an orphan: merge-proposed refuses to add an
// event that has no review yet.
export function checkFramingCoverage(events, review, { name = "framing-review", proposedIds = [] } = {}) {
  const reviews = review?.events;
  if (!reviews || typeof reviews !== "object") {
    const text = `${name}: no "events" object`;
    return { warnings: [text], items: [{ id: null, code: "framing_review_unreadable", text }], missing: 0, stale: 0, orphans: 0 };
  }
  const items = [];
  const add = (id, code, text) => items.push({ id, code, text });
  let missing = 0;
  let stale = 0;
  const ids = new Set();
  for (const e of events) {
    if (!e?.id) continue;
    ids.add(e.id);
    const r = reviews[e.id];
    if (!r) {
      missing++;
      add(e.id, "framing_review_missing", `${name}: ${e.id} has no framing review`);
    } else if (r.text_sha1 !== textSha1(e.extract)) {
      stale++;
      add(e.id, "framing_review_stale", `${name}: ${e.id} review is stale (text changed since it was reviewed; reviewed text of ${r.text_retrieved_at ?? "?"}, current text of ${e.extract_retrieved_at ?? "?"})`);
    }
  }
  const pending = new Set(proposedIds);
  const orphans = Object.keys(reviews).filter((id) => !ids.has(id) && !pending.has(id));
  for (const id of orphans) add(id, "framing_review_orphan", `${name}: review for "${id}", which is not an event`);
  return { warnings: items.map((x) => x.text), items, missing, stale, orphans: orphans.length };
}

// A framing review's data note that quotes an event's date ("The start date (2009) comes from Wikidata and is wrong")
// must quote the date the event still stores: shown on the site, it would otherwise blame a date the page no longer
// gives. Only "start date (...)" / "end date (...)" with a year or ISO date are read; other wording is not judged.
// Warnings, as the other framing-review checks are (the review file is changed only by the owner's review).
export function checkDataNotes(events, review, { name = "framing-review" } = {}) {
  const items = [];
  const reviews = review?.events;
  if (!reviews || typeof reviews !== "object") return { warnings: [], items };
  for (const e of events) {
    const note = e?.id ? reviews[e.id]?.data_note : null;
    if (typeof note !== "string") continue;
    for (const m of note.matchAll(/\b(start|end) date \((\d{4}(?:-\d\d){0,2})\)/gi)) {
      const field = m[1].toLowerCase() === "start" ? "date_start" : "date_end";
      const value = e[field];
      if (typeof value !== "string" || !value.startsWith(m[2])) {
        const text = `${name}: ${e.id} data_note quotes the ${m[1].toLowerCase()} date as ${m[2]}, but ${field} is ${value ?? "none"}: "${note}"`;
        items.push({ id: e.id, code: "framing_data_note_date", text });
      }
    }
  }
  return { warnings: items.map((x) => x.text), items };
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
