// Events without a Wikipedia article of their own (docs/DATA_POLICY.md, "Events without an article of
// their own") whose title leads to the article of ANOTHER event on the map show that event's text
// (docs/data-fixes.md F12). This keeps such a "mirror" in step with its "source" event: same text,
// same framing review. The refresh never copies another item's lead into an event directly
// (lib/title-refresh.js detectExtractHold); for a mirror it copies the source's stored text instead.
// Pure.

import { setRevid } from "./revid.js";

const hasOwnArticle = (e) => !e.resolved_qid || e.resolved_qid === e.wikidata_qid;

/** [{ mirror, source }] for every mirror whose article is another event's own article. */
export function mirrorPairs(events) {
  const owners = new Map();
  for (const e of events) if (e.wikipedia_url && hasOwnArticle(e)) owners.set(e.wikipedia_url, e);
  const pairs = [];
  for (const e of events) {
    if (hasOwnArticle(e) || !e.wikipedia_url) continue;
    const source = owners.get(e.wikipedia_url);
    if (source && source.wikidata_qid === e.resolved_qid) pairs.push({ mirror: e, source });
  }
  return pairs;
}

/** Copies each source's text (and its date and revision) into its mirror where they differ. Returns the mirrors' ids that changed. */
export function syncMirrorTexts(events) {
  const changed = [];
  for (const { mirror, source } of mirrorPairs(events)) {
    if (mirror.extract === source.extract) continue;
    mirror.extract = source.extract;
    mirror.extract_retrieved_at = source.extract_retrieved_at;
    // same article, same text: the source's revision (and its date) is the mirror's too (lib/revid.js)
    setRevid(mirror, source.wikipedia_revid, source.wikipedia_revid_timestamp);
    changed.push(mirror.id);
  }
  return changed;
}

/** Copies each source's framing review to its mirror (texts equal). Returns the mirrors' ids that changed. */
export function syncMirrorReviews(events, reviews) {
  const changed = [];
  for (const { mirror, source } of mirrorPairs(events)) {
    if (mirror.extract !== source.extract || !reviews[source.id]) continue;
    if (JSON.stringify(reviews[mirror.id]) === JSON.stringify(reviews[source.id])) continue;
    reviews[mirror.id] = structuredClone(reviews[source.id]);
    changed.push(mirror.id);
  }
  return changed;
}
