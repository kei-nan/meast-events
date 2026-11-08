// Fails when an event id of a base ref's data/events.json is gone from the working tree's data/events.json without
// being renamed (data/event-redirects.json) or recorded as removed (data/removed-events.json). See lib/removed-ids.js.
//   node scripts/check-removed-ids.js [--base=<commit or ref>]   (default origin/main)
// CI runs it on pull requests with the PR's base commit (ci.yml). Reads git history only; no network.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eventIds, removedListProblems, unaccountedRemovals } from "./lib/removed-ids.js";

const root = new URL("../", import.meta.url);
const base = process.argv.find((a) => a.startsWith("--base="))?.slice("--base=".length) ?? "origin/main";
// A commit id or a ref name; never something git would read as an option.
if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(base) || base.includes("..")) {
  console.error(`FAIL --base=${JSON.stringify(base)} is not a commit id or ref name`);
  process.exit(2);
}

const readJson = async (path) => (existsSync(new URL(path, root)) ? JSON.parse(await readFile(new URL(path, root), "utf-8")) : null);

const shown = spawnSync("git", ["show", `${base}:data/events.json`], {
  cwd: fileURLToPath(root),
  encoding: "utf-8",
  maxBuffer: 256 * 1024 * 1024,
});
if (shown.status !== 0) {
  console.error(`FAIL cannot read data/events.json at ${base} (fetch it first, e.g. git fetch origin main): ${shown.stderr.trim()}`);
  process.exit(1);
}
const baseIds = eventIds(JSON.parse(shown.stdout));
const headIds = eventIds(await readJson("data/events.json"));
const redirects = await readJson("data/event-redirects.json");
const removed = await readJson("data/removed-events.json");

const problems = removedListProblems(removed, headIds);
const { missing, unaccounted } = unaccountedRemovals({ baseIds, headIds, redirects, removed });
for (const id of missing.filter((id) => !unaccounted.includes(id))) {
  console.log(`ok   ${id}: gone, ${redirects && Object.hasOwn(redirects, id) ? `redirected to ${redirects[id]}` : "recorded in data/removed-events.json"}`);
}
for (const p of problems) console.error(`FAIL ${p}`);
if (unaccounted.length) {
  console.error(`FAIL ${unaccounted.length} event id(s) of ${base} are no longer in data/events.json, so links to /event/<id> would break:`);
  for (const id of unaccounted) console.error(`  ${id}`);
  console.error(
    "Rename: add it to data/event-redirects.json ({\"old-id\": \"new-id\"}). Removed on purpose: add " +
      '{"id", "reason", "removed_on": "YYYY-MM-DD"} to data/removed-events.json. (DEPLOYMENT.md, "Renamed event ids")'
  );
}
if (problems.length || unaccounted.length) process.exit(1);
console.log(`ok   ${baseIds.size} event ids of ${base}: ${missing.length ? `${missing.length} gone, each redirected or recorded` : "all still present"} (${headIds.size} now)`);
