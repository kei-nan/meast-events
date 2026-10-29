import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DATA_FIXES_DOC, dataFixAnchors, dataFixRefs, dataFixUrl, githubAnchor } from "./dataFixes.js";

test("dataFixRefs: only applied fixes (data_fix Fn notes), each once, in order", () => {
  const reasons = [
    "part_of: x",
    "data_fix F7: October 7 attacks: stored date_start ... (fields: date_start; see docs/data-fixes.md)",
    "text_from_redirect_target: ... (docs/data-fixes.md F12)",
    "data_fix F11: pin ...",
    "data_fix F7: again",
  ];
  assert.deepEqual(dataFixRefs(reasons), ["F7", "F11"]);
  assert.deepEqual(dataFixRefs(undefined), []);
  assert.deepEqual(dataFixRefs(["not data_fix F1: in the middle"]), []);
});

test("githubAnchor: GitHub's heading ids", () => {
  // Checked 2026-10-24 against the ids GitHub renders for docs/data-fixes.md.
  assert.equal(
    githubAnchor("F7 - October 7 attacks dated 1 October 2023 (`october-7-attacks`, Q122976243)"),
    "f7---october-7-attacks-dated-1-october-2023-october-7-attacks-q122976243"
  );
  assert.equal(
    githubAnchor("F2 - Operation Olive Branch: date_start 2019-08-09 vs the article's 2018 (`operation-olive-branch`, Q47465940)"),
    "f2---operation-olive-branch-date_start-2019-08-09-vs-the-articles-2018-operation-olive-branch-q47465940"
  );
  assert.equal(githubAnchor('F1 - "Israeli withdrawal"'), "f1---israeli-withdrawal");
});

test("dataFixAnchors: one anchor per Fn heading of the real fix log; other headings ignored", () => {
  const md = readFileSync(new URL("../../../docs/data-fixes.md", import.meta.url), "utf8");
  const anchors = dataFixAnchors(md);
  assert.deepEqual([...anchors.keys()], ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13", "F14", "F15"]);
  assert.equal(anchors.get("F11"), "f11---pins-that-were-another-items-location-owners-rule-an-event-is-pinned-only-at-its-own-location");
  assert.equal(dataFixAnchors("## Not verified\n### F3 - sub\n").size, 0);
});

test("dataFixUrl: the entry, or the log when the heading is unknown", () => {
  assert.equal(dataFixUrl({ ref: "F7", anchor: "f7---x" }), `${DATA_FIXES_DOC}#f7---x`);
  assert.equal(dataFixUrl({ ref: "F99", anchor: null }), DATA_FIXES_DOC);
});
