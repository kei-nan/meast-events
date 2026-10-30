import test from "node:test";
import assert from "node:assert/strict";
import { itemParts, linkLabel, noteSentences, sourceItems } from "./boundaryText.js";

test("noteSentences: splits at sentence ends and keeps every word", () => {
  const note = "Israel captured the West Bank on 7 June 1967. It was run by a military governorate. No part passed.";
  const s = noteSentences(note);
  assert.deepEqual(s, ["Israel captured the West Bank on 7 June 1967.", "It was run by a military governorate.", "No part passed."]);
  assert.equal(s.join(" "), note);
});

test("noteSentences: not after an abbreviation, a citation's 'para.' or an initial", () => {
  const note =
    'The ICJ found obligations "commensurate with its effective control over the Gaza Strip" (para. 94) and (paras. 78, 102). Schvitz et al. drew it. J. Smith agreed.';
  assert.deepEqual(noteSentences(note), [
    'The ICJ found obligations "commensurate with its effective control over the Gaza Strip" (para. 94) and (paras. 78, 102).',
    "Schvitz et al. drew it.",
    "J. Smith agreed.",
  ]);
});

test("noteSentences: a closing quote or bracket stays with its sentence; a number may start one", () => {
  assert.deepEqual(noteSentences('It was "null and void". 1,004 km2 of land (17.7%). Done.'), [
    'It was "null and void".',
    "1,004 km2 of land (17.7%).",
    "Done.",
  ]);
  assert.deepEqual(noteSentences("One sentence only."), ["One sentence only."]);
  assert.deepEqual(noteSentences(""), []);
  assert.deepEqual(noteSentences(null), []);
});

test("sourceItems: splits at ';' outside brackets only", () => {
  const src =
    "CShapes 2.0 (Schvitz et al., ETH Zurich, CC BY-NC-SA 4.0) geometry; https://en.wikipedia.org/wiki/Golan_Heights_Law; edge fitted to the Gaza Strip shape (Gaza's land border follows the Gaza Strip shape (Natural Earth); Egypt's lines are fitted to it.)";
  assert.deepEqual(sourceItems(src), [
    "CShapes 2.0 (Schvitz et al., ETH Zurich, CC BY-NC-SA 4.0) geometry",
    "https://en.wikipedia.org/wiki/Golan_Heights_Law",
    "edge fitted to the Gaza Strip shape (Gaza's land border follows the Gaza Strip shape (Natural Earth); Egypt's lines are fitted to it.)",
  ]);
  assert.deepEqual(sourceItems(""), []);
});

test("linkLabel: Wikipedia titles, UN document symbols, otherwise host and file", () => {
  assert.equal(linkLabel("https://en.wikipedia.org/wiki/Republic_of_Turkey_(1923%E2%80%93present)"), "Wikipedia: Republic of Turkey (1923–present)");
  assert.equal(linkLabel("https://documents.un.org/api/symbol/access?s=S/RES/252(1968)&l=en&t=pdf"), "UN document S/RES/252(1968)");
  assert.equal(linkLabel("https://treaties.un.org/doc/Publication/UNTS/volume%201638/english.pdf"), "treaties.un.org (english.pdf)");
  assert.equal(linkLabel("https://data.humdata.org/"), "data.humdata.org");
  assert.equal(linkLabel("not a url"), "not a url");
});

test("itemParts: links inside text, only http(s), trailing punctuation stays text", () => {
  assert.deepEqual(itemParts("geometry, renamed per https://en.wikipedia.org/wiki/Name_of_Iran."), [
    { text: "geometry, renamed per " },
    { href: "https://en.wikipedia.org/wiki/Name_of_Iran", label: "Wikipedia: Name of Iran" },
    { text: "." },
  ]);
  assert.deepEqual(itemParts("javascript:alert(1)"), [{ text: "javascript:alert(1)" }]);
});
