// Re-deriving stored curated values by a published rule, after the rule changed (scripts/rederive-curated.js).
// Pure functions: the caller fetches the Wikidata item (lib/wd-entities.js fetchEntities) and the article's current
// coordinates (lib/wiki.js fetchArticleCoordinates). Each one changes only what its rule gives, never a field the
// fix ledger sets (lib/fixes.js), and re-derives the flags that describe the changed value the way
// lib/v21.js finalizeEvent and enrich-candidates.js do for a new event. docs/DATA_POLICY.md, "Re-deriving curated values".
import { FIXES_BY_QID, reconcileStartDate, keptEndPrecision } from "./fixes.js";
import { precisionName } from "./wiki.js";
import { dateOrderFlags } from "./v21.js";
import { wikipediaLeadDates } from "./lead-dates.js";
import {
  CATEGORY_YEAR_FLAG,
  LEAD_DAY_FLAG,
  LOW_PRECISION_FLAG,
  MONTH_DAY_FLAG,
  TITLE_YEARS_FLAG,
  categoryYearFlag,
  categoryYearsInFlag,
  coordinateFlag,
  leadStartDayFlag,
  leadYearFlag,
  lowPrecisionCoordinateFlag,
  monthPrecisionDayFlag,
  titleYearsFlag,
} from "./flags.js";
import { setReason } from "./enrich-run.js";

// The reconcileStartDate cases re-derived on curated events. Cases (b) and (c) ("end", "inside") were applied to the
// curated file through the ledger after a check of each article (docs/data-fixes.md F15, which left four as they
// were), and case (a) ("coarse") by the Wikidata date refresh of 2026-10-30; only the year case is re-derived here.
export const REDERIVED_START_RULES = ["year"];

// Stored coordinates and a source point are the same when both coordinates agree to 6 decimal places (~10 cm, the
// rounding DATA_POLICY.md allows), as in lib/drift.js.
const COORD_EPS = 5e-7;
const samePoint =(a, b) => Boolean(a && b) && Math.abs(a.lat - b.lat) <= COORD_EPS && Math.abs(a.lon - b.lon) <= COORD_EPS;

const PRECISION_CODE = Object.fromEntries(Array.from({ length: 15 }, (_, c) => [precisionName(c), c]));
const needsReview = (ev) => (ev.review_reasons?.length ?? 0) > 0 || (ev.date_flags?.length ?? 0) > 0;

// The start-date flags of finalizeEvent (date_flags) and enrich-candidates.js (review_reasons), on the stored start.
function refreshStartFlags(ev, entity) {
  let flags = (ev.date_flags ?? []).filter(
    (f) => !/^(date_order_invalid|date_end_precision_coarse|wikipedia_dates_note|date_start_year_not_in_lead)/.test(f)
  );
  const leadYear = leadYearFlag(ev);
  if (leadYear) flags.push(leadYear);
  flags.push(...dateOrderFlags({ ...ev, endPrecision: keptEndPrecision(entity, ev.date_end)?.code ?? null }));
  if (flags.length) ev.date_flags = flags;
  else delete ev.date_flags;
  const leadDates = flags.some((f) => f.startsWith("date_order_invalid")) ? wikipediaLeadDates(ev.extract) : [];
  if (leadDates.length) ev.wikipedia_lead_dates = leadDates;
  else delete ev.wikipedia_lead_dates;

  const reasons = [...(ev.review_reasons ?? [])];
  const catIdx = reasons.findIndex((r) => r.startsWith(`${CATEGORY_YEAR_FLAG}:`));
  if (catIdx >= 0) {
    const catYears = categoryYearsInFlag(reasons[catIdx]);
    const cat = catYears ? categoryYearFlag({ dateStart: ev.date_start, dateEnd: ev.date_end, catYears }) : reasons[catIdx];
    if (cat) reasons[catIdx] = cat;
    else reasons.splice(catIdx, 1);
  }
  const code = PRECISION_CODE[ev.date_precision];
  setReason(reasons, "date_precision_coarse",
    code != null && code < 9 ? `date_precision_coarse: Wikidata records the date only to ${ev.date_precision} precision` : null);
  setReason(reasons, MONTH_DAY_FLAG, monthPrecisionDayFlag(ev));
  setReason(reasons, LEAD_DAY_FLAG, leadStartDayFlag(ev));
  setReason(reasons, TITLE_YEARS_FLAG, titleYearsFlag(ev));
  ev.review_reasons = reasons;
  ev.needs_review = needsReview(ev);
}

/**
 * Re-derives a curated event's date_start by reconcileStartDate's REDERIVED_START_RULES cases, in place: the start
 * the pipeline gives a new event with the same Wikidata item (lib/v21.js finalizeEvent), with its
 * `date_source_adjusted` note, `date_precision` (the P580 statement's) and the start-date flags. Nothing happens when
 * the item was not returned or now redirects, when the ledger sets the event's date_start, or when the stored start
 * is not the item's P585 the rule replaces.
 * @returns {{ id, qid, from, fromPrecision, to, toPrecision, reason } | null} the change, or null
 */
export function rederiveStartDate(ev, entity) {
  if (!entity || entity.redirected) return null;
  if (FIXES_BY_QID.get(ev.wikidata_qid)?.set && "date_start" in FIXES_BY_QID.get(ev.wikidata_qid).set) return null;
  const r = reconcileStartDate(ev.date_start, entity);
  if (!r || !REDERIVED_START_RULES.includes(r.rule) || r.date_start === ev.date_start) return null;
  const change = {
    id: ev.id,
    qid: ev.wikidata_qid,
    from: ev.date_start,
    fromPrecision: ev.date_precision ?? null,
    to: r.date_start,
    toPrecision: precisionName(r.precision),
    reason: r.reason,
  };
  ev.date_start = r.date_start;
  ev.date_precision = change.toPrecision;
  ev.date_flags = [...(ev.date_flags ?? []).filter((f) => !f.startsWith("date_source_adjusted")), `date_source_adjusted: ${r.reason}`];
  refreshStartFlags(ev, entity);
  return change;
}

/**
 * A curated "wikipedia" pin against the sources it was taken from (enrich-candidates.js: the article's primary
 * coordinates, else the item's P625). `article` is the article's current primary point (null: none; undefined: not
 * fetched), `p625` the item's. Only for an event whose article is its own item's (resolved_qid equal to
 * wikidata_qid, or not recorded): another item's article never gives the event's pin (docs/data-fixes.md F11).
 * @returns {null | { kind: "both_sources_differ", point } | { kind: "article_differs" }}
 *   both_sources_differ: the article's point and P625 are the same point and the stored pin is neither (the rule
 *   re-derives it: rederiveWikipediaPin); article_differs: the article's point (or its absence) is not the stored
 *   pin and P625 does not agree with it (listed for a person, never changed)
 */
export function wikipediaPinCheck(ev, article, p625) {
  if (ev.coordinate_source !== "wikipedia" || !ev.coordinates || article === undefined) return null;
  if (ev.resolved_qid && ev.resolved_qid !== ev.wikidata_qid) return null;
  if (samePoint(ev.coordinates, article)) return null;
  if (article && samePoint(article, p625)) return { kind: "both_sources_differ", point: { lat: article.lat, lon: article.lon } };
  return { kind: "article_differs" };
}

/**
 * Re-derives a "wikipedia" pin in place when wikipediaPinCheck finds that the article's current point and the item's
 * P625 agree with each other and not with the stored pin; the coordinate flags are re-derived for the new point.
 * Never when the ledger sets the event's coordinates.
 * @returns {{ id, qid, from, to } | null}
 */
export function rederiveWikipediaPin(ev, article, p625) {
  if (FIXES_BY_QID.get(ev.wikidata_qid)?.set && "coordinates" in FIXES_BY_QID.get(ev.wikidata_qid).set) return null;
  const check = wikipediaPinCheck(ev, article, p625);
  if (check?.kind !== "both_sources_differ") return null;
  const change = { id: ev.id, qid: ev.wikidata_qid, from: { ...ev.coordinates }, to: check.point };
  ev.coordinates = check.point;
  const reasons = [...(ev.review_reasons ?? [])];
  setReason(reasons, "coordinate_far_from_countries", coordinateFlag(ev.coordinates, ev.countries));
  setReason(reasons, LOW_PRECISION_FLAG, lowPrecisionCoordinateFlag(ev));
  ev.review_reasons = reasons;
  ev.needs_review = needsReview(ev);
  return change;
}
