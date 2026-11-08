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

// The JSON body of a MediaWiki Action API response (Wikipedia or Wikidata api.php). That API reports a failed request
// (bad parameter, rate limit, read-only mode, internal error, ...) as HTTP 200 with an `error` object in the body and
// a `MediaWiki-API-Error: <code>` header, not as an HTTP error. Read naively, such a body has no pages/entities, so every
// title or item in the batch would look "missing" - and be cached as null. This throws instead, so the caller writes
// nothing for the batch. `what` names the request in the message.
// The thrown error carries `apiCode`, `lag` (seconds, from a maxlag error's body) and `retryAfter` (the
// Retry-After header), so mediaWikiFetch can tell a transient error from a permanent one.
export async function mediaWikiJson(res, what) {
  if (!res.ok) throw new Error(`${what} HTTP ${res.status}`);
  const header = res.headers?.get?.("mediawiki-api-error") ?? null;
  const data = await res.json();
  const err = data?.error;
  if (err || header) {
    const code = err?.code ?? header;
    const e = new Error(`${what}: API error ${code}${err?.info ? ` (${err.info})` : ""}`);
    e.apiCode = code;
    e.lag = typeof err?.lag === "number" ? err.lag : null;
    e.retryAfter = res.headers?.get?.("retry-after") ?? null;
    throw e;
  }
  return data;
}

// The `maxlag` sent with every Action API request (https://www.mediawiki.org/wiki/Manual:Maxlag_parameter): when the
// database replicas lag more than this many seconds, the API refuses the request with a `maxlag` error (HTTP 200) so a
// bot backs off. Not sent to the REST API or WDQS SPARQL, which do not take it.
export const MAXLAG_SECONDS = 5;

// API error codes that mean "try again later", not "this request is wrong": rate limit, replica lag, read-only mode
// (maintenance) and an internal error (`internal_api_error_<ExceptionClass>`).
export function isTransientApiError(code) {
  return code === "ratelimited" || code === "maxlag" || code === "readonly" || String(code ?? "").startsWith("internal_api_error_");
}

// `url` with maxlag=N appended (left alone when it already has one). Appended as text, so the rest of the URL is
// byte-for-byte what the caller built.
export function withMaxlag(url, seconds = MAXLAG_SECONDS) {
  if (/[?&]maxlag=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}maxlag=${seconds}`;
}

// Wait before retrying a transient API error: its Retry-After header, else a maxlag error's `lag` (seconds), else
// exponential backoff; never longer than MAX_RETRY_AFTER_MS.
export function apiRetryDelayMs(err, attempt, { baseDelayMs, now = Date.now() }) {
  const header = retryAfterMs(err.retryAfter, now);
  if (header != null) return header;
  if (typeof err.lag === "number" && err.lag > 0) return Math.min(Math.ceil(err.lag * 1000), MAX_RETRY_AFTER_MS);
  return Math.min(baseDelayMs * 2 ** attempt, MAX_RETRY_AFTER_MS);
}

// Fetch a MediaWiki Action API URL (Wikipedia or Wikidata api.php) and return its JSON body (mediaWikiJson). Sends
// maxlag (MAXLAG_SECONDS). A transient API error (isTransientApiError; HTTP 200 with an error body, which politeFetch
// cannot see) is retried up to `apiRetries` times, waiting apiRetryDelayMs; any other API error, and the last
// transient one, throws. HTTP-level retries (429/5xx/network) stay politeFetch's. allow404: a 404 returns null.
export async function mediaWikiFetch(
  url,
  what,
  {
    apiRetries = 3,
    baseDelayMs = 5000,
    allow404 = false,
    fetchImpl = globalThis.fetch,
    sleepImpl = sleep,
    nowImpl = Date.now,
  } = {}
) {
  const full = withMaxlag(url);
  for (let attempt = 0; ; attempt++) {
    const res = await politeFetch(full, {}, { fetchImpl, sleepImpl, nowImpl });
    if (allow404 && res.status === 404) return null;
    try {
      return await mediaWikiJson(res, what);
    } catch (err) {
      if (!isTransientApiError(err.apiCode) || attempt >= apiRetries) throw err;
      await sleepImpl(apiRetryDelayMs(err, attempt, { baseDelayMs, now: nowImpl() }));
    }
  }
}

const isTimeout = (err) => err?.name === "TimeoutError" || err?.name === "AbortError";

// opts.fetchImpl / opts.sleepImpl / opts.nowImpl: injectable for tests (default: global fetch,
// real sleep, the real clock for Retry-After dates).
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
    nowImpl = Date.now,
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
          await sleepImpl(retryAfterMs(res.headers.get("retry-after"), nowImpl()) ?? baseDelayMs * 2 ** attempt);
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
