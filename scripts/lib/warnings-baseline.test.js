import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareWithBaseline, formatBaseline, normalizeEntries, parseBaseline, warningsReport, baselineKey } from "./warnings-baseline.js";

const E = "data/events.json";
const P = "data/events.proposed.json";

test("normalizeEntries: sorted, de-duplicated, a null id stored as an empty string", () => {
  assert.deepEqual(
    normalizeEntries([[E, "b", "x"], [E, "a", "y"], [E, "a", "x"], [E, "b", "x"], ["data/framing-review.json", null, "z"]]),
    [[E, "a", "x"], [E, "a", "y"], [E, "b", "x"], ["data/framing-review.json", "", "z"]]
  );
});

test("compareWithBaseline: new, gone, and the baseline to write", () => {
  const base = [[E, "a", "short_extract"], [E, "b", "many_countries"], [P, "p", "short_extract"]];
  const now = [[E, "a", "short_extract"], [E, "c", "outside_region"]];
  const r = compareWithBaseline(now, base, { files: [E] });
  assert.deepEqual(r.fresh, [[E, "c", "outside_region"]]);
  assert.deepEqual(r.gone, [[E, "b", "many_countries"]]);
  // The proposed file was not validated in this run: its entry is neither gone nor dropped.
  assert.deepEqual(r.next, [[E, "a", "short_extract"], [E, "c", "outside_region"], [P, "p", "short_extract"]]);
});

test("compareWithBaseline: a skipped check's entries are not gone", () => {
  const base = [[E, "a", "pin_outside_countries"]];
  assert.deepEqual(compareWithBaseline([], base, { files: [E], skippedCodes: ["pin_outside_countries"] }).gone, []);
  assert.deepEqual(compareWithBaseline([], base, { files: [E] }).gone, base);
});

test("formatBaseline / parseBaseline round trip; a malformed baseline is refused", () => {
  const entries = [[E, "b", "x"], [E, "a", "x"]];
  assert.deepEqual(parseBaseline(JSON.parse(formatBaseline(entries))), normalizeEntries(entries));
  assert.throws(() => parseBaseline({ warnings: [["a", "b"]] }), /triples/);
  assert.throws(() => parseBaseline({}), /triples/);
});

test("warningsReport: lists each new warning with its message, and the gone ones", () => {
  const fresh = [[E, "c", "outside_region"]];
  const messages = new Map([[baselineKey(fresh[0]), ["data/events.json[3] c: coordinates (1, 2) are outside"]]]);
  const md = warningsReport({ fresh, gone: [[E, "b", "many_countries"]], messages, written: true });
  assert.match(md, /1 new warning/);
  assert.match(md, /coordinates \(1, 2\) are outside/);
  assert.match(md, /`data\/events.json` b, `many_countries`/);
  assert.match(warningsReport({ fresh: [], gone: [] }), /No new validation warning/);
});

// The command itself, on a copy of the repository's scripts and data: the committed data passes against the committed
// baseline; a new warning fails; a warning that went away is listed, and does not fail.
test("validate-events.js: fails on a warning not in the baseline, lists gone ones", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), "warnings-baseline-"));
  try {
    await cp(join(root, "scripts"), join(dir, "scripts"), { recursive: true, filter: (p) => !/node_modules/.test(p) });
    await cp(join(root, "app/src/lib"), join(dir, "app/src/lib"), { recursive: true });
    for (const f of ["events.json", "framing-review.json", "validation-warnings-baseline.json"]) await cp(join(root, "data", f), join(dir, "data", f));
    // No boundaries.json (and no node_modules): the pin check is skipped, so its baseline entries are not "gone".
    const run = () => spawnSync(process.execPath, [join(dir, "scripts/validate-events.js")], { cwd: dir, encoding: "utf-8" });
    const ok = run();
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /no new warning/);
    assert.doesNotMatch(ok.stdout, /^gone/m);

    const eventsPath = join(dir, "data/events.json");
    const events = JSON.parse(await readFile(eventsPath, "utf-8"));
    const baseline = JSON.parse(await readFile(join(dir, "data/validation-warnings-baseline.json"), "utf-8")).warnings;
    const quiet = events.find((e) => !baseline.some(([f, id]) => f === "data/events.json" && id === e.id) && e.extract.length > 200);
    const quietExtract = quiet.extract;
    quiet.extract = quiet.extract.slice(0, 100); // a short_extract warning
    await writeFile(eventsPath, JSON.stringify(events, null, 2));
    const bad = run();
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, new RegExp(`NEW data/events\\.json\\[\\d+\\] ${quiet.id}: extract is only \\d+ characters`));

    // Back to the committed text, and one baseline warning removed: listed as gone, still a pass.
    quiet.extract = quietExtract;
    const [, goneId, goneCode] = baseline.find(([f, , code]) => f === "data/events.json" && code === "short_extract");
    const target = events.find((e) => e.id === goneId);
    target.extract = target.extract + " " + "x".repeat(200);
    await writeFile(eventsPath, JSON.stringify(events, null, 2));
    const gone = run();
    assert.match(gone.stdout, new RegExp(`data/events\\.json ${goneId} ${goneCode}`));
    // The framing review of the changed extract is now stale: a new warning, so the run fails on that one only.
    assert.match(gone.stderr, new RegExp(`NEW data/framing-review\\.json: ${goneId} review is stale`));
    assert.equal(gone.status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
