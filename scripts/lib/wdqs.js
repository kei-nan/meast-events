import { politeFetch } from "./http.js";

export const ENDPOINT = "https://query.wikidata.org/sparql";

export async function runSparql(query) {
  const res = await politeFetch(
    ENDPOINT,
    {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `query=${encodeURIComponent(query)}`,
    },
    // A 504 is WDQS's own query timeout: retrying the identical query is pointless, so
    // it is not retried here - callers fall back to a cheaper query instead. WDQS stops a query
    // itself after 60 s, so the client timeout is longer: a slow query then ends as that 504
    // (and takes the fallback) instead of a client-side abort.
    { retries: 1, baseDelayMs: 5000, noRetryStatuses: [504], timeoutMs: 90_000 }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).results.bindings;
}

export function qidFromUri(uri) {
  return uri.replace("http://www.wikidata.org/entity/", "");
}

// Deterministic tiebreak for sorts: QIDs by number (Q9 before Q10), then as strings; a missing
// QID sorts last.
export function compareQids(a, b) {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const na = Number(String(a).slice(1));
  const nb = Number(String(b).slice(1));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a) < String(b) ? -1 : 1;
}
