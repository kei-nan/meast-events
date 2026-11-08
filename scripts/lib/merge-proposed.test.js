// scripts/merge-proposed.js end to end, on temporary copies (never the real data/ files).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { textSha1 } from "./validate.js";

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

// A framing-review.json keyed by event id under "events", as data/framing-review.json is; by default every
// event in the fixture (curated and proposed) has a review of its current text.
const reviewsFor = (events) => ({ events: Object.fromEntries(events.map((e) => [e.id, { text_sha1: textSha1(e.extract) }])) });

function setup({ curated, proposed, exclusions = [], reviewed = [...curated, ...proposed] }) {
  const dir = mkdtempSync(join(tmpdir(), "merge-proposed-test-"));
  const text = JSON.stringify(curated, null, 2) + "\n";
  writeFileSync(join(dir, "events.json"), text);
  writeFileSync(join(dir, "events.proposed.json"), JSON.stringify(proposed, null, 2));
  writeFileSync(join(dir, "proposed-exclusions.json"), JSON.stringify(exclusions));
  writeFileSync(join(dir, "framing-review.json"), JSON.stringify(reviewsFor(reviewed)));
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

test("merge-proposed: a missing exclusions file means none; a malformed one fails, never read as empty", () => {
  const t = setup({ curated, proposed: [event("c", "Q3")] });
  try {
    rmSync(join(t.dir, "proposed-exclusions.json"));
    assert.match(run(t.dir), /Excluded by review \(data\/proposed-exclusions.json\): 0 proposed event\(s\); 0 entries: 0 matched/);
    writeFileSync(join(t.dir, "proposed-exclusions.json"), "[{\"id\": \"c\",");
    assert.throws(() => run(t.dir, "--apply"), (err) => err.status !== 0 && /proposed-exclusions\.json is not valid JSON/.test(err.stderr));
    assert.equal(t.read(), t.text);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("merge-proposed: --apply leaves no temporary file behind", () => {
  const t = setup({ curated, proposed: [event("c", "Q3")] });
  try {
    run(t.dir, "--apply");
    assert.deepEqual(readdirSync(t.dir).filter((f) => f.endsWith(".tmp")), []);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

const COARSE ="date_end_precision_coarse: Wikidata end time 2002-01-01 has only year precision (the year runs to 2002-12-31), so it is not before the start (2002-03-27); stored as Wikidata gives it";
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

test("merge-proposed: --only adds just the listed events; an id not in the proposed file or excluded by review is refused", () => {
  const t = setup({ curated, proposed, exclusions: [{ id: "e", reason: "test" }] });
  try {
    const dry = run(t.dir, "--only=c");
    assert.match(dry, /--only:\s+1 requested, 1 to add/);
    assert.match(dry, /would add:\s+1\s+-> total 3/);
    // "a" is in the proposed file but already curated: not added, and said so.
    assert.match(run(t.dir, "--only=c,a"), /not added \(already curated, not an event, or a skipped duplicate hint\): a/);
    assert.throws(() => run(t.dir, "--only=c,zz", "--apply"), (err) => err.status === 1 && /--only: not in the proposed file: zz/.test(err.stderr));
    assert.throws(() => run(t.dir, "--only=e", "--apply"), (err) => err.status === 1 && /--only: excluded by review .*: e/.test(err.stderr));
    assert.throws(() => run(t.dir, "--only=", "--apply"), (err) => err.status === 1 && /needs at least one/.test(err.stderr));
    assert.equal(t.read(), t.text, "nothing written by the refused runs");
    run(t.dir, "--only=d,c", "--apply");
    assert.deepEqual(JSON.parse(t.read()).map((e) => e.id), ["a", "b", "c", "d"], "proposed-file order kept");
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("merge-proposed: events without a framing review are listed by the dry run and refused by --apply unless --allow-unreviewed", () => {
  // c has a review; d has none; a stale review (text changed) is listed but not refused.
  const stale = event("s", "Q6");
  const t = setup({ curated, proposed: [event("c", "Q3"), event("d", "Q4"), stale], reviewed: [...curated, event("c", "Q3"), { ...stale, extract: "older text" }] });
  try {
    const dry = run(t.dir);
    assert.match(dry, /without a framing review:\s+1 \(--apply refuses them\)\n\s+d\n/);
    assert.match(dry, /framing review stale \(text changed since\): 1\n\s+s\n/);
    assert.throws(
      () => run(t.dir, "--apply"),
      (err) => err.status === 1 && /Refusing to apply: 1 event\(s\) to add have no framing review .*\(d\)/.test(err.stderr)
    );
    assert.equal(t.read(), t.text, "nothing written");
    // Leaving the unreviewed one out with --only works without the override.
    run(t.dir, "--only=c,s", "--apply");
    assert.deepEqual(JSON.parse(t.read()).map((e) => e.id), ["a", "b", "c", "s"]);
    run(t.dir, "--apply", "--allow-unreviewed");
    assert.deepEqual(JSON.parse(t.read()).map((e) => e.id), ["a", "b", "c", "s", "d"]);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("merge-proposed: a missing framing-review.json means no event is reviewed", () => {
  const t = setup({ curated, proposed: [event("c", "Q3")] });
  try {
    rmSync(join(t.dir, "framing-review.json"));
    assert.throws(() => run(t.dir, "--apply"), (err) => err.status === 1 && /no framing review .*\(c\)/.test(err.stderr));
    assert.equal(t.read(), t.text);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("merge-proposed: exclusions match by wikidata_qid after a rename; entries matching nothing are counted and warned", () => {
  const exclusions = [
    { id: "old-title-of-e", wikidata_qid: "Q5", reason: "test" }, // the proposed e is the renamed article
    { id: "stale-entry", wikidata_qid: "Q77", reason: "test" },
  ];
  const t = setup({ curated, proposed, exclusions });
  try {
    const out = execFileSync(process.execPath, [SCRIPT, `--data-dir=${t.dir}`], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    assert.match(out, /Excluded by review \(data\/proposed-exclusions.json\): 1 proposed event\(s\); 2 entries: 1 matched \(0 by id, 1 by wikidata_qid only\), 1 matched nothing/);
    assert.match(out, /\n\s+e \(by wikidata_qid\)\n/);
    assert.match(out, /would add:\s+2\s+-> total 4/, "c and d; e is excluded");
    run(t.dir, "--apply");
    assert.deepEqual(JSON.parse(t.read()).map((e) => e.id), ["a", "b", "c", "d"]);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
  // The warnings go to stderr.
  const t2 = setup({ curated, proposed, exclusions });
  try {
    const r = spawnSync(process.execPath, [SCRIPT, `--data-dir=${t2.dir}`], { encoding: "utf-8" });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /warn exclusion "stale-entry" \(Q77\) matches no proposed event/);
    assert.match(r.stderr, /warn exclusion "old-title-of-e" \(Q5\) matched e by wikidata_qid only \(article renamed\?\); update its id/);
  } finally {
    rmSync(t2.dir, { recursive: true, force: true });
  }
});

test("merge-proposed: a malformed exclusion entry stops the merge", () => {
  const t = setup({ curated, proposed, exclusions: [{ id: "e", wikidata_qid: "5", reason: "test" }] });
  try {
    assert.throws(() => run(t.dir, "--apply"), (err) => err.status === 1 && /wikidata_qid "5" is not a QID/.test(err.stderr));
    assert.equal(t.read(), t.text);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});
