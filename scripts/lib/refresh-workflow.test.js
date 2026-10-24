// The monthly refresh (.github/workflows/refresh-data.yml) changes data/events.json and then runs the generated
// reports' --check, as CI does. Every report it checks must also be regenerated there (without network) and carried
// into the PR by the "open-pr" job, or the first refresh that changes a lead date or a title fails and opens no PR.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const workflow = (await readFile(join(root, ".github/workflows/refresh-data.yml"), "utf-8")).replace(/\r\n/g, "\n");

// The file each --check'd generator writes, and its no-network regenerate command. A new --check in the
// workflow must be added here.
const OUTPUT = {
  "build-missing-coordinates-report.js": { out: "missing-coordinates-report.md", regen: "node scripts/build-missing-coordinates-report.js" },
  "build-selection-funnel.js": { out: "selection-funnel.json", regen: "node scripts/build-selection-funnel.js --offline" },
};

test("refresh-data.yml: every --check'd report is regenerated offline and carried into the PR", () => {
  const checked = [...workflow.matchAll(/node scripts\/(\S+\.js) --check\b/g)].map((m) => m[1]);
  assert.ok(checked.length >= 2, "found the workflow's --check lines");
  const upload = workflow.match(/name: refresh-data\n\s+path: \|\n((?:\s+data\/\S+\n)+)/)?.[1] ?? "";
  const copyLoop = workflow.match(/for f in ([^;]+); do/)?.[1].split(/\s+/) ?? [];
  const gitAdd = workflow.match(/git -c core\.hooksPath=\/dev\/null add ([^\n]+)/)?.[1].split(/\s+/) ?? [];
  for (const script of checked) {
    assert.ok(OUTPUT[script], `${script}: add its output file and regenerate command to OUTPUT in this test`);
    const { out, regen } = OUTPUT[script];
    const at = workflow.indexOf(`${regen}\n`);
    assert.ok(at >= 0, `the workflow regenerates ${out} with "${regen}"`);
    assert.ok(at < workflow.indexOf(`node scripts/${script} --check`), `${script} is regenerated before it is checked`);
    assert.match(upload, new RegExp(`data/${out.replace(".", "\\.")}\\n`), `data/${out} is in the refresh-data artifact`);
    assert.ok(copyLoop.includes(out), `${out} is copied from the artifact in open-pr`);
    assert.ok(gitAdd.includes(`data/${out}`), `data/${out} is added to the PR commit`);
  }
});

// The funnel's --offline must give what --check expects, and keep the committed sitelink_measurement (its only
// network part), on a copy of the repository's scripts and data.
test("build-selection-funnel.js --offline: deterministic, keeps sitelink_measurement, satisfies --check", async () => {
  const dir = await mkdtemp(join(tmpdir(), "funnel-"));
  try {
    await cp(join(root, "scripts"), join(dir, "scripts"), { recursive: true, filter: (p) => !/node_modules/.test(p) });
    for (const f of ["event-candidates.json", "enriched-candidates.json", "events.proposed.json", "events.json", "seed-events.json", "proposed-exclusions.json", "selection-funnel.json"]) {
      await cp(join(root, "data", f), join(dir, "data", f));
    }
    const run = (...args) => spawnSync(process.execPath, [join(dir, "scripts/build-selection-funnel.js"), ...args], { encoding: "utf-8" });
    const funnelPath = join(dir, "data/selection-funnel.json");
    const committed = (await readFile(funnelPath, "utf-8")).replace(/\r\n/g, "\n");

    assert.equal(run("--offline").status, 0);
    assert.equal(await readFile(funnelPath, "utf-8"), committed, "unchanged data: --offline rewrites the same file");

    // What a refresh does to a changed lead: a newer extract_retrieved_at, which dates the funnel.
    const eventsPath = join(dir, "data/events.json");
    const events = JSON.parse(await readFile(eventsPath, "utf-8"));
    events[0].extract_retrieved_at = "2099-01-01";
    await writeFile(eventsPath, JSON.stringify(events, null, 2) + "\n");
    assert.equal(run("--check").status, 1, "the stale funnel fails --check");
    assert.equal(run("--offline").status, 0);
    assert.equal(run("--check").status, 0, "after --offline, --check passes");
    const after = JSON.parse(await readFile(funnelPath, "utf-8"));
    assert.equal(after.data_as_of, "2099-01-01");
    assert.deepEqual(after.sitelink_measurement, JSON.parse(committed).sitelink_measurement);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
