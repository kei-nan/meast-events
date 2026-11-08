// politeFetch and mediaWikiFetch with a mocked fetch (no network).
import test from "node:test";
import assert from "node:assert/strict";
import {
  politeFetch,
  retryAfterMs,
  MAX_RETRY_AFTER_MS,
  USER_AGENT,
  mediaWikiFetch,
  withMaxlag,
  isTransientApiError,
  apiRetryDelayMs,
  MAXLAG_SECONDS,
} from "./http.js";

// A fetch that answers from a list of steps: a Response, an Error to throw, or "hang" (never
// answers until the request's signal aborts it).
function mockFetch(steps) {
  const calls = [];
  const impl = (url, options) => {
    calls.push({ url, options });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === "hang") {
      // A stalled request holds the event loop open the way a real open socket does. Without it, only
      // AbortSignal.timeout's unref'd timer is left and Node may end the test before it fires (Linux CI).
      return new Promise((_, reject) => {
        const socket = setTimeout(() => {}, 60_000);
        options.signal.addEventListener("abort", () => {
          clearTimeout(socket);
          reject(options.signal.reason);
        });
      });
    }
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve(step());
  };
  return { impl, calls };
}
const ok = (body = "{}") => () => new Response(body, { status: 200 });
const status = (code, headers = {}) => () => new Response("", { status: code, headers });
const recordSleeps = () => {
  const waits = [];
  return { waits, sleepImpl: async (ms) => waits.push(ms) };
};

test("retryAfterMs: seconds, HTTP dates, junk", () => {
  const now = Date.parse("Wed, 07 Oct 2026 12:00:00 GMT");
  assert.equal(retryAfterMs("5", now), 5000);
  assert.equal(retryAfterMs("Wed, 07 Oct 2026 12:00:30 GMT", now), 30_000);
  assert.equal(retryAfterMs("Wed, 07 Oct 2026 11:59:00 GMT", now), null); // already past
  assert.equal(retryAfterMs("3600", now), MAX_RETRY_AFTER_MS); // capped
  assert.equal(retryAfterMs("Thu, 08 Oct 2026 12:00:00 GMT", now), MAX_RETRY_AFTER_MS);
  assert.equal(retryAfterMs("0", now), null);
  assert.equal(retryAfterMs("soon", now), null);
  assert.equal(retryAfterMs(null, now), null);
  assert.equal(retryAfterMs("", now), null);
});

test("politeFetch: identifies itself, returns the body, does not retry a 404 or 4xx", async () => {
  const m = mockFetch([ok('{"a":1}')]);
  const res = await politeFetch("https://x.test/a", {}, { fetchImpl: m.impl });
  assert.deepEqual(await res.json(), { a: 1 });
  assert.equal(m.calls[0].options.headers["User-Agent"], USER_AGENT);
  assert.ok(m.calls[0].options.signal, "every request carries a timeout signal");

  const nf = mockFetch([status(404)]);
  assert.equal((await politeFetch("https://x.test/b", {}, { fetchImpl: nf.impl })).status, 404);
  const bad = mockFetch([status(400)]);
  await assert.rejects(politeFetch("https://x.test/c", {}, { fetchImpl: bad.impl }), /HTTP 400/);
  assert.equal(bad.calls.length, 1);
});

test("politeFetch: 429/5xx retried, honouring Retry-After as seconds or an HTTP date", async () => {
  // A pinned clock: the HTTP-date wait does not depend on the real time or how long the test takes.
  const now = Date.parse("2026-10-07T12:00:00Z");
  const date = new Date(now + 20_000).toUTCString();
  const m = mockFetch([status(429, { "Retry-After": "7" }), status(503, { "Retry-After": date }), status(500), ok()]);
  const s = recordSleeps();
  const res = await politeFetch("https://x.test/", {}, { fetchImpl: m.impl, sleepImpl: s.sleepImpl, baseDelayMs: 100, nowImpl: () => now });
  assert.equal(res.status, 200);
  assert.equal(m.calls.length, 4);
  assert.equal(s.waits[0], 7000);
  assert.equal(s.waits[1], 20_000);
  assert.equal(s.waits[2], 400); // no header: exponential backoff (100 * 2^2)
});

test("politeFetch: a status in noRetryStatuses (WDQS 504) fails at once", async () => {
  const m = mockFetch([status(504)]);
  await assert.rejects(politeFetch("https://x.test/", {}, { fetchImpl: m.impl, noRetryStatuses: [504] }), /HTTP 504/);
  assert.equal(m.calls.length, 1);
});

test("politeFetch: a request that hangs times out and is retried like a dropped connection", async () => {
  const m = mockFetch(["hang", ok('"done"')]);
  const s = recordSleeps();
  const res = await politeFetch("https://x.test/", {}, { fetchImpl: m.impl, sleepImpl: s.sleepImpl, timeoutMs: 20 });
  assert.equal(await res.json(), "done");
  assert.equal(m.calls.length, 2);

  const never = mockFetch(["hang"]);
  await assert.rejects(
    politeFetch("https://x.test/slow", {}, { fetchImpl: never.impl, sleepImpl: s.sleepImpl, timeoutMs: 20, retries: 1 }),
    /timeout after 20 ms: https:\/\/x\.test\/slow/
  );
  assert.equal(never.calls.length, 2);
});

test("politeFetch: network errors are retried, then the last one is thrown", async () => {
  const m = mockFetch([new TypeError("fetch failed")]);
  const s = recordSleeps();
  await assert.rejects(politeFetch("https://x.test/", {}, { fetchImpl: m.impl, sleepImpl: s.sleepImpl, retries: 2 }), /fetch failed/);
  assert.equal(m.calls.length, 3);
});

// ---- mediaWikiFetch: MediaWiki Action API errors returned with HTTP 200 ----

const apiErr = (error, headers = {}) => () =>
  new Response(JSON.stringify({ error }), {
    status: 200,
    headers: { "Content-Type": "application/json", "MediaWiki-API-Error": error.code, ...headers },
  });

test("withMaxlag / isTransientApiError", () => {
  assert.equal(withMaxlag("https://x.test/w/api.php?action=query&titles=A%7CB"), "https://x.test/w/api.php?action=query&titles=A%7CB&maxlag=5");
  assert.equal(withMaxlag("https://x.test/w/api.php"), "https://x.test/w/api.php?maxlag=5");
  assert.equal(withMaxlag("https://x.test/w/api.php?maxlag=2"), "https://x.test/w/api.php?maxlag=2");
  assert.equal(MAXLAG_SECONDS, 5);
  for (const c of ["ratelimited", "maxlag", "readonly", "internal_api_error_DBQueryError"]) assert.equal(isTransientApiError(c), true, c);
  for (const c of ["badvalue", "no-such-entity", "missingtitle", "internal_api_error", undefined, null]) {
    assert.equal(isTransientApiError(c), false, String(c));
  }
});

test("mediaWikiFetch: sends maxlag and the User-Agent, returns the body", async () => {
  const m = mockFetch([ok('{"query":{"pages":[]}}')]);
  assert.deepEqual(await mediaWikiFetch("https://x.test/w/api.php?action=query", "q", { fetchImpl: m.impl }), { query: { pages: [] } });
  assert.equal(m.calls[0].url, "https://x.test/w/api.php?action=query&maxlag=5");
  assert.equal(m.calls[0].options.headers["User-Agent"], USER_AGENT);
});

test("mediaWikiFetch: a transient API error is retried, honouring Retry-After, then a maxlag error's lag, then backoff", async () => {
  const m = mockFetch([
    apiErr({ code: "maxlag", info: "Waiting for db1: 7.2 seconds lagged", lag: 7.2 }, { "Retry-After": "5" }),
    apiErr({ code: "maxlag", info: "Waiting for db1: 7.2 seconds lagged", lag: 7.2 }),
    apiErr({ code: "internal_api_error_DBQueryError", info: "Database query error." }),
    ok('{"ok":1}'),
  ]);
  const s = recordSleeps();
  const data = await mediaWikiFetch("https://x.test/w/api.php?a=1", "q", { fetchImpl: m.impl, sleepImpl: s.sleepImpl, baseDelayMs: 100 });
  assert.deepEqual(data, { ok: 1 });
  assert.equal(m.calls.length, 4);
  assert.deepEqual(s.waits, [5000, 7200, 400]); // Retry-After; lag; base * 2^2
});

test("mediaWikiFetch: waits are capped; the last transient error is thrown after apiRetries", async () => {
  const m = mockFetch([apiErr({ code: "ratelimited", info: "You've exceeded your rate limit." }, { "Retry-After": "3600" })]);
  const s = recordSleeps();
  await assert.rejects(
    mediaWikiFetch("https://x.test/w/api.php", "lead fetch", { fetchImpl: m.impl, sleepImpl: s.sleepImpl, apiRetries: 2 }),
    /lead fetch: API error ratelimited/
  );
  assert.equal(m.calls.length, 3);
  assert.deepEqual(s.waits, [MAX_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS]);
  const lagged = mockFetch([apiErr({ code: "maxlag", info: "lagged", lag: 600 })]);
  const s2 = recordSleeps();
  await assert.rejects(mediaWikiFetch("https://x.test/w/api.php", "q", { fetchImpl: lagged.impl, sleepImpl: s2.sleepImpl, apiRetries: 1 }), /maxlag/);
  assert.deepEqual(s2.waits, [MAX_RETRY_AFTER_MS]);
  assert.equal(apiRetryDelayMs({}, 10, { baseDelayMs: 5000 }), MAX_RETRY_AFTER_MS);
});

test("mediaWikiFetch: a permanent API error is not retried; a readonly header alone is; HTTP errors and allow404", async () => {
  const bad = mockFetch([apiErr({ code: "badvalue", info: "Unrecognized value" })]);
  const s = recordSleeps();
  await assert.rejects(mediaWikiFetch("https://x.test/w/api.php", "q", { fetchImpl: bad.impl, sleepImpl: s.sleepImpl }), /q: API error badvalue/);
  assert.equal(bad.calls.length, 1);
  assert.deepEqual(s.waits, []);
  const ro = mockFetch([() => new Response("{}", { status: 200, headers: { "MediaWiki-API-Error": "readonly" } }), ok("{}")]);
  assert.deepEqual(await mediaWikiFetch("https://x.test/w/api.php", "q", { fetchImpl: ro.impl, sleepImpl: s.sleepImpl, baseDelayMs: 1 }), {});
  assert.equal(ro.calls.length, 2);
  const nf = mockFetch([status(404)]);
  await assert.rejects(mediaWikiFetch("https://x.test/w/api.php", "q", { fetchImpl: nf.impl }), /q HTTP 404/);
  assert.equal(await mediaWikiFetch("https://x.test/w/api.php", "q", { fetchImpl: nf.impl, allow404: true }), null);
});
