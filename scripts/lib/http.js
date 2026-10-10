// Shared polite HTTP helpers for the data pipeline.
// Every request identifies itself with the MiddleEastEvents User-Agent (Wikimedia policy),
// and transient failures (429/5xx/network, including a body cut off mid-download, and a
// request that takes longer than `timeoutMs`) are retried with exponential backoff,
// honouring Retry-After (seconds or an HTTP date) when the server sends it.
export const USER_AGENT = "MiddleEastEvents/0.1 (data pipeline; +https://github.com/kei-nan/meast-events)";

// A request (including reading its body) that has not finished after this long is aborted and
// treated like a dropped connection: retried.
export const DEFAULT_TIMEOUT_MS = 60_000;
// Longest wait honoured from a Retry-After header.
export const MAX_RETRY_AFTER_MS = 60_000;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry-After is either delay-seconds or an HTTP date (RFC 9110, 10.2.3). Returns the wait in
// ms (capped at MAX_RETRY_AFTER_MS), or null when absent, unparseable or already past.
export function retryAfterMs(value, now = Date.now()) {
  if (value == null || String(value).trim() === "") return null;
  const v = String(value).trim();
  if (/^\d+$/.test(v)) {
    const s = Number(v);
    return s > 0 ? Math.min(s * 1000, MAX_RETRY_AFTER_MS) : null;
  }
  const at = Date.parse(v);
  if (!Number.isFinite(at)) return null;
  const ms = at - now;
  return ms > 0 ? Math.min(ms, MAX_RETRY_AFTER_MS) : null;
}

const isTimeout = (err) => err?.name === "TimeoutError" || err?.name === "AbortError";

// opts.fetchImpl / opts.sleepImpl: injectable for tests (default: global fetch, real sleep).
export async function politeFetch(
  url,
  options = {},
  {
    retries = 3,
    baseDelayMs = 2000,
    noRetryStatuses = [],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
    sleepImpl = sleep,
  } = {}
) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        ...options,
        headers: { "User-Agent": USER_AGENT, ...options.headers },
        // One signal per attempt; it also covers reading the body below.
        signal: AbortSignal.timeout(timeoutMs),
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
          await sleepImpl(retryAfterMs(res.headers.get("retry-after")) ?? baseDelayMs * 2 ** attempt);
          continue;
        }
        throw err;
      }
      throw err;
    } catch (err) {
      if (err.status && err.status < 500 && err.status !== 429) throw err;
      if (err.status) throw err; // retries exhausted on an HTTP status, or a status not to retry
      lastErr = isTimeout(err) ? new Error(`timeout after ${timeoutMs} ms: ${url}`, { cause: err }) : err;
      if (attempt < retries) await sleepImpl(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastErr;
}
