// Shared polite HTTP helpers for the data pipeline.
// Every request identifies itself with the MiddleEastEvents User-Agent (Wikimedia policy),
// and transient failures (429/5xx/network, including a body cut off mid-download)
// are retried with exponential backoff,
// honouring Retry-After when the server sends it.
export const USER_AGENT = "MiddleEastEvents/0.1 (data pipeline; +https://github.com/kei-nan/meast-events)";

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
      // The body is read here, inside the retry loop: a connection dropped while
      // a large body streams in ("terminated: other side closed") is as transient
      // as a failed request, and callers would otherwise see it only in res.json().
      if (res.ok || res.status === 404) {
        const body = await res.arrayBuffer();
        return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
      }
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
