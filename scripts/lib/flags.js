// Flag-only accuracy checks. Nothing here ever changes event data; every function
// returns hints/reasons that are attached to the event as review notes.
import { haversineKm, COUNTRY_CAPITALS } from "./geo.js";
import { yearOf } from "./wiki.js";

export const MAX_COUNTRIES_BEFORE_FLAG = 4;
export const COORD_FAR_KM = 1500;

// Years in Wikipedia category names ("1990 in Kuwait", "Conflicts in 1990"), non-hidden only.
export function categoryYears(categories) {
  const ys = new Set();
  for (const c of categories ?? []) for (const m of c.matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)) ys.add(Number(m[1]));
  return [...ys];
}

const within = (years, lo, hi, tol = 1) => years.some((y) => y >= lo - tol && y <= hi + tol);

// Date cross-checks against the resolved Wikipedia extract and its year categories.
export function dateFlags({ dateStart, dateEnd, extractYears, catYears }) {
  const flags = [];
  const sy = yearOf(dateStart);
  const ey = yearOf(dateEnd);
  const hi = ey ?? sy;

  if (dateStart && dateEnd && dateEnd < dateStart) {
    flags.push(`date_order_invalid: date_end (${dateEnd}) precedes date_start (${dateStart}) in source Wikidata`);
  }

  const catConfirms = sy !== null && catYears.length > 0 && within(catYears, sy, sy);
  if (extractYears.length === 0) {
    if (!catConfirms) {
      flags.push(
        `unverified_date: no year appears in the Wikipedia extract${
          catYears.length ? ` and category years [${catYears.join(", ")}] do not confirm ${sy}` : " and no year category is available"
        }; the Wikidata date could not be cross-checked`
      );
    }
  } else if (sy !== null && !within(extractYears, sy, sy)) {
    flags.push(
      `date_year_mismatch: date_start year (${sy}) not found (within 1 year) in Wikipedia extract, which mentions [${extractYears.join(", ")}]`
    );
  } else if (ey !== null && !within(extractYears, ey, ey)) {
    flags.push(
      `date_end_year_mismatch: date_end year (${ey}) not found (within 1 year) in Wikipedia extract, which mentions [${extractYears.join(", ")}]`
    );
  }

  if (catYears.length > 0 && sy !== null && !within(catYears, sy, hi)) {
    flags.push(
      `category_year_mismatch: Wikipedia year categories mention [${catYears.join(", ")}] but none is within 1 year of ${sy}${
        hi !== sy ? `-${hi}` : ""
      }`
    );
  }
  return flags;
}

export function coordinateFlag(coordinates, countries) {
  if (!coordinates) return null;
  const refs = (countries ?? []).map((c) => COUNTRY_CAPITALS[c]).filter(Boolean);
  if (!refs.length) return null;
  const nearest = Math.min(...refs.map((r) => haversineKm(coordinates, r)));
  return nearest > COORD_FAR_KM
    ? `coordinate_far_from_countries: point is ${Math.round(nearest)} km from the nearest tagged country's reference point (${countries.join(", ")})`
    : null;
}

// ---------- duplicate hints (never auto-drop) ----------
export function normTitle(t) {
  return (t ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

const STOP = new Set(["the", "of", "a", "an", "and", "in", "on", "at", "to", "for", "de", "la", "al"]);
function tokens(t) {
  return new Set(
    (t ?? "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !STOP.has(w))
  );
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// events: [{id,title,wikidata_qid,resolved_qid,date_start,coordinates,countries,precise}]
// returns Map(id -> [{id,title,reason}]) for events in `targetIds`.
export function duplicateHints(events, targetIds) {
  const out = new Map();
  const add = (a, b, reason) => {
    if (!targetIds.has(a.id)) return;
    const list = out.get(a.id) ?? [];
    if (!list.some((h) => h.id === b.id)) list.push({ id: b.id, title: b.title, reason });
    out.set(a.id, list);
  };
  const info = events.map((e) => ({
    e,
    norm: normTitle(e.title),
    tok: tokens(e.title),
    year: yearOf(e.date_start),
    qids: new Set([e.wikidata_qid, e.resolved_qid].filter(Boolean)),
  }));
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const A = info[i];
      const B = info[j];
      if (!targetIds.has(A.e.id) && !targetIds.has(B.e.id)) continue;
      let reason = null;
      if ([...A.qids].some((q) => B.qids.has(q))) reason = "same Wikidata item (QID / resolved QID)";
      else if (A.norm && A.norm === B.norm) reason = "same normalised title";
      else if (
        A.year !== null && B.year !== null && Math.abs(A.year - B.year) <= 1 &&
        jaccard(A.tok, B.tok) >= 0.6
      ) {
        const bothPrecise = A.e.precise && B.e.precise && A.e.coordinates && B.e.coordinates;
        const near = bothPrecise
          ? haversineKm(A.e.coordinates, B.e.coordinates) <= 150
          : (A.e.countries ?? []).some((c) => (B.e.countries ?? []).includes(c));
        if (near) reason = "similar title, date within 1 year and nearby / same country";
      }
      if (reason) {
        add(A.e, B.e, reason);
        add(B.e, A.e, reason);
      }
    }
  }
  return out;
}
