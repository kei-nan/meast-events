import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { etagFor, ifNoneMatchHits, makeIsolateGuard, MAX_URL_LENGTH } from "../src/logic.js";

test("etagFor is stable, weak, and content-sensitive", async () => {
  const a = await etagFor('{"a":1}');
  assert.match(a, /^W\/"[0-9a-f]{20}"$/);
  assert.equal(a, await etagFor('{"a":1}'));
  assert.notEqual(a, await etagFor('{"a":2}'));
});

test("ifNoneMatchHits (weak comparison, lists, *)", () => {
  const e = 'W/"abc"';
  assert.equal(ifNoneMatchHits(e, e), true);
  assert.equal(ifNoneMatchHits('"abc"', e), true); // strong vs weak still matches (weak comparison)
  assert.equal(ifNoneMatchHits('"x", W/"abc" , "y"', e), true);
  assert.equal(ifNoneMatchHits("*", e), true);
  assert.equal(ifNoneMatchHits('W/"zzz"', e), false);
  assert.equal(ifNoneMatchHits(null, e), false);
  assert.equal(ifNoneMatchHits("", e), false);
});

test("makeIsolateGuard: budget, window reset, key isolation, bounded memory", () => {
  const over = makeIsolateGuard({ limit: 3, windowMs: 1000, maxKeys: 2 });
  assert.deepEqual([1, 2, 3, 4].map(() => over("a", 0)), [false, false, false, true]);
  assert.equal(over("b", 0), false); // other key unaffected
  assert.equal(over("a", 1000), false); // new window
  over("c", 1000); // map full -> reset, must not throw or grow unbounded
  assert.equal(over("c", 1000), false);
});

// Full handler, no Redis needed: OPTIONS, 404, 414, 405 and 429 paths return before any socket.
// `cloudflare:sockets` only exists in workerd; stub it so index.js loads in plain Node.
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) {
      if (s === "cloudflare:sockets") return { url: "data:text/javascript," + encodeURIComponent("export const connect = () => { throw new Error('no sockets in tests'); };"), shortCircuit: true };
      return next(s, c);
    }`)
);
const { default: worker } = await import("../src/index.js");
const req = (path, init) => new Request(`https://api.test${path}`, init);

test("handler: security headers on every kind of response", async () => {
  for (const r of [
    await worker.fetch(req("/nope"), {}),
    await worker.fetch(req("/api/events", { method: "OPTIONS" }), {}),
    await worker.fetch(req("/api/events", { method: "POST" }), {}),
  ]) {
    assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(r.headers.get("Cross-Origin-Resource-Policy"), "cross-origin");
  }
});

test("handler: CORS default allow-list vs denied origin vs no Origin (curl)", async () => {
  const prod = "https://atlas-wiki.middle-wiki.workers.dev";
  const ok = await worker.fetch(req("/nope", { headers: { Origin: prod } }), {});
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), prod);
  assert.equal(ok.headers.get("Vary"), "Origin");
  const bad = await worker.fetch(req("/nope", { headers: { Origin: "https://evil.example" } }), {});
  assert.equal(bad.headers.get("Access-Control-Allow-Origin"), null);
  const curl = await worker.fetch(req("/nope"), {});
  assert.equal(curl.status, 404); // still served, just no ACAO
  // env override, legacy name, and "*"
  const o = { headers: { Origin: "https://x.example" } };
  assert.equal((await worker.fetch(req("/nope", o), { ALLOWED_ORIGINS: "https://x.example" })).headers.get("Access-Control-Allow-Origin"), "https://x.example");
  assert.equal((await worker.fetch(req("/nope", o), { ALLOWED_ORIGIN: "https://x.example" })).headers.get("Access-Control-Allow-Origin"), "https://x.example");
  assert.equal((await worker.fetch(req("/nope", o), { ALLOWED_ORIGINS: "*" })).headers.get("Access-Control-Allow-Origin"), "*");
});

test("handler: 414 for absurd URLs", async () => {
  const r = await worker.fetch(req(`/api/events?q=${"a".repeat(MAX_URL_LENGTH)}`), {});
  assert.equal(r.status, 414);
});

test("handler: RATE_LIMITER binding -> 429 + Retry-After; binding errors fail open", async () => {
  const deny = { RATE_LIMITER: { limit: async ({ key }) => ({ success: key !== "1.2.3.4" }) } };
  const r = await worker.fetch(req("/api/events", { headers: { "CF-Connecting-IP": "1.2.3.4" } }), deny);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Retry-After"), "10");
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  // other client passes the limiter (then fails on missing REDIS_URL -> 503, i.e. it got past the guard)
  const pass = await worker.fetch(req("/api/events", { headers: { "CF-Connecting-IP": "5.6.7.8" } }), deny);
  assert.equal(pass.status, 503);
  const boom = { RATE_LIMITER: { limit: async () => { throw new Error("binding down"); } } };
  const orig = console.error;
  console.error = () => {};
  try {
    assert.equal((await worker.fetch(req("/api/events", { headers: { "CF-Connecting-IP": "9.9.9.9" } }), boom)).status, 503);
  } finally {
    console.error = orig;
  }
});
