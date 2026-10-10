// Wikipedia / Wikidata fetch helpers (read-only; this pipeline never writes to either).
import { politeFetch } from "./http.js";

const PRECISION_NAMES = {
  0: "billion years", 1: "hundred million years", 2: "ten million years", 3: "million years",
  4: "hundred thousand years", 5: "ten thousand years", 6: "millennium", 7: "century",
  8: "decade", 9: "year", 10: "month", 11: "day", 12: "hour", 13: "minute", 14: "second",
};
export const precisionName = (p) => PRECISION_NAMES[p] ?? null;

export async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await politeFetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  return res.json();
}

function bestClaims(claims) {
  // preferred rank first, then normal; deprecated ignored
  const list = (claims ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak?.datavalue);
  const pref = list.filter((c) => c.rank === "preferred");
  return pref.length ? pref : list;
}

function timeValue(claim) {
  const v = claim?.mainsnak?.datavalue?.value;
  if (!v?.time) return null;
  // Wikidata: "+1990-08-02T00:00:00Z" (may be "+1990-00-00" when precision < day)
  return { date: v.time.replace(/^\+/, "").slice(0, 10), precision: v.precision };
}

// One entity fetch gives: P625 coordinates, the time precision of the event date (P585,
// else P580 - the same COALESCE the discovery query uses), P361 (part of), and sitelinks.
export async function fetchEntity(qid) {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const res = await politeFetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const ent = data.entities?.[qid] ?? Object.values(data.entities ?? {})[0];
  if (!ent) return null;
  const claims = ent.claims ?? {};

  const p625 = bestClaims(claims.P625)[0]?.mainsnak?.datavalue?.value;
  const coordinates = p625 ? { lat: p625.latitude, lon: p625.longitude } : null;

  const times = (prop) => bestClaims(claims[prop]).map(timeValue).filter(Boolean);
  const pit = times("P585");
  const start = times("P580");
  const end = times("P582");

  const partOf = bestClaims(claims.P361)
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);

  return {
    coordinates,
    pit,
    start,
    end,
    partOf,
    sitelinks: Object.keys(ent.sitelinks ?? {}).length,
    enLabel: ent.labels?.en?.value ?? null,
  };
}

// Precision of the date actually held as date_start: match the stored day among the
// candidate P585/P580 values; fall back to the first value.
export function datePrecisionFor(entity, dateStart) {
  if (!entity) return null;
  const pool = entity.pit.length ? entity.pit : entity.start;
  if (!pool.length) return null;
  const hit = pool.find((t) => t.date === dateStart) ?? pool[0];
  return { code: hit.precision, name: precisionName(hit.precision) };
}

// Non-hidden categories of an English Wikipedia article (for the year cross-check).
export async function fetchCategories(title) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&prop=categories&cllimit=max&clshow=!hidden" +
    `&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  const res = await politeFetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const page = data.query?.pages?.[0];
  return (page?.categories ?? []).map((c) => c.title.replace(/^Category:/, ""));
}

// English labels of many items. A failed chunk throws (as fetchLabelsCached in wd-entities.js
// does): skipping it would leave those labels null, and a part_of note would then show a bare
// QID with nothing to say the label was not fetched.
export async function fetchLabels(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 50) {
    const chunk = qids.slice(i, i + 50);
    const url =
      "https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels&languages=en&format=json&ids=" +
      chunk.join("|");
    const res = await politeFetch(url);
    if (!res.ok) throw new Error(`labels HTTP ${res.status}`);
    const data = await res.json();
    for (const [q, ent] of Object.entries(data.entities ?? {})) out[q] = ent.labels?.en?.value ?? null;
  }
  return out;
}

export function yearsIn(text, { min = 1000, max = 2099 } = {}) {
  if (!text) return [];
  const m = text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g);
  return m ? [...new Set(m.map(Number))].filter((y) => y >= min && y <= max) : [];
}

export function yearOf(dateStr) {
  if (!dateStr) return null;
  const m = /^(-?\d{1,4})/.exec(dateStr);
  return m ? Number(m[1]) : null;
}
