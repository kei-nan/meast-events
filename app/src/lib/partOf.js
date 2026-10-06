// Wikidata's "part of" (P361) relation, shown as Wikidata gives it. data/events.json
// carries `part_of: [{qid, label}]` per event (scripts/enrich-candidates.js); labels
// are Wikidata's own and are never rewritten. Nothing here judges a relation: a parent
// is only resolved to one of our curated events when its QID is that event's
// wikidata_qid, and the reverse list (`includes`) is exactly the events that name it.
//
// Used at build time by scripts/split-data.mjs (the result rides in the full-lead
// buckets, so the startup lite file does not grow) and by the event pages.

const QID = /^Q[1-9]\d*$/;

/** The Wikidata item page for a QID, or null if it is not a well-formed QID. */
export function wikidataUrl(qid) {
  return typeof qid === "string" && QID.test(qid) ? `https://www.wikidata.org/wiki/${qid}` : null;
}

// Oldest first; same date (or none) falls back to title, then id, so the order is stable.
function byDate(a, b) {
  const da = a.date_start ?? "";
  const db = b.date_start ?? "";
  if (da !== db) return da < db ? -1 : 1;
  return String(a.title ?? "").localeCompare(String(b.title ?? "")) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * For every event that has a "part of" parent or is one:
 *   part_of:  [{qid, label, id?}] in Wikidata's order, one entry per QID (a QID
 *             listed twice is shown once); id is set when the parent is a curated
 *             event (matched on its wikidata_qid). The label is always Wikidata's,
 *             also for a curated parent: "Part of" is Wikidata's statement, so it is
 *             shown in Wikidata's words (our title may differ, e.g. "Gaza war" vs
 *             Wikidata's "Gaza War"); a missing label falls back to the QID.
 *   includes: [{id, title, date_start}] the curated events whose part_of names this
 *             event, oldest first.
 * Returns Map<event id, {part_of, includes}>; events with neither are absent.
 * An event is never listed as part of itself.
 */
export function resolvePartOf(events) {
  const byQid = new Map();
  for (const e of events) {
    if (typeof e?.wikidata_qid === "string" && QID.test(e.wikidata_qid) && !byQid.has(e.wikidata_qid)) {
      byQid.set(e.wikidata_qid, e);
    }
  }
  const out = new Map();
  const entry = (id) => {
    if (!out.has(id)) out.set(id, { part_of: [], includes: [] });
    return out.get(id);
  };
  for (const e of events) {
    if (!Array.isArray(e?.part_of)) continue;
    const seen = new Set();
    for (const p of e.part_of) {
      if (!p || typeof p.qid !== "string" || !QID.test(p.qid) || seen.has(p.qid)) continue;
      if (p.qid === e.wikidata_qid) continue;
      seen.add(p.qid);
      const label = typeof p.label === "string" && p.label ? p.label : p.qid;
      const parent = byQid.get(p.qid);
      if (parent && parent.id !== e.id) {
        entry(e.id).part_of.push({ qid: p.qid, label, id: parent.id });
        entry(parent.id).includes.push({ id: e.id, title: e.title, date_start: e.date_start ?? null });
      } else {
        entry(e.id).part_of.push({ qid: p.qid, label });
      }
    }
  }
  for (const v of out.values()) v.includes.sort(byDate);
  return out;
}
