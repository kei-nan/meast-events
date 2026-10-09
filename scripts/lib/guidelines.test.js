import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGuidelineUrl, permalink, ownSection, sectionHash, diffLines, changedSpan } from "./guidelines.js";

test("parseGuidelineUrl: page title with spaces and the section anchor", () => {
  assert.deepEqual(parseGuidelineUrl("https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch#Contentious_labels"), {
    page: "Wikipedia:Manual of Style/Words to watch",
    anchor: "Contentious_labels",
  });
  assert.throws(() => parseGuidelineUrl("https://en.wikipedia.org/wiki/Wikipedia:Neutral_point_of_view"), /section link/);
  assert.throws(() => parseGuidelineUrl("https://de.wikipedia.org/wiki/X#Y"), /section link/);
});

test("permalink: the section in one revision", () => {
  assert.equal(
    permalink("https://en.wikipedia.org/wiki/Wikipedia:Neutral_point_of_view#Explanation", 1370393267),
    "https://en.wikipedia.org/w/index.php?title=Wikipedia%3ANeutral_point_of_view&oldid=1370393267#Explanation"
  );
});

test("ownSection: keeps the heading and body, drops subsections, stops at nothing else", () => {
  const t = "=== Puffery ===\nA.\n\nB.\n==== Sub ====\nC.\n=== Next ===\nD.";
  assert.equal(ownSection(t), "=== Puffery ===\nA.\n\nB.");
  assert.equal(ownSection("== Explanation ==\r\nA.\r\nB.\r\n"), "== Explanation ==\nA.\nB.");
  // a bolded line or a same-level heading inside the returned text is not a subsection
  assert.equal(ownSection("== X ==\n'''==not a heading'''\nA."), "== X ==\n'''==not a heading'''\nA.");
});

test("sectionHash: whitespace-only edits do not count, word edits do", () => {
  const a = sectionHash("=== X ===\nWords such as  supposed.\n");
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.equal(sectionHash("=== X ===\r\n Words such as supposed."), a);
  assert.notEqual(sectionHash("=== X ===\nWords such as alleged."), a);
});

test("diffLines: removed and added lines only", () => {
  assert.deepEqual(diffLines("a\nb\nc", "a\nc\nd"), { removed: ["b"], added: ["d"] });
  assert.deepEqual(diffLines("a\n\nb", "a\nb\n"), { removed: [], added: [] });
});

test("changedSpan: shows the changed part of a long line with context", () => {
  const head = "x".repeat(200);
  const tail = "y".repeat(200);
  const { before, after } = changedSpan(`${head} quoted, indicating distance. ${tail}`, `${head} quoted. ${tail}`, 10);
  // 10 characters of context on each side of the change ("," ... "e" against "")
  assert.equal(before, "…xxx quoted, indicating distance. yyyyyyyy…");
  assert.equal(after, "…xxx quoted. yyyyyyyy…");
  assert.deepEqual(changedSpan("short a", "short b", 80), { before: "short a", after: "short b" });
});

test("data/framing-review.json: every guideline records the revision the reviews applied", () => {
  const review = JSON.parse(readFileSync(new URL("../../data/framing-review.json", import.meta.url), "utf8"));
  for (const [key, g] of Object.entries(review.guidelines)) {
    parseGuidelineUrl(g.url);
    for (const r of [g.reviewed_revision, g.changed_revision].filter(Boolean)) {
      assert.ok(Number.isInteger(r.revid) && r.revid > 0, `${key}: revid`);
      assert.match(r.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `${key}: timestamp`);
    }
    assert.ok(g.reviewed_revision, `${key}: no reviewed_revision (node scripts/refresh-guidelines.js --pin=YYYY-MM-DD)`);
    assert.match(g.reviewed_revision.section_sha1, /^[0-9a-f]{12}$/, `${key}: section_sha1`);
    if (g.changed_revision) {
      assert.notEqual(g.changed_revision.section_sha1, g.reviewed_revision.section_sha1, `${key}: changed_revision equals the reviewed text`);
      assert.ok(g.changed_revision.revid > g.reviewed_revision.revid, `${key}: changed_revision older than reviewed_revision`);
    }
  }
});
