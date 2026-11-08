import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { eventIds, removedListProblems, unaccountedRemovals } from "./removed-ids.js";

const ids = (...xs) => new Set(xs);

test("unaccountedRemovals: a gone id needs a redirect or a recorded removal", () => {
  const baseIds = ids("a", "b", "c", "d");
  const headIds = ids("a", "b2", "e");
  const r = unaccountedRemovals({ baseIds, headIds, redirects: { b: "b2" }, removed: [{ id: "c" }] });
  assert.deepEqual(r.missing, ["b", "c", "d"]);
  assert.deepEqual(r.unaccounted, ["d"]);
  // Absent files: every gone id is unaccounted; added ids are not judged.
  assert.deepEqual(unaccountedRemovals({ baseIds, headIds, redirects: null, removed: null }).unaccounted, ["b", "c", "d"]);
  assert.deepEqual(unaccountedRemovals({ baseIds: ids("a"), headIds: ids("a", "z"), redirects: null, removed: null }).missing, []);
});

test("removedListProblems: entries are { id, reason, removed_on } for ids that are no longer events", () => {
  const good = [{ id: "gone", reason: "Not an event: a person (merge-proposed.js)", removed_on: "2026-11-08" }];
  assert.deepEqual(removedListProblems(good, ids("a")), []);
  assert.deepEqual(removedListProblems(null, ids()), []);
  assert.match(removedListProblems({}, ids()).join("\n"), /must be an array/);
  assert.match(removedListProblems([{ ...good[0], reason: "" }], ids()).join("\n"), /reason missing/);
  assert.match(removedListProblems([{ ...good[0], removed_on: "8 Nov 2026" }], ids()).join("\n"), /removed_on must be a YYYY-MM-DD day/);
  assert.match(removedListProblems([{ ...good[0], removed_on: undefined }], ids()).join("\n"), /removed_on must be/);
  assert.match(removedListProblems([{ ...good[0], note: "x" }], ids()).join("\n"), /unknown key\(s\) note/);
  assert.match(removedListProblems([good[0], good[0]], ids()).join("\n"), /listed twice/);
  assert.match(removedListProblems(good, ids("gone")).join("\n"), /still an event/);
  assert.match(removedListProblems([{ reason: "x", removed_on: "2026-11-08" }], ids()).join("\n"), /id missing/);
});

test("eventIds: the string ids of an events array", () => {
  assert.deepEqual(eventIds([{ id: "a" }, { id: 5 }, null, { id: "b" }]), ids("a", "b"));
  assert.deepEqual(eventIds(null), ids());
});

// The command, in a scratch git repository: an id dropped since the base commit fails; a redirect or a recorded
// removal lets it pass.
test("check-removed-ids.js: fails on an id gone since --base, passes once it is redirected or recorded", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), "removed-ids-"));
  const git = (...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf-8" });
  const run = (...args) => spawnSync(process.execPath, [join(dir, "scripts/check-removed-ids.js"), ...args], { cwd: dir, encoding: "utf-8" });
  const events = (...xs) => JSON.stringify(xs.map((id) => ({ id })));
  try {
    await mkdir(join(dir, "scripts/lib"), { recursive: true });
    await mkdir(join(dir, "data"));
    await cp(join(root, "scripts/check-removed-ids.js"), join(dir, "scripts/check-removed-ids.js"));
    await cp(join(root, "scripts/lib/removed-ids.js"), join(dir, "scripts/lib/removed-ids.js"));
    assert.equal(git("init", "-q").status, 0);
    await writeFile(join(dir, "data/events.json"), events("a", "b", "c"));
    git("add", "data/events.json");
    assert.equal(git("commit", "-q", "-m", "base").status, 0);
    const base = git("rev-parse", "HEAD").stdout.trim();

    assert.equal(run(`--base=${base}`).status, 0);
    await writeFile(join(dir, "data/events.json"), events("a", "b2"));
    const bad = run(`--base=${base}`);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /2 event id\(s\) .* are no longer in data\/events\.json/);
    assert.match(bad.stderr, /^ {2}b$/m);
    assert.match(bad.stderr, /^ {2}c$/m);

    await writeFile(join(dir, "data/event-redirects.json"), JSON.stringify({ b: "b2" }));
    await writeFile(join(dir, "data/removed-events.json"), JSON.stringify([{ id: "c", reason: "A duplicate of a", removed_on: "2026-11-08" }]));
    const ok = run(`--base=${base}`);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /b: gone, redirected to b2/);
    assert.match(ok.stdout, /c: gone, recorded in data\/removed-events\.json/);

    // A bad --base is refused before git sees it; an unknown one fails with a message.
    assert.equal(run("--base=--output=x").status, 2);
    const unknown = run("--base=no-such-ref");
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /cannot read data\/events\.json at no-such-ref/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
