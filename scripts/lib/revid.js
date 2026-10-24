// `wikipedia_revid`: the English Wikipedia revision whose lead is exactly the event's stored `extract`
// (docs/DATA_POLICY.md, "Revision (`wikipedia_revid`)"). It lets a citation link the exact version
// (https://en.wikipedia.org/w/index.php?title=...&oldid=<revid>). It is set only where that is known:
// - refresh-extracts.js --apply writes it with every lead it writes (the revision the lead came from);
// - backfill-revids.js sets it on an event without one when the article's current lead equals the
//   stored extract exactly; otherwise the field stays absent, since we cannot tell which revision the
//   stored text came from.
// Pure: no network, no file access.

/** A valid revision id: a positive safe integer. */
export const isRevid = (v) => Number.isSafeInteger(v) && v > 0;

/**
 * Sets (or, with a non-revid `revid`, removes) `wikipedia_revid` on `event` in place, keeping the field
 * right after `extract_retrieved_at` (else at the end) so the JSON stays in its usual key order.
 * Returns true when the event changed.
 */
export function setRevid(event, revid) {
  const want = isRevid(revid) ? revid : undefined;
  if (event.wikipedia_revid === want && (want !== undefined || !("wikipedia_revid" in event))) return false;
  const entries = Object.entries(event).filter(([k]) => k !== "wikipedia_revid");
  if (want !== undefined) {
    const at = entries.findIndex(([k]) => k === "extract_retrieved_at");
    entries.splice(at === -1 ? entries.length : at + 1, 0, ["wikipedia_revid", want]);
  }
  for (const k of Object.keys(event)) delete event[k];
  Object.assign(event, Object.fromEntries(entries));
  return true;
}

/**
 * The backfill rule for one event and its freshly fetched lead record (lib/lead.js fetchLeads):
 * "kept" (already has a revid: left as it is), "set" (current lead === stored extract and the API
 * gave a revision), "differs" (text changed since retrieval: no revid), "missing" (no lead or no
 * revision returned). Applies "set" to the event in place.
 */
export function backfillRevid(event, lead) {
  if (isRevid(event.wikipedia_revid)) return "kept";
  if (!lead?.extract || !isRevid(lead.lastrevid)) return "missing";
  if (lead.extract !== event.extract) return "differs";
  setRevid(event, lead.lastrevid);
  return "set";
}
