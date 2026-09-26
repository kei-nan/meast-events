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
    // it is not retried here - callers fall back to a cheaper query instead.
    { retries: 1, baseDelayMs: 5000, noRetryStatuses: [504] }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).results.bindings;
}

export function qidFromUri(uri) {
  return uri.replace("http://www.wikidata.org/entity/", "");
}
