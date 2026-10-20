import test from "node:test";
import assert from "node:assert/strict";
import { queryMarks } from "./queryMarks.js";

const join = (segs) => segs.map((s) => s.pieces.map((p) => p.text).join("")).join("");

test("no query and no right-to-left text: one plain piece", () => {
  assert.deepEqual(queryMarks("Suez Crisis", ""), [
    { text: "Suez Crisis", mark: false, pieces: [{ text: "Suez Crisis", rtl: false, lang: null }] },
  ]);
});

test("query word prefixes are marked, mid-word matches are not", () => {
  const segs = queryMarks("Suez Crisis and the crisis-era canal", "cris");
  assert.deepEqual(
    segs.filter((s) => s.mark).map((s) => s.text),
    ["Cris", "cris"]
  );
  assert.equal(join(queryMarks("Escrisis", "cris")), "Escrisis");
  assert.equal(queryMarks("Escrisis", "cris").some((s) => s.mark), false);
});

test("right-to-left names are isolated, also inside a mark, and the text is unchanged", () => {
  const text = "Buraq Uprising (Arabic: ثورة البراق, Thawrat al-Burāq)";
  const segs = queryMarks(text, "buraq");
  assert.equal(join(segs), text);
  const rtl = segs.flatMap((s) => s.pieces.filter((p) => p.rtl));
  assert.deepEqual(rtl, [{ text: "ثورة البراق", rtl: true, lang: "ar" }]);

  const arabic = queryMarks(text, "ثورة");
  const marked = arabic.find((s) => s.mark);
  assert.deepEqual(marked.pieces, [{ text: "ثورة", rtl: true, lang: "ar" }]);
  assert.equal(join(arabic), text);
});

test("empty and missing text", () => {
  assert.equal(join(queryMarks("", "x")), "");
  assert.equal(join(queryMarks(null, "x")), "");
});
