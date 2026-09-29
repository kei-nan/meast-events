// Data-shape v2.1 helpers shared by enrich-candidates.js, apply-v21.js and refresh-extracts.js.
// Nothing here rewrites Wikipedia/Wikidata content: it copies it, or FLAGS a discrepancy.
import { EVENT_CLASSES, COUNTRIES, QID_TO_COUNTRY, groupForEvent } from "./event-classes.js";
import { yearsIn, yearOf } from "./wiki.js";
import { titleFromWikipediaUrl } from "./lead.js";
import { applyDataFix, reconcileStartDate } from "./fixes.js";

export const CLASS_GROUP = Object.fromEntries(EVENT_CLASSES.map((c) => [c.label, c.category]));

// wikidata_classes = labels of ALL the item's P31 (instance of) statements, in Wikidata's statement
// order (deprecated-rank statements excluded), then - appended in discovery order - the labels of the
// discovery classes the item matched via subclass (P279*) that are not already a direct P31 label.
// No de-duplication by our preference, no re-ordering. A class without an English label shows its QID.
export function buildWikidataClasses(entity, labels, matchedClasses = []) {
  const direct = (entity?.p31 ?? []).map((q) => labels[q] ?? q);
  const out = [];
  for (const l of direct) if (!out.includes(l)) out.push(l); // same label twice = same class, listed once
  for (const l of matchedClasses) if (!out.includes(l)) out.push(l);
  return out;
}

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RES = [
  new RegExp(`\\b\\d{1,2} (?:${MONTHS}) \\d{4}\\b`, "g"),
  new RegExp(`\\b(?:${MONTHS}) \\d{1,2}, \\d{4}\\b`, "g"),
];

// NOTE only (never changes dates): what the Wikipedia article's lead says about the dates,
// next to what Wikidata gives. Returns a string or null when the lead offers nothing to compare.
export function wikipediaDatesNote({ date_start, date_end, extract }) {
  if (!extract) return null;
  const full = [];
  for (const re of DATE_RES) for (const m of extract.matchAll(re)) full.push(m[0]);
  const years = yearsIn(extract);
  if (!years.length && !full.length) return "Wikipedia lead gives no year to compare with";
  const sy = yearOf(date_start);
  const ey = yearOf(date_end);
  const shown = full.slice(0, 4).join("; ");
  return (
    `Wikipedia lead mentions ${shown ? `${shown}` : `years ${years.slice(0, 6).join(", ")}`}` +
    `; Wikidata gives ${date_start ?? "?"}${date_end ? ` to ${date_end}` : ""}` +
    (sy !== null && years.length && !years.some((y) => Math.abs(y - sy) <= 1) ? ` (start year ${sy} not in lead)` : "") +
    (ey !== null && years.length && !years.some((y) => Math.abs(y - ey) <= 1) ? ` (end year ${ey} not in lead)` : "")
  );
}

export function dateOrderFlags({ date_start, date_end, extract }) {
  if (!(date_start && date_end && date_end < date_start)) return [];
  const flags = [`date_order_invalid: Wikidata start (${date_start}) is after end (${date_end}); shown as Wikidata gives them`];
  const note = wikipediaDatesNote({ date_start, date_end, extract });
  if (note) flags.push(`wikipedia_dates_note: ${note}`);
  return flags;
}

// Countries (tracked-set names) that Wikidata itself supports for an item, split by source:
// direct P17 vs. P17 of the P276/P131 places. Also returns all raw P17 QIDs (any country).
export function wikidataCountries(entity, placeEntities) {
  const direct = new Set((entity?.p17 ?? []).map((q) => QID_TO_COUNTRY[q]).filter(Boolean));
  const viaPlace = new Set();
  for (const pq of [...(entity?.p276 ?? []), ...(entity?.p131 ?? [])]) {
    for (const c of placeEntities.get(pq)?.p17 ?? []) if (QID_TO_COUNTRY[c]) viaPlace.add(QID_TO_COUNTRY[c]);
  }
  return { direct: [...direct], viaPlace: [...viaPlace], rawP17: entity?.p17 ?? [] };
}

export { COUNTRIES, QID_TO_COUNTRY };

// Location rule: a place (P276/P131) only lends its countries to an event when at least as
// many of the present-day sovereign states it lists are inside the tracked region as outside
// it. Seas and regions that mostly belong to other countries - the Mediterranean (6 in / 16
// out), Black Sea, Sahara, Sahel, North Africa, Gulf of Aden, Bab-el-Mandeb - lend nothing, so
// a WWII convoy off Malta is no longer tagged Israel/Palestine, Lebanon, Syria, Turkey and Egypt.
// Historical predecessors (Ottoman Empire, Mandatory Palestine) are not sovereign states today
// and count on neither side.
export function placeIsMostlyInRegion(place, sovereign) {
  const p17 = place?.p17 ?? [];
  const inside = p17.filter((q) => QID_TO_COUNTRY[q]).length;
  const outside = p17.filter((q) => !QID_TO_COUNTRY[q] && sovereign.has(q)).length;
  return outside <= inside;
}

// Tracked country tags that only a mostly-outside place supports. Only ever REMOVES tags:
// re-deriving all tags from today's Wikidata would also add ones nobody reviewed.
// Applies to discovered events only (they carry `sitelinks`): the 112 legacy events' tags were
// typed by hand in seed-events.json, not derived from places, so there is nothing to undo.
export function tagsFromOutsidePlaces(event, entity, placeEntities, sovereign) {
  if (!entity || event.sitelinks == null) return [];
  const supported = new Set((entity.p17 ?? []).map((q) => QID_TO_COUNTRY[q]).filter(Boolean));
  const outsideOnly = new Set();
  for (const pq of [...(entity.p276 ?? []), ...(entity.p131 ?? [])]) {
    const place = placeEntities.get(pq);
    const tags = (place?.p17 ?? []).map((q) => QID_TO_COUNTRY[q]).filter(Boolean);
    if (placeIsMostlyInRegion(place, sovereign)) tags.forEach((t) => supported.add(t));
    else tags.forEach((t) => outsideOnly.add(t));
  }
  return (event.countries ?? []).filter((c) => c in COUNTRIES && outsideOnly.has(c) && !supported.has(c));
}

// Inclusion rule 2: at least one of the 15 tracked countries/territories. "regional" is the
// hand-assigned tag of a few legacy events that concern the whole region.
export const hasTrackedCountry = (event) => (event.countries ?? []).some((c) => c in COUNTRIES || c === "regional");

// title-vs-lead mismatch: article title (from URL) is not the record title AND record title is not in lead.
export function normText(s) {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function titleMismatch(event, urlTitle, extract) {
  if (!urlTitle || !extract) return false;
  const t = normText(event.title);
  return normText(urlTitle) !== t && !normText(extract).includes(t);
}

// ---------------------------------------------------------------------------------------------
// Shared v2.1 finalisation used by enrich-candidates.js (proposed events) and apply-v21.js
// (curated events). Copies Wikipedia/Wikidata content; only ever ADDS flags.
// ---------------------------------------------------------------------------------------------
const dropPrefix = (list, prefixes) => (list ?? []).filter((r) => !prefixes.some((p) => r.startsWith(p)));

// ctx: { leads: Map(urlTitle -> lead|null), entities: Map(qid -> entity|null), places: Map(qid -> entity),
//        labels: {qid: label}, matched: Map(qid -> [discovery class labels]), sovereign: Set(qid),
//        reconcileDates: boolean }
export function finalizeEvent(ev, ctx) {
  const urlTitle = titleFromWikipediaUrl(ev.wikipedia_url) ?? ev.title;
  const lead = ctx.leads.get(urlTitle) ?? null;
  const entity = ctx.entities.get(ev.wikidata_qid) ?? null;

  // 1. full lead
  if (lead?.extract) {
    ev.extract = lead.extract;
    ev.extract_retrieved_at = lead.retrieved_at.slice(0, 10);
  } else if (ev.extract && !ev.extract_retrieved_at) {
    ev.extract_retrieved_at = (ev.retrieved_at ?? new Date().toISOString()).slice(0, 10);
  }

  // 2. classes + our coarse grouping
  ev.wikidata_classes = buildWikidataClasses(entity, ctx.labels, ctx.matched.get(ev.wikidata_qid) ?? []);
  const group = groupForEvent(ev.wikidata_classes, ev.category_group ?? (CLASS_GROUP[ev.category] ?? ev.category));
  ev.category = group;
  ev.category_group = group;
  delete ev.category_label;

  // 3. date source reconciliation (candidates only), then the verified-fix ledger
  ev.review_reasons = [...(ev.review_reasons ?? [])];
  let dateFlags = (ev.date_flags ?? []).filter((f) => !f.startsWith("date_source_adjusted"));
  if (ctx.reconcileDates) {
    const r = reconcileStartDate(ev.date_start, entity);
    if (r) {
      dateFlags.push(`date_source_adjusted: ${r.reason}`);
      ev.date_start = r.date_start;
    }
  }
  const outsideTags = tagsFromOutsidePlaces(ev, entity, ctx.places, ctx.sovereign);
  if (outsideTags.length) {
    ev.countries = ev.countries.filter((c) => !outsideTags.includes(c));
    ev.review_reasons.push(
      `country_from_outside_place_removed: ${outsideTags.join(", ")} came only from a location (sea or region) that mostly belongs to countries outside the region`
    );
  }
  applyDataFix(ev);

  // 4. flags (re-computed from the full lead)
  ev.review_reasons = dropPrefix(ev.review_reasons, [
    "date_order_invalid", "date_year_mismatch", "date_end_year_mismatch",
    "title_differs_from_article", "country_not_supported_by_wikidata", "country_via_place_only",
  ]);
  dateFlags = dateFlags.filter((f) => !/^(date_order_invalid|wikipedia_dates_note|date_start_year_not_in_lead)/.test(f));
  const years = yearsIn(ev.extract);
  const sy = yearOf(ev.date_start);
  if (years.length && sy !== null && !years.some((y) => Math.abs(y - sy) <= 1)) {
    dateFlags.push(
      `date_start_year_not_in_lead: start year ${sy} (${ev.date_start}) is not within 1 year of any year in the Wikipedia lead [${years.slice(0, 8).join(", ")}]`
    );
  }
  dateFlags.push(...dateOrderFlags(ev));
  if (titleMismatch(ev, urlTitle, ev.extract)) {
    ev.review_reasons.push(
      `title_differs_from_article: record title "${ev.title}" differs from the Wikipedia article title "${urlTitle}" and does not appear in its lead`
    );
  }
  if (entity) {
    const wc = wikidataCountries(entity, ctx.places);
    const wdAll = new Set([...wc.direct, ...wc.viaPlace]);
    // only tracked-set tags can be compared with P17/P276/P131 (other names, e.g. from a fix, are Wikidata's own)
    const evc = (ev.countries ?? []).filter((c) => c in COUNTRIES);
    const p17Sov = (entity.p17 ?? []).filter((q) => ctx.sovereign.has(q));
    if (wc.direct.length === 0 && p17Sov.length && evc.length && evc.every((c) => wc.viaPlace.includes(c))) {
      ev.review_reasons.push(
        `country_via_place_only: Wikidata P17 of the item is ${p17Sov.map((q) => ctx.labels[q] ?? q).join(", ")}; the tracked country tag comes only from the P276/P131 place`
      );
    } else if (wdAll.size > 0 && evc.some((c) => !wdAll.has(c))) {
      ev.review_reasons.push(
        `country_not_supported_by_wikidata: ${evc.filter((c) => !wdAll.has(c)).join(", ")} not derivable from Wikidata P17/P276/P131 (Wikidata gives: ${[...wdAll].join(", ")})`
      );
    }
  }
  if (dateFlags.length) ev.date_flags = dateFlags;
  else delete ev.date_flags;
  ev.needs_review = ev.review_reasons.length > 0 || dateFlags.length > 0;
  return ev;
}
