// `wikipedia_revid` and `wikipedia_revid_timestamp`: the English Wikipedia revision whose lead is exactly the event's
// stored `extract`, and when that revision was saved (docs/DATA_POLICY.md, "Revision"). A citation links that version
// (https://en.wikipedia.org/w/index.php?title=...&oldid=<revid>) under its own date. The two are set together or not
// at all, and only where that is known:
// - refresh-extracts.js --apply writes them with every lead it writes (the revision the lead came from);
// - backfill-revids.js sets them on an event without them when the article's current lead equals the stored extract
//   exactly; otherwise they stay absent, since we cannot tell which revision the stored text came from;
// - backfill-revids.js --historical sets them to an OLDER revision whose lead (lib/rev-lead.js) equals the stored
//   extract exactly, for events whose article's lead has changed since retrieval.
// The first two take them from the same API request as the lead (lib/lead.js: lastrevid, lastrev_timestamp). Pure.

/** A valid revision id: a positive safe integer. */
export const isRevid = (v) => Number.isSafeInteger(v) && v > 0;

/** A MediaWiki revision timestamp: ISO 8601 in UTC to the second ("2026-10-15T19:38:37Z"), a real date. */
export function isRevTimestamp(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)) return false;
  const t = Date.parse(v);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 19) + "Z" === v;
}

const FIELDS = ["wikipedia_revid", "wikipedia_revid_timestamp"];

/**
 * Sets both fields on `event` in place, right after `extract_retrieved_at` (else at the end) so the JSON keeps its
 * usual key order; with a missing or invalid revid or timestamp, removes both. Returns true when the event changed.
 */
export function setRevid(event, revid, timestamp) {
  const ok = isRevid(revid) && isRevTimestamp(timestamp);
  if (ok ? event.wikipedia_revid === revid && event.wikipedia_revid_timestamp === timestamp : !FIELDS.some((k) => k in event)) {
    return false;
  }
  const entries = Object.entries(event).filter(([k]) => !FIELDS.includes(k));
  if (ok) {
    const at = entries.findIndex(([k]) => k === "extract_retrieved_at");
    entries.splice(at === -1 ? entries.length : at + 1, 0, ["wikipedia_revid", revid], ["wikipedia_revid_timestamp", timestamp]);
  }
  for (const k of Object.keys(event)) delete event[k];
  Object.assign(event, Object.fromEntries(entries));
  return true;
}

/**
 * The backfill rule for one event and its freshly fetched lead record (lib/lead.js fetchLeads):
 * "kept" (already has a revision: left as it is), "set" (current lead === stored extract and the API gave the
 * revision and its timestamp), "differs" (text changed since retrieval: nothing set), "missing" (no lead, or no
 * revision or timestamp returned). Applies "set" to the event in place.
 */
export function backfillRevid(event, lead) {
  if (isRevid(event.wikipedia_revid) && isRevTimestamp(event.wikipedia_revid_timestamp)) return "kept";
  if (!lead?.extract || !isRevid(lead.lastrevid) || !isRevTimestamp(lead.lastrev_timestamp)) return "missing";
  if (lead.extract !== event.extract) return "differs";
  setRevid(event, lead.lastrevid, lead.lastrev_timestamp);
  return "set";
}
