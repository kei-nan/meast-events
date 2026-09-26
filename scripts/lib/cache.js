// Tiny resumable JSON cache for network fetches (one file per namespace).
// Default location is outside the repo (OS temp dir); override with ATLAS_CACHE_DIR
// or --cache-dir=... on the scripts that accept it.
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function defaultCacheDir() {
  const arg = process.argv.find((a) => a.startsWith("--cache-dir="))?.split("=").slice(1).join("=");
  return arg ?? process.env.ATLAS_CACHE_DIR ?? join(tmpdir(), "atlaswiki-cache");
}

export function openCache(name, dir = defaultCacheDir()) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  let data = {};
  if (existsSync(file)) {
    try {
      data = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      data = {};
    }
  }
  let dirty = 0;
  return {
    file,
    has: (k) => Object.prototype.hasOwnProperty.call(data, k),
    get: (k) => data[k],
    set(k, v) {
      data[k] = v;
      dirty++;
    },
    flush() {
      if (!dirty) return;
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(data));
      renameSync(tmp, file);
      dirty = 0;
    },
    size: () => Object.keys(data).length,
  };
}
