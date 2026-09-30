import test from "node:test";
import assert from "node:assert/strict";
import { markSegments } from "./highlights.js";

const join = (segs) => segs.map((s) => s.text).join("");

test("marks every occurrence and leaves the text unchanged", () => {
  const p = "The Assad regime fell; the Assad regime had ruled since 1970.";
  const segs = markSegments(p, ["Assad regime"]);
  assert.equal(join(segs), p);
  assert.deepEqual(segs.filter((s) => s.flagged).map((s) => s.text), ["Assad regime", "Assad regime"]);
});

test("merges overlapping phrases into one mark", () => {
  const segs = markSegments("a great morale boost for the British Empire.", ["great morale boost", "morale boost for the British"]);
  assert.deepEqual(segs.filter((s) => s.flagged).map((s) => s.text), ["great morale boost for the British"]);
});

test("keeps which review types flagged each mark, merging overlaps", () => {
  const p = "Although massively outnumbered, the forces held. Indeed they did.";
  const segs = markSegments(p, [
    { text: "Although massively outnumbered", kind: "fairness" },
    { text: "massively outnumbered, the forces", kind: "wording" },
    { text: "Indeed", kind: "wording" },
  ]);
  assert.equal(join(segs), p);
  assert.deepEqual(
    segs.filter((s) => s.flagged).map((s) => [s.text, s.kinds.sort()]),
    [["Although massively outnumbered, the forces", ["fairness", "wording"]], ["Indeed", ["wording"]]]
  );
});

test("no phrases or no match gives the paragraph as one plain piece", () => {
  assert.deepEqual(markSegments("Plain text.", []), [{ text: "Plain text.", flagged: false }]);
  assert.deepEqual(markSegments("Plain text.", ["absent"]), [{ text: "Plain text.", flagged: false }]);
});
