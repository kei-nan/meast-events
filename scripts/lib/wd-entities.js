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
    .map((v) => ({ time: wikidataDate(v), precision: v.precision }));

// A time value's `calendarmodel` for the proleptic Julian calendar (Gregorian is Q1985727).
export const JULIAN = "http://www.wikidata.org/entity/Q1985786";

// A proleptic Julian calendar date (year >= 1) as the proleptic Gregorian date of the same day, "YYYY-MM-DD"; null
// for a day the Julian calendar does not have (1900-02-30). Through the Julian Day Number: the Julian-calendar JDN
// formula, then JavaScript's proleptic Gregorian Date counted from the Unix epoch (JDN 2440588).
export function julianToGregorian(year, month, day) {
  if (!(Number.isInteger(year) && year >= 1 && month >= 1 && month <= 12 && day >= 1)) return null;
  const dim = [31, year % 4 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > dim) return null;
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  const d = new Date((jdn - 2440588) * 86400000);
  const pad = (n, w) => String(n).padStart(w, "0");
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

// A Wikidata time value ({ time: "+1914-07-20T00:00:00Z", precision, calendarmodel }) as the pipeline's date
// "YYYY-MM-DD" ("-00" kept in a coarse value, e.g. "1940-00-00"), in the Gregorian calendar the way the Wikidata Query
// Service gives it (discovery reads its dates there). A Julian value (calendarmodel Q1985786) of day or finer
// precision becomes the Gregorian day (german-ottoman-alliance, Q261982: P585 1914-07-20 Julian = 1914-08-02). A
// Julian value less precise than a day is kept as written, as WDQS keeps it: Wikibase's RDF export
// (repo/includes/Rdf/JulianDateTimeValueCleaner.php, getStandardValue) converts only when
// `getPrecision() >= TimeValue::PRECISION_DAY` - "If we are less precise than a day, no point to convert Julian to
// Gregorian since we don't have enough information to do it anyway". A Julian day that cannot be converted here (a
// BCE year, or no such day) is kept as written too. Gregorian values are unchanged.
export function wikidataDate(v) {
  const date = String(v?.time ?? "").replace(/^\+/, "").slice(0, 10);
  if (v?.calendarmodel !== JULIAN || !(v.precision >= 11)) return date;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return (m && julianToGregorian(Number(m[1]), Number(m[2]), Number(m[3]))) || date;
}

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

// scripts/refresh-sitelinks.js: refreshes sitelinks_current (unless aliasesOnly), wikidata_aliases and date_end_open
// on each event from its fetchEntities record, in place. An event whose item was not returned is left as it is
// (missing); so is one whose item now redirects to another (redirected: a merged QID would otherwise silently take
// the target item's sitelinks and aliases). `log` gets one line per change.
export function refreshFromEntities(events, entities, { aliasesOnly = false, log = () => {} } = {}) {
  const out = { changed: 0, aliasesChanged: 0, openChanged: 0, missing: [], redirected: [] };
  for (const e of events) {
    const rec = entities.get(e.wikidata_qid);
    if (!rec) {
      out.missing.push(`${e.id} (${e.wikidata_qid ?? "no QID"})`);
      continue;
    }
    if (rec.redirected) {
      out.redirected.push(`${e.id} (${e.wikidata_qid} -> ${rec.qid})`);
      continue;
    }
    if (!aliasesOnly && e.sitelinks_current !== rec.sitelinks_all) {
      log(`${e.id}: ${e.sitelinks_current ?? "-"} -> ${rec.sitelinks_all}`);
      e.sitelinks_current = rec.sitelinks_all;
      out.changed++;
    }
    const before = e.wikidata_aliases;
    if (setWikidataAliases(e, rec.aliases)) {
      log(`${e.id}: aliases ${JSON.stringify(before ?? [])} -> ${JSON.stringify(e.wikidata_aliases ?? [])}`);
      out.aliasesChanged++;
    }
    const openBefore = e.date_end_open;
    if (setDateEndOpen(e, rec.p582_open)) {
      log(`${e.id}: date_end_open ${openBefore ?? "-"} -> ${e.date_end_open ?? "-"}`);
      out.openChanged++;
    }
  }
  return out;
}
