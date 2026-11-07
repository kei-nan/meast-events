// Events with no English Wikipedia article of their own (docs/DATA_POLICY.md, "Events without an
// article of their own"): the event's Wikipedia title redirects into the article of a different
// Wikidata item, and that article's text is what the event shows. Pure.

/**
 * The title of the article the event's text comes from when that article belongs to another
 * Wikidata item (resolved_qid differs from wikidata_qid), else null.
 *
 * `articleUrl` is that article's current URL where the build knows it: for a "mirror" (its article
 * is another map event's own, scripts/lib/mirrors.js mirrorPairs) the source event's wikipedia_url.
 * When the article is renamed, the refresh moves the source's URL to the new title but holds the
 * mirror's own URL as qid_mismatch (scripts/lib/title-refresh.js), so the mirror's URL keeps the old
 * title. Without one, the title comes from the event's own wikipedia_url.
 */
export function otherArticleTitle(event, articleUrl = event?.wikipedia_url) {
  const own = event?.wikidata_qid;
  const resolved = event?.resolved_qid;
  if (!own || !resolved || own === resolved || typeof event.wikipedia_url !== "string") return null;
  const url = typeof articleUrl === "string" ? articleUrl : event.wikipedia_url;
  const m = url.match(/\/wiki\/([^?#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, " ");
  } catch {
    return null;
  }
}

/** The note shown above such an event's text. */
export function otherArticleNote(title) {
  return `This event has no Wikipedia article of its own: its Wikipedia title leads to the article “${title}”, so the text below is that article’s and covers more than this event.`;
}
