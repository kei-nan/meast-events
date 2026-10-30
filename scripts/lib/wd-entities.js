// Batched Wikidata entity fetch (read-only). Keeps a trimmed record per item:
// class statements (P31), location statements (P17/P276/P131), dates (P585/P580/P582),
// coordinates (P625), sitelinks (all projects / Wikipedia editions only), English aliases
// (only when "aliases" is among the requested props), and whether the end time (P582) is given as
// "no value" / "unknown value" instead of a date (p582_open).
import { politeFetch, sleep, mediaWikiJson } from "./http.js";

const API = "https://www.wikidata.org/w/api.php";
const BATCH = 40;

const notDeprecated = (cl) => (cl ?? []).filter((c) => c.rank !== "deprecated");
const ids = (cl) => notDeprecated(cl).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
const times = (cl) =>
  notDeprecated(cl)
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((v) => v?.time)
    .map((v) => ({ time: v.time.replace(/^\+/, "").slice(0, 10), precision: v.precision }));

// How the item states its end time (P582) when it gives no date for it: "novalue" (Wikidata's "no value")
// or "somevalue" ("unknown value"), from its non-deprecated P582 statements in Wikidata's order; null when
// it has an end date or no P582 statement at all; undefined when claims were not fetched.
export function p582Open(claims) {
  if (!claims) return undefined;
  const st = notDeprecated(claims.P582);
  if (st.some((c) => c.mainsnak?.snaktype === "value")) return null;
  const open = st.find((c) => c.mainsnak?.snaktype === "novalue" || c.mainsnak?.snaktype === "somevalue");
  return open ? open.mainsnak.snaktype : null;
}

function trim(ent) {
  const c = ent.claims ?? {};
  const sl = Object.values(ent.sitelinks ?? {});
  const p625 = notDeprecated(c.P625)[0]?.mainsnak?.datavalue?.value;
  return {
    qid: ent.id,
    label: ent.labels?.en?.value ?? null,
    description: ent.descriptions?.en?.value ?? null,
    // English aliases ("also known as"), values only, in Wikidata's order; [] when the item has none,
    // undefined when aliases were not requested.
    aliases: ent.aliases ? (ent.aliases.en ?? []).map((a) => a.value) : undefined,
    lastrevid: ent.lastrevid ?? null,
    p31: ids(c.P31), // Wikidata statement order, deprecated statements excluded
    p17: ids(c.P17),
    p276: ids(c.P276),
    p131: ids(c.P131),
    dissolved: notDeprecated(c.P576).length > 0, // P576 "dissolved, abolished or demolished"
    p585: times(c.P585),
    p580: times(c.P580),
    p582: times(c.P582),
    p582_open: p582Open(ent.claims),
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
    // An API error (HTTP 200 with an `error` body) throws: never read as "every item missing" and cached as null.
    const data = await mediaWikiJson(await politeFetch(url), "wbgetentities");
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
    const data = await mediaWikiJson(res, "labels"); // an API error throws (never cached as a null label)
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

// Stores an item's English aliases on an event as `wikidata_aliases` (Wikidata's values as-is, in its order),
// or removes the field when the item has none. `aliases` undefined (not fetched) leaves the event unchanged.
// Returns true when the event changed.
export function setWikidataAliases(ev, aliases) {
  if (aliases === undefined) return false;
  const before = JSON.stringify(ev.wikidata_aliases ?? null);
  if (aliases.length) ev.wikidata_aliases = [...aliases];
  else delete ev.wikidata_aliases;
  return JSON.stringify(ev.wikidata_aliases ?? null) !== before;
}

// Stores how Wikidata states an item's missing end time on an event, as `date_end_open`: "wikidata_novalue"
// (P582 "no value") or "wikidata_somevalue" (P582 "unknown value"); removes the field otherwise. Only for an
// event with no date_end (with one, the date is what the app uses). `open` undefined (claims not fetched, or
// an older cache entry) leaves the event unchanged. Returns true when the event changed. The app counts such
// an event in every year from its start to the current year (docs/DATA_POLICY.md, "Ongoing events").
export function setDateEndOpen(ev, open) {
  if (open === undefined) return false;
  const before = ev.date_end_open ?? null;
  if (open && !ev.date_end) ev.date_end_open = `wikidata_${open}`;
  else delete ev.date_end_open;
  return (ev.date_end_open ?? null) !== before;
}
