// What the enrichment pipeline would record for a hand-picked seed event (data/seed-events.json, curated
// before date_precision, part_of and resolved_qid existed), derived the way enrich-candidates.js derives it
// for a discovered event. Pure: the network part is scripts/enrich-seed.js. The result is a PROPOSAL for the
// owner's review (data/seed-enrichment.proposed.json); nothing here changes an event, and titles, extracts,
// dates, countries and coordinates are never proposed.
import { keptDatePrecision } from "./fixes.js";
import { monthPrecisionDayFlag } from "./flags.js";
import { precisionCode } from "./wiki.js";

// A seed event: no discovery `sitelinks` count (validate.js treats it the same way).
export const isSeedEvent = (e) => e?.sitelinks === undefined;

// The fields this proposal covers; an event is listed when it lacks at least one of them.
export const SEED_FIELDS = ["date_precision", "part_of", "resolved_qid", "wikidata_description"];

/**
 * event: the curated record. entity: its trimmed Wikidata record (lib/wd-entities.js; p585/p580/p582,
 * description) or null. partOfQids: its P361 values as enrich-candidates.js reads them (lib/wiki.js
 * fetchEntity). labels: { qid: English label }. lead: the Wikipedia record of the article at wikipedia_url
 * (lib/lead.js fetchLeads; wikibase_item) or null.
 *
 * Returns { set, add_review_reasons, notes }: `set` holds only fields the event does not have yet;
 * `add_review_reasons` the notes the pipeline would attach for them (part_of, qid_mismatch,
 * date_precision_coarse, month_precision_day_in_lead); `notes` what could not be derived and why.
 */
export function proposeSeedFields(event, { entity, partOfQids = [], labels = {}, lead }) {
  const set = {};
  const notes = [];
  const reasons = [];
  const has = (k) => k in event;

  if (!entity) notes.push(`Wikidata item ${event.wikidata_qid} could not be fetched (missing or deleted): nothing derived from it`);

  if (!has("date_precision") && entity) {
    // Precision of the stored date_start: only when it is one of the item's P585/P580 values (as for discovered events).
    const kept = keptDatePrecision(entity, event.date_start);
    set.date_precision = kept?.name ?? null;
    if (!kept) {
      const vals = [...(entity.p585 ?? []).map((v) => `P585 ${v.time} (${v.precision})`), ...(entity.p580 ?? []).map((v) => `P580 ${v.time} (${v.precision})`)];
      notes.push(
        `date_start ${event.date_start} is none of the item's P585/P580 values (${vals.join("; ") || "it has none"}): date_precision null, the date still shows as the year only`
      );
    } else {
      const code = precisionCode(kept.name);
      if (code != null && code < 9) reasons.push(`date_precision_coarse: Wikidata records the date only to ${kept.name} precision`);
      const day = monthPrecisionDayFlag({ ...event, date_precision: kept.name });
      if (day) reasons.push(day);
    }
  }

  if (!has("part_of") && entity) {
    set.part_of = partOfQids.map((q) => ({ qid: q, label: labels[q] ?? null }));
    for (const p of set.part_of) {
      reasons.push(`part_of: Wikidata (P361) lists this event as part of "${p.label ?? p.qid}" (${p.qid}); it may overlap with that larger event`);
    }
  }

  if (!has("resolved_qid")) {
    if (lead) {
      set.resolved_qid = lead.wikibase_item ?? null;
      if (set.resolved_qid && set.resolved_qid !== event.wikidata_qid) {
        reasons.push(
          `qid_mismatch: title resolved to ${set.resolved_qid}, candidate was discovered under ${event.wikidata_qid} (possible redirect/disambiguation)`
        );
      }
      if (!set.resolved_qid) notes.push(`the article at wikipedia_url has no Wikidata item (pageprops): resolved_qid null`);
    } else {
      notes.push(`the article at wikipedia_url (${event.wikipedia_url}) could not be fetched: resolved_qid not derived`);
    }
  }

  if (!has("wikidata_description") && entity) set.wikidata_description = entity.description ?? null;

  // Never repeat a note the record already carries.
  const existing = new Set(Array.isArray(event.review_reasons) ? event.review_reasons : []);
  return { set, add_review_reasons: reasons.filter((r) => !existing.has(r)), notes };
}

// Counts for the summary: how many proposals set each field, and to what.
export function summarize(proposals) {
  const count = (pred) => proposals.filter(pred).length;
  const precision = {};
  for (const p of proposals) {
    if (!("date_precision" in p.set)) continue;
    const k = p.set.date_precision ?? "null (date is no Wikidata P585/P580 value)";
    precision[k] = (precision[k] ?? 0) + 1;
  }
  const flags = {};
  for (const p of proposals) for (const r of p.add_review_reasons) flags[r.split(":")[0]] = (flags[r.split(":")[0]] ?? 0) + 1;
  return {
    events: proposals.length,
    date_precision: precision,
    part_of_nonempty: count((p) => p.set.part_of?.length > 0),
    part_of_empty: count((p) => Array.isArray(p.set.part_of) && p.set.part_of.length === 0),
    resolved_qid_same_item: count((p) => p.set.resolved_qid && p.set.resolved_qid === p.wikidata_qid),
    resolved_qid_other_item: count((p) => p.set.resolved_qid && p.set.resolved_qid !== p.wikidata_qid),
    resolved_qid_none: count((p) => "resolved_qid" in p.set && !p.set.resolved_qid),
    wikidata_description: count((p) => typeof p.set.wikidata_description === "string"),
    review_reasons_added: flags,
    with_notes: count((p) => p.notes.length > 0),
  };
}
