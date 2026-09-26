// Structural validation for event files. This checks FORMAT and internal consistency
// only - it never judges whether an event is "right" (that would be editorial).
const ID_RE = /^[a-z0-9-]+$/;
const QID_RE = /^Q[1-9][0-9]*$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const MIN_YEAR = 1000;
export const MAX_YEAR = 3000;

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
export const KNOWN_DUPLICATE_QIDS = new Set(["Q2429253"]);

export function validateEvents(events, { name = "events", lenient = false } = {}) {
  const errors = [];
  const warnings = [];
  const err = (i, e, msg) => errors.push(`${name}[${i}] ${e?.id ?? "(no id)"}: ${msg}`);

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
    if (e.date_end != null) {
      if (!isRealDate(e.date_end)) err(i, e, `date_end invalid (${JSON.stringify(e.date_end)})`);
      else if (isRealDate(e.date_start) && e.date_end < e.date_start) {
        err(i, e, `date_end (${e.date_end}) precedes date_start (${e.date_start})`);
      }
    }

    if (!Array.isArray(e.countries) || e.countries.length === 0 || e.countries.some((c) => typeof c !== "string" || !c)) {
      err(i, e, "countries must be a non-empty array of strings");
    }
    if (typeof e.category !== "string" || !e.category) err(i, e, "category missing");

    if (typeof e.extract !== "string" || !e.extract.trim()) err(i, e, "extract missing/empty");

    if (e.coordinates == null) {
      if (lenient) warnings.push(`${name}[${i}] ${e.id}: coordinates null (needs manual coordinates)`);
      else err(i, e, "coordinates missing");
    } else {
      const { lat, lon } = e.coordinates;
      if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        err(i, e, "coordinates.lat/lon must be finite numbers");
      } else if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        err(i, e, `coordinates out of range (${lat}, ${lon})`);
      }
    }

    if (e.wikipedia_url != null && !/^https:\/\/[a-z-]+\.wikipedia\.org\/wiki\//.test(e.wikipedia_url)) {
      err(i, e, `wikipedia_url not a Wikipedia article URL (${e.wikipedia_url})`);
    }
  });

  return { errors, warnings };
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
