// Tiny resumable JSON cache for network fetches (one file per namespace).
// Default location is outside the repo (OS temp dir); override with ATLAS_CACHE_DIR
// or --cache-dir=... on the scripts that accept it.
//
// Expiry: entries never expire by default (an interrupted run resumes from whatever was
// fetched). Every script that uses the cache also accepts
//   --fresh                    ignore every cached entry (re-fetch everything; still written back)
//   --cache-max-age=<N><unit>  ignore entries older than that (unit s, m, h or d; e.g. 7d),
//                              also ATLAS_CACHE_MAX_AGE
// Each entry's storage time is kept next to the cache in <name>.times.json. Entries written by
// an older version of this file have no time and count as expired whenever a max age is set.
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argVal = (argv, name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

export function defaultCacheDir(argv = process.argv) {
  return argVal(argv, "cache-dir") ?? process.env.ATLAS_CACHE_DIR ?? join(tmpdir(), "atlaswiki-cache");
}

const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
// "7d" / "12h" / "30m" / "45s" / "3600" (seconds) -> ms; null for empty; throws on nonsense.
export function parseMaxAge(text) {
  if (text == null || text === "") return null;
  const m = /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(String(text).trim());
  if (!m) throw new Error(`cache max age must look like 7d, 12h, 30m or 3600 (seconds), got ${JSON.stringify(text)}`);
  return Number(m[1]) * UNIT_MS[m[2] || "s"];
}

// Expiry options from the command line / environment.
export function cacheOptionsFromArgs(argv = process.argv, env = process.env) {
  return {
    fresh: argv.includes("--fresh"),
    maxAgeMs: parseMaxAge(argVal(argv, "cache-max-age") ?? env.ATLAS_CACHE_MAX_AGE),
  };
}

const readJson = (file) => {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
};
const writeJson = (file, data) => {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, file);
};

// opts.fresh / opts.maxAgeMs: see above (default: from the command line); opts.now: clock (tests).
export function openCache(name, dir = defaultCacheDir(), { fresh, maxAgeMs, now = () => Date.now() } = {}) {
  const fromArgs = cacheOptionsFromArgs();
  fresh ??= fromArgs.fresh;
  maxAgeMs ??= fromArgs.maxAgeMs;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  const timesFile = join(dir, `${name}.times.json`);
  const data = readJson(file);
  const times = readJson(timesFile);
  const written = {}; // keys set in this run: always valid, even with --fresh
  const valid = (k) => {
    if (!Object.prototype.hasOwnProperty.call(data, k)) return false;
    if (fresh && !Object.prototype.hasOwnProperty.call(written, k)) return false;
    if (maxAgeMs == null) return true;
    const t = times[k];
    return typeof t === "number" && now() - t <= maxAgeMs;
  };
  let dirty = 0;
  return {
    file,
    has: (k) => valid(k),
    get: (k) => (valid(k) ? data[k] : undefined),
    set(k, v) {
      data[k] = v;
      times[k] = now();
      written[k] = true;
      dirty++;
    },
    flush() {
      if (!dirty) return;
      writeJson(file, data);
      writeJson(timesFile, times);
      dirty = 0;
    },
    size: () => Object.keys(data).filter(valid).length,
  };
}
