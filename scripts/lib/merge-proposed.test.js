// scripts/merge-proposed.js end to end, on temporary copies (never the real data/ files).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../merge-proposed.js", import.meta.url));

const event = (id, qid, over = {}) => ({
  id,
  title: id,
  wikidata_qid: qid,
  date_start: "1967-06-05",
  date_end: null,
  countries: ["Egypt"],
  category: "war",
  extract:
    "A test event whose summary is long enough to pass the validator's snippet-length warning, which wants more than one hundred and sixty characters of text.",
  wikidata_classes: ["war"],
  extract_retrieved_at: "2026-09-26",
  location_quality: "precise",
  coordinates: { lat: 30, lon: 31 },
  coordinate_source: "wikipedia",
  wikipedia_url: `https://en.wikipedia.org/wiki/${id}`,
  ...over,
});

function setup({ curated, proposed, exclusions = [] }) {
  const dir = mkdtempSync(join(tmpdir(), "merge-proposed-test-"));
  const text = JSON.stringify(curated, null, 2) + "\n";
  writeFileSync(join(dir, "events.json"), text);
  writeFileSync(join(dir, "events.proposed.json"), JSON.stringify(proposed, null, 2));
  writeFileSync(join(dir, "proposed-exclusions.json"), JSON.stringify(exclusions));
  return { dir, text, read: () => readFileSync(join(dir, "events.json"), "utf-8") };
}
const run = (dir, ...args) => execFileSync(process.execPath, [SCRIPT, `--data-dir=${dir}`, ...args], { encoding: "utf-8", stdio: "pipe" });

const curated = [event("a", "Q1"), event("b", "Q2")];
const proposed = [
  event("a", "Q1"), // already curated (id and QID): skipped
  event("c", "Q3"),
  event("d", "Q4", { possible_duplicates: [{ id: "a", title: "a", reason: "test" }] }),
  event("e", "Q5"), // excluded by review
];

test("merge-proposed: dry run (default) reports and writes nothing", () => {
  const t = setup({ curated, proposed, exclusions: [{ id: "e", reason: "test" }] });
  try {
    const out = run(t.dir);
    assert.match(out, /DRY RUN/);
    assert.match(out, /skipped \(id\/QID already curated\): 1/);
    assert.match(out, /a \(id, wikidata_qid\)/);
    assert.match(out, /would add:\s+2\s+-> total 4/);
    assert.match(out, /nothing was written/);
    assert.equal(t.read(), t.text); // byte for byte unchanged
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("merge-proposed: --apply appends the new events unchanged, curated untouched", () => {
  const t = setup({ curated, proposed, exclusions: [{ id: "e", reason: "test" }] });
  try {
    const out = run(t.dir, "--apply");
    assert.match(out, /APPLY/);
    const merged = JSON.parse(t.read());
    assert.deepEqual(merged.map((e) => e.id), ["a", "b", "c", "d"]);
    assert.deepEqual(merged.slice(0, 2), curated);
    assert.deepEqual(merged[2], proposed[1]);
    assert.deepEqual(merged[3], proposed[2]); // the duplicate hint is kept as is
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("merge-proposed: --skip-duplicate-hints leaves hinted events out", () => {
  const t = setup({ curated, proposed });
  try {
    run(t.dir, "--apply", "--skip-duplicate-hints");
    assert.deepEqual(JSON.parse(t.read()).map((e) => e.id), ["a", "b", "c", "e"]);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("merge-proposed: an invalid proposed file is refused, even with --apply", () => {
  const t = setup({ curated, proposed: [event("c", "Q3", { coordinates: null })] });
  try {
    assert.throws(() => run(t.dir, "--apply"), (err) => err.status === 1 && /refusing to merge/.test(err.stderr));
    assert.equal(t.read(), t.text);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("merge-proposed: not events are removed from the curated file and never added; --no-add adds nothing", () => {
  const history = event("x", "Q9", { wikidata_classes: ["history of a country or state", "war"] });
  const t = setup({ curated: [...curated, history], proposed: [event("c", "Q3"), event("y", "Q8", { wikidata_classes: ["human", "war"] })] });
  try {
    const dry = run(t.dir);
    assert.match(dry, /removed, not events \(rule\):\s+1/);
    assert.match(dry, /x \(history of a country or state\)/);
    assert.match(dry, /proposed, not events \(not added\): y/);
    assert.equal(t.read(), t.text, "dry run writes nothing");
    run(t.dir, "--apply", "--no-add");
    assert.deepEqual(JSON.parse(t.read()), curated, "x removed, c not added, the rest byte-identical records");
    run(t.dir, "--apply");
    assert.deepEqual(JSON.parse(t.read()).map((e) => e.id), ["a", "b", "c"]);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

const COARSE = "date_end_precision_coarse: Wikidata end time 2002-01-01 has only year precision (the year runs to 2002-12-31), so it is not before the start (2002-03-27); stored as Wikidata gives it";
test("merge-proposed: re-derived date-order flags reach the curated record, nothing else does", () => {
  const order = { date_start: "2002-03-27", date_end: "2002-01-01", review_reasons: ["part_of: x"], needs_review: true };
  const old = event("p", "Q7", { ...order, date_flags: ["date_order_invalid: old", "wikipedia_dates_note: old"], wikipedia_lead_dates: ["2002-03-27"] });
  const fresh = event("p", "Q7", { ...order, title: "renamed upstream", date_flags: [COARSE] });
  const t = setup({ curated: [...curated, old], proposed: [fresh] });
  try {
    assert.match(run(t.dir), /date-order flags re-derived:\s+1\s+p: date_end_precision_coarse/);
    run(t.dir, "--apply", "--no-add");
    const out = JSON.parse(t.read());
    const { wikipedia_lead_dates: _lead, ...rest } = old;
    assert.deepEqual(out.at(-1), { ...rest, date_flags: [COARSE] }, "title and the rest stay curated");
    assert.deepEqual(out.slice(0, 2), curated);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});
