// Structural validation for event files. This checks FORMAT and internal consistency
// only - it never judges whether an event is "right" (that would be editorial).
import { createHash } from "node:crypto";
import { COUNTRIES, GROUPS, INCLUSION_MIN_SITELINKS, groupForEvent, notEventClasses } from "./event-classes.js";
import { coordinatesChecked, lastDayOfPeriod } from "./fixes.js";
import { precisionName, precisionCode } from "./wiki.js";
import { lowPrecisionCoordinateFlag, titleYearsFlag } from "./flags.js";
import { isRevid, isRevTimestamp } from "./revid.js";
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
export const RESERVED_IDS = new Set([
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
export const LOCATION_QUALITIES = ["precise", "approximate", "none"];

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
export const PRECISE_SOURCES = ["wikipedia", "wikidata", "manual-override", BORROWED_SOURCE];
// coordinate_source for a point read from the Wikipedia article at wikipedia_url: when that
// article belongs to another item than the event's (otherItem), the point is borrowed.
export const borrowedSource = (source, otherItem) => (otherItem && source === "wikipedia" ? BORROWED_SOURCE : source);
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

// A precise pin is checked against the border shapes of the event's tagged countries in its
// start year (the same country -> shape table the map uses to shade countries,
// app/src/lib/eventCountries.js COUNTRY_SHAPES). Points within this distance of a shape count
// as inside it: coastal battles and border crossings sit on or just off the drawn line.
export const PIN_TOLERANCE_KM = 5;

// Warnings only. An event tagged with this many countries counts in each of them (per-country figures); the
// region-wide events (world wars, regional conflicts) carry 8-15 tags. lib/flags.js already flags > 4 as
// many_countries in review_reasons; this is the validator's listing of the extreme ones.
export const MANY_COUNTRIES_WARN = 8;
const ENGLISH_WIKIPEDIA = "https://en.wikipedia.org/wiki/";

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}/;
const todayUtc = () => new Date().toISOString().slice(0, 10);

// Index of data/boundaries.json features by name, with bounding boxes, for pinCountryCheck.
export function indexBoundaries(boundaries, turf) {
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

// Shortest distance (km) from a point to a polygon feature's rings.
function distanceToRingsKm(turf, pt, f) {
  const g = f.geometry;
  const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  let best = Infinity;
  for (const rings of polys) {
    for (const ring of rings) best = Math.min(best, turf.pointToLineDistance(pt, turf.lineString(ring), { units: "kilometers" }));
  }
  return best;
}

// For a precise pin: null when the point lies inside (or within PIN_TOLERANCE_KM of) a shape of
// at least one tagged country in the event's start year, or when that cannot be checked (no
// tagged country, or one of them, has no shape that year: e.g. "regional", Kuwait before
// 1961). Otherwise { year, km } with the distance to the nearest of those shapes.
export function pinCountryCheck(e, index) {
  const { byName, turf } = index;
  const year = Number(String(e.date_start).slice(0, 4));
  const countries = Array.isArray(e.countries) ? e.countries : [];
  const perCountry = countries.map((c) =>
    shapeNamesFor(c, year).flatMap((n) => (byName.get(n) ?? []).filter((s) => s.from <= year && year <= s.to))
  );
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
  return { year, km };
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

// opts.lenient: curated data.events.json may hold events that still
// need manual coordinates (reported as warnings, not errors). The proposed file may not.
//
// KNOWN_DUPLICATE_QIDS: pre-existing duplicates in curated data awaiting the user's
// decision (we never edit curated data automatically). Downgraded to warnings in lenient
// (curated) mode so CI stays green; any NEW duplicate still fails.
//   Q2429253: curated "Islamic State of Iraq and the Levant" (2013) and "Islamic State"
//   (2014) are two seed titles that resolve to the same Wikipedia article.
export const KNOWN_DUPLICATE_QIDS = new Set([]);

// opts.boundaries + opts.turf: data/boundaries.json and the @turf/turf module; with both, every
// precise pin is checked against its tagged countries' shapes (pinCountryCheck; a warning).
// opts.today (YYYY-MM-DD): "now" for events without extract_retrieved_at (default: today, UTC).
export function validateEvents(
  events,
  { name = "events", lenient = false, otherIds = new Set(), boundaries = null, turf = null, today = todayUtc() } = {}
) {
  const errors = [];
  const warnings = [];
  const shapeIndex = boundaries && turf ? indexBoundaries(boundaries, turf) : null;
  const err = (i, e, msg) => errors.push(`${name}[${i}] ${e?.id ?? "(no id)"}: ${msg}`);
  const warn = (i, e, msg) => warnings.push(`${name}[${i}] ${e?.id ?? "(no id)"}: ${msg}`);

  if (!Array.isArray(events)) return { errors: [`${name}: top level must be an array`], warnings };

  const ids = new Map();
  const qids = new Map();

  events.forEach((e, i) => {
    if (!e || typeof e !== "object") return err(i, e, "not an object");

    const idProblem = eventIdProblem(e.id);
    if (idProblem) err(i, e, idProblem);
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
    else {
      // Dated after its data was fetched: a scheduled/planned event (valid up to MAX_YEAR, but
      // what Wikipedia said then may no longer hold). Compared with the fetch day, so the
      // result depends on the data, not on when validation runs.
      const fetched = typeof e.extract_retrieved_at === "string" && ISO_DAY_RE.test(e.extract_retrieved_at);
      const asOf = fetched ? e.extract_retrieved_at.slice(0, 10) : today;
      if (e.date_start > asOf) {
        warn(i, e, `date_start (${e.date_start}) is after the day its data was ${fetched ? "retrieved" : "validated"} (${asOf}): a scheduled or planned event; shown as Wikidata gives it`);
      }
    }
    if (e.date_flags != null && (!Array.isArray(e.date_flags) || e.date_flags.some((f) => typeof f !== "string" || !f))) {
      err(i, e, "date_flags must be an array of non-empty strings");
    }
    if (e.date_end != null) {
      if (!isRealDate(e.date_end, MAX_END_YEAR)) err(i, e, `date_end invalid (${JSON.stringify(e.date_end)})`);
      else if (isRealDate(e.date_start) && e.date_end < e.date_start) {
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
        if (explained) warnings.push(`${name}[${i}] ${e.id}: date_end (${e.date_end}) precedes date_start (${e.date_start}) - flagged in date_flags`);
        else if (coarseOk) warn(i, e, `date_end (${e.date_end}) is a coarse Wikidata end (${precisionName(coarseCode)} precision) that reaches date_start (${e.date_start}) - flagged ${DATE_END_COARSE_FLAG}`);
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
    else if (Array.isArray(e.wikidata_classes) && e.category !== groupForEvent(e.wikidata_classes)) {
      // The grouping rule (groupForEvent) is the only source of the group: no event keeps one set by hand.
      err(i, e, `category ${e.category} is not what the grouping rule gives for its wikidata_classes (${groupForEvent(e.wikidata_classes)})`);
    }
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
    } else if (notEventClasses(e.wikidata_classes).length) {
      // "Not events" (docs/DATA_POLICY.md): merge-proposed.js removes such an entry; listed here until it does.
      warn(i, e, `not an event by its Wikidata classes (${notEventClasses(e.wikidata_classes).map((c) => c.label).join(", ")}): merge-proposed.js removes it`);
    }
    // Wikidata's English aliases (scripts/refresh-sitelinks.js): absent when the item has none, never empty.
    if (
      e.wikidata_aliases !== undefined &&
      (!Array.isArray(e.wikidata_aliases) || !e.wikidata_aliases.length || e.wikidata_aliases.some((a) => typeof a !== "string" || !a.trim()))
    ) {
      err(i, e, "wikidata_aliases must be a non-empty array of non-empty strings (absent when Wikidata has none)");
    }
    // A date or a timestamp; its day must be a real calendar day (not 2026-02-30).
    if (typeof e.extract_retrieved_at !== "string" || !ISO_DAY_RE.test(e.extract_retrieved_at) || !isRealDate(e.extract_retrieved_at.slice(0, 10))) {
      err(i, e, `extract_retrieved_at must be an ISO date (got ${JSON.stringify(e.extract_retrieved_at)})`);
    }
    // The revision whose lead is the stored extract, and its date (lib/revid.js): both or neither.
    if ("wikipedia_revid" in e && !isRevid(e.wikipedia_revid)) {
      err(i, e, `wikipedia_revid must be a positive integer when present (got ${JSON.stringify(e.wikipedia_revid)})`);
    }
    if ("wikipedia_revid_timestamp" in e && !isRevTimestamp(e.wikipedia_revid_timestamp)) {
      err(i, e, `wikipedia_revid_timestamp must be a UTC timestamp like 2026-10-15T19:38:37Z (got ${JSON.stringify(e.wikipedia_revid_timestamp)})`);
    }
    if (("wikipedia_revid" in e) !== ("wikipedia_revid_timestamp" in e)) {
      err(i, e, "wikipedia_revid and wikipedia_revid_timestamp must be present together or not at all");
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
        // Outside the region but inside it with lat/lon exchanged: almost certainly a swap,
        // unless this exact point was checked against both sources (fixes.js CHECKED_COORDINATES).
        const checked = coordinatesChecked(e);
        if (inRegion(lon, lat) && !checked) err(i, e, `coordinates look swapped (lat ${lat}, lon ${lon}); (${lon}, ${lat}) would be in the region`);
        else if (checked) warn(i, e, `coordinates (${lat}, ${lon}) are outside the Middle East box; checked against Wikipedia and Wikidata, not swapped (docs/data-fixes.md ${checked.ref})`);
        else warn(i, e, `coordinates (${lat}, ${lon}) are outside the Middle East box (source: ${e.coordinate_source ?? "none"}); fine if the event happened abroad`);
      } else if (shapeIndex && e.location_quality === "precise" && isRealDate(e.date_start)) {
        // Inside the box only: a point outside it is outside every tracked country anyway and
        // already has its warning above (one warning per event).
        const off = pinCountryCheck(e, shapeIndex);
        if (off) {
          warn(i, e, `precise pin (${lat}, ${lon}) is ${Math.round(off.km)} km outside the ${off.year} border shapes of every tagged country (${e.countries.join(", ")}; tolerance ${PIN_TOLERANCE_KM} km, source: ${e.coordinate_source ?? "none"}); fine if the event happened abroad`);
        }
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
    } else if (e.wikipedia_url != null && !e.wikipedia_url.startsWith(ENGLISH_WIKIPEDIA)) {
      // Inclusion rule 4 and the extract both need the English article.
      warn(i, e, `wikipedia_url is not an English Wikipedia article (${e.wikipedia_url}); inclusion rule 4 needs one`);
    }

    // Discovered events (they carry `sitelinks`, the count discovery saw) met inclusion rule 4 when found. The
    // hand-picked seed events (data/seed-events.json; no `sitelinks`) are the allow-list: they were chosen by
    // hand, not by the rule, so neither count is checked for them (docs/DATA_POLICY.md, "Honest caveat").
    const discovered = e.sitelinks !== undefined;
    if (discovered) {
      if (typeof e.sitelinks !== "number" || e.sitelinks < INCLUSION_MIN_SITELINKS) {
        warn(i, e, `sitelinks at discovery (${JSON.stringify(e.sitelinks)}) below the inclusion threshold of ${INCLUSION_MIN_SITELINKS} (rule 4), and it is not a hand-picked seed event`);
      } else if (typeof e.sitelinks_current === "number" && e.sitelinks_current < INCLUSION_MIN_SITELINKS) {
        warn(i, e, `sitelinks_current (${e.sitelinks_current}) has fallen below the inclusion threshold of ${INCLUSION_MIN_SITELINKS} (it had ${e.sitelinks} at discovery); kept, events are never dropped automatically`);
      }
      // date_precision: the Wikidata precision of the kept date_start (lib/fixes.js keptDatePrecision). null is
      // written when the kept date is no Wikidata value (a ledger date from the infobox).
      if (!("date_precision" in e)) warn(i, e, "date_precision missing (discovered events record the Wikidata precision of date_start)");
      else if (e.date_precision !== null && precisionCode(e.date_precision) === null) {
        warn(i, e, `date_precision ${JSON.stringify(e.date_precision)} is not a Wikidata precision name`);
      }
    } else if (!("date_precision" in e)) {
      // Seed events were added before date_precision existed; without it their date shows as the year only
      // (app/src/lib/eventDate.js). scripts/enrich-seed.js proposes the Wikidata value for the owner's review.
      warn(i, e, "date_precision missing (hand-picked seed event; its date shows as the year only until the Wikidata precision is recorded)");
    } else if (e.date_precision != null && precisionCode(e.date_precision) === null) {
      warn(i, e, `date_precision ${JSON.stringify(e.date_precision)} is not a Wikidata precision name`);
    }
    // Years only: the title is Wikipedia's, the dates Wikidata's; neither is changed (lib/flags.js titleYearsFlag).
    if (typeof e.title === "string" && isRealDate(e.date_start)) {
      const ty = titleYearsFlag(e);
      if (ty) warn(i, e, ty);
    }
    // A precise pin rounded to whole degrees or tenths (app/src/lib/coordPrecision.js): the site shows it as approximate.
    const lowPin = lowPrecisionCoordinateFlag(e);
    if (lowPin) warn(i, e, `${lowPin}; shown on the site as an approximate location`);
    // A decade/century date stored as its first day, with no end: shown as a single year that Wikidata never gave
    // (e.g. "+2000-00-00" at century precision is the 20th century, 1901-2000, stored as 2000-01-01).
    const pc = precisionCode(e.date_precision);
    if (pc !== null && pc <= 8 && e.date_end == null) {
      warn(i, e, `date_start ${e.date_start} has only ${e.date_precision} precision and there is no date_end: Wikidata gives only the ${e.date_precision} ending ${String(lastDayOfPeriod(e.date_start, pc)).slice(0, 4)}, not this year or day`);
    }
    if (Array.isArray(e.countries) && e.countries.length >= MANY_COUNTRIES_WARN) {
      warn(i, e, `tagged with ${e.countries.length} countries (>= ${MANY_COUNTRIES_WARN}): it counts once in each of them in per-country figures`);
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
    const otherItem = typeof e.resolved_qid === "string" && typeof e.wikidata_qid === "string" && e.resolved_qid !== e.wikidata_qid;
    const borrowed =
      e.coordinates != null && (e.coordinate_source === BORROWED_SOURCE || (otherItem && e.coordinate_source === "wikipedia"));
    if (borrowed) {
      warn(
        i,
        e,
        `coordinates are borrowed from another item (coordinate_source ${JSON.stringify(e.coordinate_source)}): ${
          otherItem ? `wikipedia_url (${e.wikipedia_url}) belongs to ${e.resolved_qid}` : "taken from the redirect target"
        }, not the event's wikidata_qid ${e.wikidata_qid}; the pin is that article's location`
      );
    } else if (otherItem) {
      warn(i, e, `wikipedia_url (${e.wikipedia_url}) belongs to ${e.resolved_qid}, not the event's wikidata_qid ${e.wikidata_qid}`);
    }
  });

  // Two events with the same wikipedia_url or the same extract. Expected only for events without an English
  // article of their own (docs/DATA_POLICY.md, "Events without an article of their own"): their resolved_qid
  // differs from their wikidata_qid, and they already carry that warning above. A group is explained when
  // at most one member is the article's own item; it is still listed, naming the other event(s), once per
  // event (one warning for the shared wikipedia_url, saying whether the extract is identical too). Anything
  // else is listed as unexplained.
  const ownItem = (e) => !(typeof e.resolved_qid === "string" && e.resolved_qid !== e.wikidata_qid);
  const sameText = (members) => new Set(members.map((e) => (typeof e.extract === "string" ? e.extract.trim() : ""))).size === 1;
  for (const [field, label] of [["wikipedia_url", "wikipedia_url"], ["extract", "extract"]]) {
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
          warn(i, events[i], `same wikipedia_url${text} as ${others(i)}: ${why}; both show this article's text`);
        }
        continue;
      }
      for (const i of idx) warn(i, events[i], `same ${label} as ${others(i)}${sameUrl ? "" : " (different wikipedia_url)"}, and not explained as an event without an article of its own`);
    }
  }

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
