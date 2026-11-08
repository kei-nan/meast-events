// Reviewed exclusions (data/proposed-exclusions.json): proposed events a person has decided to
// leave out, each with a stated reason. An entry is {id, wikidata_qid?, reason}. The id is the
// slug of the Wikipedia title (slugify(wikipedia_title) in enrich-candidates.js), kept for
// readability; it changes when the article is renamed, which used to un-exclude the event
// silently. The Wikidata item does not change on a rename, so an entry matches an event by
// either: its id, or its wikidata_qid. Entries that match nothing are reported, so a stale
// entry (or one whose event is no longer proposed) is visible instead of counted as excluded.

const QID = /^Q[1-9]\d*$/;

// Structural errors in the exclusions list (each one is a reason to stop: a list that cannot be
// read as intended must never be applied as if it were).
export function checkExclusionEntries(exclusions) {
  if (!Array.isArray(exclusions)) return ["proposed-exclusions.json: must be an array of {id, wikidata_qid?, reason}"];
  const errors = [];
  const seenIds = new Set();
  const seenQids = new Set();
  exclusions.forEach((x, i) => {
    const at = `proposed-exclusions.json[${i}]`;
    if (!x || typeof x !== "object") return errors.push(`${at}: not an object`);
    if (typeof x.id !== "string" || !x.id) errors.push(`${at}: no "id"`);
    else if (seenIds.has(x.id)) errors.push(`${at}: id "${x.id}" is listed twice`);
    else seenIds.add(x.id);
    if (x.wikidata_qid != null) {
      if (typeof x.wikidata_qid !== "string" || !QID.test(x.wikidata_qid)) errors.push(`${at}: wikidata_qid "${x.wikidata_qid}" is not a QID`);
      else if (seenQids.has(x.wikidata_qid)) errors.push(`${at}: wikidata_qid ${x.wikidata_qid} is listed twice`);
      else seenQids.add(x.wikidata_qid);
    }
    if (typeof x.reason !== "string" || !x.reason.trim()) errors.push(`${at}: no "reason"`);
  });
  return errors;
}

// Matches the exclusions against `events` (each with an id and, through `qidOf`, a QID).
// Returns:
//   isExcluded(event) -> the matching entry or null
//   excludedIds       Set of the ids of the matched events
//   matched           [{entry, ids, by}] where by is "id", "wikidata_qid" or "id and wikidata_qid"
//   unmatched         entries that match no event
//   warnings          one per unmatched entry, and one per entry whose id and QID match two different events
export function matchExclusions(exclusions, events, { qidOf = (e) => e.wikidata_qid } = {}) {
  const byId = new Map();
  const byQid = new Map();
  for (const x of exclusions) {
    byId.set(x.id, x);
    if (x.wikidata_qid) byQid.set(x.wikidata_qid, x);
  }
  const hits = new Map(); // entry -> {ids:Set, viaId:boolean, viaQid:boolean}
  const entryFor = new Map(); // event id -> entry
  const hit = (x, e, via) => {
    const h = hits.get(x) ?? { ids: new Set(), viaId: false, viaQid: false };
    h.ids.add(e.id);
    h[via] = true;
    hits.set(x, h);
    entryFor.set(e.id, x);
  };
  for (const e of events) {
    const xi = byId.get(e.id);
    if (xi) hit(xi, e, "viaId");
    const q = qidOf(e);
    const xq = q ? byQid.get(q) : null;
    if (xq) hit(xq, e, "viaQid");
  }
  const warnings = [];
  const matched = [];
  const unmatched = [];
  for (const x of exclusions) {
    const h = hits.get(x);
    const name = `"${x.id}"${x.wikidata_qid ? ` (${x.wikidata_qid})` : ""}`;
    if (!h) {
      unmatched.push(x);
      warnings.push(`exclusion ${name} matches no event`);
      continue;
    }
    const by = h.viaId && h.viaQid ? "id and wikidata_qid" : h.viaId ? "id" : "wikidata_qid";
    matched.push({ entry: x, ids: [...h.ids], by });
    if (h.ids.size > 1) warnings.push(`exclusion ${name}: its id and wikidata_qid match different events (${[...h.ids].join(", ")}); both are left out`);
    else if (by === "wikidata_qid") warnings.push(`exclusion ${name} matched ${[...h.ids][0]} by wikidata_qid only (article renamed?); update its id`);
  }
  return {
    isExcluded: (e) => entryFor.get(e.id) ?? null,
    excludedIds: new Set(entryFor.keys()),
    matched,
    unmatched,
    warnings,
  };
}

// One line for the logs: "28 entries: 0 matched (0 by id, 0 by wikidata_qid only), 28 matched nothing".
export function exclusionSummary(exclusions, m) {
  const qidOnly = m.matched.filter((x) => x.by === "wikidata_qid").length;
  return (
    `${exclusions.length} entr${exclusions.length === 1 ? "y" : "ies"}: ${m.matched.length} matched ` +
    `(${m.matched.length - qidOnly} by id, ${qidOnly} by wikidata_qid only), ${m.unmatched.length} matched nothing`
  );
}
