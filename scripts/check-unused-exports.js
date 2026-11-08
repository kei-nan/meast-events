#!/usr/bin/env node
// Fails when a module exports a name no other file in the repository mentions (the rule and why
// it is textual: scripts/lib/unused-exports.js). Run by `npm run lint` at the repo root, so CI
// checks it on every pull request.
//
//   node scripts/check-unused-exports.js     exit 1 and list them when there are any
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unusedExports } from "./lib/unused-exports.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = ["scripts", "app/src", "app/scripts", "app/vite.config.js", "app/vendorChunks.js"];
const SKIP_DIRS = new Set(["node_modules", "licenses", "dist", "public"]);
// Called by a runtime by name rather than imported.
const ALLOWED = new Set([
  // Node module customization hooks (module.register): Node calls them by these names.
  "app/src/lib/testing/viteNodeHooks.mjs:initialize",
  "app/src/lib/testing/viteNodeHooks.mjs:resolve",
  "app/src/lib/testing/viteNodeHooks.mjs:load",
]);

function walk(p, out) {
  let st;
  try {
    st = statSync(path.join(ROOT, p));
  } catch {
    return out;
  }
  if (st.isFile()) {
    if (/\.(m?js|jsx)$/.test(p)) out.push(p);
    return out;
  }
  for (const e of readdirSync(path.join(ROOT, p), { withFileTypes: true })) {
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
    walk(path.posix.join(p, e.name), out);
  }
  return out;
}

const files = SCAN.flatMap((p) => walk(p, [])).sort();
const unused = unusedExports(files, (f) => readFileSync(path.join(ROOT, f), "utf8"), ALLOWED);
if (unused.length) {
  console.error(`FAIL ${unused.length} export(s) that no other file mentions (un-export them, or delete them if unused):`);
  for (const u of unused) console.error(`  ${u}`);
  process.exit(1);
}
console.log(`ok   no unused exports (${files.length} files)`);
