// Builds the network-derived context (leads, Wikidata entities, labels) that finalizeEvent needs.
// Everything goes through the resumable caches, so re-runs are cheap and interrupted runs resume.
import { openCache } from "./cache.js";
import { fetchLeads, titleFromWikipediaUrl } from "./lead.js";
import { fetchEntities, fetchLabelsCached } from "./wd-entities.js";
import { QID_TO_COUNTRY } from "./event-classes.js";

const SOVEREIGN_STATE = "Q3624078";
const FULL = "claims|labels|descriptions|sitelinks/urls";
const LIGHT = "claims|labels";

// events: any objects with wikipedia_url/title/wikidata_qid. candidates: rows of event-candidates.json
// (used for the discovery-matched class labels).
export async function buildContext(events, { candidates = [], reconcileDates = false, log = () => {}, forceLeads = false } = {}) {
  const leadCache = openCache("leads");
  const entCache = openCache("entities");
  const labCache = openCache("labels");

  const titles = events.map((e) => titleFromWikipediaUrl(e.wikipedia_url) ?? e.title);
  const leads = await fetchLeads(titles, { cache: forceLeads ? null : leadCache, log });
  if (forceLeads) for (const [t, v] of leads) leadCache.set(t, v);
  leadCache.flush();

  const qids = events.map((e) => e.wikidata_qid);
  const entities = await fetchEntities(qids, { cache: entCache, props: FULL, log });
  const list = [...entities.values()].filter(Boolean);

  const placeQids = [...new Set(list.flatMap((e) => [...e.p276, ...e.p131]))];
  const places = await fetchEntities(placeQids, { cache: entCache, props: LIGHT, log });

  const p17Other = [...new Set(list.flatMap((e) => e.p17).filter((q) => !QID_TO_COUNTRY[q]))];
  const p17Ents = await fetchEntities(p17Other, { cache: entCache, props: LIGHT, log });
  const sovereign = new Set(p17Other.filter((q) => (p17Ents.get(q)?.p31 ?? []).includes(SOVEREIGN_STATE)));

  const classQids = [...new Set(list.flatMap((e) => e.p31))];
  const labels = await fetchLabelsCached(classQids, { cache: labCache });
  for (const [q, e] of p17Ents) if (e?.label) labels[q] = e.label;

  const matched = new Map(candidates.map((c) => [c.wikidata_qid, c.wikidata_classes ?? []]));
  return { leads, entities, places, labels, matched, sovereign, reconcileDates };
}
