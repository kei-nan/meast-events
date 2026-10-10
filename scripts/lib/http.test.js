// politeFetch with a mocked fetch (no network).
import test from "node:test";
import assert from "node:assert/strict";
import { politeFetch, retryAfterMs, MAX_RETRY_AFTER_MS, USER_AGENT } from "./http.js";

// A fetch that answers from a list of steps: a Response, an Error to throw, or "hang" (never
// answers until the request's signal aborts it).
function mockFetch(steps) {
  const calls = [];
  const impl = (url, options) => {
    calls.push({ url, options });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === "hang") {
      return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason)));
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
  const date = new Date(Date.now() + 20_000).toUTCString();
  const m = mockFetch([status(429, { "Retry-After": "7" }), status(503, { "Retry-After": date }), status(500), ok()]);
  const s = recordSleeps();
  const res = await politeFetch("https://x.test/", {}, { fetchImpl: m.impl, sleepImpl: s.sleepImpl, baseDelayMs: 100 });
  assert.equal(res.status, 200);
  assert.equal(m.calls.length, 4);
  assert.equal(s.waits[0], 7000);
  assert.ok(s.waits[1] > 15_000 && s.waits[1] <= 20_000, `HTTP-date wait ${s.waits[1]}`);
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
