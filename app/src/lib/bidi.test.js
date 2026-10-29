import test from "node:test";
import assert from "node:assert/strict";
import { rtlRuns, splitBidi } from "./bidi.js";

const join = (pieces) => pieces.map((p) => p.text).join("");
const rtlTexts = (text) => splitBidi(text, rtlRuns(text)).filter((p) => p.rtl);

// As in the 1929 Palestine riots extract.
const RIOTS =
  "the Buraq Uprising (Arabic: ثورة البراق, Thawrat al-Burāq) or the Events of 1929 " +
  '(Hebrew: מאורעות תרפ"ט, Meora\'ot Tarpat, lit. Events of 5689 Anno Mundi), were';

test("plain English has no runs and comes back whole", () => {
  assert.deepEqual(rtlRuns("The Suez Crisis of 1956."), []);
  assert.deepEqual(splitBidi("The Suez Crisis of 1956.", []), [{ text: "The Suez Crisis of 1956.", rtl: false, lang: null }]);
  assert.deepEqual(splitBidi("", []), [{ text: "", rtl: false, lang: null }]);
});

test("each name is one run, without the punctuation around it", () => {
  const runs = rtlTexts(RIOTS);
  assert.deepEqual(
    runs.map((p) => p.text),
    ["ثورة البراق", 'מאורעות תרפ"ט']
  );
});

test("the text is never changed", () => {
  assert.equal(join(splitBidi(RIOTS, rtlRuns(RIOTS))), RIOTS);
});

test("lang comes only from a bare Arabic/Hebrew/Persian label", () => {
  assert.deepEqual(
    rtlTexts(RIOTS).map((p) => p.lang),
    ["ar", "he"]
  );
  assert.equal(rtlTexts("Iran (Persian: ایران) is").at(0).lang, "fa");
  assert.equal(rtlTexts("Cairo (Egyptian Arabic: مصر) is").at(0).lang, null);
  assert.equal(rtlTexts("the Porte (Ottoman Turkish: باب عالی) was").at(0).lang, null);
  assert.equal(rtlTexts("known as حرب in").at(0).lang, null);
});

test("a run without a label takes the language of a labelled run before it in the same sentence", () => {
  // As in the Arab Revolt, Cedar Revolution and Iran nuclear deal extracts.
  const langs = (text) => rtlTexts(text).map((p) => p.lang);
  assert.deepEqual(
    langs("The Arab Revolt (Arabic: الثورة العربية al-Thawra al-'Arabiyya), also known as the Great Arab Revolt (الثورة العربية الكبرى al-Thawra), was"),
    ["ar", "ar"]
  );
  assert.deepEqual(
    langs("(Arabic: ثورة الأرز, romanized: thawrat al-arz), known in Lebanon as the Independence intifada (انتفاضة الاستقلال, intifada)"),
    ["ar", "ar"]
  );
  assert.deepEqual(langs("(JCPOA; Persian: برنامه جامع اقدام مشترک, romanized: barnāmeye (برجام, BARJAM))"), ["fa", "fa"]);
  // Not across a sentence end outside parentheses ("lit." inside them is no end).
  assert.deepEqual(langs("Badr (Arabic: عملية بدر). In the attack, known as the crossing (العبور al-'obour)"), ["ar", null]);
  assert.deepEqual(langs("(Hebrew: מאורעות, lit. Events) and (ירושלים)"), ["he", "he"]);
  // Not past another language label, even one that gives no lang itself.
  assert.deepEqual(langs("Mudros (Arabic: مودروس; Ottoman Turkish: موندروس متارکه‌نامه‌سی)"), ["ar", null]);
  assert.deepEqual(langs("(Arabic: الأزمة) and Cairo (Egyptian Arabic: مصر)"), ["ar", null]);
  // Not to a run of another script.
  assert.deepEqual(langs("Jerusalem (Arabic: القدس) or Yerushalayim (ירושלים)"), ["ar", null]);
  assert.deepEqual(langs("Jerusalem (Hebrew: ירושלים) or al-Quds (القدس)"), ["he", null]);
  // Never from script alone: no labelled run before, no lang.
  assert.deepEqual(langs("Yarden (יַרְדֵּן) and Shiri (שִׁירִי)"), [null, null]);
});

test("Arabic vowel marks stay inside the run", () => {
  const text = "(Arabic: مُحَمَّد) x";
  assert.deepEqual(rtlTexts(text).map((p) => p.text), ["مُحَمَّد"]);
});

test("a piece of a paragraph is split by the paragraph's runs", () => {
  const runs = rtlRuns(RIOTS);
  // A highlighted piece that starts in the middle of the Arabic name.
  const start = RIOTS.indexOf("البراق");
  const piece = RIOTS.slice(start, start + 20);
  const pieces = splitBidi(piece, runs, start);
  assert.equal(join(pieces), piece);
  assert.deepEqual(pieces[0], { text: "البراق", rtl: true, lang: "ar" });
  assert.equal(pieces[1].rtl, false);
});
