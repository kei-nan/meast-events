// The date-order flags (lib/v21.js dateOrderFlags) of an event, re-derived by a later pipeline run, carried onto a
// record that is otherwise kept as it is: the proposed copy (enrich-candidates.js --keep-existing) and the curated
// record (merge-proposed.js). No imports: merge-proposed.js must not pull in the network pipeline.

// date_order_invalid / date_end_precision_coarse and the note that goes with the first; plus wikipedia_lead_dates.
export const ORDER_FLAG_RE = /^(date_order_invalid|date_end_precision_coarse|wikipedia_dates_note)\b/;

// Copies `fresh`'s date-order flags onto `kept`, only when both describe the same dates and the same text (the flags
// are derived from exactly those, plus Wikidata's end precision). Other date flags of `kept` stay, in their order.
// Recomputes needs_review the way the pipeline does. Returns true when `kept` changed.
export function refreshOrderFlags(kept, fresh) {
  if (!kept || !fresh) return false;
  if (kept.date_start !== fresh.date_start || (kept.date_end ?? null) !== (fresh.date_end ?? null)) return false;
  if ((kept.extract ?? null) !== (fresh.extract ?? null)) return false;
  const flags = [
    ...(kept.date_flags ?? []).filter((f) => !ORDER_FLAG_RE.test(f)),
    ...(fresh.date_flags ?? []).filter((f) => ORDER_FLAG_RE.test(f)),
  ];
  const lead = fresh.wikipedia_lead_dates?.length ? fresh.wikipedia_lead_dates : null;
  const same = JSON.stringify(flags) === JSON.stringify(kept.date_flags ?? []) &&
    JSON.stringify(lead) === JSON.stringify(kept.wikipedia_lead_dates?.length ? kept.wikipedia_lead_dates : null);
  if (same) return false;
  if (flags.length) kept.date_flags = flags;
  else delete kept.date_flags;
  if (lead) kept.wikipedia_lead_dates = lead;
  else delete kept.wikipedia_lead_dates;
  kept.needs_review = (kept.review_reasons?.length ?? 0) > 0 || flags.length > 0;
  return true;
}
