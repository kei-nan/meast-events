import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCache, parseMaxAge, cacheOptionsFromArgs } from "./cache.js";

const withDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "cache-test-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("parseMaxAge / cacheOptionsFromArgs", () => {
  assert.equal(parseMaxAge("7d"), 7 * 86_400_000);
  assert.equal(parseMaxAge("12h"), 12 * 3_600_000);
  assert.equal(parseMaxAge("30m"), 30 * 60_000);
  assert.equal(parseMaxAge("3600"), 3_600_000);
  assert.equal(parseMaxAge(undefined), null);
  assert.throws(() => parseMaxAge("a week"), /cache max age/);
  assert.deepEqual(cacheOptionsFromArgs(["node", "x.js", "--fresh"], {}), { fresh: true, maxAgeMs: null });
  assert.deepEqual(cacheOptionsFromArgs(["node", "x.js", "--cache-max-age=2d"], {}), { fresh: false, maxAgeMs: 2 * 86_400_000 });
  assert.deepEqual(cacheOptionsFromArgs(["node", "x.js"], { ATLAS_CACHE_MAX_AGE: "1h" }), { fresh: false, maxAgeMs: 3_600_000 });
});

test("openCache: entries persist across opens and never expire by default", () =>
  withDir((dir) => {
    let t = 1_000;
    const now = () => t;
    const a = openCache("x", dir, { fresh: false, maxAgeMs: null, now });
    a.set("k", { v: 1 });
    a.flush();
    t += 365 * 86_400_000;
    const b = openCache("x", dir, { fresh: false, maxAgeMs: null, now });
    assert.equal(b.has("k"), true);
    assert.deepEqual(b.get("k"), { v: 1 });
    assert.equal(b.size(), 1);
  }));

test("openCache: max age expires old entries; entries without a time count as expired", () =>
  withDir((dir) => {
    let t = 0;
    const now = () => t;
    const a = openCache("x", dir, { fresh: false, maxAgeMs: null, now });
    a.set("old", 1);
    a.flush();
    t = 10_000;
    const b = openCache("x", dir, { fresh: false, maxAgeMs: null, now });
    b.set("new", 2);
    b.flush();
    t = 12_000;
    const c = openCache("x", dir, { fresh: false, maxAgeMs: 5_000, now });
    assert.equal(c.has("old"), false);
    assert.equal(c.get("old"), undefined);
    assert.equal(c.has("new"), true);
    assert.equal(c.size(), 1);
    // A cache file from before times were kept: no time = too old for any max age.
    writeFileSync(join(dir, "legacy.json"), JSON.stringify({ k: 1 }));
    assert.equal(openCache("legacy", dir, { fresh: false, maxAgeMs: 5_000, now }).has("k"), false);
    assert.equal(openCache("legacy", dir, { fresh: false, maxAgeMs: null, now }).has("k"), true);
  }));

test("openCache: --fresh ignores what was cached before, but keeps what this run wrote", () =>
  withDir((dir) => {
    const a = openCache("x", dir, { fresh: false, maxAgeMs: null });
    a.set("k", 1);
    a.flush();
    const b = openCache("x", dir, { fresh: true, maxAgeMs: null });
    assert.equal(b.has("k"), false);
    b.set("k", 2);
    assert.equal(b.get("k"), 2);
    b.flush();
    assert.equal(openCache("x", dir, { fresh: false, maxAgeMs: null }).get("k"), 2);
  }));
