// Shared polite HTTP helpers for the data pipeline.
// Every request identifies itself with the AtlasWiki User-Agent (Wikimedia policy),
// and transient failures (429/5xx/network) are retried with exponential backoff,
// honouring Retry-After when the server sends it.
export const USER_AGENT = "AtlasWiki/0.1 (data pipeline; contact: jonkeinan@gmail.com)";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function politeFetch(url, options = {}, { retries = 3, baseDelayMs = 2000, noRetryStatuses = [] } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { "User-Agent": USER_AGENT, ...(options.headers ?? {}) },
      });
      if (res.ok || res.status === 404) return res;
      const err = new Error(`HTTP ${res.status} ${res.statusText}`);
      err.status = res.status;
      if ((res.status === 429 || res.status >= 500) && !noRetryStatuses.includes(res.status)) {
        lastErr = err;
        if (attempt < retries) {
          const ra = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : baseDelayMs * 2 ** attempt);
          continue;
        }
        throw err;
      }
      throw err;
    } catch (err) {
      if (err.status && err.status < 500 && err.status !== 429) throw err;
      lastErr = err;
      if (err.status) throw err; // retries exhausted on an HTTP status
      if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastErr;
}
