// Batched Wikidata entity fetch (read-only). Keeps a trimmed record per item:
// class statements (P31), location statements (P17/P276/P131), dates (P585/P580/P582),
// coordinates (P625), sitelinks (all projects / Wikipedia editions only).
import { politeFetch, sleep } from "./http.js";

const API = "https://www.wikidata.org/w/api.php";
const BATCH = 40;

const notDeprecated = (cl) => (cl ?? []).filter((c) => c.rank !== "deprecated");
const ids = (cl) => notDeprecated(cl).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
const times = (cl) =>
  notDeprecated(cl)
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((v) => v?.time)
    .map((v) => ({ time: v.time.replace(/^\+/, "").slice(0, 10), precision: v.precision }));

function trim(ent) {
  const c = ent.claims ?? {};
  const sl = Object.values(ent.sitelinks ?? {});
  const p625 = notDeprecated(c.P625)[0]?.mainsnak?.datavalue?.value;
  return {
    qid: ent.id,
    label: ent.labels?.en?.value ?? null,
    description: ent.descriptions?.en?.value ?? null,
    lastrevid: ent.lastrevid ?? null,
    p31: ids(c.P31), // Wikidata statement order, deprecated statements excluded
    p17: ids(c.P17),
    p276: ids(c.P276),
    p131: ids(c.P131),
    dissolved: notDeprecated(c.P576).length > 0, // P576 "dissolved, abolished or demolished"
    p585: times(c.P585),
    p580: times(c.P580),
    p582: times(c.P582),
    p625: p625 ? { lat: p625.latitude, lon: p625.longitude } : null,
    sitelinks_all: sl.length,
    // sitelinks whose URL is on a *.wikipedia.org host = Wikipedia language editions
    wikipedia_editions: sl.filter((s) => /^https?:\/\/[a-z0-9_-]+\.wikipedia\.org\//.test(s.url ?? "")).length,
    enwiki: ent.sitelinks?.enwiki?.title ?? null,
  };
}

// Returns Map(requestedQid -> trimmed record | null). Cache key = props + qid so a light
// (sitelinks-only) pass never masquerades as a full one.
export async function fetchEntities(
  qids,
  { cache = null, props = "claims|labels|descriptions|sitelinks/urls", delayMs = 400, log = () => {} } = {}
) {
  const key = (q) => `${props}::${q}`;
  const want = [...new Set(qids.filter(Boolean))];
  const out = new Map();
  const todo = [];
  for (const q of want) {
    if (cache?.has(key(q))) out.set(q, cache.get(key(q)));
    else todo.push(q);
  }
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const url = `${API}?action=wbgetentities&format=json&languages=en&props=${props}&ids=${chunk.join("|")}`;
    const res = await politeFetch(url);
    if (!res.ok) throw new Error(`wbgetentities HTTP ${res.status}`);
    const data = await res.json();
    const byId = new Map();
    for (const [k, ent] of Object.entries(data.entities ?? {})) {
      byId.set(k, ent);
      if (ent.redirects?.from) byId.set(ent.redirects.from, ent);
    }
    for (const q of chunk) {
      const ent = byId.get(q);
      const rec = ent && !("missing" in ent) ? { ...trim(ent), requested: q, redirected: ent.id !== q } : null;
      out.set(q, rec);
      cache?.set(key(q), rec);
    }
    cache?.flush();
    log(`entities ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
    if (i + BATCH < todo.length) await sleep(delayMs);
  }
  return out;
}

// English labels for many QIDs, cached.
export async function fetchLabelsCached(qids, { cache = null, delayMs = 300 } = {}) {
  const want = [...new Set(qids.filter(Boolean))];
  const out = {};
  const todo = [];
  for (const q of want) {
    if (cache?.has(q)) out[q] = cache.get(q);
    else todo.push(q);
  }
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const res = await politeFetch(`${API}?action=wbgetentities&props=labels&languages=en&format=json&ids=${chunk.join("|")}`);
    if (!res.ok) throw new Error(`labels HTTP ${res.status}`);
    const data = await res.json();
    for (const q of chunk) {
      const label = data.entities?.[q]?.labels?.en?.value ?? null;
      out[q] = label;
      cache?.set(q, label);
    }
    cache?.flush();
    if (i + 50 < todo.length) await sleep(delayMs);
  }
  return out;
}
